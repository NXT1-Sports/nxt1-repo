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
  AgentTask,
  AgentExecutionPlan,
  OperationOutcomeCode,
  AgentSessionContext,
  AgentSessionMessage,
  AgentRetrievedMemories,
  AgentUserContext,
} from '@nxt1/core';
import type { OpenRouterService } from './llm/openrouter.service.js';
import type { ToolRegistry } from './tools/tool-registry.js';
import type { ContextBuilder } from './memory/context-builder.js';
import type { BaseAgent } from './agents/base.agent.js';
import type { SkillRegistry } from './skills/skill-registry.js';
import type { OnStreamEvent } from './queue/event-writer.js';
import { ClassifierAgent } from './agents/classifier.agent.js';
import { PlannerAgent } from './agents/planner.agent.js';
import { SemanticCacheService } from './memory/semantic-cache.service.js';
import { SessionMemoryService } from './memory/session.service.js';
import { ApprovalGateService } from './services/approval-gate.service.js';
import { getAgentRunConfig, DEFAULT_AGENT_RUN_CONFIG } from './config/agent-app-config.js';
import {
  AgentRouterConversationService,
  type ConversationRouteOutcome,
} from './orchestrator/agent-router-conversation.service.js';
import { AgentRouterContextService } from './orchestrator/agent-router-context.service.js';
import { AgentRouterExecutionService } from './orchestrator/agent-router-execution.service.js';
import { AgentRouterFinalizationService } from './orchestrator/agent-router-finalization.service.js';
import { AgentRouterPolicyService } from './orchestrator/agent-router-policy.service.js';
import { AgentRouterPlanningService } from './orchestrator/agent-router-planning.service.js';
import {
  AgentRouterPlanningOrchestratorService,
  type AgentRouterPlanningOutcome,
} from './orchestrator/agent-router-planning-orchestrator.service.js';
import { AgentRouterRequestBootstrapService } from './orchestrator/agent-router-request-bootstrap.service.js';
import { AgentRouterResumeService } from './orchestrator/agent-router-resume.service.js';
import { AgentRouterTelemetryService } from './orchestrator/agent-router-telemetry.service.js';
import { logger } from '../../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Fallback values used when Firestore `AppConfig/agentConfig` is absent.
 * Live values are read per-run from Firestore via getAgentRunConfig().
 * These are only referenced by DEFAULT_AGENT_RUN_CONFIG in agent-app-config.ts.
 */

// ─── Router ─────────────────────────────────────────────────────────────────

export class AgentRouter {
  private readonly classifier: ClassifierAgent;
  private readonly planner: PlannerAgent;
  private readonly agents = new Map<AgentIdentifier, BaseAgent>();
  private readonly planningService: AgentRouterPlanningService;
  private readonly conversationService: AgentRouterConversationService;
  private readonly policyService: AgentRouterPolicyService;
  private readonly requestBootstrapService: AgentRouterRequestBootstrapService;
  private readonly routerContextService: AgentRouterContextService;
  private readonly executionService: AgentRouterExecutionService;
  private readonly finalizationService: AgentRouterFinalizationService;
  private readonly planningOrchestratorService: AgentRouterPlanningOrchestratorService;
  private readonly resumeService: AgentRouterResumeService;
  private readonly telemetryService: AgentRouterTelemetryService;

  constructor(
    llm: OpenRouterService,
    toolRegistry: ToolRegistry,
    private readonly contextBuilder: ContextBuilder,
    skillRegistry?: SkillRegistry,
    private readonly sessionMemory?: SessionMemoryService
  ) {
    this.classifier = new ClassifierAgent(llm);
    this.planner = new PlannerAgent(llm);
    const semanticCache = new SemanticCacheService(llm);
    this.routerContextService = new AgentRouterContextService(contextBuilder, sessionMemory);
    this.planningService = new AgentRouterPlanningService(llm, toolRegistry, skillRegistry);
    this.telemetryService = new AgentRouterTelemetryService();
    this.policyService = new AgentRouterPolicyService(this.planner);
    this.requestBootstrapService = new AgentRouterRequestBootstrapService(
      llm,
      toolRegistry,
      semanticCache,
      this.routerContextService,
      this.telemetryService,
      this.policyService,
      skillRegistry
    );
    this.finalizationService = new AgentRouterFinalizationService(
      semanticCache,
      this.routerContextService,
      this.telemetryService
    );
    this.executionService = new AgentRouterExecutionService(
      llm,
      toolRegistry,
      this.telemetryService,
      skillRegistry
    );
    this.planningOrchestratorService = new AgentRouterPlanningOrchestratorService(
      {
        execute: (...args) => this.planner.execute(...args),
      } as PlannerAgent,
      this.planningService,
      this.telemetryService,
      this.routerContextService
    );
    this.resumeService = new AgentRouterResumeService(
      llm,
      toolRegistry,
      contextBuilder,
      this.routerContextService,
      this.telemetryService,
      (userContext) => this.policyService.buildToolAccessContext(userContext),
      skillRegistry,
      sessionMemory
    );
    this.conversationService = new AgentRouterConversationService(
      llm,
      contextBuilder,
      this.routerContextService,
      this.telemetryService
    );
  }

  /** Register a sub-agent so the router can delegate tasks to it. */
  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.id, agent);
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

    const routeDecision = await this.classifier.classify(enrichedIntent, context);
    if (routeDecision?.route === 'chat') {
      return 'router';
    }

    const result = await this.planner.execute(
      enrichedIntent,
      context,
      [],
      undefined,
      routeDecision ? { skipClassification: true } : undefined
    );
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
          storagePath?: string;
          name?: string;
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
    const toolAccessContext = this.policyService.buildToolAccessContext(userContext);

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

    const directAgentResult = await this.requestBootstrapService.runDirectAgentPath({
      job: payload,
      operationId,
      userId,
      threadId,
      contextObj,
      context,
      enrichedIntent,
      toolAccessContext,
      approvalGate,
      maxDelegationDepth,
      agents: this.agents,
      onUpdate,
      onStreamEvent,
      rerunWithDelegatedPayload: (delegatedPayload) =>
        this.run(delegatedPayload, rawOnUpdate, firestore, rawOnStreamEvent, environment, signal),
    });
    if (directAgentResult) {
      return directAgentResult;
    }

    const scopedIntent = this.requestBootstrapService.buildScopedCacheKey(intent, userContext);
    const cachedResult = await this.requestBootstrapService.trySemanticCache({
      operationId,
      userId,
      intent,
      scopedIntent,
      userContext,
      onUpdate,
    });
    if (cachedResult) {
      return cachedResult;
    }

    // ── Step 2: Plan ──────────────────────────────────────────────────────
    const planningOutcome: AgentRouterPlanningOutcome = await this.planningOrchestratorService.plan(
      {
        operationId,
        userId,
        threadId,
        enrichedIntent,
        context,
        toolAccessContext,
        agents: this.agents,
        onUpdate,
        onStreamEvent,
        rawOnStreamEvent,
        skipPlannerClassification,
        signal,
      }
    );

    if (planningOutcome.kind === 'completed' || planningOutcome.kind === 'failed') {
      return planningOutcome.result;
    }

    const { plan } = planningOutcome;

    // ── Step 3: Execute tasks in dependency order ─────────────────────────
    const { taskResults, mutableTasks } = await this.executionService.executePlan({
      operationId,
      userId,
      plan,
      enrichedIntent,
      context,
      toolAccessContext,
      approvalGate,
      taskMaxRetries,
      agents: this.agents,
      onUpdate,
      onStreamEvent,
      signal,
      buildTaskIntent: (task, upstreamResults, enrichedContext) =>
        this.buildTaskIntent(task, upstreamResults, enrichedContext),
      rerouteDelegatedTask: (forwardingIntent, sourceAgentId, rerouteContext) =>
        this.policyService.rerouteDelegatedTask(forwardingIntent, sourceAgentId, rerouteContext),
    });

    // ── Step 4: Aggregate results ─────────────────────────────────────────
    return this.finalizationService.finalize({
      operationId,
      userId,
      threadId,
      plan,
      taskResults,
      mutableTasks,
      scopedIntent,
      onUpdate,
      onStreamEvent,
    });
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
    return this.resumeService.runResumed({
      job: payload,
      yieldState,
      planner: this.planner,
      agents: this.agents,
      onUpdate,
      firestore,
      onStreamEvent,
      environment,
      signal,
    });
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
    return this.routerContextService.enrichIntentWithContext(
      intent,
      userContext,
      jobContext,
      threadHistory,
      memories,
      recentSyncSummaries,
      activeThreadsSummary
    );
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
    return this.conversationService.tryConversationalRoute(payload);
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
    return this.routerContextService.buildTaskIntent(task, upstreamResults, enrichedContext);
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
    attachments?: readonly {
      readonly url: string;
      readonly mimeType: string;
      readonly storagePath?: string;
      readonly name?: string;
    }[],
    videoAttachments?: readonly {
      readonly url: string;
      readonly mimeType: string;
      readonly name: string;
    }[],
    conversationHistory?: readonly AgentSessionMessage[]
  ): AgentSessionContext {
    return this.routerContextService.buildSessionContext(
      userId,
      sessionId,
      operationId,
      threadId,
      environment,
      signal,
      mode,
      attachments,
      videoAttachments,
      conversationHistory
    );
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
    this.telemetryService.emitUpdate(onUpdate, operationId, status, message, payload, structured);
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
    this.telemetryService.emitProgressOperation(onStreamEvent, payload);
  }

  private recordPhaseLatency(
    phase: string,
    durationMs: number,
    context?: Readonly<Record<string, unknown>>
  ): void {
    this.telemetryService.recordPhaseLatency(phase, durationMs, context);
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
    this.telemetryService.emitMetricSample(onStreamEvent, payload);
  }
}
