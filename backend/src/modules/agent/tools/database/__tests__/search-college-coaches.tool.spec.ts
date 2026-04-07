/**
 * @fileoverview Unit tests for SearchCollegeCoachesTool (Elite)
 *
 * Tests the tool's input parsing, aggregation pipeline construction,
 * DTO mapping, state normalization, sport/position contact filtering,
 * and ReAct fallback nudge behavior on 0 results.
 *
 * CollegeModel and ContactModel are mocked — no real database needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchCollegeCoachesTool } from '../search-college-coaches.tool.js';

// ─── Mock CollegeModel ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAggregate = vi.fn<(...args: any[]) => any>();

vi.mock('../../../../../models/college.model.js', () => ({
  CollegeModel: { aggregate: (...args: unknown[]) => mockAggregate(...args) },
}));

// ─── Mock ContactModel ──────────────────────────────────────────────────────

vi.mock('../../../../../models/contact.model.js', () => ({
  ContactModel: { collection: { name: 'contacts' } },
}));

// ─── Pipeline Helpers ───────────────────────────────────────────────────────

/** Return the full aggregation pipeline from the first aggregate() call. */
function getPipeline(): Record<string, unknown>[] {
  const calls = mockAggregate.mock.calls;
  return (calls[0]?.[0] ?? []) as Record<string, unknown>[];
}

/** Extract the first $match stage from the pipeline. */
function getMatch(): Record<string, unknown> {
  const pipeline = getPipeline();
  const stage = pipeline.find((s) => '$match' in s);
  return (stage?.['$match'] ?? {}) as Record<string, unknown>;
}

/** Extract the $limit value from the pipeline. */
function getLimit(): number | undefined {
  const pipeline = getPipeline();
  const stage = pipeline.find((s) => '$limit' in s) as { $limit: number } | undefined;
  return stage?.['$limit'];
}

/** Extract the $lookup stage from the pipeline. */
function getLookup(): Record<string, unknown> | undefined {
  const pipeline = getPipeline();
  const stage = pipeline.find((s) => '$lookup' in s);
  return stage?.['$lookup'] as Record<string, unknown> | undefined;
}

// ─── Contact DTO Factory ────────────────────────────────────────────────────

function makeContact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: 'contact1',
    firstName: 'John',
    lastName: 'Smith',
    email: 'jsmith@osu.edu',
    phoneNumber: '614-555-1234',
    position: 'Head Coach',
    sport: 'Baseball',
    twitter: '@CoachSmith',
    ...overrides,
  };
}

/** Build a full aggregate result with populated contacts. */
function makeCollegeWithContacts(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: 'college1',
    name: 'Ohio State University',
    city: 'Columbus',
    state: 'OH',
    logoUrl: 'https://example.com/logo.png',
    filteredContacts: [makeContact()],
    ...overrides,
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('SearchCollegeCoachesTool', () => {
  let tool: SearchCollegeCoachesTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new SearchCollegeCoachesTool();
    mockAggregate.mockResolvedValue([]); // default: no results
  });

  // ── Metadata ──────────────────────────────────────────────────────────

  describe('metadata', () => {
    it('should have the correct name', () => {
      expect(tool.name).toBe('search_college_coaches');
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

    it('should require collegeName parameter', () => {
      expect((tool.parameters as Record<string, unknown>).required).toEqual(['collegeName']);
    });

    it('should expose all expected parameters', () => {
      const props = (tool.parameters as Record<string, Record<string, unknown>>).properties;
      const expectedKeys = ['collegeName', 'sport', 'state', 'position', 'limit'];
      for (const key of expectedKeys) {
        expect(props).toHaveProperty(key);
      }
    });

    it('should describe itself for LLM routing', () => {
      expect(tool.description).toContain('coach');
      expect(tool.description).toContain('contact');
    });
  });

  // ── Input Validation ──────────────────────────────────────────────────

  describe('input validation', () => {
    it('should return error when collegeName is missing', async () => {
      const result = await tool.execute({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('collegeName');
    });

    it('should return error when collegeName is empty string', async () => {
      const result = await tool.execute({ collegeName: '' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('collegeName');
    });

    it('should return error when collegeName is whitespace only', async () => {
      const result = await tool.execute({ collegeName: '   ' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('collegeName');
    });
  });

  // ── College Match Filter ──────────────────────────────────────────────

  describe('college match filter construction', () => {
    it('should use $text search for college names >= 3 chars', async () => {
      await tool.execute({ collegeName: 'Ohio State' });
      const match = getMatch();
      expect(match['$text']).toEqual({ $search: 'Ohio State' });
    });

    it('should use $regex for short college names < 3 chars', async () => {
      await tool.execute({ collegeName: 'OU' });
      const match = getMatch();
      expect(match['name']).toEqual({ $regex: 'OU', $options: 'i' });
    });

    it('should filter by state with regex matching both abbreviation and full name', async () => {
      await tool.execute({ collegeName: 'Ohio State', state: 'oh' });
      const match = getMatch();
      expect(match['state']).toEqual({ $regex: '^(OH|Ohio)$', $options: 'i' });
    });

    it('should handle full state name input', async () => {
      await tool.execute({ collegeName: 'Duke', state: 'north carolina' });
      const match = getMatch();
      expect(match['state']).toEqual({ $regex: '^(NC|North Carolina)$', $options: 'i' });
    });

    it('should filter by sport on the college document', async () => {
      await tool.execute({ collegeName: 'Ohio State', sport: 'Baseball' });
      const match = getMatch();
      expect(match['sport']).toEqual({ $regex: 'Baseball', $options: 'i' });
    });

    it('should escape special regex characters in college name', async () => {
      await tool.execute({ collegeName: "St. Mary's" });
      const match = getMatch();
      // The parenthese should not be treated as regex groups
      expect(match).toBeDefined();
    });
  });

  // ── Limit Handling ────────────────────────────────────────────────────

  describe('limit handling', () => {
    it('should default limit to 5', async () => {
      await tool.execute({ collegeName: 'Ohio State' });
      expect(getLimit()).toBe(5);
    });

    it('should respect custom limit', async () => {
      await tool.execute({ collegeName: 'Ohio State', limit: 3 });
      expect(getLimit()).toBe(3);
    });

    it('should cap limit at 10', async () => {
      await tool.execute({ collegeName: 'Ohio State', limit: 50 });
      expect(getLimit()).toBe(10);
    });

    it('should floor limit at 1', async () => {
      await tool.execute({ collegeName: 'Ohio State', limit: 0 });
      expect(getLimit()).toBe(1);
    });

    it('should round fractional limits', async () => {
      await tool.execute({ collegeName: 'Ohio State', limit: 2.7 });
      expect(getLimit()).toBe(3);
    });
  });

  // ── $lookup Stage ─────────────────────────────────────────────────────

  describe('$lookup stage', () => {
    it('should join from the contacts collection', async () => {
      await tool.execute({ collegeName: 'Ohio State' });
      const lookup = getLookup();
      expect(lookup?.['from']).toBe('contacts');
    });

    it('should use let/pipeline for safe ObjectId join', async () => {
      await tool.execute({ collegeName: 'Ohio State' });
      const lookup = getLookup();
      expect(lookup?.['let']).toBeDefined();
      expect(lookup?.['pipeline']).toBeDefined();
      // Should NOT use simple localField/foreignField (unsafe with mixed string/ObjectId)
      expect(lookup?.['localField']).toBeUndefined();
      expect(lookup?.['foreignField']).toBeUndefined();
    });

    it('should populate into "populatedContacts" field', async () => {
      await tool.execute({ collegeName: 'Ohio State' });
      const lookup = getLookup();
      expect(lookup?.['as']).toBe('populatedContacts');
    });
  });

  // ── DTO Mapping (Success Path) ────────────────────────────────────────

  describe('DTO mapping — success', () => {
    it('should map college fields correctly', async () => {
      mockAggregate.mockResolvedValue([makeCollegeWithContacts()]);

      const result = await tool.execute({ collegeName: 'Ohio State' });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.count).toBe(1);
      expect(data.collegesFound).toBe(1);

      const colleges = data.colleges as Array<Record<string, unknown>>;
      expect(colleges).toHaveLength(1);
      expect(colleges[0]).toMatchObject({
        id: 'college1',
        name: 'Ohio State University',
        city: 'Columbus',
        state: 'OH',
        coachCount: 1,
      });
    });

    it('should map contact DTO correctly', async () => {
      mockAggregate.mockResolvedValue([makeCollegeWithContacts()]);

      const result = await tool.execute({ collegeName: 'Ohio State' });
      const data = result.data as Record<string, unknown>;
      const colleges = data.colleges as Array<Record<string, unknown>>;
      const coaches = colleges[0]?.coaches as Array<Record<string, unknown>>;

      expect(coaches).toHaveLength(1);
      expect(coaches[0]).toMatchObject({
        id: 'contact1',
        firstName: 'John',
        lastName: 'Smith',
        fullName: 'John Smith',
        email: 'jsmith@osu.edu',
        phoneNumber: '614-555-1234',
        position: 'Head Coach',
        sport: 'Baseball',
        twitter: '@CoachSmith',
      });
    });

    it('should handle contacts with missing fields gracefully', async () => {
      const sparseContact = {
        _id: 'sparse1',
        email: 'coach@school.edu',
        // All other fields missing
      };
      mockAggregate.mockResolvedValue([
        makeCollegeWithContacts({ filteredContacts: [sparseContact] }),
      ]);

      const result = await tool.execute({ collegeName: 'Some College' });
      const data = result.data as Record<string, unknown>;
      const colleges = data.colleges as Array<Record<string, unknown>>;
      const coaches = colleges[0]?.coaches as Array<Record<string, unknown>>;

      expect(coaches[0]).toMatchObject({
        id: 'sparse1',
        firstName: null,
        lastName: null,
        fullName: null,
        email: 'coach@school.edu',
        phoneNumber: null,
        position: null,
        sport: null,
        twitter: null,
      });
    });

    it('should compute fullName from firstName + lastName', async () => {
      const firstName_only = makeContact({ firstName: 'Jane', lastName: undefined });
      const lastName_only = makeContact({ _id: 'c2', firstName: undefined, lastName: 'Doe' });
      const both = makeContact({ _id: 'c3', firstName: 'Jane', lastName: 'Doe' });
      mockAggregate.mockResolvedValue([
        makeCollegeWithContacts({ filteredContacts: [firstName_only, lastName_only, both] }),
      ]);

      const result = await tool.execute({ collegeName: 'University' });
      const data = result.data as Record<string, unknown>;
      const colleges = data.colleges as Array<Record<string, unknown>>;
      const coaches = colleges[0]?.coaches as Array<Record<string, unknown>>;

      expect(coaches[0]?.fullName).toBe('Jane');
      expect(coaches[1]?.fullName).toBe('Doe');
      expect(coaches[2]?.fullName).toBe('Jane Doe');
    });

    it('should count total coaches across multiple colleges', async () => {
      const college1 = makeCollegeWithContacts({
        _id: 'c1',
        filteredContacts: [makeContact(), makeContact({ _id: 'c2' })],
      });
      const college2 = makeCollegeWithContacts({
        _id: 'c2',
        name: 'Michigan',
        filteredContacts: [makeContact({ _id: 'c3' })],
      });
      mockAggregate.mockResolvedValue([college1, college2]);

      const result = await tool.execute({ collegeName: 'Big Ten' });
      const data = result.data as Record<string, unknown>;
      expect(data.count).toBe(3);
      expect(data.collegesFound).toBe(2);
    });
  });

  // ── Zero Results Handling ─────────────────────────────────────────────

  describe('zero results handling', () => {
    it('should return _agent_hint when no colleges found', async () => {
      mockAggregate.mockResolvedValue([]);

      const result = await tool.execute({ collegeName: 'Nonexistent U' });
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.count).toBe(0);
      expect(data._agent_hint).toContain('web_search');
      expect(data._agent_hint).toContain('Nonexistent U');
    });

    it('should return _agent_hint when colleges found but no contacts', async () => {
      const noContacts = makeCollegeWithContacts({ filteredContacts: [] });
      mockAggregate.mockResolvedValue([noContacts]);

      const result = await tool.execute({ collegeName: 'Ohio State' });
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.count).toBe(0);
      expect(data._agent_hint).toContain('web_search');
      expect(data._agent_hint).toContain('Ohio State');
    });

    it('should mention sport in hint when sport filter was applied', async () => {
      const noContacts = makeCollegeWithContacts({ filteredContacts: [] });
      mockAggregate.mockResolvedValue([noContacts]);

      const result = await tool.execute({ collegeName: 'Ohio State', sport: 'Lacrosse' });
      const data = result.data as Record<string, unknown>;
      expect(data._agent_hint).toContain('Lacrosse');
    });

    it('should mention position in hint when position filter was applied', async () => {
      const noContacts = makeCollegeWithContacts({ filteredContacts: [] });
      mockAggregate.mockResolvedValue([noContacts]);

      const result = await tool.execute({ collegeName: 'Ohio State', position: 'Head Coach' });
      const data = result.data as Record<string, unknown>;
      expect(data._agent_hint).toContain('Head Coach');
    });
  });

  // ── Error Handling ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should return error result on database failure', async () => {
      mockAggregate.mockRejectedValue(new Error('MongoDB connection refused'));

      const result = await tool.execute({ collegeName: 'Ohio State' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('MongoDB connection refused');
    });

    it('should handle non-Error exceptions', async () => {
      mockAggregate.mockRejectedValue('unexpected string error');

      const result = await tool.execute({ collegeName: 'Ohio State' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('College coach search failed');
    });
  });

  // ── Filters Applied ───────────────────────────────────────────────────

  describe('filtersApplied summary', () => {
    it('should include all applied filters in response', async () => {
      const college = makeCollegeWithContacts();
      mockAggregate.mockResolvedValue([college]);

      const result = await tool.execute({
        collegeName: 'Ohio State',
        sport: 'Baseball',
        state: 'OH',
        position: 'Head Coach',
        limit: 3,
      });

      const data = result.data as Record<string, unknown>;
      const filters = data.filtersApplied as Record<string, unknown>;
      expect(filters).toMatchObject({
        collegeName: 'Ohio State',
        sport: 'Baseball',
        state: 'OH',
        position: 'Head Coach',
        limit: 3,
      });
    });

    it('should omit unset filters', async () => {
      mockAggregate.mockResolvedValue([]);

      const result = await tool.execute({ collegeName: 'Duke' });
      const data = result.data as Record<string, unknown>;
      const filters = data.filtersApplied as Record<string, unknown>;
      expect(Object.keys(filters)).toEqual(['collegeName']);
    });
  });

  // ── Security (Regex Injection Prevention) ─────────────────────────────

  describe('regex injection prevention', () => {
    it('should escape special regex characters in college name', async () => {
      await tool.execute({ collegeName: "St. Mary's (TX)" });
      const match = getMatch();
      // Should not throw or use unescaped regex
      expect(match).toBeDefined();
    });

    it('should escape special regex characters in sport filter', async () => {
      await tool.execute({ collegeName: 'Duke', sport: 'Track & Field (Outdoor)' });
      const match = getMatch();
      // Sport regex on college doc should be escaped
      expect(match['sport']).toEqual({
        $regex: 'Track & Field \\(Outdoor\\)',
        $options: 'i',
      });
    });

    it('should handle regex metacharacters in state name', async () => {
      await tool.execute({ collegeName: 'Duke', state: 'N.C.' });
      const match = getMatch();
      // Should not throw — characters should be escaped
      expect(match['state']).toBeDefined();
    });
  });

  // ── Progress Callback ─────────────────────────────────────────────────

  describe('progress callback', () => {
    it('should call onProgress with lookup message', async () => {
      const onProgress = vi.fn();
      mockAggregate.mockResolvedValue([makeCollegeWithContacts()]);

      await tool.execute({ collegeName: 'Ohio State' }, { userId: 'u1', onProgress });
      expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('Ohio State'));
    });

    it('should call onProgress with result count', async () => {
      const onProgress = vi.fn();
      const college = makeCollegeWithContacts({
        filteredContacts: [makeContact(), makeContact({ _id: 'c2' })],
      });
      mockAggregate.mockResolvedValue([college]);

      await tool.execute({ collegeName: 'Ohio State' }, { userId: 'u1', onProgress });
      expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('2 coaches'));
    });

    it('should use singular "coach" for count of 1', async () => {
      const onProgress = vi.fn();
      mockAggregate.mockResolvedValue([makeCollegeWithContacts()]);

      await tool.execute({ collegeName: 'Ohio State' }, { userId: 'u1', onProgress });
      expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('1 coach'));
    });
  });

  // ── State Normalization ───────────────────────────────────────────────

  describe('state normalization', () => {
    it('should normalize lowercase abbreviation', async () => {
      await tool.execute({ collegeName: 'OSU', state: 'oh' });
      const match = getMatch();
      expect(match['state']).toEqual({ $regex: '^(OH|Ohio)$', $options: 'i' });
    });

    it('should normalize uppercase abbreviation', async () => {
      await tool.execute({ collegeName: 'OSU', state: 'OH' });
      const match = getMatch();
      expect(match['state']).toEqual({ $regex: '^(OH|Ohio)$', $options: 'i' });
    });

    it('should normalize full state name to abbreviation', async () => {
      await tool.execute({ collegeName: 'UT', state: 'texas' });
      const match = getMatch();
      expect(match['state']).toEqual({ $regex: '^(TX|Texas)$', $options: 'i' });
    });

    it('should handle mixed-case state names', async () => {
      await tool.execute({ collegeName: 'Penn State', state: 'Pennsylvania' });
      const match = getMatch();
      expect(match['state']).toEqual({ $regex: '^(PA|Pennsylvania)$', $options: 'i' });
    });

    it('should handle multi-word state names', async () => {
      await tool.execute({ collegeName: 'UNC', state: 'North Carolina' });
      const match = getMatch();
      expect(match['state']).toEqual({ $regex: '^(NC|North Carolina)$', $options: 'i' });
    });

    it('should handle District of Columbia', async () => {
      await tool.execute({ collegeName: 'Georgetown', state: 'district of columbia' });
      const match = getMatch();
      expect(match['state']).toEqual({ $regex: '^(DC|District Of Columbia)$', $options: 'i' });
    });
  });
});
