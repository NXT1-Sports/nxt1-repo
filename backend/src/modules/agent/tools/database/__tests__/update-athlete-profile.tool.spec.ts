/**
 * @fileoverview Unit Tests — UpdateAthleteProfileTool
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Tests the tool in isolation by mocking Firestore.
 * Verifies input validation, field whitelisting, domain validation,
 * source attribution, and successful/error write paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock cache + context builder (imported by the tool for invalidation) ───

vi.mock('../../../../../services/cache.service.js', () => ({
  getCacheService: () => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  }),
  CACHE_TTL: {
    PROFILES: 900,
    COLLEGES: 86400,
    DIVISIONS: 86400,
    SPORTS: 86400,
    RANKINGS: 3600,
    LEADERBOARDS: 3600,
    SEARCH: 900,
    TRENDING: 1800,
    FOLLOWERS: 300,
    FEED: 120,
    POSTS: 180,
    COMMENTS: 60,
    COUNTS: 60,
    STATS: 300,
  },
}));

vi.mock('../../../../../services/users.service.js', () => ({
  getUserById: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { UpdateAthleteProfileTool } from '../update-athlete-profile.tool.js';

// ─── Mock Firestore ─────────────────────────────────────────────────────────

interface MockDocRef {
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

interface MockCollection {
  doc: ReturnType<typeof vi.fn>;
}

interface MockFirestore {
  collection: ReturnType<typeof vi.fn>;
}

function createMockFirestore(opts?: { exists?: boolean; updateError?: Error }): {
  db: MockFirestore;
  docRef: MockDocRef;
} {
  const docRef: MockDocRef = {
    get: vi.fn().mockResolvedValue({ exists: opts?.exists ?? true }),
    update: opts?.updateError
      ? vi.fn().mockRejectedValue(opts.updateError)
      : vi.fn().mockResolvedValue(undefined),
  };

  const collection: MockCollection = {
    doc: vi.fn().mockReturnValue(docRef),
  };

  const db: MockFirestore = {
    collection: vi.fn().mockReturnValue(collection),
  };

  return { db, docRef };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('UpdateAthleteProfileTool', () => {
  let tool: UpdateAthleteProfileTool;
  let mockDb: MockFirestore;
  let mockDocRef: MockDocRef;

  beforeEach(() => {
    vi.clearAllMocks();
    const mocks = createMockFirestore();
    mockDb = mocks.db;
    mockDocRef = mocks.docRef;
    tool = new UpdateAthleteProfileTool(mockDb as never);
  });

  // ── Metadata ──────────────────────────────────────────────────────────

  describe('metadata', () => {
    it('should have the correct tool name', () => {
      expect(tool.name).toBe('update_athlete_profile');
    });

    it('should be a mutation', () => {
      expect(tool.isMutation).toBe(true);
    });

    it('should have category "database"', () => {
      expect(tool.category).toBe('database');
    });

    it('should require userId, source, and fields parameters', () => {
      const params = tool.parameters as Record<string, unknown>;
      expect(params['required']).toContain('userId');
      expect(params['required']).toContain('source');
      expect(params['required']).toContain('fields');
    });

    it('should allow data_coordinator and performance_coordinator', () => {
      expect(tool.allowedAgents).toContain('data_coordinator');
      expect(tool.allowedAgents).toContain('performance_coordinator');
    });

    it('should not allow general or recruiting_coordinator', () => {
      expect(tool.allowedAgents).not.toContain('general');
      expect(tool.allowedAgents).not.toContain('recruiting_coordinator');
    });
  });

  // ── Input Validation ──────────────────────────────────────────────────

  describe('input validation', () => {
    it('should return error when userId is missing', async () => {
      const result = await tool.execute({
        source: 'maxpreps',
        fields: { height: '6\'2"' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('userId');
    });

    it('should return error when userId is empty string', async () => {
      const result = await tool.execute({
        userId: '',
        source: 'maxpreps',
        fields: { height: '6\'2"' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('userId');
    });

    it('should return error when userId is not a string', async () => {
      const result = await tool.execute({
        userId: 12345,
        source: 'maxpreps',
        fields: { height: '6\'2"' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('userId');
    });

    it('should return error when source is missing', async () => {
      const result = await tool.execute({
        userId: 'user123',
        fields: { height: '6\'2"' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('source');
    });

    it('should return error when source is empty string', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: '',
        fields: { height: '6\'2"' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('source');
    });

    it('should return error when fields is missing', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('fields');
    });

    it('should return error when fields is not an object', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: 'not-an-object',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('fields');
    });

    it('should return error when fields is an array', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: ['height'],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('fields');
    });
  });

  // ── Field Whitelisting ────────────────────────────────────────────────

  describe('field whitelisting', () => {
    it('should drop non-writable fields and report them as skipped', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: {
          height: '6\'2"',
          email: 'hacker@evil.com',
          role: 'admin',
          status: 'active',
          planTier: 'premium',
          _counters: { views: 999 },
        },
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['updatedFields']).toEqual(['height']);
      expect(data['skippedFields']).toContain('email');
      expect(data['skippedFields']).toContain('role');
      expect(data['skippedFields']).toContain('status');
      expect(data['skippedFields']).toContain('planTier');
      expect(data['skippedFields']).toContain('_counters');
    });

    it('should return error when ALL fields are non-writable', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: {
          email: 'hacker@evil.com',
          role: 'admin',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No writable fields');
      expect(result.error).toContain('email');
      expect(result.error).toContain('role');
    });

    it('should accept all whitelisted fields', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'hudl',
        fields: {
          firstName: 'Jalen',
          lastName: 'Smith',
          displayName: 'Jalen Smith',
          aboutMe: 'Junior QB',
          height: '6\'2"',
          weight: '185 lbs',
          classOf: 2027,
          location: { city: 'Dallas', state: 'TX', country: 'US' },
          sports: [{ sport: 'football', order: 0, accountType: 'athlete' }],
          activeSportIndex: 0,
          teamHistory: [{ teamName: 'Lincoln HS' }],
          awards: [{ title: 'All-District' }],
          connectedSources: [{ platform: 'hudl', profileUrl: 'https://hudl.com/123' }],
        },
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['fieldCount']).toBe(13);
      expect(data['skippedFields']).toBeUndefined();
    });
  });

  // ── Domain Validation ─────────────────────────────────────────────────

  describe('domain validation', () => {
    it('should reject non-string height', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: { height: 74 },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('height');
    });

    it('should reject empty height', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: { height: '' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('height');
    });

    it('should reject non-string weight', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: { weight: 185 },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('weight');
    });

    it('should reject classOf below current year', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: { classOf: 2020 },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('classOf');
    });

    it('should reject classOf too far in the future', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: { classOf: 2050 },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('classOf');
    });

    it('should reject non-integer classOf', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: { classOf: 2027.5 },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('classOf');
    });

    it('should reject aboutMe exceeding max length', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: { aboutMe: 'x'.repeat(2001) },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('aboutMe');
    });

    it('should reject non-array sports', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: { sports: 'football' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('sports');
    });

    it('should reject non-array teamHistory', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: { teamHistory: { name: 'Lincoln' } },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('teamHistory');
    });

    it('should reject non-object location', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: { location: 'Dallas, TX' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('location');
    });

    it('should reject empty firstName', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: { firstName: '' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('firstName');
    });

    it('should report multiple validation errors at once', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: { height: 74, classOf: 2020, sports: 'football' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('height');
      expect(result.error).toContain('classOf');
      expect(result.error).toContain('sports');
    });
  });

  // ── User Not Found ────────────────────────────────────────────────────

  describe('user not found', () => {
    it('should return error when user does not exist', async () => {
      const mocks = createMockFirestore({ exists: false });
      const toolWithMissing = new UpdateAthleteProfileTool(mocks.db as never);

      const result = await toolWithMissing.execute({
        userId: 'nonexistent',
        source: 'maxpreps',
        fields: { height: '6\'2"' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ── Successful Writes ─────────────────────────────────────────────────

  describe('successful writes', () => {
    it('should write fields to Firestore with updatedAt timestamp', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: { height: '6\'2"', weight: '185 lbs' },
      });

      expect(result.success).toBe(true);
      expect(mockDb.collection).toHaveBeenCalledWith('Users');
      expect(mockDocRef.update).toHaveBeenCalledTimes(1);

      const updateArg = mockDocRef.update.mock.calls[0][0] as Record<string, unknown>;
      expect(updateArg['height']).toBe('6\'2"');
      expect(updateArg['weight']).toBe('185 lbs');
      expect(updateArg['updatedAt']).toBeDefined();
    });

    it('should return accurate field count and summary', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'hudl',
        fields: {
          height: '6\'2"',
          weight: '185 lbs',
          classOf: 2027,
        },
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['userId']).toBe('user123');
      expect(data['source']).toBe('hudl');
      expect(data['updatedFields']).toEqual(['height', 'weight', 'classOf']);
      expect(data['fieldCount']).toBe(3);
      expect(data['message']).toContain('3 field(s)');
    });

    it('should add connectedSources sync record when not provided explicitly', async () => {
      await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: { height: '6\'2"' },
      });

      const updateArg = mockDocRef.update.mock.calls[0][0] as Record<string, unknown>;
      // connectedSources should be set via FieldValue.arrayUnion (mocked as an object)
      expect(updateArg['connectedSources']).toBeDefined();
    });

    it('should not overwrite connectedSources when explicitly provided', async () => {
      const customSources = [
        { platform: 'hudl', profileUrl: 'https://hudl.com/123', syncStatus: 'success' },
      ];

      await tool.execute({
        userId: 'user123',
        source: 'hudl',
        fields: { height: '6\'2"', connectedSources: customSources },
      });

      const updateArg = mockDocRef.update.mock.calls[0][0] as Record<string, unknown>;
      expect(updateArg['connectedSources']).toEqual(customSources);
    });

    it('should trim userId and source', async () => {
      const result = await tool.execute({
        userId: '  user123  ',
        source: '  maxpreps  ',
        fields: { height: '6\'2"' },
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['userId']).toBe('user123');
      expect(data['source']).toBe('maxpreps');
    });
  });

  // ── Error Handling ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should wrap Firestore errors as ToolResult failures', async () => {
      const mocks = createMockFirestore({
        updateError: new Error('PERMISSION_DENIED: Missing permissions'),
      });
      const toolWithError = new UpdateAthleteProfileTool(mocks.db as never);

      const result = await toolWithError.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: { height: '6\'2"' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('PERMISSION_DENIED');
    });

    it('should handle non-Error throw values from Firestore', async () => {
      const docRef = {
        get: vi.fn().mockResolvedValue({ exists: true }),
        update: vi.fn().mockRejectedValue('string error'),
      };
      const db = {
        collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(docRef) }),
      };
      const toolWithStringError = new UpdateAthleteProfileTool(db as never);

      const result = await toolWithStringError.execute({
        userId: 'user123',
        source: 'maxpreps',
        fields: { height: '6\'2"' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to update profile');
    });
  });
});
