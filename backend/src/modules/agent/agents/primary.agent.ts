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
 *    create-plan / execute-saved-plan + whoami_capabilities + a curated
 *    fast-path set.
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
import {
  ExecuteSavedPlanException,
  isExecuteSavedPlan,
} from '../exceptions/execute-saved-plan.exception.js';
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
  'create_plan',
  'execute_saved_plan',
  'plan_and_execute',
];

const PRIMARY_REASONING_CONTRACT = [
  '## Primary Reasoning Contract (2026)',
  '',
  '⚠️  **CRITICAL OVERRIDE — DELETE-BY-POSITION PATTERN (EXECUTE FIRST)**:',
  'If the user request contains ANY of these keywords: "delete", "remove", "clear", "take off", "erase" + timeline/content targets (post, video, stats, stat, schedule, game, news, recruiting, offer, commitment, visit, camp, recent, last):',
  '  0.1) STOP. Do NOT ask the user for postIds.',
  '  0.2) Determine scope from user intent: team scope → query `team_timeline_feed`; profile/personal scope → query `user_timeline_feed`.',
  '  0.3) Call `query_nxt1_data` immediately for that scope (team query includes teamId filter when available).',
  '  0.4) Parse response and select target items by recency/category ("last 2" = first 2 matching items, newest-first).',
  '  0.5) Extract IDs by `items[].feedType`: `POST` uses `items[].id`; `STAT`/`NEWS`/`SCHEDULE`/recruiting variants use `items[].referenceId` as source doc ID.',
  '  0.6) Include required ownership IDs in handoff: team scope includes `teamId` + `teamCode`; profile post deletes include `userId`; recruiting deletes must include resolved recruiting owner `userId` from the source Recruiting doc.',
  '  0.7) Delegate to `data_coordinator` with resolved IDs and target feedType(s). DO NOT ask user for anything.',
  '  EXAMPLE (team): "delete last 2 schedule items" → query team_timeline_feed → choose first 2 with feedType `SCHEDULE` → pass `referenceId` values for `delete_schedule_event`. EXAMPLE (profile): "delete my last 2 posts" → query user_timeline_feed → items[0].id/userId + items[1].id/userId → delegate. NEVER ask for IDs.',
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
  '8) Prefer `create_plan` whenever the request is goal-oriented and naturally breaks into multiple phases or reviewable steps, especially for plans, roadmaps, audits, playbooks, campaign sequencing, prioritization, comparisons with recommendations, or next-step workflows. This includes requests phrased as questions such as "what should I do", "how should we approach this", or "can you map out a plan".',
  '8b) Default to `create_plan` instead of a conversational answer or a single coordinator handoff when the work likely spans discovery -> analysis -> recommendation, analysis -> asset creation -> outreach, audit -> prioritization -> execution drafting, or any two-or-more phase workflow. `create_plan` drafts a saved plan first; execution starts only after the user explicitly approves it.',
  '8c) When `create_plan` returns `plan_created: true`, explain the plan conversationally in your own words using the returned summary + steps. Do NOT dump raw payload JSON to the user and do NOT call `execute_saved_plan` in that same turn.',
  '8d) For plan follow-ups in the same thread: if the user asks for revisions, call `create_plan` again with the requested changes. The backend will revise the existing draft in-place (same `plan_id`, incremented version). Explain what changed. If the user explicitly approves ("approve", "go", "run it"), call `execute_saved_plan` with that same current `plan_id`.',
  '9) The router must stay fast. Do NOT perform web research, crawling, or page scraping directly from the Primary Agent.',
  '   - If the request needs external web acquisition, deep page discovery, crawling, or scraping, delegate to `data_coordinator`.',
  '   - If the request needs external research plus strategic interpretation or recommendations, delegate to `strategy_coordinator`.',
  '10) NEVER call `analyze_video` directly from router; always use `delegate_to_coordinator` to hand video work to the right specialist:',
  '    - `performance_coordinator` for film analysis, technique breakdowns, scouting, and player evaluation.',
  '    - `strategy_coordinator` for strategic interpretation, planning recommendations, and executive summaries from video.',
  '    - `brand_coordinator` for creative/video-content outputs (social edits, thumbnails, branded storytelling assets).',
  '10i) NEVER call `generate_graphic` directly from router. ALL creative image/poster/thumbnail/social visual requests must be delegated to `brand_coordinator` via `delegate_to_coordinator`.',
  '10a) URL ingestion routing rule (CRITICAL):',
  '    - When the user provides any external link and asks to extract, import, analyze, or post media, enforce DIRECT-FIRST acquisition.',
  '    - Delegate link/media ingestion to `data_coordinator` first so it can run `classify_media_url` and follow `nextStep` exactly.',
  '    - Live view is fallback-only: use it only when classifier strategy is `live_view_required`, or when direct acquisition fails and no staged media URL exists.',
  '    - If direct extraction returns staged media URLs, treat those as authoritative assets and proceed without opening live view.',
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
  '10d) Chart routing rule:',
  '    - Requests for charts, graphs, dashboards, funnels, pipeline maps, process visuals, or spreadsheet-style data views are NOT brand requests by default.',
  '    - Use `delegate_to_coordinator` with `strategy_coordinator` for strategic or conceptual visuals such as recruiting pipelines, stage funnels, operating models, and planning dashboards.',
  '    - Use `delegate_to_coordinator` with `data_coordinator` when the chart should be built from imported, scraped, or normalized datasets.',
  '    - Only use `brand_coordinator` when the user explicitly wants a creative poster, social graphic, thumbnail, or image-first branded asset rather than a data/process chart.',
  '10e) Analytics event routing rule:',
  '    - Requests for raw analytics events, Agent X activity so far, outreach event history, engagement summaries, exported activity data, or spreadsheet/table views of activity should go to `data_coordinator`.',
  '    - Requests for interpretation, recommendations, strategic takeaways, or executive-style dashboard narratives from analytics should go to `strategy_coordinator`.',
  '10f) Memory persistence rule:',
  '    - If the user states a durable preference, goal, recruiting constraint, performance baseline, or recurring workflow choice, call `save_memory` immediately with a concise third-person fact. Do not wait for explicit "remember this" phrasing.',
  '10f-ii) Memory recall rule:',
  '    - Call `search_memories` before responding in ANY of these situations (mandatory, not discretionary):',
  '      a) Explicit continuity signals — user says "like we discussed", "remember when", "last time", "you told me", "we agreed", "as I mentioned", or anything implying a prior session.',
  '      b) Past-state questions — "what was my...", "did I ever...", "what goals did I set", "what have I done so far", "show me my history", "what was the plan we made".',
  '      c) Personalization or preference requests — "make it like I like it", "you know my style", "based on what you know about me", "what do you think is best for me", "what should I focus on".',
  '      d) Strategic or goal-oriented planning — when the user asks for a strategy, roadmap, next steps, or plan and you need to know their existing goals, constraints, sport, position, or recurring priorities to give a high-quality answer.',
  "      e) Anything where a generic answer would be clearly inferior to a personalized one — if knowing the user's history would meaningfully improve your response, call `search_memories` first.",
  '    - Do NOT skip this step and respond generically when personalized context would make the answer significantly better.',
  '10g) Router analytics rule:',
  '    - Ensure one analytics event exists for each successful, user-visible outcome. If the owning coordinator or mutation tool already recorded the domain event, do not duplicate it; otherwise call `track_analytics_event` once before the final response.',
  '    - Domain mapping: outreach and coach communication -> `recruiting` or `communication`; film, stats, scouting, and performance outputs -> `performance`; NIL and sponsorship work -> `nil`; plans, posts, profile/team activity, and general Agent X workflow completion -> `engagement`.',
  '10h) Analytics payload rule:',
  '    - For team or organization work, use the target `subjectId` and matching `subjectType`; otherwise default to the user. Include payload keys like `coordinatorId`, `workflow`, `outcome`, `entityId`, `teamId`, `organizationId`, `toolName`, and `artifactType` when known.',
  '11) When delegating, provide a single objective sentence as the handoff payload.',
  '12) After `delegate_to_coordinator`, `create_plan`, or `execute_saved_plan`, inspect the tool result JSON fields `user_already_received_response` and `follow_up_required`.',
  '13) If `user_already_received_response` is true and `follow_up_required` is false, do NOT add any extra narration, recap, or postamble. End your turn immediately.',
  '14) Only add follow-up text when `follow_up_required` is true (for example failures or missing output). Keep it to one concise recovery sentence.',
  '15) `enqueue_heavy_task` — background queue escalation rules (STRICT):',
  "   15a) ONLY call `enqueue_heavy_task` when the user's request clearly requires an operation that would take longer than 5 minutes to complete. If the operation can finish in under 5 minutes, handle it through normal coordinator delegation or plan mode — never queue it.",
  '   15b) DO NOT call `enqueue_heavy_task` for requests that can be handled conversationally, through coordinator delegation, or via a saved plan — those are always the preferred paths.',
  '   15c) NEVER call `enqueue_heavy_task` when the current mode is `planner`. In planner mode the user wants a reviewable plan, not background execution. Use `create_plan` instead.',
  '   15d) When you enqueue a heavy task, immediately tell the user what was queued, that it is running in the background, and that they will receive a notification when it is done. Do not add further tool calls after enqueuing.',
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
  readonly name = 'Chief of Staff';

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
    // Fast routing tier — no thinking. Primary handles streaming ReAct loop
    // where thinking tokens disrupt chat flow. Deep reasoning lives in Planner.
    return { ...MODEL_ROUTING_DEFAULTS['routing'], maxTokens: 4096, temperature: 0 };
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
      (context.mode as 'chat' | 'creator' | 'analyzer' | 'planner' | 'commander' | undefined) ??
      undefined;

    const prompt = buildSystemPrompt({
      identity: AGENT_X_IDENTITY,
      capabilityCard,
      userSummary,
      ...(modeAddendum ? { modeAddendum } : {}),
    });

    return `${prompt}\n\n${PRIMARY_REASONING_CONTRACT}`;
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
   * `delegate_to_coordinator`, `create_plan`, and `execute_saved_plan` tools. Dispatch through
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

    // Safety fallback: some model generations may still attempt analyze_video
    // even when router-only tools are exposed. Force coordinator dispatch.
    if (toolCall.function.name === 'analyze_video') {
      return this.handleDirectVideoAnalysisFallback(
        toolCall,
        userId,
        sessionContext?.operationId,
        approvalGate,
        onStreamEvent,
        signal
      );
    }

    // Safety fallback: some model generations may still attempt generate_graphic
    // even when router-only tools are exposed. Force brand delegation.
    if (toolCall.function.name === 'generate_graphic') {
      return this.handleDirectGraphicGenerationFallback(
        toolCall,
        userId,
        sessionContext?.operationId,
        approvalGate,
        onStreamEvent,
        signal
      );
    }

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
      if (isExecuteSavedPlan(err)) {
        const result = await this.handleSavedPlanDispatch(
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

  private async handleDirectVideoAnalysisFallback(
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
        error: 'Video delegation unavailable: missing per-run state.',
      });
    }

    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(toolCall.function.arguments) as unknown;
      if (parsed && typeof parsed === 'object') {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      // Keep fallback resilient even if model emits malformed JSON.
      args = {};
    }

    const prompt =
      typeof args['prompt'] === 'string' && args['prompt'].trim().length > 0
        ? args['prompt'].trim()
        : 'Analyze the provided video and return user-ready findings.';
    const url =
      typeof args['url'] === 'string' && args['url'].trim().length > 0
        ? args['url'].trim()
        : undefined;

    const coordinatorId = this.resolveVideoAnalysisCoordinator(`${ctx.enrichedIntent}\n${prompt}`);
    const goal = `Analyze the provided video and deliver ${coordinatorId.replace('_', ' ')} output for the user.`;
    const structuredPayload = {
      ...(url ? { url } : {}),
      prompt,
      ...(args['artifact'] && typeof args['artifact'] === 'object'
        ? { artifact: args['artifact'] }
        : {}),
      source: 'router_analyze_video_fallback',
    };

    onStreamEvent?.({
      type: 'tool_result',
      agentId: this.id,
      stepId: toolCall.id,
      toolName: toolCall.function.name,
      stageType: 'tool',
      toolSuccess: true,
      toolResult: {
        delegated: true,
        coordinatorId,
      },
      icon: this.resolveToolStepIcon(toolCall.function.name),
      message: this.resolveToolInvocationLabel(toolCall.function.name, toolCall.function.arguments),
    });

    const result = await this.dispatcher.runCoordinator(
      coordinatorId,
      goal,
      ctx,
      structuredPayload
    );

    const userAlreadyReceivedResponse = result.userAlreadyReceivedResponse === true;
    const followUpRequired = !result.success && !userAlreadyReceivedResponse;
    return JSON.stringify({
      success: result.success,
      data: {
        dispatch_kind: result.dispatchKind ?? 'coordinator',
        coordinator_id: coordinatorId,
        user_already_received_response: userAlreadyReceivedResponse,
        follow_up_required: followUpRequired,
        follow_up_hint: followUpRequired
          ? 'Coordinator dispatch did not complete successfully. Provide a single recovery sentence and next step.'
          : 'No follow-up needed because the coordinator already responded directly to the user.',
        coordinator_observation: result.observation,
        ...(result.coordinatorArtifacts && Object.keys(result.coordinatorArtifacts).length > 0
          ? { coordinator_artifacts: result.coordinatorArtifacts }
          : {}),
        streamed_delta_count: result.streamedDeltaCount ?? 0,
        streamed_char_count: result.streamedCharCount ?? 0,
      },
    });
  }

  private resolveVideoAnalysisCoordinator(
    text: string
  ): Extract<
    AgentIdentifier,
    'brand_coordinator' | 'performance_coordinator' | 'strategy_coordinator'
  > {
    const normalized = text.toLowerCase();
    const brandSignals =
      /brand|branding|creative|thumbnail|social|marketing|poster|promo|highlight reel|storytelling/.test(
        normalized
      );
    if (brandSignals) {
      return 'brand_coordinator';
    }

    const strategySignals =
      /strategy|strategic|plan|roadmap|recommendation|executive|insight|summary|decision/.test(
        normalized
      );
    if (strategySignals) {
      return 'strategy_coordinator';
    }

    return 'performance_coordinator';
  }

  private async handleDirectGraphicGenerationFallback(
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
        error: 'Graphic delegation unavailable: missing per-run state.',
      });
    }

    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(toolCall.function.arguments) as unknown;
      if (parsed && typeof parsed === 'object') {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      // Keep fallback resilient even if model emits malformed JSON.
      args = {};
    }

    const coordinatorId: Extract<AgentIdentifier, 'brand_coordinator'> = 'brand_coordinator';
    const goal =
      'Create the requested branded visual asset and deliver final user-ready output with media URL(s).';

    const structuredPayload = {
      ...args,
      source: 'router_generate_graphic_fallback',
    };

    onStreamEvent?.({
      type: 'tool_result',
      agentId: this.id,
      stepId: toolCall.id,
      toolName: toolCall.function.name,
      stageType: 'tool',
      toolSuccess: true,
      toolResult: {
        delegated: true,
        coordinatorId,
      },
      icon: this.resolveToolStepIcon(toolCall.function.name),
      message: this.resolveToolInvocationLabel(toolCall.function.name, toolCall.function.arguments),
    });

    const result = await this.dispatcher.runCoordinator(
      coordinatorId,
      goal,
      ctx,
      structuredPayload
    );

    const userAlreadyReceivedResponse = result.userAlreadyReceivedResponse === true;
    const followUpRequired = !result.success && !userAlreadyReceivedResponse;
    return JSON.stringify({
      success: result.success,
      data: {
        dispatch_kind: result.dispatchKind ?? 'coordinator',
        coordinator_id: coordinatorId,
        user_already_received_response: userAlreadyReceivedResponse,
        follow_up_required: followUpRequired,
        follow_up_hint: followUpRequired
          ? 'Coordinator dispatch did not complete successfully. Provide a single recovery sentence and next step.'
          : 'No follow-up needed because the coordinator already responded directly to the user.',
        coordinator_observation: result.observation,
        ...(result.coordinatorArtifacts && Object.keys(result.coordinatorArtifacts).length > 0
          ? { coordinator_artifacts: result.coordinatorArtifacts }
          : {}),
        streamed_delta_count: result.streamedDeltaCount ?? 0,
        streamed_char_count: result.streamedCharCount ?? 0,
      },
    });
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
      dispatchCtx,
      err.payload.structuredPayload
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
    let parsedPlanObservation: Record<string, unknown> | null = null;
    try {
      const candidate = JSON.parse(result.observation) as unknown;
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        parsedPlanObservation = candidate as Record<string, unknown>;
      }
    } catch {
      parsedPlanObservation = null;
    }

    const planId =
      parsedPlanObservation && typeof parsedPlanObservation['plan_id'] === 'string'
        ? parsedPlanObservation['plan_id']
        : null;
    const planSummary =
      parsedPlanObservation && typeof parsedPlanObservation['summary'] === 'string'
        ? parsedPlanObservation['summary']
        : null;
    const planCreated =
      parsedPlanObservation && typeof parsedPlanObservation['plan_created'] === 'boolean'
        ? parsedPlanObservation['plan_created']
        : result.success;
    const planRevised =
      parsedPlanObservation && typeof parsedPlanObservation['plan_revised'] === 'boolean'
        ? parsedPlanObservation['plan_revised']
        : false;
    const planVersion =
      parsedPlanObservation && typeof parsedPlanObservation['plan_version'] === 'number'
        ? parsedPlanObservation['plan_version']
        : null;
    const planSteps =
      parsedPlanObservation && Array.isArray(parsedPlanObservation['steps'])
        ? parsedPlanObservation['steps']
        : null;

    const userAlreadyReceivedResponse = result.userAlreadyReceivedResponse === true;
    const followUpRequired = !result.success && !userAlreadyReceivedResponse;
    return JSON.stringify({
      success: result.success,
      data: {
        dispatch_kind: result.dispatchKind ?? 'plan',
        plan_created: planCreated,
        plan_revised: planRevised,
        ...(planId ? { plan_id: planId } : {}),
        ...(planVersion !== null ? { plan_version: planVersion } : {}),
        ...(planSummary ? { plan_summary: planSummary } : {}),
        ...(planSteps ? { plan_steps: planSteps } : {}),
        user_already_received_response: userAlreadyReceivedResponse,
        follow_up_required: followUpRequired,
        follow_up_hint: followUpRequired
          ? 'Plan execution did not complete successfully. Provide a single recovery sentence and next step.'
          : planRevised
            ? 'You revised the current saved plan in place. Briefly explain what changed from the previous version, then ask the user to approve execution or request more revisions. Do not execute yet.'
            : 'Plan drafted successfully. Explain the plan in your own words, then ask the user to approve execution or request revisions. Do not execute yet.',
        plan_observation: parsedPlanObservation ?? result.observation,
        streamed_delta_count: result.streamedDeltaCount ?? 0,
        streamed_char_count: result.streamedCharCount ?? 0,
      },
    });
  }

  private async handleSavedPlanDispatch(
    err: ExecuteSavedPlanException,
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
        error: 'Saved plan execution unavailable: missing per-run state.',
      });
    }
    onStreamEvent?.({
      type: 'tool_result',
      agentId: this.id,
      stepId: toolCall.id,
      toolName: toolCall.function.name,
      stageType: 'tool',
      toolSuccess: true,
      toolResult: {
        planId: err.payload.planId,
        executing: true,
      },
      icon: this.resolveToolStepIcon(toolCall.function.name),
      message: this.resolveToolInvocationLabel(toolCall.function.name, toolCall.function.arguments),
    });
    const result = await this.dispatcher.runApprovedPlan(err.payload.planId, ctx);
    const userAlreadyReceivedResponse = result.userAlreadyReceivedResponse === true;
    const followUpRequired = !result.success && !userAlreadyReceivedResponse;
    return JSON.stringify({
      success: result.success,
      data: {
        dispatch_kind: result.dispatchKind ?? 'saved_plan',
        user_already_received_response: userAlreadyReceivedResponse,
        follow_up_required: followUpRequired,
        follow_up_hint: followUpRequired
          ? 'Saved plan execution did not complete successfully. Provide a single recovery sentence and next step.'
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
        : toolName === 'plan_and_execute' ||
            toolName === 'create_plan' ||
            toolName === 'execute_saved_plan'
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
