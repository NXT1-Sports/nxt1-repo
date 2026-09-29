/**
 * @fileoverview Agent Operation Cancellation Service
 * @module @nxt1/backend/modules/agent/services
 *
 * Centralizes the safe, race-free cancellation protocol for Agent X operations:
 *   1. Marks operation as 'cancelling' in Firestore FIRST (fencing out late completions).
 *   2. Aborts local in-process AbortController if present on this instance.
 *   3. Broadcasts Redis control message for cross-instance worker abortion.
 *   4. Removes/aborts BullMQ job in the queue.
 *   5. Clears any thread paused yield state.
 *   6. Emits cancellation lifecycle events to SSE / event subcollection.
 *   7. Acknowledges terminal 'cancelled' state if the job was queued or completed aborted.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { AgentOperationCancelReason } from '@nxt1/core';
import type { AgentJobRepository } from '../queue/job.repository.js';
import type { AgentQueueService } from '../queue/queue.service.js';
import type { AgentPubSubService } from '../queue/pubsub.service.js';
import type { AgentChatService } from './agent-chat.service.js';
import { logger } from '../../../utils/logger.js';

export interface CancelOperationParams {
  readonly operationId: string;
  readonly userId?: string;
  readonly reason?: AgentOperationCancelReason | string;
  readonly supersededByOperationId?: string;
  readonly message?: string;
  readonly activeAbortControllers?: Map<string, { controller: AbortController }>;
}

export interface CancelOperationResult {
  readonly success: boolean;
  readonly operationId: string;
  readonly wasActive: boolean;
  readonly queueCancelled: boolean;
  readonly controlBroadcast: boolean;
  readonly error?: string;
}

export class AgentOperationCancellationService {
  constructor(
    private readonly jobRepository: AgentJobRepository,
    private readonly queueService: AgentQueueService | null = null,
    private readonly pubsubService: AgentPubSubService | null = null,
    private readonly chatService: AgentChatService | null = null
  ) {}

  /**
   * Execute the cancellation workflow for an operation.
   */
  async cancelOperation(
    db: Firestore,
    params: CancelOperationParams
  ): Promise<CancelOperationResult> {
    const {
      operationId,
      userId,
      reason = 'user_cancelled',
      supersededByOperationId,
      message,
    } = params;
    const repo = this.jobRepository.withDb(db);

    const persistedJob = await repo.getById(operationId).catch((err) => {
      logger.warn('[Cancellation] Failed to fetch job for cancellation', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    });

    if (!persistedJob) {
      return {
        success: false,
        operationId,
        wasActive: false,
        queueCancelled: false,
        controlBroadcast: false,
        error: 'Operation not found',
      };
    }

    if (userId && persistedJob.userId !== userId) {
      logger.warn('[Cancellation] Forbidden cancel attempt: user mismatch', {
        operationId,
        requesterUserId: userId,
        ownerUserId: persistedJob.userId,
      });
      return {
        success: false,
        operationId,
        wasActive: false,
        queueCancelled: false,
        controlBroadcast: false,
        error: 'Unauthorized',
      };
    }

    // 1. Transactionally transition to 'cancelling' in Firestore FIRST.
    // This blocks late markCompleted / updateProgress calls from running workers.
    const { wasActive } = await repo.requestCancellation(operationId, {
      reason,
      supersededByOperationId,
    });

    // 2. Abort local controller if registered in-process.
    if (params.activeAbortControllers) {
      const entry = params.activeAbortControllers.get(operationId);
      if (entry) {
        entry.controller.abort();
        params.activeAbortControllers.delete(operationId);
      }
    }

    // 3. Broadcast cross-instance control signal via Redis.
    let controlBroadcast = false;
    if (this.pubsubService) {
      try {
        await this.pubsubService.publishControl({
          action: 'cancel',
          operationId,
          issuedAt: new Date().toISOString(),
          issuedBy: userId ?? persistedJob.userId,
        });
        controlBroadcast = true;
      } catch (err) {
        logger.warn('[Cancellation] Failed to broadcast cancel control message', {
          operationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 4. Cancel BullMQ job.
    let queueCancelled = false;
    if (this.queueService) {
      try {
        queueCancelled = await this.queueService.cancel(operationId);
      } catch (err) {
        logger.warn('[Cancellation] Queue cancellation failed (non-fatal)', {
          operationId,
          error: err instanceof Error ? err.message : String(err),
          controlBroadcast,
        });
      }
    }

    const threadId = persistedJob.threadId ?? undefined;

    // 5. Clear paused yield state from MongoDB thread.
    if (threadId && this.chatService) {
      try {
        await this.chatService.clearThreadPausedYieldState(threadId);
      } catch (err) {
        logger.warn('[Cancellation] Failed to clear thread paused yield state', {
          threadId,
          operationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 6. Write cancellation events to the events subcollection and SSE pubsub.
    const nowIso = new Date().toISOString();
    const cancellationOperationEvent = {
      userId: userId ?? persistedJob.userId,
      type: 'operation' as const,
      operationId,
      ...(threadId ? { threadId } : {}),
      status: 'cancelled' as const,
      timestamp: nowIso,
    };

    const cancellationDoneEvent = {
      userId: userId ?? persistedJob.userId,
      type: 'done' as const,
      operationId,
      ...(threadId ? { threadId } : {}),
      status: 'cancelled' as const,
      success: false,
      message:
        message ??
        (reason === 'superseded_by_edit'
          ? 'Superseded by edited prompt'
          : 'Operation cancelled by user'),
      timestamp: nowIso,
    };

    let cancellationOperationSeq = -1;
    let cancellationDoneSeq = -1;

    try {
      const startSeq = await repo.allocateEventSeqRange(operationId, 2);
      cancellationOperationSeq = startSeq;
      cancellationDoneSeq = startSeq + 1;

      await repo.writeJobEvent(operationId, {
        seq: cancellationOperationSeq,
        ...cancellationOperationEvent,
      });
      await repo.writeJobEvent(operationId, {
        seq: cancellationDoneSeq,
        ...cancellationDoneEvent,
      });
    } catch (err) {
      logger.warn('[Cancellation] Failed to persist cancellation lifecycle events', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (this.pubsubService) {
      void this.pubsubService
        .publish(operationId, 'operation', {
          ...cancellationOperationEvent,
          ...(cancellationOperationSeq >= 0 ? { seq: cancellationOperationSeq } : {}),
        })
        .catch(() => undefined);

      void this.pubsubService
        .publish(operationId, 'done', {
          ...cancellationDoneEvent,
          ...(cancellationDoneSeq >= 0 ? { seq: cancellationDoneSeq } : {}),
        })
        .catch(() => undefined);
    }

    // 7. If the job was never running or has already finished on BullMQ side,
    // ensure Firestore transitions from 'cancelling' to terminal 'cancelled'.
    if (!wasActive || queueCancelled) {
      await repo.acknowledgeCancellation(operationId, { message }).catch(() => undefined);
    }

    logger.info('[Cancellation] Agent X operation cancelled successfully', {
      operationId,
      userId: userId ?? persistedJob.userId,
      reason,
      supersededByOperationId,
      wasActive,
      queueCancelled,
      controlBroadcast,
    });

    return {
      success: true,
      operationId,
      wasActive,
      queueCancelled,
      controlBroadcast,
    };
  }
}
