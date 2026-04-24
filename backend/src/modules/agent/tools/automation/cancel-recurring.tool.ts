/**
 * @fileoverview Cancel Recurring Task Tool
 * @module @nxt1/backend/modules/agent/tools/automation
 *
 * Removes a recurring schedule by its repeatable key.
 * Validates that the schedule belongs to the requesting user before removal.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import type { AgentToolCategory } from '@nxt1/core';
import type { AgentQueueService } from '../../queue/queue.service.js';
import { logger } from '../../../../utils/logger.js';
import { z } from 'zod';

const RECURRING_TASKS_COLLECTION = 'RecurringTasks' as const;

const CancelRecurringTaskInputSchema = z.object({
  userId: z.string().trim().min(1),
  key: z.string().trim().min(1),
});

export class CancelRecurringTaskTool extends BaseTool {
  readonly name = 'cancel_recurring_task';
  readonly description =
    'Cancel (remove) an active recurring scheduled task by its key. ' +
    'Use list_recurring_tasks first to get the key of the task to cancel.';

  readonly parameters = CancelRecurringTaskInputSchema;

  readonly isMutation = true;
  readonly category: AgentToolCategory = 'automation';

  readonly entityGroup = 'platform_tools' as const;

  private readonly db: Firestore;
  private readonly queueService: AgentQueueService;

  constructor(queueService: AgentQueueService, db?: Firestore) {
    super();
    this.queueService = queueService;
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = CancelRecurringTaskInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const { userId, key } = parsed.data;

    try {
      context?.emitStage?.('deleting_resource', {
        icon: 'delete',
        recurringTaskKey: key,
      });

      // Verify ownership via Firestore before touching BullMQ.
      // This is the authoritative access check — the LLM cannot bypass it.
      const doc = await this.db.collection(RECURRING_TASKS_COLLECTION).doc(key).get();
      if (!doc.exists || doc.data()?.['userId'] !== userId) {
        return {
          success: false,
          error: 'No recurring task with that key was found for this user.',
        };
      }

      // Remove the BullMQ repeatable job.
      const removed = await this.queueService.removeRecurringJob(key);
      if (!removed) {
        // BullMQ entry is missing (may have been cleaned up by Redis flush or manual removal).
        // The Firestore record is still present — delete it for consistency.
        logger.warn('BullMQ repeatable not found; removing Firestore record only', {
          userId,
          key,
        });
      }

      // Delete the Firestore metadata document so count queries are consistent.
      await this.db.collection(RECURRING_TASKS_COLLECTION).doc(key).delete();

      logger.info('Recurring task cancelled', { userId, key });

      return {
        success: true,
        data: {
          key,
          message: 'Recurring task has been cancelled and will no longer execute.',
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel recurring task';
      logger.error('Failed to cancel recurring task', { userId, key, error: message });
      return { success: false, error: message };
    }
  }
}
