/**
 * @fileoverview Unit Tests — ScanTimelinePostsTool
 * @module @nxt1/backend/modules/agent/tools/comms
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (must precede tool import) ─────────────────────────────────────────

vi.mock('../../../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Import AgentMemoryModel for spying (same pattern as sync-memory-extractor.spec.ts)
const { AgentMemoryModel } = await import('../../../memory/vector.service.js');
import { ScanTimelinePostsTool } from '../scan-timeline-posts.tool.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTimestamp(iso: string) {
  return { toDate: () => new Date(iso) };
}

function makePostDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: `post_${Math.random().toString(36).slice(2, 8)}`,
    data: () => ({
      userId: 'user_123',
      type: 'stats',
      content: 'Just broke the school record with 3,200 passing yards! #football',
      hashtags: ['football'],
      createdAt: makeTimestamp('2026-04-01T10:00:00Z'),
      ...overrides,
    }),
  };
}

function createMockDb(opts?: { userDocs?: ReturnType<typeof makePostDoc>[] }) {
  const userDocs = opts?.userDocs ?? [makePostDoc()];

  const userQuery = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue({ docs: userDocs }),
    }),
  };

  const collection = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue(userQuery),
  });

  return { collection } as unknown as import('firebase-admin/firestore').Firestore;
}

function createMockLlm(response: string | null = '[]') {
  return {
    complete: vi.fn().mockResolvedValue({
      content: response,
      usage: { inputTokens: 100, outputTokens: 50 },
      costUsd: 0.0001,
    }),
  };
}

function createMockVectorMemory() {
  return {
    store: vi.fn().mockResolvedValue({ id: 'mem_abc123' }),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ScanTimelinePostsTool', () => {
  let tool: ScanTimelinePostsTool;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockLlm: ReturnType<typeof createMockLlm>;
  let mockVectorMemory: ReturnType<typeof createMockVectorMemory>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    mockLlm = createMockLlm();
    mockVectorMemory = createMockVectorMemory();
    // Spy on AgentMemoryModel.findOne so dedup check returns "no duplicate"
    vi.spyOn(AgentMemoryModel, 'findOne').mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never);
    tool = new ScanTimelinePostsTool(mockDb, mockLlm as never, mockVectorMemory as never);
  });

  // ── Metadata ──────────────────────────────────────────────────────────────

  describe('metadata', () => {
    it('should expose expected tool metadata', () => {
      expect(tool.name).toBe('scan_timeline_posts');
      expect(tool.isMutation).toBe(true);
      expect(tool.category).toBe('communication');
      expect(tool.allowedAgents).toContain('data_coordinator');
      expect(tool.allowedAgents).toContain('general');
      expect(tool.allowedAgents).toContain('recruiting_coordinator');
      expect(tool.allowedAgents).toContain('performance_coordinator');
    });
  });

  // ── Input Validation ───────────────────────────────────────────────────────

  describe('input validation', () => {
    it('should return error when userId is missing', async () => {
      const result = await tool.execute({ userId: '' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('userId');
    });

    it('should require teamId when scope is "team"', async () => {
      const result = await tool.execute({ userId: 'user_123', scope: 'team' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('teamId');
    });

    it('should require teamId when scope is "both"', async () => {
      const result = await tool.execute({ userId: 'user_123', scope: 'both' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('teamId');
    });

    it('should accept valid scope "user" without teamId', async () => {
      const result = await tool.execute({ userId: 'user_123', scope: 'user' });
      expect(result.success).toBe(true);
    });
  });

  // ── Empty timeline ──────────────────────────────────────────────────────────

  describe('empty timeline', () => {
    it('should return success with zero counts when no posts exist', async () => {
      mockDb = createMockDb({ userDocs: [] });
      tool = new ScanTimelinePostsTool(mockDb, mockLlm as never, mockVectorMemory as never);

      const result = await tool.execute({ userId: 'user_123' });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>)['postsScanned']).toBe(0);
      expect((result.data as Record<string, unknown>)['memoriesStored']).toBe(0);
      expect(mockLlm.complete).not.toHaveBeenCalled();
    });
  });

  // ── LLM extraction ─────────────────────────────────────────────────────────

  describe('LLM extraction', () => {
    it('should call LLM with extraction tier when posts are found', async () => {
      await tool.execute({ userId: 'user_123' });
      expect(mockLlm.complete).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user' }),
        ]),
        expect.objectContaining({ tier: 'extraction', temperature: 0, jsonMode: true })
      );
    });

    it('should store extracted facts as vector memories', async () => {
      const facts = [
        {
          content: 'User broke the school record with 3,200 passing yards.',
          category: 'performance_data',
          target: 'user',
        },
        {
          content: 'User received an offer from Ohio State.',
          category: 'recruiting_context',
          target: 'user',
        },
      ];
      mockLlm.complete = vi.fn().mockResolvedValue({ content: JSON.stringify(facts) });
      tool = new ScanTimelinePostsTool(mockDb, mockLlm as never, mockVectorMemory as never);

      const result = await tool.execute({ userId: 'user_123' });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>)['memoriesStored']).toBe(2);
      expect(mockVectorMemory.store).toHaveBeenCalledTimes(2);
    });

    it('should skip facts with invalid categories', async () => {
      const facts = [
        { content: 'Valid fact.', category: 'performance_data', target: 'user' },
        { content: 'Invalid category fact.', category: 'nonsense_category', target: 'user' },
      ];
      mockLlm.complete = vi.fn().mockResolvedValue({ content: JSON.stringify(facts) });
      tool = new ScanTimelinePostsTool(mockDb, mockLlm as never, mockVectorMemory as never);

      const result = await tool.execute({ userId: 'user_123' });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>)['memoriesStored']).toBe(1);
    });

    it('should skip duplicate facts already in memory', async () => {
      const facts = [{ content: 'Duplicate fact.', category: 'performance_data', target: 'user' }];
      mockLlm.complete = vi.fn().mockResolvedValue({ content: JSON.stringify(facts) });
      // Override spy to simulate existing memory found
      vi.spyOn(AgentMemoryModel, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: 'existing' }),
      } as never);
      tool = new ScanTimelinePostsTool(mockDb, mockLlm as never, mockVectorMemory as never);

      const result = await tool.execute({ userId: 'user_123' });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>)['memoriesStored']).toBe(0);
      expect(mockVectorMemory.store).not.toHaveBeenCalled();
    });

    it('should handle unparseable LLM response gracefully', async () => {
      mockLlm.complete = vi.fn().mockResolvedValue({ content: 'not valid json {{{' });
      tool = new ScanTimelinePostsTool(mockDb, mockLlm as never, mockVectorMemory as never);

      const result = await tool.execute({ userId: 'user_123' });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>)['memoriesStored']).toBe(0);
    });

    it('should handle null LLM response gracefully', async () => {
      mockLlm.complete = vi.fn().mockResolvedValue({ content: null });
      tool = new ScanTimelinePostsTool(mockDb, mockLlm as never, mockVectorMemory as never);

      const result = await tool.execute({ userId: 'user_123' });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>)['memoriesStored']).toBe(0);
    });
  });

  // ── Limit handling ─────────────────────────────────────────────────────────

  describe('limit handling', () => {
    it('should default to 20 when no limit provided', async () => {
      await tool.execute({ userId: 'user_123' });
      const queryChain = (mockDb.collection as ReturnType<typeof vi.fn>).mock.results[0]?.value as {
        where: ReturnType<typeof vi.fn>;
      };
      const whereChain = queryChain?.where?.mock?.results?.[0]?.value as {
        orderBy: ReturnType<typeof vi.fn>;
      };
      const orderByChain = whereChain?.orderBy?.mock?.results?.[0]?.value as {
        limit: ReturnType<typeof vi.fn>;
      };
      expect(orderByChain?.limit).toHaveBeenCalledWith(20);
    });

    it('should clamp limit to MAX_POSTS (50)', async () => {
      await tool.execute({ userId: 'user_123', limit: 999 });
      const queryChain = (mockDb.collection as ReturnType<typeof vi.fn>).mock.results[0]?.value as {
        where: ReturnType<typeof vi.fn>;
      };
      const whereChain = queryChain?.where?.mock?.results?.[0]?.value as {
        orderBy: ReturnType<typeof vi.fn>;
      };
      const orderByChain = whereChain?.orderBy?.mock?.results?.[0]?.value as {
        limit: ReturnType<typeof vi.fn>;
      };
      expect(orderByChain?.limit).toHaveBeenCalledWith(50);
    });
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should return failure when Firestore throws', async () => {
      const badDb = {
        collection: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockRejectedValue(new Error('Firestore unavailable')),
              }),
            }),
          }),
        }),
      } as unknown as import('firebase-admin/firestore').Firestore;

      tool = new ScanTimelinePostsTool(badDb, mockLlm as never, mockVectorMemory as never);
      const result = await tool.execute({ userId: 'user_123' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Firestore unavailable');
    });

    it('should continue and return partial results when one memory store fails', async () => {
      const facts = [
        { content: 'Fact one.', category: 'performance_data', target: 'user' },
        { content: 'Fact two.', category: 'goal', target: 'user' },
      ];
      mockLlm.complete = vi.fn().mockResolvedValue({ content: JSON.stringify(facts) });
      mockVectorMemory.store = vi
        .fn()
        .mockResolvedValueOnce({ id: 'mem_1' })
        .mockRejectedValueOnce(new Error('Store failed'));
      tool = new ScanTimelinePostsTool(mockDb, mockLlm as never, mockVectorMemory as never);

      const result = await tool.execute({ userId: 'user_123' });
      expect(result.success).toBe(true);
      // Only the first fact succeeded
      expect((result.data as Record<string, unknown>)['memoriesStored']).toBe(1);
    });
  });
});
