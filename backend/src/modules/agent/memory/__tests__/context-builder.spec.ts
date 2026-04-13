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

vi.mock('../../../../services/cache.service.js', () => ({
  getCacheService: () => mockCache,
  CACHE_TTL: { PROFILES: 900 },
}));

const mockGetUserById = vi.fn();
vi.mock('../../../../services/users.service.js', () => ({
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
}));

const mockGetUserTeams = vi.fn();
vi.mock('../../../../services/team-adapter.service.js', () => ({
  TeamServiceAdapter: class {
    getUserTeams = mockGetUserTeams;
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({ collection: vi.fn() })),
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
        team: { name: 'Lincoln HS' },
      },
    ],
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
      commitmentStatus: 'uncommitted',
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
    },
    onboardingCompleted: true,
    _counters: { profileViews: 500 },
    lastLoginAt: '2026-02-15T00:00:00Z',
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

      expect(ctx.targetDivisions).toEqual(['D1', 'D2']);
      expect(ctx.targetColleges).toEqual(['Georgia', 'Texas', 'Ohio State']);
      expect(ctx.recruitingStatus).toBe('active');
      expect(ctx.commitmentStatus).toBe('uncommitted');
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

    it('should map engagement metrics from counters', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce(createFullUserDoc());

      const ctx = await builder.buildContext('user-123');

      expect(ctx.profileCompletionPercent).toBe(100); // onboardingCompleted = true
      expect(ctx.totalProfileViews).toBe(1250);
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

    it('should estimate profile completion when onboarding not completed', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce({
        id: 'user-partial',
        firstName: 'Partial',
        // no profileImgs, sports, location, aboutMe, height, weight
        onboardingCompleted: false,
      });

      const ctx = await builder.buildContext('user-partial');
      // Only firstName is present → 1/6 fields → ~17%
      expect(ctx.profileCompletionPercent).toBe(17);
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

    it('should build prompt context with scoped memories when vector memory is available', async () => {
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
        teamId: undefined,
        organizationId: undefined,
        perTargetLimit: 3,
      });
      expect(promptContext.memories.user).toHaveLength(1);
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
      expect(prompt).toContain('Targets: D1, D2');
      expect(prompt).toContain('Top Schools: Georgia, Texas, Ohio State');
      expect(prompt).toContain('Status: uncommitted');
      expect(prompt).toContain('Connected: maxpreps, gmail');
      expect(prompt).toContain('Profile: 100% complete');
      expect(prompt).toContain('Views: 1250');
    });

    it('should produce a minimal prompt for an unknown user', () => {
      const prompt = builder.compressToPrompt({
        userId: 'unknown',
        role: 'athlete',
        displayName: 'Unknown User',
      });

      expect(prompt).toBe('User: Unknown User | Role: athlete | UserID: unknown');
    });

    it('should produce correct prompt for a coach', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockGetUserById.mockResolvedValueOnce(createCoachUserDoc());

      const ctx = await builder.buildContext('coach-456');
      const prompt = builder.compressToPrompt(ctx);

      expect(prompt).toContain('Role: coach');
      expect(prompt).toContain('Sport: basketball');
    });

    it('should append retrieved memory sections when provided', () => {
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
        }
      );

      expect(prompt).toContain('User Memory: User wants to stay in Texas.');
      expect(prompt).toContain(
        'Team Memory: The basketball team adds new practice blocks on Wednesdays.'
      );
    });
  });
});
