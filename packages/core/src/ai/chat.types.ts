/**
 * @fileoverview Agent X Chat Persistence Types
 * @module @nxt1/core/ai
 *
 * Shared types for persisting Agent X conversations in MongoDB.
 * Threads group messages into conversations; messages record each
 * user prompt and agent response with optional tool-call and
 * operation metadata.
 *
 * Storage Strategy:
 * - MongoDB for chronological chat history (Thread + Message models)
 * - MongoDB Atlas Vector Search (Phase 2) for semantic memory via
 *   optional `embedding` field on messages
 * - Firestore remains ephemeral job progress only (AgentJobs collection)
 *
 * 100% Portable — Zero framework dependencies.
 */

import type { AgentIdentifier, AgentJobOrigin, AgentToolCallRecord } from './agent.types';
import type { AgentXMessagePart, AgentXToolStep } from './agent-x.types';
import type { AgentXAttachment } from './agent-x.types';

// ─── Thread ─────────────────────────────────────────────────────────────────

/**
 * A conversation thread between a user and Agent X.
 * Each thread is a chronological sequence of messages scoped to one user.
 */
export interface AgentThread {
  /** MongoDB ObjectId as string. */
  readonly id: string;
  /** The user who owns this thread. */
  readonly userId: string;
  /** Auto-generated or user-edited thread title (first prompt summary). */
  readonly title: string;
  /** High-level topic for filtering/grouping in the UI. */
  readonly category?: AgentThreadCategory;
  /** Which sub-agent handled the most recent message (for UI badge). */
  readonly lastAgentId?: AgentIdentifier;
  /** ISO-8601 timestamp of the most recent message (for sort order). */
  readonly lastMessageAt: string;
  /** Total number of messages in this thread. */
  readonly messageCount: number;
  /** Whether the user has archived (hidden) this thread. */
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Backend-only: MongoDB TTL expiration date. */
  readonly expiresAt?: Date;
}

/** Thread categories for grouping in the UI sidebar. */
export type AgentThreadCategory =
  | 'general'
  | 'recruiting'
  | 'highlights'
  | 'graphics'
  | 'scouting'
  | 'analytics'
  | 'compliance'
  | 'performance';

// ─── Message ────────────────────────────────────────────────────────────────

/** Role of a message sender — aligns with existing AgentSessionMessage. */
export type AgentMessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Semantic phase of a persisted `AgentMessage` row. Used by the UI projection
 * layer to collapse multiple write paths (partial-on-pause, yield prompt,
 * final enriched response) into a single visible chat bubble per agent turn.
 *
 * Phase priority for the same `operationId` (highest wins):
 *   assistant_final > assistant_yield > assistant_partial > assistant_tool_call
 *
 * `tool_result` and `user_message` are never collapsed and always render
 * as-is (tool rows are filtered from the UI bubble feed entirely).
 */
export type AgentMessageSemanticPhase =
  | 'user_message'
  | 'assistant_tool_call'
  | 'tool_result'
  | 'assistant_partial'
  | 'assistant_yield'
  | 'assistant_final'
  | 'billing_gate';

/** Priority order for phase resolution — higher index wins. */
export const SEMANTIC_PHASE_PRIORITY: readonly AgentMessageSemanticPhase[] = [
  'assistant_tool_call',
  'tool_result',
  'user_message',
  'assistant_partial',
  'billing_gate',
  'assistant_yield',
  'assistant_final',
] as const;

/** User action types that can be recorded against a persisted message. */
export type AgentMessageActionType =
  | 'copied'
  | 'viewed'
  | 'edited'
  | 'deleted'
  | 'undone'
  | 'feedback_submitted';

/** Immutable record of a user edit to a message. */
export interface AgentMessageEditRecord {
  readonly editedAt: string;
  readonly originalContent: string;
  readonly newContent: string;
  readonly reason?: string;
  readonly agentRerunId?: string;
}

/** Optional user feedback attached to a message. */
export interface AgentMessageFeedback {
  readonly userId: string;
  readonly rating: 1 | 2 | 3 | 4 | 5;
  readonly text?: string;
  readonly category?: 'helpful' | 'incorrect' | 'incomplete' | 'confusing' | 'other';
  readonly createdAt: string;
}

/** Immutable action event recorded for analytics and auditing. */
export interface AgentMessageActionRecord {
  readonly type: AgentMessageActionType;
  readonly userId: string;
  readonly timestamp: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * A single message within an AgentThread.
 * Extends the lightweight AgentSessionMessage with persistence metadata.
 */
export interface AgentMessage {
  /** MongoDB ObjectId as string. */
  readonly id: string;
  /** The thread this message belongs to. */
  readonly threadId: string;
  /** The user who owns the thread. */
  readonly userId: string;
  /** Message role (user prompt, assistant reply, system note, tool output). */
  readonly role: AgentMessageRole;
  /** The text content of the message. */
  readonly content: string;
  /** How this message was initiated. */
  readonly origin: AgentJobOrigin;
  /** Which sub-agent produced this response (null for user messages). */
  readonly agentId?: AgentIdentifier;
  /** Link to the background operation that produced this reply. */
  readonly operationId?: string;
  /** File attachments (images, videos, docs) sent with this message. */
  readonly attachments?: readonly AgentXAttachment[];
  /** Structured result data the UI can render (graphics, emails, etc.). */
  readonly resultData?: Record<string, unknown>;
  /** Tool calls made during this message's generation. */
  readonly toolCalls?: readonly AgentToolCallRecord[];
  /**
   * Phase A (thread-as-truth): wire-format LLM tool_calls preserved
   * verbatim. Used by `ThreadMessageReplayService` to reconstruct an
   * OpenRouter-valid `LLMMessage[]` on the next turn. Optional — only
   * present on `role:'assistant'` messages that emitted tool calls.
   */
  readonly toolCallsWire?: readonly {
    readonly id: string;
    readonly type: 'function';
    readonly function: { readonly name: string; readonly arguments: string };
  }[];
  /**
   * Phase A (thread-as-truth): for `role:'tool'` messages, the id of the
   * assistant.tool_calls entry this row resolves.
   */
  readonly toolCallId?: string;
  /**
   * Persisted tool execution steps captured from the live stream.
   * Used to rehydrate the exact execution log on reload without falling back
   * to lossy tool-call reconstruction.
   */
  readonly steps?: readonly AgentXToolStep[];
  /**
   * Persisted interleaved message parts captured from the live stream.
   * Preserves the exact text → tools → cards sequence seen during execution.
   */
  readonly parts?: readonly AgentXMessagePart[];
  /** Token usage for this message (for usage tracking in the UI). */
  readonly tokenUsage?: AgentMessageTokenUsage;
  /** User edit history (most recent edit appended last). */
  readonly editHistory?: readonly AgentMessageEditRecord[];
  /** Optional user feedback for this message. */
  readonly feedback?: AgentMessageFeedback;
  /** Action timeline for copy/edit/delete/undo/feedback interactions. */
  readonly actions?: readonly AgentMessageActionRecord[];
  /**
   * Vector embedding for semantic search (Phase 2).
   * Populated asynchronously after message creation.
   * Stored as a number array for MongoDB Atlas Vector Search.
   */
  readonly embedding?: readonly number[];
  /** Soft-delete marker; omitted when the message is active. */
  readonly deletedAt?: string | null;
  /** User who soft-deleted the message. */
  readonly deletedBy?: string;
  /** Recovery token used to restore soft-deleted messages (undo). */
  readonly restoreTokenId?: string;
  readonly createdAt: string;
  /** Backend-only: MongoDB TTL expiration date. */
  readonly expiresAt?: Date;
  /**
   * Backend-only: optional caller-supplied idempotency key. When present, a
   * unique sparse MongoDB index guarantees exactly-once persistence across
   * BullMQ retries. Not surfaced in the UI.
   */
  readonly idempotencyKey?: string;
  /**
   * Semantic phase of this row within the agent's write lifecycle.
   * Used by the UI projection layer to collapse partial/yield/final rows for
   * the same `operationId` into a single visible bubble. When `assistant_final`
   * exists for an operationId, all `assistant_partial` rows for that same
   * operationId are suppressed from the rendered chat feed.
   *
   * Set on every backend write — legacy rows without this field are treated
   * as `assistant_final` by the UI projection for backwards compatibility.
   */
  readonly semanticPhase?: AgentMessageSemanticPhase;
}

/** Token usage metadata for a single message. */
export interface AgentMessageTokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly model: string;
  readonly costUsd?: number;
}

// ─── Pagination ─────────────────────────────────────────────────────────────

/** Query parameters for paginated thread listing. */
export interface AgentThreadQuery {
  readonly userId: string;
  readonly archived?: boolean;
  readonly category?: AgentThreadCategory;
  /** Number of threads to return (default: 20). */
  readonly limit?: number;
  /** ISO-8601 cursor — return threads before this timestamp. */
  readonly before?: string;
}

/** Query parameters for paginated message listing. */
export interface AgentMessageQuery {
  readonly threadId: string;
  /** Number of messages to return (default: 50). */
  readonly limit?: number;
  /** ISO-8601 cursor — return messages before this timestamp. */
  readonly before?: string;
}

/** Paginated response wrapper. */
export interface PaginatedResult<T> {
  readonly items: readonly T[];
  /** True if more items exist beyond this page. */
  readonly hasMore: boolean;
  /** Cursor value for the next page request. */
  readonly nextCursor?: string;
}
