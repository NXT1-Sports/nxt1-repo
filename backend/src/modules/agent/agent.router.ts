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
  OperationOutcomeCode,
  AgentSessionContext,
  AgentSessionMessage,
  AgentRetrievedMemories,
  AgentToolAccessContext,
  AgentToolDefinition,
  AgentXSelectedContext,
  AgentUserContext,
} from '@nxt1/core';
import type { OpenRouterService } from './llm/openrouter.service.js';
import type { ToolRegistry } from './tools/tool-registry.js';
import type { ContextBuilder } from './memory/context-builder.js';
import type { BaseAgent } from './agents/base.agent.js';
import type { SkillRegistry } from './skills/skill-registry.js';
import type { OnStreamEvent } from './queue/event-writer.js';
import { PlannerAgent } from './agents/planner.agent.js';
import { SessionMemoryService } from './memory/session.service.js';
import { ApprovalGateService } from './services/approval-gate.service.js';
import { getAgentRunConfig, DEFAULT_AGENT_RUN_CONFIG } from './config/agent-app-config.js';
import { AgentRouterContextService } from './orchestrator/agent-router-context.service.js';
import { AgentRouterExecutionService } from './orchestrator/agent-router-execution.service.js';
import { AgentRouterPolicyService } from './orchestrator/agent-router-policy.service.js';
import { AgentRouterPlanningService } from './orchestrator/agent-router-planning.service.js';
import type { AgentRouterPrimaryService } from './orchestrator/agent-router-primary.service.js';
import type { AgentXEffortLevel } from '@nxt1/core/ai';
import { PrimaryAgent } from './agents/primary.agent.js';
import { AgentRouterResumeService } from './orchestrator/agent-router-resume.service.js';
import { AgentRouterTelemetryService } from './orchestrator/agent-router-telemetry.service.js';
import { getThreadMessageReplayService } from './memory/thread-message-replay.service.js';
import { resolveThreadReplayMaxTokens } from './memory/replay-budget.js';
import { logger } from '../../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────
type CoordinatorAgentId = Exclude<AgentIdentifier, 'router'>;

const COORDINATOR_AGENT_ID_SET = new Set<AgentIdentifier>([
  'admin_coordinator',
  'brand_coordinator',
  'data_coordinator',
  'strategy_coordinator',
  'recruiting_coordinator',
  'performance_coordinator',
]);

const COORDINATOR_ALIAS_TO_ID: Readonly<Record<string, CoordinatorAgentId>> = {
  admin: 'admin_coordinator',
  admin_coordinator: 'admin_coordinator',
  admincoordinator: 'admin_coordinator',
  brand: 'brand_coordinator',
  brand_coordinator: 'brand_coordinator',
  brandcoordinator: 'brand_coordinator',
  creative: 'brand_coordinator',
  data: 'data_coordinator',
  data_coordinator: 'data_coordinator',
  datacoordinator: 'data_coordinator',
  performance: 'performance_coordinator',
  performance_coordinator: 'performance_coordinator',
  performancecoordinator: 'performance_coordinator',
  film: 'performance_coordinator',
  recruiting: 'recruiting_coordinator',
  recruiting_coordinator: 'recruiting_coordinator',
  recruitingcoordinator: 'recruiting_coordinator',
  strategy: 'strategy_coordinator',
  strategy_coordinator: 'strategy_coordinator',
  strategycoordinator: 'strategy_coordinator',
};

const COORDINATOR_PREFIX_PATTERN = /^\s*@([a-z][a-z0-9_-]*)\b\s*[:\-–—]?\s*/i;
const COORDINATOR_LABEL_PREFIX_PATTERN =
  /^\s*(admin|brand|creative|data|film|performance|recruiting|strategy)\s+(?:coordinator|agent)\s*[:\-–—]\s*/i;
const PRIMARY_DYNAMIC_TOOL_MATCH_THRESHOLD = 0.35;
const PRIMARY_DYNAMIC_TOOL_LIMIT = 15;
const PURE_BROWSER_OPEN_PATTERN =
  /\b(go\s+to|open|show|view|launch|pull\s+up|bring\s+up)\b[\s\S]{0,80}\b(hudl|live\s*view|browser|web\s*page|page|profile|team\s+page)\b/i;
const MEDIA_PROCESSING_PATTERN =
  /\b(extract|download|analy[sz]e|clip|trim|cut|import|save\s+film|film\s+review|create\s+(?:a\s+)?reel|make\s+(?:a\s+)?reel|highlight|process\s+media|watch\s+(?:the\s+)?(?:clip|clips|film|video))\b/i;
const FILES_BACKED_ARTIFACT_PATTERN =
  /\b(files?|team files?|playbook|our plays?|install sheet|callsheet|call sheet|game plan|scout report|opponent report|practice script|template|sample layout|saved strategy|document|pdf)\b/i;
const FILES_RETRIEVAL_VERB_PATTERN =
  /\b(reduce|trim|condense|review|open|show|pull|find|load|read|inspect|summarize|analy[sz]e|use|revise|update|edit|refine|prioritize)\b/i;

const EMAIL_ADDRESS_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const EMAIL_SEND_VERB_PATTERN = /\b(send|sending|sent|deliver|delivering)\b/i;
const EMAIL_CONTEXT_PATTERN = /\b(email|emails|mail|outreach|campaign)\b/i;
const EMAIL_DRAFT_ONLY_PATTERN = /\b(draft|write|compose)\b/i;
const EMAIL_CONNECTION_REQUIRED_SUMMARY =
  'To send emails through Agent X, please connect your Gmail or Outlook account first in Settings -> Email.';

/**
 * Fallback values used when Firestore `AppConfig/agentConfig` is absent.
 * Live values are read per-run from Firestore via getAgentRunConfig().
 * These are only referenced by DEFAULT_AGENT_RUN_CONFIG in agent-app-config.ts.
 */

// ─── Router ─────────────────────────────────────────────────────────────────

export class AgentRouter {
  private readonly planner: PlannerAgent;
  private readonly agents = new Map<AgentIdentifier, BaseAgent>();
  private readonly planningService: AgentRouterPlanningService;
  private readonly policyService: AgentRouterPolicyService;
  private readonly routerContextService: AgentRouterContextService;
  private readonly executionService: AgentRouterExecutionService;
  private readonly resumeService: AgentRouterResumeService;
  private readonly telemetryService: AgentRouterTelemetryService;
  private primaryAgent?: PrimaryAgent;
  private primaryService?: AgentRouterPrimaryService;
  private readonly llm: OpenRouterService;
  private readonly toolRegistry: ToolRegistry;
  private readonly skillRegistry?: SkillRegistry;

  constructor(
    llm: OpenRouterService,
    toolRegistry: ToolRegistry,
    private readonly contextBuilder: ContextBuilder,
    skillRegistry?: SkillRegistry,
    private readonly sessionMemory?: SessionMemoryService
  ) {
    this.llm = llm;
    this.toolRegistry = toolRegistry;
    this.skillRegistry = skillRegistry;
    this.planner = new PlannerAgent(llm);
    this.routerContextService = new AgentRouterContextService(contextBuilder, sessionMemory);
    this.planningService = new AgentRouterPlanningService(llm, toolRegistry, skillRegistry);
    this.telemetryService = new AgentRouterTelemetryService();
    this.policyService = new AgentRouterPolicyService(this.planner);
    this.executionService = new AgentRouterExecutionService(
      llm,
      toolRegistry,
      this.telemetryService,
      skillRegistry
    );
    this.resumeService = new AgentRouterResumeService(
      llm,
      toolRegistry,
      contextBuilder,
      this.routerContextService,
      this.telemetryService,
      (userContext) => this.policyService.buildToolAccessContext(userContext),
      skillRegistry,
      sessionMemory,
      () => this.primaryAgent
    );
  }

  /** Register a sub-agent so the router can delegate tasks to it. */
  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.id, agent);
  }

  /**
   * Wire the Primary Agent + dispatcher service. REQUIRED — bootstrap MUST
   * call this once after constructing the router before dispatching any jobs.
   * {@link run} throws immediately if called without Primary wired.
   */
  setPrimary(primary: PrimaryAgent, service: AgentRouterPrimaryService): void {
    this.primaryAgent = primary;
    this.primaryService = service;
  }

  /** Internal: expose the registered agents map to the primary dispatcher. */
  getRegisteredAgents(): ReadonlyMap<AgentIdentifier, BaseAgent> {
    return this.agents;
  }

  /** Internal: expose orchestrator services to the primary dispatcher factory. */
  getOrchestratorBundle(): {
    executionService: AgentRouterExecutionService;
    contextService: AgentRouterContextService;
    policyService: AgentRouterPolicyService;
    planningService: AgentRouterPlanningService;
    planner: PlannerAgent;
  } {
    return {
      executionService: this.executionService,
      contextService: this.routerContextService,
      policyService: this.policyService,
      planningService: this.planningService,
      planner: this.planner,
    };
  }

  /**
   * Full execution loop. All conversational requests flow through the
   * Primary Agent's streaming ReAct loop. Throws immediately if
   * {@link setPrimary} has not been called — bootstrap is responsible for
   * wiring Primary before the first job is dispatched.
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

    logger.info('[AgentRouter] run() entry', {
      operationId,
      userId,
      intentPreview: intent.slice(0, 80),
      hasPrimaryAgent: Boolean(this.primaryAgent),
      hasPrimaryService: Boolean(this.primaryService),
    });

    const rawContextObj =
      typeof payload.context === 'object' && payload.context !== null ? payload.context : {};
    const executionMode =
      (rawContextObj as Record<string, unknown>)['executionMode'] === 'plan' ? 'plan' : undefined;
    const rawEffortLevel = (rawContextObj as Record<string, unknown>)['effortLevel'];
    const effortLevel: AgentXEffortLevel | undefined =
      rawEffortLevel === 'high' || rawEffortLevel === 'medium' || rawEffortLevel === 'low'
        ? rawEffortLevel
        : undefined;

    // ── Load runtime config from AppConfig/agentConfig ────────────────────
    const agentRunConfig = firestore
      ? await getAgentRunConfig(firestore)
      : DEFAULT_AGENT_RUN_CONFIG;
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
    const timezone =
      typeof (contextObj as Record<string, unknown>)['timezone'] === 'string'
        ? ((contextObj as Record<string, unknown>)['timezone'] as string)
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
          storagePath?: string;
          cloudflareVideoId?: string;
          cloudflareStatus?: string;
          readyToStream?: boolean;
          thumbnailUrl?: string;
        }[])
      : undefined;
    const selectedContexts = Array.isArray(
      (contextObj as Record<string, unknown>)['selectedContexts']
    )
      ? ((contextObj as Record<string, unknown>)[
          'selectedContexts'
        ] as readonly AgentXSelectedContext[])
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

    // Phase C (thread-as-truth): on every turn, the canonical conversation
    // is rehydrated from MongoDB — not from Redis session memory or a
    // truncated thread-history string. This is the single source of truth
    // pattern used by OpenAI Assistants v2, Anthropic Messages, and VS
    // Code Copilot. The replay service returns a structurally-valid
    // `LLMMessage[]` (system/user/assistant/tool with tool_calls +
    // tool_call_id pairing intact) ready to feed straight into
    // OpenRouter.
    let canonicalHistory: readonly AgentSessionMessage[] | undefined =
      sessionContext?.conversationHistory;
    if (threadId) {
      try {
        const replayMaxTokens = resolveThreadReplayMaxTokens({
          intent,
          videoAttachments,
        });
        const replayed = await getThreadMessageReplayService().loadAsLLMMessages(threadId, {
          maxTokens: replayMaxTokens,
        });
        // Map LLMMessage[] → AgentSessionMessage[]. The widened
        // AgentSessionMessage shape carries `toolCallId` and
        // `toolCalls` so BaseAgent can rebuild the exact wire-format
        // history.
        canonicalHistory = replayed.map((m) => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
          timestamp: new Date().toISOString(),
          ...(m.role === 'tool' && m.tool_call_id ? { toolCallId: m.tool_call_id } : {}),
          ...(m.role === 'assistant' && m.tool_calls ? { toolCalls: m.tool_calls } : {}),
        }));
        logger.info('[AgentRouter] Replayed canonical thread history', {
          threadId,
          messageCount: canonicalHistory.length,
          replayMaxTokens,
        });
      } catch (err) {
        logger.warn('[AgentRouter] Thread replay failed — falling back to session memory', {
          threadId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const context = this.buildSessionContext(
      userId,
      sessionContext?.sessionId ?? payload.sessionId,
      operationId,
      threadId,
      environment,
      typeof rawContextObj['appBaseUrl'] === 'string'
        ? String(rawContextObj['appBaseUrl'])
        : undefined,
      typeof rawContextObj['agentRouteBase'] === 'string'
        ? String(rawContextObj['agentRouteBase'])
        : undefined,
      timezone,
      signal,
      mode,
      executionMode,
      effortLevel,
      attachments,
      videoAttachments,
      canonicalHistory,
      selectedContexts
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

    // ── PRIMARY AGENT (default conversational path) ──────────────────────
    // The Primary owns the full top-level conversational surface. Any request
    // that reaches the router should enter Primary or the planner; there is no
    // direct coordinator-routing fallback branch anymore.

    // REMOVED: PHASE 0 (Cheap model acknowledgment) — was generating out-of-context
    // responses before context loaded, causing confusion. Reverted to full-model-only
    // approach to ensure all responses are context-aware.

    // ── Step 1: Build context (parallel, non-blocking) ───────────────────
    // Start context loading immediately without blocking. It usually finishes
    // ~500-1500ms later, well before Primary needs it. If somehow Primary
    // catches up first, we await here—no regression in latency.
    const contextPhaseStartMs = Date.now();
    const contextBuildPromise = this.buildContextWithTelemetry(
      userId,
      firestore,
      operationId,
      onStreamEvent,
      onUpdate
    );

    // Continue setup while context loads in parallel
    let activeThreadsSummary = '';
    try {
      activeThreadsSummary = await this.contextBuilder.getActiveThreadsSummary(userId, 8);
    } catch {
      // Non-critical — continue without it
    }

    // Await context (it's likely ready by now; if not, we wait here once)
    const userContext = await contextBuildPromise;
    if (!userContext) {
      // buildContextWithTelemetry already emitted error events and logged
      return {
        summary: 'Failed to build user context. Please try again.',
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
      message: `Context ready (${Math.round(contextBuildDurationMs)}ms).`,
      metadata: {
        eventType: 'metric',
        metricName: 'context_build_latency_ms',
        phase: 'context_build',
        value: contextBuildDurationMs,
      },
    });

    // Emit context_ready event for client observability
    this.emitContextReady(onStreamEvent, operationId, userId, contextBuildDurationMs);

    const enrichedIntent = this.enrichIntentWithContext(
      intent,
      userContext,
      payload.context,
      undefined,
      undefined,
      undefined,
      activeThreadsSummary
    );
    const toolAccessContext = this.policyService.buildToolAccessContext(userContext);
    const defaultGameAnalysisContext = buildDefaultGameAnalysisContext(userContext);
    const contextWithDefaults: AgentSessionContext = defaultGameAnalysisContext
      ? {
          ...context,
          defaultGameAnalysisContext,
        }
      : context;

    if (this.shouldBlockEmailSendUntilProviderConnected(intent, userContext)) {
      this.emitEmailConnectionRequired(onStreamEvent);
      this.emitUpdate(
        onUpdate,
        operationId,
        'completed',
        EMAIL_CONNECTION_REQUIRED_SUMMARY,
        undefined,
        {
          agentId: 'router',
          stage: 'routing_to_agent',
          outcomeCode: 'input_required',
          metadata: { reason: 'email_connection_required' },
        }
      );
      logger.info(
        '[AgentRouter] Blocked email send before Primary because no provider is connected',
        {
          operationId,
          userId,
        }
      );
      return {
        summary: EMAIL_CONNECTION_REQUIRED_SUMMARY,
        suggestions: [
          'Connect Gmail or Outlook in Settings -> Email, then ask me to send it again.',
        ],
      };
    }

    const directCoordinatorTarget =
      executionMode === 'plan'
        ? null
        : this.resolveExplicitCoordinatorTarget(payload.agent, contextObj, intent);
    if (directCoordinatorTarget && this.primaryService) {
      const directIntent = directCoordinatorTarget.intent || intent;
      const directEnrichedIntent = this.enrichIntentWithContext(
        directIntent,
        userContext,
        {
          ...payload.context,
          directCoordinatorBypass: true,
          coordinatorId: directCoordinatorTarget.agentId,
        },
        undefined,
        undefined,
        undefined,
        activeThreadsSummary
      );

      logger.info('[AgentRouter] Explicit coordinator bypass selected', {
        operationId,
        userId,
        coordinatorId: directCoordinatorTarget.agentId,
        source: directCoordinatorTarget.source,
      });

      const dispatchResult = await this.primaryService.runCoordinator(
        directCoordinatorTarget.agentId,
        directIntent,
        {
          operationId,
          userId,
          enrichedIntent: directEnrichedIntent,
          sessionContext: contextWithDefaults,
          ...(approvalGate ? { approvalGate } : {}),
          ...(onStreamEvent ? { onStreamEvent } : {}),
          ...(signal ? { signal } : {}),
        },
        {
          directCoordinatorBypass: true,
          explicitCoordinatorSource: directCoordinatorTarget.source,
          ...(directCoordinatorTarget.selectedAction
            ? { selectedAction: directCoordinatorTarget.selectedAction }
            : {}),
        }
      );

      return {
        summary: dispatchResult.observation,
        success: dispatchResult.success,
        data: {
          directCoordinatorBypass: true,
          coordinatorId: directCoordinatorTarget.agentId,
          streamedDeltaCount: dispatchResult.streamedDeltaCount ?? 0,
          streamedCharCount: dispatchResult.streamedCharCount ?? 0,
          ...(dispatchResult.success ? {} : { operationStatus: 'failed' as const }),
          ...(dispatchResult.coordinatorArtifacts
            ? { coordinatorArtifacts: dispatchResult.coordinatorArtifacts }
            : {}),
          ...(dispatchResult.coordinatorToolCallRecords
            ? { toolCallRecords: dispatchResult.coordinatorToolCallRecords }
            : {}),
        },
      };
    }

    // ── PRIMARY AGENT (sole entry point since 2026 enterprise migration) ──
    // All conversational requests flow through Primary's streaming ReAct
    // loop. runPrimary() throws immediately if Primary is not wired so
    // misconfiguration is caught at the first job rather than silently
    // degrading to a removed code path.
    return await this.runPrimary({
      operationId,
      userId,
      intent,
      enrichedIntent,
      context: contextWithDefaults,
      toolAccessContext,
      approvalGate,
      onUpdate,
      onStreamEvent,
      signal,
    });
  }

  private resolveExplicitCoordinatorTarget(
    preselectedAgent: AgentIdentifier | undefined,
    contextObj: Record<string, unknown>,
    intent: string
  ):
    | {
        readonly agentId: CoordinatorAgentId;
        readonly intent: string;
        readonly source: 'payload_agent' | 'context' | 'prompt_prefix';
        readonly selectedAction?: Record<string, unknown>;
      }
    | null {
    if (this.isCoordinatorAgentId(preselectedAgent)) {
      return { agentId: preselectedAgent, intent, source: 'payload_agent' };
    }

    for (const key of ['coordinatorId', 'targetAgent', 'targetAgentId', 'agentId']) {
      const candidate = this.normalizeCoordinatorId(contextObj[key]);
      if (candidate) {
        return { agentId: candidate, intent, source: 'context' };
      }
    }

    const selectedAction = contextObj['selectedAction'];
    if (selectedAction && typeof selectedAction === 'object') {
      const normalizedSelectedAction = selectedAction as Record<string, unknown>;
      const candidate = this.normalizeCoordinatorId(
        normalizedSelectedAction['coordinatorId']
      );
      if (candidate) {
        return {
          agentId: candidate,
          intent,
          source: 'context',
          selectedAction: normalizedSelectedAction,
        };
      }
    }

    const mentionMatch = intent.match(COORDINATOR_PREFIX_PATTERN);
    if (mentionMatch?.[1]) {
      const candidate = this.normalizeCoordinatorId(mentionMatch[1]);
      if (candidate) {
        const strippedIntent = intent.slice(mentionMatch[0].length).trim();
        return { agentId: candidate, intent: strippedIntent || intent, source: 'prompt_prefix' };
      }
    }

    const labelMatch = intent.match(COORDINATOR_LABEL_PREFIX_PATTERN);
    if (labelMatch?.[1]) {
      const candidate = this.normalizeCoordinatorId(labelMatch[1]);
      if (candidate) {
        const strippedIntent = intent.slice(labelMatch[0].length).trim();
        return { agentId: candidate, intent: strippedIntent || intent, source: 'prompt_prefix' };
      }
    }

    return null;
  }

  private normalizeCoordinatorId(value: unknown): CoordinatorAgentId | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase().replace(/^@/, '').replace(/[\s-]+/g, '_');
    const compact = normalized.replace(/_/g, '');
    const candidate = COORDINATOR_ALIAS_TO_ID[normalized] ?? COORDINATOR_ALIAS_TO_ID[compact];
    return candidate ?? null;
  }

  private isCoordinatorAgentId(value: AgentIdentifier | undefined): value is CoordinatorAgentId {
    return Boolean(value && value !== 'router' && COORDINATOR_AGENT_ID_SET.has(value));
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

  /**
   * Primary Agent execution. Runs a single streaming ReAct loop with
   * native tool calling. The Primary handles dispatch to coordinators
   * and multi-step planning via tool calls (`delegate_to_coordinator`,
   * `plan_and_execute`).
   *
   * Requires {@link setPrimary} to have been called by bootstrap.
   */
  private async runPrimary(opts: {
    operationId: string;
    userId: string;
    intent: string;
    enrichedIntent: string;
    context: AgentSessionContext;
    toolAccessContext: AgentToolAccessContext;
    approvalGate?: ApprovalGateService;
    onUpdate?: (update: AgentJobUpdate) => void;
    onStreamEvent?: OnStreamEvent;
    signal?: AbortSignal;
  }): Promise<AgentOperationResult> {
    const primary = this.primaryAgent;
    if (!primary) {
      throw new Error('runPrimary called without primary agent wired');
    }

    primary.beginRun({
      operationId: opts.operationId,
      userId: opts.userId,
      sessionContext: opts.context,
      enrichedIntent: opts.enrichedIntent,
      ...(opts.approvalGate ? { approvalGate: opts.approvalGate } : {}),
      ...(opts.onStreamEvent ? { onStreamEvent: opts.onStreamEvent } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });

    try {
      this.emitUpdate(
        opts.onUpdate,
        opts.operationId,
        'thinking',
        'Chief of Staff reasoning…',
        undefined,
        {
          agentId: 'router',
          stage: 'agent_thinking',
        }
      );

      // Build the Primary's tool surface from the registry. The static
      // helper filters registry definitions to the curated fast-path list
      // declared on PrimaryAgent. Passing an empty array here would cause
      // BaseAgent.execute to expose ZERO tools to the LLM (it filters the
      // passed array; it does not fetch from the registry).
      const primaryAccessContext = {
        ...opts.toolAccessContext,
        executionMode: opts.context.executionMode,
      };
      const matchedToolDefinitions = await this.matchPrimaryToolDefinitions(
        opts.intent,
        opts.enrichedIntent,
        primaryAccessContext,
        opts.operationId
      );
      const toolDefinitions = PrimaryAgent.buildPrimaryToolDefinitions(
        this.toolRegistry,
        primaryAccessContext,
        matchedToolDefinitions
          ? {
              matchedToolDefinitions,
              maxDynamicToolDefinitions: PRIMARY_DYNAMIC_TOOL_LIMIT,
            }
          : undefined
      );
      logger.info('[AgentRouter] Primary tool surface', {
        operationId: opts.operationId,
        toolCount: toolDefinitions.length,
        dynamicToolCount: matchedToolDefinitions?.length ?? 0,
        toolNames: toolDefinitions.map((d) => d.name),
      });

      const result = await primary.execute(
        opts.enrichedIntent,
        opts.context,
        toolDefinitions,
        this.llm,
        this.toolRegistry,
        this.skillRegistry,
        opts.onStreamEvent,
        opts.approvalGate
      );

      return result;
    } finally {
      primary.endRun(opts.operationId);
    }
  }

  private async matchPrimaryToolDefinitions(
    rawIntent: string,
    enrichedIntent: string,
    accessContext: AgentToolAccessContext,
    operationId: string
  ): Promise<readonly AgentToolDefinition[] | undefined> {
    const forcedToolDefinitions = this.resolvePrimaryForcedToolDefinitions(
      `${rawIntent}
${enrichedIntent}`,
      accessContext
    );

    try {
      const intentEmbedding = await this.llm.embed(enrichedIntent);
      const discoverableMatcher = (
        this.toolRegistry as ToolRegistry & {
          matchDiscoverableWithScores?: (
            intentVector: readonly number[],
            embedFn: (text: string) => Promise<readonly number[]>,
            accessContext?: AgentToolAccessContext,
            threshold?: number
          ) => Promise<readonly AgentToolDefinition[]>;
        }
      ).matchDiscoverableWithScores;
      const matchedToolDefinitions = discoverableMatcher
        ? await discoverableMatcher.call(
            this.toolRegistry,
            intentEmbedding,
            (text: string) => this.llm.embed(text),
            accessContext,
            PRIMARY_DYNAMIC_TOOL_MATCH_THRESHOLD
          )
        : await this.toolRegistry.matchWithScores(
            intentEmbedding,
            (text) => this.llm.embed(text),
            'router',
            accessContext,
            PRIMARY_DYNAMIC_TOOL_MATCH_THRESHOLD
          );

      return this.mergePrimaryMatchedToolDefinitions(
        forcedToolDefinitions,
        matchedToolDefinitions,
        PRIMARY_DYNAMIC_TOOL_LIMIT
      );
    } catch (err) {
      logger.warn('[AgentRouter] Primary dynamic tool retrieval failed; using static surface', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
      });
      return forcedToolDefinitions.length > 0 ? forcedToolDefinitions : undefined;
    }
  }

  private resolvePrimaryForcedToolDefinitions(
    rawIntent: string,
    accessContext: AgentToolAccessContext
  ): readonly AgentToolDefinition[] {
    const forcedToolNames = this.resolvePrimaryForcedToolNames(rawIntent);
    if (forcedToolNames.length === 0) return [];

    const allDefinitions = this.toolRegistry.getDefinitions(undefined, accessContext);
    return forcedToolNames
      .map((toolName) => allDefinitions.find((definition) => definition.name === toolName))
      .filter((definition): definition is AgentToolDefinition => Boolean(definition));
  }

  private resolvePrimaryForcedToolNames(rawIntent: string): readonly string[] {
    if (this.isFilesArtifactIntent(rawIntent)) {
      return [
        'list_universal_team_documents',
        'get_universal_team_document',
        'parse_document',
        'render_pdf_pages',
        'enrich_document_notes',
      ];
    }

    if (this.isPureBrowserOpenIntent(rawIntent)) {
      return ['open_live_view'];
    }

    if (this.isFilmReviewReadIntent(rawIntent)) {
      return [
        'get_film_review',
        'list_film_review_sources',
        'get_film_review_source_breakdown',
        'search_film_review_breakdown_rows',
        'execute_sandbox_script',
      ];
    }

    return [];
  }

  private isPureBrowserOpenIntent(rawIntent: string): boolean {
    return PURE_BROWSER_OPEN_PATTERN.test(rawIntent) && !MEDIA_PROCESSING_PATTERN.test(rawIntent);
  }

  private isFilesArtifactIntent(rawIntent: string): boolean {
    return FILES_BACKED_ARTIFACT_PATTERN.test(rawIntent) && FILES_RETRIEVAL_VERB_PATTERN.test(rawIntent);
  }

  private isFilmReviewReadIntent(rawIntent: string): boolean {
    return /(film review|selected film|that film|this film|current film|selected clips?|selected plays?|source breakdown|breakdown rows|wide clip|odk|down\/?distance|50 selected film plays)\b/i.test(
      rawIntent
    );
  }

  private mergePrimaryMatchedToolDefinitions(
    forcedToolDefinitions: readonly AgentToolDefinition[],
    matchedToolDefinitions: readonly AgentToolDefinition[],
    limit: number
  ): readonly AgentToolDefinition[] {
    const merged = new Map<string, AgentToolDefinition>();
    for (const definition of forcedToolDefinitions) merged.set(definition.name, definition);
    for (const definition of matchedToolDefinitions) {
      if (merged.size >= limit) break;
      merged.set(definition.name, definition);
    }
    return [...merged.values()];
  }

  /** Build a minimal session context. */
  private buildSessionContext(
    userId: string,
    sessionId?: string,
    operationId?: string,
    threadId?: string,
    environment?: 'staging' | 'production',
    appBaseUrl?: string,
    agentRouteBase?: string,
    timezone?: string,
    signal?: AbortSignal,
    mode?: string,
    executionMode?: 'execute' | 'plan',
    effortLevel?: AgentXEffortLevel,
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
      readonly storagePath?: string;
      readonly cloudflareVideoId?: string;
      readonly cloudflareStatus?: string;
      readonly readyToStream?: boolean;
      readonly thumbnailUrl?: string;
    }[],
    conversationHistory?: readonly AgentSessionMessage[],
    selectedContexts?: readonly AgentXSelectedContext[]
  ): AgentSessionContext {
    return this.routerContextService.buildSessionContext(
      userId,
      sessionId,
      operationId,
      threadId,
      environment,
      appBaseUrl,
      agentRouteBase,
      timezone,
      signal,
      mode,
      executionMode,
      effortLevel,
      attachments,
      videoAttachments,
      conversationHistory,
      selectedContexts
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

  private shouldBlockEmailSendUntilProviderConnected(
    intent: string,
    userContext: AgentUserContext
  ): boolean {
    if (!this.isEmailSendIntent(intent)) return false;
    return !this.hasConnectedEmailProvider(userContext);
  }

  private isEmailSendIntent(intent: string): boolean {
    if (!EMAIL_ADDRESS_PATTERN.test(intent)) return false;
    const hasSendVerb = EMAIL_SEND_VERB_PATTERN.test(intent);
    const hasEmailContext = EMAIL_CONTEXT_PATTERN.test(intent);
    const isDraftOnly = EMAIL_DRAFT_ONLY_PATTERN.test(intent) && !hasSendVerb;
    return !isDraftOnly && (hasSendVerb || hasEmailContext);
  }

  private hasConnectedEmailProvider(userContext: AgentUserContext): boolean {
    return (userContext.connectedAccounts ?? []).some(
      (account) =>
        account.isTokenValid && (account.provider === 'gmail' || account.provider === 'microsoft')
    );
  }

  private emitEmailConnectionRequired(onStreamEvent?: OnStreamEvent): void {
    onStreamEvent?.({
      type: 'card',
      agentId: 'router',
      cardData: {
        agentId: 'router',
        type: 'connect-account',
        title: 'Email Account Required',
        payload: {
          reason:
            'Connect your Gmail or Outlook account in Settings -> Email before sending from your own address.',
          connectLabel: 'Connect Gmail or Outlook',
          suggestedAction: 'connect-account',
        },
      },
    });
  }

  // ─── Progressive Context Injection (TTFT Optimization) ──────────────────

  /**
   * Build user context with full observability and error handling.
   * Runs in parallel from the start of the operation so context loads
   * while acknowledgment is being streamed to the client.
   *
   * Returns `null` on failure after emitting error events and logging.
   * Always emits progress events to onStreamEvent for client visibility.
   *
   * @returns AgentUserContext if successful, null if context build failed.
   */
  private async buildContextWithTelemetry(
    userId: string,
    firestore: FirebaseFirestore.Firestore | undefined,
    operationId: string,
    onStreamEvent: OnStreamEvent | undefined,
    onUpdate: ((update: AgentJobUpdate) => void) | undefined
  ): Promise<AgentUserContext | null> {
    this.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'building_context',
      message: 'Loading your profile...',
      metadata: {
        eventType: 'progress_stage',
        phase: 'context_build',
        phaseIndex: 1,
        phaseTotal: 5,
      },
    });

    const contextStartMs = Date.now();
    try {
      const userContext = await this.contextBuilder.buildContext(userId, firestore);
      const contextMs = Date.now() - contextStartMs;

      logger.info('[AgentRouter] Context built successfully (parallel)', {
        operationId,
        userId,
        durationMs: contextMs,
      });

      return userContext;
    } catch (err) {
      const errorMs = Date.now() - contextStartMs;
      const message = err instanceof Error ? err.message : 'Context building failed';

      logger.error('[AgentRouter] Context build failed (parallel)', {
        operationId,
        userId,
        durationMs: errorMs,
        errorMessage: message,
        error: err instanceof Error ? (err.stack ?? err.message) : String(err),
      });

      this.emitProgressOperation(onStreamEvent, {
        operationId,
        stage: 'building_context',
        message: `Context error: ${message}`,
        metadata: {
          eventType: 'error',
          phase: 'context_build',
          error: message,
        },
      });

      this.emitUpdate(
        onUpdate,
        operationId,
        'failed',
        `Failed to load your profile: ${message}`,
        undefined,
        {
          agentId: 'router',
          stage: 'building_context',
          outcomeCode: 'context_build_failed',
          metadata: { errorMessage: message },
        }
      );

      return null;
    }
  }

  /**
   * Emit a delta event with optional acknowledgment flag.
   */
  /**
   * Emit context-ready event when context is loaded.
   */
  private emitContextReady(
    onStreamEvent: OnStreamEvent | undefined,
    operationId: string,
    userId: string,
    contextBuildDurationMs: number
  ): void {
    logger.info('[AgentRouter] Context ready for streaming', {
      operationId,
      userId,
      contextBuildDurationMs,
    });

    onStreamEvent?.({
      type: 'operation',
      operationId,
      stage: 'agent_thinking',
      status: 'running',
      message: 'Locked in.',
      metadata: {
        phase: 'context_ready',
        contextBuildMs: contextBuildDurationMs,
        ttftOptimization: true,
      },
    });
  }
}

function buildDefaultGameAnalysisContext(
  userContext: AgentUserContext
): AgentSessionContext['defaultGameAnalysisContext'] | undefined {
  const ownTeamId = userContext.teamId;
  const ownTeamName = userContext.ownTeamName ?? userContext.school ?? userContext.coachProgram;
  const ownTeamColor = userContext.organizationPrimaryColor ?? userContext.ownTeamPrimaryColor;
  const ownTeamSecondaryColor =
    userContext.organizationSecondaryColor ?? userContext.ownTeamSecondaryColor;
  const perspectiveTeam = userContext.defaultTeamPerspective;

  if (!ownTeamId && !ownTeamName && !ownTeamColor && !ownTeamSecondaryColor && !perspectiveTeam) {
    return undefined;
  }

  return {
    ...(ownTeamId ? { ownTeamId } : {}),
    ...(ownTeamName ? { ownTeamName } : {}),
    ...(ownTeamColor ? { ownTeamColor } : {}),
    ...(ownTeamSecondaryColor ? { ownTeamSecondaryColor } : {}),
    ...(perspectiveTeam ? { perspectiveTeam } : {}),
  };
}
