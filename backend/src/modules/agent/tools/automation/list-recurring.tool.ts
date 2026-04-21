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

const RECURRING_TASKS_COLLECTION = 'RecurringTasks' as const;

export class ListRecurringTasksTool extends BaseTool {
  readonly name = 'list_recurring_tasks';
  readonly description =
    'List all active recurring scheduled tasks for a user. ' +
    "Returns each task's key, action summary, cron expression, and next execution time.";

  readonly parameters = {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'The ID of the user whose recurring tasks to list.',
      },
    },
    required: ['userId'],
  };

  readonly isMutation = false;
  readonly category: AgentToolCategory = 'automation';

  private readonly db: Firestore;
  private readonly queueService: AgentQueueService;

  constructor(queueService: AgentQueueService, db?: Firestore) {
    super();
    this.queueService = queueService;
    this.db = db ?? getFirestore();
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const userId = this.str(input, 'userId');
    if (!userId) return this.paramError('userId');

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
      const nextRunMap = new Map(repeatables.map((r) => [r.key, r.next]));

      const tasks: RecurringJobInfo[] = snap.docs.map((doc) => {
        const data = doc.data();
        const next = nextRunMap.get(doc.id);
        return {
          key: doc.id,
          actionSummary: data['actionSummary'] as string,
          cronExpression: data['cronExpression'] as string,
          nextRun: next ? new Date(next).toISOString() : null,
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
