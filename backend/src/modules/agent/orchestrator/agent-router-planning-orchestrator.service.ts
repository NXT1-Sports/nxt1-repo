import type {
  AgentExecutionPlan,
  AgentIdentifier,
  AgentJobUpdate,
  AgentOperationResult,
  AgentSessionContext,
  AgentToolAccessContext,
} from '@nxt1/core';
import { sanitizeAgentOutputText } from '../utils/platform-identifier-sanitizer.js';
import type { PlannerAgent } from '../agents/planner.agent.js';
import type { BaseAgent } from '../agents/base.agent.js';
import type { OnStreamEvent } from '../queue/event-writer.js';
import type {
  AgentPlanPreflightResult,
  AgentPlannerCapabilitySnapshot,
  AgentRouterPlanningService,
} from './agent-router-planning.service.js';
import type { AgentRouterTelemetryService } from './agent-router-telemetry.service.js';
import type { AgentRouterContextService } from './agent-router-context.service.js';
import { logger } from '../../../utils/logger.js';

type TelemetryDeps = Pick<
  AgentRouterTelemetryService,
  | 'emitMetricSample'
  | 'emitProgressOperation'
  | 'emitStreamedTextChunks'
  | 'emitUpdate'
  | 'recordPhaseLatency'
>;

type ContextDeps = Pick<AgentRouterContextService, 'appendAssistantMessage'>;

export type AgentRouterPlanningOutcome =
  | {
      readonly kind: 'plan';
      readonly plan: AgentExecutionPlan;
    }
  | {
      readonly kind: 'completed';
      readonly result: AgentOperationResult;
    }
  | {
      readonly kind: 'failed';
      readonly result: AgentOperationResult;
    };

export class AgentRouterPlanningOrchestratorService {
  constructor(
    private readonly planner: PlannerAgent,
    private readonly planningService: AgentRouterPlanningService,
    private readonly telemetry: TelemetryDeps,
    private readonly context: ContextDeps
  ) {}

  async plan(payload: {
    readonly operationId: string;
    readonly userId: string;
    readonly threadId?: string;
    readonly enrichedIntent: string;
    readonly context: AgentSessionContext;
    readonly toolAccessContext: AgentToolAccessContext;
    readonly agents: ReadonlyMap<AgentIdentifier, BaseAgent>;
    readonly onUpdate?: (update: AgentJobUpdate) => void;
    readonly onStreamEvent?: OnStreamEvent;
    readonly rawOnStreamEvent?: OnStreamEvent;
    readonly skipPlannerClassification: boolean;
    readonly signal?: AbortSignal;
  }): Promise<AgentRouterPlanningOutcome> {
    const {
      operationId,
      userId,
      threadId,
      enrichedIntent,
      context,
      toolAccessContext,
      agents,
      onUpdate,
      onStreamEvent,
      rawOnStreamEvent,
      skipPlannerClassification,
      signal,
    } = payload;

    const planningPhaseStartMs = Date.now();
    this.telemetry.emitUpdate(
      onUpdate,
      operationId,
      'acting',
      'Analyzing your request and building a plan...',
      undefined,
      {
        agentId: 'router',
        stage: 'decomposing_intent',
      }
    );
    this.telemetry.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'decomposing_intent',
      message: 'Analyzing your request and building a plan...',
      metadata: { eventType: 'progress_stage', phase: 'planning', phaseIndex: 2, phaseTotal: 5 },
    });

    let capabilitySnapshotForPlanning: AgentPlannerCapabilitySnapshot | undefined;
    let capabilitySnapshotPromise: Promise<AgentPlannerCapabilitySnapshot | undefined> | undefined;
    let planResult: AgentOperationResult;
    let plannerPassCount = 1;

    const resolveCapabilitySnapshotForPlanning = async (): Promise<
      AgentPlannerCapabilitySnapshot | undefined
    > => {
      if (!capabilitySnapshotPromise) {
        capabilitySnapshotPromise = this.planningService
          .buildCapabilitySnapshot(enrichedIntent, toolAccessContext, agents)
          .then((snapshot) => {
            capabilitySnapshotForPlanning = snapshot;
            return snapshot;
          })
          .catch((error) => {
            logger.warn('[AgentRouter] Failed to build capability snapshot for planning', {
              operationId,
              error: error instanceof Error ? error.message : String(error),
            });
            this.telemetry.emitMetricSample(rawOnStreamEvent, {
              operationId,
              stage: 'decomposing_intent',
              metricName: 'fallback_activation',
              value: 1,
              message: 'Fallback activated: capability snapshot unavailable.',
              metadata: {
                phase: 'planning',
                fallbackType: 'capability_snapshot_unavailable',
              },
              sampleContext: {
                operationId,
                userId,
              },
            });
            capabilitySnapshotForPlanning = undefined;
            return undefined;
          });
      }

      return capabilitySnapshotPromise;
    };

    if (skipPlannerClassification) {
      void resolveCapabilitySnapshotForPlanning();
    }

    try {
      this.throwIfAborted(signal);
      planResult = await this.planner.execute(enrichedIntent, context, [], undefined, {
        capabilitySnapshot: capabilitySnapshotForPlanning,
        capabilitySnapshotResolver: resolveCapabilitySnapshotForPlanning,
        skipClassification: skipPlannerClassification,
      });
      this.throwIfAborted(signal);
    } catch (err) {
      if (this.isAbortError(err)) throw err;
      const message = err instanceof Error ? err.message : 'Planning failed';
      const planningDurationMs = Date.now() - planningPhaseStartMs;
      this.telemetry.recordPhaseLatency('planning', planningDurationMs, {
        operationId,
        userId,
        status: 'failed',
      });
      this.telemetry.emitProgressOperation(onStreamEvent, {
        operationId,
        stage: 'decomposing_intent',
        message: `Planning latency: ${planningDurationMs}ms`,
        metadata: {
          eventType: 'metric',
          metricName: 'phase_latency_ms',
          phase: 'planning',
          status: 'failed',
          value: planningDurationMs,
        },
      });
      this.telemetry.emitMetricSample(rawOnStreamEvent, {
        operationId,
        stage: 'decomposing_intent',
        metricName: 'planner_latency_ms',
        value: planningDurationMs,
        message: `Planner latency: ${planningDurationMs}ms`,
        metadata: {
          phase: 'planning',
          status: 'failed',
        },
        sampleContext: {
          operationId,
          userId,
          status: 'failed',
        },
      });
      this.telemetry.emitUpdate(
        onUpdate,
        operationId,
        'failed',
        `Planning error: ${message}`,
        undefined,
        {
          agentId: 'router',
          stage: 'decomposing_intent',
          outcomeCode: 'planning_failed',
        }
      );
      return {
        kind: 'failed',
        result: {
          summary: `Failed to create execution plan: ${message}`,
          suggestions: ['Try rephrasing your request or try again later.'],
        },
      };
    }

    let plan = planResult.data?.['plan'] as AgentExecutionPlan | undefined;

    if (!plan || plan.tasks.length === 0) {
      const directResponse =
        typeof planResult.data?.['directResponse'] === 'string'
          ? (planResult.data['directResponse'] as string)
          : null;

      const responseText =
        directResponse ??
        planResult.summary ??
        "I'm here and ready to help. What would you like to work on?";
      const safeResponseText = sanitizeAgentOutputText(responseText);
      const planningDurationMs = Date.now() - planningPhaseStartMs;
      this.telemetry.recordPhaseLatency('planning', planningDurationMs, {
        operationId,
        userId,
        executionMode: 'chief_of_staff_direct',
      });
      this.telemetry.emitProgressOperation(onStreamEvent, {
        operationId,
        stage: 'decomposing_intent',
        message: `Planning latency: ${planningDurationMs}ms`,
        metadata: {
          eventType: 'metric',
          metricName: 'phase_latency_ms',
          phase: 'planning',
          executionMode: 'chief_of_staff_direct',
          value: planningDurationMs,
        },
      });
      this.telemetry.emitMetricSample(rawOnStreamEvent, {
        operationId,
        stage: 'decomposing_intent',
        metricName: 'planner_latency_ms',
        value: planningDurationMs,
        message: `Planner latency: ${planningDurationMs}ms`,
        metadata: {
          phase: 'planning',
          executionMode: 'chief_of_staff_direct',
        },
        sampleContext: {
          operationId,
          userId,
          executionMode: 'chief_of_staff_direct',
        },
      });
      this.telemetry.emitUpdate(onUpdate, operationId, 'completed', safeResponseText, undefined, {
        agentId: 'router',
        stage: 'agent_thinking',
        outcomeCode: 'success_default',
        metadata: { executionMode: 'chief_of_staff_direct' },
      });

      if (onStreamEvent) {
        await this.telemetry.emitStreamedTextChunks(onStreamEvent, {
          operationId,
          agentId: 'router',
          text: safeResponseText,
          targetChunkSize: 28,
          cadenceMs: 24,
          signal,
        });
      }

      this.telemetry.emitProgressOperation(onStreamEvent, {
        operationId,
        stage: 'agent_thinking',
        message: 'Response ready.',
        metadata: {
          eventType: 'progress_subphase',
          phase: 'planning',
          executionMode: 'chief_of_staff_direct',
          status: 'done',
        },
      });

      this.context.appendAssistantMessage(userId, threadId, safeResponseText);
      return { kind: 'completed', result: { summary: safeResponseText, suggestions: [] } };
    }

    this.telemetry.emitUpdate(
      onUpdate,
      operationId,
      'acting',
      'Matching skills and tools for the best execution path...',
      undefined,
      {
        agentId: 'router',
        stage: 'decomposing_intent',
      }
    );
    this.telemetry.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'decomposing_intent',
      message: 'Matching skills and tools for the best execution path...',
      metadata: { eventType: 'progress_subphase', phase: 'planning', status: 'capability_match' },
    });

    if (!capabilitySnapshotForPlanning) {
      capabilitySnapshotForPlanning = await resolveCapabilitySnapshotForPlanning();
    }

    const firstPassPreflight = this.planningService.preflightPlan(
      plan,
      agents,
      capabilitySnapshotForPlanning
    );
    let preflight: AgentPlanPreflightResult = firstPassPreflight;
    const firstPlanHash = this.planningService.hashExecutionPlan(plan);
    let replanNoOp = false;
    let replanIssueDelta:
      | {
          readonly beforeCount: number;
          readonly afterCount: number;
          readonly resolved: readonly string[];
          readonly introduced: readonly string[];
          readonly persisted: readonly string[];
        }
      | undefined;

    if (!preflight.feasible) {
      const issueSummary = preflight.issues
        .map((issue) => `${issue.taskId}:${issue.code}`)
        .join(', ');
      const issueCounts = this.planningService.summarizePreflightIssueCounts(preflight.issues);
      logger.warn(
        '[AgentRouter] Plan preflight detected unsatisfied tasks; attempting one replan',
        {
          operationId,
          issueSummary,
          issueCounts,
        }
      );

      this.telemetry.emitUpdate(
        onUpdate,
        operationId,
        'acting',
        'Plan has unsatisfied tasks; attempting constrained replan...',
        {
          eventType: 'plan_replan_started',
          issueCount: preflight.issues.length,
          issueCounts,
          issues: preflight.issues,
        },
        {
          agentId: 'router',
          stage: 'decomposing_intent',
          metadata: {
            issueCount: preflight.issues.length,
            issueCounts,
            issueSummary,
          },
        }
      );

      const replanIntent = this.planningService.buildConstrainedReplanIntent(
        enrichedIntent,
        plan,
        preflight.issues
      );

      try {
        plannerPassCount += 1;

        if (!capabilitySnapshotForPlanning) {
          capabilitySnapshotForPlanning = await resolveCapabilitySnapshotForPlanning();
        }

        planResult = await this.planner.execute(replanIntent, context, [], undefined, {
          capabilitySnapshot: capabilitySnapshotForPlanning,
        });

        const replanned = planResult.data?.['plan'] as AgentExecutionPlan | undefined;
        if (replanned && replanned.tasks.length > 0) {
          const replannedHash = this.planningService.hashExecutionPlan(replanned);
          if (replannedHash === firstPlanHash) {
            replanNoOp = true;
          }
          plan = replanned;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Constrained replan failed unexpectedly';
        logger.warn('[AgentRouter] Constrained replan failed', {
          operationId,
          error: message,
        });
      }

      preflight = plan
        ? this.planningService.preflightPlan(plan, agents, capabilitySnapshotForPlanning)
        : preflight;
      replanIssueDelta = this.planningService.summarizePreflightIssueDelta(
        firstPassPreflight.issues,
        preflight.issues
      );

      this.telemetry.emitUpdate(
        onUpdate,
        operationId,
        'acting',
        `Constrained replan finished: ${replanIssueDelta.beforeCount} issue(s) -> ${replanIssueDelta.afterCount} issue(s).`,
        {
          eventType: 'plan_replan_finished',
          plannerPassCount,
          issueDelta: replanIssueDelta,
        },
        {
          agentId: 'router',
          stage: 'decomposing_intent',
          metadata: {
            plannerPassCount,
            issueDelta: replanIssueDelta,
          },
        }
      );
    }

    if (replanNoOp) {
      const issueSummary = firstPassPreflight.issues
        .map((issue) => `${issue.taskId}:${issue.code}`)
        .join(', ');
      const issueCounts = this.planningService.summarizePreflightIssueCounts(
        firstPassPreflight.issues
      );
      const message =
        'Constrained replan did not change the infeasible execution plan. ' +
        `Unsatisfied tasks remain: ${issueSummary}.`;

      this.telemetry.emitUpdate(onUpdate, operationId, 'failed', message, undefined, {
        agentId: 'router',
        stage: 'routing_to_agent',
        outcomeCode: 'planning_failed',
        metadata: {
          plannerPassCount,
          replanNoOp: true,
          issueCount: firstPassPreflight.issues.length,
          issueCounts,
          issueSummary,
          issueDelta: replanIssueDelta,
        },
      });

      return {
        kind: 'failed',
        result: {
          summary: message,
          data: {
            operationStatus: 'failed',
            plannerPassCount,
            replanNoOp: true,
            preflightIssues: firstPassPreflight.issues,
            preflightIssueCounts: issueCounts,
            preflightIssueDelta: replanIssueDelta,
          },
          suggestions: [
            'Try rephrasing the request with more specific constraints or choose a narrower scope.',
          ],
        },
      };
    }

    if (!preflight.feasible) {
      const issueSummary = preflight.issues
        .map((issue) => `${issue.taskId}:${issue.code}`)
        .join(', ');
      const issueCounts = this.planningService.summarizePreflightIssueCounts(preflight.issues);
      const message =
        'Planner generated an infeasible execution plan even after one constrained replan. ' +
        `Unsatisfied tasks: ${issueSummary}.`;

      this.telemetry.emitUpdate(onUpdate, operationId, 'failed', message, undefined, {
        agentId: 'router',
        stage: 'routing_to_agent',
        outcomeCode: 'planning_failed',
        metadata: {
          plannerPassCount,
          issueCount: preflight.issues.length,
          issueCounts,
          issueSummary,
          issueDelta: replanIssueDelta,
        },
      });

      return {
        kind: 'failed',
        result: {
          summary: message,
          data: {
            operationStatus: 'failed',
            plannerPassCount,
            preflightIssues: preflight.issues,
            preflightIssueCounts: issueCounts,
            preflightIssueDelta: replanIssueDelta,
          },
          suggestions: [
            'Try narrowing the request scope or rephrase with a clearer desired outcome.',
          ],
        },
      };
    }

    this.telemetry.emitUpdate(
      onUpdate,
      operationId,
      'acting',
      `Plan: ${plan.tasks.length} task(s) — ${planResult.summary}`,
      { eventType: 'plan_created', taskCount: plan.tasks.length },
      {
        agentId: 'router',
        stage: 'routing_to_agent',
        metadata: {
          taskCount: plan.tasks.length,
          plannerPassCount,
          tasksFeasibleFirstPass: firstPassPreflight.feasible,
          tasksFeasibleAfterReplan: preflight.feasible,
          preflightIssueDelta: replanIssueDelta,
        },
      }
    );
    const planningDurationMs = Date.now() - planningPhaseStartMs;
    this.telemetry.recordPhaseLatency('planning', planningDurationMs, {
      operationId,
      userId,
      taskCount: plan.tasks.length,
      plannerPassCount,
    });
    this.telemetry.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'decomposing_intent',
      message: `Planning latency: ${planningDurationMs}ms`,
      metadata: {
        eventType: 'metric',
        metricName: 'phase_latency_ms',
        phase: 'planning',
        taskCount: plan.tasks.length,
        plannerPassCount,
        value: planningDurationMs,
      },
    });
    this.telemetry.emitMetricSample(rawOnStreamEvent, {
      operationId,
      stage: 'decomposing_intent',
      metricName: 'planner_latency_ms',
      value: planningDurationMs,
      message: `Planner latency: ${planningDurationMs}ms`,
      metadata: {
        phase: 'planning',
        taskCount: plan.tasks.length,
        plannerPassCount,
      },
      sampleContext: {
        operationId,
        userId,
        taskCount: plan.tasks.length,
        plannerPassCount,
      },
    });
    this.telemetry.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'routing_to_agent',
      message: `Plan ready: ${plan.tasks.length} task(s).`,
      metadata: {
        eventType: 'progress_subphase',
        phase: 'planning',
        status: 'done',
        taskCount: plan.tasks.length,
      },
    });

    if (onStreamEvent && plan.tasks.length > 0) {
      onStreamEvent({
        type: 'card',
        cardData: {
          agentId: 'router',
          type: 'planner',
          title: 'Execution Plan',
          payload: {
            items: plan.tasks.map((task) => ({
              id: task.id,
              label: task.description,
              done: false,
            })),
          },
        },
      });
    }

    return { kind: 'plan', plan };
  }

  private isAbortError(err: unknown): err is Error {
    return err instanceof Error && err.name === 'AbortError';
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) return;
    const abortError = new Error('Operation aborted');
    abortError.name = 'AbortError';
    throw abortError;
  }
}
