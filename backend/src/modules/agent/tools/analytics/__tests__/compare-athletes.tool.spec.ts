/**
 * @fileoverview Unit Tests — CompareAthletesTool
 * @module @nxt1/backend/modules/agent/tools/analytics
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { CompareAthletesTool } from '../compare-athletes.tool.js';

// ─── Mock Helpers ───────────────────────────────────────────────────────────

function createMockFirestore(profiles: Record<string, Record<string, unknown> | null>) {
  const statsQuery = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue({ docs: [] }),
    }),
  };

  return {
    collection: vi.fn((name: string) => {
      if (name === 'Users') {
        return {
          doc: vi.fn((uid: string) => ({
            get: vi.fn().mockResolvedValue({
              exists: profiles[uid] !== null && profiles[uid] !== undefined,
              data: () => profiles[uid] ?? {},
            }),
          })),
        };
      }
      return statsQuery;
    }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CompareAthletesTool', () => {
  let tool: CompareAthletesTool;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('metadata', () => {
    it('should expose expected tool metadata', () => {
      const db = createMockFirestore({});
      tool = new CompareAthletesTool(db as never);

      expect(tool.name).toBe('compare_athletes');
      expect(tool.isMutation).toBe(false);
      expect(tool.category).toBe('analytics');
      expect(tool.allowedAgents).toContain('performance_coordinator');
      expect(tool.allowedAgents).toContain('recruiting_coordinator');

      const params = tool.parameters as Record<string, unknown>;
      const required = params['required'] as string[];
      expect(required).toContain('athleteAId');
      expect(required).toContain('athleteBId');
      expect(required).toContain('sport');
    });
  });

  describe('input validation', () => {
    it('should return error when athleteAId is missing', async () => {
      const db = createMockFirestore({});
      tool = new CompareAthletesTool(db as never);

      const result = await tool.execute({ athleteBId: 'b', sport: 'football' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('athleteAId');
    });

    it('should return error when athleteBId is missing', async () => {
      const db = createMockFirestore({});
      tool = new CompareAthletesTool(db as never);

      const result = await tool.execute({ athleteAId: 'a', sport: 'football' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('athleteBId');
    });

    it('should return error when sport is missing', async () => {
      const db = createMockFirestore({});
      tool = new CompareAthletesTool(db as never);

      const result = await tool.execute({ athleteAId: 'a', athleteBId: 'b' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('sport');
    });

    it('should return error when both IDs are the same', async () => {
      const db = createMockFirestore({});
      tool = new CompareAthletesTool(db as never);

      const result = await tool.execute({
        athleteAId: 'same',
        athleteBId: 'same',
        sport: 'football',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('different');
    });
  });

  describe('comparison', () => {
    it('should return error when athlete A not found', async () => {
      const db = createMockFirestore({ b: { firstName: 'Bob' } });
      tool = new CompareAthletesTool(db as never);

      const result = await tool.execute({ athleteAId: 'a', athleteBId: 'b', sport: 'football' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Athlete A');
    });

    it('should return error when athlete B not found', async () => {
      const db = createMockFirestore({ a: { firstName: 'Alice' } });
      tool = new CompareAthletesTool(db as never);

      const result = await tool.execute({ athleteAId: 'a', athleteBId: 'b', sport: 'football' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Athlete B');
    });

    it('should return structured comparison for two valid athletes', async () => {
      const db = createMockFirestore({
        a: {
          firstName: 'Alice',
          lastName: 'Johnson',
          height: '5\'9"',
          weight: '155 lbs',
          classOf: 2026,
          sports: [{ sport: 'basketball', positions: ['PG'] }],
          awards: [],
          academics: { gpa: 3.9 },
        },
        b: {
          firstName: 'Bob',
          lastName: 'Williams',
          height: '6\'1"',
          weight: '175 lbs',
          classOf: 2026,
          sports: [{ sport: 'basketball', positions: ['SG'] }],
          awards: [{ title: 'All-State' }],
          academics: { gpa: 3.5 },
        },
      });
      tool = new CompareAthletesTool(db as never);

      const result = await tool.execute({
        athleteAId: 'a',
        athleteBId: 'b',
        sport: 'basketball',
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['sport']).toBe('basketball');
      expect(data['athleteA']).toBeDefined();
      expect(data['athleteB']).toBeDefined();
      expect(data['message']).toContain('Alice Johnson');
      expect(data['message']).toContain('Bob Williams');
    });
  });
});
