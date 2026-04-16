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
  | 'awaiting_approval'
  | 'awaiting_input'
  | 'streaming_result'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** A single step/update within a running operation, streamed to the UI. */
export interface AgentOperationStep {
  readonly id: string;
  readonly timestamp: string;
  readonly status: AgentOperationStatus;
  readonly message: string;
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

/** The final output of a completed operation. */
export interface AgentOperationResult {
  /** Short AI-generated title for activity feed items and notifications. */
  readonly title?: string;
  readonly summary: string;
  /** Structured data the UI can render (generated graphics, sent emails, etc.). */
  readonly data?: Record<string, unknown>;
  /** Follow-up suggestions the agent proactively offers. */
  readonly suggestions?: readonly string[];
}

// ─── Sub-Agent Identifiers ──────────────────────────────────────────────────

/** Identifies which specialized coordinator handles a task. */
export type AgentIdentifier =
  | 'router'
  | 'data_coordinator'
  | 'recruiting_coordinator'
  | 'brand_media_coordinator'
  | 'performance_coordinator'
  | 'compliance_coordinator'
  | 'general';

/** Metadata about a registered sub-agent. */
export interface AgentDescriptor {
  readonly id: AgentIdentifier;
  readonly name: string;
  readonly description: string;
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
  /** The job/operation ID — threaded into LLM calls as Helicone-Property-Job-Id for cost tracking. */
  readonly operationId?: string;
  /** The MongoDB thread ID for the current conversation. Used by tools for thread-scoped storage. */
  readonly threadId?: string;
}

/** A single message within a session (lighter than the full AgentXMessage). */
export interface AgentSessionMessage {
  readonly role: 'user' | 'assistant' | 'system' | 'tool';
  readonly content: string;
  readonly timestamp: string;
  readonly toolCallId?: string;
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

  /** Summary counts for quick decisions. */
  readonly summary: {
    readonly identityFieldsChanged: number;
    readonly newCategoriesAdded: number;
    readonly statsUpdated: number;
    readonly newRecruitingActivities: number;
    readonly newAwards: number;
    readonly newScheduleEvents: number;
    readonly newVideos: number;
    readonly totalChanges: number;
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
  readonly step: AgentOperationStep;
}

// ─── Execution Plan (DAG) ───────────────────────────────────────────────────

/** Status of an individual task within an execution plan. */
export type AgentTaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

/** A single task in the agent's execution plan (To-Do List). */
export interface AgentTask {
  readonly id: string;
  /** The specific sub-agent assigned to this task. */
  readonly assignedAgent: AgentIdentifier;
  /** Plain text description of what needs to be done. */
  readonly description: string;
  readonly status: AgentTaskStatus;
  /** IDs of tasks that must complete before this one starts. */
  readonly dependsOn: readonly string[];
  /** Optional output data from the task once finished. */
  readonly result?: Record<string, unknown>;
  readonly error?: string;
  readonly createdAt: string;
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
  /** What the agent wants to do (human-readable). */
  readonly actionSummary: string;
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
  /** Description shown to the user in the approval prompt. */
  readonly userPrompt: string;
  /** Risk level indicator for the UI. */
  readonly riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

// ─── Context Builder (Profile Hydration) ────────────────────────────────────

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

  // ── Athletic Profile ──────────────────────────────────────────
  readonly sport?: string;
  readonly position?: string;
  readonly heightInches?: number;
  readonly weightLbs?: number;
  readonly graduationYear?: number;
  readonly gpa?: number;
  readonly school?: string;
  readonly city?: string;
  readonly state?: string;

  // ── Recruiting Context ────────────────────────────────────────
  readonly targetDivisions?: readonly string[];
  readonly targetColleges?: readonly string[];
  readonly recruitingStatus?: string;
  readonly commitmentStatus?: string;

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
  | 'tool_call'
  | 'tool_result'
  | 'card'
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
  /** Monotonically increasing sequence number (0-based). */
  readonly seq: number;
  /** What kind of event this is. */
  readonly type: JobEventType;
  /** Agent identifier if known (e.g. 'recruiting', 'performance'). */
  readonly agentId?: string;
  /** Human-readable message for the UI. */
  readonly message?: string;
  /** Accumulated LLM text for `delta` events. */
  readonly text?: string;
  /** Tool name for `tool_call` / `tool_result` events. */
  readonly toolName?: string;
  /** Tool arguments (JSON string) for `tool_call` events. */
  readonly toolArgs?: string;
  /** Tool result summary for `tool_result` events. */
  readonly toolResult?: Record<string, unknown>;
  /** Whether the tool_result was a success. */
  readonly toolSuccess?: boolean;
  /** Whether the job finished successfully (for `done` events). */
  readonly success?: boolean;
  /** Error message for `step_error` / `done` events. */
  readonly error?: string;
  /** Rich card payload for `card` events (planner, data-table, etc.). */
  readonly cardData?: Record<string, unknown>;
  /** Server timestamp (Firestore Timestamp — reads as { seconds, nanoseconds }). */
  readonly createdAt?: unknown;
}
