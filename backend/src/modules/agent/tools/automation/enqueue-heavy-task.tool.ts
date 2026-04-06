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

import { BaseTool, type ToolResult } from '../base.tool.js';
import type { AgentQueueService } from '../../queue/queue.service.js';
import type { AgentJobPayload, AgentJobOrigin } from '@nxt1/core';
import { logger } from '../../../../utils/logger.js';
import { randomUUID } from 'node:crypto';

export class EnqueueHeavyTaskTool extends BaseTool {
  readonly name = 'enqueue_heavy_task';

  readonly description =
    'Queue a long-running or complex operation for background processing. ' +
    "Use this when the user's request requires heavy work that would take more than ~10 seconds: " +
    'generating highlight reels, batch emailing coaches, creating scout reports, ' +
    'image/video generation, or multi-step recruiting outreach. ' +
    'Returns an operationId the user can track. The chat should immediately ' +
    'acknowledge the task was queued and explain what will happen.';

  readonly parameters = {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        description:
          'A clear, complete description of what the user wants done. ' +
          'This is forwarded verbatim to the PlannerAgent.',
      },
      userId: {
        type: 'string',
        description: 'The authenticated user ID (uid) requesting the operation.',
      },
      context: {
        type: 'object',
        description:
          'Optional additional context to pass to the background job ' +
          '(e.g., sport, position, target schools, threadId).',
        additionalProperties: true,
      },
    },
    required: ['intent', 'userId'],
    additionalProperties: false,
  };

  readonly isMutation = true;
  readonly category = 'automation' as const;
  override readonly allowedAgents = ['*'] as const;

  constructor(private readonly queueService: AgentQueueService) {
    super();
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const intent = input['intent'] as string | undefined;
    const userId = input['userId'] as string | undefined;
    const context = (input['context'] as Record<string, unknown>) ?? {};

    if (!intent || !userId) {
      return { success: false, error: 'Missing required fields: intent and userId' };
    }

    const operationId = randomUUID();

    const payload: AgentJobPayload = {
      operationId,
      userId,
      intent: intent.trim(),
      sessionId: (context['sessionId'] as string) ?? randomUUID(),
      origin: 'user' as AgentJobOrigin,
      context,
    };

    try {
      const jobId = await this.queueService.enqueue(payload);
      logger.info('Heavy task enqueued from chat', {
        operationId,
        jobId,
        userId,
        intent: intent.slice(0, 100),
      });

      return {
        success: true,
        data: {
          operationId,
          jobId,
          status: 'queued',
          message: `Background operation started. Operation ID: ${operationId}`,
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
