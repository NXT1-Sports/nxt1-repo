/**
 * @fileoverview Unit Tests — AnalyzeRosterGapsTool
 * @module @nxt1/backend/modules/agent/tools/analytics
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { AnalyzeRosterGapsTool } from '../analyze-roster-gaps.tool.js';

// ─── Mock Helpers ───────────────────────────────────────────────────────────

function createMockFirestore(opts: {
  teamExists?: boolean;
  teamData?: Record<string, unknown>;
  memberProfiles?: Record<string, Record<string, unknown>>;
}) {
  const memberProfiles = opts.memberProfiles ?? {};

  const memberDocs = Object.entries(memberProfiles).map(([id, data]) => ({
    exists: true,
    id,
    data: () => data,
  }));

  return {
    collection: vi.fn((name: string) => {
      if (name === 'Teams') {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
              exists: opts.teamExists ?? true,
              data: () => opts.teamData ?? { name: 'Test Team', roster: [] },
            }),
          }),
        };
      }
      // Users collection
      return {
        doc: vi.fn((uid: string) => ({
          get: vi.fn().mockResolvedValue({
            exists: !!memberProfiles[uid],
            id: uid,
            data: () => memberProfiles[uid] ?? {},
          }),
        })),
      };
    }),
    getAll: vi.fn().mockResolvedValue(memberDocs),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AnalyzeRosterGapsTool', () => {
  let tool: AnalyzeRosterGapsTool;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('metadata', () => {
    it('should expose expected tool metadata', () => {
      const db = createMockFirestore({});
      tool = new AnalyzeRosterGapsTool(db as never);

      expect(tool.name).toBe('analyze_roster_gaps');
      expect(tool.isMutation).toBe(false);
      expect(tool.category).toBe('analytics');
      expect(tool.allowedAgents).toContain('recruiting_coordinator');
      expect(tool.allowedAgents).toContain('performance_coordinator');

      const params = tool.parameters as Record<string, unknown>;
      const required = params['required'] as string[];
      expect(required).toContain('teamId');
      expect(required).toContain('sport');
    });
  });

  describe('input validation', () => {
    it('should return error when teamId is missing', async () => {
      const db = createMockFirestore({});
      tool = new AnalyzeRosterGapsTool(db as never);

      const result = await tool.execute({ sport: 'football' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('teamId');
    });

    it('should return error when sport is missing', async () => {
      const db = createMockFirestore({});
      tool = new AnalyzeRosterGapsTool(db as never);

      const result = await tool.execute({ teamId: 'team1' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('sport');
    });
  });

  describe('roster analysis', () => {
    it('should return error when team not found', async () => {
      const db = createMockFirestore({ teamExists: false });
      tool = new AnalyzeRosterGapsTool(db as never);

      const result = await tool.execute({ teamId: 'missing', sport: 'football' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle empty roster gracefully', async () => {
      const db = createMockFirestore({
        teamData: { name: 'Empty FC', roster: [] },
      });
      tool = new AnalyzeRosterGapsTool(db as never);

      const result = await tool.execute({ teamId: 'team1', sport: 'soccer' });
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['totalAthletes']).toBe(0);
      expect(data['message']).toContain('no roster members');
    });

    it('should aggregate position groups and class years', async () => {
      const db = createMockFirestore({
        teamData: { name: 'Tigers', roster: ['u1', 'u2', 'u3'] },
        memberProfiles: {
          u1: {
            firstName: 'Alex',
            lastName: 'QB',
            classOf: 2026,
            sports: [{ sport: 'football', positions: ['QB'] }],
          },
          u2: {
            firstName: 'Ben',
            lastName: 'WR',
            classOf: 2026,
            sports: [{ sport: 'football', positions: ['WR'] }],
          },
          u3: {
            firstName: 'Chris',
            lastName: 'QB',
            classOf: 2027,
            sports: [{ sport: 'football', positions: ['QB'] }],
          },
        },
      });
      tool = new AnalyzeRosterGapsTool(db as never);

      const result = await tool.execute({
        teamId: 'team1',
        sport: 'football',
        graduatingYear: 2026,
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['totalAthletes']).toBe(3);
      expect(data['graduatingCount']).toBe(2);

      const positions = data['positionGroups'] as { position: string; count: number }[];
      expect(positions.find((p) => p.position === 'QB')?.count).toBe(2);
      expect(positions.find((p) => p.position === 'WR')?.count).toBe(1);

      const classYears = data['classYearBreakdown'] as { classOf: number; count: number }[];
      expect(classYears.find((c) => c.classOf === 2026)?.count).toBe(2);
      expect(classYears.find((c) => c.classOf === 2027)?.count).toBe(1);
    });
  });
});
