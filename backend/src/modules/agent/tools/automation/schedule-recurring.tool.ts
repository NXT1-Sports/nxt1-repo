/**
 * @fileoverview Schedule Recurring Task Tool
 * @module @nxt1/backend/modules/agent/tools/automation
 *
 * Allows Agent X to create a recurring (cron-based) background task
 * that re-runs the specified action on a schedule.
 *
 * All users have access — usage is metered via the billing system.
 *
 * Security:
 * - Enforces minimum interval of 1 hour to prevent runaway costs.
 * - Enforces per-user cap of 10 active schedules.
 */

import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import type { AgentToolCategory, AgentJobPayload } from '@nxt1/core';
import type { AgentQueueService } from '../../queue/queue.service.js';
import { MIN_RECURRING_INTERVAL_MS, MAX_RECURRING_JOBS_PER_USER } from '../../queue/queue.types.js';
import { logger } from '../../../../utils/logger.js';
import { z } from 'zod';

// ─── Helpers ────────────────────────────────────────────────────────────────

const RECURRING_TASKS_COLLECTION = 'RecurringTasks' as const;

function isValidIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const ScheduleRecurringTaskInputSchema = z.object({
  actionSummary: z.string().trim().min(1),
  cronExpression: z.string().trim().min(1),
  timezone: z
    .string()
    .trim()
    .min(1)
    .refine((value) => isValidIanaTimezone(value), {
      message: 'timezone must be a valid IANA timezone (for example, America/Chicago)',
    }),
  sourceId: z.string().trim().min(1).optional(),
});

/**
 * Parse a cron expression and estimate the minimum interval in ms
 * between two consecutive firings. Returns Infinity if unparseable.
 * Only handles standard 5-field cron (`m h dom mon dow`).
 */
function estimateCronIntervalMs(cron: string): number {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return Infinity;

  const [minute, hour] = parts;

  // Every-N-minutes shorthand: */N * * * *
  const everyMin = minute?.match(/^\*\/(\d+)$/);
  if (everyMin) return parseInt(everyMin[1], 10) * 60 * 1000;

  // Every-N-hours shorthand: 0 */N * * *
  const everyHour = hour?.match(/^\*\/(\d+)$/);
  if (everyHour && (minute === '0' || minute === '*')) {
    return parseInt(everyHour[1], 10) * 60 * 60 * 1000;
  }

  // Wildcard minute = every minute
  if (minute === '*' && hour === '*') return 60 * 1000;

  // Fixed hour = at most once per day
  if (hour !== '*' && !hour?.includes('/') && !hour?.includes(',')) {
    return 24 * 60 * 60 * 1000;
  }

  // Default: assume at least hourly
  return 60 * 60 * 1000;
}

// ─── Tool ───────────────────────────────────────────────────────────────────

export class ScheduleRecurringTaskTool extends BaseTool {
  readonly name = 'schedule_recurring_task';
  readonly description =
    'Create a recurring scheduled task that Agent X will automatically execute on a cron schedule. ' +
    'Provide a human-readable action summary (what to do each time), a standard cron expression, ' +
    'and an IANA timezone (for example America/Chicago). ' +
    'Optionally include sourceId to override the originating thread ID used for recurring context hydration. ' +
    'The minimum allowed interval is 1 hour.';

  readonly parameters = ScheduleRecurringTaskInputSchema;

  readonly isMutation = true;
  readonly category: AgentToolCategory = 'system';

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
    const parsed = ScheduleRecurringTaskInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    if (!context?.userId) {
      return {
        success: false,
        error: 'Execution context missing required userId.',
      };
    }
    const userId = context.userId;

    const { actionSummary, cronExpression, timezone, sourceId } = parsed.data;
    const resolvedSourceId = sourceId?.trim() || context?.threadId?.trim() || undefined;

    // ── 1. Validate cron frequency ────────────────────────────────────
    const intervalMs = estimateCronIntervalMs(cronExpression);
    if (intervalMs < MIN_RECURRING_INTERVAL_MS) {
      return {
        success: false,
        error:
          `The cron expression "${cronExpression}" would execute more frequently than once per hour. ` +
          'The minimum interval for recurring tasks is 1 hour. Please use a less frequent schedule.',
      };
    }

    // ── 2. Enforce per-user schedule cap (Firestore is source of truth) ──
    const existingCount = await this.countUserTasks(userId);
    if (existingCount >= MAX_RECURRING_JOBS_PER_USER) {
      return {
        success: false,
        error:
          `Maximum of ${MAX_RECURRING_JOBS_PER_USER} recurring schedules per user reached. ` +
          'Cancel an existing schedule before adding a new one.',
      };
    }

    // ── 3. Build the recurring job payload ───────────────────────────
    const ts = Date.now();
    const jobName = `recv:${userId}:${ts}`;
    const operationId = `recurring-${userId}-${ts}`;
    const payload: AgentJobPayload = {
      operationId,
      userId,
      intent: actionSummary,
      sessionId: `scheduled-${userId}`,
      origin: 'system_cron',
      ...(resolvedSourceId
        ? {
            context: {
              sourceId: resolvedSourceId,
              threadId: resolvedSourceId,
            },
          }
        : {}),
    };

    // ── 4. Enqueue via BullMQ then persist durable metadata ──────────
    try {
      const key = await this.queueService.enqueueRecurring(
        jobName,
        cronExpression,
        timezone,
        payload,
        'production'
      );

      // Firestore is the durable source of truth for recurring task metadata.
      // Redis is ephemeral — it must NEVER be used for persistent business data.
      await this.db
        .collection(RECURRING_TASKS_COLLECTION)
        .doc(key)
        .set({
          userId,
          actionSummary,
          cronExpression,
          timezone,
          ...(resolvedSourceId ? { sourceId: resolvedSourceId } : {}),
          jobName,
          createdAt: FieldValue.serverTimestamp(),
          environment: 'production',
        });

      logger.info('Recurring task scheduled', {
        userId,
        key,
        cronExpression,
        timezone,
        ...(resolvedSourceId ? { sourceId: resolvedSourceId } : {}),
        actionSummary,
      });

      return {
        success: true,
        data: {
          key,
          actionSummary,
          cronExpression,
          timezone,
          ...(resolvedSourceId ? { sourceId: resolvedSourceId } : {}),
          message:
            `Recurring task scheduled successfully. Action "${actionSummary}" will run on schedule: ` +
            `${cronExpression} (${timezone}).`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to schedule recurring task';
      logger.error('Failed to schedule recurring task', {
        userId,
        cronExpression,
        timezone,
        ...(resolvedSourceId ? { sourceId: resolvedSourceId } : {}),
        error: message,
      });
      return { success: false, error: message };
    }
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private async countUserTasks(userId: string): Promise<number> {
    const snap = await this.db
      .collection(RECURRING_TASKS_COLLECTION)
      .where('userId', '==', userId)
      .count()
      .get();
    return snap.data().count;
  }
}
