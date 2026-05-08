/**
 * @fileoverview Enqueue Heavy Task Tool — Self-Orchestration Bridge
 * @module @nxt1/backend/modules/agent/tools/automation
 *
 * Allows Agent X to escalate long-running or resource-intensive operations
 * from the real-time SSE chat stream to the BullMQ background queue.
 *
 * When the LLM decides that fulfilling a user request requires heavy work
 * (e.g., generating a highlight reel, batch emailing 30 coaches, running
 * a full scout report), it can invoke this tool to queue the job and
 * immediately tell the user "I'm working on it in the background."
 *
 * This keeps the SSE chat responsive (< 30 s) while still leveraging
 * the full PlannerAgent → sub-agent pipeline for complex work.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import type { AgentQueueService } from '../../queue/queue.service.js';
import type { Firestore } from 'firebase-admin/firestore';
import { enqueueWithOutbox } from '../../queue/outbox.service.js';
import type { AgentJobPayload, AgentJobOrigin } from '@nxt1/core';
import { logger } from '../../../../utils/logger.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const EnqueueHeavyTaskInputSchema = z.object({
  intent: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
  parentOperationId: z.string().trim().min(1).optional(),
  parentThreadId: z.string().trim().min(1).optional(),
});

export class EnqueueHeavyTaskTool extends BaseTool {
  readonly name = 'enqueue_heavy_task';

  readonly description =
    'Queue a long-running or complex operation for background processing. ' +
    "Use this when the user's request requires heavy work that would take more than ~10 seconds: " +
    'generating highlight reels, batch emailing coaches, creating scout reports, ' +
    'image/video generation, or multi-step recruiting outreach. ' +
    'The chat should immediately ' +
    'acknowledge the task was queued and explain what will happen.';

  readonly parameters = EnqueueHeavyTaskInputSchema;

  readonly isMutation = true;
  readonly category = 'automation' as const;
  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = ['*'] as const;

  constructor(
    private readonly queueService: AgentQueueService,
    private readonly db: Firestore
  ) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = EnqueueHeavyTaskInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues
          .map((issue) =>
            issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message
          )
          .join(', '),
      };
    }

    const { intent } = parsed.data;
    const userId = parsed.data.userId || context?.userId;
    if (!userId) {
      return {
        success: false,
        error: 'userId is required',
      };
    }

    const inputContext = parsed.data.context ?? {};

    const inheritedParentOperationId =
      typeof inputContext['parentOperationId'] === 'string' &&
      inputContext['parentOperationId'].trim().length > 0
        ? String(inputContext['parentOperationId'])
        : undefined;
    const inheritedParentThreadId =
      typeof inputContext['parentThreadId'] === 'string' &&
      inputContext['parentThreadId'].trim().length > 0
        ? String(inputContext['parentThreadId'])
        : undefined;

    const parentOperationId =
      parsed.data.parentOperationId ?? inheritedParentOperationId ?? context?.operationId;
    const operationId = randomUUID();
    const threadId = parsed.data.parentThreadId ?? inheritedParentThreadId ?? context?.threadId;

    const mergedContext: Record<string, unknown> = {
      ...inputContext,
      ...(threadId ? { threadId } : {}),
      ...(parentOperationId ? { parentOperationId } : {}),
    };

    const payload: AgentJobPayload = {
      operationId,
      userId,
      intent: intent.trim(),
      sessionId:
        (typeof inputContext['sessionId'] === 'string' ? inputContext['sessionId'] : undefined) ??
        context?.sessionId ??
        randomUUID(),
      origin: 'user' as AgentJobOrigin,
      context: mergedContext,
    };

    try {
      // Respect the environment injected by the chat route (staging vs production).
      // Without this, staging chat jobs would get enqueued against the production Firestore
      // and fail with 5 NOT_FOUND when the worker looks up a staging userId.
      const env =
        (inputContext['environment'] as 'staging' | 'production') ??
        context?.environment ??
        'production';
      const { jobId } = await enqueueWithOutbox(this.db, payload, env, this.queueService);
      logger.info('Heavy task enqueued from chat', {
        operationId,
        parentOperationId,
        threadId,
        jobId,
        userId,
        intent: intent.slice(0, 100),
      });

      return {
        success: true,
        data: {
          status: 'queued',
          message: 'Background operation started.',
          heavyTaskOperationId: operationId,
          ...(parentOperationId ? { parentOperationId } : {}),
          ...(threadId ? { threadId } : {}),
        },
      };
    } catch (err) {
      logger.error('Failed to enqueue heavy task', {
        error: err instanceof Error ? err.message : String(err),
        userId,
        intent: intent.slice(0, 100),
      });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to queue background task',
      };
    }
  }
}
