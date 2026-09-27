/**
 * @fileoverview Agent Message Edit Service
 * @module @nxt1/backend/modules/agent/services
 *
 * Orchestrates the complete atomic workflow for editing a user prompt and resending:
 *   1. Evaluates server-authoritative edit eligibility (5-minute window, latest user turn, ownership).
 *   2. Recovers the original operation's replayPayload (preserving attachments, selected contexts, mode, effort, and scope).
 *   3. Supersedes and cancels any active previous operation via AgentOperationCancellationService.
 *   4. Atomically updates the user message revision and content in MongoDB.
 *   5. Soft-deletes all assistant/tool messages created by the superseded operation.
 *   6. Idempotently enqueues the replacement job through the Firestore outbox pattern.
 */

import crypto from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { AgentJobPayload, EditAndResendResult } from '@nxt1/core';
import type { AgentChatService } from './agent-chat.service.js';
import type { AgentJobRepository } from '../queue/job.repository.js';
import type { AgentQueueService } from '../queue/queue.service.js';
import { AgentOperationCancellationService } from './agent-operation-cancellation.service.js';
import { enqueueWithOutbox } from '../queue/outbox.service.js';
import { logger } from '../../../utils/logger.js';

export const EDIT_WINDOW_MS = 5 * 60 * 1000;

export interface EditAndResendInput {
  readonly messageId: string;
  readonly userId: string;
  readonly threadId: string;
  readonly message: string;
  readonly reason?: string;
  readonly expectedRevision?: number;
  readonly idempotencyKey?: string;
  readonly environment: 'staging' | 'production';
  readonly activeAbortControllers?: Map<string, { controller: AbortController }>;
}

export class AgentMessageEditService {
  private readonly cancellationService: AgentOperationCancellationService;

  constructor(
    private readonly chatService: AgentChatService,
    private readonly jobRepository: AgentJobRepository,
    private readonly queueService: AgentQueueService | null = null,
    cancellationService?: AgentOperationCancellationService
  ) {
    this.cancellationService =
      cancellationService ??
      new AgentOperationCancellationService(jobRepository, queueService, null, chatService);
  }

  /**
   * Execute atomic edit-and-resend command.
   */
  async editAndResend(db: Firestore, input: EditAndResendInput): Promise<EditAndResendResult> {
    const trimmed = input.message.trim();
    if (!trimmed) {
      return { success: false, error: 'Message content cannot be empty' };
    }

    // 1. Fetch current message and verify ownership
    const current = await this.chatService.getMessageById(input.messageId, input.userId);
    if (!current) {
      return { success: false, error: 'Message not found' };
    }

    if (current.threadId !== input.threadId) {
      return { success: false, error: 'Thread mismatch for message' };
    }

    if (current.role !== 'user') {
      return { success: false, error: 'Only user messages can be edited' };
    }

    if (current.deletedAt) {
      return { success: false, error: 'Deleted messages cannot be edited' };
    }

    // 2. Validate 5-minute edit window
    const createdAtMs = Date.parse(current.createdAt);
    if (!Number.isFinite(createdAtMs)) {
      return { success: false, error: 'Message has invalid timestamp' };
    }

    const elapsedMs = Date.now() - createdAtMs;
    if (elapsedMs > EDIT_WINDOW_MS) {
      return {
        success: false,
        error: 'Only messages from the last 5 minutes can be edited',
      };
    }

    // 3. Ensure it is the latest user turn in the thread
    const isLatest =
      typeof this.chatService.isLatestUserTurn === 'function'
        ? await this.chatService.isLatestUserTurn(input.threadId, input.messageId)
        : true;
    if (!isLatest) {
      return {
        success: false,
        error: 'Only the latest user prompt in a conversation can be edited',
      };
    }

    // 4. Concurrency check against expected revision
    const currentRevision = current.revision ?? 0;
    if (typeof input.expectedRevision === 'number' && input.expectedRevision !== currentRevision) {
      return {
        success: false,
        error: 'Message has already been modified. Please refresh and try again.',
      };
    }

    const repo = this.jobRepository.withDb(db);
    const originalOperationId = current.operationId ?? null;
    const originalJob = originalOperationId
      ? await repo.getById(originalOperationId).catch(() => null)
      : null;

    // 5. Generate replacement operation ID
    const replacementOperationId = crypto.randomUUID();

    // 6. Supersede original operation if one exists
    let superseded = false;
    if (originalOperationId) {
      try {
        const cancelResult = await this.cancellationService.cancelOperation(db, {
          operationId: originalOperationId,
          userId: input.userId,
          reason: 'superseded_by_edit',
          supersededByOperationId: replacementOperationId,
          message: 'Superseded by edited prompt',
          activeAbortControllers: input.activeAbortControllers,
        });
        superseded = cancelResult.success;
      } catch (cancelErr) {
        logger.warn('[MessageEdit] Cancellation of prior operation encountered an error', {
          originalOperationId,
          replacementOperationId,
          error: cancelErr instanceof Error ? cancelErr.message : String(cancelErr),
        });
      }
    }

    // 7. Update MongoDB user message atomically with incremented revision and new operation link
    const edited = await this.chatService.editUserMessage({
      messageId: input.messageId,
      userId: input.userId,
      threadId: input.threadId,
      newContent: trimmed,
      reason: input.reason ?? 'user_edit',
      agentRerunId: replacementOperationId,
      supersededOperationId: originalOperationId ?? undefined,
      replacementOperationId,
      expectedRevision: currentRevision,
    });

    if (!edited) {
      return {
        success: false,
        error: 'Failed to update message. Concurrent modification detected.',
      };
    }

    // 8. Soft-delete assistant and tool messages generated by superseded operation
    let deletedAssistantMessageIds: string[] = [];
    if (
      originalOperationId &&
      typeof this.chatService.softDeleteAssistantMessagesForOperation === 'function'
    ) {
      try {
        deletedAssistantMessageIds = await this.chatService.softDeleteAssistantMessagesForOperation(
          input.threadId,
          originalOperationId,
          input.userId
        );
      } catch (delErr) {
        logger.warn('[MessageEdit] Failed to soft-delete superseded assistant messages', {
          threadId: input.threadId,
          originalOperationId,
          error: delErr instanceof Error ? delErr.message : String(delErr),
        });
      }
    }

    // 9. Construct replacement payload, preserving original turn context and attachments
    const baseReplay = originalJob?.replayPayload;
    const baseContext = (baseReplay?.context ?? {}) as Record<string, unknown>;

    const replacementContext: Record<string, unknown> = {
      ...baseContext,
      threadId: input.threadId,
      editedMessageId: input.messageId,
      ...(originalOperationId ? { supersedesOperationId: originalOperationId } : {}),
      ...(input.reason ? { editReason: input.reason } : {}),
      idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    };

    const replacementPayload: AgentJobPayload = {
      operationId: replacementOperationId,
      userId: input.userId,
      intent: trimmed,
      displayIntent: trimmed,
      sessionId: crypto.randomUUID(),
      origin: 'user',
      ...(baseReplay?.agent ? { agent: baseReplay.agent } : {}),
      ...(baseReplay?.modelRouting ? { modelRouting: baseReplay.modelRouting } : {}),
      context: replacementContext,
    };

    // 10. Create the AgentJobs document synchronously so the frontend has a
    // persistent Firestore doc to bind to immediately (matches the pattern
    // used by every other brand-new-operation enqueue path in chat.routes.ts;
    // relying solely on the worker's lazy bootstrap would leave a window with
    // no document for the frontend's Firestore fallback subscription to read).
    try {
      await this.jobRepository.withDb(db).create(replacementPayload);
    } catch (createErr) {
      logger.error('[MessageEdit] Failed to create replacement AgentJobs document', {
        replacementOperationId,
        error: createErr instanceof Error ? createErr.message : String(createErr),
      });
      return {
        success: false,
        error: 'Message was saved, but failed to prepare replacement job. Please retry.',
      };
    }

    // 11. Enqueue replacement job via durable Firestore outbox
    let rerunEnqueued = false;
    if (this.queueService) {
      try {
        await enqueueWithOutbox(db, replacementPayload, input.environment, this.queueService);
        rerunEnqueued = true;
      } catch (enqueueErr) {
        logger.error('[MessageEdit] Failed to enqueue replacement job via outbox', {
          replacementOperationId,
          error: enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr),
        });
        return {
          success: false,
          error: 'Message was saved, but failed to enqueue replacement job. Please retry.',
        };
      }
    }

    logger.info('[MessageEdit] User message edited and replacement enqueued successfully', {
      messageId: input.messageId,
      userId: input.userId,
      threadId: input.threadId,
      originalOperationId,
      replacementOperationId,
      superseded,
      rerunEnqueued,
      revision: edited.revision,
    });

    return {
      success: true,
      data: {
        message: edited,
        operationId: replacementOperationId,
        supersededOperationId: originalOperationId ?? undefined,
        rerunEnqueued,
        handoffStatus: 'queued',
        deletedAssistantMessageIds,
      },
    };
  }
}
