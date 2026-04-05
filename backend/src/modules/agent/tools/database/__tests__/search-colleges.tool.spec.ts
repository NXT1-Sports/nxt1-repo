/**
 * @fileoverview Unit tests for SearchCollegesTool
 *
 * Tests the tool's input parsing, MongoDB filter construction,
 * DTO mapping, and ReAct fallback nudge behavior.
 *
 * The CollegeModel is mocked — no real database connection needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchCollegesTool } from '../search-colleges.tool.js';

// ─── Mock CollegeModel ──────────────────────────────────────────────────────

const mockExec = vi.fn();
const mockLean = vi.fn(() => ({ exec: mockExec }));
const mockLimit = vi.fn(() => ({ lean: mockLean }));
const mockSelect = vi.fn(() => ({ limit: mockLimit }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFind = vi.fn<(...args: any[]) => any>(() => ({ select: mockSelect }));

vi.mock('../../../../../models/college.model.js', () => ({
  CollegeModel: { find: (...args: unknown[]) => mockFind(...args) },
}));

/** Extract the filter object passed to CollegeModel.find() in the last call. */
function getFilter(): Record<string, unknown> {
  const calls = mockFind.mock.calls;
  return calls[calls.length - 1]![0] as Record<string, unknown>;
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('SearchCollegesTool', () => {
  let tool: SearchCollegesTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new SearchCollegesTool();
  });

  // ── Metadata ──────────────────────────────────────────────────────────

  describe('metadata', () => {
    it('should have the correct name', () => {
      expect(tool.name).toBe('search_colleges');
    });

    it('should be a read-only tool', () => {
      expect(tool.isMutation).toBe(false);
    });

    it('should be in the database category', () => {
      expect(tool.category).toBe('database');
    });

    it('should allow all agents', () => {
      expect(tool.allowedAgents).toContain('*');
    });

    it('should require sport parameter', () => {
      expect((tool.parameters as Record<string, unknown>).required).toEqual(['sport']);
    });
  });

  // ── Input Validation ──────────────────────────────────────────────────

  describe('input validation', () => {
    it('should return error when sport is missing', async () => {
      const result = await tool.execute({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('sport');
    });

    it('should return error when sport is empty string', async () => {
      const result = await tool.execute({ sport: '' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('sport');
    });

    it('should return error when sport is whitespace only', async () => {
      const result = await tool.execute({ sport: '   ' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('sport');
    });
  });

  // ── Filter Construction ───────────────────────────────────────────────

  describe('filter construction', () => {
    beforeEach(() => {
      mockExec.mockResolvedValue([]);
    });

    it('should filter by sport only when no other criteria given', async () => {
      await tool.execute({ sport: 'Baseball' });

      expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ sport: 'Baseball' }));
    });

    it('should filter by sport + state (uppercased)', async () => {
      await tool.execute({ sport: 'Baseball', state: 'oh' });

      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          sport: 'Baseball',
          state: 'OH',
        })
      );
    });

    it('should filter by division using regex on sportInfo sub-document', async () => {
      await tool.execute({ sport: 'Baseball', division: 'NCAA Division II' });

      const filter = getFilter();
      expect(filter['sportInfo.Baseball.division']).toEqual(
        expect.objectContaining({ $regex: expect.any(String), $options: 'i' })
      );
    });

    it('should filter by conference using regex on sportInfo sub-document', async () => {
      await tool.execute({ sport: 'Football', conference: 'SEC' });

      const filter = getFilter();
      expect(filter['sportInfo.Football.conference']).toEqual(
        expect.objectContaining({ $regex: 'SEC', $options: 'i' })
      );
    });

    it('should filter by maxGpa using $lte', async () => {
      await tool.execute({ sport: 'Baseball', maxGpa: 3.0 });

      const filter = getFilter();
      expect(filter['averageGPA']).toEqual({ $lte: 3.0 });
    });

    it('should filter by maxTuition using $lte', async () => {
      await tool.execute({ sport: 'Baseball', maxTuition: 30000 });

      const filter = getFilter();
      expect(filter['totalCost']).toEqual({ $lte: 30000 });
    });

    it('should filter by name using $text search', async () => {
      await tool.execute({ sport: 'Baseball', name: 'Ohio State' });

      const filter = getFilter();
      expect(filter['$text']).toEqual({ $search: 'Ohio State' });
    });

    it('should filter by HBCU flag', async () => {
      await tool.execute({ sport: 'Football', hbcu: true });

      const filter = getFilter();
      expect(filter['hbcu']).toBe(true);
    });

    it('should filter by public flag', async () => {
      await tool.execute({ sport: 'Football', publicOnly: true });

      const filter = getFilter();
      expect(filter['public']).toBe(true);
    });

    it('should filter by community college flag', async () => {
      await tool.execute({ sport: 'Baseball', communityCollege: true });

      const filter = getFilter();
      expect(filter['community_college']).toBe(true);
    });

    it('should combine multiple filters', async () => {
      await tool.execute({
        sport: 'Baseball',
        state: 'OH',
        division: 'NCAA Division II',
        maxGpa: 3.0,
        hbcu: true,
      });

      const filter = getFilter();
      expect(filter['sport']).toBe('Baseball');
      expect(filter['state']).toBe('OH');
      expect(filter['sportInfo.Baseball.division']).toBeDefined();
      expect(filter['averageGPA']).toEqual({ $lte: 3.0 });
      expect(filter['hbcu']).toBe(true);
    });
  });

  // ── Limit Enforcement ─────────────────────────────────────────────────

  describe('limit enforcement', () => {
    beforeEach(() => {
      mockExec.mockResolvedValue([]);
    });

    it('should default to 10 results', async () => {
      await tool.execute({ sport: 'Baseball' });
      expect(mockLimit).toHaveBeenCalledWith(10);
    });

    it('should respect user-specified limit', async () => {
      await tool.execute({ sport: 'Baseball', limit: 5 });
      expect(mockLimit).toHaveBeenCalledWith(5);
    });

    it('should cap limit at 25', async () => {
      await tool.execute({ sport: 'Baseball', limit: 100 });
      expect(mockLimit).toHaveBeenCalledWith(25);
    });

    it('should enforce minimum limit of 1', async () => {
      await tool.execute({ sport: 'Baseball', limit: -5 });
      expect(mockLimit).toHaveBeenCalledWith(1);
    });
  });

  // ── DTO Mapping ───────────────────────────────────────────────────────

  describe('DTO mapping', () => {
    it('should map Mongoose documents to distilled DTOs', async () => {
      mockExec.mockResolvedValue([
        {
          _id: 'abc123',
          name: 'Ohio State University',
          city: 'Columbus',
          state: 'OH',
          averageGPA: 3.5,
          totalCost: 28000,
          acceptanceRate: 53,
          hbcu: false,
          public: true,
          community_college: false,
          logoUrl: 'https://example.com/logo.png',
          landingUrl: 'https://example.com',
          sportInfo: {
            Baseball: { division: 'NCAA Division I', conference: 'Big Ten' },
          },
        },
      ]);

      const result = await tool.execute({ sport: 'Baseball' });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.count).toBe(1);
      expect(data.sport).toBe('Baseball');

      const colleges = data.colleges as Record<string, unknown>[];
      expect(colleges[0]).toEqual({
        id: 'abc123',
        name: 'Ohio State University',
        city: 'Columbus',
        state: 'OH',
        division: 'NCAA Division I',
        conference: 'Big Ten',
        averageGPA: 3.5,
        totalCost: 28000,
        acceptanceRate: 53,
        hbcu: false,
        public: true,
        communityCollege: false,
        logoUrl: 'https://example.com/logo.png',
        landingUrl: 'https://example.com',
      });
    });

    it('should handle missing sportInfo gracefully', async () => {
      mockExec.mockResolvedValue([
        {
          _id: 'def456',
          name: 'Small College',
          city: 'Somewhere',
          state: 'TX',
          sportInfo: {},
        },
      ]);

      const result = await tool.execute({ sport: 'Baseball' });

      expect(result.success).toBe(true);
      const colleges = (result.data as Record<string, unknown>).colleges as Record<
        string,
        unknown
      >[];
      expect(colleges[0].division).toBe('Unknown');
      expect(colleges[0].conference).toBe('Unknown');
    });

    it('should handle null numeric fields', async () => {
      mockExec.mockResolvedValue([
        {
          _id: 'ghi789',
          name: 'No Stats College',
          city: 'Nowhere',
          state: 'CA',
          sportInfo: { Baseball: { division: 'NAIA' } },
        },
      ]);

      const result = await tool.execute({ sport: 'Baseball' });

      const colleges = (result.data as Record<string, unknown>).colleges as Record<
        string,
        unknown
      >[];
      expect(colleges[0].averageGPA).toBeNull();
      expect(colleges[0].totalCost).toBeNull();
      expect(colleges[0].acceptanceRate).toBeNull();
    });
  });

  // ── ReAct Fallback Nudge ──────────────────────────────────────────────

  describe('ReAct fallback nudge', () => {
    it('should include _agent_hint when 0 results are found', async () => {
      mockExec.mockResolvedValue([]);

      const result = await tool.execute({ sport: 'Baseball', state: 'OH' });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.count).toBe(0);
      expect(data.colleges).toEqual([]);
      expect(data._agent_hint).toBeDefined();
      expect(data._agent_hint as string).toContain('web_search');
    });

    it('should include filtersApplied in empty result for debugging', async () => {
      mockExec.mockResolvedValue([]);

      const result = await tool.execute({
        sport: 'Baseball',
        state: 'OH',
        division: 'NCAA Division II',
      });

      const data = result.data as Record<string, unknown>;
      const filters = data.filtersApplied as Record<string, unknown>;
      expect(filters.sport).toBe('Baseball');
      expect(filters.state).toBe('OH');
      expect(filters.division).toBe('NCAA Division II');
    });

    it('should NOT include _agent_hint when results are found', async () => {
      mockExec.mockResolvedValue([
        {
          _id: '1',
          name: 'Test',
          city: 'City',
          state: 'OH',
          sportInfo: { Baseball: { division: 'D2' } },
        },
      ]);

      const result = await tool.execute({ sport: 'Baseball' });

      const data = result.data as Record<string, unknown>;
      expect(data._agent_hint).toBeUndefined();
    });
  });

  // ── Error Handling ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should return error result on database failure', async () => {
      mockExec.mockRejectedValue(new Error('Connection refused'));

      const result = await tool.execute({ sport: 'Baseball' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection refused');
    });

    it('should handle non-Error thrown objects', async () => {
      mockExec.mockRejectedValue('unexpected string error');

      const result = await tool.execute({ sport: 'Baseball' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('College search failed');
    });
  });

  // ── Regex Injection Prevention ────────────────────────────────────────

  describe('regex injection prevention', () => {
    beforeEach(() => {
      mockExec.mockResolvedValue([]);
    });

    it('should escape special regex characters in division', async () => {
      await tool.execute({ sport: 'Baseball', division: 'NCAA (D2)' });

      const filter = getFilter();
      const divisionFilter = filter['sportInfo.Baseball.division'] as { $regex: string };
      // Parentheses should be escaped
      expect(divisionFilter.$regex).toContain('\\(');
      expect(divisionFilter.$regex).toContain('\\)');
    });

    it('should escape special regex characters in conference', async () => {
      await tool.execute({ sport: 'Baseball', conference: 'Big 10+' });

      const filter = getFilter();
      const confFilter = filter['sportInfo.Baseball.conference'] as { $regex: string };
      expect(confFilter.$regex).toContain('\\+');
    });
  });
});
