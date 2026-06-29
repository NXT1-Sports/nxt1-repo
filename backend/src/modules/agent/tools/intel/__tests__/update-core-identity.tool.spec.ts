import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAssertCanManageAthleteProfileTarget,
  mockSyncAthleteSportProfiles,
  mockCacheDel,
  mockInvalidateProfileCaches,
} = vi.hoisted(() => ({
  mockAssertCanManageAthleteProfileTarget: vi.fn(),
  mockSyncAthleteSportProfiles: vi.fn().mockResolvedValue(undefined),
  mockCacheDel: vi.fn().mockResolvedValue(undefined),
  mockInvalidateProfileCaches: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../../services/core/cache.service.js', () => ({
  getCacheService: () => ({
    del: mockCacheDel,
  }),
}));

vi.mock('../../../../../services/profile/profile-write-access.service.js', () => ({
  createProfileWriteAccessService: () => ({
    assertCanManageAthleteProfileTarget: mockAssertCanManageAthleteProfileTarget,
  }),
}));

vi.mock('../../../../../services/profile/users.service.js', () => ({
  CACHE_KEYS: {
    USER_BY_ID: (userId: string) => `user:${userId}`,
  },
}));

vi.mock('../../../../../services/team/roster-entry.service.js', () => ({
  createRosterEntryService: () => ({
    syncAthleteSportProfiles: mockSyncAthleteSportProfiles,
  }),
}));

vi.mock('../../../../../routes/profile/shared.js', () => ({
  invalidateProfileCaches: mockInvalidateProfileCaches,
}));

vi.mock('../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { UpdateCoreIdentityTool } from '../user/update-core-identity.tool.js';

interface MockDocSnapshot {
  exists: boolean;
  data: () => Record<string, unknown>;
}

interface MockDocRef {
  update: ReturnType<typeof vi.fn>;
}

function createSnapshot(data: Record<string, unknown>): MockDocSnapshot {
  return {
    exists: true,
    data: () => data,
  };
}

function createMockFirestore(userData: Record<string, unknown>): {
  db: { collection: ReturnType<typeof vi.fn> };
  userRef: MockDocRef;
} {
  const userRef: MockDocRef = {
    update: vi.fn().mockResolvedValue(undefined),
  };

  return {
    db: {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name !== 'Users') throw new Error(`Unexpected collection ${name}`);
        return { doc: vi.fn().mockReturnValue(userRef) };
      }),
    },
    userRef,
  };
}

describe('UpdateCoreIdentityTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertCanManageAthleteProfileTarget.mockResolvedValue({
      targetUserData: createSnapshot({
        unicode: 'jace-sullivan',
        sports: [{ sport: 'Basketball Mens', positions: ['Point Guard'] }],
      }).data(),
    });
  });

  it('updates athlete email and phone via the supported identity tool', async () => {
    const { db, userRef } = createMockFirestore({
      unicode: 'jace-sullivan',
      sports: [{ sport: 'Basketball Mens', positions: ['Point Guard'] }],
    });
    const tool = new UpdateCoreIdentityTool(db as never);

    const result = await tool.execute(
      {
        userId: 'user-123',
        email: 'jace.sullivan.test@nxt1sports.com',
        phone: '(555) 328-9010',
      },
      { userId: 'admin-123' } as never
    );

    expect(result.success).toBe(true);
    expect(userRef.update).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'jace.sullivan.test@nxt1sports.com',
        phone: '(555) 328-9010',
      })
    );
    expect(mockCacheDel).toHaveBeenCalledWith('user:user-123');
    expect(mockInvalidateProfileCaches).toHaveBeenCalledWith('user-123', 'jace-sullivan');
  });

  it('rejects invalid email payloads before attempting a user write', async () => {
    const { db, userRef } = createMockFirestore({ unicode: 'jace-sullivan' });
    const tool = new UpdateCoreIdentityTool(db as never);

    const result = await tool.execute(
      {
        userId: 'user-123',
        email: 'not-an-email',
      },
      { userId: 'admin-123' } as never
    );

    expect(result.success).toBe(false);
    expect(userRef.update).not.toHaveBeenCalled();
  });
});
