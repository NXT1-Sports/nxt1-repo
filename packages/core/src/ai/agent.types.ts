/**
 * @fileoverview Agentic Engine — Core Types
 * @module @nxt1/core/ai
 *
 * Shared types for the Agent X autonomous orchestration engine.
 * These types are used by the backend (brain), frontend (face),
 * and mobile to describe operations, state, and tool calls.
 *
 * 100% Portable — Zero framework dependencies.
 */

// ─── Operation Lifecycle ────────────────────────────────────────────────────

/**
 * The lifecycle state of a background Agent X operation.
 *
 *   QUEUED → THINKING → ACTING → STREAMING_RESULT → COMPLETED
 *                  ↘ FAILED ↙                    ↗
 *                     CANCELLED
 */
export type AgentOperationStatus =
  | 'queued'
  | 'thinking'
  | 'acting'
  | 'paused'
  | 'awaiting_approval'
  | 'awaiting_input'
  | 'streaming_result'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Which execution layer produced a structured progress event. */
export type AgentProgressStageType = 'router' | 'tool';

/** Router-level orchestration stages emitted during an agent run. */
export type AgentRouterStage =
  | 'building_context'
  | 'decomposing_intent'
  | 'routing_to_agent'
  | 'agent_thinking'
  | 'resuming_user_input'
  | 'summarizing_memory';

/** Tool-level execution stages emitted during long-running tool work. */
export type ToolStage =
  | 'fetching_data'
  | 'processing_media'
  | 'uploading_assets'
  | 'submitting_job'
  | 'checking_status'
  | 'persisting_result'
  | 'deleting_resource'
  | 'invoking_sub_agent';

/** Union of all structured progress stages understood by the frontend. */
export type AgentProgressStage = AgentRouterStage | ToolStage;

/** Structured outcome codes for terminal or notable operation states. */
export type OperationOutcomeCode =
  | 'success_default'
  | 'routing_failed'
  | 'context_build_failed'
  | 'planning_failed'
  | 'task_failed'
  | 'approval_required'
  | 'input_required'
  | 'cancelled';

/** Arbitrary metadata attached to a structured progress event. */
export type AgentProgressMetadata = Readonly<Record<string, unknown>>;

/** A single step/update within a running operation, streamed to the UI. */
export interface AgentOperationStep {
  readonly id: string;
  readonly timestamp: string;
  readonly status: AgentOperationStatus;
  readonly message: string;
  /** Active agent responsible for this step, when known. */
  readonly agentId?: AgentIdentifier;
  /** Which execution layer emitted this update. */
  readonly stageType?: AgentProgressStageType;
  /** Typed machine-readable stage key for frontend dictionaries. */
  readonly stage?: AgentProgressStage;
  /** Structured outcome for notable or terminal states. */
  readonly outcomeCode?: OperationOutcomeCode;
  /** Additional typed hydration data for UI rendering. */
  readonly metadata?: AgentProgressMetadata;
  /** Optional structured data the UI can render (e.g., a list of drafted emails). */
  readonly payload?: Record<string, unknown>;
}

/** A long-running Agent X background operation. */
export interface AgentOperation {
  readonly id: string;
  readonly userId: string;
  readonly intent: string;
  readonly status: AgentOperationStatus;
  readonly steps: readonly AgentOperationStep[];
  readonly result?: AgentOperationResult;
  readonly error?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Which sub-agent handled this operation. */
  readonly agent?: AgentIdentifier;
  /** Tool calls executed during this operation. */
  readonly toolCalls?: readonly AgentToolCallRecord[];
}

/**
 * Canonical media and export artifacts produced by a coordinator.
 * Forwarded to downstream coordinators in multi-step plans so they have
 * direct URL access rather than relying on LLM prose summaries.
 */
export interface AgentArtifactHandoff {
  readonly imageUrl?: string;
  readonly storagePath?: string;
  readonly cloudflareVideoId?: string;
  readonly videoUrl?: string;
  /** FFmpeg-processed output URL (alias for videoUrl from FFmpeg MCP tools). */
  readonly outputUrl?: string;
  readonly downloadUrl?: string;
  readonly pdfUrl?: string;
  readonly exportUrl?: string;
  readonly audioUrl?: string;
  readonly thumbnailUrl?: string;
}

/** The final output of a completed operation. */
export interface AgentOperationResult {
  /** Short AI-generated title for activity feed items and notifications. */
  readonly title?: string;
  readonly summary: string;
  /** Structured data the UI can render (generated graphics, sent emails, etc.). */
  readonly data?: Record<string, unknown>;
  /** Canonical media/export artifacts forwarded to downstream coordinators in multi-step plans. */
  readonly artifacts?: AgentArtifactHandoff;
  /** Follow-up suggestions the agent proactively offers. */
  readonly suggestions?: readonly string[];
}

// ─── Sub-Agent Identifiers ──────────────────────────────────────────────────

/** Identifies which specialized coordinator handles a task. */
export type AgentIdentifier =
  | 'router'
  | 'admin_coordinator'
  | 'brand_coordinator'
  | 'data_coordinator'
  | 'strategy_coordinator'
  | 'recruiting_coordinator'
  | 'performance_coordinator';

/** Metadata about a registered sub-agent. */
export interface AgentDescriptor {
  readonly id: AgentIdentifier;
  readonly name: string;
  readonly description: string;
  readonly icon?: string;
  /** The types of intents this agent is best suited for. */
  readonly capabilities: readonly string[];
}

// ─── Tool Calling ───────────────────────────────────────────────────────────

/** The schema describing a single tool the agent can invoke. */
export interface AgentToolDefinition {
  readonly name: string;
  readonly description: string;
  /** JSON Schema for the tool's input parameters. */
  readonly parameters: Record<string, unknown>;
  /** Which sub-agents are allowed to call this tool. '*' = all. */
  readonly allowedAgents: readonly (AgentIdentifier | '*')[];
  /** Whether this tool performs a write/mutation (affects guardrail checks). */
  readonly isMutation: boolean;
  /** Optional category for UI grouping. */
  readonly category?: AgentToolCategory;
  /** Entity-scoped tool grouping used for runtime access policy. */
  readonly entityGroup?: AgentToolEntityGroup;
}

/** Logical groupings for tools. */
export type AgentToolCategory =
  | 'database'
  | 'media'
  | 'communication'
  | 'analytics'
  | 'compliance'
  | 'automation'
  | 'data'
  | 'system';

/**
 * Entity-based governance group for Agent X tool access.
 * This is the source of truth for runtime tool exposure policy.
 */
export type AgentToolEntityGroup =
  | 'user_tools'
  | 'team_tools'
  | 'organization_tools'
  | 'platform_tools'
  | 'system_tools';

/**
 * Runtime policy context used to filter tool definitions for a request.
 * `allowedEntityGroups` is evaluated before semantic matching.
 */
export interface AgentToolAccessContext {
  readonly userId: string;
  readonly role: string;
  readonly teamId?: string;
  readonly organizationId?: string;
  readonly allowedEntityGroups: readonly AgentToolEntityGroup[];
}

/** The record of a single tool invocation during an operation. */
export interface AgentToolCallRecord {
  readonly toolName: string;
  readonly input: Record<string, unknown>;
  readonly output?: Record<string, unknown>;
  readonly durationMs?: number;
  readonly status: 'success' | 'error' | 'blocked_by_guardrail';
  readonly timestamp: string;
}

// ─── Memory ─────────────────────────────────────────────────────────────────

/** Which domain a stored memory belongs to. */
export type AgentMemoryTarget = 'user' | 'team' | 'organization';

/** A single entry stored in the agent's long-term vector memory. */
export interface AgentMemoryEntry {
  readonly id: string;
  readonly userId: string;
  readonly target: AgentMemoryTarget;
  readonly teamId?: string;
  readonly organizationId?: string;
  readonly content: string;
  /** The vector embedding (stored externally, referenced here). */
  readonly embeddingId?: string;
  readonly category: AgentMemoryCategory;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: string;
  readonly expiresAt?: string;
}

/** Options for scoped long-term memory retrieval. */
export interface AgentMemoryRecallOptions {
  readonly teamId?: string;
  readonly organizationId?: string;
  readonly category?: AgentMemoryCategory;
  readonly targets?: readonly AgentMemoryTarget[];
  readonly perTargetLimit?: number;
}

/** Retrieved memories grouped by platform domain. */
export interface AgentRetrievedMemories {
  readonly user: readonly AgentMemoryEntry[];
  readonly team: readonly AgentMemoryEntry[];
  readonly organization: readonly AgentMemoryEntry[];
}

/** Categories for stored memories. */
export type AgentMemoryCategory =
  | 'preference'
  | 'goal'
  | 'conversation'
  | 'profile_update'
  | 'recruiting_context'
  | 'performance_data'
  | 'system';

// ─── Global Knowledge Base ──────────────────────────────────────────────────

/** Categories for the global domain knowledge base. */
export type KnowledgeCategory =
  | 'ncaa_rules'
  | 'naia_rules'
  | 'njcaa_rules'
  | 'eligibility'
  | 'recruiting_calendar'
  | 'compliance'
  | 'platform_guide'
  | 'help_center'
  | 'sport_rules'
  | 'training'
  | 'nutrition'
  | 'mental_performance'
  | 'nil'
  | 'transfer_portal'
  | 'general';

/** Source type describing how a knowledge document was ingested. */
export type KnowledgeSourceType = 'pdf' | 'url' | 'manual' | 'help_center' | 'api';

/** A single chunk stored in the global knowledge base. */
export interface KnowledgeEntry {
  readonly id: string;
  readonly content: string;
  readonly category: KnowledgeCategory;
  readonly source: KnowledgeSourceType;
  readonly title: string;
  /** The original URL, file path, or reference for traceability. */
  readonly sourceRef?: string;
  /** Zero-based chunk index within the original document. */
  readonly chunkIndex: number;
  /** Total number of chunks the original document was split into. */
  readonly totalChunks: number;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** The version of this document (incremented on re-ingestion). */
  readonly version: number;
}

/** A retrieval result with its cosine similarity score. */
export interface KnowledgeRetrievalResult {
  readonly entry: KnowledgeEntry;
  readonly score: number;
}

/** Options for ingesting a document into the knowledge base. */
export interface KnowledgeIngestionRequest {
  readonly content: string;
  readonly category: KnowledgeCategory;
  readonly source: KnowledgeSourceType;
  readonly title: string;
  readonly sourceRef?: string;
  readonly metadata?: Record<string, unknown>;
  /** Maximum tokens per chunk (default: 512). */
  readonly chunkSize?: number;
  /** Overlap tokens between chunks for context continuity (default: 64). */
  readonly chunkOverlap?: number;
}

/** Result of a knowledge ingestion operation. */
export interface KnowledgeIngestionResult {
  readonly chunksCreated: number;
  readonly title: string;
  readonly category: KnowledgeCategory;
  readonly version: number;
}

/** A session-scoped context object (stored in Redis, not vector DB). */
export interface AgentSessionContext {
  readonly sessionId: string;
  readonly userId: string;
  readonly conversationHistory: readonly AgentSessionMessage[];
  /** Injected context from long-term memory retrieval. */
  readonly retrievedMemories?: readonly AgentMemoryEntry[];
  readonly createdAt: string;
  readonly lastActiveAt: string;
  /** Which backend environment is serving this agent run. */
  readonly environment?: 'staging' | 'production';
  /** Public app origin for environment-aware NXT1 URLs, including localhost during development. */
  readonly appBaseUrl?: string;
  /** The job/operation ID — threaded into LLM calls as Helicone-Property-Job-Id for cost tracking. */
  readonly operationId?: string;
  /** The MongoDB thread ID for the current conversation. Used by tools for thread-scoped storage. */
  readonly threadId?: string;
  /**
   * UI mode hint passed from the SSE chat client (e.g. 'scout', 'athlete', 'recruiting').
   * Sub-agents may use this to tailor their system prompt.
   */
  readonly mode?: string;
  /**
   * File attachments forwarded from the chat client (images, PDFs, etc.).
   * When present, base.agent.ts builds a multipart LLM user message instead of plain text.
   */
  readonly attachments?: readonly {
    readonly url: string;
    readonly mimeType: string;
    readonly storagePath?: string;
    readonly name?: string;
  }[];
  /**
   * Video attachments forwarded from the chat client (mp4, mov, etc.).
   * Videos cannot be passed as vision content — base.agent.ts injects their URLs
   * as text references in the LLM user message so tools (e.g. write_athlete_videos)
   * can use them without hallucinating a URL.
   */
  readonly videoAttachments?: readonly {
    readonly url: string;
    readonly mimeType: string;
    readonly name: string;
    readonly cloudflareVideoId?: string;
  }[];
  /**
   * Abort signal propagated from the SSE connection.
   * When the client disconnects, this signal is triggered and cancels in-flight LLM calls.
   * Note: AbortSignal is not serialisable — never persist this field.
   */
  readonly signal?: AbortSignal;
}

/**
 * A single message within a session (lighter than the full AgentXMessage).
 *
 * Phase C (thread-as-truth): widened to mirror the OpenRouter/Anthropic
 * wire shape so persisted threads can rehydrate as a structurally-valid
 * `LLMMessage[]` without lossy translation. `toolCalls` carries the
 * assistant's wire-format tool requests; `toolCallId` ties tool-result
 * rows back to the originating call.
 */
export interface AgentSessionMessage {
  readonly role: 'user' | 'assistant' | 'system' | 'tool';
  readonly content: string;
  readonly timestamp: string;
  /** For `role:'tool'` rows \u2014 the assistant.tool_calls[].id this resolves. */
  readonly toolCallId?: string;
  /**
   * For `role:'assistant'` rows \u2014 wire-format tool calls emitted by the
   * model. Persisted so replay can reconstruct an LLM-valid history.
   */
  readonly toolCalls?: readonly {
    readonly id: string;
    readonly type: 'function';
    readonly function: { readonly name: string; readonly arguments: string };
  }[];
}

// ─── Guardrails ─────────────────────────────────────────────────────────────

/** The verdict returned by a guardrail check. */
export interface GuardrailVerdict {
  readonly passed: boolean;
  readonly guardrailName: string;
  /** Human-readable reason (shown to user if blocked). */
  readonly reason?: string;
  /** Suggested alternative action the agent should take instead. */
  readonly suggestion?: string;
  /** Severity of the violation. */
  readonly severity?: 'info' | 'warning' | 'block';
}

/** Metadata describing a registered guardrail. */
export interface GuardrailDescriptor {
  readonly name: string;
  readonly description: string;
  /** When this guardrail fires: before tool execution, after LLM response, or both. */
  readonly phase: 'pre_tool' | 'post_response' | 'both';
}

// ─── Model Routing ──────────────────────────────────────────────────────────

// ── Text Tiers ──────────────────────────────────────────────────────────────
// Each tier maps to a specific LLM optimized for that workload.

/** Fast, reliable JSON routing & multi-agent dispatching (Planner). */
type TextTierRouting = 'routing';
/** Structured data extraction: HTML → JSON, CSV parsing, schema mapping. */
type TextTierExtraction = 'extraction';
/** Massive-context data aggregation: play-by-play logs, bulk stats ingestion. */
type TextTierDataHeavy = 'data_heavy';
/** Deep analytical evaluation: scout reports, biometrics, progression curves. */
type TextTierEvaluator = 'evaluator';
/** Factual rule validation: NCAA compliance, eligibility, transfer portal. */
type TextTierCompliance = 'compliance';
/** Human-sounding copywriting: recruiting emails, social captions, press. */
type TextTierCopywriting = 'copywriting';
/** Creative prompt engineering: text-to-image/video prompt generation. */
type TextTierPromptEngineering = 'prompt_engineering';
/** Lightweight conversational chat: general Q&A, platform help. */
type TextTierChat = 'chat';
/** Temporal orchestration: campaign scheduling, recurring tasks, calendar. */
type TextTierTaskAutomation = 'task_automation';

/** All text-generation model tiers. */
export type TextModelTier =
  | TextTierRouting
  | TextTierExtraction
  | TextTierDataHeavy
  | TextTierEvaluator
  | TextTierCompliance
  | TextTierCopywriting
  | TextTierPromptEngineering
  | TextTierChat
  | TextTierTaskAutomation;

// ── Media Tiers ─────────────────────────────────────────────────────────────

/** Image creation: brand graphics, scout report visuals, promo art. */
type MediaTierImageGeneration = 'image_generation';
/** Video creation: highlight reels, commitment announcements. */
type MediaTierVideoGeneration = 'video_generation';
/** Image/document understanding: OCR, stat sheet reading, film stills. */
type MediaTierVisionAnalysis = 'vision_analysis';
/** Audio understanding: game broadcasts, interview clips, coach calls. */
type MediaTierAudioAnalysis = 'audio_analysis';
/** Text-to-speech: AI sportscaster voiceovers, highlight narration. */
type MediaTierVoiceGeneration = 'voice_generation';
/** AI music: hype beats, highlight reel soundtracks. */
type MediaTierMusicGeneration = 'music_generation';
/** Video understanding: game film analysis, highlight review, play breakdown. */
type MediaTierVideoAnalysis = 'video_analysis';

/** All media-generation model tiers. */
export type MediaModelTier =
  | MediaTierImageGeneration
  | MediaTierVideoGeneration
  | MediaTierVisionAnalysis
  | MediaTierAudioAnalysis
  | MediaTierVoiceGeneration
  | MediaTierMusicGeneration
  | MediaTierVideoAnalysis;

// ── Utility Tiers ───────────────────────────────────────────────────────────

/** Text-to-vector embedding for semantic search (MongoDB Atlas Vector Search). */
type UtilityTierEmbedding = 'embedding';
/** Content safety classification: prompt injection, toxic content filtering. */
type UtilityTierModeration = 'moderation';

/** All utility/infrastructure model tiers. */
export type UtilityModelTier = UtilityTierEmbedding | UtilityTierModeration;

/** Union of ALL model tiers across text, media, and utility. */
export type ModelTier = TextModelTier | MediaModelTier | UtilityModelTier;

/** Configuration for a model routing decision. */
export interface ModelRoutingConfig {
  readonly tier: ModelTier;
  /** Override model slug if you need a specific model. */
  readonly modelOverride?: string;
  /** Max tokens for this request. */
  readonly maxTokens?: number;
  /** Temperature (0-2). */
  readonly temperature?: number;
  /**
   * Enable extended thinking for models that support it (Claude 3.7+, Gemini 2.5, etc.).
   * When true, thinking tokens stream separately and appear as a collapsible
   * reasoning block in the chat UI. OpenRouter silently ignores the param for
   * models that don't support it.
   */
  readonly enableThinking?: boolean;
  /** Max tokens the model may spend on reasoning. Defaults to 8 000. Must be ≥ 1 024. */
  readonly thinkingBudgetTokens?: number;
}

// ─── Job Origin & Triggers ──────────────────────────────────────────────────

/**
 * Where a job originated from.
 * - 'user'          — The user typed a prompt in the chat UI.
 * - 'system_cron'   — A scheduled trigger (e.g., daily briefing, weekly recap).
 * - 'database_event'— A Firestore/MongoDB change stream event (e.g., coach viewed profile).
 * - 'webhook'       — An external webhook (e.g., Stripe payment, MaxPreps stat update).
 * - 'agent_chain'   — Another agent spawned this job (agent-to-agent delegation).
 */
export type AgentJobOrigin = 'user' | 'system_cron' | 'database_event' | 'webhook' | 'agent_chain';

/** A trigger event that can autonomously wake up an agent for a user. */
export interface AgentTriggerEvent {
  readonly id: string;
  readonly type: AgentTriggerType;
  readonly userId: string;
  /** The synthesized intent string passed to the Planner (generated from event data). */
  readonly intent: string;
  /** Raw event data from the source system. */
  readonly eventData: Record<string, unknown>;
  readonly origin: AgentJobOrigin;
  /** Priority level — higher priority events skip ahead in the queue. */
  readonly priority: AgentTriggerPriority;
  readonly createdAt: string;
}

/** Categories of system triggers that can wake an agent. */
export type AgentTriggerType =
  | 'profile_view' // A coach/scout viewed the athlete's profile
  | 'new_follower' // Someone followed the athlete
  | 'stat_update' // External stats changed (MaxPreps, Hudl, etc.)
  | 'college_interest' // A college program showed interest
  | 'daily_briefing' // Scheduled: morning briefing
  | 'weekly_recap' // Scheduled: weekly performance recap
  | 'recruiting_window' // A recruiting period opened/closed
  | 'subscription_change' // User upgraded/downgraded plan
  | 'coach_reply' // A coach replied to a recruiting email
  | 'content_milestone' // Post hit a view/like milestone
  | 'stale_profile' // Profile hasn't been updated in X days
  | 'daily_sync_complete' // Daily background scraper found changes
  | 'custom'; // Custom trigger (extensible)

// ─── Sync Delta Report ─────────────────────────────────────────────────────

/** A single changed stat metric detected during a daily sync. */
export interface SyncStatChange {
  readonly category: string; // e.g. "Passing"
  readonly key: string; // e.g. "Yds"
  readonly label: string; // e.g. "Yards"
  readonly oldValue: string | number | null;
  readonly newValue: string | number;
  readonly delta?: number; // Numeric difference (if both values are numbers)
}

/** A new season or category detected for the first time. */
export interface SyncNewCategory {
  readonly season: string;
  readonly category: string;
  readonly columns: readonly string[];
  readonly totalCount: number;
}

/** A new schedule event detected during a daily sync. */
export interface SyncNewScheduleEvent {
  readonly date: string;
  readonly opponent?: string;
  readonly location?: string;
  readonly result?: string;
  readonly score?: string;
}

/** A new video/highlight detected during a daily sync. */
export interface SyncNewVideo {
  readonly src: string;
  readonly provider: string;
  readonly videoId?: string;
  readonly title?: string;
}

/** A new playbook detected during a daily sync. */
export interface SyncNewPlaybook {
  readonly name: string;
  readonly sport: string;
  readonly playCount: number;
  readonly formationTypes?: readonly string[];
  readonly videoRefs?: readonly string[];
}

/**
 * Deterministic report of what changed between the previous DB state
 * and the latest AI-extracted web data during a daily sync.
 *
 * This is computed by pure structural diffing (not AI) for speed and accuracy.
 * Agent X reads this to decide what actions to take proactively.
 */
export interface SyncDeltaReport {
  readonly userId: string;
  readonly sport: string;
  readonly source: string;
  readonly syncedAt: string;
  /** Optional scope hints from the writer that triggered the sync. */
  readonly teamId?: string;
  readonly organizationId?: string;

  /** True if nothing changed since the last sync — Agent X stays asleep. */
  readonly isEmpty: boolean;

  /** Identity fields that changed (e.g. profile info, class year, location). */
  readonly identityChanges: ReadonlyArray<{
    readonly field: string;
    readonly oldValue: unknown;
    readonly newValue: unknown;
  }>;

  /** New season/category stat tables detected for the first time. */
  readonly newCategories: readonly SyncNewCategory[];

  /** Individual stat values that changed within existing categories. */
  readonly statChanges: readonly SyncStatChange[];

  /** New recruiting activities detected. */
  readonly newRecruitingActivities: ReadonlyArray<Record<string, unknown>>;

  /** New awards detected. */
  readonly newAwards: ReadonlyArray<Record<string, unknown>>;

  /** New schedule events detected (games, practices, etc.). */
  readonly newScheduleEvents: readonly SyncNewScheduleEvent[];

  /** New videos/highlights detected on external platforms. */
  readonly newVideos: readonly SyncNewVideo[];

  /** New playbooks detected. */
  readonly newPlaybooks?: readonly SyncNewPlaybook[];

  /** Summary counts for quick decisions. */
  readonly summary: {
    readonly identityFieldsChanged: number;
    readonly newCategoriesAdded: number;
    readonly statsUpdated: number;
    readonly newRecruitingActivities: number;
    readonly newAwards: number;
    readonly newScheduleEvents: number;
    readonly newVideos: number;
    readonly newPlaybooks: number;
    readonly totalChanges: number;
  };

  /** Metadata indicating delta generation approach and version. */
  readonly metadata?: {
    readonly generationType: 'typed' | 'synthetic';
    readonly policyVersion: string;
    readonly fallbackReason?: string;
    readonly adapterVersion?: string;
  };
}

/** Priority levels for trigger events. */
export type AgentTriggerPriority = 'low' | 'normal' | 'high' | 'critical';

/** Configuration for a registered trigger rule. */
export interface AgentTriggerRule {
  readonly type: AgentTriggerType;
  readonly name: string;
  readonly description: string;
  /** Whether this trigger is currently active. */
  readonly enabled: boolean;
  /** Minimum subscription tier required (free users get fewer triggers). */
  readonly minTier?: string;
  /** Cooldown in ms — prevents the same trigger from spamming the agent. */
  readonly cooldownMs: number;
  /** Template string for synthesizing the intent from event data. */
  readonly intentTemplate: string;
  /** Default priority for events from this trigger. */
  readonly defaultPriority: AgentTriggerPriority;
}

/** Per-user trigger preferences (stored in their profile). */
export interface AgentTriggerPreferences {
  readonly userId: string;
  /** Master switch — user can disable all autonomous activity. */
  readonly autonomousEnabled: boolean;
  /** Per-trigger overrides (user can mute specific triggers). */
  readonly disabledTriggers: readonly AgentTriggerType[];
  /** Quiet hours — agent won't send notifications during this window. */
  readonly quietHours?: {
    readonly startHour: number; // 0-23 UTC
    readonly endHour: number; // 0-23 UTC
    readonly timezone: string; // e.g., 'America/Chicago'
  };
  readonly updatedAt: string;
}

// ─── Job Queue ──────────────────────────────────────────────────────────────

/** The payload pushed to the background job queue. */
export interface AgentJobPayload {
  readonly operationId: string;
  readonly userId: string;
  readonly intent: string;
  /** User-facing label preserved for history, titles, and ops logs. */
  readonly displayIntent?: string;
  readonly sessionId: string;
  /** Where this job came from — user prompt, cron, database event, etc. */
  readonly origin: AgentJobOrigin;
  /** The trigger event that spawned this job (null for user-initiated). */
  readonly triggerEvent?: AgentTriggerEvent;
  /** Optional pre-selected agent (if the router already decided). */
  readonly agent?: AgentIdentifier;
  /** Optional model routing hint. */
  readonly modelRouting?: ModelRoutingConfig;
  /** Arbitrary context the frontend passed along. */
  readonly context?: Record<string, unknown>;
}

/** Status update emitted by the worker and consumed by SSE/Firestore listeners. */
export interface AgentJobUpdate {
  readonly operationId: string;
  readonly status: AgentOperationStatus;
  /** Active agent responsible for this update, when known. */
  readonly agentId?: AgentIdentifier;
  /** Which execution layer emitted this update. */
  readonly stageType?: AgentProgressStageType;
  /** Typed machine-readable stage key for frontend dictionaries. */
  readonly stage?: AgentProgressStage;
  /** Structured outcome for notable or terminal states. */
  readonly outcomeCode?: OperationOutcomeCode;
  /** Additional typed hydration data for UI rendering. */
  readonly metadata?: AgentProgressMetadata;
  readonly step: AgentOperationStep;
}

// ─── Execution Plan (DAG) ───────────────────────────────────────────────────

/** Status of an individual task within an execution plan. */
export type AgentTaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'skipped'
  | 'awaiting_tool_approval';

/** A single task in the agent's execution plan (To-Do List). */
export interface AgentTask {
  readonly id: string;
  /** The specific sub-agent assigned to this task. */
  readonly assignedAgent: AgentIdentifier;
  /** Short verb-led label shown in the UI planner card (≤8 words). Falls back to description when absent. */
  readonly displayLabel?: string;
  /** Full execution intent passed to the coordinator agent. */
  readonly description: string;
  /**
   * Optional structured key/value data forwarded verbatim to the coordinator.
   * Injected as a machine-readable JSON block in the task intent so coordinators
   * can extract IDs, codes, and references without relying on prose paraphrasing.
   */
  readonly structuredPayload?: Record<string, unknown>;
  readonly status: AgentTaskStatus;
  /** IDs of tasks that must complete before this one starts. */
  readonly dependsOn: readonly string[];
  /** Optional output data from the task once finished. */
  readonly result?: Record<string, unknown>;
  /** Optional human-readable result summary for execution logs and review UIs. */
  readonly resultSummary?: string;
  /** Canonical artifacts produced by the task for downstream handoff. */
  readonly artifacts?: AgentArtifactHandoff;
  /** Short operator-facing note about the current state of the task. */
  readonly statusNote?: string;
  readonly error?: string;
  readonly createdAt: string;
  readonly updatedAt?: string;
}

/** Persisted lifecycle state of a saved execution plan. */
export type AgentSavedPlanStatus =
  | 'draft'
  | 'awaiting_approval'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'superseded'
  | 'cancelled';

/** A first-class saved plan that can be reviewed, approved, and executed later. */
export interface AgentSavedPlan {
  readonly planId: string;
  readonly userId: string;
  readonly threadId?: string;
  readonly originOperationId: string;
  readonly approvedExecutionOperationId?: string;
  readonly supersededByPlanId?: string;
  readonly version: number;
  readonly status: AgentSavedPlanStatus;
  readonly summary: string;
  readonly planHash: string;
  readonly tasks: readonly AgentTask[];
  readonly createdAt: string;
  readonly approvedAt?: string;
  readonly updatedAt?: string;
}

// ─── Execution Plan (DAG) ───────────────────────────────────────────────────

/** The full execution plan (To-Do List / DAG) generated by the PlannerAgent. */
export interface AgentExecutionPlan {
  readonly operationId: string;
  readonly tasks: readonly AgentTask[];
  readonly createdAt: string;
}

// ─── Planner Types ──────────────────────────────────────────────────────────

/** The structured output the PlannerAgent returns to the Worker. */
export interface AgentPlannerOutput {
  /** The prioritized To-Do list of tasks. */
  readonly plan: AgentExecutionPlan;
  /** High-level summary of the plan for the user. */
  readonly summary: string;
  /** Estimated total duration hint (optional, for UI progress). */
  readonly estimatedSteps: number;
}

/** A node in the execution DAG with resolved dependency references. */
export interface AgentTaskNode {
  readonly task: AgentTask;
  /** Resolved references to predecessor tasks (populated at runtime). */
  readonly predecessors: readonly AgentTask[];
  /** Whether all dependencies are satisfied and this task is ready to run. */
  readonly isReady: boolean;
}

// ─── Human-in-the-Loop (HITL) ───────────────────────────────────────────────

/**
 * An approval request sent to the user when Agent X hits a high-stakes action.
 * The Worker pauses the DAG and pushes this to the frontend via Firestore/SSE.
 * Once the user taps "Approve" or "Reject," the Worker resumes or aborts.
 */
export interface AgentApprovalRequest {
  readonly id: string;
  readonly operationId: string;
  readonly taskId: string;
  readonly userId: string;
  /** The conversation thread this approval belongs to. */
  readonly threadId?: string;
  /** What the agent wants to do (human-readable). */
  readonly actionSummary: string;
  /** Typed reason code used to keep approval UX copy consistent. */
  readonly reasonCode?: AgentApprovalReasonCode;
  /** The tool that will be executed if approved. */
  readonly toolName: string;
  /** The exact input that will be passed to the tool. */
  readonly toolInput: Record<string, unknown>;
  /** Why the agent chose this action (reasoning trace). */
  readonly reasoning?: string;
  readonly status: AgentApprovalStatus;
  /** Who approved/rejected (userId or 'auto' for auto-approved actions). */
  readonly resolvedBy?: string;
  readonly resolvedAt?: string;
  readonly createdAt: string;
  /** Auto-expire after this many ms if no response. */
  readonly expiresInMs: number;
}

/** Status of an approval request. */
export type AgentApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'auto_approved';

/** Typed reason codes for approval-gated actions. */
export type AgentApprovalReasonCode = 'send_email' | 'interact_with_live_view' | 'run_tool';

/** Typed outcome codes used for approval, yield, and activity notifications. */
export type AgentNotificationOutcomeCode = Extract<
  OperationOutcomeCode,
  'success_default' | 'task_failed' | 'approval_required' | 'input_required'
>;

// ─── Suspend & Resume (Yield State) ─────────────────────────────────────────

/** Why the agent yielded control back to the user. */
export type AgentYieldReason = 'needs_input' | 'needs_approval';

/**
 * Serialized state of a yielded agent execution.
 * Stored in Firestore + MongoDB so the worker can resume exactly
 * where it left off when the user responds.
 */
export interface AgentYieldState {
  /** The reason the agent suspended itself. */
  readonly reason: AgentYieldReason;
  /** The question or prompt shown to the user. */
  readonly promptToUser: string;
  /** Which sub-agent was executing when the yield happened. */
  readonly agentId: AgentIdentifier;
  /** The full LLM message array at the point of suspension (serialized). */
  readonly messages: readonly Record<string, unknown>[];
  /** The tool call that triggered the yield (if approval-based). */
  readonly pendingToolCall?: {
    readonly toolName: string;
    readonly toolInput: Record<string, unknown>;
    readonly toolCallId: string;
  };
  /** ID of the approval request (if reason is 'needs_approval'). */
  readonly approvalId?: string;
  /** The execution plan context for multi-task DAGs. */
  readonly planContext?: {
    readonly currentTaskId: string;
    readonly completedTaskResults: Record<string, unknown>;
    readonly enrichedIntent: string;
  };
  /** ISO timestamp of when the yield was created. */
  readonly yieldedAt: string;
  /** ISO timestamp after which this yield expires and the job fails. */
  readonly expiresAt: string;
}

/** Defines which tool actions require user approval. */
export interface AgentApprovalPolicy {
  readonly toolName: string;
  /** Whether this tool always requires approval before execution. */
  readonly requiresApproval: boolean;
  /** If true, auto-approve after expiresInMs with no user response. */
  readonly autoApproveOnExpiry: boolean;
  /** Time in ms before auto-expiry (default: 24 hours). */
  readonly expiryMs: number;
  /** Risk level indicator for the UI. */
  readonly riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /**
   * Optional trust group identifier used for session-level trust grants.
   * Tools in the same group share a trust grant — if the user approves one
   * and checks "trust this session", all tools in the same group are
   * auto-approved for the remainder of the session (2h TTL).
   *
   * Examples: 'email', 'profile_write', 'team_write', 'automation'
   */
  readonly sessionTrustGroup?: string;
}

/**
 * Firestore document stored in `AgentSessionTrustGrants` collection.
 * When a user approves an action and checks "Trust for this session", a grant
 * is written for the tool's `sessionTrustGroup`. Subsequent approvals in the
 * same group are automatically approved for the remainder of the session.
 */
export interface AgentSessionTrustGrant {
  /** Firestore document ID (`grant_{uuid}`). */
  readonly id: string;
  readonly userId: string;
  /** Session/operation origin that created the grant. */
  readonly sessionId: string;
  /** Trust group identifier matching `AgentApprovalPolicy.sessionTrustGroup`. */
  readonly trustGroup: string;
  /** ISO timestamp when the grant was created. */
  readonly createdAt: string;
  /** ISO timestamp after which the grant is no longer valid (2h TTL). */
  readonly expiresAt: string;
}

/**
 * The hydrated user context injected into every agent session.
 * Built by the ContextBuilder before the Planner even runs.
 * This is what makes Agent X "know" the user without them typing anything.
 */
export interface AgentUserContext {
  readonly userId: string;
  readonly role: string;
  /** Display name for personalization. */
  readonly displayName: string;
  /** Active sport index from user.sports[] when present. */
  readonly activeSportIndex?: number;

  // ── Canonical NXT1 Routes ────────────────────────────────────
  /** Primary canonical profile path for the active sport context. */
  readonly profilePath?: string;
  /** Canonical profile paths across all known sports for this user. */
  readonly profilePathsBySport?: ReadonlyArray<{
    readonly sport: string;
    readonly path: string;
  }>;
  /** Primary canonical team path for the active team context. */
  readonly teamPath?: string;
  /** Canonical team paths across known team affiliations. */
  readonly teamPaths?: ReadonlyArray<{
    readonly sport?: string;
    readonly teamName?: string;
    readonly teamCode: string;
    readonly path: string;
  }>;

  // ── Athletic Profile ──────────────────────────────────────────
  readonly sport?: string;
  /**
   * Multi-sport snapshot from user.sports[].
   * The active sport remains exposed as `sport`, but this preserves full context
   * so prompts can reason across every sport profile for the user.
   */
  readonly sports?: ReadonlyArray<{
    readonly sport: string;
    readonly positions?: readonly string[];
    readonly teamName?: string;
    readonly isActive?: boolean;
  }>;
  readonly position?: string;
  readonly heightInches?: number;
  readonly weightLbs?: number;
  readonly graduationYear?: number;
  readonly gpa?: number;
  readonly school?: string;
  readonly city?: string;
  readonly state?: string;

  // ── Recruiting Context ────────────────────────────────────────
  readonly recruitingStatus?: string;

  // ── Platform Data ─────────────────────────────────────────────
  readonly lastActiveAt?: string;

  // ── Connected Accounts ────────────────────────────────────────
  readonly connectedAccounts?: readonly AgentConnectedAccount[];

  // ── Coach-Specific (if role is coach) ─────────────────────────
  readonly coachProgram?: string;
  readonly coachDivision?: string;
  readonly coachSport?: string;

  // ── Team Context (from active sport) ──────────────────────────
  readonly teamId?: string;
  readonly organizationId?: string;

  // ── Goal & Playbook Context ────────────────────────────────────
  /** Up to 5 active goals from agentGoals. Token-efficient subset. */
  readonly activeGoals?: ReadonlyArray<{
    readonly id: string;
    readonly text: string;
    readonly category?: string;
  }>;
  /** Current week's playbook progress summary. */
  readonly currentPlaybookSummary?: {
    readonly playbookId: string;
    readonly total: number;
    readonly completed: number;
    readonly snoozed: number;
  };
}

/** Fully assembled prompt context used before planner/coordinator execution. */
export interface AgentPromptContext {
  readonly profile: AgentUserContext;
  readonly memories: AgentRetrievedMemories;
  /** Exact recent sync-change summaries pulled from short-lived Mongo diff events. */
  readonly recentSyncSummaries?: readonly string[];
}

/** A third-party account the user has connected (Gmail, Twitter, Hudl, etc.). */
export interface AgentConnectedAccount {
  readonly provider: string;
  readonly email?: string;
  readonly profileUrl?: string;
  readonly isTokenValid: boolean;
  readonly lastSyncAt?: string;
}

// ─── AI Telemetry & Cost Tracking ───────────────────────────────────────────

/**
 * A single LLM API call record for telemetry and cost attribution.
 * Logged on every OpenRouter request.
 */
export interface AgentLLMCallRecord {
  readonly id: string;
  readonly operationId: string;
  readonly userId: string;
  readonly agentId: AgentIdentifier;
  /** The model that was actually used (e.g., 'anthropic/claude-sonnet-4'). */
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  /** Cost in USD (fractional cents). */
  readonly costUsd: number;
  /** Latency of the LLM call in ms. */
  readonly latencyMs: number;
  /** Whether the response included a tool call. */
  readonly hadToolCall: boolean;
  readonly timestamp: string;
}

/** Aggregated usage for a user over a billing period. */
export interface AgentUsageSummary {
  readonly userId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly totalCalls: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCostUsd: number;
  /** Breakdown by model. */
  readonly byModel: readonly AgentModelUsage[];
  /** Breakdown by agent. */
  readonly byAgent: readonly AgentAgentUsage[];
}

/** Per-model usage within a billing period. */
export interface AgentModelUsage {
  readonly model: string;
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

/** Per-agent usage within a billing period. */
export interface AgentAgentUsage {
  readonly agentId: AgentIdentifier;
  readonly calls: number;
  readonly totalTokens: number;
  readonly costUsd: number;
}

/** Per-tier usage limits. Currently a single 'default' tier for all users. */
export interface AgentUsageLimits {
  readonly tier: string;
  /** Max LLM calls per day. */
  readonly maxCallsPerDay: number;
  /** Max total tokens per day. */
  readonly maxTokensPerDay: number;
  /** Max cost in USD per day. */
  readonly maxCostPerDay: number;
  /** Allowed model tiers. Currently all tiers are allowed for every user. */
  readonly allowedModelTiers: readonly ModelTier[];
}

// ─── Job Event Types (Firestore Subcollection) ─────────────────────────────

/**
 * Event types written to the `AgentJobs/{operationId}/events` subcollection.
 * The frontend subscribes via Firestore `onSnapshot` to render live UI.
 *
 * @see backend/src/modules/agent/queue/job.repository.ts — canonical source
 */
export type JobEventType =
  | 'step_active'
  | 'step_done'
  | 'step_error'
  | 'delta'
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'card'
  | 'title_updated'
  | 'operation'
  | 'progress_stage'
  | 'progress_subphase'
  | 'metric'
  | 'done';

/**
 * A single event document stored in `AgentJobs/{operationId}/events/{autoId}`.
 * The frontend reads these via `onSnapshot`, ordered by `seq`, to reconstruct
 * the live agent execution as a chat-like experience.
 *
 * 100% portable — mirrors the backend Firestore shape without importing
 * firebase-admin types.
 */
export interface JobEvent {
  /** Event contract schema version for backward-compatible parsing. */
  readonly schemaVersion?: number;
  /** Stable unique event identifier. */
  readonly eventId?: string;
  /** Monotonically increasing sequence number (0-based). */
  readonly seq: number;
  /** ISO timestamp when backend emitted this event. */
  readonly emittedAt?: string;
  /** What kind of event this is. */
  readonly type: JobEventType;
  /** Agent identifier if known (e.g. 'recruiting', 'performance'). */
  readonly agentId?: string;
  /** Stable backend-authored localization key paired with message text when available. */
  readonly messageKey?: string;
  /** Which execution layer emitted the event, when structured stages are available. */
  readonly stageType?: AgentProgressStageType;
  /** Typed machine-readable stage key for frontend dictionaries. */
  readonly stage?: AgentProgressStage;
  /** Structured outcome for notable or terminal states. */
  readonly outcomeCode?: OperationOutcomeCode;
  /** Additional typed hydration data for UI rendering. */
  readonly metadata?: AgentProgressMetadata;
  /** Human-readable message for the UI. */
  readonly message?: string;
  /** Accumulated LLM text for `delta` events. */
  readonly text?: string;
  /** Extended thinking text for `thinking` events (Claude 3.7+ / Gemini 2.5). */
  readonly thinkingText?: string;
  /** Tool name for `tool_call` / `tool_result` events. */
  readonly toolName?: string;
  /** LLM-assigned stable tool call ID shared across step_active / emitStage / tool_result
   *  events for the same tool invocation. Used as the stable frontend step row identity. */
  readonly stepId?: string;
  /** Tool arguments (JSON string) for `tool_call` events. */
  readonly toolArgs?: string;
  /** Tool result summary for `tool_result` events. */
  readonly toolResult?: Record<string, unknown>;
  /** Whether the tool_result was a success. */
  readonly toolSuccess?: boolean;
  /** Optional semantic icon key for custom step rendering. */
  readonly icon?: string;
  /** Whether the job finished successfully (for `done` events). */
  readonly success?: boolean;
  /** Error message for `step_error` / `done` events. */
  readonly error?: string;
  /** Machine-readable backend error code for `step_error` / `done` events. */
  readonly errorCode?: string;
  /** Rich card payload for `card` events (planner, data-table, etc.). */
  readonly cardData?: Record<string, unknown>;
  /** Updated thread title emitted by worker after auto-title generation. */
  readonly title?: string;
  /** Thread ID associated with operation/title events. */
  readonly threadId?: string;
  /** Canonical persisted assistant message ID for terminal done events. */
  readonly messageId?: string;
  /** Canonical operation status transitions for sidebar/session state. */
  readonly status?:
    | 'queued'
    | 'running'
    | 'in-progress'
    | 'paused'
    | 'awaiting_input'
    | 'awaiting_approval'
    | 'complete'
    | 'failed'
    | 'error'
    | 'cancelled';
  /** Serialized yield context for awaiting_input / awaiting_approval transitions. */
  readonly yieldState?: AgentYieldState;
  /** Operation id for operation lifecycle events. */
  readonly operationId?: string;
  /** ISO timestamp for operation/title transitions. */
  readonly timestamp?: string;
  /** Server timestamp (Firestore Timestamp — reads as { seconds, nanoseconds }). */
  readonly createdAt?: unknown;
}
