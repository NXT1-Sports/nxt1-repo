/**
 * @fileoverview Unit tests for SearchCollegesTool (Elite)
 *
 * Tests the tool's input parsing, aggregation pipeline construction,
 * DTO mapping (including deep sport-recruiting fields), division
 * normalization, and ReAct fallback nudge behavior.
 *
 * The CollegeModel is mocked — no real database connection needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchCollegesTool } from '../search-colleges.tool.js';

// ─── Mock CollegeModel ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAggregate = vi.fn<(...args: any[]) => any>();

vi.mock('../../../../../models/core/college.model.js', () => ({
  CollegeModel: { aggregate: (...args: unknown[]) => mockAggregate(...args) },
}));

// ─── Mock firebase-admin/firestore ──────────────────────────────────────────

const mockFirestoreGet = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({
        get: mockFirestoreGet,
      }),
    }),
  }),
}));

// ─── Mock context-builder ────────────────────────────────────────────────────

const mockResolvePrimarySport = vi.fn<(...args: unknown[]) => string>();
vi.mock('../../../memory/context-builder.js', () => ({
  resolvePrimarySport: (...args: unknown[]) => mockResolvePrimarySport(...args),
}));

// ─── Pipeline Helpers ───────────────────────────────────────────────────────

/** Return the full aggregation pipeline from the first aggregate() call. */
function getPipeline(): Record<string, unknown>[] {
  const calls = mockAggregate.mock.calls;
  return (calls[0]?.[0] ?? []) as Record<string, unknown>[];
}

/**
 * Extract the pre-match stage (the first $match stage, which filters scalar /
 * indexed fields before the sport Map is unwound).
 */
function getPreMatch(): Record<string, unknown> {
  const pipeline = getPipeline();
  // The post-sport match stage has `_matchedSport` in it — skip that one.
  const stage = pipeline.find(
    (s) => '$match' in s && !('_matchedSport' in (s['$match'] as Record<string, unknown>))
  );
  return (stage?.['$match'] ?? {}) as Record<string, unknown>;
}

/**
 * Extract the $and conditions array from the sport entry $filter.
 * Index 0 = sport-name equality, index 1+ = optional division/conference.
 */
function getSportConditions(): unknown[] {
  const pipeline = getPipeline();
  const addFieldsStage = pipeline.find((s) => '$addFields' in s) as
    | {
        $addFields: {
          _matchedSport: {
            $filter: { cond: { $and: unknown[] } };
          };
        };
      }
    | undefined;
  return addFieldsStage?.['$addFields']?._matchedSport?.$filter?.cond?.$and ?? [];
}

/** Return the $limit value from the pipeline. */
function getLimit(): number | undefined {
  const pipeline = getPipeline();
  const stage = pipeline.find((s) => '$limit' in s) as { $limit: number } | undefined;
  return stage?.['$limit'];
}

/**
 * Extract the regex string from an array-safe $cond condition.
 * The $cond structure is: [$isArray, arrayBranch, stringBranch].
 * The regex lives in the stringBranch's $regexMatch.
 */
function getRegexFromCondition(cond: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = cond as any;
  // Array-safe $cond: [isArrayCheck, arrayBranch, stringBranch]
  if (c?.$cond) {
    return c.$cond[2]?.$regexMatch?.regex ?? '';
  }
  // Legacy direct $regexMatch
  return c?.$regexMatch?.regex ?? '';
}

// ─── DTO Factory ────────────────────────────────────────────────────────────

/** Build a full aggregate result document (with _matchedSport). */
function makeCollegeDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: 'abc123',
    name: 'Ohio State University',
    city: 'Columbus',
    state: 'OH',
    averageGPA: 3.5,
    totalCost: 28000,
    acceptanceRate: 53,
    mathSAT: 650,
    readingSAT: 620,
    compositeACT: '28',
    majorsOffered: 'Engineering, Business, Nursing',
    undergradsNo: '46000',
    male: '51%',
    female: '49%',
    hbcu: false,
    public: true,
    community_college: false,
    women_only: false,
    religious_affiliation: null,
    logoUrl: 'https://example.com/logo.png',
    landingUrl: 'https://example.com',
    _matchedSport: [
      {
        k: 'Baseball',
        v: {
          division: 'NCAA Division I',
          conference: 'Big Ten',
          questionnaire: 'https://osu.edu/recruit/baseball',
          twitter: '@OhioStateBASE',
          camp: 'https://osu.edu/camps/baseball',
          sportLandingUrl: 'https://ohiostatebuckeyes.com/baseball',
        },
      },
    ],
    ...overrides,
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('SearchCollegesTool', () => {
  let tool: SearchCollegesTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new SearchCollegesTool();
    mockAggregate.mockResolvedValue([]); // default: no results
    mockFirestoreGet.mockResolvedValue({ exists: false }); // default: no user profile
    mockResolvePrimarySport.mockReturnValue('');
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
      const parsed = (
        tool.parameters as { safeParse: (input: Record<string, unknown>) => { success: boolean } }
      ).safeParse({ state: 'OH' });
      expect(parsed.success).toBe(false);
    });

    it('should expose all elite filter parameters', () => {
      const schema = tool.parameters as {
        safeParse: (input: Record<string, unknown>) => { success: boolean };
      };

      expect(schema.safeParse({ sport: 'Football' }).success).toBe(true);
      expect(
        schema.safeParse({
          sport: 'Football',
          state: 'TX',
          name: 'Rice',
          division: 'NCAA Division I',
          conference: 'AAC',
          maxGpa: 3.5,
          minAcceptanceRate: 20,
          maxAcceptanceRate: 90,
          maxMathSAT: 650,
          maxReadingSAT: 650,
          maxTuition: 40000,
          hbcu: false,
          publicOnly: true,
          communityCollege: false,
          womenOnly: false,
          religiousAffiliation: 'Catholic',
          majorsOffered: 'Engineering',
          limit: 5,
        }).success
      ).toBe(true);
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

  // ── Pre-filter Stage (scalar indexed fields) ──────────────────────────

  describe('pre-match filter construction', () => {
    it('should filter by state with regex matching both abbreviation and full name', async () => {
      await tool.execute({ sport: 'Baseball', state: 'oh' });
      expect(getPreMatch()['state']).toEqual({ $regex: '^(OH|Ohio)$', $options: 'i' });
    });

    it('should filter by maxGpa using $lte', async () => {
      await tool.execute({ sport: 'Baseball', maxGpa: 3.0 });
      expect(getPreMatch()['averageGPA']).toEqual({ $lte: 3.0 });
    });

    it('should filter by maxTuition using $lte', async () => {
      await tool.execute({ sport: 'Baseball', maxTuition: 30000 });
      expect(getPreMatch()['totalCost']).toEqual({ $lte: 30000 });
    });

    it('should filter by name using $text search', async () => {
      await tool.execute({ sport: 'Baseball', name: 'Ohio State' });
      expect(getPreMatch()['$text']).toEqual({ $search: 'Ohio State' });
    });

    it('should filter by HBCU flag', async () => {
      await tool.execute({ sport: 'Football', hbcu: true });
      expect(getPreMatch()['hbcu']).toBe(true);
    });

    it('should filter by public flag', async () => {
      await tool.execute({ sport: 'Football', publicOnly: true });
      expect(getPreMatch()['public']).toBe(true);
    });

    it('should filter by community college flag', async () => {
      await tool.execute({ sport: 'Baseball', communityCollege: true });
      expect(getPreMatch()['community_college']).toBe(true);
    });

    it('should filter by womenOnly flag', async () => {
      await tool.execute({ sport: 'Softball', womenOnly: true });
      expect(getPreMatch()['women_only']).toBe(true);
    });

    it('should not set womenOnly when false', async () => {
      await tool.execute({ sport: 'Softball', womenOnly: false });
      expect(getPreMatch()['women_only']).toBeUndefined();
    });

    it('should filter by minAcceptanceRate using $gte', async () => {
      await tool.execute({ sport: 'Basketball Mens', minAcceptanceRate: 50 });
      expect(getPreMatch()['acceptanceRate']).toEqual({ $gte: 50 });
    });

    it('should filter by maxAcceptanceRate using $lte', async () => {
      await tool.execute({ sport: 'Basketball Mens', maxAcceptanceRate: 30 });
      expect(getPreMatch()['acceptanceRate']).toEqual({ $lte: 30 });
    });

    it('should combine min and max acceptance rate into a single range query', async () => {
      await tool.execute({
        sport: 'Basketball Mens',
        minAcceptanceRate: 20,
        maxAcceptanceRate: 60,
      });
      expect(getPreMatch()['acceptanceRate']).toEqual({ $gte: 20, $lte: 60 });
    });

    it('should filter by maxMathSAT using $lte', async () => {
      await tool.execute({ sport: 'Baseball', maxMathSAT: 600 });
      expect(getPreMatch()['mathSAT']).toEqual({ $lte: 600 });
    });

    it('should filter by maxReadingSAT using $lte', async () => {
      await tool.execute({ sport: 'Baseball', maxReadingSAT: 550 });
      expect(getPreMatch()['readingSAT']).toEqual({ $lte: 550 });
    });

    it('should filter by religiousAffiliation using regex (case-insensitive)', async () => {
      await tool.execute({ sport: 'Baseball', religiousAffiliation: 'Catholic' });
      expect(getPreMatch()['religious_affiliation']).toEqual(
        expect.objectContaining({ $regex: 'Catholic', $options: 'i' })
      );
    });

    it('should filter by majorsOffered using regex (case-insensitive)', async () => {
      await tool.execute({ sport: 'Baseball', majorsOffered: 'Nursing' });
      expect(getPreMatch()['majorsOffered']).toEqual(
        expect.objectContaining({ $regex: 'Nursing', $options: 'i' })
      );
    });

    it('should combine all pre-match filters together', async () => {
      await tool.execute({
        sport: 'Football',
        state: 'TX',
        maxGpa: 3.5,
        minAcceptanceRate: 30,
        maxAcceptanceRate: 80,
        maxMathSAT: 650,
        maxReadingSAT: 600,
        maxTuition: 40000,
        hbcu: true,
        publicOnly: true,
        womenOnly: true,
        religiousAffiliation: 'Baptist',
        majorsOffered: 'Engineering',
      });

      const pm = getPreMatch();
      expect(pm['state']).toEqual({ $regex: '^(TX|Texas)$', $options: 'i' });
      expect(pm['averageGPA']).toEqual({ $lte: 3.5 });
      expect(pm['acceptanceRate']).toEqual({ $gte: 30, $lte: 80 });
      expect(pm['mathSAT']).toEqual({ $lte: 650 });
      expect(pm['readingSAT']).toEqual({ $lte: 600 });
      expect(pm['totalCost']).toEqual({ $lte: 40000 });
      expect(pm['hbcu']).toBe(true);
      expect(pm['public']).toBe(true);
      expect(pm['women_only']).toBe(true);
      expect(pm['religious_affiliation']).toEqual(
        expect.objectContaining({ $regex: 'Baptist', $options: 'i' })
      );
      expect(pm['majorsOffered']).toEqual(
        expect.objectContaining({ $regex: 'Engineering', $options: 'i' })
      );
    });

    it('should omit the pre-match stage when only sport is provided', async () => {
      await tool.execute({ sport: 'Baseball' });
      // No pre-match stage should be present (sport-only query uses only addFields)
      const pipeline = getPipeline();
      const matchStage = pipeline.find(
        (s) => '$match' in s && !('_matchedSport' in (s['$match'] as Record<string, unknown>))
      );
      expect(matchStage).toBeUndefined();
    });
  });

  // ── Sport & Division Conditions (addFields stage) ─────────────────────

  describe('sport and division conditions', () => {
    it('should add case-insensitive sport name condition as first $and entry', async () => {
      await tool.execute({ sport: 'Football' });
      const conds = getSportConditions();
      expect(conds[0]).toEqual({ $eq: [{ $toLower: '$$si.k' }, 'football'] });
    });

    it('should be case-insensitive: "FOOTBALL" lowercased to "football"', async () => {
      await tool.execute({ sport: 'FOOTBALL' });
      const conds = getSportConditions();
      expect(conds[0]).toEqual({ $eq: [{ $toLower: '$$si.k' }, 'football'] });
    });

    it('should add division condition as second $and entry when provided', async () => {
      await tool.execute({ sport: 'Football', division: 'NCAA Division I' });
      const conds = getSportConditions();
      expect(conds.length).toBeGreaterThanOrEqual(2);
      expect(getRegexFromCondition(conds[1])).toContain('Division I');
    });

    it('should add conference condition when provided', async () => {
      await tool.execute({ sport: 'Football', conference: 'SEC' });
      const conds = getSportConditions();
      expect(conds.length).toBeGreaterThanOrEqual(2);
      expect(getRegexFromCondition(conds[1])).toContain('SEC');
    });

    it('should include both division and conference conditions when both provided', async () => {
      await tool.execute({ sport: 'Football', division: 'NCAA Division I', conference: 'SEC' });
      const conds = getSportConditions();
      // sport + division + conference = 3 conditions
      expect(conds.length).toBe(3);
    });
  });

  // ── Division Normalization ────────────────────────────────────────────

  describe('division normalization', () => {
    it('should map Football "Division 1" to FBS/FCS-inclusive regex', async () => {
      await tool.execute({ sport: 'Football', division: 'Division 1' });
      const conds = getSportConditions();
      const regex = getRegexFromCondition(conds[1]);
      expect(regex).toContain('FBS');
      expect(regex).toContain('FCS');
    });

    it('should map Football "NCAA Division 1" to FBS/FCS-inclusive regex', async () => {
      await tool.execute({ sport: 'Football', division: 'NCAA Division 1' });
      const conds = getSportConditions();
      const regex = getRegexFromCondition(conds[1]);
      expect(regex).toContain('FBS');
      expect(regex).toContain('FCS');
    });

    it('should map non-Football "Division 2" to D2 alias regex', async () => {
      await tool.execute({ sport: 'Baseball', division: 'Division 2' });
      const conds = getSportConditions();
      const regex = getRegexFromCondition(conds[1]);
      expect(regex).toContain('NCAA DII');
      expect(regex).toContain('D2');
      expect(regex).not.toContain('FBS');
    });

    it('should map non-Football "Division 3" to D3 alias regex', async () => {
      await tool.execute({ sport: 'Soccer Mens', division: 'Division 3' });
      const conds = getSportConditions();
      const regex = getRegexFromCondition(conds[1]);
      expect(regex).toContain('NCAA DIII');
      expect(regex).toContain('D3');
    });

    it('should map Football "D1" to FBS/FCS-inclusive regex', async () => {
      await tool.execute({ sport: 'Football', division: 'D1' });
      const conds = getSportConditions();
      const regex = getRegexFromCondition(conds[1]);
      expect(regex).toContain('FBS');
      expect(regex).toContain('FCS');
    });

    it('should map non-Football "D2" to D2 alias regex', async () => {
      await tool.execute({ sport: 'Baseball', division: 'D2' });
      const conds = getSportConditions();
      const regex = getRegexFromCondition(conds[1]);
      expect(regex).toContain('NCAA DII');
      expect(regex).toContain('D2');
    });

    it('should map Football "NCAA Division I" to FBS/FCS-inclusive regex', async () => {
      await tool.execute({ sport: 'Football', division: 'NCAA Division I' });
      const conds = getSportConditions();
      const regex = getRegexFromCondition(conds[1]);
      expect(regex).toContain('FBS');
      expect(regex).toContain('FCS');
    });

    it('should map "NAIA" to anchored NAIA regex', async () => {
      await tool.execute({ sport: 'Baseball', division: 'NAIA' });
      const conds = getSportConditions();
      const regex = getRegexFromCondition(conds[1]);
      expect(regex).toContain('NAIA');
    });

    it('should map non-Football "Division 1" to D1 alias regex WITHOUT FBS/FCS', async () => {
      await tool.execute({ sport: 'Baseball', division: 'Division 1' });
      const conds = getSportConditions();
      const regex = getRegexFromCondition(conds[1]);
      expect(regex).toContain('NCAA D1');
      expect(regex).toContain('Division I');
      expect(regex).not.toContain('FBS');
      expect(regex).not.toContain('FCS');
    });

    it('should map "FBS" directly to anchored FBS regex', async () => {
      await tool.execute({ sport: 'Football', division: 'FBS' });
      const conds = getSportConditions();
      const regex = getRegexFromCondition(conds[1]);
      expect(regex).toContain('FBS');
      expect(regex).not.toContain('FCS');
    });

    it('should map "FCS" directly to anchored FCS regex', async () => {
      await tool.execute({ sport: 'Football', division: 'FCS' });
      const conds = getSportConditions();
      const regex = getRegexFromCondition(conds[1]);
      expect(regex).toContain('FCS');
      expect(regex).not.toContain('FBS');
    });

    it('should map "JUCO" to JC-inclusive regex', async () => {
      await tool.execute({ sport: 'Baseball', division: 'JUCO' });
      const conds = getSportConditions();
      const regex = getRegexFromCondition(conds[1]);
      expect(regex).toContain('JC');
      expect(regex).toContain('JUCO');
    });
  });

  // ── Limit Enforcement ─────────────────────────────────────────────────

  describe('limit enforcement', () => {
    it('should default to 10 results', async () => {
      await tool.execute({ sport: 'Baseball' });
      expect(getLimit()).toBe(10);
    });

    it('should respect user-specified limit', async () => {
      await tool.execute({ sport: 'Baseball', limit: 5 });
      expect(getLimit()).toBe(5);
    });

    it('should cap limit at 25', async () => {
      await tool.execute({ sport: 'Baseball', limit: 100 });
      expect(getLimit()).toBe(25);
    });

    it('should enforce minimum limit of 1', async () => {
      await tool.execute({ sport: 'Baseball', limit: -5 });
      expect(getLimit()).toBe(1);
    });
  });

  // ── DTO Mapping (Full Elite) ──────────────────────────────────────────

  describe('DTO mapping', () => {
    it('should map aggregate documents to full elite DTOs', async () => {
      mockAggregate.mockResolvedValue([makeCollegeDoc()]);

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
        questionnaire: 'https://osu.edu/recruit/baseball',
        twitter: '@OhioStateBASE',
        camp: 'https://osu.edu/camps/baseball',
        sportLandingUrl: 'https://ohiostatebuckeyes.com/baseball',
        averageGPA: 3.5,
        acceptanceRate: 53,
        mathSAT: 650,
        readingSAT: 620,
        compositeACT: '28',
        majorsOffered: 'Engineering, Business, Nursing',
        totalCost: 28000,
        undergradsNo: '46000',
        male: '51%',
        female: '49%',
        hbcu: false,
        public: true,
        communityCollege: false,
        womenOnly: false,
        religiousAffiliation: null,
        logoUrl: 'https://example.com/logo.png',
        landingUrl: 'https://example.com',
      });
    });

    it('should handle empty _matchedSport gracefully', async () => {
      mockAggregate.mockResolvedValue([
        {
          _id: 'def456',
          name: 'Small College',
          city: 'Somewhere',
          state: 'TX',
          _matchedSport: [],
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
      expect(colleges[0].questionnaire).toBeNull();
      expect(colleges[0].twitter).toBeNull();
      expect(colleges[0].camp).toBeNull();
      expect(colleges[0].sportLandingUrl).toBeNull();
    });

    it('should handle null numeric fields', async () => {
      mockAggregate.mockResolvedValue([
        {
          _id: 'ghi789',
          name: 'No Stats College',
          city: 'Nowhere',
          state: 'CA',
          _matchedSport: [{ k: 'Baseball', v: { division: 'NAIA' } }],
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
      expect(colleges[0].mathSAT).toBeNull();
      expect(colleges[0].readingSAT).toBeNull();
      expect(colleges[0].compositeACT).toBeNull();
      expect(colleges[0].majorsOffered).toBeNull();
      expect(colleges[0].undergradsNo).toBeNull();
      expect(colleges[0].male).toBeNull();
      expect(colleges[0].female).toBeNull();
      expect(colleges[0].religiousAffiliation).toBeNull();
    });

    it('should default boolean fields to false when missing', async () => {
      mockAggregate.mockResolvedValue([
        {
          _id: 'bool01',
          name: 'Flagless College',
          city: 'City',
          state: 'FL',
          _matchedSport: [{ k: 'Soccer', v: {} }],
        },
      ]);

      const result = await tool.execute({ sport: 'Soccer Mens' });

      const colleges = (result.data as Record<string, unknown>).colleges as Record<
        string,
        unknown
      >[];
      expect(colleges[0].hbcu).toBe(false);
      expect(colleges[0].public).toBe(false);
      expect(colleges[0].communityCollege).toBe(false);
      expect(colleges[0].womenOnly).toBe(false);
    });

    it('should return multiple colleges', async () => {
      mockAggregate.mockResolvedValue([
        makeCollegeDoc({ _id: '1', name: 'School A' }),
        makeCollegeDoc({ _id: '2', name: 'School B' }),
        makeCollegeDoc({ _id: '3', name: 'School C' }),
      ]);

      const result = await tool.execute({ sport: 'Baseball' });

      const data = result.data as Record<string, unknown>;
      expect(data.count).toBe(3);
      expect((data.colleges as unknown[]).length).toBe(3);
    });
  });

  // ── ReAct Fallback Nudge ──────────────────────────────────────────────

  describe('ReAct fallback nudge', () => {
    it('should include _agent_hint when 0 results are found', async () => {
      mockAggregate.mockResolvedValue([]);

      const result = await tool.execute({ sport: 'Baseball', state: 'OH' });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.count).toBe(0);
      expect(data.colleges).toEqual([]);
      expect(data._agent_hint).toBeDefined();
      expect(data._agent_hint as string).toContain('web_search');
    });

    it('should include filtersApplied in empty result for debugging', async () => {
      mockAggregate.mockResolvedValue([]);

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

    it('should include elite filters in filtersApplied summary', async () => {
      mockAggregate.mockResolvedValue([]);

      const result = await tool.execute({
        sport: 'Football',
        maxMathSAT: 600,
        minAcceptanceRate: 40,
        majorsOffered: 'Nursing',
        religiousAffiliation: 'Catholic',
        womenOnly: true,
      });

      const data = result.data as Record<string, unknown>;
      const filters = data.filtersApplied as Record<string, unknown>;
      expect(filters.maxMathSAT).toBe(600);
      expect(filters.minAcceptanceRate).toBe(40);
      expect(filters.majorsOffered).toBe('Nursing');
      expect(filters.religiousAffiliation).toBe('Catholic');
      expect(filters.womenOnly).toBe(true);
    });

    it('should NOT include _agent_hint when results are found', async () => {
      mockAggregate.mockResolvedValue([makeCollegeDoc()]);

      const result = await tool.execute({ sport: 'Baseball' });

      const data = result.data as Record<string, unknown>;
      expect(data._agent_hint).toBeUndefined();
    });
  });

  // ── Error Handling ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should return error result on database failure', async () => {
      mockAggregate.mockRejectedValue(new Error('Connection refused'));

      const result = await tool.execute({ sport: 'Baseball' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection refused');
    });

    it('should handle non-Error thrown objects', async () => {
      mockAggregate.mockRejectedValue('unexpected string error');

      const result = await tool.execute({ sport: 'Baseball' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('College search failed');
    });
  });

  // ── Regex Injection Prevention ────────────────────────────────────────

  describe('regex injection prevention', () => {
    it('should escape special regex characters in division', async () => {
      await tool.execute({ sport: 'Baseball', division: 'NCAA (D2)' });
      const conds = getSportConditions();
      const regex = getRegexFromCondition(conds[1]);
      // Parentheses should be escaped (after normalization, "D2" → "DII")
      expect(regex).toContain('\\(');
      expect(regex).toContain('\\)');
    });

    it('should escape special regex characters in conference', async () => {
      await tool.execute({ sport: 'Baseball', conference: 'Big 10+' });
      const conds = getSportConditions();
      const regex = getRegexFromCondition(conds[1]);
      expect(regex).toContain('\\+');
    });

    it('should escape special regex characters in religiousAffiliation', async () => {
      await tool.execute({ sport: 'Baseball', religiousAffiliation: 'Seventh-Day (Adventist)' });
      const pm = getPreMatch();
      const relFilter = pm['religious_affiliation'] as { $regex: string };
      expect(relFilter.$regex).toContain('\\(');
      expect(relFilter.$regex).toContain('\\)');
    });

    it('should escape special regex characters in majorsOffered', async () => {
      await tool.execute({ sport: 'Baseball', majorsOffered: 'C++ Programming' });
      const pm = getPreMatch();
      const majorFilter = pm['majorsOffered'] as { $regex: string };
      expect(majorFilter.$regex).toContain('\\+\\+');
    });
  });

  // ── State Normalization ───────────────────────────────────────────────

  describe('state normalization', () => {
    it('should normalize full state name "Ohio" to regex matching abbreviation and name', async () => {
      await tool.execute({ sport: 'Baseball', state: 'Ohio' });
      expect(getPreMatch()['state']).toEqual({ $regex: '^(OH|Ohio)$', $options: 'i' });
    });

    it('should normalize "California" to regex matching "CA" and "California"', async () => {
      await tool.execute({ sport: 'Baseball', state: 'California' });
      expect(getPreMatch()['state']).toEqual({ $regex: '^(CA|California)$', $options: 'i' });
    });

    it('should normalize "New York" to regex matching "NY" and "New York"', async () => {
      await tool.execute({ sport: 'Baseball', state: 'New York' });
      expect(getPreMatch()['state']).toEqual({ $regex: '^(NY|New York)$', $options: 'i' });
    });

    it('should normalize 2-letter abbreviation "tx" to regex matching "TX" and "Texas"', async () => {
      await tool.execute({ sport: 'Baseball', state: 'tx' });
      expect(getPreMatch()['state']).toEqual({ $regex: '^(TX|Texas)$', $options: 'i' });
    });

    it('should handle mixed-case full names like "OHIO"', async () => {
      await tool.execute({ sport: 'Baseball', state: 'OHIO' });
      expect(getPreMatch()['state']).toEqual({ $regex: '^(OH|Ohio)$', $options: 'i' });
    });
  });

  // ── Sport Normalization ───────────────────────────────────────────────

  describe('sport normalization', () => {
    it('should normalize "Women\'s Basketball" to "Basketball Womens"', async () => {
      await tool.execute({ sport: "Women's Basketball" });
      const conds = getSportConditions();
      expect(conds[0]).toEqual({ $eq: [{ $toLower: '$$si.k' }, 'basketball womens'] });
    });

    it('should normalize "Mens Soccer" to "Soccer Mens"', async () => {
      await tool.execute({ sport: 'Mens Soccer' });
      const conds = getSportConditions();
      expect(conds[0]).toEqual({ $eq: [{ $toLower: '$$si.k' }, 'soccer mens'] });
    });

    it('should normalize "Womens Basketball" to "Basketball Womens"', async () => {
      await tool.execute({ sport: 'Womens Basketball' });
      const conds = getSportConditions();
      expect(conds[0]).toEqual({ $eq: [{ $toLower: '$$si.k' }, 'basketball womens'] });
    });

    it('should normalize "Track and Field Mens" to "Track & Field Mens"', async () => {
      await tool.execute({ sport: 'Track and Field Mens' });
      const conds = getSportConditions();
      expect(conds[0]).toEqual({ $eq: [{ $toLower: '$$si.k' }, 'track & field mens'] });
    });

    it('should resolve "Women\'s Swimming" to "Swimming & Diving Womens"', async () => {
      await tool.execute({ sport: "Women's Swimming" });
      const conds = getSportConditions();
      expect(conds[0]).toEqual({
        $eq: [{ $toLower: '$$si.k' }, 'swimming & diving womens'],
      });
    });

    it('should resolve "Bowling" to "Bowling Womens" (single-gender default)', async () => {
      await tool.execute({ sport: 'Bowling' });
      const conds = getSportConditions();
      expect(conds[0]).toEqual({ $eq: [{ $toLower: '$$si.k' }, 'bowling womens'] });
    });

    it('should resolve exact DB keys case-insensitively', async () => {
      await tool.execute({ sport: 'basketball mens' });
      const conds = getSportConditions();
      expect(conds[0]).toEqual({ $eq: [{ $toLower: '$$si.k' }, 'basketball mens'] });
    });
  });

  // ── Gender-split Sport Inference ──────────────────────────────────────

  describe('gender-split sport inference', () => {
    it('should infer gender from user profile when sport is underspecified', async () => {
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        data: () => ({ sport: 'Basketball Womens' }),
      });
      mockResolvePrimarySport.mockReturnValue('Basketball Womens');

      const result = await tool.execute({ sport: 'Basketball' }, { userId: 'user123' });

      // Should not return the gender-split hint — should resolve to Basketball Womens
      const data = result.data as Record<string, unknown>;
      expect(data._agent_hint).not.toContain('gender-split');
    });

    it('should return gender-split hint when no user context is available', async () => {
      const result = await tool.execute({ sport: 'Basketball' });

      const data = result.data as Record<string, unknown>;
      expect(data._agent_hint).toContain('gender-split');
      expect(data._agent_hint).toContain('Basketball Mens');
      expect(data._agent_hint).toContain('Basketball Womens');
    });

    it('should return gender-split hint when user profile has different sport', async () => {
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        data: () => ({ sport: 'Football' }),
      });
      mockResolvePrimarySport.mockReturnValue('Football');

      const result = await tool.execute({ sport: 'Basketball' }, { userId: 'user123' });

      const data = result.data as Record<string, unknown>;
      expect(data._agent_hint).toContain('gender-split');
    });
  });

  // ── Conference Normalization ──────────────────────────────────────────

  describe('conference normalization', () => {
    it('should normalize "Big 10" to "Big Ten"', async () => {
      await tool.execute({ sport: 'Football', conference: 'Big 10' });
      const conds = getSportConditions();
      expect(getRegexFromCondition(conds[1])).toContain('Big Ten');
    });

    it('should normalize "Pac 12" to "Pac-12"', async () => {
      await tool.execute({ sport: 'Football', conference: 'Pac 12' });
      const conds = getSportConditions();
      expect(getRegexFromCondition(conds[1])).toContain('Pac-12');
    });

    it('should leave "SEC" unchanged', async () => {
      await tool.execute({ sport: 'Football', conference: 'SEC' });
      const conds = getSportConditions();
      expect(getRegexFromCondition(conds[1])).toBe('SEC');
    });
  });

  // ── Numeric String Sanitization ───────────────────────────────────────

  describe('numeric string sanitization', () => {
    it('should sanitize "$40,000" string to number for maxTuition', async () => {
      await tool.execute({ sport: 'Baseball', maxTuition: '$40,000' as unknown as number });
      expect(getPreMatch()['totalCost']).toEqual({ $lte: 40000 });
    });

    it('should sanitize "3.5 GPA" string to number for maxGpa', async () => {
      await tool.execute({ sport: 'Baseball', maxGpa: '3.5 GPA' as unknown as number });
      expect(getPreMatch()['averageGPA']).toEqual({ $lte: 3.5 });
    });

    it('should sanitize "60%" string to number for maxAcceptanceRate', async () => {
      await tool.execute({ sport: 'Baseball', maxAcceptanceRate: '60%' as unknown as number });
      expect(getPreMatch()['acceptanceRate']).toEqual({ $lte: 60 });
    });
  });

  // ── Retry Logic ───────────────────────────────────────────────────────

  describe('retry logic', () => {
    it('should retry without academic filters when first attempt returns 0', async () => {
      // First call: empty (full filters). Second call: results (relaxed).
      mockAggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([makeCollegeDoc()]);
      const result = await tool.execute({
        sport: 'Baseball',
        state: 'OH',
        maxGpa: 3.0,
        religiousAffiliation: 'Catholic',
      });
      const data = result.data as Record<string, unknown>;
      expect(data.count).toBe(1);
      expect(data.filtersRelaxed).toBeDefined();
      expect((data.filtersRelaxed as string[]).length).toBe(1);
    });

    it('should NOT retry when there are no droppable filters', async () => {
      mockAggregate.mockResolvedValue([]);

      const result = await tool.execute({ sport: 'Baseball', state: 'OH' });

      // Only one aggregate call (no retries — no academic/extended filters to drop)
      expect(mockAggregate).toHaveBeenCalledTimes(1);
      const data = result.data as Record<string, unknown>;
      expect(data.count).toBe(0);
    });

    it('should never drop core filters (sport, state, division, conference)', async () => {
      mockAggregate.mockResolvedValue([]);

      await tool.execute({
        sport: 'Baseball',
        state: 'OH',
        division: 'NCAA Division II',
        conference: 'SEC',
        maxGpa: 3.0,
      });

      // Second call should still have state in pre-match
      const calls = mockAggregate.mock.calls;
      if (calls.length > 1) {
        const retryPipeline = calls[1][0] as Record<string, unknown>[];
        const retryMatch = retryPipeline.find(
          (s) => '$match' in s && !('_matchedSport' in (s['$match'] as Record<string, unknown>))
        );
        if (retryMatch) {
          const match = retryMatch['$match'] as Record<string, unknown>;
          expect(match['state']).toEqual({ $regex: '^(OH|Ohio)$', $options: 'i' });
        }
      }
    });

    it('should include _agent_hint noting relaxed filters when retry succeeds', async () => {
      mockAggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([makeCollegeDoc()]);

      const result = await tool.execute({
        sport: 'Baseball',
        maxGpa: 3.0,
      });

      const data = result.data as Record<string, unknown>;
      expect(data._agent_hint).toContain('relaxed');
    });

    it('should include relaxed info in empty-result hint after all retries', async () => {
      mockAggregate.mockResolvedValue([]);

      const result = await tool.execute({
        sport: 'Baseball',
        maxGpa: 3.0,
        religiousAffiliation: 'Catholic',
      });

      const data = result.data as Record<string, unknown>;
      expect(data._agent_hint).toContain('Filters relaxed');
      expect(data._agent_hint).toContain('web_search');
    });
  });
});
