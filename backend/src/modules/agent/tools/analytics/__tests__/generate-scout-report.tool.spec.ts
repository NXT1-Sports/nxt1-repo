/**
 * @fileoverview Unit Tests — GenerateScoutReportTool
 * @module @nxt1/backend/modules/agent/tools/analytics
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GenerateScoutReportTool } from '../generate-scout-report.tool.js';

// ─── Mock Helpers ───────────────────────────────────────────────────────────

interface MockFirestore {
  collection: ReturnType<typeof vi.fn>;
}

function createMockFirestore(opts?: {
  exists?: boolean;
  userData?: Record<string, unknown>;
  statsData?: Record<string, unknown>[];
}): MockFirestore {
  const userDoc = {
    exists: opts?.exists ?? true,
    data: () =>
      opts?.userData ?? {
        firstName: 'Jalen',
        lastName: 'Smith',
        displayName: 'Jalen Smith',
        height: '6\'2"',
        weight: '185 lbs',
        classOf: 2026,
        location: { city: 'Austin', state: 'TX' },
        sports: [{ sport: 'football', positions: ['QB'], metrics: [] }],
        awards: [{ title: 'All-District QB', category: 'athletic' }],
        teamHistory: [],
        connectedSources: [{ platform: 'maxpreps', url: 'https://maxpreps.com/p/abc' }],
        academics: { gpa: 3.8, satScore: 1280 },
      },
  };

  const statsDocs = (opts?.statsData ?? []).map((data) => ({
    data: () => data,
  }));

  const statsQuery = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue({ docs: statsDocs }),
    }),
  };

  return {
    collection: vi.fn((name: string) => {
      if (name === 'Users') {
        return { doc: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue(userDoc) }) };
      }
      return statsQuery;
    }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('GenerateScoutReportTool', () => {
  let tool: GenerateScoutReportTool;
  let mockDb: MockFirestore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockFirestore();
    tool = new GenerateScoutReportTool(mockDb as never);
  });

  describe('metadata', () => {
    it('should expose expected tool metadata', () => {
      expect(tool.name).toBe('generate_scout_report');
      expect(tool.isMutation).toBe(false);
      expect(tool.category).toBe('analytics');
      expect(tool.allowedAgents).toContain('performance_coordinator');
      expect(tool.allowedAgents).toContain('recruiting_coordinator');
      expect(tool.allowedAgents).toContain('data_coordinator');

      const params = tool.parameters as Record<string, unknown>;
      const required = params['required'] as string[];
      expect(required).toContain('userId');
      expect(required).toContain('sport');
    });
  });

  describe('input validation', () => {
    it('should return error when userId is missing', async () => {
      const result = await tool.execute({ sport: 'football' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('userId');
    });

    it('should return error when sport is missing', async () => {
      const result = await tool.execute({ userId: 'user123' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('sport');
    });
  });

  describe('data gathering', () => {
    it('should return error when athlete not found', async () => {
      const db = createMockFirestore({ exists: false });
      const notFoundTool = new GenerateScoutReportTool(db as never);

      const result = await notFoundTool.execute({ userId: 'missing', sport: 'football' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return structured scout report data', async () => {
      const db = createMockFirestore({
        statsData: [
          { season: '2024-2025', category: 'Passing', stats: [{ field: 'yards', value: 3200 }] },
        ],
      });
      const successTool = new GenerateScoutReportTool(db as never);

      const result = await successTool.execute({
        userId: 'user123',
        sport: 'football',
        evaluationFocus: 'overall',
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['userId']).toBe('user123');
      expect(data['sport']).toBe('football');
      expect(data['evaluationFocus']).toBe('overall');
      expect(data['identity']).toBeDefined();
      expect(data['sportData']).toBeDefined();
      expect(data['seasonStats']).toBeDefined();
      expect(data['seasonCount']).toBe(1);
      expect(data['message']).toContain('Gathered scout report data');
    });

    it('should handle athlete with no sport entry gracefully', async () => {
      const db = createMockFirestore({
        userData: { firstName: 'Jane', lastName: 'Doe', sports: [] },
      });
      const noSportTool = new GenerateScoutReportTool(db as never);

      const result = await noSportTool.execute({ userId: 'user123', sport: 'basketball' });
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['sportData']).toBeNull();
    });
  });
});
