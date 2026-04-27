import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockInvalidateProfileCaches,
  mockContextInvalidate,
  mockOnDailySyncComplete,
  mockCacheDel,
  mockAssertCanManageProfileTarget,
} = vi.hoisted(() => ({
  mockInvalidateProfileCaches: vi.fn().mockResolvedValue(undefined),
  mockContextInvalidate: vi.fn().mockResolvedValue(undefined),
  mockOnDailySyncComplete: vi.fn().mockResolvedValue(undefined),
  mockCacheDel: vi.fn().mockResolvedValue(undefined),
  mockAssertCanManageProfileTarget: vi.fn(),
}));

vi.mock('../../../../../services/core/cache.service.js', () => ({
  getCacheService: () => ({
    del: mockCacheDel,
  }),
}));

vi.mock('../../../../../services/profile/users.service.js', () => ({
  CACHE_KEYS: {
    USER_BY_ID: (userId: string) => `user:${userId}`,
  },
}));

vi.mock('../../../../../routes/profile/shared.js', () => ({
  invalidateProfileCaches: mockInvalidateProfileCaches,
}));

vi.mock('../../../../../services/profile/profile-write-access.service.js', () => ({
  createProfileWriteAccessService: () => ({
    assertCanManageAthleteProfileTarget: mockAssertCanManageProfileTarget,
  }),
}));

vi.mock('../../../memory/context-builder.js', () => ({
  ContextBuilder: class {
    async invalidateContext(userId: string): Promise<void> {
      await mockContextInvalidate(userId);
    }
  },
}));

vi.mock('../../../triggers/trigger.listeners.js', () => ({
  onDailySyncComplete: mockOnDailySyncComplete,
}));

vi.mock('../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { WriteRankingsTool } from '../user/write-rankings.tool.js';

interface MockDocSnapshot {
  exists: boolean;
  data: () => Record<string, unknown>;
}

function createSnapshot(data: Record<string, unknown>, exists = true): MockDocSnapshot {
  return {
    exists,
    data: () => data,
  };
}

function createMockFirestore(userData: Record<string, unknown>) {
  const userRef = {
    get: vi.fn().mockResolvedValue(createSnapshot(userData)),
  };

  const rankingSet = vi.fn().mockResolvedValue(undefined);

  const db = {
    collection: vi.fn().mockImplementation((name: string) => {
      if (name === 'Users') {
        return { doc: vi.fn().mockReturnValue(userRef) };
      }
      if (name === 'Rankings') {
        const docRef = {
          set: rankingSet,
          get: vi.fn().mockResolvedValue({ data: () => undefined }),
        };
        return { doc: vi.fn().mockReturnValue(docRef) };
      }
      throw new Error(`Unexpected collection ${name}`);
    }),
  };

  return { db, userRef, rankingSet };
}

describe('WriteRankingsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvalidateProfileCaches.mockResolvedValue(undefined);
    mockContextInvalidate.mockResolvedValue(undefined);
    mockOnDailySyncComplete.mockResolvedValue(undefined);
    mockCacheDel.mockResolvedValue(undefined);
    mockAssertCanManageProfileTarget.mockImplementation(async () => ({
      actorUserId: 'user-123',
      targetUserId: 'user-123',
      targetRole: 'athlete',
      targetUserData: { unicode: 'jordan-miles' },
      isSelfWrite: true,
      sharedTeamIds: [],
      sharedOrganizationIds: [],
      sharedSports: [],
    }));
  });

  it('writes deterministic ranking snapshots and invalidates profile caches', async () => {
    const { db, rankingSet } = createMockFirestore({ unicode: 'jordan-miles' });
    const tool = new WriteRankingsTool(db as never);

    const result = await tool.execute(
      {
        userId: 'user-123',
        targetSport: 'football',
        source: '247sports',
        sourceUrl: 'https://247sports.com/player/jordan-miles',
        rankings: [
          {
            name: '247Sports',
            nationalRank: 31,
            stateRank: 3,
            positionRank: 2,
            stars: 4,
            classOf: 2027,
            rankedAt: '2026-04-10T12:00:00.000Z',
          },
        ],
      },
      { userId: 'user-123' }
    );

    expect(result.success).toBe(true);
    expect(rankingSet).toHaveBeenCalledTimes(1);
    expect(mockAssertCanManageProfileTarget).toHaveBeenCalledWith({
      actorUserId: 'user-123',
      targetUserId: 'user-123',
      action: 'tool:write_rankings',
    });

    const [record, options] = rankingSet.mock.calls[0] as [
      Record<string, unknown>,
      { merge: boolean },
    ];
    expect(options).toEqual({ merge: true });
    expect(record['name']).toBe('247Sports');
    expect(record['nationalRank']).toBe(31);
    expect(record['sportId']).toBe('football');
    expect(record['createdAt']).toBe('2026-04-10T12:00:00.000Z');
    expect(record['rankedAt']).toBe('2026-04-10T12:00:00.000Z');

    expect(mockInvalidateProfileCaches).toHaveBeenCalledWith('user-123', 'jordan-miles');
    expect(mockContextInvalidate).toHaveBeenCalledWith('user-123');
    expect(mockOnDailySyncComplete).not.toHaveBeenCalled();
  });

  it('skips entries without ranking signals', async () => {
    const { db, rankingSet } = createMockFirestore({ unicode: null });
    const tool = new WriteRankingsTool(db as never);

    const result = await tool.execute(
      {
        userId: 'user-123',
        targetSport: 'football',
        source: 'on3',
        rankings: [{ name: 'On3' }],
      },
      { userId: 'user-123' }
    );

    expect(result.success).toBe(true);
    expect(rankingSet).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ written: 0, skipped: 1 });
  });

  it('rejects writes when delegated access is denied', async () => {
    const { db, rankingSet } = createMockFirestore({ unicode: 'jordan-miles' });
    const tool = new WriteRankingsTool(db as never);
    mockAssertCanManageProfileTarget.mockRejectedValue(new Error('Forbidden'));

    const result = await tool.execute(
      {
        userId: 'athlete-123',
        targetSport: 'football',
        source: '247sports',
        rankings: [{ name: '247Sports', nationalRank: 8 }],
      },
      { userId: 'coach-456' }
    );

    expect(result).toEqual({ success: false, error: 'Forbidden' });
    expect(rankingSet).not.toHaveBeenCalled();
  });
});
