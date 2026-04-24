/**
 * @fileoverview Session Memory Service
 * @module @nxt1/backend/modules/agent/memory
 *
 * Short-term, thread-scoped conversation memory stored in Redis.
 * Each (userId, threadId) pair gets its own isolated Redis key — users can
 * have unlimited simultaneous threads open with zero cross-contamination.
 *
 * Key design:
 *   session:thread:{userId}:{threadId}  →  JSON StoredSession blob (TTL 1800s)
 *   session:thread:{userId}:anonymous   →  scratch key when threadId is unknown
 *
 * Only 'user' and 'assistant' role messages are stored. Tool observations
 * stay in base.agent.ts's ReAct loop context window only.
 *
 * Cold-start seeding: On a Redis miss (first message or post-TTL expiry)
 * getOrCreate() calls ContextBuilder.getRecentThreadMessages() to seed recent
 * turns from MongoDB so the agent is never amnesiac after 30 min inactivity.
 *
 * @example
 * ```ts
 * const session = new SessionMemoryService(cache, contextBuilder);
 *
 * // Load or create — returns prior turns only (not the current message)
 * const ctx = await session.getOrCreate(userId, threadId);
 *
 * // Append user message BEFORE DAG runs (race-safe)
 * await session.appendMessage(userId, threadId, { role: 'user', content: intent, timestamp });
 *
 * // Fire-and-forget assistant reply after DAG completes
 * session.appendMessage(userId, threadId, { role: 'assistant', content: summary, timestamp })
 *   .catch(logger.warn);
 *
 * // On thread archive
 * await session.clear(userId, threadId);
 * ```
 */

import type { AgentSessionContext, AgentSessionMessage } from '@nxt1/core';
import type { CacheService as ICacheService } from '@nxt1/cache';
import type { ContextBuilder } from './context-builder.js';
import { logger } from '../../../utils/logger.js';
import { CACHE_TTL } from '../../../services/core/cache.service.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Sliding inactivity window. TTL resets on every read or write.
 * Mirrors backend convention: TRENDING = MEDIUM_TTL * 2 = 1800s (30 min).
 */
const SESSION_TTL_SECONDS = CACHE_TTL.TRENDING; // 1800s — 30 minutes

/** Maximum user+assistant messages retained per thread session. */
const MAX_HISTORY_MESSAGES = 20; // 10 full conversation turns

// ─── Internal Types ───────────────────────────────────────────────────────────

interface StoredSession {
  sessionId: string;
  userId: string;
  threadId: string;
  conversationHistory: AgentSessionMessage[];
  createdAt: string;
  lastActiveAt: string;
}

// ─── Key Helpers ─────────────────────────────────────────────────────────────

function sessionKey(userId: string, threadId: string): string {
  return `session:thread:${userId}:${threadId}`;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class SessionMemoryService {
  constructor(
    private readonly cache: ICacheService,
    private readonly contextBuilder?: ContextBuilder
  ) {}

  /**
   * Load an existing thread session from Redis, or create a new one.
   *
   * On a cache miss (cold start or TTL expiry), seeds conversation history
   * from MongoDB via ContextBuilder.getRecentThreadMessages() so the agent
   * is not amnesiac after 30 minutes of inactivity.
   *
   * Returns prior turns ONLY — the current user message is appended separately
   * by the caller (AgentRouter) BEFORE the DAG executes to avoid duplication.
   */
  async getOrCreate(userId: string, threadId?: string): Promise<AgentSessionContext> {
    const resolvedThreadId = threadId ?? 'anonymous';
    const key = sessionKey(userId, resolvedThreadId);
    const now = new Date().toISOString();

    try {
      const raw = await this.cache.get<StoredSession>(key);
      if (raw) {
        // Warm hit — refresh sliding TTL and return
        await this.cache.set(key, raw, { ttl: SESSION_TTL_SECONDS });
        return this.toSessionContext(raw);
      }
    } catch (err) {
      logger.warn('[SessionMemory] Redis read failed — falling back to cold start', {
        userId,
        threadId: resolvedThreadId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Cold start — seed from MongoDB if possible
    let conversationHistory: AgentSessionMessage[] = [];
    if (this.contextBuilder && threadId) {
      try {
        conversationHistory = await this.contextBuilder.getRecentThreadMessages(threadId, 10);
      } catch (err) {
        logger.warn('[SessionMemory] MongoDB seed failed — starting with empty history', {
          userId,
          threadId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const session: StoredSession = {
      sessionId: crypto.randomUUID(),
      userId,
      threadId: resolvedThreadId,
      conversationHistory,
      createdAt: now,
      lastActiveAt: now,
    };

    try {
      await this.cache.set(key, session, { ttl: SESSION_TTL_SECONDS });
    } catch (err) {
      logger.warn('[SessionMemory] Redis write failed — session will not be persisted', {
        userId,
        threadId: resolvedThreadId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return this.toSessionContext(session);
  }

  /**
   * Append a message to a thread's conversation history.
   *
   * Only 'user' and 'assistant' roles should be appended — tool observations
   * must not be stored here (they inflate context with noise).
   *
   * Sliding TTL is reset on every append so active conversations never expire
   * mid-session.
   *
   * If the Redis key has expired (e.g. called fire-and-forget after a long
   * DAG run that exceeded TTL), this is a safe no-op — the next getOrCreate
   * will cold-start from MongoDB and rebuild state.
   */
  async appendMessage(
    userId: string,
    threadId: string,
    message: AgentSessionMessage
  ): Promise<void> {
    const key = sessionKey(userId, threadId);

    let session: StoredSession | null;
    try {
      session = await this.cache.get<StoredSession>(key);
    } catch (err) {
      logger.warn('[SessionMemory] Redis read failed during appendMessage', {
        userId,
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (!session) {
      // Key expired between getOrCreate and appendMessage — safe no-op.
      // The next getOrCreate will cold-seed from MongoDB.
      logger.warn('[SessionMemory] appendMessage: session expired mid-operation', {
        userId,
        threadId,
      });
      return;
    }

    const updated: StoredSession = {
      ...session,
      conversationHistory: [...session.conversationHistory, message].slice(-MAX_HISTORY_MESSAGES),
      lastActiveAt: new Date().toISOString(),
    };

    try {
      await this.cache.set(key, updated, { ttl: SESSION_TTL_SECONDS });
    } catch (err) {
      logger.warn('[SessionMemory] Redis write failed during appendMessage', {
        userId,
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Delete a thread's Redis session.
   *
   * Called by AgentChatService.archiveThread() so stale state never lingers
   * after a thread is removed. Safe no-op if the key is already gone.
   */
  async clear(userId: string, threadId: string): Promise<void> {
    const key = sessionKey(userId, threadId);
    try {
      await this.cache.del(key);
    } catch (err) {
      logger.warn('[SessionMemory] Redis del failed during clear', {
        userId,
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private toSessionContext(session: StoredSession): AgentSessionContext {
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      threadId: session.threadId === 'anonymous' ? undefined : session.threadId,
      conversationHistory: session.conversationHistory,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
    };
  }
}
