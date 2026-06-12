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
 * - Enforces per-user cap of 10 active schedules.
 */

import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import type { AgentToolCategory, AgentJobPayload } from '@nxt1/core';
import type { AgentQueueService } from '../../queue/queue.service.js';
import { MAX_RECURRING_JOBS_PER_USER } from '../../queue/queue.types.js';
import { logger } from '../../../../utils/logger.js';
import { z } from 'zod';

// ─── Helpers ────────────────────────────────────────────────────────────────

const RECURRING_TASKS_COLLECTION = 'RecurringTasks' as const;

function normalizeComparableString(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

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
  firstRunAt: z.string().trim().min(1).optional(),
});

function parseFutureFirstRunAt(
  firstRunAt: string | undefined
): { iso: string; delayMs: number; repeatStartDate: string } | { error: string } | null {
  if (!firstRunAt) return null;
  const parsedMs = Date.parse(firstRunAt);
  if (!Number.isFinite(parsedMs)) {
    return { error: 'firstRunAt must be a valid ISO-8601 timestamp.' };
  }

  const now = Date.now();
  if (parsedMs <= now) {
    return { error: 'firstRunAt must be in the future.' };
  }

  return {
    iso: new Date(parsedMs).toISOString(),
    delayMs: parsedMs - now,
    // Start the steady-state cron after the delayed initial run so BullMQ does
    // not enqueue a duplicate execution at the same minute.
    repeatStartDate: new Date(parsedMs + 60_000).toISOString(),
  };
}

// ─── Tool ───────────────────────────────────────────────────────────────────

export class ScheduleRecurringTaskTool extends BaseTool {
  readonly name = 'schedule_recurring_task';
  readonly description =
    'Create a recurring scheduled task that Agent X will automatically execute on a cron schedule. ' +
    'Provide a human-readable action summary (what to do each time), a standard cron expression, ' +
    'and an IANA timezone (for example America/Chicago). ' +
    'Optionally include sourceId to override the originating thread ID used for recurring context hydration. ' +
    'Optionally include firstRunAt as an ISO-8601 timestamp when the first send should happen later today or at a specific future time before the recurring cadence continues. ' +
    'This tool is for recurring automations only, not one-time delayed runs later today or tomorrow. ' +
    'Do not use date-pinned cron expressions to imitate a one-off schedule. ' +
    'For recurring requests with a relative offset such as "in 1 hour each week", build the cron for the offset time (one hour from now in the user timezone), not the current clock time. ' +
    'After creating the schedule, call list_recurring_tasks and verify the nextRun matches the requested first occurrence before confirming success to the user. ' +
    'Each run executes inside the originating thread and posts its full reply there (identical to a normal chat response), AND sends a push notification as a supplementary alert. ' +
    'When confirming the schedule to the user, always state that results will appear in this thread each time the task runs.';

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
    const targetEnvironment = context.environment === 'production' ? 'production' : 'staging';

    const { actionSummary, cronExpression, timezone, sourceId, firstRunAt } = parsed.data;
    const resolvedSourceId = sourceId?.trim() || context?.threadId?.trim() || undefined;
    const parsedFirstRun = parseFutureFirstRunAt(firstRunAt);
    if (parsedFirstRun && 'error' in parsedFirstRun) {
      return { success: false, error: parsedFirstRun.error };
    }

    const existingTask = await this.findExactExistingTask({
      userId,
      actionSummary,
      cronExpression,
      timezone,
      sourceId: resolvedSourceId,
      firstRunAt: parsedFirstRun?.iso,
    });
    if (existingTask) {
      logger.info('Recurring task already exists; reusing existing schedule', {
        userId,
        key: existingTask.key,
        cronExpression,
        timezone,
        ...(resolvedSourceId ? { sourceId: resolvedSourceId } : {}),
      });

      return {
        success: true,
        data: {
          key: existingTask.key,
          actionSummary,
          cronExpression,
          timezone,
          ...(resolvedSourceId ? { sourceId: resolvedSourceId } : {}),
          duplicate: true,
          message:
            `Recurring task already scheduled. Reusing existing schedule for ` +
            `"${actionSummary}" on ${cronExpression} (${timezone}).`,
        },
      };
    }

    // ── 1. Enforce per-user schedule cap (Firestore is source of truth) ──
    const existingCount = await this.countUserTasks(userId);
    if (existingCount >= MAX_RECURRING_JOBS_PER_USER) {
      return {
        success: false,
        error:
          `Maximum of ${MAX_RECURRING_JOBS_PER_USER} recurring schedules per user reached. ` +
          'Cancel an existing schedule before adding a new one.',
      };
    }

    // ── 2. Build the recurring job payload ───────────────────────────
    const ts = Date.now();
    const jobName = `recv:${userId}:${ts}`;
    const operationId = `recurring-${userId}-${ts}`;
    const payload: AgentJobPayload = {
      operationId,
      userId,
      intent: actionSummary,
      displayIntent: actionSummary,
      sessionId: `scheduled-${userId}`,
      origin: 'system_cron',
      ...(resolvedSourceId
        ? {
            context: {
              sourceId: resolvedSourceId,
              threadId: resolvedSourceId,
              timezone,
            },
          }
        : { context: { timezone } }),
    };

    // ── 3. Enqueue via BullMQ then persist durable metadata ──────────
    try {
      const key = await this.queueService.enqueueRecurring(
        jobName,
        cronExpression,
        timezone,
        payload,
        parsedFirstRun ? { startDate: parsedFirstRun.repeatStartDate } : undefined,
        targetEnvironment
      );

      let initialRunJobId: string | undefined;
      if (parsedFirstRun) {
        const initialOperationId = `recurring-initial-${userId}-${ts}`;
        const initialPayload: AgentJobPayload = {
          operationId: initialOperationId,
          userId,
          intent: actionSummary,
          displayIntent: actionSummary,
          sessionId: `scheduled-${userId}`,
          origin: 'system_cron',
          ...(resolvedSourceId
            ? {
                context: {
                  sourceId: resolvedSourceId,
                  threadId: resolvedSourceId,
                  timezone,
                  recurringTaskKey: key,
                  recurringInitialRun: true,
                },
              }
            : {
                context: {
                  timezone,
                  recurringTaskKey: key,
                  recurringInitialRun: true,
                },
              }),
        };

        try {
          initialRunJobId = await this.queueService.enqueueDelayed(
            initialPayload,
            parsedFirstRun.delayMs,
            targetEnvironment
          );
        } catch (initialErr) {
          await this.queueService.removeRecurringJob(key).catch(() => false);
          throw initialErr;
        }
      }

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
          ...(parsedFirstRun ? { firstRunAt: parsedFirstRun.iso } : {}),
          ...(initialRunJobId ? { initialRunJobId } : {}),
          jobName,
          createdAt: FieldValue.serverTimestamp(),
          environment: targetEnvironment,
        });

      logger.info('Recurring task scheduled', {
        userId,
        key,
        cronExpression,
        timezone,
        ...(resolvedSourceId ? { sourceId: resolvedSourceId } : {}),
        ...(parsedFirstRun ? { firstRunAt: parsedFirstRun.iso, initialRunJobId } : {}),
        actionSummary,
        environment: targetEnvironment,
      });

      return {
        success: true,
        data: {
          key,
          actionSummary,
          cronExpression,
          timezone,
          ...(resolvedSourceId ? { sourceId: resolvedSourceId } : {}),
          ...(parsedFirstRun
            ? { firstRunAt: parsedFirstRun.iso, nextRun: parsedFirstRun.iso }
            : {}),
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

  private async findExactExistingTask(params: {
    userId: string;
    actionSummary: string;
    cronExpression: string;
    timezone: string;
    sourceId?: string;
    firstRunAt?: string;
  }): Promise<{ key: string } | null> {
    const query = this.db
      .collection(RECURRING_TASKS_COLLECTION)
      .where('userId', '==', params.userId) as {
      get?: () => Promise<{
        empty?: boolean;
        docs?: ReadonlyArray<{
          id: string;
          data(): Record<string, unknown>;
        }>;
      }>;
    };

    if (typeof query.get !== 'function') {
      return null;
    }

    const snapshot = await query.get();
    const docs = snapshot.docs ?? [];
    const requestedSourceId = params.sourceId?.trim() || null;
    const requestedFirstRunAt = params.firstRunAt?.trim() || null;

    for (const doc of docs) {
      const data = doc.data();
      const existingSourceId =
        typeof data['sourceId'] === 'string' && data['sourceId'].trim().length > 0
          ? data['sourceId'].trim()
          : null;
      const existingFirstRunAt =
        typeof data['firstRunAt'] === 'string' && data['firstRunAt'].trim().length > 0
          ? new Date(Date.parse(data['firstRunAt'].trim())).toISOString()
          : null;

      if (
        normalizeComparableString(data['actionSummary'] as string | undefined) !==
        normalizeComparableString(params.actionSummary)
      ) {
        continue;
      }
      if ((data['cronExpression'] as string | undefined)?.trim() !== params.cronExpression) {
        continue;
      }
      if ((data['timezone'] as string | undefined)?.trim() !== params.timezone) {
        continue;
      }
      if (existingSourceId !== requestedSourceId) {
        continue;
      }
      if (existingFirstRunAt !== requestedFirstRunAt) {
        continue;
      }

      return { key: doc.id };
    }

    return null;
  }
}
