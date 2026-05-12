import type { AgentExecutionPlan, AgentJobUpdate, AgentOperationResult } from '@nxt1/core';
import type { OnStreamEvent } from '../queue/event-writer.js';
import type { SemanticCacheService } from '../memory/semantic-cache.service.js';
import type { AgentExecutionMutableTask } from './agent-router-execution.service.js';
import type { AgentRouterContextService } from './agent-router-context.service.js';
import type { AgentRouterTelemetryService } from './agent-router-telemetry.service.js';
import { getConnectedSourceSyncTracker } from '../services/connected-source-sync-tracker.service.js';
import { logger } from '../../../utils/logger.js';

const DELIVERABLE_URL_KEYS = [
  'url',
  'imageUrl',
  'videoUrl',
  'outputUrl',
  'downloadUrl',
  'pdfUrl',
  'exportUrl',
  'audioUrl',
  'thumbnailUrl',
  'chartUrl',
  'diagramUrl',
] as const;

const DELIVERABLE_COLLECTION_KEYS = [
  'files',
  'attachments',
  'mediaArtifact',
  'mediaArtifacts',
] as const;

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function collectDeliverableUrls(value: unknown, sink: Set<string>): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectDeliverableUrls(entry, sink);
    }
    return;
  }

  const record = value as Record<string, unknown>;

  for (const key of DELIVERABLE_URL_KEYS) {
    const candidate = record[key];
    if (isHttpUrl(candidate)) {
      sink.add(candidate.trim());
    }
  }

  for (const key of DELIVERABLE_COLLECTION_KEYS) {
    if (!(key in record)) {
      continue;
    }

    const nested = record[key];
    if (Array.isArray(nested)) {
      for (const entry of nested) {
        collectDeliverableUrls(entry, sink);
      }
      continue;
    }

    collectDeliverableUrls(nested, sink);
  }
}

function appendDeliverablesSection(summary: string, urls: readonly string[]): string {
  if (urls.length === 0) return summary;

  const missing = urls.filter((url) => !summary.includes(url));
  if (missing.length === 0) return summary;

  const prefix = summary.trim().length > 0 ? `${summary.trim()}\n\n` : '';
  const lines = missing.map((url) => `- ${url}`).join('\n');
  return `${prefix}Deliverables:\n${lines}`;
}

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
    const urls = new Set<string>();
    for (const result of taskResults.values()) {
      if (result.artifacts) {
        collectDeliverableUrls(result.artifacts, urls);
      }
      if (result.data) {
        collectDeliverableUrls(result.data, urls);
      }
    }
    const deliverableUrls = [...urls];

    const summaries = [...taskResults.values()].map((result) => result.summary);
    const allSuggestions = [...taskResults.values()].flatMap((result) => result.suggestions ?? []);
    const failedTasks = mutableTasks.filter(
      (task): task is AgentExecutionMutableTask => task.status === 'failed'
    );
    const hasDeliverables = deliverableUrls.length > 0;

    if (failedTasks.length > 0) {
      const firstFailedTask = failedTasks[0];
      const firstFailureMessage = firstFailedTask._lastError ?? 'Unknown error';
      const failureHeadline = hasDeliverables
        ? `Completed with partial issues. Task ${firstFailedTask.id} ` +
          `(${firstFailedTask.assignedAgent}) failed: ${firstFailureMessage}`
        : `Execution plan failed. Task ${firstFailedTask.id} ` +
          `(${firstFailedTask.assignedAgent}) failed: ${firstFailureMessage}`;
      const partialSummary = summaries.join('\n\n').trim();
      const failedTaskDetails = failedTasks.map((task) => ({
        id: task.id,
        description: task.description,
        assignedAgent: task.assignedAgent,
        dependsOn: task.dependsOn,
        error: task._lastError ?? 'Unknown error',
      }));

      logger[hasDeliverables ? 'warn' : 'error']('[AgentRouter] Execution plan failed', {
        operationId,
        failedTaskId: firstFailedTask.id,
        assignedAgent: firstFailedTask.assignedAgent,
        error: firstFailureMessage,
        hasDeliverables,
        completedTaskCount: taskResults.size,
        totalTaskCount: mutableTasks.length,
      });

      this.telemetry.emitUpdate(
        onUpdate,
        operationId,
        hasDeliverables ? 'completed' : 'failed',
        failureHeadline,
        {
          eventType: hasDeliverables ? 'plan_partial_success' : 'plan_failed',
          failedTasks: failedTaskDetails,
          firstFailedTask: failedTaskDetails[0],
        },
        {
          agentId: firstFailedTask.assignedAgent,
          stage: 'agent_thinking',
          outcomeCode: hasDeliverables ? 'success_default' : 'task_failed',
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
        status: hasDeliverables ? 'partial_success' : 'failed',
      });
      this.telemetry.emitProgressOperation(onStreamEvent, {
        operationId,
        stage: 'agent_thinking',
        message: `Aggregation latency: ${aggregationDurationMs}ms`,
        ...(hasDeliverables ? { status: 'complete' as const } : { status: 'failed' as const }),
        metadata: {
          eventType: 'metric',
          metricName: 'phase_latency_ms',
          phase: 'aggregation',
          status: hasDeliverables ? 'partial_success' : 'failed',
          value: aggregationDurationMs,
        },
      });

      // When a deliverable was produced, connected sources should remain green
      // even if a non-critical downstream task failed.
      logger.info('[AgentRouter] Flushing connected sources outcome', {
        operationId,
        outcome: hasDeliverables ? 'success' : 'error',
        taskCount: taskResults.size,
      });
      getConnectedSourceSyncTracker()
        .flush(operationId, hasDeliverables ? 'success' : 'error')
        .catch((err) =>
          logger.error('[AgentRouter] Connected source sync status stamp failed', {
            operationId,
            outcome: hasDeliverables ? 'success' : 'error',
            error: err instanceof Error ? err.message : String(err),
            errorStack: err instanceof Error ? err.stack : undefined,
          })
        );

      const failedSummary =
        partialSummary.length > 0
          ? `${failureHeadline}\n\n${hasDeliverables ? 'Completed work:' : 'Partial completed work:'}\n${partialSummary}`
          : failureHeadline;

      return {
        summary: appendDeliverablesSection(failedSummary, deliverableUrls),
        data: {
          plan,
          taskResults: Object.fromEntries(taskResults),
          operationStatus: hasDeliverables ? 'partial_success' : 'failed',
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
      summary: appendDeliverablesSection(summaries.join('\n\n'), deliverableUrls),
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

    // Stamp every connected source written during this job with syncStatus: 'success'
    // now that the full pipeline has completed successfully.
    logger.info('[AgentRouter] Flushing connected sources (success outcome)', {
      operationId,
      outcome: 'success',
      taskCount: taskResults.size,
    });
    getConnectedSourceSyncTracker()
      .flush(operationId, 'success')
      .then(() => {
        logger.info('[AgentRouter] Connected sources flushed successfully', {
          operationId,
          outcome: 'success',
        });
      })
      .catch((err) =>
        logger.error('[AgentRouter] Connected source sync status stamp failed', {
          operationId,
          outcome: 'success',
          error: err instanceof Error ? err.message : String(err),
          errorStack: err instanceof Error ? err.stack : undefined,
        })
      );

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
