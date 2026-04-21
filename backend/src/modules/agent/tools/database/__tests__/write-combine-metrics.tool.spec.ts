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

vi.mock('../../../../../services/cache.service.js', () => ({
  getCacheService: () => ({
    del: mockCacheDel,
  }),
}));

vi.mock('../../../../../services/users.service.js', () => ({
  CACHE_KEYS: {
    USER_BY_ID: (userId: string) => `user:${userId}`,
  },
}));

vi.mock('../../../../../routes/profile/shared.js', () => ({
  invalidateProfileCaches: mockInvalidateProfileCaches,
}));

vi.mock('../../../../../services/profile-write-access.service.js', () => ({
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

import { WriteCombineMetricsTool } from '../write-combine-metrics.tool.js';

describe('WriteCombineMetricsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvalidateProfileCaches.mockResolvedValue(undefined);
    mockContextInvalidate.mockResolvedValue(undefined);
    mockOnDailySyncComplete.mockResolvedValue(undefined);
    mockCacheDel.mockResolvedValue(undefined);
    mockAssertCanManageProfileTarget.mockResolvedValue({
      actorUserId: 'user-123',
      targetUserId: 'user-123',
      targetRole: 'athlete',
      targetUserData: { unicode: 'jordan-miles' },
      isSelfWrite: true,
      sharedTeamIds: [],
      sharedOrganizationIds: [],
      sharedSports: [],
    });
  });

  it('writes metrics but does not emit sync delta triggers', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const db = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'PlayerMetrics') {
          const docRef = { set, get: vi.fn().mockResolvedValue({ data: () => undefined }) };
          return { doc: vi.fn().mockReturnValue(docRef) };
        }
        throw new Error(`Unexpected collection ${name}`);
      }),
    };

    const tool = new WriteCombineMetricsTool(db as never);
    const result = await tool.execute(
      {
        userId: 'user-123',
        targetSport: 'football',
        source: 'rivals',
        metrics: [
          {
            field: 'forty_yard_dash',
            label: '40-Yard Dash',
            value: 4.55,
            unit: 'seconds',
            category: 'speed',
          },
        ],
      },
      { userId: 'user-123' }
    );

    expect(result.success).toBe(true);
    expect(set).toHaveBeenCalledTimes(1);
    expect(mockOnDailySyncComplete).not.toHaveBeenCalled();
  });
});
