/**
 * @fileoverview Agent X Type Definitions
 * @module @nxt1/core/ai
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for Agent X AI assistant.
 * 100% portable - works on web, mobile, and backend.
 */

import type { AgentJobOrigin, AgentYieldState } from './agent.types';

// ============================================
// ATTACHMENT TYPES
// ============================================

/**
 * MIME type categories that Agent X can process via multimodal models.
 */
export type AgentXAttachmentType = 'image' | 'video' | 'pdf' | 'csv' | 'doc';

/**
 * Metadata for a file attached to an Agent X message.
 * Stored in MongoDB alongside the message — the actual binary lives in Firebase Storage.
 */
export interface AgentXAttachment {
  /** Unique attachment identifier (UUID v4). */
  readonly id: string;
  /** Public CDN URL of the uploaded file in Firebase Storage. */
  readonly url: string;
  /** Original file name as chosen by the user. */
  readonly name: string;
  /** MIME type (e.g. `image/jpeg`, `application/pdf`). */
  readonly mimeType: string;
  /** Resolved high-level type for UI rendering and model routing. */
  readonly type: AgentXAttachmentType;
  /** File size in bytes. */
  readonly sizeBytes: number;
}

// ============================================
// CHAT TYPES
// ============================================

/**
 * Role of a message sender in the chat.
 */
export type ChatRole = 'user' | 'assistant' | 'system';

/**
 * A single message in the Agent X conversation.
 */
export interface AgentXMessage {
  /** Unique message identifier */
  readonly id: string;
  /** Who sent the message */
  readonly role: ChatRole;
  /** Message content (text) */
  readonly content: string;
  /** When the message was created */
  readonly timestamp: Date;
  /** Whether assistant is currently typing */
  readonly isTyping?: boolean;
  /** Whether this message represents an error */
  readonly error?: boolean;
  /** Optional image URL (e.g. generated graphic from Agent X) */
  readonly imageUrl?: string;
  /** File attachments (images, PDFs, CSVs) uploaded with this message. */
  readonly attachments?: readonly AgentXAttachment[];
  /** Optional metadata */
  readonly metadata?: AgentXMessageMetadata;
  /**
   * When present, this message should render as an Action Card instead of a text bubble.
   * Populated when the agent yields control back to the user (approval or input needed).
   */
  readonly yieldState?: AgentYieldState;
  /** The operation ID associated with this yield (needed to approve/reply). */
  readonly operationId?: string;
  /**
   * Inline tool execution steps displayed as a Copilot-style accordion.
   * Populated in real time as the backend executes tools during a streaming response.
   */
  readonly steps?: readonly AgentXToolStep[];
  /**
   * Rich interactive cards embedded in the message (e.g. planner checklist).
   * Rendered as standalone UI components inside the chat bubble.
   */
  readonly cards?: readonly AgentXRichCard[];
}

/**
 * Instruction for the frontend to auto-open the expanded side panel.
 * Attached to a message when the agent wants to surface a live view or media.
 */
export interface AutoOpenPanelInstruction {
  readonly type: 'live-view' | 'image' | 'video' | 'doc';
  readonly url: string;
  readonly title?: string;
}

/**
 * Optional metadata attached to messages.
 */
export interface AgentXMessageMetadata {
  /** Model used for generation */
  readonly model?: string;
  /** Tokens used in request */
  readonly inputTokens?: number;
  /** Tokens in response */
  readonly outputTokens?: number;
  /** Processing time in milliseconds */
  readonly processingTime?: number;
  /** Mode context when message was sent */
  readonly mode?: AgentXMode;
  /** When present, the frontend should auto-open the expanded side panel with this content. */
  readonly autoOpenPanel?: AutoOpenPanelInstruction;
}

// ============================================
// QUICK TASK TYPES
// ============================================

/**
 * Quick task category based on user role.
 */
export type QuickTaskCategory = 'athlete' | 'coach' | 'college' | 'general';

/**
 * A predefined quick action task for the AI.
 */
export interface AgentXQuickTask {
  /** Unique task identifier */
  readonly id: string;
  /** Display title */
  readonly title: string;
  /** Short description */
  readonly description: string;
  /** Icon name (Ionicons) */
  readonly icon: string;
  /** Pre-filled prompt text */
  readonly prompt: string;
  /** Task category */
  readonly category: QuickTaskCategory;
  /** Optional badge count */
  readonly badge?: number;
}

// ============================================
// MODE TYPES
// ============================================

/**
 * Agent X operational modes (feature tabs).
 */
export type AgentXMode = 'highlights' | 'graphics' | 'recruiting' | 'evaluation';

/**
 * Mode configuration for display.
 */
export interface AgentXModeConfig {
  /** Mode identifier */
  readonly id: AgentXMode;
  /** Display label */
  readonly label: string;
  /** Optional icon */
  readonly icon?: string;
  /** Mode description */
  readonly description?: string;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

/**
 * Request to send a message to Agent X.
 */
export interface AgentXChatRequest {
  /** The user's message */
  readonly message: string;
  /** Current operational mode */
  readonly mode?: AgentXMode;
  /** Conversation history for context */
  readonly history?: readonly AgentXMessage[];
  /** User context for personalization */
  readonly userContext?: AgentXUserContext;
  /**
   * MongoDB thread ID for conversation continuity.
   * Omit to start a new thread; include to continue an existing one.
   * Resolved by the backend on the `event: thread` SSE frame.
   */
  readonly threadId?: string;
  /**
   * File attachments to send alongside the message.
   * Each attachment must already be uploaded to Firebase Storage;
   * these contain the CDN URLs + metadata resolved after upload.
   */
  readonly attachments?: readonly AgentXAttachment[];
}

/**
 * Response from Agent X chat endpoint.
 */
export interface AgentXChatResponse {
  /** Whether request was successful */
  readonly success: boolean;
  /** The assistant's response message */
  readonly message?: AgentXMessage;
  /** Error details if failed */
  readonly error?: string;
  /** Error code for programmatic handling */
  readonly errorCode?: AgentXErrorCode;
}

/**
 * User context for AI personalization.
 */
export interface AgentXUserContext {
  /** User's role on the platform */
  readonly role?: string;
  /** User's primary sport */
  readonly sport?: string;
  /** User's position/event */
  readonly position?: string;
  /** Graduation year (for athletes) */
  readonly gradYear?: number;
  /** User's state/region */
  readonly state?: string;
  /** Whether user has premium subscription */
  readonly isPremium?: boolean;
}

// ============================================
// TOOL STEP & RICH CARD TYPES
// ============================================

/** Execution status of a single tool step. */
export type AgentXToolStepStatus = 'pending' | 'active' | 'success' | 'error';

/**
 * A single tool execution step shown as an inline log in the chat bubble.
 * Rendered in a Copilot-style accordion: spinner when active, checkmark on success.
 */
export interface AgentXToolStep {
  /** Unique step identifier (UUID). */
  readonly id: string;
  /** Short human-readable label (e.g. "Searching athlete database…"). */
  readonly label: string;
  /** Current execution status — updated in real time via SSE. */
  readonly status: AgentXToolStepStatus;
  /** Optional detail text shown when the accordion is expanded. */
  readonly detail?: string;
}

/** Card type discriminator for rich inline cards. */
export type AgentXRichCardType =
  | 'planner'
  | 'confirmation'
  | 'data-table'
  | 'citations'
  | 'parameter-form'
  | 'draft'
  | 'profile'
  | 'film-timeline';

/** A single item in a planner checklist card. */
export interface AgentXPlannerItem {
  /** Unique ID for this checklist item. */
  readonly id: string;
  /** Human-readable step description. */
  readonly label: string;
  /** Whether the step is complete. */
  readonly done: boolean;
}

/**
 * A rich interactive card rendered inline in the chat timeline.
 * The `type` discriminator determines which Angular component is projected.
 */
export interface AgentXRichCard {
  /** Card type — drives Angular component selection. */
  readonly type: AgentXRichCardType;
  /** Card title (shown as header). */
  readonly title: string;
  /** Type-specific payload. */
  readonly payload:
    | AgentXPlannerPayload
    | AgentXDataTablePayload
    | AgentXConfirmationPayload
    | AgentXCitationsPayload
    | AgentXParameterFormPayload
    | AgentXDraftPayload
    | AgentXProfilePayload
    | AgentXFilmTimelinePayload
    | Record<string, unknown>;
}

// ── Planner ──

/** Payload for the `planner` card type. */
export interface AgentXPlannerPayload {
  /** Ordered list of checklist items. */
  readonly items: readonly AgentXPlannerItem[];
}

// ── Data Table ──

/** Column definition for the `data-table` card type. */
export interface AgentXDataTableColumn {
  /** Machine-readable key (matches row value keys). */
  readonly key: string;
  /** Human-visible column header. */
  readonly label: string;
  /** Optional text alignment. */
  readonly align?: 'left' | 'center' | 'right';
}

/** Payload for the `data-table` card type. */
export interface AgentXDataTablePayload {
  /** Column definitions (order determines display order). */
  readonly columns: readonly AgentXDataTableColumn[];
  /** Row data — each row is a key/value map matching column keys. */
  readonly rows: readonly Record<string, string | number | boolean | undefined>[];
}

// ── Confirmation ──

/** A single action button in the `confirmation` card. */
export interface AgentXConfirmationAction {
  /** Machine-readable action identifier. */
  readonly id: string;
  /** Human-visible button label. */
  readonly label: string;
  /** Visual style variant. */
  readonly variant: 'primary' | 'secondary' | 'destructive';
}

/** Payload for the `confirmation` card type. */
export interface AgentXConfirmationPayload {
  /** Descriptive message body. */
  readonly message: string;
  /** Available action buttons (max 3). */
  readonly actions: readonly AgentXConfirmationAction[];
}

// ── Citations ──

/** A single citation/source reference. */
export interface AgentXCitation {
  /** Unique citation identifier. */
  readonly id: string;
  /** Display label (e.g. article title, page name). */
  readonly label: string;
  /** Destination URL. */
  readonly url: string;
  /** Optional favicon or icon URL. */
  readonly iconUrl?: string;
}

/** Payload for the `citations` card type. */
export interface AgentXCitationsPayload {
  /** Ordered list of cited source references. */
  readonly sources: readonly AgentXCitation[];
}

// ── Parameter Form ──

/** A single form field in the `parameter-form` card. */
export interface AgentXParameterField {
  /** Machine-readable field key (submitted in the form payload). */
  readonly key: string;
  /** Human-visible label. */
  readonly label: string;
  /** Input type. */
  readonly type: 'text' | 'number' | 'select' | 'toggle';
  /** Default value (pre-filled in the form). */
  readonly defaultValue?: string | number | boolean;
  /** Options list (required when type = 'select'). */
  readonly options?: readonly string[];
  /** Optional placeholder text. */
  readonly placeholder?: string;
}

/** Payload for the `parameter-form` card type. */
export interface AgentXParameterFormPayload {
  /** Ordered list of form fields. */
  readonly fields: readonly AgentXParameterField[];
  /** Label for the submit button. */
  readonly submitLabel: string;
}

// ── Draft ──

/** Payload for the `draft` card type (outreach editor). */
export interface AgentXDraftPayload {
  /** The draft body content (editable by the user). */
  readonly content: string;
  /** Optional email subject line (editable by the user). */
  readonly subject?: string;
  /** Number of recipients (display-only context). */
  readonly recipientsCount?: number;
}

// ── Profile ──

/** A single stat displayed in the profile micro-card. */
export interface AgentXProfileStat {
  /** Stat label (e.g. "Height", "GPA", "40yd"). */
  readonly label: string;
  /** Stat value (e.g. "6'2\"", "3.8", "4.45s"). */
  readonly value: string;
}

/** Payload for the `profile` card type (player snapshot). */
export interface AgentXProfilePayload {
  /** Platform user ID (used for "View Profile" navigation). */
  readonly userId: string;
  /** Display name. */
  readonly name: string;
  /** Avatar CDN URL. */
  readonly avatarUrl?: string;
  /** Primary position (e.g. "Point Guard", "Wide Receiver"). */
  readonly position?: string;
  /** Graduation year. */
  readonly gradYear?: number;
  /** Ordered key stats shown below the name. */
  readonly stats?: readonly AgentXProfileStat[];
}

// ── Film Timeline ──

/** A single timestamped marker in a film analysis. */
export interface AgentXFilmMarker {
  /** Timestamp in milliseconds from video start. */
  readonly timeMs: number;
  /** Short human-readable annotation. */
  readonly label: string;
  /** Optional sentiment/category for visual styling. */
  readonly sentiment?: 'positive' | 'negative' | 'neutral';
}

/** Payload for the `film-timeline` card type (video analyst). */
export interface AgentXFilmTimelinePayload {
  /** The video ID this timeline annotates (for parent scrub control). */
  readonly videoId: string;
  /** Ordered list of timestamped markers. */
  readonly markers: readonly AgentXFilmMarker[];
}

// ============================================
// SSE STREAMING TYPES
// ============================================

/**
 * Payload of the `event: thread` SSE frame.
 * Sent immediately when the backend resolves/creates the thread,
 * before any LLM inference begins — so the client can persist
 * the threadId without waiting for the full response.
 */
export interface AgentXStreamThreadEvent {
  readonly threadId: string;
}

/**
 * Payload of the `event: delta` SSE frame.
 * One frame per token chunk emitted by the LLM.
 */
export interface AgentXStreamDeltaEvent {
  readonly content: string;
}

/**
 * Payload of the `event: done` SSE frame.
 * Final frame sent after all deltas — contains usage metadata.
 */
export interface AgentXStreamDoneEvent {
  readonly threadId: string;
  readonly model: string;
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly costUsd?: number;
  };
  /** When present, the frontend should auto-open the expanded side panel. */
  readonly autoOpenPanel?: AutoOpenPanelInstruction;
}

/**
 * Payload of the `event: error` SSE frame.
 */
export interface AgentXStreamErrorEvent {
  readonly error: string;
}

/**
 * Payload of the `event: step` SSE frame.
 * Sent when the backend begins, updates, or completes a tool execution step.
 */
export interface AgentXStreamStepEvent {
  /** Unique step identifier. */
  readonly id: string;
  /** Short human-readable label (e.g. "Querying athlete stats…"). */
  readonly label: string;
  /** Current step status — `active` when starting, `success`/`error` when done. */
  readonly status: AgentXToolStepStatus;
  /** Optional expanded detail (e.g. "Found 24 matching athletes"). */
  readonly detail?: string;
}

/**
 * Payload of the `event: card` SSE frame.
 * Sent when the backend wants to embed a rich interactive card in the chat.
 */
export interface AgentXStreamCardEvent {
  /** Card type discriminator. */
  readonly type: AgentXRichCardType;
  /** Card title. */
  readonly title: string;
  /** Type-specific payload (e.g. planner checklist items). */
  readonly payload:
    | AgentXPlannerPayload
    | AgentXDataTablePayload
    | AgentXConfirmationPayload
    | AgentXCitationsPayload
    | AgentXParameterFormPayload
    | Record<string, unknown>;
}

/**
 * Callbacks consumed by `streamMessage()` in the API factory.
 */
export interface AgentXStreamCallbacks {
  /** Called as soon as the backend resolves the threadId (before LLM starts). */
  onThread?: (event: AgentXStreamThreadEvent) => void;
  /** Called for every token chunk the LLM streams. */
  onDelta: (event: AgentXStreamDeltaEvent) => void;
  /** Called once when the stream completes successfully. */
  onDone: (event: AgentXStreamDoneEvent) => void;
  /** Called if the stream encounters an error. */
  onError: (event: AgentXStreamErrorEvent) => void;
  /** Called when a tool execution step starts, updates, or completes. */
  onStep?: (event: AgentXStreamStepEvent) => void;
  /** Called when the backend embeds a rich interactive card (planner, table, etc.). */
  onCard?: (event: AgentXStreamCardEvent) => void;
}

/**
 * Error codes for Agent X operations.
 */
export type AgentXErrorCode =
  | 'RATE_LIMITED'
  | 'CONTEXT_TOO_LONG'
  | 'INVALID_REQUEST'
  | 'MODEL_UNAVAILABLE'
  | 'UNAUTHORIZED'
  | 'QUOTA_EXCEEDED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

// ============================================
// CONFIGURATION TYPES
// ============================================

/**
 * Agent X service configuration.
 */
export interface AgentXConfig {
  /** Maximum messages to keep in history */
  readonly maxHistoryLength: number;
  /** Maximum input length in characters */
  readonly maxInputLength: number;
  /** Request timeout in milliseconds */
  readonly timeoutMs: number;
  /** Whether to enable typing animation */
  readonly enableTypingAnimation: boolean;
  /** Animated welcome titles */
  readonly welcomeTitles: readonly string[];
  /** Title rotation interval in milliseconds */
  readonly titleRotationMs: number;
}

/**
 * Agent X state snapshot (for persistence/hydration).
 */
export interface AgentXState {
  /** Current messages */
  readonly messages: readonly AgentXMessage[];
  /** Currently selected mode */
  readonly selectedMode: AgentXMode;
  /** Selected quick task (if any) */
  readonly selectedTask: AgentXQuickTask | null;
  /** Current input value */
  readonly inputValue: string;
  /** Whether currently loading */
  readonly isLoading: boolean;
}

// ============================================
// SHELL CONTENT TYPES (Portable)
// ============================================

/** A contextual action chip for quick workflows. */
export interface ShellActionChip {
  readonly id: string;
  readonly label: string;
  readonly subLabel?: string;
  readonly icon: string;
}

/** A group of related quick commands under a category. */
export interface ShellCommandCategory {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  /** Short intro shown as the coordinator's opening message. */
  readonly description: string;
  readonly commands: readonly ShellActionChip[];
}

/** Daily briefing insight from Agent X. */
export interface ShellBriefingInsight {
  readonly id: string;
  readonly text: string;
  readonly icon: string;
  readonly type: 'info' | 'warning' | 'success';
}

/** A goal tag linking a playbook task to a user objective. */
export interface ShellGoalTag {
  readonly id: string;
  readonly label: string;
}

/** Coordinator that suggested a playbook task. */
export interface ShellPlaybookCoordinator {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
}

/** A weekly timeline item generated by Agent X. */
export interface ShellWeeklyPlaybookItem {
  readonly id: string;
  readonly weekLabel: string;
  readonly title: string;
  readonly summary: string;
  readonly why: string;
  readonly details: string;
  readonly actionLabel: string;
  readonly status: 'pending' | 'in-progress' | 'complete' | 'problem';
  readonly goal?: ShellGoalTag;
  readonly coordinator?: ShellPlaybookCoordinator;
}

/** An active background operation Agent X is processing. */
export interface ShellActiveOperation {
  readonly id: string;
  readonly label: string;
  readonly progress: number;
  readonly icon: string;
  readonly status: 'processing' | 'complete' | 'error' | 'awaiting_input';
  /** MongoDB thread ID — when set, opening this operation displays the persisted worker conversation. */
  readonly threadId?: string;
  /** Present when `status === 'awaiting_input'` — describes what the agent needs from the user. */
  readonly yieldState?: AgentYieldState;
  /** Present when `status === 'error'` — human-readable reason the operation failed. */
  readonly errorMessage?: string;
}

/** Resolved shell content for a given user role. */
export interface ShellContentForRole {
  readonly coordinators: readonly ShellCommandCategory[];
}

// ============================================
// DASHBOARD API TYPES
// ============================================

/** A user-set goal that drives playbook generation. */
export interface AgentDashboardGoal {
  readonly id: string;
  readonly text: string;
  readonly category: string;
  readonly icon?: string;
  readonly createdAt: string;
}

/** Dashboard response aggregating all Agent X shell data. */
export interface AgentDashboardResponse {
  readonly success: boolean;
  readonly data?: AgentDashboardData;
  readonly error?: string;
}

/** Full dashboard payload returned by the backend. */
export interface AgentDashboardData {
  readonly briefing: AgentDashboardBriefing;
  readonly playbook: AgentDashboardPlaybook;
  readonly activeOperations: readonly ShellActiveOperation[];
  readonly coordinators: readonly ShellCommandCategory[];
}

/** AI-generated daily briefing. */
export interface AgentDashboardBriefing {
  readonly previewText: string;
  readonly insights: readonly ShellBriefingInsight[];
  readonly generatedAt: string;
}

/** Goal-driven weekly playbook. */
export interface AgentDashboardPlaybook {
  readonly items: readonly ShellWeeklyPlaybookItem[];
  readonly goals: readonly AgentDashboardGoal[];
  readonly generatedAt: string | null;
  readonly canRegenerate: boolean;
}

/** Request to set/update user goals (max 2). */
export interface AgentSetGoalsRequest {
  readonly goals: readonly AgentDashboardGoal[];
}

/** Request to regenerate the weekly playbook. */
export interface AgentRegeneratePlaybookRequest {
  readonly force?: boolean;
}

/** Response from playbook generation. */
export interface AgentPlaybookResponse {
  readonly success: boolean;
  readonly data?: AgentDashboardPlaybook;
  readonly error?: string;
}

// ============================================
// OPERATIONS LOG TYPES
// ============================================

/** Display status for an operation log entry (mapped from AgentOperationStatus). */
export type OperationLogStatus =
  | 'complete'
  | 'error'
  | 'cancelled'
  | 'in-progress'
  | 'awaiting_input';

/** Category of an operation for icon/color grouping. */
export type OperationLogCategory =
  | 'outreach'
  | 'content'
  | 'film'
  | 'recruiting'
  | 'analytics'
  | 'profile'
  | 'system';

/** A single entry in the operations activity log. */
export interface OperationLogEntry {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly icon: string;
  readonly status: OperationLogStatus;
  readonly category: OperationLogCategory;
  /** ISO-8601 timestamp for display ordering and day-grouping. */
  readonly timestamp: string;
  /** Human-readable duration string (e.g. `"2m 15s"`). Only present for completed operations. */
  readonly duration?: string;
  /** MongoDB thread ID linking to the Agent X conversation for this operation. */
  readonly threadId?: string;
  /**
   * How this operation was initiated.
   * - `'user'` — direct user prompt in chat UI
   * - `'system_cron'` — scheduled task (daily briefing, weekly recap)
   * - `'database_event'` — Firestore/MongoDB change stream trigger
   * - `'webhook'` — external webhook (Stripe, MaxPreps, etc.)
   * - `'agent_chain'` — another agent spawned this job
   */
  readonly origin?: AgentJobOrigin;
  /**
   * `true` when the operation was initiated automatically (not by the user directly).
   * Derived from origin: any non-`'user'` origin is considered scheduled/automated.
   */
  readonly isScheduled?: boolean;
  /**
   * Supplementary context for this entry. Shape varies by source:
   *
   * Firestore job entries:
   * ```ts
   * { agent?: string | null }
   * ```
   *
   * MongoDB thread entries:
   * ```ts
   * { source: 'thread'; messageCount: number; threadCategory: string | null }
   * ```
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** API response for the operations log endpoint. */
export interface OperationsLogResponse {
  readonly success: boolean;
  readonly data?: readonly OperationLogEntry[];
  readonly error?: string;
}
