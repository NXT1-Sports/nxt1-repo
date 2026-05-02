/**
 * @fileoverview Primary Agent — The Single Front-Door Agent
 * @module @nxt1/backend/modules/agent/agents
 *
 * Replaces the legacy 3-agent triage pipeline (Classifier → Conversation →
 * Planner) with a single, streaming, native tool-calling agent. Modeled after
 * OpenAI Assistants v2 / Anthropic Computer Use / Cursor.
 *
 * Architecture:
 *  - Reuses the BaseAgent ReAct loop verbatim — streaming, tool validation,
 *    yield/approval handling all unchanged.
 *  - System prompt is composed from {@link AGENT_X_IDENTITY} + the live
 *    {@link CapabilityRegistry} compact card + a one-paragraph user summary.
 *    No template strings; the model writes its own transitions.
 *  - Available tools = lazy-context tools + delegate-to-coordinator +
 *    plan-and-execute + whoami_capabilities + a curated fast-path set.
 *  - Coordinators are NOT in the Primary's tool list directly; they're
 *    dispatched via {@link DelegateToCoordinatorTool} which throws a
 *    control-flow exception this class intercepts and routes through the
 *    {@link PrimaryDispatcher}.
 *
 * Identity: keeps `id = 'router'` for event back-compat with the existing
 * frontend (which keys 5-phase progress UI off the `router` agentId). The
 * class name and behavior, not the wire-level identifier, is what changes.
 */

import {
  AGENT_X_IDENTITY,
  buildSystemPrompt,
  type AgentIdentifier,
  type AgentOperationResult,
  type AgentSessionContext,
  type AgentToolDefinition,
  type ModelRoutingConfig,
  MODEL_ROUTING_DEFAULTS,
} from '@nxt1/core';
import { BaseAgent, type ToolSessionContext } from './base.agent.js';
import type { CapabilityRegistry } from '../capabilities/capability-registry.js';
import { getToolLoopDetector } from '../services/tool-loop-detector.service.js';
import type { PrimaryDispatcher, PrimaryDispatchContext } from './primary-dispatcher.js';
import {
  DelegateToCoordinatorException,
  isDelegateToCoordinator,
} from '../exceptions/delegate-to-coordinator.exception.js';
import {
  PlanAndExecuteException,
  isPlanAndExecute,
} from '../exceptions/plan-and-execute.exception.js';
import type { LLMToolCall, LLMMessage } from '../llm/llm.types.js';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { ApprovalGateService } from '../services/approval-gate.service.js';
import type { OnStreamEvent } from '../queue/event-writer.js';
import type { AskUserToolContext } from '../tools/system/ask-user.tool.js';
import type { SkillRegistry } from '../skills/skill-registry.js';
import { getCachedAgentAppConfig } from '../config/agent-app-config.js';
import { getRouterToolPolicy } from './tool-policy.js';
import { getOperationMemoryService } from '../services/operation-memory.service.js';

/**
 * System-only tools the Primary has in addition to the shared router policy.
 * These are never in the policy (they bypass policy checks via category =
 * 'system' in BaseAgent) but are listed here so buildPrimaryToolDefinitions
 * can include them by name when filtering the registry.
 */
const PRIMARY_SYSTEM_TOOLS: readonly string[] = [
  'whoami_capabilities',
  'delegate_to_coordinator',
  'plan_and_execute',
];

const PRIMARY_REASONING_CONTRACT = [
  '## Primary Reasoning Contract (2026)',
  '',
  '⚠️  **CRITICAL OVERRIDE — DELETE-BY-POSITION PATTERN (EXECUTE FIRST)**:',
  'If the user request contains ANY of these keywords: "delete", "remove", "clear", "take off", "erase" + ANY of: "post", "posts", "video", "content", "last", "recent", "recent posts", "team posts":',
  '  0.1) STOP. Do NOT ask the user for postIds.',
  '  0.2) IMMEDIATELY call `query_nxt1_data` with parameters: view="team_timeline_feed", teamId from context.',
  '  0.3) Parse the response. Each post item contains: id (postId), teamId, teamCode. Extract all three fields for the posts matching the user\'s target ("last 2" = first 2 items, already sorted newest-first).',
  '  0.4) Delegate to `data_coordinator` with resolved postIds, teamId, teamCode in the handoff. DO NOT ask user for anything.',
  '  EXAMPLE: "delete the last 2 posts" → call query_nxt1_data view=team_timeline_feed → items[0].id + items[0].teamId + items[0].teamCode, items[1].id same → delegate both to data_coordinator. NEVER ask for IDs.',
  '',
  '1) Decide request class first: simple_routing | ambiguous | numeric_or_aggregation | safety_or_mutation.',
  '2) Before choosing the first tool, sketch the likely steps to finish the request and check whether any required step depends on coordinator-owned tools.',
  '3) For simple_routing: route immediately when the answer can be completed from router-owned tools without clarification overhead.',
  '4) For ambiguous or safety_or_mutation: ask concise clarification questions before acting.',
  '5) For numeric_or_aggregation: prefer deterministic tool-backed computation before answering.',
  '6) Never hallucinate counts/totals; if data is missing, ask for the minimum missing detail.',
  '6b) Ask User Decision Matrix (CRITICAL):',
  '   - Call `ask_user` when required fields are missing and cannot be resolved from context or one deterministic lookup.',
  '   - Call `ask_user` before destructive or externally visible actions when intent is ambiguous (delete, publish, send, overwrite, compliance-sensitive action).',
  '   - Do NOT call `ask_user` for data already present in task context, prior tool results, or deterministic lookups.',
  '   - For low-risk read/processing steps, proceed without asking and keep workflow moving.',
  '   - Ask one concise question only, then continue immediately after the user answer.',
  '7) Tool path decision for recruiting and college lookup:',
  "   - Simple factual lookup (find programs by division/state, look up a coach's contact): use `search_colleges` or `search_college_coaches` directly — no delegation needed.",
  '   - Full recruiting workflow (outreach drafting, email sequences, presentation generation, multi-step strategy): use `delegate_to_coordinator` with coordinatorId=`recruiting_coordinator`.',
  '8) Prefer `plan_and_execute` when the work clearly spans two or more specialist coordinators in sequence (e.g. film analysis → brand asset → outreach email).',
  '9) Treat `search_web` and `firecrawl_search_web` as fallback tools only when NXT1 database and platform tools cannot satisfy the request.',
  '10) NEVER call `analyze_video` directly from router; always use `delegate_to_coordinator` with coordinatorId=`performance_coordinator` for film analysis.',
  '10b) Tool path decision for ANY write/post/data-save operation:',
  '    - Writing posts (team posts, timeline posts, announcements, season recaps): delegate to `data_coordinator`.',
  '    - Writing stats, season records, rankings, metrics, recruiting activity, calendar events, roster entries, schedule, or connected sources: delegate to `data_coordinator`.',
  '    - Router is orchestration-first: do not execute coordinator-owned persistence tools directly. Delegate write/data-save work to the owning coordinator.',
  '    - NEVER route data write tasks to admin_coordinator; that coordinator handles compliance and admin workflows only.',
  '10c) Role-aware write intent resolution:',
  '    - The enriched context includes a "Role:" field. If it shows Role: coach or Role: director, treat any generic post / update / publish / announce request as targeting the TEAM by default.',
  '    - Default team publishing path: delegate to `data_coordinator` for a team post unless the user explicitly asks for personal profile/timeline publishing.',
  '    - Player-level profile/stat updates must target a named player. If the request does not clearly identify which player, ask for clarification before delegating.',
  '    - For athletes: default write target is always their own profile. No change to current routing.',
  '11) When delegating, provide a single objective sentence as the handoff payload.',
  '12) After `delegate_to_coordinator` or `plan_and_execute`, inspect the tool result JSON fields `user_already_received_response` and `follow_up_required`.',
  '13) If `user_already_received_response` is true and `follow_up_required` is false, do NOT add any extra narration, recap, or postamble. End your turn immediately.',
  '14) Only add follow-up text when `follow_up_required` is true (for example failures or missing output). Keep it to one concise recovery sentence.',
].join('\n');

interface PrimaryToolSelectionTrace {
  readonly toolName: string;
  readonly reasonPath: 'direct_lookup' | 'delegation' | 'planning' | 'system';
  readonly score: null;
  readonly timestamp: string;
}

interface PrimaryToolExposureTrace {
  readonly exposedTools: readonly string[];
  readonly selectedTools: readonly PrimaryToolSelectionTrace[];
}

interface PrimaryAgentSessionState {
  readonly operationId: string;
  readonly userId: string;
  readonly sessionContext: AgentSessionContext;
  readonly enrichedIntent: string;
  readonly approvalGate?: ApprovalGateService;
  readonly onStreamEvent?: OnStreamEvent;
  readonly signal?: AbortSignal;
}

export class PrimaryAgent extends BaseAgent {
  /**
   * Wire-level identifier kept as `'router'` for back-compat with frontend
   * progress events. The class name and behavior are what changed.
   */
  readonly id: AgentIdentifier = 'router';
  readonly name = 'Primary Agent';

  /**
   * Per-run state stash keyed by operationId. Set by the AgentRouter just
   * before calling `execute()`, read by the executeTool override when it
   * needs to dispatch a coordinator or multi-step plan. Cleared by the
   * router after the run terminates.
   */
  private readonly sessionStates = new Map<string, PrimaryAgentSessionState>();
  private readonly toolExposureTraceByOperation = new Map<string, PrimaryToolExposureTrace>();

  constructor(
    private readonly capabilities: CapabilityRegistry,
    private readonly dispatcher: PrimaryDispatcher
  ) {
    super();
  }

  // ─── Per-run state binding ──────────────────────────────────────────────

  beginRun(state: PrimaryAgentSessionState): void {
    this.sessionStates.set(state.operationId, state);
    this.toolExposureTraceByOperation.set(state.operationId, {
      exposedTools: [...getRouterToolPolicy(), ...PRIMARY_SYSTEM_TOOLS],
      selectedTools: [],
    });
  }

  endRun(operationId: string): void {
    this.sessionStates.delete(operationId);
    this.toolExposureTraceByOperation.delete(operationId);
    // Release per-operation loop-detector state to prevent leaks.
    getToolLoopDetector().release(operationId);
  }

  // ─── BaseAgent contract ─────────────────────────────────────────────────

  getModelRouting(): ModelRoutingConfig {
    const cfg = getCachedAgentAppConfig();
    const tier = cfg.primary?.modelTier ?? 'routing';
    return MODEL_ROUTING_DEFAULTS[tier] ?? MODEL_ROUTING_DEFAULTS['routing'];
  }

  override getToolConcurrency(): number {
    const cfg = getCachedAgentAppConfig();
    return cfg.primary?.toolConcurrency ?? 3;
  }

  getAvailableTools(): readonly string[] {
    return [...getRouterToolPolicy(), ...PRIMARY_SYSTEM_TOOLS];
  }

  override getSkills(): readonly string[] {
    return ['global_knowledge'];
  }

  getSystemPrompt(context: AgentSessionContext): string {
    const cfg = getCachedAgentAppConfig();
    const useCompact = cfg.capabilityCard?.useCompactInPrompt ?? true;
    const card = this.capabilities.current();
    const capabilityCard = useCompact
      ? card.rendered.compactMarkdown
      : card.rendered.detailedMarkdown;

    const userSummary = this.buildUserSummary(context);
    const modeAddendum =
      (context.mode as
        | 'chat'
        | 'creator'
        | 'analyzer'
        | 'recruiter'
        | 'planner'
        | 'commander'
        | undefined) ?? undefined;

    const prompt = buildSystemPrompt({
      identity: AGENT_X_IDENTITY,
      capabilityCard,
      userSummary,
      ...(modeAddendum ? { modeAddendum } : {}),
    });

    return this.applyConfiguredPrimaryPrompt(`${prompt}\n\n${PRIMARY_REASONING_CONTRACT}`);
  }

  override async execute(
    intent: string,
    context: AgentSessionContext,
    toolDefinitions: readonly AgentToolDefinition[],
    llm?: OpenRouterService,
    toolRegistry?: ToolRegistry,
    skillRegistry?: SkillRegistry,
    onStreamEvent?: OnStreamEvent,
    approvalGate?: ApprovalGateService
  ): Promise<AgentOperationResult> {
    const result = await super.execute(
      intent,
      context,
      toolDefinitions,
      llm,
      toolRegistry,
      skillRegistry,
      onStreamEvent,
      approvalGate
    );

    const operationId = context.operationId;
    if (!operationId) return result;

    const trace = this.toolExposureTraceByOperation.get(operationId);
    if (!trace) return result;

    const currentData = result.data ?? {};
    const currentDebug =
      currentData['debug'] && typeof currentData['debug'] === 'object'
        ? (currentData['debug'] as Record<string, unknown>)
        : {};

    return {
      ...result,
      data: {
        ...currentData,
        debug: {
          ...currentDebug,
          toolExposureTrace: {
            exposedTools: trace.exposedTools,
            selectedTools: trace.selectedTools,
          },
        },
      },
    };
  }

  // ─── Tool execution interception ────────────────────────────────────────

  /**
   * Intercept Primary-only control-flow exceptions thrown by
   * `delegate_to_coordinator` and `plan_and_execute` tools. Dispatch through
   * the {@link PrimaryDispatcher} and return the coordinator/plan result as
   * the next ReAct observation so the loop continues seamlessly.
   */
  protected override async executeTool(
    toolCall: LLMToolCall,
    registry: ToolRegistry,
    userId: string,
    signal?: AbortSignal,
    yieldContext?: AskUserToolContext,
    sessionContext?: ToolSessionContext,
    currentMessages?: readonly LLMMessage[],
    approvalGate?: ApprovalGateService,
    onStreamEvent?: OnStreamEvent
  ): Promise<string> {
    this.recordToolSelectionTrace(sessionContext?.operationId, toolCall.function.name);
    try {
      return await super.executeTool(
        toolCall,
        registry,
        userId,
        signal,
        yieldContext,
        sessionContext,
        currentMessages,
        approvalGate,
        onStreamEvent
      );
    } catch (err) {
      if (isDelegateToCoordinator(err)) {
        const result = await this.handleCoordinatorDispatch(
          err,
          toolCall,
          userId,
          sessionContext?.operationId,
          approvalGate,
          onStreamEvent,
          signal,
          currentMessages
        );
        return result;
      }
      if (isPlanAndExecute(err)) {
        const result = await this.handlePlanDispatch(
          err,
          toolCall,
          userId,
          sessionContext?.operationId,
          approvalGate,
          onStreamEvent,
          signal
        );
        return result;
      }
      throw err;
    }
  }

  // ─── Dispatcher Integration ─────────────────────────────────────────────

  private async handleCoordinatorDispatch(
    err: DelegateToCoordinatorException,
    toolCall: LLMToolCall,
    userId: string,
    operationId: string | undefined,
    approvalGate: ApprovalGateService | undefined,
    onStreamEvent: OnStreamEvent | undefined,
    signal: AbortSignal | undefined,
    currentMessages?: readonly LLMMessage[]
  ): Promise<string> {
    const ctx = this.resolveDispatchContext(
      operationId,
      userId,
      approvalGate,
      onStreamEvent,
      signal
    );
    if (!ctx) {
      return JSON.stringify({
        success: false,
        error: 'Coordinator dispatch unavailable: missing per-run state.',
      });
    }

    // ── Tier 1: Forward Primary’s in-turn tool artifacts to the coordinator ──
    // Scan current-turn messages for artifacts Primary already produced
    // (e.g. extract_live_view_media result) so the coordinator receives them
    // in enrichedIntent and skips redundant re-extraction.
    let enrichedIntent = ctx.enrichedIntent;
    if (currentMessages?.length) {
      const priorArtifacts: Record<string, unknown> = {};
      for (const msg of currentMessages) {
        if (msg.role === 'tool' && typeof msg.content === 'string') {
          try {
            const parsed = JSON.parse(msg.content) as Record<string, unknown>;
            if (
              parsed['success'] === true &&
              typeof parsed['data'] === 'object' &&
              parsed['data'] !== null
            ) {
              const data = parsed['data'] as Record<string, unknown>;
              const keysToCapture = [
                'imageUrl',
                'storagePath',
                'cloudflareVideoId',
                'videoUrl',
                'outputUrl',
                'downloadUrl',
                'pdfUrl',
                'exportUrl',
                'audioUrl',
                'thumbnailUrl',
                'mediaArtifact',
              ] as const;
              for (const key of keysToCapture) {
                if (data[key] !== undefined) priorArtifacts[key] = data[key];
              }
            }
          } catch {
            /* skip unparseable tool messages */
          }
        }
      }
      if (Object.keys(priorArtifacts).length > 0) {
        enrichedIntent +=
          '\n\n[Prior Tool Results from Primary — use these directly, do NOT re-extract or repeat the same work]:\n' +
          JSON.stringify(priorArtifacts).slice(0, 1_000);
      }
    }
    const dispatchCtx = enrichedIntent !== ctx.enrichedIntent ? { ...ctx, enrichedIntent } : ctx;

    // Mark the parent tool step complete as soon as the handoff is accepted.
    // The delegated coordinator then streams its own work as follow-on steps.
    onStreamEvent?.({
      type: 'tool_result',
      agentId: this.id,
      stepId: toolCall.id,
      toolName: toolCall.function.name,
      stageType: 'tool',
      toolSuccess: true,
      toolResult: {
        delegated: true,
        coordinatorId: err.payload.coordinatorId,
      },
      icon: this.resolveToolStepIcon(toolCall.function.name),
      message: this.resolveToolInvocationLabel(toolCall.function.name, toolCall.function.arguments),
    });
    // ── Tier 5: Log coordinator execution start in OperationMemory ──────────
    const operationMemory = getOperationMemoryService();
    const completeTrace = operationId
      ? operationMemory.logCoordinatorExecution(
          operationId,
          err.payload.coordinatorId,
          err.payload.goal
        )
      : null;

    const result = await this.dispatcher.runCoordinator(
      err.payload.coordinatorId,
      err.payload.goal,
      dispatchCtx
    );

    // Record completion with artifacts produced
    completeTrace?.({
      success: result.success,
      artifactsProduced: result.coordinatorArtifacts
        ? Object.keys(result.coordinatorArtifacts)
        : [],
    });
    const userAlreadyReceivedResponse = result.userAlreadyReceivedResponse === true;
    const followUpRequired = !result.success && !userAlreadyReceivedResponse;
    return JSON.stringify({
      success: result.success,
      data: {
        dispatch_kind: result.dispatchKind ?? 'coordinator',
        coordinator_id: err.payload.coordinatorId,
        user_already_received_response: userAlreadyReceivedResponse,
        follow_up_required: followUpRequired,
        follow_up_hint: followUpRequired
          ? 'Coordinator dispatch did not complete successfully. Provide a single recovery sentence and next step.'
          : 'No follow-up needed because the coordinator already responded directly to the user.',
        coordinator_observation: result.observation,
        // Tier 4: Surface artifacts the coordinator produced so Primary can
        // chain them into follow-up reasoning without a second extraction pass.
        ...(result.coordinatorArtifacts && Object.keys(result.coordinatorArtifacts).length > 0
          ? { coordinator_artifacts: result.coordinatorArtifacts }
          : {}),
        streamed_delta_count: result.streamedDeltaCount ?? 0,
        streamed_char_count: result.streamedCharCount ?? 0,
      },
    });
  }

  private async handlePlanDispatch(
    err: PlanAndExecuteException,
    toolCall: LLMToolCall,
    userId: string,
    operationId: string | undefined,
    approvalGate: ApprovalGateService | undefined,
    onStreamEvent: OnStreamEvent | undefined,
    signal: AbortSignal | undefined
  ): Promise<string> {
    const ctx = this.resolveDispatchContext(
      operationId,
      userId,
      approvalGate,
      onStreamEvent,
      signal
    );
    if (!ctx) {
      return JSON.stringify({
        success: false,
        error: 'Plan dispatch unavailable: missing per-run state.',
      });
    }
    // The planning handoff itself is complete once orchestration starts.
    onStreamEvent?.({
      type: 'tool_result',
      agentId: this.id,
      stepId: toolCall.id,
      toolName: toolCall.function.name,
      stageType: 'tool',
      toolSuccess: true,
      toolResult: {
        planned: true,
      },
      icon: this.resolveToolStepIcon(toolCall.function.name),
      message: this.resolveToolInvocationLabel(toolCall.function.name, toolCall.function.arguments),
    });
    const result = await this.dispatcher.runPlan(err.payload.goal, ctx);
    const userAlreadyReceivedResponse = result.userAlreadyReceivedResponse === true;
    const followUpRequired = !result.success && !userAlreadyReceivedResponse;
    return JSON.stringify({
      success: result.success,
      data: {
        dispatch_kind: result.dispatchKind ?? 'plan',
        user_already_received_response: userAlreadyReceivedResponse,
        follow_up_required: followUpRequired,
        follow_up_hint: followUpRequired
          ? 'Plan execution did not complete successfully. Provide a single recovery sentence and next step.'
          : 'No follow-up needed because delegated agents already streamed the user-facing response.',
        plan_observation: result.observation,
        streamed_delta_count: result.streamedDeltaCount ?? 0,
        streamed_char_count: result.streamedCharCount ?? 0,
      },
    });
  }

  private resolveDispatchContext(
    operationId: string | undefined,
    userId: string,
    approvalGate: ApprovalGateService | undefined,
    onStreamEvent: OnStreamEvent | undefined,
    signal: AbortSignal | undefined
  ): PrimaryDispatchContext | null {
    if (!operationId) return null;
    const state = this.sessionStates.get(operationId);
    if (!state) return null;
    return {
      operationId,
      userId,
      enrichedIntent: state.enrichedIntent,
      sessionContext: state.sessionContext,
      ...(approvalGate ? { approvalGate } : {}),
      ...(onStreamEvent ? { onStreamEvent } : {}),
      ...(signal ? { signal } : {}),
    };
  }

  private recordToolSelectionTrace(operationId: string | undefined, toolName: string): void {
    if (!operationId) return;
    const trace = this.toolExposureTraceByOperation.get(operationId);
    if (!trace) return;

    const reasonPath: PrimaryToolSelectionTrace['reasonPath'] =
      toolName === 'delegate_to_coordinator'
        ? 'delegation'
        : toolName === 'plan_and_execute'
          ? 'planning'
          : toolName === 'whoami_capabilities'
            ? 'system'
            : 'direct_lookup';

    const selectedTools = [
      ...trace.selectedTools,
      {
        toolName,
        reasonPath,
        score: null,
        timestamp: new Date().toISOString(),
      },
    ];

    this.toolExposureTraceByOperation.set(operationId, {
      exposedTools: trace.exposedTools,
      selectedTools,
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private buildUserSummary(context: AgentSessionContext): string {
    // The router enriches the intent with profile data; this is a tiny
    // header to give the model lightweight personalization. Deeper context
    // is fetched on-demand via `get_user_profile` (Tier B).
    const parts: string[] = [];
    parts.push(`User ID: \`${context.userId}\``);
    if (context.threadId) parts.push(`Thread: \`${context.threadId}\``);
    if (context.sessionId) parts.push(`Session: \`${context.sessionId}\``);
    if (context.mode) parts.push(`Mode: ${context.mode}`);
    return parts.join(' • ');
  }

  /**
   * Helper used to apply any operator-configured prompt override (e.g.
   * `prompts.primarySystemPrompt`). Named distinctly from the base class
   * `withConfiguredSystemPrompt` to avoid privacy collisions.
   */
  private applyConfiguredPrimaryPrompt(prompt: string): string {
    const cfg = getCachedAgentAppConfig();
    const overrideCandidates = [
      cfg.prompts?.primarySystemPrompt,
      cfg.prompts?.agentSystemPrompts?.router,
    ];
    const overrides = overrideCandidates.filter(
      (value, index, values): value is string =>
        typeof value === 'string' &&
        value.trim().length > 0 &&
        values.findIndex((candidate) => candidate === value) === index
    );

    if (overrides.length === 0) {
      return prompt;
    }

    return `${prompt}\n\n## Operator Additions\n${overrides.join('\n\n')}`;
  }

  /**
   * Toolset filter helper used by AgentRouter when building the tool
   * definitions for the Primary. The router still calls
   * `toolRegistry.getDefinitions(this.id, accessContext)` — this is just a
   * stable curated allowlist that downstream policy enforcement honors.
   */
  static curatedFastPathTools(): readonly string[] {
    return [...getRouterToolPolicy(), ...PRIMARY_SYSTEM_TOOLS];
  }

  /**
   * Used by callers that build `AgentToolDefinition[]` arrays for direct
   * Primary execution (e.g. the eventual `runPrimary` path). Delegates to
   * the registry; included here so callers don't need to know the curated
   * list manually.
   */
  static buildPrimaryToolDefinitions(registry: ToolRegistry): readonly AgentToolDefinition[] {
    const allowed = new Set([...getRouterToolPolicy(), ...PRIMARY_SYSTEM_TOOLS]);
    return registry
      .getDefinitions('router')
      .filter((def) => def.category === 'system' || allowed.has(def.name));
  }
}
