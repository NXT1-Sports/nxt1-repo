import type { AgentExecutionPlan, AgentJobUpdate, AgentOperationResult } from '@nxt1/core';
import type { OnStreamEvent } from '../queue/event-writer.js';
import type { SemanticCacheService } from '../memory/semantic-cache.service.js';
import type { AgentExecutionMutableTask } from './agent-router-execution.service.js';
import type { AgentRouterContextService } from './agent-router-context.service.js';
import type { AgentRouterTelemetryService } from './agent-router-telemetry.service.js';
import { logger } from '../../../utils/logger.js';

type ContextDeps = Pick<AgentRouterContextService, 'appendAssistantMessage'>;
type TelemetryDeps = Pick<
  AgentRouterTelemetryService,
  'emitProgressOperation' | 'emitUpdate' | 'recordPhaseLatency'
>;

export class AgentRouterFinalizationService {
  constructor(
    private readonly semanticCache: SemanticCacheService,
    private readonly context: ContextDeps,
    private readonly telemetry: TelemetryDeps
  ) {}

  finalize(payload: {
    readonly operationId: string;
    readonly userId: string;
    readonly threadId?: string;
    readonly plan: AgentExecutionPlan;
    readonly taskResults: Map<string, AgentOperationResult>;
    readonly mutableTasks: readonly AgentExecutionMutableTask[];
    readonly scopedIntent: string;
    readonly onUpdate?: (update: AgentJobUpdate) => void;
    readonly onStreamEvent?: OnStreamEvent;
  }): AgentOperationResult {
    const {
      operationId,
      userId,
      threadId,
      plan,
      taskResults,
      mutableTasks,
      scopedIntent,
      onUpdate,
      onStreamEvent,
    } = payload;

    const aggregationPhaseStartMs = Date.now();
    this.telemetry.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'agent_thinking',
      message: 'Pulling everything together...',
      metadata: { eventType: 'progress_stage', phase: 'aggregation', phaseIndex: 4, phaseTotal: 5 },
    });
    const summaries = [...taskResults.values()].map((result) => result.summary);
    const allSuggestions = [...taskResults.values()].flatMap((result) => result.suggestions ?? []);
    const failedTasks = mutableTasks.filter(
      (task): task is AgentExecutionMutableTask => task.status === 'failed'
    );

    if (failedTasks.length > 0) {
      const firstFailedTask = failedTasks[0];
      const firstFailureMessage = firstFailedTask._lastError ?? 'Unknown error';
      const failureHeadline =
        `Execution plan failed. Task ${firstFailedTask.id} ` +
        `(${firstFailedTask.assignedAgent}) failed: ${firstFailureMessage}`;
      const partialSummary = summaries.join('\n\n').trim();
      const failedTaskDetails = failedTasks.map((task) => ({
        id: task.id,
        description: task.description,
        assignedAgent: task.assignedAgent,
        dependsOn: task.dependsOn,
        error: task._lastError ?? 'Unknown error',
      }));

      logger.error('[AgentRouter] Execution plan failed', {
        operationId,
        failedTaskId: firstFailedTask.id,
        assignedAgent: firstFailedTask.assignedAgent,
        error: firstFailureMessage,
        completedTaskCount: taskResults.size,
        totalTaskCount: mutableTasks.length,
      });

      this.telemetry.emitUpdate(
        onUpdate,
        operationId,
        'failed',
        failureHeadline,
        {
          eventType: 'plan_failed',
          failedTasks: failedTaskDetails,
          firstFailedTask: failedTaskDetails[0],
        },
        {
          agentId: firstFailedTask.assignedAgent,
          stage: 'agent_thinking',
          outcomeCode: 'task_failed',
          metadata: {
            failedTaskId: firstFailedTask.id,
            failedAgentId: firstFailedTask.assignedAgent,
          },
        }
      );

      const aggregationDurationMs = Date.now() - aggregationPhaseStartMs;
      this.telemetry.recordPhaseLatency('aggregation', aggregationDurationMs, {
        operationId,
        userId,
        status: 'failed',
      });
      this.telemetry.emitProgressOperation(onStreamEvent, {
        operationId,
        stage: 'agent_thinking',
        message: `Aggregation latency: ${aggregationDurationMs}ms`,
        metadata: {
          eventType: 'metric',
          metricName: 'phase_latency_ms',
          phase: 'aggregation',
          status: 'failed',
          value: aggregationDurationMs,
        },
      });

      return {
        summary:
          partialSummary.length > 0
            ? `${failureHeadline}\n\nPartial completed work:\n${partialSummary}`
            : failureHeadline,
        data: {
          plan,
          taskResults: Object.fromEntries(taskResults),
          operationStatus: 'failed',
          failedTasks: failedTaskDetails,
          firstFailedTask: failedTaskDetails[0],
        },
        suggestions: allSuggestions.length > 0 ? allSuggestions : undefined,
      };
    }

    this.telemetry.emitUpdate(
      onUpdate,
      operationId,
      'completed',
      'All tasks finished.',
      undefined,
      {
        agentId: 'router',
        outcomeCode: 'success_default',
      }
    );

    const aggregatedResult: AgentOperationResult = {
      summary: summaries.join('\n\n'),
      data: {
        plan,
        taskResults: Object.fromEntries(taskResults),
      },
      suggestions: allSuggestions.length > 0 ? allSuggestions : undefined,
    };

    const allCompleted = mutableTasks.every((task) => task.status === 'completed');
    if (allCompleted && taskResults.size > 0) {
      this.semanticCache.store(scopedIntent, aggregatedResult).catch(() => {
        /* noop */
      });
    }

    const aggregationDurationMs = Date.now() - aggregationPhaseStartMs;
    this.telemetry.recordPhaseLatency('aggregation', aggregationDurationMs, {
      operationId,
      userId,
      status: 'success',
    });
    this.telemetry.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'agent_thinking',
      message: `Aggregation latency: ${aggregationDurationMs}ms`,
      metadata: {
        eventType: 'metric',
        metricName: 'phase_latency_ms',
        phase: 'aggregation',
        status: 'success',
        value: aggregationDurationMs,
      },
    });
    this.telemetry.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'agent_thinking',
      message: 'Almost done...',
      metadata: { eventType: 'progress_subphase', phase: 'aggregation', status: 'done' },
    });

    this.context.appendAssistantMessage(userId, threadId, aggregatedResult.summary);
    return aggregatedResult;
  }
}
