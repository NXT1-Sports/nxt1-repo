import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockPromoteMedia,
  mockUpdateOrganization,
  mockEnqueueWelcomeGraphicIfReady,
  mockInvalidateTeamCache,
  mockInvalidateProfileCaches,
  mockContextInvalidate,
  mockOnDailySyncComplete,
} = vi.hoisted(() => ({
  mockPromoteMedia: vi.fn(async (urls: string[]) => urls),
  mockUpdateOrganization: vi.fn().mockResolvedValue(undefined),
  mockEnqueueWelcomeGraphicIfReady: vi.fn().mockResolvedValue({ status: 'skipped' }),
  mockInvalidateTeamCache: vi.fn().mockResolvedValue(undefined),
  mockInvalidateProfileCaches: vi.fn().mockResolvedValue(undefined),
  mockContextInvalidate: vi.fn().mockResolvedValue(undefined),
  mockOnDailySyncComplete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../../services/cache.service.js', () => ({
  getCacheService: () => ({
    del: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../../../../services/organization.service.js', () => ({
  createOrganizationService: () => ({
    updateOrganization: mockUpdateOrganization,
  }),
}));

vi.mock('../../../../../services/agent-welcome.service.js', () => ({
  enqueueWelcomeGraphicIfReady: mockEnqueueWelcomeGraphicIfReady,
}));

vi.mock('../../../../../services/team-code.service.js', () => ({
  invalidateTeamCache: mockInvalidateTeamCache,
}));

vi.mock('../../../../../services/users.service.js', () => ({
  CACHE_KEYS: {
    USER_BY_ID: (userId: string) => `user:${userId}`,
  },
}));

vi.mock('../../../../../routes/profile.routes.js', () => ({
  invalidateProfileCaches: mockInvalidateProfileCaches,
}));

vi.mock('../../../memory/context-builder.js', () => ({
  ContextBuilder: class {
    async invalidateContext(userId: string): Promise<void> {
      await mockContextInvalidate(userId);
    }
  },
}));

vi.mock('../../../sync/index.js', () => ({
  SyncDiffService: class {
    diff(): { isEmpty: boolean; summary: { totalChanges: number } } {
      return { isEmpty: true, summary: { totalChanges: 0 } };
    }
  },
}));

vi.mock('../../../triggers/trigger.listeners.js', () => ({
  onDailySyncComplete: mockOnDailySyncComplete,
}));

vi.mock('../../integrations/scraper-media.service.js', () => ({
  ScraperMediaService: {
    promoteMedia: mockPromoteMedia,
  },
}));

vi.mock('../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { WriteCoreIdentityTool } from '../write-core-identity.tool.js';

interface MockDocSnapshot {
  exists: boolean;
  data: () => Record<string, unknown>;
}

interface MockDocRef {
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

interface MockFirestore {
  collection: ReturnType<typeof vi.fn>;
}

function createSnapshot(data: Record<string, unknown>, exists = true): MockDocSnapshot {
  return {
    exists,
    data: () => data,
  };
}

function createMockFirestore(input: {
  userData: Record<string, unknown>;
  teamData?: Record<string, unknown>;
  organizationData?: Record<string, unknown>;
  teamSetError?: Error;
}): {
  db: MockFirestore;
  userRef: MockDocRef;
  teamRef: MockDocRef;
  organizationRef: MockDocRef;
} {
  const userRef: MockDocRef = {
    get: vi.fn().mockResolvedValue(createSnapshot(input.userData)),
    update: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
  };

  const teamRef: MockDocRef = {
    get: vi.fn().mockResolvedValue(createSnapshot(input.teamData ?? {})),
    update: vi.fn().mockResolvedValue(undefined),
    set: input.teamSetError
      ? vi.fn().mockRejectedValue(input.teamSetError)
      : vi.fn().mockResolvedValue(undefined),
  };

  const organizationRef: MockDocRef = {
    get: vi.fn().mockResolvedValue(createSnapshot(input.organizationData ?? {})),
    update: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
  };

  const db: MockFirestore = {
    collection: vi.fn().mockImplementation((name: string) => {
      if (name === 'Users') {
        return { doc: vi.fn().mockReturnValue(userRef) };
      }
      if (name === 'Teams') {
        return { doc: vi.fn().mockReturnValue(teamRef) };
      }
      if (name === 'Organizations') {
        return { doc: vi.fn().mockReturnValue(organizationRef) };
      }
      throw new Error(`Unexpected collection ${name}`);
    }),
  };

  return { db, userRef, teamRef, organizationRef };
}

function buildInput(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    userId: 'user_123',
    source: 'maxpreps',
    profileUrl: 'https://www.maxpreps.com/teams/test',
    targetSport: 'football',
    identity: {
      firstName: 'Jordan',
      lastName: 'Smith',
      displayName: 'Jordan Smith',
      aboutMe: 'Elite profile bio',
      classOf: 2027,
      city: 'Austin',
      state: 'TX',
      country: 'USA',
    },
    academics: {
      gpa: 3.9,
      satScore: 1280,
    },
    team: {
      name: 'Austin Tigers',
      type: 'school',
      conference: 'District 12',
      division: '6A',
      logoUrl: 'https://cdn.test/logo.png',
      primaryColor: '#111111',
      secondaryColor: '#eeeeee',
      city: 'Austin',
      state: 'TX',
      country: 'USA',
      galleryImages: ['https://cdn.test/gallery.png'],
    },
    coach: {
      firstName: 'Pat',
      lastName: 'Coach',
      title: 'Head Coach',
    },
    awards: [{ title: 'MVP' }],
    teamHistory: [{ name: 'Austin Tigers', sport: 'football' }],
    profileImgs: ['https://cdn.test/profile.png'],
    ...overrides,
  };
}

describe('WriteCoreIdentityTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPromoteMedia.mockImplementation(async (urls: string[]) => urls);
    mockUpdateOrganization.mockResolvedValue(undefined);
    mockEnqueueWelcomeGraphicIfReady.mockResolvedValue({ status: 'skipped' });
    mockInvalidateTeamCache.mockResolvedValue(undefined);
    mockInvalidateProfileCaches.mockResolvedValue(undefined);
    mockContextInvalidate.mockResolvedValue(undefined);
    mockOnDailySyncComplete.mockResolvedValue(undefined);
  });

  it('restricts coach scrapes to team and organization writes', async () => {
    const { db, userRef, teamRef } = createMockFirestore({
      userData: {
        role: 'coach',
        teamId: 'team_123',
        organizationId: 'org_123',
        sports: [{ sport: 'football', team: { teamId: 'team_123', organizationId: 'org_123' } }],
      },
      teamData: {
        organizationId: 'org_123',
        connectedSources: [
          {
            platform: 'hudl',
            profileUrl: 'https://hudl.com/team',
            scopeType: 'sport',
            scopeId: 'football',
          },
        ],
        teamCode: 'team-code',
        unicode: 'team-unicode',
      },
      organizationData: {},
    });

    const tool = new WriteCoreIdentityTool(db as never);
    const result = await tool.execute(buildInput(), { userId: 'user_123' });

    expect(result.success).toBe(true);

    // After the patch, coaches CAN update the user doc — but ONLY with sports/team data
    expect(userRef.update).toHaveBeenCalledTimes(1);
    const payload = userRef.update.mock.calls[0][0] as Record<string, unknown>;

    // Coach SHOULD have sports array with team sub-object
    expect(payload).toHaveProperty('sports');
    const sports = payload['sports'] as Array<Record<string, unknown>>;
    expect(sports[0]).toHaveProperty('team');
    expect(sports[0]).toHaveProperty('updatedAt');

    // Coach should NOT have personal/athlete-only fields
    expect(payload).not.toHaveProperty('draftAboutMe');
    expect(payload).not.toHaveProperty('classOf');
    expect(payload).not.toHaveProperty('location');
    expect(payload).not.toHaveProperty('academics');
    expect(payload).not.toHaveProperty('awards');
    expect(payload).not.toHaveProperty('teamHistory');
    expect(payload).not.toHaveProperty('profileImgs');
    expect(payload).not.toHaveProperty('connectedSources');

    // Coach's sport entry should NOT have personal sub-fields
    expect(sports[0]).not.toHaveProperty('jerseyNumber');
    expect(sports[0]).not.toHaveProperty('side');
    expect(sports[0]).not.toHaveProperty('coach');

    expect(teamRef.set).toHaveBeenCalledTimes(1);
    expect(teamRef.update).toHaveBeenCalledTimes(1);
    expect(mockUpdateOrganization).toHaveBeenCalledWith(
      'org_123',
      expect.objectContaining({
        logoUrl: 'https://cdn.test/logo.png',
        primaryColor: '#111111',
        secondaryColor: '#eeeeee',
        location: { city: 'Austin', state: 'TX', country: 'USA' },
      }),
      'agent-x-scraper'
    );
    expect(mockPromoteMedia).toHaveBeenCalledTimes(2);
    expect(mockEnqueueWelcomeGraphicIfReady).toHaveBeenCalledTimes(1);
    expect(mockOnDailySyncComplete).not.toHaveBeenCalled();
  });

  it('fills missing coach sport team refs from explicit team and organization ids', async () => {
    const { db, userRef, teamRef } = createMockFirestore({
      userData: {
        role: 'coach',
        sports: [{ sport: 'football', team: { name: 'Austin Tigers', type: 'school' } }],
      },
      teamData: {
        organizationId: 'org_123',
        connectedSources: [],
        teamCode: 'team-code',
        unicode: 'team-unicode',
      },
      organizationData: {},
    });

    const tool = new WriteCoreIdentityTool(db as never);
    const result = await tool.execute(
      buildInput({
        teamId: 'team_123',
        organizationId: 'org_123',
      }),
      { userId: 'user_123' }
    );

    expect(result.success).toBe(true);
    expect(userRef.update).toHaveBeenCalledTimes(1);

    const payload = userRef.update.mock.calls[0][0] as Record<string, unknown>;
    const sports = payload['sports'] as Array<Record<string, unknown>>;
    const team = sports[0]?.['team'] as Record<string, unknown>;

    expect(team).toMatchObject({
      teamId: 'team_123',
      organizationId: 'org_123',
      name: 'Austin Tigers',
      type: 'school',
      title: 'Head Coach',
    });
    expect(team).not.toHaveProperty('teamCode');

    expect(teamRef.set).toHaveBeenCalledTimes(1);
    expect(teamRef.update).toHaveBeenCalledTimes(1);
    expect(mockEnqueueWelcomeGraphicIfReady).toHaveBeenCalledTimes(1);
    expect(mockOnDailySyncComplete).not.toHaveBeenCalled();
  });

  it('preserves athlete user-doc enrichment writes', async () => {
    const { db, userRef } = createMockFirestore({
      userData: {
        role: 'athlete',
        sports: [{ sport: 'football', team: { teamId: 'team_123', organizationId: 'org_123' } }],
      },
      teamData: {
        organizationId: 'org_123',
        teamCode: 'team-code',
        unicode: 'team-unicode',
      },
      organizationData: {},
    });

    const tool = new WriteCoreIdentityTool(db as never);
    const result = await tool.execute(buildInput(), { userId: 'user_123' });
    const payload = userRef.update.mock.calls[0][0] as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(userRef.update).toHaveBeenCalledTimes(1);
    expect(payload).toHaveProperty('draftAboutMe');
    expect(payload).toHaveProperty('classOf', 2027);
    expect(payload).toHaveProperty('location');
    expect(payload).toHaveProperty('academics');
    expect(payload).toHaveProperty('awards');
    expect(payload).toHaveProperty('teamHistory');
    expect(payload).toHaveProperty('profileImgs');
    expect(payload).toHaveProperty('connectedSources');
    expect(payload).toHaveProperty('sports');
    expect(mockEnqueueWelcomeGraphicIfReady).toHaveBeenCalledTimes(1);
  });
});
