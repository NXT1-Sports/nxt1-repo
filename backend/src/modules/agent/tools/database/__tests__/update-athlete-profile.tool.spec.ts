/**
 * @fileoverview Unit Tests — UpdateAthleteProfileTool
 * @module @nxt1/backend/modules/agent/tools/database
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

interface MockDocRef {
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

interface MockFirestore {
  collection: ReturnType<typeof vi.fn>;
}

function createMockFirestore(opts?: {
  exists?: boolean;
  userData?: Record<string, unknown>;
  updateError?: unknown;
}): { db: MockFirestore; docRef: MockDocRef } {
  const docRef: MockDocRef = {
    get: vi.fn().mockResolvedValue({
      exists: opts?.exists ?? true,
      data: () =>
        opts?.userData ?? {
          sports: [],
          connectedSources: [],
          username: 'athlete123',
          unicode: 'athlete_123',
        },
    }),
    update: opts?.updateError
      ? vi.fn().mockRejectedValue(opts.updateError)
      : vi.fn().mockResolvedValue(undefined),
  };

  const db: MockFirestore = {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue(docRef),
    }),
  };

  return { db, docRef };
}

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

  describe('metadata', () => {
    it('should expose expected tool metadata', () => {
      expect(tool.name).toBe('update_athlete_profile');
      expect(tool.isMutation).toBe(true);
      expect(tool.category).toBe('database');
      expect(tool.allowedAgents).toContain('data_coordinator');
      expect(tool.allowedAgents).toContain('performance_coordinator');

      const params = tool.parameters as Record<string, unknown>;
      const required = params['required'] as string[];
      expect(required).toContain('userId');
      expect(required).toContain('source');
      expect(required).toContain('profileUrl');
      expect(required).toContain('targetSport');
      expect(required).toContain('fields');
    });
  });

  describe('input validation', () => {
    it('should return error when userId is missing', async () => {
      const result = await tool.execute({
        source: 'maxpreps',
        profileUrl: 'https://maxpreps.com/p/abc',
        targetSport: 'football',
        fields: { height: '6\'2"' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('userId');
    });

    it('should return error when source is missing', async () => {
      const result = await tool.execute({
        userId: 'user123',
        profileUrl: 'https://maxpreps.com/p/abc',
        targetSport: 'football',
        fields: { height: '6\'2"' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('source');
    });

    it('should return error when profileUrl is missing', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        targetSport: 'football',
        fields: { height: '6\'2"' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('profileUrl');
    });

    it('should return error when targetSport is missing', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        profileUrl: 'https://maxpreps.com/p/abc',
        fields: { height: '6\'2"' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('targetSport');
    });

    it('should return error when fields is not an object', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        profileUrl: 'https://maxpreps.com/p/abc',
        targetSport: 'football',
        fields: 'not-an-object',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('fields');
    });

    it('should return validation errors for invalid field values', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        profileUrl: 'https://maxpreps.com/p/abc',
        targetSport: 'football',
        fields: { height: 74 },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('height');
    });
  });

  describe('data access behavior', () => {
    it('should return not found when user document does not exist', async () => {
      const missing = createMockFirestore({ exists: false });
      const missingTool = new UpdateAthleteProfileTool(missing.db as never);

      const result = await missingTool.execute({
        userId: 'missing-user',
        source: 'maxpreps',
        profileUrl: 'https://maxpreps.com/p/missing',
        targetSport: 'football',
        fields: { height: '6\'2"' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should write profile updates and return summary data', async () => {
      const result = await tool.execute({
        userId: 'user123',
        source: 'maxpreps',
        profileUrl: 'https://maxpreps.com/p/abc',
        targetSport: 'football',
        fields: {
          firstName: 'Jalen',
          height: '6\'2"',
          weight: '185 lbs',
        },
      });

      expect(result.success).toBe(true);
      expect(mockDb.collection).toHaveBeenCalledWith('Users');
      expect(mockDocRef.update).toHaveBeenCalledTimes(1);

      const updateArg = mockDocRef.update.mock.calls[0][0] as Record<string, unknown>;
      expect(updateArg['firstName']).toBe('Jalen');
      expect(updateArg['height']).toBe('6\'2"');
      expect(updateArg['weight']).toBe('185 lbs');
      expect(updateArg['connectedSources']).toBeDefined();
      expect(updateArg['updatedAt']).toBeDefined();

      const data = result.data as Record<string, unknown>;
      expect(data['userId']).toBe('user123');
      expect(data['source']).toBe('maxpreps');
      expect(data['profileUrl']).toBe('https://maxpreps.com/p/abc');
      expect(data['targetSport']).toBe('football');
      expect(typeof data['sectionCount']).toBe('number');
      expect(data['writtenSections']).toBeDefined();
      expect(data['message']).toContain('Successfully updated');
    });

    it('should include current sport entry when target sport already exists', async () => {
      const existingSportFirestore = createMockFirestore({
        userData: {
          sports: [{ sport: 'football', order: 0, positions: ['QB'] }],
          connectedSources: [],
        },
      });
      const existingSportTool = new UpdateAthleteProfileTool(existingSportFirestore.db as never);

      const result = await existingSportTool.execute({
        userId: 'user123',
        source: 'hudl',
        profileUrl: 'https://hudl.com/p/abc',
        targetSport: 'football',
        fields: {
          sportData: { positions: ['QB', 'Safety'] },
        },
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['isNewSport']).toBe(false);
      expect(data['sportIndex']).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should surface Firestore error messages', async () => {
      const failing = createMockFirestore({
        updateError: new Error('PERMISSION_DENIED: Missing permissions'),
      });
      const failingTool = new UpdateAthleteProfileTool(failing.db as never);

      const result = await failingTool.execute({
        userId: 'user123',
        source: 'maxpreps',
        profileUrl: 'https://maxpreps.com/p/abc',
        targetSport: 'football',
        fields: { height: '6\'2"' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('PERMISSION_DENIED');
    });

    it('should normalize non-Error throws to a generic message', async () => {
      const failing = createMockFirestore({ updateError: 'string error' });
      const failingTool = new UpdateAthleteProfileTool(failing.db as never);

      const result = await failingTool.execute({
        userId: 'user123',
        source: 'maxpreps',
        profileUrl: 'https://maxpreps.com/p/abc',
        targetSport: 'football',
        fields: { height: '6\'2"' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to update profile');
    });
  });
});
