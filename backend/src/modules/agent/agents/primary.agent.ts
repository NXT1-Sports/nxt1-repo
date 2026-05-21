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
  type AgentToolAccessContext,
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
import { getRouterToolPolicy, isToolAllowedByPatterns } from './tool-policy.js';
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

const STRATEGY_ROUTER_FALLBACK_TOOLS = new Set([
  'get_gameplan',
  'list_gameplans',
  'create_play_diagram',
  'create_board_diagram',
  'write_playbooks',
  'save_gameplan',
  'list_film_reviews',
  'get_film_review',
  'save_film_review',
  'update_film_review',
  'delete_film_review',
  'add_film_review_annotation',
  'delete_film_review_annotation',
  'refresh_film_review_ai',
]);

const PRIMARY_AGENT_MODEL_OVERRIDE = '~anthropic/claude-sonnet-latest';

const PRIMARY_OPERATING_CONTRACT = [
  '## Primary Operating Contract (2026)',
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
  '',
  '   CRITICAL — Delegating a creation/write task to a coordinator IS always safety_or_mutation, never simple_routing:',
  '   Any request where a coordinator will create, save, or permanently write an artifact MUST be classified as safety_or_mutation.',
  '   This includes: "create a game plan", "build a playbook", "write a training program", "build a training framework", "create a standard training framework", "design plays", "make a scout report",',
  '   "draft emails / send outreach", "create an export or PDF", "build a drill board", "generate a schedule", "develop a training plan", "create a development program".',
  '   Reason: coordinators execute immediately on delegation — you are the last checkpoint before any persistent write happens.',
  '',
  '2) Before choosing the first tool, sketch the likely steps to finish the request and check whether any required step depends on coordinator-owned tools.',
  '3) For simple_routing: route immediately when the answer can be completed from router-owned tools without clarification overhead.',
  '4) For ambiguous or safety_or_mutation:',
  '   a) Identify the minimum required intake fields for the specific request type.',
  '      Game plan: opponent (confirmed name/ID) + date/week + focus scope + diagram preference.',
  '      Playbook: sport + team + play types + diagram preference.',
  '      Training program / Training framework: target teams or athletes + duration + phase goal + sports covered. Route to `performance_coordinator`.',
  '      Email/outreach: confirmed recipient(s) + goal/tone.',
  '      Export/PDF: audience + branding preference.',
  '      Play diagrams: sport + formation/concept + positions.',
  '   b) Fields already present in task context or resolvable in one deterministic lookup — do NOT ask.',
  '   c) Genuinely missing fields — write a single friendly prose question covering ALL gaps at once, then call `ask_user` and wait.',
  '   d) Once all required context is gathered, write a brief "Here is what I will do" summary and explicitly ask "Should I go ahead?"',
  '      before delegating to any coordinator for a creation/write task.',
  '   e) After the user confirms, delegate to the coordinator with full gathered context included in the handoff payload.',
  '',
  '   EXCEPTION — Skip step (d) confirmation but never skip intake when the user already said "yes", "go ahead", "do it",',
  '   "just create it", or equivalent affirmation in the same message as the original request.',
  '   EXCEPTION — Skip intake entirely for reads, searches, analysis, and lookups that produce no persistent output.',
  '',
  '5) For numeric_or_aggregation: prefer deterministic tool-backed computation before answering.',
  '6) Never hallucinate counts/totals; if data is missing, ask for the minimum missing detail.',
  '6b) Ask User Decision Matrix (CRITICAL):',
  '   - Call `ask_user` when required fields are missing and cannot be resolved from context or one deterministic lookup.',
  '   - Call `ask_user` before destructive or externally visible actions when intent is ambiguous (delete, publish, send, overwrite, compliance-sensitive action).',
  '   - Do NOT call `ask_user` for data already present in task context, prior tool results, or deterministic lookups.',
  '   - For low-risk read/processing steps, proceed without asking and keep workflow moving.',
  '   - Ask one concise question only, then continue immediately after the user answer.',
  '6c) Ask User 2-Step Pattern (MANDATORY when calling `ask_user`):',
  '   - STEP 1: First, write the full question to the user as ordinary conversational prose in your assistant message. Include any context, options, or examples the user needs. This is what the user reads in chat.',
  '   - STEP 2: THEN invoke the `ask_user` tool. The `question` argument is a SHORT (≤80 chars) label used only for push/SMS notifications — never repeat the full question there.',
  '   - NEVER call `ask_user` without first writing the question as prose. The yield bubble renders as a thin "Waiting for your reply…" affordance; the user only sees the question if you write it in your prose.',
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
  '    - `brand_coordinator` for ALL creative/brand video work: analyzing highlight or promo video for best moments, visual style, energy, and brand consistency; social edits, thumbnails, branded reels, and storytelling assets. When a user says "analyze my highlight video", "which clips should I use", "review my promo", "check the style of this video", or provides video with intent to create social/brand content → always route to brand_coordinator.',
  '10-live) Live-view film requests are coordinator-owned. If the user asks to watch, analyze, grade, report on, or summarize clips/plays/video from an already-open live-view page, delegate to `performance_coordinator` immediately. Do NOT call `interact_with_live_view` to scroll through clips or simulate watching. You may call `read_live_view` or `capture_live_view_screenshot` once for current page grounding, then delegate with that context. For "last N clips/plays" or bulk extraction: extract_live_view_playlist is currently DISABLED; coordinator will use interact_with_live_view + extract_live_view_media per clip.',
  '10i) NEVER call `generate_graphic` directly from router. ALL creative image/poster/thumbnail/social visual requests must be delegated to `brand_coordinator` via `delegate_to_coordinator`.',
  '10i-a) Brand color/logo source-of-truth rule (CRITICAL): for team/org graphic requests, resolve branding via `query_nxt1_data` snapshots in this order: `organization_profile_snapshot` first, then `team_profile_snapshot` only as fallback.',
  '10i-b) If organization primaryColor/secondaryColor exist, they override team colors. Do NOT present team colors as final when organization colors are available.',
  '10i-c) For brand requests, do NOT use `query_nxt1_platform_data` for color authority; use `query_nxt1_data` snapshots because they expose canonical branding fields (`logoUrl`, `primaryColor`, `secondaryColor`).',
  '10i-d) When delegating to brand_coordinator, pass structured_payload colors from organization snapshot when present; use team colors only if organization colors are missing.',
  '10j) CRITICAL OVERRIDE — Creative Video Workflow Routing:',
  '    - When the user request contains an action verb ("create", "make", "generate", "produce", "cut", "edit", "turn into", "convert", "make this") + video goal keyword ("highlight", "reel", "promo", "elite", "cinematic", "best moments", "recap", "teaser", "social video") + ANY video source (URL, attached video, internal video reference) → IMMEDIATELY delegate to `brand_coordinator` with objective "Turn [video source] into [goal]".',
  '    - Examples that trigger this rule:',
  '      • "create this video into an elite highlight video" + URL → delegate to brand_coordinator',
  '      • "make a highlight reel from this Twitter video" + URL → delegate to brand_coordinator',
  '      • "generate a promo from my game film" → delegate to brand_coordinator',
  '      • "turn these clips into a cinematic reel" → delegate to brand_coordinator',
  '      • "create an elite edit from the uploaded video" → delegate to brand_coordinator',
  '    - Do NOT ask clarification questions or call classify_media_url yourself. Brand_coordinator has the full External URL Ingestion pre-step and will handle source extraction autonomously.',
  '    - Pass the video source (URL or reference) in the handoff payload objective sentence.',
  '10k) College questionnaire & web form routing rule (CRITICAL — ABSOLUTE):',
  '    - You have live browser access. NEVER say you cannot access external links, URLs, or web pages.',
  '    - You have form-fill capability. NEVER say you cannot fill out web forms, questionnaires, college applications, or portal forms.',
  '    - When the user sends ANY URL to a college questionnaire, recruiting form, or school portal (JumpForward, NCSA, College Sports Recruits, BeRecruited, school .edu forms, etc.) with intent to fill it out ("fill this out", "complete this", "submit this for them") → IMMEDIATELY classify as simple_routing and delegate to `recruiting_coordinator` with the URL and the target athlete name in the handoff payload.',
  '    - Do NOT ask clarifying questions. Do NOT apologize or disclaim. Do NOT say "I can help you prepare the information". Just route.',
  '    - The recruiting_coordinator will open the URL via live browser, fill the form fields from athlete context, and confirm with the user before submitting.',
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
  '10d-ii) Play Diagram & Game Plan Routing Rule (CRITICAL — NO EXCEPTIONS):',
  '    - NEVER call `create_play_diagram`, `write_playbooks`, `save_gameplan`, `list_gameplans`, `get_gameplan`, or film review tools (`list_film_reviews`, `get_film_review`, `save_film_review`, `update_film_review`, `delete_film_review`, annotations, AI refresh) directly from the router — these tools are coordinator-owned and are NOT in the router tool policy.',
  '    - Play diagrams, reusable playbooks, matchup-specific game plans, and requests to fetch or review existing saved game plans are ALWAYS a strategy_coordinator responsibility — they are X-and-O route trees, coaching diagrams, tactical strategy artifacts, and game-planning context, not creative/marketing assets.',
  '    - When a user asks to "draw a play", "create play diagrams", "diagram routes", "design a playbook", "add plays to my playbook", "build a game plan", or requests multi-play playbook generation with diagrams → delegate to `strategy_coordinator` via `delegate_to_coordinator`, NOT brand_coordinator.',
  '    - When a user asks to "show my game plans", "pull the game plan", "find the Duke game plan", "open the last game plan", or otherwise retrieve a saved game plan → delegate to `strategy_coordinator` via `delegate_to_coordinator`, not direct router tools.',
  '    - Brand_coordinator handles marketing graphics, social thumbnails, and branded visuals. Strategy_coordinator handles play diagrams, strategic visuals, and sports-specific tactical content.',
  '    - If your step summary or handoff mentions "diagrams for the playbook", "route diagrams", "play formations", or "coaching diagrams" → immediately correct to strategy_coordinator.',
  '    - This rule applies even when a play diagram URL, game plan identifier, or film review identifier already exists in context — `write_playbooks`, `save_gameplan`, `list_gameplans`, `get_gameplan`, and film review tools still run inside a coordinator, not from the router.',
  '    - Never call `list_playbooks` with empty args. Resolve and pass `teamId` first (from enriched context, prior tool data, or by asking a targeted clarification if missing).',
  '    - For requests to locate or verify a specific play inside team playbooks (for example "do you have Guns Double Smash Fade?"), prefer `delegate_to_coordinator` with `strategy_coordinator` unless the teamId and playbook IDs are already explicit. Strategy_coordinator must then run `list_playbooks` and `get_playbook` to search the play entries before answering.',
  '10d-iii) Training Framework & Program Routing Rule (CRITICAL):',
  '    - Requests to "build a training framework", "create a training program", "develop a standard training plan", "design an off-season program", "create a development program", or any multi-sport / all-teams training structure → ALWAYS delegate to `performance_coordinator` via `delegate_to_coordinator`. This is a safety_or_mutation task — never answer inline.',
  '    - Gather minimum intake before delegating: which teams or sports are covered + duration (weeks/months) + current phase (off-season, pre-season, in-season). Use task context and profile data to resolve as many fields as possible before asking.',
  '    - After delegation, `performance_coordinator` owns artifact creation and MUST use `dynamic_export` to deliver the framework as a PDF. The chat message must be a 2-3 sentence summary with a PDF link — NOT a wall of Markdown tables.',
  '    - NEVER build a training framework directly in the router chat response. If the model is tempted to paste structured tables in chat, stop and delegate to `performance_coordinator` instead.',
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
  '15) Execution path rule (STRICT):',
  '   15a) Complete requests using your own active toolset and normal coordinator delegation flow. Do not attempt background queue escalation.',
  '   15b) If work spans multiple steps, keep executing within this run via direct tools, `delegate_to_coordinator`, or planner tools as appropriate.',
  '   15c) In planner mode, always produce reviewable plans with `create_plan` or `plan_and_execute` per user intent.',
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
    // Fast front-door route — no extended thinking. Primary handles the
    // streaming ReAct loop; deep reasoning lives in Planner. The model override
    // prevents live routing config drift from putting Primary on a reasoning-first
    // model such as o1.
    return {
      ...MODEL_ROUTING_DEFAULTS['routing'],
      modelOverride: PRIMARY_AGENT_MODEL_OVERRIDE,
      maxTokens: 4096,
      temperature: 0,
      enableThinking: false,
    };
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

    return `${prompt}\n\n${PRIMARY_OPERATING_CONTRACT}`;
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

    if (STRATEGY_ROUTER_FALLBACK_TOOLS.has(toolCall.function.name)) {
      return this.handleDirectStrategyArtifactFallback(
        toolCall,
        userId,
        sessionContext?.operationId,
        approvalGate,
        onStreamEvent,
        signal
      );
    }

    if (toolCall.function.name === 'interact_with_live_view') {
      const liveViewFilmFallback = await this.tryHandleLiveViewFilmInteractionFallback(
        toolCall,
        registry,
        userId,
        sessionContext?.operationId,
        approvalGate,
        onStreamEvent,
        signal,
        currentMessages
      );
      if (liveViewFilmFallback) return liveViewFilmFallback;
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

    const coordinatorId: Extract<AgentIdentifier, 'performance_coordinator'> =
      'performance_coordinator';
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

  private async handleDirectStrategyArtifactFallback(
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
        error: 'Strategy delegation unavailable: missing per-run state.',
      });
    }

    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(toolCall.function.arguments) as unknown;
      if (parsed && typeof parsed === 'object') {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      args = {};
    }

    const coordinatorId: Extract<AgentIdentifier, 'strategy_coordinator'> = 'strategy_coordinator';
    const goal =
      'Handle this strategy artifact request end-to-end (diagram/playbook/game plan) and return final user-ready output.';

    const structuredPayload = {
      ...args,
      source: `router_${toolCall.function.name}_fallback`,
      originalToolName: toolCall.function.name,
    };

    onStreamEvent?.({
      type: 'tool_result',
      agentId: this.id,
      stepId: toolCall.id,
      toolName: 'delegate_to_coordinator',
      stageType: 'tool',
      toolSuccess: true,
      toolResult: {
        delegated: true,
        coordinatorId,
        reason: 'strategy_artifact_tool_router_fallback',
      },
      icon: this.resolveToolStepIcon('delegate_to_coordinator'),
      message: 'Routing to specialist coordinator: Strategy Coordinator',
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

  private async tryHandleLiveViewFilmInteractionFallback(
    toolCall: LLMToolCall,
    registry: ToolRegistry,
    userId: string,
    operationId: string | undefined,
    approvalGate: ApprovalGateService | undefined,
    onStreamEvent: OnStreamEvent | undefined,
    signal: AbortSignal | undefined,
    currentMessages?: readonly LLMMessage[]
  ): Promise<string | null> {
    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(toolCall.function.arguments) as unknown;
      if (parsed && typeof parsed === 'object') {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      args = {};
    }

    const prompt = typeof args['prompt'] === 'string' ? args['prompt'].trim() : '';
    if (!this.isLiveViewFilmInteractionPrompt(prompt)) return null;

    const ctx = this.resolveDispatchContext(
      operationId,
      userId,
      approvalGate,
      onStreamEvent,
      signal
    );
    if (!ctx) return null;

    const coordinatorId: Extract<AgentIdentifier, 'performance_coordinator'> =
      'performance_coordinator';
    const liveViewContext = this.collectLatestLiveViewContext(currentMessages);
    const preInteractionScreenshot = await this.captureLiveViewCheckpoint(
      registry,
      userId,
      operationId,
      signal,
      onStreamEvent,
      toolCall.id
    );
    const goal =
      "Complete the user's live-view film request using real media extraction, not prompt-based page scrolling. " +
      'Use interact_with_live_view to navigate to clips, then extract_live_view_media for each clip to acquire playable video and analyze it.';
    const structuredPayload = {
      source: 'router_live_view_film_interaction_fallback',
      originalLiveViewPrompt: prompt,
      ...(liveViewContext ? { liveViewContext } : {}),
      ...(preInteractionScreenshot ? { preInteractionScreenshot } : {}),
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
        reason: 'live_view_film_work_requires_media_extraction',
      },
      icon: this.resolveToolStepIcon(toolCall.function.name),
      message: 'Routing live-view film work to the media extraction workflow',
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

  private async captureLiveViewCheckpoint(
    registry: ToolRegistry,
    userId: string,
    operationId: string | undefined,
    signal: AbortSignal | undefined,
    onStreamEvent: OnStreamEvent | undefined,
    parentStepId: string
  ): Promise<Record<string, unknown> | null> {
    if (!registry.get('capture_live_view_screenshot')) return null;

    const result = await registry.execute(
      'capture_live_view_screenshot',
      {},
      {
        userId,
        ...(operationId ? { operationId } : {}),
        ...(signal ? { signal } : {}),
      }
    );

    const data =
      result.success && result.data && typeof result.data === 'object'
        ? (result.data as Record<string, unknown>)
        : null;

    onStreamEvent?.({
      type: 'tool_result',
      agentId: this.id,
      stepId: `${parentStepId}-live-view-checkpoint`,
      toolName: 'capture_live_view_screenshot',
      stageType: 'tool',
      toolSuccess: result.success,
      toolResult: data ?? { error: result.error ?? 'Live-view screenshot unavailable' },
      icon: this.resolveToolStepIcon('capture_live_view_screenshot'),
      message: result.success
        ? 'Captured current live-view page before film extraction'
        : 'Could not capture current live-view page before film extraction',
    });

    return data;
  }

  private isLiveViewFilmInteractionPrompt(prompt: string): boolean {
    const normalized = prompt.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normalized) return false;

    const filmSignal = /\b(hudl|film|video|videos|clip|clips|playlist|play|plays)\b/.test(
      normalized
    );
    const actionSignal =
      /\b(watch|analy[sz]e|report|grade|break\s*down|scroll|bottom|last|first|open|click)\b/.test(
        normalized
      );

    return filmSignal && actionSignal;
  }

  private collectLatestLiveViewContext(
    currentMessages?: readonly LLMMessage[]
  ): Record<string, unknown> | null {
    if (!currentMessages?.length) return null;

    let latest: Record<string, unknown> | null = null;
    for (const msg of currentMessages) {
      if (msg.role !== 'tool' || typeof msg.content !== 'string') continue;
      try {
        const parsed = JSON.parse(msg.content) as Record<string, unknown>;
        const data = parsed['data'];
        if (!data || typeof data !== 'object') continue;
        const record = data as Record<string, unknown>;
        if (typeof record['sessionId'] !== 'string') continue;
        if (
          typeof record['url'] !== 'string' &&
          typeof record['pageUrl'] !== 'string' &&
          typeof record['imageUrl'] !== 'string'
        ) {
          continue;
        }
        latest = {
          sessionId: record['sessionId'],
          ...(typeof record['url'] === 'string' ? { url: record['url'] } : {}),
          ...(typeof record['pageUrl'] === 'string' ? { pageUrl: record['pageUrl'] } : {}),
          ...(typeof record['title'] === 'string' ? { title: record['title'] } : {}),
          ...(typeof record['imageUrl'] === 'string' ? { imageUrl: record['imageUrl'] } : {}),
          ...(typeof record['content'] === 'string'
            ? { contentPreview: record['content'].slice(0, 4000) }
            : {}),
        };
      } catch {
        // Ignore non-JSON tool messages.
      }
    }

    return latest;
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
          JSON.stringify(priorArtifacts).slice(0, 12_000);
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
  static buildPrimaryToolDefinitions(
    registry: ToolRegistry,
    accessContext?: AgentToolAccessContext
  ): readonly AgentToolDefinition[] {
    const routerPolicy = getRouterToolPolicy();
    return registry
      .getDefinitions('router', accessContext)
      .filter(
        (def) =>
          def.category === 'system' ||
          PRIMARY_SYSTEM_TOOLS.includes(def.name) ||
          isToolAllowedByPatterns(def.name, routerPolicy)
      );
  }
}
