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
