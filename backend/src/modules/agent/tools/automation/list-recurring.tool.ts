/**
 * @fileoverview List Recurring Tasks Tool
 * @module @nxt1/backend/modules/agent/tools/automation
 *
 * Returns all active recurring schedules for a given user.
 * No tier restriction — any user can view their (empty) schedule list.
 */

import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult } from '../base.tool.js';
import type { AgentToolCategory } from '@nxt1/core';
import type { AgentQueueService } from '../../queue/queue.service.js';
import type { RecurringJobInfo } from '../../queue/queue.types.js';
import { z } from 'zod';

const RECURRING_TASKS_COLLECTION = 'RecurringTasks' as const;

const ListRecurringTasksInputSchema = z.object({
  userId: z.string().trim().min(1),
});

export class ListRecurringTasksTool extends BaseTool {
  readonly name = 'list_recurring_tasks';
  readonly description =
    'List all active recurring scheduled tasks for a user. ' +
    "Returns each task's key, action summary, cron expression, timezone, and next execution time.";

  readonly parameters = ListRecurringTasksInputSchema;

  readonly isMutation = false;
  readonly category: AgentToolCategory = 'automation';

  readonly entityGroup = 'platform_tools' as const;

  private readonly db: Firestore;
  private readonly queueService: AgentQueueService;

  constructor(queueService: AgentQueueService, db?: Firestore) {
    super();
    this.queueService = queueService;
    this.db = db ?? getFirestore();
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const parsed = ListRecurringTasksInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const { userId } = parsed.data;

    try {
      // Firestore is the source of truth for task ownership and metadata.
      const snap = await this.db
        .collection(RECURRING_TASKS_COLLECTION)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();

      if (snap.empty) {
        return {
          success: true,
          data: {
            tasks: [],
            message: 'No recurring tasks are currently scheduled for this user.',
          },
        };
      }

      // Cross-reference with BullMQ to surface live nextRun timestamps.
      const repeatables = await this.queueService.getAllRepeatableJobs();
      const repeatableMap = new Map(
        repeatables.map((r) => [
          r.key,
          {
            nextRun: r.next,
            timezone: r.tz,
          },
        ])
      );

      const tasks: RecurringJobInfo[] = snap.docs.map((doc) => {
        const data = doc.data();
        const repeatable = repeatableMap.get(doc.id);
        const persistedTimezone = data['timezone'];
        const resolvedTimezone =
          typeof persistedTimezone === 'string' && persistedTimezone.length > 0
            ? persistedTimezone
            : (repeatable?.timezone ?? 'UTC');
        return {
          key: doc.id,
          actionSummary: data['actionSummary'] as string,
          cronExpression: data['cronExpression'] as string,
          timezone: resolvedTimezone,
          ...(typeof data['sourceId'] === 'string' && data['sourceId'].length > 0
            ? { sourceId: data['sourceId'] as string }
            : {}),
          nextRun:
            typeof repeatable?.nextRun === 'number'
              ? new Date(repeatable.nextRun).toISOString()
              : null,
          createdAt: (data['createdAt'] as Timestamp).toDate().toISOString(),
        };
      });

      return {
        success: true,
        data: {
          tasks,
          count: tasks.length,
          message: `Found ${tasks.length} active recurring task(s).`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list recurring tasks';
      return { success: false, error: message };
    }
  }
}
