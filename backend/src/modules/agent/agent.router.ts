/**
 * @fileoverview Agent Router — The Orchestrator
 * @module @nxt1/backend/modules/agent
 *
 * The master orchestrator that:
 * 1. Receives a user intent (plain-text message or structured command).
 * 2. Uses the PlannerAgent to decompose the intent into a DAG of tasks.
 * 3. Executes each task in dependency order by delegating to the correct sub-agent.
 * 4. Streams step updates back via the onUpdate callback.
 * 5. Returns the aggregated result.
 *
 * This class is instantiated once by the worker and re-used across jobs.
 *
 * @example
 * ```ts
 * const router = new AgentRouter(llm, toolRegistry, contextBuilder);
 * const result = await router.run(jobPayload, onUpdate);
 * ```
 */

import type {
  AgentJobPayload,
  AgentJobUpdate,
  AgentProgressMetadata,
  AgentProgressStage,
  AgentOperationResult,
  AgentIdentifier,
  AgentRouterStage,
  AgentTaskStatus,
  AgentTask,
  AgentExecutionPlan,
  OperationOutcomeCode,
  AgentSessionContext,
  AgentSessionMessage,
  AgentRetrievedMemories,
  AgentUserContext,
  AgentToolAccessContext,
  AgentToolEntityGroup,
} from '@nxt1/core';
import { COORDINATOR_AGENT_IDS } from '@nxt1/core';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { OpenRouterService } from './llm/openrouter.service.js';
import type { ToolRegistry } from './tools/tool-registry.js';
import type { ContextBuilder } from './memory/context-builder.js';
import type { BaseAgent } from './agents/base.agent.js';
import type { SkillRegistry } from './skills/skill-registry.js';
import type { OnStreamEvent } from './queue/event-writer.js';
import { PlannerAgent } from './agents/planner.agent.js';
import { isAgentYield, AgentYieldException } from './exceptions/agent-yield.exception.js';
import { isAgentDelegation } from './exceptions/agent-delegation.exception.js';
import { AgentEngineError } from './exceptions/agent-engine.error.js';
import { SemanticCacheService } from './memory/semantic-cache.service.js';
import { SessionMemoryService } from './memory/session.service.js';
import { ApprovalGateService } from './services/approval-gate.service.js';
import { parallelBatch } from './utils/parallel-batch.js';
import { sanitizeAgentOutputText } from './utils/platform-identifier-sanitizer.js';
import { getAgentRunConfig, DEFAULT_AGENT_RUN_CONFIG } from './config/agent-app-config.js';
import { isToolAllowedByPatterns } from './agents/tool-policy.js';
import { logger } from '../../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Fallback values used when Firestore `AppConfig/agentConfig` is absent.
 * Live values are read per-run from Firestore via getAgentRunConfig().
 * These are only referenced by DEFAULT_AGENT_RUN_CONFIG in agent-app-config.ts.
 */

type MutableAgentTask = Omit<AgentTask, 'status' | 'assignedAgent' | 'description'> & {
  status: AgentTaskStatus;
  assignedAgent: Exclude<AgentIdentifier, 'router'>;
  description: string;
  _lastError?: string;
};

type TaskDelegationRerouteResult = {
  readonly assignedAgent: Exclude<AgentIdentifier, 'router'>;
  readonly description: string;
};

interface AgentPlannerCapabilityCoordinatorSnapshot {
  readonly agentId: Exclude<AgentIdentifier, 'router'>;
  readonly allowedToolNames: readonly string[];
  readonly allowedEntityGroups: readonly AgentToolEntityGroup[];
  readonly matchedToolNames: readonly string[];
  readonly staticSkillHints: readonly string[];
  readonly matchedSkillHints: readonly string[];
  readonly confidence: {
    readonly matchedToolCount: number;
    readonly allowedToolCount: number;
    readonly toolCoverageRatio: number;
    readonly matchedSkillCount: number;
    readonly staticSkillCount: number;
    readonly skillCoverageRatio: number;
  };
}

interface AgentPlannerCapabilitySnapshot {
  readonly schemaVersion: number;
  readonly hash: string;
  readonly coordinators: readonly AgentPlannerCapabilityCoordinatorSnapshot[];
}

interface AgentPlanPreflightIssue {
  readonly taskId: string;
  readonly code:
    | 'missing_task_id'
    | 'plan_task_limit_exceeded'
    | 'non_routable_agent'
    | 'agent_not_registered'
    | 'capability_mismatch'
    | 'missing_task_description'
    | 'task_dependency_limit_exceeded'
    | 'duplicate_dependency'
    | 'unknown_dependency'
    | 'duplicate_task_id'
    | 'self_dependency'
    | 'circular_dependency';
  readonly message: string;
}

interface AgentPlanPreflightResult {
  readonly feasible: boolean;
  readonly issues: readonly AgentPlanPreflightIssue[];
}

const CAPABILITY_SNAPSHOT_SCHEMA_VERSION = 1;
const PLAN_PREFLIGHT_LIMITS = {
  maxTasks: 24,
  maxDependenciesPerTask: 8,
} as const;

const CONVERSATION_ROUTE_SCOPE_SCHEMA = z.enum([
  'profile',
  'thread_history',
  'active_threads',
  'memories',
  'recent_sync',
]);
type ConversationRouteScope = z.infer<typeof CONVERSATION_ROUTE_SCOPE_SCHEMA>;

const conversationRouteDecisionSchema = z.object({
  route: z.enum(['chat', 'plan']),
  requiredContextScopes: z.array(CONVERSATION_ROUTE_SCOPE_SCHEMA).default([]),
  directResponse: z.string().nullable(),
  planSummary: z.string().nullable(),
});

type ConversationRouteDecision = z.infer<typeof conversationRouteDecisionSchema>;

type ConversationRouteOutcome =
  | {
      readonly kind: 'handled';
      readonly result: AgentOperationResult;
    }
  | {
      readonly kind: 'escalate_to_planning';
    }
  | {
      readonly kind: 'fallthrough';
    };

const EMPTY_RETRIEVED_MEMORIES: AgentRetrievedMemories = {
  user: [],
  team: [],
  organization: [],
};

const CONVERSATIONAL_CACHE_TTL_MS = 5 * 60_000;
const CONVERSATIONAL_CACHE_MAX_ENTRIES = 512;

const routableCoordinatorSet = new Set<string>(COORDINATOR_AGENT_IDS);

function isRoutableCoordinatorAgent(
  agentId: string
): agentId is Exclude<AgentIdentifier, 'router'> {
  return routableCoordinatorSet.has(agentId);
}

// ─── Router ─────────────────────────────────────────────────────────────────

export class AgentRouter {
  private readonly planner: PlannerAgent;
  private readonly agents = new Map<AgentIdentifier, BaseAgent>();
  private readonly semanticCache: SemanticCacheService;
  private readonly phaseLatencySamples = new Map<string, number[]>();
  private readonly metricSamples = new Map<string, number[]>();
  private readonly conversationalResponseCache = new Map<
    string,
    {
      readonly result: AgentOperationResult;
      readonly expiresAt: number;
    }
  >();

  constructor(
    private readonly llm: OpenRouterService,
    private readonly toolRegistry: ToolRegistry,
    private readonly contextBuilder: ContextBuilder,
    private readonly skillRegistry?: SkillRegistry,
    private readonly sessionMemory?: SessionMemoryService
  ) {
    this.planner = new PlannerAgent(llm);
    this.semanticCache = new SemanticCacheService(llm);
  }

  /** Register a sub-agent so the router can delegate tasks to it. */
  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.id, agent);
  }

  private async rerouteDelegatedTask(
    forwardingIntent: string,
    sourceAgentId: Exclude<AgentIdentifier, 'router'>,
    context: AgentSessionContext
  ): Promise<TaskDelegationRerouteResult | null> {
    const routingHint =
      `\n\n[System: The "${sourceAgentId}" agent could not handle this task. ` +
      'Route to a different specialist and do not assign it back to the same agent.]';

    const rerouteResult = await this.planner.execute(
      `${forwardingIntent}${routingHint}`,
      context,
      []
    );
    const reroutedPlan = rerouteResult.data?.['plan'] as AgentExecutionPlan | undefined;

    if (!reroutedPlan || reroutedPlan.tasks.length !== 1) {
      return null;
    }

    const reroutedTask = reroutedPlan.tasks[0];
    if (
      !isRoutableCoordinatorAgent(reroutedTask.assignedAgent) ||
      reroutedTask.assignedAgent === sourceAgentId
    ) {
      return null;
    }

    return {
      assignedAgent: reroutedTask.assignedAgent,
      description: reroutedTask.description,
    };
  }

  /**
   * Classify the user's intent and return the best sub-agent identifier.
   * Uses the PlannerAgent to decompose — if it's a single task, returns
   * that task's agent. If multi-task, returns 'router' (meaning: run the full plan).
   */
  async classify(intent: string, userId: string): Promise<AgentIdentifier> {
    const userContext = await this.contextBuilder.buildContext(userId);
    const context = this.buildSessionContext(userId);
    const enrichedIntent = this.enrichIntentWithContext(intent, userContext, undefined, undefined);

    const result = await this.planner.execute(enrichedIntent, context, []);
    const plan = result.data?.['plan'] as AgentExecutionPlan | undefined;

    if (!plan || plan.tasks.length === 0) return 'router';
    if (plan.tasks.length === 1) return plan.tasks[0].assignedAgent;
    return 'router';
  }

  /**
   * Full execution loop:
   * 1. Build user context from the database.
   * 2. Run the PlannerAgent to create a task DAG.
   * 3. Execute tasks in topological (dependency) order.
   * 4. Aggregate results and return.
   */
  async run(
    payload: AgentJobPayload,
    onUpdate?: (update: AgentJobUpdate) => void,
    firestore?: FirebaseFirestore.Firestore,
    onStreamEvent?: OnStreamEvent,
    environment: 'staging' | 'production' = 'production',
    signal?: AbortSignal
  ): Promise<AgentOperationResult> {
    const { operationId, userId, intent } = payload;
    const approvalGate = firestore ? new ApprovalGateService(firestore) : undefined;
    const operationStartMs = Date.now();

    const rawContextObj =
      typeof payload.context === 'object' && payload.context !== null ? payload.context : {};

    // ── Load runtime config from AppConfig/agentConfig ────────────────────
    const agentRunConfig = firestore
      ? await getAgentRunConfig(firestore)
      : DEFAULT_AGENT_RUN_CONFIG;
    const taskMaxRetries = agentRunConfig.taskMaxRetries;
    const maxDelegationDepth = agentRunConfig.maxDelegationDepth;
    const maxAgenticTurns = agentRunConfig.maxAgenticTurns;

    const priorTurnCount =
      typeof (rawContextObj as Record<string, unknown>)['agenticTurnCount'] === 'number'
        ? Math.max(
            0,
            Math.floor((rawContextObj as Record<string, unknown>)['agenticTurnCount'] as number)
          )
        : 0;
    const agenticTurnCount = priorTurnCount + 1;

    if (agenticTurnCount > maxAgenticTurns) {
      const limitMessage = `Agent X reached the maximum execution turn limit (${maxAgenticTurns}) for this operation.`;
      this.emitUpdate(onUpdate, operationId, 'failed', limitMessage, undefined, {
        agentId: 'router',
        stage: 'routing_to_agent',
        outcomeCode: 'task_failed',
        metadata: {
          errorCode: 'MAX_AGENTIC_TURNS_EXCEEDED',
          maxAgenticTurns,
          agenticTurnCount,
        },
      });

      return {
        summary: limitMessage,
        data: {
          maxIterationsReached: true,
          operationStatus: 'failed',
          firstFailedTask: {
            id: 'agentic_turn_limit',
            assignedAgent: 'router',
            error: limitMessage,
          },
          maxAgenticTurns,
          agenticTurnCount,
        },
        suggestions: ['Try narrowing the request scope or splitting it into smaller steps.'],
      };
    }

    const contextObj: Record<string, unknown> = {
      ...(rawContextObj as Record<string, unknown>),
      agenticTurnCount,
    };

    // ── Resume detection: check if this is a resumed job ──────────────────
    const yieldState = (contextObj as Record<string, unknown>)['yieldState'] as
      | import('@nxt1/core').AgentYieldState
      | undefined;

    if (yieldState) {
      return this.runResumed(
        payload,
        yieldState,
        onUpdate,
        firestore,
        onStreamEvent,
        environment,
        signal
      );
    }

    const rawOnUpdate = onUpdate;
    const rawOnStreamEvent = onStreamEvent;
    let firstProgressMetricRecorded = false;
    let firstTokenMetricRecorded = false;
    let completionMetricRecorded = false;

    const recordFirstProgressMetric = (
      stage: AgentProgressStage = 'agent_thinking',
      metadata?: AgentProgressMetadata
    ): void => {
      if (firstProgressMetricRecorded) return;
      firstProgressMetricRecorded = true;
      const durationMs = Date.now() - operationStartMs;
      this.emitMetricSample(rawOnStreamEvent, {
        operationId,
        stage,
        metricName: 'first_progress_ms',
        value: durationMs,
        message: `First progress latency: ${Math.max(0, Math.round(durationMs))}ms`,
        metadata: {
          phase: 'operation_start',
          ...(metadata ?? {}),
        },
        sampleContext: {
          operationId,
          userId,
        },
      });
    };

    const recordFirstTokenMetric = (
      stage: AgentProgressStage = 'agent_thinking',
      metadata?: AgentProgressMetadata
    ): void => {
      if (firstTokenMetricRecorded) return;
      firstTokenMetricRecorded = true;
      const durationMs = Date.now() - operationStartMs;
      this.emitMetricSample(rawOnStreamEvent, {
        operationId,
        stage,
        metricName: 'first_token_ms',
        value: durationMs,
        message: `First token latency: ${Math.max(0, Math.round(durationMs))}ms`,
        metadata: {
          phase: 'operation_start',
          ...(metadata ?? {}),
        },
        sampleContext: {
          operationId,
          userId,
        },
      });
    };

    const recordCompletionMetrics = (
      status: AgentJobUpdate['status'],
      stage: AgentProgressStage = 'agent_thinking',
      outcomeCode?: OperationOutcomeCode,
      metadata?: AgentProgressMetadata
    ): void => {
      if (completionMetricRecorded) return;
      if (status !== 'completed' && status !== 'failed') return;

      completionMetricRecorded = true;
      const durationMs = Date.now() - operationStartMs;
      const successValue = status === 'completed' ? 1 : 0;

      this.emitMetricSample(rawOnStreamEvent, {
        operationId,
        stage,
        metricName: 'completion_latency_ms',
        value: durationMs,
        message: `Completion latency: ${Math.max(0, Math.round(durationMs))}ms`,
        metadata: {
          phase: 'operation',
          outcomeCode,
          ...(metadata ?? {}),
        },
        sampleContext: {
          operationId,
          userId,
          status,
          outcomeCode,
        },
      });

      this.emitMetricSample(rawOnStreamEvent, {
        operationId,
        stage,
        metricName: 'success_rate',
        value: successValue,
        message: `Success rate sample: ${successValue}`,
        metadata: {
          phase: 'operation',
          outcomeCode,
          ...(metadata ?? {}),
        },
        sampleContext: {
          operationId,
          userId,
          status,
          outcomeCode,
        },
      });
    };

    onUpdate = rawOnUpdate
      ? (update) => {
          recordFirstProgressMetric(update.stage ?? update.step?.stage ?? 'agent_thinking', {
            ...(update.metadata ?? {}),
            ...(update.step?.metadata ?? {}),
          });
          recordCompletionMetrics(
            update.status,
            update.stage ?? update.step?.stage ?? 'agent_thinking',
            update.outcomeCode ?? update.step?.outcomeCode,
            update.metadata ?? update.step?.metadata
          );
          rawOnUpdate(update);
        }
      : undefined;

    onStreamEvent = rawOnStreamEvent
      ? (event) => {
          if (
            event.type === 'operation' ||
            event.type === 'progress_stage' ||
            event.type === 'progress_subphase'
          ) {
            recordFirstProgressMetric(event.stage ?? 'agent_thinking', event.metadata);
          }
          if (event.type === 'delta' && typeof event.text === 'string' && event.text.length > 0) {
            recordFirstProgressMetric(event.stage ?? 'agent_thinking', event.metadata);
            recordFirstTokenMetric(event.stage ?? 'agent_thinking', event.metadata);
          }
          rawOnStreamEvent(event);
        }
      : undefined;

    recordFirstProgressMetric('agent_thinking', { phase: 'operation_start' });

    this.emitUpdate(onUpdate, operationId, 'thinking', 'Reviewing your message...', undefined, {
      agentId: 'router',
      stage: 'agent_thinking',
    });

    const threadId =
      typeof (contextObj as Record<string, unknown>)['threadId'] === 'string'
        ? ((contextObj as Record<string, unknown>)['threadId'] as string)
        : undefined;

    const mode =
      typeof (contextObj as Record<string, unknown>)['mode'] === 'string'
        ? ((contextObj as Record<string, unknown>)['mode'] as string)
        : undefined;
    const attachments = Array.isArray((contextObj as Record<string, unknown>)['attachments'])
      ? ((contextObj as Record<string, unknown>)['attachments'] as readonly {
          url: string;
          mimeType: string;
        }[])
      : undefined;
    const videoAttachments = Array.isArray(
      (contextObj as Record<string, unknown>)['videoAttachments']
    )
      ? ((contextObj as Record<string, unknown>)['videoAttachments'] as readonly {
          url: string;
          mimeType: string;
          name: string;
        }[])
      : undefined;

    let sessionContext: AgentSessionContext | undefined;
    if (this.sessionMemory) {
      try {
        sessionContext = await this.sessionMemory.getOrCreate(userId, threadId);
      } catch (err) {
        logger.warn(
          '[AgentRouter] Session memory getOrCreate failed — continuing without history',
          {
            userId,
            threadId,
            error: err instanceof Error ? err.message : String(err),
          }
        );
      }
    }

    const context = this.buildSessionContext(
      userId,
      sessionContext?.sessionId ?? payload.sessionId,
      operationId,
      threadId,
      environment,
      signal,
      mode,
      attachments,
      videoAttachments,
      sessionContext?.conversationHistory
    );

    if (this.sessionMemory && threadId) {
      try {
        await this.sessionMemory.appendMessage(userId, threadId, {
          role: 'user',
          content: intent,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        logger.warn('[AgentRouter] Failed to append user message to session', {
          userId,
          threadId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    let skipPlannerClassification = false;

    if (!payload.agent) {
      const conversationalOutcome = await this.tryConversationalRoute({
        payload,
        context,
        threadId,
        firestore,
        onUpdate,
        onStreamEvent,
        environment,
        signal,
      });

      if (conversationalOutcome.kind === 'handled') {
        return conversationalOutcome.result;
      }

      if (conversationalOutcome.kind === 'escalate_to_planning') {
        skipPlannerClassification = true;
      }
    }

    // ── Step 1: Build context ─────────────────────────────────────────────
    const contextPhaseStartMs = Date.now();
    this.emitUpdate(
      onUpdate,
      operationId,
      'acting',
      'Building your profile context...',
      undefined,
      {
        agentId: 'router',
        stage: 'building_context',
        metadata: { phase: 'context_build', phaseIndex: 1, phaseTotal: 5 },
      }
    );
    this.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'building_context',
      message: 'Building your profile context...',
      metadata: {
        eventType: 'progress_stage',
        phase: 'context_build',
        phaseIndex: 1,
        phaseTotal: 5,
      },
    });

    let userContext: AgentUserContext;
    try {
      userContext = await this.contextBuilder.buildContext(userId, firestore);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Context building failed';
      this.emitUpdate(onUpdate, operationId, 'failed', `Context error: ${message}`, undefined, {
        agentId: 'router',
        stage: 'building_context',
        outcomeCode: 'context_build_failed',
      });
      return {
        summary: `Failed to build user context: ${message}`,
        suggestions: ['Try again later or contact support.'],
      };
    }

    const contextBuildDurationMs = Date.now() - contextPhaseStartMs;
    this.recordPhaseLatency('context_build', contextBuildDurationMs, {
      operationId,
      userId,
    });
    this.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'building_context',
      message: `Context build latency: ${contextBuildDurationMs}ms`,
      metadata: {
        eventType: 'metric',
        metricName: 'phase_latency_ms',
        phase: 'context_build',
        value: contextBuildDurationMs,
      },
    });
    this.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'building_context',
      message: 'Context loaded.',
      metadata: { eventType: 'progress_subphase', phase: 'context_build', status: 'done' },
    });
    const toolAccessContext = this.buildToolAccessContext(userContext);

    // Inject thread history for conversation continuity (belt-and-suspenders
    // during rollout — can be removed once Redis session memory is stable)
    let threadHistoryStr = '';
    if (threadId) {
      try {
        threadHistoryStr = await this.contextBuilder.getRecentThreadHistory(threadId, 20);
      } catch {
        // Thread history is non-critical — continue without it
      }
    }

    // Inject cross-thread awareness so the agent can answer questions like
    // "what were our recent chats about?" even in a brand-new thread.
    let activeThreadsSummary = '';
    try {
      activeThreadsSummary = await this.contextBuilder.getActiveThreadsSummary(userId, 8);
    } catch {
      // Non-critical — continue without it
    }

    const enrichedIntent = this.enrichIntentWithContext(
      intent,
      userContext,
      payload.context,
      threadHistoryStr,
      undefined,
      undefined,
      activeThreadsSummary
    );

    // ── Direct routing: skip planner when a specific agent is requested ───
    if (payload.agent) {
      const directAgentId = payload.agent;
      if (!isRoutableCoordinatorAgent(directAgentId)) {
        const message =
          `Direct routing target "${directAgentId}" is not allowed. ` +
          `Allowed coordinator ids: ${COORDINATOR_AGENT_IDS.join(', ')}.`;
        this.emitUpdate(onUpdate, operationId, 'failed', message, undefined, {
          agentId: 'router',
          stage: 'routing_to_agent',
          outcomeCode: 'routing_failed',
          metadata: {
            targetAgentId: directAgentId,
            allowedAgentIds: COORDINATOR_AGENT_IDS,
          },
        });

        return {
          summary: message,
          suggestions: ['Select one of the supported coordinator commands and try again.'],
        };
      }

      const directAgent = this.agents.get(directAgentId);
      if (!directAgent) {
        this.emitUpdate(
          onUpdate,
          operationId,
          'failed',
          `No agent registered for "${directAgentId}".`,
          undefined,
          {
            agentId: 'router',
            stage: 'routing_to_agent',
            outcomeCode: 'routing_failed',
            metadata: { targetAgentId: directAgentId },
          }
        );
        return {
          summary: `No agent registered for "${directAgentId}".`,
          suggestions: ['Check agent configuration or contact support.'],
        };
      }

      this.emitUpdate(
        onUpdate,
        operationId,
        'acting',
        `Routing directly to ${directAgentId}...`,
        undefined,
        {
          agentId: directAgentId,
          stage: 'routing_to_agent',
          metadata: { targetAgentId: directAgentId },
        }
      );

      try {
        let toolDefs = this.toolRegistry.getDefinitions(directAgent.id, toolAccessContext);

        // Dynamically filter tools by semantic intent matching, if intent embedding succceeds.
        try {
          const intentEmbedding = await this.llm.embed(enrichedIntent);
          // Reassign toolDefs based on RAG. Tools without relevance are trimmed.
          toolDefs = await this.toolRegistry.match(
            intentEmbedding,
            (t) => this.llm.embed(t),
            directAgent.id,
            toolAccessContext
          );
        } catch {
          // Ensure we don't blow up DAG execution if embedding service is down.
        }

        const result = await directAgent.execute(
          enrichedIntent,
          context,
          toolDefs,
          this.llm,
          this.toolRegistry,
          this.skillRegistry,
          onStreamEvent,
          approvalGate
        );

        this.emitUpdate(onUpdate, operationId, 'completed', result.summary, undefined, {
          agentId: directAgentId,
          stage: 'agent_thinking',
          outcomeCode: 'success_default',
          metadata: { executionMode: 'direct' },
        });
        this.appendAssistantMessage(userId, threadId, result.summary);
        return result;
      } catch (err) {
        // Let AgentYieldException propagate to the worker for suspend-and-resume
        if (isAgentYield(err)) throw err;

        // ── Delegation Handoff ────────────────────────────────────────────
        // A sub-agent called delegate_task because the request is outside
        // its domain. Re-dispatch through the PlannerAgent for proper routing.
        if (isAgentDelegation(err)) {
          const delegationCount =
            (typeof (contextObj as Record<string, unknown>)['delegationCount'] === 'number'
              ? ((contextObj as Record<string, unknown>)['delegationCount'] as number)
              : 0) + 1;

          if (delegationCount > maxDelegationDepth) {
            logger.warn('[AgentRouter] Delegation depth exceeded — aborting', {
              operationId,
              delegationCount,
              sourceAgent: directAgentId,
            });
            this.emitUpdate(
              onUpdate,
              operationId,
              'failed',
              'Unable to route this request.',
              undefined,
              {
                agentId: 'router',
                stage: 'routing_to_agent',
                outcomeCode: 'routing_failed',
              }
            );
            return {
              summary:
                "I'm having trouble finding the right specialist for this request. " +
                'Please try rephrasing or submit it from the main Agent X chat.',
              suggestions: ['Try asking from the main Agent X input bar.'],
            };
          }

          logger.info('[AgentRouter] Delegation handoff — re-dispatching through Planner', {
            operationId,
            sourceAgent: directAgentId,
            forwardingIntent: err.payload.forwardingIntent.slice(0, 100),
            delegationCount,
          });

          this.emitUpdate(
            onUpdate,
            operationId,
            'acting',
            'Transferring your request to the right specialist...',
            undefined,
            {
              agentId: 'router',
              stage: 'routing_to_agent',
            }
          );

          // Re-dispatch with agent lock removed so the Planner takes over.
          // Append a routing hint so the Planner avoids the agent that just bailed.
          const sourceAgentId = (payload.agent ?? err.payload.sourceAgent) as AgentIdentifier;
          const routingHint = sourceAgentId
            ? `\n\n[System: The "${sourceAgentId}" agent could not handle this. Route to a different specialist.]`
            : '';

          const delegatedPayload: AgentJobPayload = {
            ...payload,
            agent: undefined,
            intent: `${err.payload.forwardingIntent}${routingHint}`,
            context: {
              ...contextObj,
              delegationCount,
              delegatedFrom: directAgentId,
            },
          };

          return this.run(
            delegatedPayload,
            rawOnUpdate,
            firestore,
            rawOnStreamEvent,
            environment,
            signal
          );
        }

        // Re-throw AbortError so the caller (chat.routes.ts) detects the abort
        // and skips persisting a fake failure message to the thread history.
        if (err instanceof Error && err.name === 'AbortError') throw err;

        const message = err instanceof Error ? err.message : 'Agent execution failed';
        this.emitUpdate(onUpdate, operationId, 'failed', message, undefined, {
          agentId: directAgentId,
          stage: 'agent_thinking',
          outcomeCode: 'task_failed',
          metadata: { executionMode: 'direct' },
        });
        return {
          summary: `Agent ${directAgentId} failed: ${message}`,
          suggestions: ['Try again later or contact support.'],
        };
      }
    }

    // ── Semantic Cache: check for near-identical recent answers ────────────
    // This intercepts before the Planner fires, saving LLM tokens and latency.
    // Only applies to non-resumed, non-direct-agent jobs.
    // When a hit is found, the raw cached response is personalized for the
    // current user via a fast micro-LLM pass (the "Synthesizer Pattern").
    // The intent is scoped by [role|sport] to prevent cross-role cache pollution
    // (e.g. an athlete answer being served to a coach for the same raw intent).
    const scopedIntent = this.buildScopedCacheKey(intent, userContext);
    try {
      const cacheHit = await this.semanticCache.check(scopedIntent);
      if (cacheHit) {
        logger.info('[AgentRouter] Semantic cache hit — personalizing for user', {
          operationId,
          score: cacheHit.score,
          cachedIntent: cacheHit.cachedIntent.slice(0, 80),
          userId,
        });

        this.emitUpdate(
          onUpdate,
          operationId,
          'acting',
          'Found a cached answer — personalizing...',
          undefined,
          {
            agentId: 'router',
            stage: 'agent_thinking',
            metadata: { source: 'semantic_cache' },
          }
        );

        // Fast personalizer: rewrites the cached summary for this user's
        // name, sport, position, and role. Uses the `fast` tier (~300ms)
        // instead of re-running the full DAG (~10-15s).
        const personalized = await this.semanticCache.personalize(
          cacheHit.result,
          userContext,
          intent,
          operationId
        );

        this.emitUpdate(onUpdate, operationId, 'completed', personalized.summary, undefined, {
          agentId: 'router',
          stage: 'agent_thinking',
          outcomeCode: 'success_default',
          metadata: { source: 'semantic_cache' },
        });
        return personalized;
      }
    } catch {
      // Cache check is best-effort — continue to the Planner on failure
    }

    // ── Step 2: Plan ──────────────────────────────────────────────────────
    const planningPhaseStartMs = Date.now();
    this.emitUpdate(
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
    this.emitProgressOperation(onStreamEvent, {
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
        capabilitySnapshotPromise = this.buildCapabilitySnapshot(enrichedIntent, toolAccessContext)
          .then((snapshot) => {
            capabilitySnapshotForPlanning = snapshot;
            return snapshot;
          })
          .catch((error) => {
            logger.warn('[AgentRouter] Failed to build capability snapshot for planning', {
              operationId,
              error: error instanceof Error ? error.message : String(error),
            });
            this.emitMetricSample(rawOnStreamEvent, {
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
      this.recordPhaseLatency('planning', planningDurationMs, {
        operationId,
        userId,
        status: 'failed',
      });
      this.emitProgressOperation(onStreamEvent, {
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
      this.emitMetricSample(rawOnStreamEvent, {
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
      this.emitUpdate(onUpdate, operationId, 'failed', `Planning error: ${message}`, undefined, {
        agentId: 'router',
        stage: 'decomposing_intent',
        outcomeCode: 'planning_failed',
      });
      return {
        summary: `Failed to create execution plan: ${message}`,
        suggestions: ['Try rephrasing your request or try again later.'],
      };
    }

    let plan = planResult.data?.['plan'] as AgentExecutionPlan | undefined;

    if (!plan || plan.tasks.length === 0) {
      // ── Chief of Staff Direct Response ───────────────────────────────────
      // The PlannerAgent (Chief of Staff) answered this conversationally
      // rather than creating a coordinator task plan. Emit it directly as
      // agentId: 'router' so the UI renders it as Agent X (green), not as
      // any coordinator. No strategy_coordinator delegation occurs here.
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
      this.recordPhaseLatency('planning', planningDurationMs, {
        operationId,
        userId,
        executionMode: 'chief_of_staff_direct',
      });
      this.emitProgressOperation(onStreamEvent, {
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
      this.emitMetricSample(rawOnStreamEvent, {
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

      this.emitUpdate(onUpdate, operationId, 'completed', safeResponseText, undefined, {
        agentId: 'router',
        stage: 'agent_thinking',
        outcomeCode: 'success_default',
        metadata: { executionMode: 'chief_of_staff_direct' },
      });

      if (onStreamEvent) {
        await this.emitStreamedTextChunks(onStreamEvent, {
          operationId,
          agentId: 'router',
          text: safeResponseText,
          targetChunkSize: 28,
          cadenceMs: 24,
          signal,
        });
      }

      this.emitProgressOperation(onStreamEvent, {
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

      this.appendAssistantMessage(userId, threadId, safeResponseText);
      return { summary: safeResponseText, suggestions: [] };
    }

    this.emitUpdate(
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
    this.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'decomposing_intent',
      message: 'Matching skills and tools for the best execution path...',
      metadata: { eventType: 'progress_subphase', phase: 'planning', status: 'capability_match' },
    });

    if (!capabilitySnapshotForPlanning) {
      capabilitySnapshotForPlanning = await resolveCapabilitySnapshotForPlanning();
    }

    const firstPassPreflight = this.preflightPlan(plan, capabilitySnapshotForPlanning);
    let preflight = firstPassPreflight;
    const firstPlanHash = this.hashExecutionPlan(plan);
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
      const issueCounts = this.summarizePreflightIssueCounts(preflight.issues);
      logger.warn(
        '[AgentRouter] Plan preflight detected unsatisfied tasks; attempting one replan',
        {
          operationId,
          issueSummary,
          issueCounts,
        }
      );

      this.emitUpdate(
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

      const replanIntent = this.buildConstrainedReplanIntent(
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
          const replannedHash = this.hashExecutionPlan(replanned);
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

      preflight = plan ? this.preflightPlan(plan, capabilitySnapshotForPlanning) : preflight;
      replanIssueDelta = this.summarizePreflightIssueDelta(
        firstPassPreflight.issues,
        preflight.issues
      );

      this.emitUpdate(
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
      const issueCounts = this.summarizePreflightIssueCounts(firstPassPreflight.issues);
      const message =
        'Constrained replan did not change the infeasible execution plan. ' +
        `Unsatisfied tasks remain: ${issueSummary}.`;

      this.emitUpdate(onUpdate, operationId, 'failed', message, undefined, {
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
      };
    }

    if (!preflight.feasible) {
      const issueSummary = preflight.issues
        .map((issue) => `${issue.taskId}:${issue.code}`)
        .join(', ');
      const issueCounts = this.summarizePreflightIssueCounts(preflight.issues);
      const message =
        'Planner generated an infeasible execution plan even after one constrained replan. ' +
        `Unsatisfied tasks: ${issueSummary}.`;

      this.emitUpdate(onUpdate, operationId, 'failed', message, undefined, {
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
      };
    }

    this.emitUpdate(
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
    this.recordPhaseLatency('planning', planningDurationMs, {
      operationId,
      userId,
      taskCount: plan.tasks.length,
      plannerPassCount,
    });
    this.emitProgressOperation(onStreamEvent, {
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
    this.emitMetricSample(rawOnStreamEvent, {
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
    this.emitProgressOperation(onStreamEvent, {
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

    // Stream a rich planner card so the frontend renders an interactive checklist
    if (onStreamEvent && plan.tasks.length > 0) {
      onStreamEvent({
        type: 'card',
        cardData: {
          agentId: 'router',
          type: 'planner',
          title: 'Execution Plan',
          payload: {
            items: plan.tasks.map((t) => ({
              id: t.id,
              label: t.description,
              done: false,
            })),
          },
        },
      });
    }

    // ── Step 3: Execute tasks in dependency order ─────────────────────────
    const executionPhaseStartMs = Date.now();
    this.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'agent_thinking',
      message: `Executing ${plan.tasks.length} planned task(s)...`,
      metadata: { eventType: 'progress_stage', phase: 'execution', phaseIndex: 3, phaseTotal: 5 },
    });
    const taskResults = new Map<string, AgentOperationResult>();
    const mutableTasks = plan.tasks.map((t) => ({
      ...t,
      _lastError: undefined as string | undefined,
    })) as MutableAgentTask[];

    while (this.hasPendingTasks(mutableTasks)) {
      // Find tasks whose dependencies are all completed
      const ready = mutableTasks.filter(
        (t) =>
          t.status === 'pending' &&
          t.dependsOn.every(
            (dep) => mutableTasks.find((mt) => mt.id === dep)?.status === 'completed'
          )
      );

      if (ready.length === 0) {
        for (const task of mutableTasks) {
          if (task.status === 'pending') {
            task.status = 'failed' as AgentTaskStatus;
            task._lastError =
              'Execution plan stalled because remaining tasks had unmet dependencies.';
          }
        }
        break;
      }

      // ── Parallel DAG frontier execution ───────────────────────────────────
      // Tasks in `ready` have no remaining dependencies — they can all run
      // concurrently. Capped at 5 to match WORKER_CONCURRENCY and bound LLM load.
      // Each task owns its own status/error mutations (safe in single-threaded JS).
      // cascadeFailure is idempotent so concurrent failures on shared dependents are safe.

      // Mark all frontier tasks as in_progress and announce them before the batch starts.
      for (const task of ready) {
        task.status = 'in_progress' as AgentTaskStatus;
        this.emitUpdate(
          onUpdate,
          operationId,
          'acting',
          `Running task ${task.id}: ${task.description}`,
          { eventType: 'task_started', taskId: task.id },
          {
            agentId: task.assignedAgent,
            stage: 'agent_thinking',
            metadata: { taskId: task.id },
          }
        );
      }

      // Snapshot completedTaskResults for yield exception payloads — consistent
      // across all parallel workers regardless of which task yields first.
      const completedAtBatchStart = Object.fromEntries(
        [...taskResults.entries()].map(([k, v]) => [k, v])
      );

      // Per-task async worker — runs the full retry loop for one DAG task.
      const runTask = async (task: MutableAgentTask): Promise<void> => {
        for (let attempt = 0; attempt <= taskMaxRetries; attempt++) {
          try {
            this.throwIfAborted(signal);

            const assignedAgentId = task.assignedAgent;
            if (!isRoutableCoordinatorAgent(assignedAgentId)) {
              throw new AgentEngineError(
                'AGENT_NOT_REGISTERED',
                `Task "${task.id}" assigned to non-routable agent "${assignedAgentId}". ` +
                  `Allowed coordinators: ${COORDINATOR_AGENT_IDS.join(', ')}.`,
                {
                  metadata: {
                    taskId: task.id,
                    assignedAgentId,
                    allowedAgentIds: COORDINATOR_AGENT_IDS,
                  },
                }
              );
            }

            const agent = this.agents.get(assignedAgentId);
            if (!agent) {
              throw new AgentEngineError(
                'AGENT_NOT_REGISTERED',
                `No agent registered for "${assignedAgentId}".`,
                { metadata: { assignedAgentId, taskId: task.id } }
              );
            }

            let taskIntent = this.buildTaskIntent(task, taskResults, enrichedIntent);

            if (attempt > 0 && task._lastError) {
              taskIntent +=
                `\n\n[System Intervention — Retry ${attempt}/${taskMaxRetries}]\n` +
                `Your previous execution of this task failed with the following error:\n` +
                `"${task._lastError}"\n` +
                `Please formulate an alternative strategy to accomplish this task. ` +
                `Use a different tool, adjust your parameters, or if the task is ` +
                `truly impossible, explain why clearly.`;

              logger.warn('[AgentRouter] Self-correction retry', {
                taskId: task.id,
                agent: task.assignedAgent,
                attempt,
                previousError: task._lastError,
              });

              this.emitUpdate(
                onUpdate,
                operationId,
                'acting',
                `Task ${task.id}: retrying (attempt ${attempt + 1}/${taskMaxRetries + 1})...`,
                { eventType: 'task_retry', taskId: task.id, attempt },
                {
                  agentId: task.assignedAgent,
                  stage: 'agent_thinking',
                  metadata: { taskId: task.id, attempt },
                }
              );
            }

            // Dynamic Tool RAG: filter tools by semantic relevance to this task's intent
            let toolDefs = this.toolRegistry.getDefinitions(agent.id, toolAccessContext);
            try {
              const intentEmbedding = await this.llm.embed(taskIntent);
              toolDefs = await this.toolRegistry.match(
                intentEmbedding,
                (t) => this.llm.embed(t),
                agent.id,
                toolAccessContext
              );
            } catch {
              // Embedding unavailable — fall back to all permitted tools
            }

            const result = await agent.execute(
              taskIntent,
              context,
              toolDefs,
              this.llm,
              this.toolRegistry,
              this.skillRegistry,
              onStreamEvent,
              approvalGate
            );
            this.throwIfAborted(signal);

            taskResults.set(task.id, result);
            task.status = 'completed' as AgentTaskStatus;
            this.emitUpdate(
              onUpdate,
              operationId,
              'acting',
              `Task ${task.id} completed: ${result.summary}`,
              undefined,
              {
                agentId: task.assignedAgent,
                stage: 'agent_thinking',
                metadata: { taskId: task.id },
              }
            );

            // Re-emit the planner card with updated done states.
            if (onStreamEvent) {
              onStreamEvent({
                type: 'card',
                cardData: {
                  agentId: 'router',
                  type: 'planner',
                  title: 'Execution Plan',
                  payload: {
                    items: mutableTasks.map((t) => ({
                      id: t.id,
                      label: t.description,
                      done: t.status === ('completed' as AgentTaskStatus),
                    })),
                  },
                },
              });
            }

            return; // Success — exit retry loop
          } catch (err) {
            if (this.isAbortError(err)) throw err;

            // Attach plan context to yield exceptions so the resume route can
            // reconstruct from the correct DAG snapshot.
            if (isAgentYield(err)) {
              const yieldErr = err as AgentYieldException;
              throw new AgentYieldException({
                ...yieldErr.payload,
                planContext: {
                  currentTaskId: task.id,
                  completedTaskResults: completedAtBatchStart,
                  enrichedIntent,
                },
              });
            }

            // Delegation inside the DAG = mis-routed task.
            // Ask the Planner for the correct specialist and retry the task.
            if (isAgentDelegation(err)) {
              const delErr =
                err as import('./exceptions/agent-delegation.exception.js').AgentDelegationException;
              const originalAgentId = task.assignedAgent as Exclude<AgentIdentifier, 'router'>;
              logger.warn('[AgentRouter] Agent delegated inside DAG — attempting reroute', {
                operationId,
                taskId: task.id,
                sourceAgent: originalAgentId,
                forwardingIntent: delErr.payload.forwardingIntent.slice(0, 100),
              });

              const reroute = await this.rerouteDelegatedTask(
                delErr.payload.forwardingIntent,
                originalAgentId,
                context
              );

              if (reroute) {
                task.assignedAgent = reroute.assignedAgent;
                task.description = reroute.description;
                task._lastError = undefined;

                this.emitUpdate(
                  onUpdate,
                  operationId,
                  'acting',
                  `Task ${task.id} rerouted to ${reroute.assignedAgent}. Retrying...`,
                  {
                    eventType: 'task_retry',
                    taskId: task.id,
                    assignedAgent: reroute.assignedAgent,
                  },
                  {
                    agentId: 'router',
                    stage: 'routing_to_agent',
                    metadata: {
                      taskId: task.id,
                      delegatedFrom: originalAgentId,
                      reroutedTo: reroute.assignedAgent,
                    },
                  }
                );
                continue;
              }

              task._lastError = `Delegated back to router: ${delErr.payload.forwardingIntent}`;
              task.status = 'failed' as AgentTaskStatus;
              this.emitUpdate(
                onUpdate,
                operationId,
                'acting',
                `Task ${task.id} was misrouted — ${originalAgentId} could not handle it.`,
                {
                  eventType: 'task_failed',
                  taskId: task.id,
                  assignedAgent: originalAgentId,
                  error: task._lastError,
                },
                {
                  agentId: 'router',
                  stage: 'routing_to_agent',
                  outcomeCode: 'routing_failed',
                  metadata: {
                    taskId: task.id,
                    delegatedAgentId: originalAgentId,
                  },
                }
              );
              this.cascadeFailure(task.id, mutableTasks);
              return;
            }

            const message = err instanceof Error ? err.message : 'Unknown error';
            task._lastError = message;

            if (attempt === taskMaxRetries) {
              task.status = 'failed' as AgentTaskStatus;
              logger.error('[AgentRouter] Task failed after retries exhausted', {
                operationId,
                taskId: task.id,
                assignedAgent: task.assignedAgent,
                attempts: taskMaxRetries + 1,
                error: message,
              });
              this.emitUpdate(
                onUpdate,
                operationId,
                'acting',
                `Task ${task.id} failed after ${taskMaxRetries + 1} attempts: ${message}`,
                {
                  eventType: 'task_failed',
                  taskId: task.id,
                  assignedAgent: task.assignedAgent,
                  attempts: taskMaxRetries + 1,
                  error: message,
                },
                {
                  agentId: task.assignedAgent,
                  stage: 'agent_thinking',
                  outcomeCode: 'task_failed',
                  metadata: {
                    taskId: task.id,
                    attempts: taskMaxRetries + 1,
                  },
                }
              );
              this.cascadeFailure(task.id, mutableTasks);
            }
          }
        }
      };

      const frontierResults = await parallelBatch(ready, runTask, { concurrency: 5 });

      this.throwIfAborted(signal);

      // Rethrow the first yield exception if any task in this frontier yielded.
      // Yield suspends the entire job, so sibling task results are already in taskResults.
      for (const fr of frontierResults) {
        if (fr.status === 'rejected' && this.isAbortError(fr.reason)) {
          throw fr.reason;
        }
        if (fr.status === 'rejected' && isAgentYield(fr.reason)) {
          throw fr.reason;
        }
      }
    }

    const executionDurationMs = Date.now() - executionPhaseStartMs;
    this.recordPhaseLatency('execution', executionDurationMs, {
      operationId,
      userId,
      taskCount: mutableTasks.length,
      completedTaskCount: taskResults.size,
    });
    this.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'agent_thinking',
      message: `Execution latency: ${executionDurationMs}ms`,
      metadata: {
        eventType: 'metric',
        metricName: 'phase_latency_ms',
        phase: 'execution',
        taskCount: mutableTasks.length,
        completedTaskCount: taskResults.size,
        value: executionDurationMs,
      },
    });
    this.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'agent_thinking',
      message: 'Execution stage complete. Preparing final response...',
      metadata: {
        eventType: 'progress_subphase',
        phase: 'execution',
        status: 'done',
        taskCount: mutableTasks.length,
      },
    });

    // ── Step 4: Aggregate results ─────────────────────────────────────────
    const aggregationPhaseStartMs = Date.now();
    this.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'agent_thinking',
      message: 'Aggregating results...',
      metadata: { eventType: 'progress_stage', phase: 'aggregation', phaseIndex: 4, phaseTotal: 5 },
    });
    const summaries = [...taskResults.values()].map((r) => r.summary);
    const allSuggestions = [...taskResults.values()].flatMap((r) => r.suggestions ?? []);
    const failedTasks = mutableTasks.filter(
      (task): task is MutableAgentTask => task.status === 'failed'
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

      this.emitUpdate(
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
      this.recordPhaseLatency('aggregation', aggregationDurationMs, {
        operationId,
        userId,
        status: 'failed',
      });
      this.emitProgressOperation(onStreamEvent, {
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

    this.emitUpdate(onUpdate, operationId, 'completed', 'All tasks finished.', undefined, {
      agentId: 'router',
      outcomeCode: 'success_default',
    });

    const aggregatedResult: AgentOperationResult = {
      summary: summaries.join('\n\n'),
      data: {
        plan,
        taskResults: Object.fromEntries(taskResults),
      },
      suggestions: allSuggestions.length > 0 ? allSuggestions : undefined,
    };

    // ── Semantic Cache: store the successful result for future cache hits ──
    // Only cache if ALL tasks completed (no partial failures).
    const allCompleted = mutableTasks.every((t) => t.status === 'completed');
    if (allCompleted && taskResults.size > 0) {
      // Fire-and-forget — never block the response for cache storage
      this.semanticCache.store(scopedIntent, aggregatedResult).catch(() => {
        /* noop */
      });
    }

    const aggregationDurationMs = Date.now() - aggregationPhaseStartMs;
    this.recordPhaseLatency('aggregation', aggregationDurationMs, {
      operationId,
      userId,
      status: 'success',
    });
    this.emitProgressOperation(onStreamEvent, {
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
    this.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'agent_thinking',
      message: 'Aggregation complete. Final response ready.',
      metadata: { eventType: 'progress_subphase', phase: 'aggregation', status: 'done' },
    });

    this.appendAssistantMessage(userId, threadId, aggregatedResult.summary);
    return aggregatedResult;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Resume a previously yielded job by re-running the agent with the
   * saved message array (which now includes the user's response).
   */
  private async runResumed(
    payload: AgentJobPayload,
    yieldState: import('@nxt1/core').AgentYieldState,
    onUpdate?: (update: AgentJobUpdate) => void,
    firestore?: FirebaseFirestore.Firestore,
    onStreamEvent?: OnStreamEvent,
    environment: 'staging' | 'production' = 'production',
    signal?: AbortSignal
  ): Promise<AgentOperationResult> {
    const { operationId, userId, intent } = payload;
    this.emitUpdate(onUpdate, operationId, 'acting', 'Resuming from your response...', undefined, {
      agentId: yieldState.agentId,
      stage: 'resuming_user_input',
    });

    // Resolve the agent that was executing when the yield happened
    const agent =
      yieldState.agentId === 'router' ? this.planner : this.agents.get(yieldState.agentId);
    if (!agent) {
      this.emitUpdate(
        onUpdate,
        operationId,
        'failed',
        `Cannot resume: no agent registered for "${yieldState.agentId}".`,
        undefined,
        {
          agentId: 'router',
          stage: 'resuming_user_input',
          outcomeCode: 'routing_failed',
          metadata: { targetAgentId: yieldState.agentId },
        }
      );
      return {
        summary: `Cannot resume: agent "${yieldState.agentId}" is not registered.`,
        suggestions: ['Contact support or try submitting the request again.'],
      };
    }

    // Build user context for the resumed execution
    let userContext: AgentUserContext;
    try {
      userContext = await this.contextBuilder.buildContext(userId, firestore);
    } catch {
      // Non-critical — resume with whatever context we have
      userContext = { userId } as AgentUserContext;
    }

    const resumeContextObj =
      typeof payload.context === 'object' && payload.context !== null ? payload.context : {};
    const resumeThreadId =
      typeof (resumeContextObj as Record<string, unknown>)['threadId'] === 'string'
        ? ((resumeContextObj as Record<string, unknown>)['threadId'] as string)
        : undefined;

    // Hydrate session for runResumed so the agent has prior turn context
    let resumeSessionContext: AgentSessionContext | undefined;
    if (this.sessionMemory) {
      try {
        resumeSessionContext = await this.sessionMemory.getOrCreate(userId, resumeThreadId);
      } catch {
        // Non-critical — continue without history
      }
    }

    const context = this.buildSessionContext(
      userId,
      resumeSessionContext?.sessionId ?? payload.sessionId,
      operationId,
      resumeThreadId,
      environment,
      signal,
      undefined,
      undefined,
      undefined,
      resumeSessionContext?.conversationHistory
    );
    const approvalId =
      typeof (resumeContextObj as Record<string, unknown>)['approvalId'] === 'string'
        ? ((resumeContextObj as Record<string, unknown>)['approvalId'] as string)
        : undefined;
    let resumeActiveThreadsSummary = '';
    try {
      resumeActiveThreadsSummary = await this.contextBuilder.getActiveThreadsSummary(userId, 8);
    } catch {
      // Non-critical — continue without it
    }

    const enrichedIntent = this.enrichIntentWithContext(
      intent,
      userContext,
      payload.context,
      undefined,
      undefined,
      undefined,
      resumeActiveThreadsSummary
    );
    const approvalGate = firestore ? new ApprovalGateService(firestore) : undefined;

    try {
      const toolAccessContext = this.buildToolAccessContext(userContext);
      let toolDefs = this.toolRegistry.getDefinitions(agent.id, toolAccessContext);

      try {
        const intentEmbedding = await this.llm.embed(enrichedIntent);
        toolDefs = await this.toolRegistry.match(
          intentEmbedding,
          (t) => this.llm.embed(t),
          agent.id,
          toolAccessContext
        );
      } catch {
        // Ignore embedding failures during resume and pass all possible tools.
      }

      const result = await agent.resumeExecution(
        yieldState,
        context,
        toolDefs,
        this.llm,
        this.toolRegistry,
        this.skillRegistry,
        onStreamEvent,
        approvalGate,
        approvalId
      );

      this.emitUpdate(onUpdate, operationId, 'completed', result.summary, undefined, {
        agentId: yieldState.agentId,
        stage: 'resuming_user_input',
        outcomeCode: 'success_default',
      });
      this.appendAssistantMessage(userId, resumeThreadId, result.summary);
      return result;
    } catch (err) {
      if (isAgentYield(err)) throw err;
      const message = err instanceof Error ? err.message : 'Resume execution failed';
      this.emitUpdate(onUpdate, operationId, 'failed', message, undefined, {
        agentId: yieldState.agentId,
        stage: 'resuming_user_input',
        outcomeCode: 'task_failed',
      });
      return {
        summary: `Resumed agent "${yieldState.agentId}" failed: ${message}`,
        suggestions: ['Try again later or contact support.'],
      };
    }
  }

  /**
   * Enrich the raw user intent with compressed profile context
   * and any structured job context (e.g. linked account URLs from onboarding).
   * This ensures the planner and sub-agents know who the user is
   * and have all the data needed to execute the request.
   */
  private async buildCapabilitySnapshot(
    intent: string,
    toolAccessContext: AgentToolAccessContext
  ): Promise<AgentPlannerCapabilitySnapshot> {
    let intentEmbedding: readonly number[] | null = null;
    try {
      intentEmbedding = await this.llm.embed(intent);
    } catch {
      intentEmbedding = null;
    }

    const coordinators = await Promise.all(
      COORDINATOR_AGENT_IDS.map(async (agentId) => {
        const registryAllowedTools = this.toolRegistry.getDefinitions(agentId, toolAccessContext);
        const policyAllowedToolNames = this.agents.get(agentId)?.getAvailableTools() ?? [];
        const allowedTools = registryAllowedTools.filter(
          (tool) =>
            tool.category === 'system' || isToolAllowedByPatterns(tool.name, policyAllowedToolNames)
        );
        const allowedToolNames = allowedTools.map((tool) => tool.name).sort();
        const allowedEntityGroups = Array.from(
          new Set(
            allowedTools
              .map((tool) => tool.entityGroup)
              .filter((entityGroup): entityGroup is AgentToolEntityGroup => Boolean(entityGroup))
          )
        ).sort();

        let matchedToolNames: readonly string[] = [];
        if (intentEmbedding && typeof this.toolRegistry.match === 'function') {
          try {
            const matchedTools = await this.toolRegistry.match(
              intentEmbedding,
              (text) => this.llm.embed(text),
              agentId,
              toolAccessContext
            );
            matchedToolNames = matchedTools.map((tool) => tool.name).sort();
          } catch {
            matchedToolNames = [];
          }
        }

        const agent = this.agents.get(agentId);
        const staticSkillHints =
          typeof agent?.getSkills === 'function' ? [...agent.getSkills()].sort() : [];

        let matchedSkillHints: readonly string[] = [];
        if (
          intentEmbedding &&
          staticSkillHints.length > 0 &&
          this.skillRegistry &&
          typeof this.skillRegistry.match === 'function'
        ) {
          try {
            const matchedSkills = await this.skillRegistry.match(
              intentEmbedding,
              (text) => this.llm.embed(text),
              staticSkillHints
            );
            matchedSkillHints = matchedSkills.map((entry) => entry.skill.name).sort();
          } catch {
            matchedSkillHints = [];
          }
        }

        const matchedToolCount = matchedToolNames.length;
        const allowedToolCount = allowedToolNames.length;
        const matchedSkillCount = matchedSkillHints.length;
        const staticSkillCount = staticSkillHints.length;

        return {
          agentId,
          allowedToolNames,
          allowedEntityGroups,
          matchedToolNames,
          staticSkillHints,
          matchedSkillHints,
          confidence: {
            matchedToolCount,
            allowedToolCount,
            toolCoverageRatio:
              allowedToolCount > 0 ? Number((matchedToolCount / allowedToolCount).toFixed(3)) : 0,
            matchedSkillCount,
            staticSkillCount,
            skillCoverageRatio:
              staticSkillCount > 0 ? Number((matchedSkillCount / staticSkillCount).toFixed(3)) : 0,
          },
        } as const;
      })
    );

    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          schemaVersion: CAPABILITY_SNAPSHOT_SCHEMA_VERSION,
          coordinators,
        })
      )
      .digest('hex');

    return {
      schemaVersion: CAPABILITY_SNAPSHOT_SCHEMA_VERSION,
      hash,
      coordinators,
    };
  }

  /**
   * Builds a cache key that is scoped by the user's role and primary sport.
   * Embedding two different plain-English intents that differ only by
   * role/sport would produce very similar vectors, causing cross-user hits.
   * Prefixing with `[role|sport]` shifts the embedding into the correct
   * semantic region so the cosine threshold never bridges role boundaries.
   */
  private buildScopedCacheKey(intent: string, userContext: AgentUserContext | undefined): string {
    const role = userContext?.role ?? 'unknown';
    const sport = userContext?.sport ?? 'general';
    return `[${role}|${sport}] ${intent}`;
  }

  private preflightPlan(
    plan: AgentExecutionPlan,
    capabilitySnapshot?: AgentPlannerCapabilitySnapshot
  ): AgentPlanPreflightResult {
    const issues: AgentPlanPreflightIssue[] = [];

    if (plan.tasks.length > PLAN_PREFLIGHT_LIMITS.maxTasks) {
      issues.push({
        taskId: '__plan__',
        code: 'plan_task_limit_exceeded',
        message:
          `Execution plan contains ${plan.tasks.length} tasks, exceeding the maximum of ` +
          `${PLAN_PREFLIGHT_LIMITS.maxTasks}.`,
      });
    }

    const taskIds = new Set(plan.tasks.map((task) => task.id));
    const seenTaskIds = new Set<string>();
    const coordinatorSnapshotById = new Map(
      (capabilitySnapshot?.coordinators ?? []).map((coordinator) => [
        coordinator.agentId,
        coordinator,
      ])
    );
    const matchedCoordinatorIds = (capabilitySnapshot?.coordinators ?? [])
      .filter(
        (coordinator) =>
          coordinator.matchedToolNames.length > 0 || coordinator.matchedSkillHints.length > 0
      )
      .map((coordinator) => coordinator.agentId);
    const hasMatchedCapabilitySignals = matchedCoordinatorIds.length > 0;

    for (const task of plan.tasks) {
      if (!task.id.trim()) {
        issues.push({
          taskId: task.id,
          code: 'missing_task_id',
          message: 'Execution plan contains a task with an empty id.',
        });
      }

      if (seenTaskIds.has(task.id)) {
        issues.push({
          taskId: task.id,
          code: 'duplicate_task_id',
          message: `Duplicate task id "${task.id}" detected in execution plan.`,
        });
      } else {
        seenTaskIds.add(task.id);
      }
    }

    for (const task of plan.tasks) {
      if (!isRoutableCoordinatorAgent(task.assignedAgent)) {
        issues.push({
          taskId: task.id,
          code: 'non_routable_agent',
          message:
            `Task ${task.id} assigned non-routable agent "${task.assignedAgent}". ` +
            `Allowed coordinators: ${COORDINATOR_AGENT_IDS.join(', ')}.`,
        });
        continue;
      }

      if (!this.agents.has(task.assignedAgent)) {
        issues.push({
          taskId: task.id,
          code: 'agent_not_registered',
          message: `Task ${task.id} assigned to "${task.assignedAgent}" but no agent is registered.`,
        });
      }

      if (hasMatchedCapabilitySignals) {
        const assignedSnapshot = coordinatorSnapshotById.get(task.assignedAgent);
        const assignedHasMatches =
          (assignedSnapshot?.matchedToolNames.length ?? 0) > 0 ||
          (assignedSnapshot?.matchedSkillHints.length ?? 0) > 0;

        if (assignedSnapshot && !assignedHasMatches) {
          issues.push({
            taskId: task.id,
            code: 'capability_mismatch',
            message:
              `Task ${task.id} assigned to "${task.assignedAgent}" which has no matched tools/skills for this request. ` +
              `Matched coordinators: ${matchedCoordinatorIds.join(', ')}.`,
          });
        }
      }

      if (!task.description.trim()) {
        issues.push({
          taskId: task.id,
          code: 'missing_task_description',
          message: `Task ${task.id} has an empty description.`,
        });
      }

      if (task.dependsOn.length > PLAN_PREFLIGHT_LIMITS.maxDependenciesPerTask) {
        issues.push({
          taskId: task.id,
          code: 'task_dependency_limit_exceeded',
          message:
            `Task ${task.id} declares ${task.dependsOn.length} dependencies, exceeding the maximum of ` +
            `${PLAN_PREFLIGHT_LIMITS.maxDependenciesPerTask}.`,
        });
      }

      const seenDependencyIds = new Set<string>();

      for (const depId of task.dependsOn) {
        if (seenDependencyIds.has(depId)) {
          issues.push({
            taskId: task.id,
            code: 'duplicate_dependency',
            message: `Task ${task.id} repeats dependency "${depId}" more than once.`,
          });
          continue;
        }
        seenDependencyIds.add(depId);

        if (depId === task.id) {
          issues.push({
            taskId: task.id,
            code: 'self_dependency',
            message: `Task ${task.id} cannot depend on itself.`,
          });
          continue;
        }

        if (!taskIds.has(depId)) {
          issues.push({
            taskId: task.id,
            code: 'unknown_dependency',
            message: `Task ${task.id} depends on unknown task "${depId}".`,
          });
        }
      }
    }

    const cyclePath = this.findDependencyCycle(plan.tasks);
    if (cyclePath && cyclePath.length > 1) {
      issues.push({
        taskId: cyclePath[0] ?? 'unknown',
        code: 'circular_dependency',
        message: `Circular dependency detected: ${cyclePath.join(' -> ')}.`,
      });
    }

    return {
      feasible: issues.length === 0,
      issues,
    };
  }

  private findDependencyCycle(tasks: readonly AgentTask[]): string[] | null {
    const taskIds = new Set(tasks.map((task) => task.id));
    const adjacency = new Map<string, readonly string[]>();

    for (const task of tasks) {
      if (!adjacency.has(task.id)) {
        adjacency.set(task.id, task.dependsOn);
      }
    }

    const visited = new Set<string>();
    const visiting = new Set<string>();
    const pathStack: string[] = [];

    const dfs = (taskId: string): string[] | null => {
      if (visiting.has(taskId)) {
        const startIndex = pathStack.indexOf(taskId);
        if (startIndex >= 0) {
          return [...pathStack.slice(startIndex), taskId];
        }
        return [taskId, taskId];
      }

      if (visited.has(taskId)) {
        return null;
      }

      visiting.add(taskId);
      pathStack.push(taskId);

      const deps = adjacency.get(taskId) ?? [];
      for (const depId of deps) {
        if (!taskIds.has(depId)) {
          continue;
        }
        const cycle = dfs(depId);
        if (cycle) {
          return cycle;
        }
      }

      pathStack.pop();
      visiting.delete(taskId);
      visited.add(taskId);
      return null;
    };

    for (const task of tasks) {
      const cycle = dfs(task.id);
      if (cycle) {
        return cycle;
      }
    }

    return null;
  }

  private buildConstrainedReplanIntent(
    enrichedIntent: string,
    plan: AgentExecutionPlan,
    issues: readonly AgentPlanPreflightIssue[]
  ): string {
    const issueList = issues
      .map(
        (issue, index) => `${index + 1}. [${issue.code}] task=${issue.taskId} :: ${issue.message}`
      )
      .join('\n');

    return [
      enrichedIntent,
      '',
      '[Planner Guardrail Feedback]',
      'Your previous plan was infeasible. Generate a corrected plan that satisfies all constraints.',
      'Do not use non-coordinator agents. Do not reference missing dependencies. Keep tasks executable.',
      `Previous plan: ${JSON.stringify(plan)}`,
      'Preflight issues:',
      issueList,
    ].join('\n');
  }

  private hashExecutionPlan(plan: AgentExecutionPlan): string {
    return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  }

  private summarizePreflightIssueCounts(
    issues: readonly AgentPlanPreflightIssue[]
  ): Record<string, number> {
    return issues.reduce<Record<string, number>>((counts, issue) => {
      counts[issue.code] = (counts[issue.code] ?? 0) + 1;
      return counts;
    }, {});
  }

  private summarizePreflightIssueDelta(
    before: readonly AgentPlanPreflightIssue[],
    after: readonly AgentPlanPreflightIssue[]
  ): {
    readonly beforeCount: number;
    readonly afterCount: number;
    readonly resolved: readonly string[];
    readonly introduced: readonly string[];
    readonly persisted: readonly string[];
  } {
    const beforeSet = new Set(before.map((issue) => `${issue.taskId}:${issue.code}`));
    const afterSet = new Set(after.map((issue) => `${issue.taskId}:${issue.code}`));

    const resolved = [...beforeSet].filter((signature) => !afterSet.has(signature)).sort();
    const introduced = [...afterSet].filter((signature) => !beforeSet.has(signature)).sort();
    const persisted = [...afterSet].filter((signature) => beforeSet.has(signature)).sort();

    return {
      beforeCount: before.length,
      afterCount: after.length,
      resolved,
      introduced,
      persisted,
    };
  }

  private enrichIntentWithContext(
    intent: string,
    userContext: AgentUserContext,
    jobContext?: Record<string, unknown>,
    threadHistory?: string,
    memories: AgentRetrievedMemories = { user: [], team: [], organization: [] },
    recentSyncSummaries: readonly string[] = [],
    activeThreadsSummary?: string
  ): string {
    const contextStr = this.contextBuilder.compressToPrompt(
      userContext,
      memories,
      recentSyncSummaries
    );
    let enriched = `[User Profile]\n${contextStr}`;

    // Inject structured job context so the LLM has URLs, platform names, etc.
    if (jobContext && Object.keys(jobContext).length > 0) {
      // Exclude internal/system keys — these are not useful LLM context
      const {
        threadId: _threadId,
        mode: _mode,
        attachments: _attachments,
        ...visibleContext
      } = jobContext;
      if (Object.keys(visibleContext).length > 0) {
        let contextMd = '\n\n[Job Context]\n';
        for (const [key, value] of Object.entries(visibleContext)) {
          const formatted = typeof value === 'object' ? JSON.stringify(value) : String(value);
          contextMd += `- **${key}**: ${formatted}\n`;
        }
        enriched += contextMd;
      }
    }

    // Inject cross-thread conversation awareness (recent session titles)
    if (activeThreadsSummary) {
      enriched += `\n\n[Recent Conversation Topics]${activeThreadsSummary}`;
    }

    // Inject current thread's message history for in-session continuity
    if (threadHistory) {
      enriched += `\n${threadHistory}`;
    }

    enriched += `\n\n[Request]\n${intent}`;
    return enriched;
  }

  private async tryConversationalRoute(payload: {
    readonly payload: AgentJobPayload;
    readonly context: AgentSessionContext;
    readonly threadId?: string;
    readonly firestore?: FirebaseFirestore.Firestore;
    readonly onUpdate?: (update: AgentJobUpdate) => void;
    readonly onStreamEvent?: OnStreamEvent;
    readonly environment: 'staging' | 'production';
    readonly signal?: AbortSignal;
  }): Promise<ConversationRouteOutcome> {
    const {
      payload: jobPayload,
      context,
      threadId,
      firestore,
      onUpdate,
      onStreamEvent,
      signal,
    } = payload;
    const { operationId, userId, intent } = jobPayload;
    const conversationalPhaseStartMs = Date.now();

    const cacheKey = this.buildConversationalCacheKey(context, intent);
    const cached = this.conversationalResponseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const cachedResponse = await this.emitConversationalResponse({
        operationId,
        userId,
        threadId,
        responseText: cached.result.summary,
        onUpdate,
        onStreamEvent,
        signal,
        cacheSource: 'conversation_cache',
      });

      this.recordConversationalRouteLatency(
        operationId,
        userId,
        Date.now() - conversationalPhaseStartMs,
        'chat_cache_hit',
        [],
        true,
        onStreamEvent
      );

      return { kind: 'handled', result: cachedResponse };
    }

    this.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'agent_thinking',
      message: 'Understanding whether this needs conversation context or a full plan...',
      metadata: {
        eventType: 'progress_stage',
        phase: 'conversation_triage',
        phaseIndex: 1,
        phaseTotal: 2,
      },
    });

    const routeDecision = await this.getConversationRouteDecision(intent, context);
    if (!routeDecision) {
      this.emitMetricSample(onStreamEvent, {
        operationId,
        stage: 'agent_thinking',
        metricName: 'fallback_activation',
        value: 1,
        message: 'Fallback activated: conversational triage failed open.',
        metadata: {
          phase: 'conversation_triage',
          fallbackType: 'conversation_triage_fail_open',
        },
        sampleContext: {
          operationId,
          userId,
        },
      });
      return { kind: 'fallthrough' };
    }

    if (routeDecision.route === 'plan') {
      const planSummary =
        routeDecision.planSummary?.trim() || 'handle this request with specialist execution';
      const planningPrelude = sanitizeAgentOutputText(
        `I see you want to ${planSummary}. Let me put a plan together for this.`
      );
      if (onStreamEvent) {
        await this.emitStreamedTextChunks(onStreamEvent, {
          operationId,
          agentId: 'router',
          text: planningPrelude,
          targetChunkSize: 28,
          cadenceMs: 24,
          signal,
        });
      }
      this.emitProgressOperation(onStreamEvent, {
        operationId,
        stage: 'decomposing_intent',
        message: planningPrelude,
        metadata: {
          eventType: 'progress_subphase',
          phase: 'conversation_triage',
          route: 'plan',
        },
      });
      this.recordConversationalRouteLatency(
        operationId,
        userId,
        Date.now() - conversationalPhaseStartMs,
        'planning_escalation',
        [],
        false,
        onStreamEvent
      );
      return { kind: 'escalate_to_planning' };
    }

    const requiredContextScopes = Array.from(new Set(routeDecision.requiredContextScopes));
    if (requiredContextScopes.length === 0 && routeDecision.directResponse?.trim()) {
      const response = await this.emitConversationalResponse({
        operationId,
        userId,
        threadId,
        responseText: routeDecision.directResponse,
        onUpdate,
        onStreamEvent,
        signal,
        cacheSource: 'triage_direct',
      });
      this.storeConversationalCache(
        cacheKey,
        response,
        this.shouldCacheConversationalResponse(context, requiredContextScopes)
      );
      this.recordConversationalRouteLatency(
        operationId,
        userId,
        Date.now() - conversationalPhaseStartMs,
        'chat_no_context',
        requiredContextScopes,
        true,
        onStreamEvent
      );
      return { kind: 'handled', result: response };
    }

    const scopedContext = await this.resolveConversationContextScopes(
      userId,
      intent,
      requiredContextScopes,
      threadId,
      firestore
    );
    const scopedContextText = this.buildConversationalContextText(scopedContext);
    const contextualResponse = await this.generateContextualConversationResponse(
      intent,
      scopedContextText,
      context
    );

    const response = await this.emitConversationalResponse({
      operationId,
      userId,
      threadId,
      responseText: contextualResponse,
      onUpdate,
      onStreamEvent,
      signal,
      cacheSource: requiredContextScopes.every((scope) => scope === 'profile')
        ? 'contextual_profile'
        : 'live',
    });

    const shouldCache = this.shouldCacheConversationalResponse(context, requiredContextScopes);
    this.storeConversationalCache(cacheKey, response, shouldCache);
    this.recordConversationalRouteLatency(
      operationId,
      userId,
      Date.now() - conversationalPhaseStartMs,
      requiredContextScopes.length === 0 ? 'chat_no_context' : 'chat_contextual',
      requiredContextScopes,
      shouldCache,
      onStreamEvent
    );

    return { kind: 'handled', result: response };
  }

  private async getConversationRouteDecision(
    intent: string,
    context: AgentSessionContext
  ): Promise<ConversationRouteDecision | null> {
    const deterministicDecision = this.getDeterministicConversationRouteDecision(intent, context);
    if (deterministicDecision) {
      return deterministicDecision;
    }

    const systemPrompt = `You are Agent X's conversation triage layer. Decide whether the user should receive a direct conversational response now or whether this request requires specialist planning.

Respond with JSON only.

Rules:
- route="chat" when the user is asking a question, wants guidance, wants platform help, wants a conversational explanation, or needs context-aware advice.
- route="plan" only when the user wants Agent X to perform specialist work or execute an operation such as outreach, film analysis, graphics/content generation, reporting, list building, posting, or multi-step coordination.
- requiredContextScopes should include only the minimum scopes needed for a high-quality conversational answer.
- Available scopes: profile, thread_history, active_threads, memories, recent_sync.
- directResponse should only be present when route="chat" and no additional context is needed.
- planSummary should only be present when route="plan" and should be a short plain-English description of the requested work.
- For bare greetings, acknowledgements, identity questions, and general openers, do NOT request profile or memory context. Use route="chat", requiredContextScopes=[], and provide directResponse.
- Do NOT request profile context just to make a response warmer or more personalized. Request profile only when the user's question actually depends on knowing their role, sport, position, goals, or account state.
- If the user can be answered well without retrieved context, prefer directResponse with requiredContextScopes=[].
- Examples that should stay no-context chat: \"hi\", \"hello\", \"thanks\", \"who are you\", \"what is Agent X\", \"what can you do\".
- Examples that may need profile context: \"how can you help me\", \"what should I work on\", \"what should I focus on next\", \"what features do I have access to\".`;

    try {
      const result = await this.llm.prompt(systemPrompt, intent, {
        tier: 'chat',
        maxTokens: 300,
        temperature: 0.2,
        timeoutMs: 6_000,
        outputSchema: {
          name: 'conversation_route_decision',
          schema: conversationRouteDecisionSchema,
        },
        ...(context.operationId && {
          telemetryContext: {
            operationId: context.operationId,
            userId: context.userId,
            agentId: 'router',
          },
        }),
      });

      const parsed = conversationRouteDecisionSchema.safeParse(result.parsedOutput);
      if (parsed.success) {
        return parsed.data;
      }

      if (this.looksLikePlannerPayload(result.parsedOutput)) {
        return {
          route: 'plan',
          requiredContextScopes: [],
          directResponse: null,
          planSummary:
            this.extractPlannerSummary(result.parsedOutput) ??
            'handle this request with specialist execution',
        };
      }

      if (this.looksLikeIntentClassificationPayload(result.parsedOutput)) {
        const fallback = this.extractIntentClassificationFallback(result.parsedOutput);
        if (fallback) {
          return fallback;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private getDeterministicConversationRouteDecision(
    intent: string,
    context: AgentSessionContext
  ): ConversationRouteDecision | null {
    if (!this.isSelfKnowledgeIntent(intent)) {
      return null;
    }

    const requiredContextScopes: ConversationRouteScope[] = [
      'profile',
      'memories',
      'recent_sync',
      'active_threads',
      ...(context.threadId ? (['thread_history'] as const) : []),
    ];

    return {
      route: 'chat',
      requiredContextScopes,
      directResponse: null,
      planSummary: null,
    };
  }

  private isSelfKnowledgeIntent(intent: string): boolean {
    const normalizedIntent = intent.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!normalizedIntent) {
      return false;
    }

    const selfKnowledgePhrases = [
      'what do you know about me',
      'what all do you know about me',
      'tell me what you know about me',
      'what do you remember about me',
      'what have you learned about me',
      'what have i told you about me',
      'what information do you have about me',
      'what info do you have about me',
      'what context do you have about me',
    ];

    return selfKnowledgePhrases.some((phrase) => normalizedIntent.includes(phrase));
  }

  private looksLikePlannerPayload(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    const tasks = candidate['tasks'];
    return Array.isArray(tasks) && tasks.length > 0;
  }

  private extractPlannerSummary(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    const summary = candidate['summary'];
    return typeof summary === 'string' && summary.trim().length > 0 ? summary.trim() : null;
  }

  private looksLikeIntentClassificationPayload(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate['isConversational'] === 'boolean';
  }

  private extractIntentClassificationFallback(value: unknown): ConversationRouteDecision | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    const isConversational = candidate['isConversational'];
    if (typeof isConversational !== 'boolean') return null;

    if (isConversational) {
      const directResponse =
        typeof candidate['directResponse'] === 'string' ? candidate['directResponse'] : null;
      return {
        route: 'chat',
        requiredContextScopes: [],
        directResponse,
        planSummary: null,
      };
    }

    return {
      route: 'plan',
      requiredContextScopes: [],
      directResponse: null,
      planSummary: null,
    };
  }

  private async resolveConversationContextScopes(
    userId: string,
    intent: string,
    scopes: readonly ConversationRouteScope[],
    threadId: string | undefined,
    firestore?: FirebaseFirestore.Firestore
  ): Promise<{
    readonly profile?: AgentUserContext;
    readonly memories: AgentRetrievedMemories;
    readonly recentSyncSummaries: readonly string[];
    readonly threadHistory: string;
    readonly activeThreadsSummary: string;
  }> {
    const normalizedScopes = new Set(scopes);
    const needsProfile =
      normalizedScopes.has('profile') ||
      normalizedScopes.has('memories') ||
      normalizedScopes.has('recent_sync');

    const profile = needsProfile
      ? await this.contextBuilder.buildContext(userId, firestore)
      : undefined;

    const memoriesPromise =
      normalizedScopes.has('memories') && profile
        ? this.contextBuilder.getMemoriesForContext(profile, intent)
        : Promise.resolve(EMPTY_RETRIEVED_MEMORIES);
    const recentSyncPromise =
      normalizedScopes.has('recent_sync') && profile
        ? this.contextBuilder.getRecentSyncSummariesForContext(profile)
        : Promise.resolve([] as readonly string[]);
    const threadHistoryPromise =
      normalizedScopes.has('thread_history') && threadId
        ? this.contextBuilder.getRecentThreadHistory(threadId, 20)
        : Promise.resolve('');
    const activeThreadsPromise = normalizedScopes.has('active_threads')
      ? this.contextBuilder.getActiveThreadsSummary(userId, 8)
      : Promise.resolve('');

    const [memories, recentSyncSummaries, threadHistory, activeThreadsSummary] = await Promise.all([
      memoriesPromise,
      recentSyncPromise,
      threadHistoryPromise,
      activeThreadsPromise,
    ]);

    return {
      profile,
      memories,
      recentSyncSummaries,
      threadHistory,
      activeThreadsSummary,
    };
  }

  private buildConversationalContextText(context: {
    readonly profile?: AgentUserContext;
    readonly memories: AgentRetrievedMemories;
    readonly recentSyncSummaries: readonly string[];
    readonly threadHistory: string;
    readonly activeThreadsSummary: string;
  }): string {
    const sections: string[] = [];

    if (context.profile) {
      sections.push(
        `[User Context]\n${this.contextBuilder.compressToPrompt(
          context.profile,
          context.memories,
          context.recentSyncSummaries
        )}`
      );
    }

    if (context.activeThreadsSummary) {
      sections.push(`[Recent Conversation Topics]${context.activeThreadsSummary}`);
    }

    if (context.threadHistory) {
      sections.push(context.threadHistory.trim());
    }

    return sections.join('\n\n');
  }

  private async generateContextualConversationResponse(
    intent: string,
    scopedContextText: string,
    context: AgentSessionContext
  ): Promise<string> {
    const systemPrompt = `You are Agent X, NXT1's AI sports assistant. Answer the user conversationally using provided context when it is relevant. Stay concise, grounded, and practical. Do not create plans, tool calls, or coordinator tasks unless explicitly instructed; the routing layer already chose conversational handling for this message. Never invent profile details that are not in the provided context.`;

    const userMessage = scopedContextText
      ? `${scopedContextText}\n\n[User Message]\n${intent}`
      : intent;

    const result = await this.llm.prompt(systemPrompt, userMessage, {
      tier: 'chat',
      maxTokens: 512,
      temperature: 0.4,
      timeoutMs: 8_000,
      ...(context.operationId && {
        telemetryContext: {
          operationId: context.operationId,
          userId: context.userId,
          agentId: 'router',
        },
      }),
    });

    return sanitizeAgentOutputText(result.content || "I'm here and ready to help.");
  }

  private async emitConversationalResponse(payload: {
    readonly operationId: string;
    readonly userId: string;
    readonly threadId?: string;
    readonly responseText: string;
    readonly onUpdate?: (update: AgentJobUpdate) => void;
    readonly onStreamEvent?: OnStreamEvent;
    readonly signal?: AbortSignal;
    readonly cacheSource: string;
  }): Promise<AgentOperationResult> {
    const safeResponseText = sanitizeAgentOutputText(payload.responseText);
    this.emitUpdate(
      payload.onUpdate,
      payload.operationId,
      'completed',
      safeResponseText,
      undefined,
      {
        agentId: 'router',
        stage: 'agent_thinking',
        outcomeCode: 'success_default',
        metadata: { executionMode: 'conversation', source: payload.cacheSource },
      }
    );

    if (payload.onStreamEvent) {
      await this.emitStreamedTextChunks(payload.onStreamEvent, {
        operationId: payload.operationId,
        agentId: 'router',
        text: safeResponseText,
        targetChunkSize: 28,
        cadenceMs: 24,
        signal: payload.signal,
      });
    }

    this.appendAssistantMessage(payload.userId, payload.threadId, safeResponseText);
    return { summary: safeResponseText, suggestions: [] };
  }

  private buildConversationalCacheKey(context: AgentSessionContext, intent: string): string {
    const normalizedIntent = intent.trim().toLowerCase().replace(/\s+/g, ' ');
    const intentHash = createHash('sha1').update(normalizedIntent).digest('hex');
    const mode = context.mode?.trim().toLowerCase() ?? 'default';
    const threadId = context.threadId?.trim() ?? 'no-thread';
    const environment = context.environment ?? 'unknown';
    return `${context.userId}:${mode}:${environment}:${threadId}:${intentHash}`;
  }

  private shouldCacheConversationalResponse(
    context: AgentSessionContext,
    scopes: readonly ConversationRouteScope[]
  ): boolean {
    if ((context.attachments?.length ?? 0) > 0 || (context.videoAttachments?.length ?? 0) > 0) {
      return false;
    }

    if (scopes.length === 0) {
      return true;
    }

    return scopes.every((scope) => scope === 'profile');
  }

  private storeConversationalCache(
    cacheKey: string,
    result: AgentOperationResult,
    shouldCache: boolean
  ): void {
    if (!shouldCache) {
      return;
    }

    this.pruneConversationalCache();
    this.conversationalResponseCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + CONVERSATIONAL_CACHE_TTL_MS,
    });
  }

  private recordConversationalRouteLatency(
    operationId: string,
    userId: string,
    durationMs: number,
    routeType: 'chat_cache_hit' | 'chat_no_context' | 'chat_contextual' | 'planning_escalation',
    scopes: readonly ConversationRouteScope[],
    cacheEligible: boolean,
    onStreamEvent?: OnStreamEvent
  ): void {
    this.recordPhaseLatency('conversation_triage', durationMs, {
      operationId,
      userId,
      routeType,
      contextScopes: scopes,
      cacheEligible,
    });

    this.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: routeType === 'planning_escalation' ? 'decomposing_intent' : 'agent_thinking',
      message: `Conversation triage latency: ${Math.max(0, Math.round(durationMs))}ms`,
      metadata: {
        eventType: 'metric',
        metricName: 'phase_latency_ms',
        phase: 'conversation_triage',
        routeType,
        contextScopes: scopes,
        cacheEligible,
        value: Math.max(0, Math.round(durationMs)),
      },
    });
  }

  private pruneConversationalCache(): void {
    const now = Date.now();
    for (const [key, value] of this.conversationalResponseCache) {
      if (value.expiresAt <= now) {
        this.conversationalResponseCache.delete(key);
      }
    }

    while (this.conversationalResponseCache.size > CONVERSATIONAL_CACHE_MAX_ENTRIES) {
      const oldestKey = this.conversationalResponseCache.keys().next().value;
      if (!oldestKey) break;
      this.conversationalResponseCache.delete(oldestKey);
    }
  }

  private hasPendingTasks(tasks: readonly (AgentTask & { status: AgentTaskStatus })[]): boolean {
    return tasks.some((t) => t.status === 'pending');
  }

  /**
   * Build the intent string for a sub-task, injecting:
   * 1. The original enriched context (user profile, linked account URLs, job metadata).
   * 2. Results from upstream dependency tasks.
   * 3. The task's own description.
   *
   * This ensures every sub-agent has the full context it needs — especially
   * URLs, userId, sport, and other structured data from the job context.
   */
  private buildTaskIntent(
    task: AgentTask,
    upstreamResults: Map<string, AgentOperationResult>,
    enrichedContext?: string
  ): string {
    const parts: string[] = [];

    // Include the original enriched context so sub-agents have user profile,
    // linked account URLs, userId, sport, and other job metadata.
    if (enrichedContext) {
      parts.push(enrichedContext);
    }

    // Include results from upstream dependency tasks
    if (task.dependsOn.length > 0) {
      for (const depId of task.dependsOn) {
        const depResult = upstreamResults.get(depId);
        if (depResult) {
          parts.push(`[Result from task ${depId}]: ${depResult.summary}`);
        }
      }
    }

    // The specific task instruction
    parts.push(`[Current Task]\n${task.description}`);

    return parts.join('\n\n');
  }

  /** Build a minimal session context. */
  private buildSessionContext(
    userId: string,
    sessionId?: string,
    operationId?: string,
    threadId?: string,
    environment?: 'staging' | 'production',
    signal?: AbortSignal,
    mode?: string,
    attachments?: readonly { readonly url: string; readonly mimeType: string }[],
    videoAttachments?: readonly {
      readonly url: string;
      readonly mimeType: string;
      readonly name: string;
    }[],
    conversationHistory?: readonly AgentSessionMessage[]
  ): AgentSessionContext {
    const now = new Date().toISOString();
    return {
      sessionId: sessionId ?? crypto.randomUUID(),
      userId,
      conversationHistory: conversationHistory ?? [],
      createdAt: now,
      lastActiveAt: now,
      ...(environment && { environment }),
      ...(operationId && { operationId }),
      ...(threadId && { threadId }),
      ...(mode && { mode }),
      ...(attachments?.length && { attachments }),
      ...(videoAttachments?.length && { videoAttachments }),
      ...(signal && { signal }),
    };
  }

  /**
   * Fire-and-forget helper to persist the assistant's reply to Redis session memory.
   * Never blocks the response — failures are logged as warnings only.
   */
  private appendAssistantMessage(
    userId: string,
    threadId: string | undefined,
    summary: string
  ): void {
    if (!this.sessionMemory || !threadId) return;
    this.sessionMemory
      .appendMessage(userId, threadId, {
        role: 'assistant',
        content: summary,
        timestamp: new Date().toISOString(),
      })
      .catch((err) => {
        logger.warn('[AgentRouter] Failed to append assistant message to session', {
          userId,
          threadId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }

  private async emitStreamedTextChunks(
    onStreamEvent: OnStreamEvent,
    payload: {
      readonly operationId: string;
      readonly agentId: AgentIdentifier;
      readonly text: string;
      readonly targetChunkSize?: number;
      readonly cadenceMs?: number;
      readonly signal?: AbortSignal;
    }
  ): Promise<void> {
    const chunks = this.chunkTextForStreaming(payload.text, payload.targetChunkSize ?? 24);
    const cadenceMs = Math.max(12, payload.cadenceMs ?? 24);

    for (let i = 0; i < chunks.length; i += 1) {
      if (payload.signal?.aborted) return;

      const chunk = chunks[i];
      if (!chunk) continue;

      onStreamEvent({
        type: 'delta',
        agentId: payload.agentId,
        operationId: payload.operationId,
        text: chunk,
        noBatch: true,
      });

      if (i < chunks.length - 1) {
        await this.waitForChunkCadence(cadenceMs, payload.signal);
      }
    }
  }

  private async waitForChunkCadence(delayMs: number, signal?: AbortSignal): Promise<void> {
    if (delayMs <= 0) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, delayMs);

      const onAbort = () => {
        clearTimeout(timer);
        cleanup();
        resolve();
      };

      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort);
      };

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private chunkTextForStreaming(text: string, targetChunkSize = 24): readonly string[] {
    const normalized = sanitizeAgentOutputText(text).trim();
    if (!normalized) return [];

    const words = normalized.split(/\s+/).filter((word) => word.length > 0);
    if (words.length <= 1) return [normalized];

    const chunks: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current.length > 0 ? `${current} ${word}` : word;
      if (candidate.length > targetChunkSize && current.length > 0) {
        chunks.push(`${current} `);
        current = word;
      } else {
        current = candidate;
      }
    }

    if (current.length > 0) {
      chunks.push(current);
    }

    return chunks;
  }

  /** Emit a step update to the onUpdate callback (for SSE / Firestore). */
  private emitUpdate(
    onUpdate: ((update: AgentJobUpdate) => void) | undefined,
    operationId: string,
    status: AgentJobUpdate['status'],
    message: string,
    payload?: Record<string, unknown>,
    structured?: {
      readonly agentId?: AgentIdentifier;
      readonly stage?: AgentRouterStage;
      readonly outcomeCode?: OperationOutcomeCode;
      readonly metadata?: AgentProgressMetadata;
    }
  ): void {
    if (!onUpdate) return;
    onUpdate({
      operationId,
      status,
      agentId: structured?.agentId,
      stageType: structured?.stage ? 'router' : undefined,
      stage: structured?.stage,
      outcomeCode: structured?.outcomeCode,
      metadata: structured?.metadata,
      step: {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        status,
        message,
        agentId: structured?.agentId,
        stageType: structured?.stage ? 'router' : undefined,
        stage: structured?.stage,
        outcomeCode: structured?.outcomeCode,
        metadata: structured?.metadata,
        payload,
      },
    });
  }

  private emitProgressOperation(
    onStreamEvent: OnStreamEvent | undefined,
    payload: {
      readonly operationId: string;
      readonly message: string;
      readonly stage?: AgentProgressStage;
      readonly status?:
        | 'queued'
        | 'running'
        | 'paused'
        | 'awaiting_input'
        | 'awaiting_approval'
        | 'complete'
        | 'failed'
        | 'cancelled';
      readonly metadata?: AgentProgressMetadata;
    }
  ): void {
    if (!onStreamEvent) return;

    const metadataEventType =
      typeof payload.metadata?.['eventType'] === 'string'
        ? (payload.metadata['eventType'] as string)
        : undefined;
    const progressEventType =
      metadataEventType === 'progress_stage' ||
      metadataEventType === 'progress_subphase' ||
      metadataEventType === 'metric'
        ? metadataEventType
        : undefined;
    const messageKey = this.buildProgressMessageKey(
      payload.stage ?? 'agent_thinking',
      payload.metadata
    );

    onStreamEvent({
      type: 'operation',
      operationId: payload.operationId,
      status: payload.status ?? 'running',
      agentId: 'router',
      messageKey,
      stageType: 'router',
      stage: payload.stage ?? 'agent_thinking',
      message: payload.message,
      metadata: payload.metadata,
      timestamp: new Date().toISOString(),
    });

    if (!progressEventType) return;

    onStreamEvent({
      type: progressEventType,
      operationId: payload.operationId,
      status: payload.status ?? 'running',
      agentId: 'router',
      messageKey,
      stageType: 'router',
      stage: payload.stage ?? 'agent_thinking',
      message: payload.message,
      metadata: payload.metadata,
      timestamp: new Date().toISOString(),
    });
  }

  private buildProgressMessageKey(
    stage: AgentProgressStage,
    metadata?: AgentProgressMetadata
  ): string {
    const explicitMessageKey =
      typeof metadata?.['messageKey'] === 'string' ? metadata['messageKey'] : undefined;
    if (explicitMessageKey) {
      return explicitMessageKey;
    }

    const eventType =
      typeof metadata?.['eventType'] === 'string' ? metadata['eventType'] : undefined;
    const metricName =
      typeof metadata?.['metricName'] === 'string' ? metadata['metricName'] : undefined;
    const phase = typeof metadata?.['phase'] === 'string' ? metadata['phase'] : undefined;
    const status = typeof metadata?.['status'] === 'string' ? metadata['status'] : undefined;

    if (eventType === 'metric' && metricName) {
      return `agent.metric.${this.toMessageKeySegment(metricName)}`;
    }

    if (phase && status) {
      return `agent.progress.${this.toMessageKeySegment(phase)}.${this.toMessageKeySegment(status)}`;
    }

    if (phase) {
      return `agent.progress.${this.toMessageKeySegment(phase)}`;
    }

    return `agent.progress.${this.toMessageKeySegment(stage)}`;
  }

  private toMessageKeySegment(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private recordPhaseLatency(
    phase: string,
    durationMs: number,
    context?: Readonly<Record<string, unknown>>
  ): void {
    if (!Number.isFinite(durationMs)) return;

    const safeDurationMs = Math.max(0, Math.round(durationMs));
    const samples = this.phaseLatencySamples.get(phase) ?? [];
    samples.push(safeDurationMs);
    if (samples.length > 100) {
      samples.shift();
    }
    this.phaseLatencySamples.set(phase, samples);

    const averageMs = Math.round(samples.reduce((acc, value) => acc + value, 0) / samples.length);

    logger.info('[AgentRouter] Phase latency sample', {
      phase,
      durationMs: safeDurationMs,
      averageMs,
      sampleCount: samples.length,
      ...(context ?? {}),
    });
  }

  private emitMetricSample(
    onStreamEvent: OnStreamEvent | undefined,
    payload: {
      readonly operationId: string;
      readonly stage: AgentProgressStage;
      readonly metricName: string;
      readonly value: number;
      readonly message: string;
      readonly metadata?: AgentProgressMetadata;
      readonly sampleContext?: Readonly<Record<string, unknown>>;
    }
  ): void {
    if (!Number.isFinite(payload.value)) return;

    const safeValue = Math.max(0, Math.round(payload.value));
    this.recordOperationMetric(payload.metricName, safeValue, payload.sampleContext);

    this.emitProgressOperation(onStreamEvent, {
      operationId: payload.operationId,
      stage: payload.stage,
      message: payload.message,
      metadata: {
        eventType: 'metric',
        metricName: payload.metricName,
        value: safeValue,
        ...(payload.metadata ?? {}),
      },
    });
  }

  private recordOperationMetric(
    metricName: string,
    value: number,
    context?: Readonly<Record<string, unknown>>
  ): void {
    if (!Number.isFinite(value)) return;

    const safeValue = Math.max(0, Math.round(value));
    const samples = this.metricSamples.get(metricName) ?? [];
    samples.push(safeValue);
    if (samples.length > 100) {
      samples.shift();
    }
    this.metricSamples.set(metricName, samples);

    const averageValue = Math.round(
      samples.reduce((acc, sample) => acc + sample, 0) / samples.length
    );

    logger.info('[AgentRouter] Metric sample', {
      metricName,
      value: safeValue,
      averageValue,
      sampleCount: samples.length,
      ...(context ?? {}),
    });
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

  /**
   * Cascade 'failed' status to all tasks that directly or transitively
   * depend on a failed task, so they are not left as 'pending' forever.
   */
  private cascadeFailure(
    failedTaskId: string,
    tasks: Array<AgentTask & { status: AgentTaskStatus }>
  ): void {
    const queue = [failedTaskId];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const task of tasks) {
        if (task.status === 'pending' && task.dependsOn.includes(currentId)) {
          task.status = 'failed' as AgentTaskStatus;
          queue.push(task.id);
        }
      }
    }
  }

  private buildToolAccessContext(userContext: AgentUserContext): AgentToolAccessContext {
    const role = userContext.role.trim().toLowerCase();
    const isTeamRole = role === 'coach' || role === 'director';
    const allowedEntityGroups: AgentToolEntityGroup[] = ['platform_tools', 'system_tools'];

    if (role === 'athlete') {
      allowedEntityGroups.push('user_tools');
    }

    if (isTeamRole) {
      allowedEntityGroups.push('team_tools', 'user_tools');
    }

    if (userContext.organizationId) {
      allowedEntityGroups.push('organization_tools');
    }

    return {
      userId: userContext.userId,
      role: userContext.role,
      teamId: userContext.teamId,
      organizationId: userContext.organizationId,
      allowedEntityGroups: Array.from(new Set(allowedEntityGroups)),
    };
  }
}
