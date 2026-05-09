/**
 * @fileoverview Update Recurring Task Tool
 * @module @nxt1/backend/modules/agent/tools/automation
 *
 * Replaces an existing recurring schedule by key.
 * This avoids duplicate schedules when a user asks to "update" a recurring task.
 */

import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import type { AgentToolCategory, AgentJobPayload } from '@nxt1/core';
import type { AgentQueueService } from '../../queue/queue.service.js';
import { MIN_RECURRING_INTERVAL_MS } from '../../queue/queue.types.js';
import { logger } from '../../../../utils/logger.js';
import { z } from 'zod';

const RECURRING_TASKS_COLLECTION = 'RecurringTasks' as const;

const CANCEL_INTENT_RE =
  /\b(cancel|stop|disable|turn\s+off|delete|remove|end)\b[\s\S]*\b(recurring|schedule|automation|task)\b/i;

function isValidIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function estimateCronIntervalMs(cron: string): number {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return Infinity;

  const [minute, hour] = parts;
  const everyMin = minute?.match(/^\*\/(\d+)$/);
  if (everyMin) return parseInt(everyMin[1], 10) * 60 * 1000;

  const everyHour = hour?.match(/^\*\/(\d+)$/);
  if (everyHour && (minute === '0' || minute === '*')) {
    return parseInt(everyHour[1], 10) * 60 * 60 * 1000;
  }

  if (minute === '*' && hour === '*') return 60 * 1000;
  if (hour !== '*' && !hour?.includes('/') && !hour?.includes(',')) return 24 * 60 * 60 * 1000;

  return 60 * 60 * 1000;
}

const UpdateRecurringTaskInputSchema = z.object({
  userId: z.string().trim().min(1),
  key: z.string().trim().min(1),
  actionSummary: z.string().trim().min(1).optional(),
  cronExpression: z.string().trim().min(1).optional(),
  timezone: z
    .string()
    .trim()
    .min(1)
    .refine((value) => isValidIanaTimezone(value), {
      message: 'timezone must be a valid IANA timezone (for example, America/Chicago)',
    })
    .optional(),
  sourceId: z.string().trim().min(1).optional(),
});

export class UpdateRecurringTaskTool extends BaseTool {
  readonly name = 'update_recurring_task';
  readonly description =
    'Update an existing recurring scheduled task by key. ' +
    'Provide the key and any fields to change (actionSummary, cronExpression, timezone, sourceId). ' +
    'The tool replaces the old schedule to prevent duplicate recurring tasks.';

  readonly parameters = UpdateRecurringTaskInputSchema;

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
    const parsed = UpdateRecurringTaskInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const { userId, key, actionSummary, cronExpression, timezone, sourceId } = parsed.data;

    try {
      const existingDoc = await this.db.collection(RECURRING_TASKS_COLLECTION).doc(key).get();
      if (!existingDoc.exists || existingDoc.data()?.['userId'] !== userId) {
        return {
          success: false,
          error: 'No recurring task with that key was found for this user.',
        };
      }

      const existing = existingDoc.data() ?? {};

      // If the caller intent is to stop/cancel the recurring automation, execute
      // a true cancel flow instead of trying to fake-disable via invalid cron.
      if (typeof actionSummary === 'string' && CANCEL_INTENT_RE.test(actionSummary)) {
        const removed = await this.queueService.removeRecurringJob(key).catch(() => false);
        if (!removed) {
          logger.warn('Recurring BullMQ key not found during update-cancel flow', {
            userId,
            key,
          });
        }
        await this.db
          .collection(RECURRING_TASKS_COLLECTION)
          .doc(key)
          .delete()
          .catch(() => undefined);

        return {
          success: true,
          data: {
            key,
            cancelled: true,
            message: 'Recurring task cancelled successfully and will no longer execute.',
          },
        };
      }

      const nextActionSummary =
        actionSummary ??
        (typeof existing['actionSummary'] === 'string'
          ? (existing['actionSummary'] as string)
          : '');
      const nextCronExpression =
        cronExpression ??
        (typeof existing['cronExpression'] === 'string'
          ? (existing['cronExpression'] as string)
          : '');
      const nextTimezone =
        timezone ??
        (typeof existing['timezone'] === 'string' ? (existing['timezone'] as string) : 'UTC');
      const nextSourceId =
        sourceId?.trim() ||
        (typeof existing['sourceId'] === 'string' && existing['sourceId'].trim().length > 0
          ? (existing['sourceId'] as string)
          : context?.threadId?.trim() || undefined);

      if (!nextActionSummary || !nextCronExpression || !nextTimezone) {
        return {
          success: false,
          error: 'Unable to resolve full recurring task data to perform update.',
        };
      }

      const intervalMs = estimateCronIntervalMs(nextCronExpression);
      if (intervalMs < MIN_RECURRING_INTERVAL_MS) {
        return {
          success: false,
          error:
            `The cron expression "${nextCronExpression}" would execute more frequently than once per hour. ` +
            'The minimum interval for recurring tasks is 1 hour. Please use a less frequent schedule.',
        };
      }

      const ts = Date.now();
      const jobName = `recv:${userId}:${ts}`;
      const operationId = `recurring-${userId}-${ts}`;
      const payload: AgentJobPayload = {
        operationId,
        userId,
        intent: nextActionSummary,
        displayIntent: nextActionSummary,
        sessionId: `scheduled-${userId}`,
        origin: 'system_cron',
        ...(nextSourceId
          ? {
              context: {
                sourceId: nextSourceId,
                threadId: nextSourceId,
              },
            }
          : {}),
      };

      const replacementKey = await this.queueService.enqueueRecurring(
        jobName,
        nextCronExpression,
        nextTimezone,
        payload,
        'production'
      );

      await this.db
        .collection(RECURRING_TASKS_COLLECTION)
        .doc(replacementKey)
        .set({
          userId,
          actionSummary: nextActionSummary,
          cronExpression: nextCronExpression,
          timezone: nextTimezone,
          ...(nextSourceId ? { sourceId: nextSourceId } : {}),
          jobName,
          createdAt: FieldValue.serverTimestamp(),
          environment: 'production',
          replacedFromKey: key,
        });

      // Remove the old schedule now that replacement is live.
      const removedOld = await this.queueService.removeRecurringJob(key).catch(() => false);
      if (!removedOld) {
        logger.warn('Old recurring BullMQ key not found during update; continuing', {
          userId,
          oldKey: key,
          replacementKey,
        });
      }
      await this.db
        .collection(RECURRING_TASKS_COLLECTION)
        .doc(key)
        .delete()
        .catch(() => undefined);

      logger.info('Recurring task updated by replacement', {
        userId,
        oldKey: key,
        replacementKey,
        cronExpression: nextCronExpression,
        timezone: nextTimezone,
      });

      return {
        success: true,
        data: {
          previousKey: key,
          key: replacementKey,
          actionSummary: nextActionSummary,
          cronExpression: nextCronExpression,
          timezone: nextTimezone,
          ...(nextSourceId ? { sourceId: nextSourceId } : {}),
          message:
            `Recurring task updated successfully. New key: ${replacementKey}. ` +
            `Action "${nextActionSummary}" will run on schedule ${nextCronExpression} (${nextTimezone}).`,
        },
      };
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : 'Failed to update recurring task';
      const message = /day of month definition|cron/i.test(rawMessage)
        ? 'Invalid cron expression for recurring task update. Use a valid 5-field cron (for example: 0 */2 * * *) or use cancel_recurring_task to stop the schedule.'
        : rawMessage;
      logger.error('Failed to update recurring task', {
        userId,
        key,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
