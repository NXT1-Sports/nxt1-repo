/**
 * @fileoverview Session Memory Service
 * @module @nxt1/backend/modules/agent/memory
 *
 * Short-term, session-scoped memory stored in Redis.
 * Holds the current conversation history so the agent has immediate context
 * without hitting the vector DB for every message.
 *
 * Responsibilities:
 * - Create / load / update a session context for a userId.
 * - Append messages to the conversation history.
 * - Enforce a max history window (trim oldest messages when exceeded).
 * - Expire sessions after inactivity (TTL-based).
 *
 * @example
 * ```ts
 * const session = new SessionMemoryService(redis);
 *
 * // Load or create a session
 * const ctx = await session.getOrCreate(userId);
 *
 * // Append a user message
 * await session.appendMessage(ctx.sessionId, { role: 'user', content: '...' });
 * ```
 */

import type { AgentSessionContext, AgentSessionMessage } from '@nxt1/core';

export class SessionMemoryService {
  /**
   * Get an existing session or create a new one for the user.
   */
  async getOrCreate(_userId: string): Promise<AgentSessionContext> {
    throw new Error('SessionMemoryService.getOrCreate() not implemented');
  }

  /**
   * Append a message to the session's conversation history.
   */
  async appendMessage(_sessionId: string, _message: AgentSessionMessage): Promise<void> {
    throw new Error('SessionMemoryService.appendMessage() not implemented');
  }

  /**
   * Clear the session (e.g., user clicks "New conversation").
   */
  async clear(_sessionId: string): Promise<void> {
    throw new Error('SessionMemoryService.clear() not implemented');
  }
}
