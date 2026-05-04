/**
 * @fileoverview Unit Tests — ContextBuilder
 * @module @nxt1/backend/modules/agent/memory
 *
 * Tests the context-building pipeline including:
 * - Redis cache hit/miss behavior (Layer 1)
 * - getUserById integration (Layer 2 cache)
 * - Firestore user doc → AgentUserContext mapping
 * - compressToPrompt output
 * - Cache invalidation
 * - Error resilience (cache failures don't break the pipeline)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Dependencies ─────────────────────────────────────────────────────

const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
const mockCacheDel = vi.fn();

const mockCache = {
  get: mockCacheGet,
  set: mockCacheSet,
  del: mockCacheDel,
  clear: vi.fn(),
  exists: vi.fn(),
  mget: vi.fn(),
  mset: vi.fn(),
};

vi.mock('../../../../services/core/cache.service.js', () => ({
  getCacheService: () => mockCache,
  CACHE_TTL: { PROFILES: 900 },
}));

const mockGetUserById = vi.fn();
vi.mock('../../../../services/profile/users.service.js', () => ({
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
}));

const mockGetUserTeams = vi.fn();
vi.mock('../../../../adapters/team.adapter.js', () => ({
  TeamServiceAdapter: class {
    getUserTeams = mockGetUserTeams;
  },
}));

const mockFirestoreDocGet = vi.fn();
const mockFirestoreCollection = vi.fn((collectionName: string) => {
  if (collectionName === 'Teams') {
    return {
      doc: vi.fn((docId: string) => ({
        get: () => mockFirestoreDocGet(docId),
      })),
    };
  }

  return { doc: vi.fn(() => ({ get: vi.fn() })) };
});

const mockListRecentSummaries = vi.fn().mockResolvedValue([]);
vi.mock('../../../../services/core/sync-delta-event.service.js', () => ({
  getSyncDeltaEventService: () => ({
    listRecentSummaries: (...args: unknown[]) => mockListRecentSummaries(...args),
  }),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({ collection: mockFirestoreCollection })),
}));

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
vi.mock('../../../../utils/logger.js', () => ({
  logger: mockLogger,
}));

// ─── Import Under Test (after mocks) ───────────────────────────────────────

const { ContextBuilder } = await import('../context-builder.js');

// ─── Test Data ──────────────────────────────────────────────────────────────

function createFullUserDoc() {
  return {
    id: 'user-123',
    role: 'athlete',
    firstName: 'John',
    lastName: 'Doe',
    displayName: 'John Doe',
    unicode: '469697',
    primarySport: 'football',
    activeSportIndex: 0,
    sports: [
      {
        sport: 'football',
        positions: ['QB', 'WR'],
        metrics: {
          height: '6\'2"',
          weight: '195',
          gpa: '3.8',
        },
        team: {
          name: 'Lincoln HS',
          slug: 'crown-point-basketball-mens',
          teamId: 'mC3D9qg5d9amvcO0otvi',
        },
      },
    ],
    teamCode: {
      teamCode: '2P49TB',
      teamId: 'mC3D9qg5d9amvcO0otvi',
      slug: 'crown-point-basketball-mens',
      teamName: 'Crown Point Basketball Mens',
      sport: 'Basketball',
    },
    height: '6\'2"',
    weight: '195',
    highSchool: 'Lincoln High School',
    classOf: 2027,
    location: { city: 'Dallas', state: 'TX', country: 'US' },
    aboutMe: 'Junior QB, All-District',
    onboardingCompleted: true,
    _counters: { profileViews: 1250 },
    lastLoginAt: '2026-03-01T12:00:00Z',
    athlete: {
      classOf: 2027,
      highSchool: 'Lincoln High School',
      targetDivisions: ['D1', 'D2'],
      targetColleges: ['Georgia', 'Texas', 'Ohio State'],
      recruitingStatus: 'active',
    },
    social: [
      { platform: 'twitter', connected: true, lastSyncedAt: '2026-01-15T00:00:00Z' },
      { platform: 'instagram', connected: true },
    ],
    connectedSources: [
      { platform: 'maxpreps', syncStatus: 'success', lastSyncedAt: '2026-02-20T00:00:00Z' },
    ],
    connectedEmails: [
      { email: 'john@gmail.com', isValid: true, lastSyncedAt: '2026-03-01T00:00:00Z' },
    ],
  };
}

function createCoachUserDoc() {
  return {
    id: 'coach-456',
    role: 'coach',
    firstName: 'Mike',
    lastName: 'Smith',
    sports: [{ sport: 'basketball', positions: ['PG'] }],
    coach: {
      organization: 'State University',
      division: 'D1',
      coachingSports: ['basketball', 'track'],
    },
    onboardingCompleted: true,
    _counters: { profileViews: 500 },
    lastLoginAt: '2026-02-15T00:00:00Z',
  };
}

function createDirectorUserDoc() {
  return {
    id: 'director-123',
    role: 'director',
    firstName: 'Avery',
    lastName: 'Johnson',
    teamId: 'team-director-1',
    organizationId: 'org-director-1',
    director: {
      title: 'Athletic Director',
      organization: 'Central Academy',
      overseeSports: ['football', 'basketball', 'track'],
    },
    onboardingCompleted: true,
  };
}

function createDirectorWithOnlyTeamIdUserDoc() {
  return {
    id: 'director-crown-point',
    role: 'director',
    firstName: 'John',
    lastName: 'Doe',
    activeSportIndex: 0,
    sports: [
      {
        sport: 'Basketball Mens',
        team: {
          name: 'Crown Point',
          teamId: 'mC3D9qg5d9amvcO0otvi',
        },
      },
      {
        sport: 'Football',
        team: {
          name: 'Crown Point',
          teamId: '0ORPTNTxADr8wMmQkDrr',
        },
      },
      {
        sport: 'Soccer Mens',
        team: {
          name: 'Crown Point',
          teamId: 'Okthw6G7NuSOaA5505Vb',
        },
      },
    ],
  };
}

function createBasketballUserDoc() {
  return {
    id: 'user-bball',
    role: 'athlete',
    firstName: 'Jordan',
    lastName: 'Miles',
    primarySport: 'basketball',
    activeSportIndex: 0,
    sports: [
      {
        sport: 'basketball',
        positions: ['PG'],
        team: { name: 'Central High' },
      },
    ],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ContextBuilder', () => {
  let builder: InstanceType<typeof ContextBuilder>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserTeams.mockResolvedValue([]);
    mockListRecentSummaries.mockResolvedValue([]);
    mockFirestoreDocGet.mockResolvedValue({
      exists: false,
      id: '',
      data: () => undefined,
    });
    builder = new ContextBuilder();
  });

  // ── buildContext — Cache Behavior ──────────────────────────────────────

  describe('buildContext — cache behavior', () => {
    it('should return cached context on Redis HIT (zero DB reads)', async () => {
      const cachedContext = {
        userId: 'user-123',
        role: 'athlete',
        displayName: 'Cached User',
      };
      mockCacheGet.mockResolvedValueOnce(cachedContext);

      const result = await builder.buildContext('user-123');

      expect(result).toEqual(cachedContext);
      expect(mockCacheGet).toHaveBeenCalledWith('agent:context:user-123');
      // getUserById should NEVER be called on a cache hit
      expect(mockGetUserById).not.toHaveBeenCalled();
      // Should NOT write back to cache (already cached)
      expect(mockCacheSet).not.toHaveBeenCalled();
    });

    it('should fetch from getUserById on cache MISS and cache the result', async () => {
      mockCacheGet.mockResolvedValueOnce(null); // cache miss
      mockGetUserById.mockResolvedValueOnce(createFullUserDoc());

      const result = await builder.buildContext('user-123');

      expect(result.userId).toBe('user-123');
      expect(result.displayName).toBe('John Doe');
      expect(result.role).toBe('athlete');

      // Should cache the assembled context
      expect(mockCacheSet).toHaveBeenCalledWith(
        'agent:context:user-123',
        expect.objectContaining({ userId: 'user-123' }),
        { ttl: 900 }
      );
    });

    it('should still work if cache read throws (resilience)', async () => {
      mockCacheGet.mockRejectedValueOnce(new Error('Redis down'));
      mockGetUserById.mockResolvedValueOnce(createFullUserDoc());

      const result = await builder.buildContext('user-123');

      expect(result.userId).toBe('user-123');
      expect(result.displayName).toBe('John Doe');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cache read failed'),
        expect.any(Object)
      );
    });

    it('should still return context if cache write throws (resilience)', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce(createFullUserDoc());
      mockCacheSet.mockRejectedValueOnce(new Error('Redis write failed'));

      const result = await builder.buildContext('user-123');

      expect(result.userId).toBe('user-123');
      expect(result.displayName).toBe('John Doe');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to cache context'),
        expect.any(Object)
      );
    });

    it('should return minimal context when user not found', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce(null);

      const result = await builder.buildContext('nonexistent');

      expect(result).toEqual({
        userId: 'nonexistent',
        role: 'athlete',
        displayName: 'Unknown User',
      });
      // Should NOT cache a "not found" result
      expect(mockCacheSet).not.toHaveBeenCalled();
    });
  });

  // ── buildContext — Field Mapping ──────────────────────────────────────

  describe('buildContext — field mapping', () => {
    it('should map a full athlete profile correctly', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce(createFullUserDoc());

      const ctx = await builder.buildContext('user-123');

      expect(ctx.sport).toBe('football');
      expect(ctx.position).toBe('QB');
      expect(ctx.heightInches).toBe(74); // 6'2" = 74 inches
      expect(ctx.weightLbs).toBe(195);
      expect(ctx.graduationYear).toBe(2027);
      expect(ctx.gpa).toBe(3.8);
      expect(ctx.school).toBe('Lincoln HS');
      expect(ctx.city).toBe('Dallas');
      expect(ctx.state).toBe('TX');
    });

    it('should map recruiting data for athletes', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce(createFullUserDoc());

      const ctx = await builder.buildContext('user-123');

      expect(ctx.recruitingStatus).toBe('active');
    });

    it('should map connected accounts from social, sources, and emails', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce(createFullUserDoc());

      const ctx = await builder.buildContext('user-123');

      expect(ctx.connectedAccounts).toHaveLength(4);

      const twitter = ctx.connectedAccounts?.find((a) => a.provider === 'twitter');
      expect(twitter).toBeDefined();
      expect(twitter?.isTokenValid).toBe(true);

      const maxpreps = ctx.connectedAccounts?.find((a) => a.provider === 'maxpreps');
      expect(maxpreps).toBeDefined();
      expect(maxpreps?.isTokenValid).toBe(true);

      const gmail = ctx.connectedAccounts?.find((a) => a.provider === 'gmail');
      expect(gmail).toBeDefined();
      expect(gmail?.email).toBe('john@gmail.com');
    });

    it('should map the last active timestamp', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce(createFullUserDoc());

      const ctx = await builder.buildContext('user-123');

      expect(ctx.lastActiveAt).toBe('2026-03-01T12:00:00Z');
    });

    it('should map coach-specific fields', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce(createCoachUserDoc());

      const ctx = await builder.buildContext('coach-456');

      expect(ctx.role).toBe('coach');
      expect(ctx.coachProgram).toBe('State University');
      expect(ctx.coachDivision).toBe('D1');
      expect(ctx.coachSport).toBe('basketball');
      // Coaches should NOT have recruiting data
      expect(ctx.targetDivisions).toBeUndefined();
      expect(ctx.targetColleges).toBeUndefined();
    });

    it('should resolve director team and organization scope without relying on sports or active sport index', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce(createDirectorUserDoc());
      mockGetUserTeams.mockResolvedValueOnce([]);

      const ctx = await builder.buildContext('director-123');

      expect(ctx.role).toBe('director');
      expect(ctx.sport).toBe('football, basketball, track');
      expect(ctx.teamId).toBe('team-director-1');
      expect(ctx.organizationId).toBe('org-director-1');
    });

    it('should hydrate the canonical team route from the team document when user data only has teamId', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce(createDirectorWithOnlyTeamIdUserDoc());
      mockFirestoreDocGet.mockImplementation(async (teamDocId: string) => {
        const teams: Record<string, Record<string, unknown>> = {
          mC3D9qg5d9amvcO0otvi: {
            teamName: 'Crown Point Basketball Mens',
            slug: 'crown-point-basketball-mens',
            teamCode: '2P49TB',
            sport: 'Basketball Mens',
          },
          '0ORPTNTxADr8wMmQkDrr': {
            teamName: 'Crown Point Football',
            slug: 'crown-point-football',
            teamCode: 'HP71NI',
            sport: 'Football',
          },
          Okthw6G7NuSOaA5505Vb: {
            teamName: 'Crown Point Soccer Mens',
            slug: 'crown-point-soccer-mens',
            teamCode: 'LDOMFX',
            sport: 'Soccer Mens',
          },
        };

        const team = teams[teamDocId];
        return {
          exists: Boolean(team),
          id: teamDocId,
          data: () => team,
        };
      });

      const ctx = await builder.buildContext('director-crown-point');

      expect(ctx.teamId).toBe('mC3D9qg5d9amvcO0otvi');
      expect(ctx.teamPath).toBe('/team/crown-point-basketball-mens/2P49TB');
      expect(
        ctx.teamPaths?.some((entry) => entry.path === '/team/crown-point-basketball-mens/2P49TB')
      ).toBe(true);
      expect(
        ctx.teamPaths?.some((entry) => entry.path === '/team/crown-point-football/HP71NI')
      ).toBe(true);
      expect(
        ctx.teamPaths?.some((entry) => entry.path === '/team/crown-point-soccer-mens/LDOMFX')
      ).toBe(true);
    });

    it('should build displayName from firstName + lastName when displayName is missing', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce({
        id: 'user-789',
        firstName: 'Jane',
        lastName: 'Smith',
        // no displayName
      });

      const ctx = await builder.buildContext('user-789');
      expect(ctx.displayName).toBe('Jane Smith');
    });

    it('should fallback to "Unknown User" when no name fields exist', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce({ id: 'user-empty' });

      const ctx = await builder.buildContext('user-empty');
      expect(ctx.displayName).toBe('Unknown User');
    });

    it('should prefer the roster team that matches the active sport', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce(createBasketballUserDoc());
      mockGetUserTeams.mockResolvedValueOnce([
        { id: 'team-football', sportName: 'football', organizationId: 'org-football' },
        { id: 'team-basketball', sportName: 'basketball', organizationId: 'org-basketball' },
      ]);

      const ctx = await builder.buildContext('user-bball');

      expect(ctx.teamId).toBe('team-basketball');
      expect(ctx.organizationId).toBe('org-basketball');
    });

    it('should build prompt context with scoped memories and recent sync summaries', async () => {
      const recallByScope = vi.fn().mockResolvedValue({
        user: [
          {
            id: 'mem-user',
            userId: 'user-123',
            target: 'user',
            content: 'User prefers SEC schools.',
            category: 'preference',
            createdAt: '2026-03-01T00:00:00Z',
          },
        ],
        team: [],
        organization: [],
      });

      mockListRecentSummaries.mockResolvedValueOnce([
        'football sync via maxpreps: 1 profile update, 1 recruiting update. Highlights: classOf → 2027',
      ]);

      builder = new ContextBuilder({
        recallByScope,
      } as unknown as import('../vector.service.js').VectorMemoryService);
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce(createFullUserDoc());

      const promptContext = await builder.buildPromptContext(
        'user-123',
        'Which schools should I focus on?'
      );

      expect(recallByScope).toHaveBeenCalledWith('user-123', 'Which schools should I focus on?', {
        teamId: 'mC3D9qg5d9amvcO0otvi',
        organizationId: undefined,
        perTargetLimit: 3,
      });
      expect(mockListRecentSummaries).toHaveBeenCalledWith({
        userId: 'user-123',
        teamId: 'mC3D9qg5d9amvcO0otvi',
        organizationId: undefined,
        limit: 4,
      });
      expect(promptContext.memories.user).toHaveLength(1);
      expect(promptContext.recentSyncSummaries).toEqual([
        'football sync via maxpreps: 1 profile update, 1 recruiting update. Highlights: classOf → 2027',
      ]);
    });
  });

  // ── invalidateContext ────────────────────────────────────────────────

  describe('invalidateContext', () => {
    it('should delete the agent context cache key', async () => {
      mockCacheDel.mockResolvedValueOnce(undefined);

      await builder.invalidateContext('user-123');

      expect(mockCacheDel).toHaveBeenCalledWith('agent:context:user-123');
    });

    it('should not throw if cache delete fails', async () => {
      mockCacheDel.mockRejectedValueOnce(new Error('Redis down'));

      await expect(builder.invalidateContext('user-123')).resolves.not.toThrow();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to invalidate'),
        expect.any(Object)
      );
    });
  });

  // ── compressToPrompt ─────────────────────────────────────────────────

  describe('compressToPrompt', () => {
    it('should produce a token-efficient prompt string for a full athlete', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce(createFullUserDoc());

      const ctx = await builder.buildContext('user-123');
      const prompt = builder.compressToPrompt(ctx);

      expect(prompt).toContain('User: John Doe');
      expect(prompt).toContain('Role: athlete');
      expect(prompt).toContain('Sport: football');
      expect(prompt).toContain('Pos: QB');
      expect(prompt).toContain('Class: 2027');
      expect(prompt).toContain('School: Lincoln HS, Dallas, TX');
      expect(prompt).toContain('GPA: 3.8');
      expect(prompt).toContain('Height: 6\'2"');
      expect(prompt).toContain('Weight: 195lb');
      expect(prompt).toContain('Connected: maxpreps, gmail');
      expect(prompt).not.toContain('Profile:');
      expect(prompt).not.toContain('Views:');
    });

    it('should include exact absolute profile and team URLs when an app base URL is provided', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce(createFullUserDoc());

      const ctx = await builder.buildContext('user-123');
      const prompt = builder.compressToPrompt(ctx, undefined, undefined, {
        appBaseUrl: 'http://localhost:4200',
      });

      expect(prompt).toContain('Use the exact NXT1 URLs below when referencing a profile or team.');
      expect(prompt).toContain(
        'Profile URL: http://localhost:4200/profile/football/john-doe/469697'
      );
      expect(prompt).toContain(
        'Team URL: http://localhost:4200/team/crown-point-basketball-mens/2P49TB'
      );
    });

    it('should produce a minimal prompt for an unknown user', () => {
      const prompt = builder.compressToPrompt({
        userId: 'unknown',
        role: 'athlete',
        displayName: 'Unknown User',
      });

      expect(prompt).toContain('UserID: unknown');
      expect(prompt).toContain('User: Unknown User | Role: athlete');
    });

    it('should produce correct prompt for a coach', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce(createCoachUserDoc());

      const ctx = await builder.buildContext('coach-456');
      const prompt = builder.compressToPrompt(ctx);

      expect(prompt).toContain('Role: coach');
      expect(prompt).toContain('Sport: basketball');
    });

    it('should append recent sync activity and retrieved memory sections when provided', () => {
      const prompt = builder.compressToPrompt(
        {
          userId: 'user-123',
          role: 'athlete',
          displayName: 'John Doe',
        },
        {
          user: [
            {
              id: 'mem-1',
              userId: 'user-123',
              target: 'user',
              content: 'User wants to stay in Texas.',
              category: 'goal',
              createdAt: '2026-03-01T00:00:00Z',
            },
          ],
          team: [
            {
              id: 'mem-2',
              userId: 'user-123',
              target: 'team',
              teamId: 'team-1',
              content: 'The basketball team adds new practice blocks on Wednesdays.',
              category: 'profile_update',
              createdAt: '2026-03-01T00:00:00Z',
            },
          ],
          organization: [],
        },
        ['football sync via maxpreps: 1 new video. Highlights: hudl highlight uploaded']
      );

      expect(prompt).toContain('Recent Sync Activity:');
      expect(prompt).toContain('football sync via maxpreps: 1 new video.');
      expect(prompt).toContain('User Memory: User wants to stay in Texas.');
      expect(prompt).toContain(
        'Team Memory: The basketball team adds new practice blocks on Wednesdays.'
      );
    });
  });
});
