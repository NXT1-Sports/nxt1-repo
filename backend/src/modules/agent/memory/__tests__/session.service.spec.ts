/**
 * @fileoverview SessionMemoryService — Unit Tests
 * @module @nxt1/backend/modules/agent/memory
 *
 * Tests thread-scoped Redis session memory: cold start, warm hits,
 * MongoDB seeding, concurrent thread isolation, append trimming,
 * TTL refresh, expiry no-op, and clear.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionMemoryService } from '../session.service.js';
import type { CacheService as ICacheService } from '@nxt1/cache';
import type { ContextBuilder } from '../context-builder.js';
import type { AgentSessionMessage } from '@nxt1/core';

// ─── Fake CacheService ───────────────────────────────────────────────────────

function createFakeCache(): ICacheService & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    async get<T>(key: string): Promise<T | null> {
      return (store.get(key) as T) ?? null;
    },
    async set(key: string, value: unknown): Promise<void> {
      store.set(key, value);
    },
    async del(key: string): Promise<void> {
      store.delete(key);
    },
    async exists(key: string): Promise<boolean> {
      return store.has(key);
    },
    async mget<T>(keys: string[]): Promise<(T | null)[]> {
      return keys.map((k) => (store.get(k) as T) ?? null);
    },
    async mset(entries: Record<string, unknown>): Promise<void> {
      for (const [k, v] of Object.entries(entries)) store.set(k, v);
    },
    async keys(_pattern: string): Promise<string[]> {
      return [...store.keys()];
    },
    async flush(): Promise<void> {
      store.clear();
    },
  };
}

function createFakeContextBuilder(messages: AgentSessionMessage[] = []): Partial<ContextBuilder> {
  return {
    getRecentThreadMessages: vi.fn().mockResolvedValue(messages),
  };
}

const MSG_USER: AgentSessionMessage = {
  role: 'user',
  content: 'What are my highlights?',
  timestamp: '2026-01-01T00:00:00.000Z',
};

const MSG_ASSISTANT: AgentSessionMessage = {
  role: 'assistant',
  content: 'Here are your top plays...',
  timestamp: '2026-01-01T00:00:01.000Z',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SessionMemoryService', () => {
  let cache: ReturnType<typeof createFakeCache>;

  beforeEach(() => {
    cache = createFakeCache();
    vi.clearAllMocks();
  });

  // ── Test 1: Cold start, no contextBuilder ────────────────────────────────
  it('creates a new session with empty history on cold start (no contextBuilder)', async () => {
    const service = new SessionMemoryService(cache as unknown as ICacheService);

    const ctx = await service.getOrCreate('user1', 'thread1');

    expect(ctx.userId).toBe('user1');
    expect(ctx.threadId).toBe('thread1');
    expect(ctx.conversationHistory).toEqual([]);
    expect(ctx.sessionId).toBeTruthy();
    // Key should now exist in cache
    expect(cache.store.has('session:thread:user1:thread1')).toBe(true);
  });

  // ── Test 2: Warm Redis hit ────────────────────────────────────────────────
  it('returns stored history on warm Redis hit without calling contextBuilder again', async () => {
    const contextBuilder = createFakeContextBuilder([]);
    const service = new SessionMemoryService(
      cache as unknown as ICacheService,
      contextBuilder as ContextBuilder
    );

    // Cold start — seeds empty history (contextBuilder called once)
    await service.getOrCreate('user1', 'thread1');
    await service.appendMessage('user1', 'thread1', MSG_USER);

    vi.clearAllMocks(); // Reset call count after cold start

    // Warm hit — should read from Redis, NOT call contextBuilder again
    const ctx = await service.getOrCreate('user1', 'thread1');

    expect(ctx.conversationHistory).toHaveLength(1);
    expect(ctx.conversationHistory[0]).toEqual(MSG_USER);
    expect(contextBuilder.getRecentThreadMessages).not.toHaveBeenCalled();
  });

  // ── Test 3: Cold start WITH contextBuilder seeds from MongoDB ─────────────
  it('seeds history from MongoDB on cold start when contextBuilder is provided', async () => {
    const seedMessages = [MSG_USER, MSG_ASSISTANT];
    const contextBuilder = createFakeContextBuilder(seedMessages);
    const service = new SessionMemoryService(
      cache as unknown as ICacheService,
      contextBuilder as ContextBuilder
    );

    const ctx = await service.getOrCreate('user1', 'thread1');

    expect(contextBuilder.getRecentThreadMessages).toHaveBeenCalledWith('thread1', 10);
    expect(ctx.conversationHistory).toHaveLength(2);
    expect(ctx.conversationHistory[0]).toEqual(MSG_USER);
    expect(ctx.conversationHistory[1]).toEqual(MSG_ASSISTANT);
  });

  // ── Test 4: TTL-expired session re-seeds from MongoDB ────────────────────
  it('re-seeds from MongoDB when Redis key has expired (simulated by cache miss)', async () => {
    const seedMessages = [MSG_USER];
    const contextBuilder = createFakeContextBuilder(seedMessages);
    const service = new SessionMemoryService(
      cache as unknown as ICacheService,
      contextBuilder as ContextBuilder
    );

    // Simulate expiry by never pre-populating cache
    const ctx = await service.getOrCreate('user1', 'thread-expired');

    expect(contextBuilder.getRecentThreadMessages).toHaveBeenCalledWith('thread-expired', 10);
    expect(ctx.conversationHistory).toEqual(seedMessages);
  });

  // ── Test 5: Two simultaneous threads — complete isolation ─────────────────
  it('maintains completely independent sessions for two simultaneous threads', async () => {
    const service = new SessionMemoryService(cache as unknown as ICacheService);

    const ctxA = await service.getOrCreate('user1', 'threadA');
    const ctxB = await service.getOrCreate('user1', 'threadB');

    await service.appendMessage('user1', 'threadA', MSG_USER);
    await service.appendMessage('user1', 'threadB', MSG_ASSISTANT);

    // Reload both
    const ctxAReloaded = await service.getOrCreate('user1', 'threadA');
    const ctxBReloaded = await service.getOrCreate('user1', 'threadB');

    expect(ctxAReloaded.sessionId).toBe(ctxA.sessionId);
    expect(ctxBReloaded.sessionId).toBe(ctxB.sessionId);
    expect(ctxAReloaded.conversationHistory).toHaveLength(1);
    expect(ctxAReloaded.conversationHistory[0].role).toBe('user');
    expect(ctxBReloaded.conversationHistory).toHaveLength(1);
    expect(ctxBReloaded.conversationHistory[0].role).toBe('assistant');
    // Keys are completely separate
    expect(cache.store.has('session:thread:user1:threadA')).toBe(true);
    expect(cache.store.has('session:thread:user1:threadB')).toBe(true);
  });

  // ── Test 6: appendMessage trims to MAX_HISTORY_MESSAGES ──────────────────
  it('trims oldest messages when MAX_HISTORY_MESSAGES (20) is exceeded', async () => {
    const service = new SessionMemoryService(cache as unknown as ICacheService);
    await service.getOrCreate('user1', 'thread1');

    // Append 21 messages
    for (let i = 0; i < 21; i++) {
      await service.appendMessage('user1', 'thread1', {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        timestamp: new Date(i * 1000).toISOString(),
      });
    }

    const ctx = await service.getOrCreate('user1', 'thread1');
    expect(ctx.conversationHistory).toHaveLength(20);
    // First message (Message 0) should be trimmed; Message 1 should now be first
    expect(ctx.conversationHistory[0].content).toBe('Message 1');
    expect(ctx.conversationHistory[19].content).toBe('Message 20');
  });

  // ── Test 7: appendMessage on expired key is a safe no-op ─────────────────
  it('does not throw when appendMessage is called after session has expired', async () => {
    const service = new SessionMemoryService(cache as unknown as ICacheService);

    // Do NOT call getOrCreate — key was never set (simulates TTL expiry)
    await expect(service.appendMessage('user1', 'ghost-thread', MSG_USER)).resolves.toBeUndefined();
  });

  // ── Test 8: clear deletes the Redis key ──────────────────────────────────
  it('removes the session key from Redis on clear()', async () => {
    const service = new SessionMemoryService(cache as unknown as ICacheService);
    await service.getOrCreate('user1', 'thread1');

    expect(cache.store.has('session:thread:user1:thread1')).toBe(true);

    await service.clear('user1', 'thread1');

    expect(cache.store.has('session:thread:user1:thread1')).toBe(false);
  });

  // ── Test 9: anonymous fallback when threadId is absent ───────────────────
  it('uses anonymous key when no threadId is provided', async () => {
    const service = new SessionMemoryService(cache as unknown as ICacheService);

    const ctx = await service.getOrCreate('user1');

    expect(ctx.threadId).toBeUndefined(); // anonymous is mapped to undefined on output
    expect(cache.store.has('session:thread:user1:anonymous')).toBe(true);
  });
});
