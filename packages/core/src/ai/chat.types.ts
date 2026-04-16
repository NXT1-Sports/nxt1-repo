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
  /** Structured result data the UI can render (graphics, emails, etc.). */
  readonly resultData?: Record<string, unknown>;
  /** Tool calls made during this message's generation. */
  readonly toolCalls?: readonly AgentToolCallRecord[];
  /** Token usage for this message (for usage tracking in the UI). */
  readonly tokenUsage?: AgentMessageTokenUsage;
  /**
   * Vector embedding for semantic search (Phase 2).
   * Populated asynchronously after message creation.
   * Stored as a number array for MongoDB Atlas Vector Search.
   */
  readonly embedding?: readonly number[];
  readonly createdAt: string;
  /** Backend-only: MongoDB TTL expiration date. */
  readonly expiresAt?: Date;
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
