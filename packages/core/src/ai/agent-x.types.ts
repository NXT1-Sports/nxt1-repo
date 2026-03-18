/**
 * @fileoverview Agent X Type Definitions
 * @module @nxt1/core/ai
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for Agent X AI assistant.
 * 100% portable - works on web, mobile, and backend.
 */

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
  /** Optional metadata */
  readonly metadata?: AgentXMessageMetadata;
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
}

/**
 * Payload of the `event: error` SSE frame.
 */
export interface AgentXStreamErrorEvent {
  readonly error: string;
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

/** A weekly timeline item generated by Agent X. */
export interface ShellWeeklyPlaybookItem {
  readonly id: string;
  readonly weekLabel: string;
  readonly title: string;
  readonly summary: string;
  readonly details: string;
  readonly actionLabel: string;
  readonly status: 'pending' | 'in-progress' | 'complete' | 'problem';
  readonly goal?: ShellGoalTag;
}

/** An active background operation Agent X is processing. */
export interface ShellActiveOperation {
  readonly id: string;
  readonly label: string;
  readonly progress: number;
  readonly icon: string;
  readonly status: 'processing' | 'complete' | 'error';
  /** MongoDB thread ID — when set, opening this operation displays the persisted worker conversation. */
  readonly threadId?: string;
}

/** Resolved shell content for a given user role. */
export interface ShellContentForRole {
  readonly coordinators: readonly ShellCommandCategory[];
  readonly briefingInsights: readonly ShellBriefingInsight[];
  readonly briefingPreviewText: string;
  readonly weeklyPlaybook: readonly ShellWeeklyPlaybookItem[];
  readonly activeOperations: readonly ShellActiveOperation[];
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
export type OperationLogStatus = 'complete' | 'error' | 'cancelled' | 'in-progress';

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
  readonly timestamp: string;
  readonly duration?: string;
  /** MongoDB thread ID linking to the Agent X conversation for this operation. */
  readonly threadId?: string;
  readonly metadata?: Record<string, unknown>;
}

/** API response for the operations log endpoint. */
export interface OperationsLogResponse {
  readonly success: boolean;
  readonly data?: readonly OperationLogEntry[];
  readonly error?: string;
}
