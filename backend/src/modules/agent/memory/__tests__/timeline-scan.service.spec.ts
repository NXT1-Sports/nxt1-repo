/**
 * @fileoverview Unit Tests — TimelineScanService
 * @module @nxt1/backend/modules/agent/memory
 *
 * Tests the shared timeline scanning service that extracts durable facts
 * from Firestore timeline posts and stores them as vector memories.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (must precede service import) ─────────────────────────────────────

vi.mock('../../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../../models/agent/agent-thread.model.js', () => ({
  AgentThreadModel: {
    find: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    }),
  },
}));

const { AgentMemoryModel } = await import('../vector.service.js');
const { AgentThreadModel } = await import('../../../../models/agent/agent-thread.model.js');
import { TimelineScanService } from '../timeline-scan.service.js';

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

function createMockDb(opts?: {
  userDocs?: ReturnType<typeof makePostDoc>[];
  recentDocs?: ReturnType<typeof makePostDoc>[];
}) {
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

describe('TimelineScanService', () => {
  let service: TimelineScanService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockLlm: ReturnType<typeof createMockLlm>;
  let mockVectorMemory: ReturnType<typeof createMockVectorMemory>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    mockLlm = createMockLlm();
    mockVectorMemory = createMockVectorMemory();
    vi.spyOn(AgentMemoryModel, 'findOne').mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never);
    service = new TimelineScanService(mockDb, mockLlm as never, mockVectorMemory as never);
  });

  // ── scanForUser ───────────────────────────────────────────────────────────

  describe('scanForUser', () => {
    it('should return zero counts when no posts exist', async () => {
      mockDb = createMockDb({ userDocs: [] });
      service = new TimelineScanService(mockDb, mockLlm as never, mockVectorMemory as never);

      const result = await service.scanForUser('user_123');
      expect(result.postsScanned).toBe(0);
      expect(result.memoriesStored).toBe(0);
      expect(mockLlm.complete).not.toHaveBeenCalled();
    });

    it('should call LLM with extraction tier', async () => {
      await service.scanForUser('user_123');
      expect(mockLlm.complete).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user' }),
        ]),
        expect.objectContaining({
          tier: 'extraction',
          temperature: 0,
          outputSchema: expect.objectContaining({ name: 'timeline_scan_facts' }),
        })
      );
    });

    it('should store extracted facts as vector memories', async () => {
      const facts = [
        { content: 'User broke the school record.', category: 'performance_data', target: 'user' },
        { content: 'User received an offer.', category: 'recruiting_context', target: 'user' },
      ];
      mockLlm.complete = vi.fn().mockResolvedValue({ content: JSON.stringify(facts) });
      service = new TimelineScanService(mockDb, mockLlm as never, mockVectorMemory as never);

      const result = await service.scanForUser('user_123');
      expect(result.memoriesStored).toBe(2);
      expect(mockVectorMemory.store).toHaveBeenCalledTimes(2);
    });

    it('should pass teamId when storing team-scoped memory', async () => {
      const facts = [
        { content: 'Team won championship.', category: 'performance_data', target: 'team' },
      ];
      mockLlm.complete = vi.fn().mockResolvedValue({ content: JSON.stringify(facts) });
      service = new TimelineScanService(mockDb, mockLlm as never, mockVectorMemory as never);

      await service.scanForUser('user_123', 'team_xyz', 'both');
      expect(mockVectorMemory.store).toHaveBeenCalledWith(
        'user_123',
        facts[0].content,
        'performance_data',
        { source: 'timeline_scan' },
        { target: 'team', teamId: 'team_xyz' }
      );
    });

    it('should fall back to "user" target when team-scoped but no teamId', async () => {
      const facts = [{ content: 'Team fact.', category: 'goal', target: 'team' }];
      mockLlm.complete = vi.fn().mockResolvedValue({ content: JSON.stringify(facts) });
      service = new TimelineScanService(mockDb, mockLlm as never, mockVectorMemory as never);

      await service.scanForUser('user_123');
      expect(mockVectorMemory.store).toHaveBeenCalledWith(
        'user_123',
        facts[0].content,
        'goal',
        { source: 'timeline_scan' },
        { target: 'user' }
      );
    });

    it('should fall back to "user" target when organization-scoped', async () => {
      const facts = [
        { content: 'Org fact.', category: 'recruiting_context', target: 'organization' },
      ];
      mockLlm.complete = vi.fn().mockResolvedValue({ content: JSON.stringify(facts) });
      service = new TimelineScanService(mockDb, mockLlm as never, mockVectorMemory as never);

      await service.scanForUser('user_123');
      expect(mockVectorMemory.store).toHaveBeenCalledWith(
        'user_123',
        facts[0].content,
        'recruiting_context',
        { source: 'timeline_scan' },
        { target: 'user' }
      );
    });

    it('should skip facts with invalid categories', async () => {
      const facts = [
        { content: 'Valid fact.', category: 'performance_data', target: 'user' },
        { content: 'Invalid.', category: 'nonsense_category', target: 'user' },
      ];
      mockLlm.complete = vi.fn().mockResolvedValue({ content: JSON.stringify(facts) });
      service = new TimelineScanService(mockDb, mockLlm as never, mockVectorMemory as never);

      const result = await service.scanForUser('user_123');
      expect(result.memoriesStored).toBe(1);
    });

    it('should skip duplicate facts already in memory', async () => {
      const facts = [{ content: 'Duplicate.', category: 'performance_data', target: 'user' }];
      mockLlm.complete = vi.fn().mockResolvedValue({ content: JSON.stringify(facts) });
      vi.spyOn(AgentMemoryModel, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: 'existing' }),
      } as never);
      service = new TimelineScanService(mockDb, mockLlm as never, mockVectorMemory as never);

      const result = await service.scanForUser('user_123');
      expect(result.memoriesStored).toBe(0);
      expect(mockVectorMemory.store).not.toHaveBeenCalled();
    });

    it('should handle unparseable LLM response gracefully', async () => {
      mockLlm.complete = vi.fn().mockResolvedValue({ content: 'not valid json {{{' });
      service = new TimelineScanService(mockDb, mockLlm as never, mockVectorMemory as never);

      const result = await service.scanForUser('user_123');
      expect(result.memoriesStored).toBe(0);
      expect(result.factsExtracted).toBe(0);
    });

    it('should handle null LLM response gracefully', async () => {
      mockLlm.complete = vi.fn().mockResolvedValue({ content: null });
      service = new TimelineScanService(mockDb, mockLlm as never, mockVectorMemory as never);

      const result = await service.scanForUser('user_123');
      expect(result.memoriesStored).toBe(0);
    });

    it('should clamp limit to 50', async () => {
      await service.scanForUser('user_123', undefined, 'user', 999);
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

    it('should continue when one memory store fails', async () => {
      const facts = [
        { content: 'Fact one.', category: 'performance_data', target: 'user' },
        { content: 'Fact two.', category: 'goal', target: 'user' },
      ];
      mockLlm.complete = vi.fn().mockResolvedValue({ content: JSON.stringify(facts) });
      mockVectorMemory.store = vi
        .fn()
        .mockResolvedValueOnce({ id: 'mem_1' })
        .mockRejectedValueOnce(new Error('Store failed'));
      service = new TimelineScanService(mockDb, mockLlm as never, mockVectorMemory as never);

      const result = await service.scanForUser('user_123');
      expect(result.memoriesStored).toBe(1);
    });
  });

  // ── scanActiveUsers ────────────────────────────────────────────────────────

  describe('scanActiveUsers', () => {
    it('should return zero when no agent-active users exist', async () => {
      const result = await service.scanActiveUsers();
      expect(result.usersScanned).toBe(0);
      expect(result.totalMemoriesStored).toBe(0);
    });

    it('should skip when agent-active users have no recent posts', async () => {
      // Mock active threads
      (AgentThreadModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([{ userId: 'user_123' }]),
      });

      // Mock empty recent posts query
      const emptyCollection = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ docs: [] }),
        }),
      });
      mockDb = {
        collection: emptyCollection,
      } as unknown as import('firebase-admin/firestore').Firestore;
      service = new TimelineScanService(mockDb, mockLlm as never, mockVectorMemory as never);

      const result = await service.scanActiveUsers();
      expect(result.usersScanned).toBe(0);
    });

    it('should count errors without aborting the batch', async () => {
      // Mock active threads
      (AgentThreadModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([{ userId: 'user_fail' }]),
      });

      // Mock recent posts from the failing user
      const recentDoc = {
        id: 'post_recent',
        data: () => ({
          userId: 'user_fail',
          content: 'Recent post',
          createdAt: makeTimestamp(new Date().toISOString()),
        }),
      };
      const collection = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ docs: [recentDoc] }),
        }),
      });
      mockDb = { collection } as unknown as import('firebase-admin/firestore').Firestore;

      // Make LLM throw for the scanning step
      mockLlm.complete = vi.fn().mockRejectedValue(new Error('LLM down'));
      service = new TimelineScanService(mockDb, mockLlm as never, mockVectorMemory as never);

      const result = await service.scanActiveUsers();
      expect(result.errors).toBe(1);
      expect(result.usersScanned).toBe(1);
    });
  });
});
