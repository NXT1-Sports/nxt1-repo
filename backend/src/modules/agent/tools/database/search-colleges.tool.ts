/**
 * @fileoverview Search Colleges Tool — MongoDB College Program Query (Elite)
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Enables Agent X to search the NXT1 college database for programs matching
 * a comprehensive set of academic, demographic, and sport-recruiting criteria.
 *
 * Architecture:
 * - Reads from the MongoDB `College` collection via Mongoose.
 * - Returns a distilled DTO (not raw Mongoose documents) to protect the
 *   LLM's context window from token bloat.
 * - Hard-caps results at 25 to prevent context overflow.
 * - Includes a ReAct fallback nudge: when 0 results are found, the tool
 *   response explicitly instructs the agent to pivot to `web_search`.
 *
 * Indexes leveraged:
 * - `{ sport: 1, state: 1 }` — compound index for the primary query path
 * - `{ state: 1, acceptanceRate: 1 }` — compound for state + acceptance filtering
 * - `{ name: 'text' }` — full-text search on college name
 *
 * Supported filters:
 * - Core:         sport (required), state, name (full-text), division, conference
 * - Academics:    maxGpa, minAcceptanceRate, maxAcceptanceRate, maxMathSAT, maxReadingSAT
 * - Financials:   maxTuition
 * - Demographics: hbcu, publicOnly, communityCollege, womenOnly, religiousAffiliation
 * - Recruiting:   majorsOffered (partial match)
 *
 * DTO exposes deep sport-recruiting fields:
 * - questionnaire, twitter, camp, sportLandingUrl (from sportInfo sub-document)
 * - mathSAT, readingSAT, compositeACT, majorsOffered, undergradsNo, womenOnly,
 *   religiousAffiliation, male/female demographic percentages
 *
 * Security:
 * - Read-only (isMutation = false).
 * - All agents can invoke this tool.
 * - Input strings are sanitized to prevent regex injection.
 */

import { BaseTool, type ToolResult } from '../base.tool.js';
import { CollegeModel } from '../../../../models/college.model.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Hard ceiling on results to protect the LLM context window. */
const MAX_RESULTS = 25;

/** Default number of results when the LLM doesn't specify. */
const DEFAULT_LIMIT = 10;

// ─── Tool Definition ────────────────────────────────────────────────────────

export class SearchCollegesTool extends BaseTool {
  readonly name = 'search_colleges';

  readonly description =
    'Search the NXT1 database for college sports programs matching specific criteria. ' +
    'Use this when the user asks about colleges, universities, schools, or athletic programs. ' +
    'You MUST provide at least the sport. You can filter by location, academics (GPA, SAT, ' +
    'acceptance rate), financials (tuition), demographics (HBCU, public, women-only, ' +
    'community college, religious affiliation), majors, and recruiting data (division, ' +
    'conference). Results include deep sport-recruiting info: questionnaire links, camp ' +
    'info, team Twitter, and sport landing URLs. ' +
    'If 0 results are returned, pivot to the web_search tool to find the information online.';

  readonly parameters = {
    type: 'object',
    properties: {
      // ── Core Filters ────────────────────────────────────────────────
      sport: {
        type: 'string',
        description:
          'The sport to search for. Use the display name exactly as stored ' +
          '(e.g., "Baseball", "Football", "Basketball", "Soccer", "Softball", ' +
          '"Track & Field", "Volleyball", "Wrestling", "Swimming", "Lacrosse", "Golf", "Tennis").',
      },
      state: {
        type: 'string',
        description:
          'Two-letter US state abbreviation (e.g., "OH", "CA", "TX", "FL"). ' +
          'Omit to search all states.',
      },
      name: {
        type: 'string',
        description: 'Search for a college by name (e.g., "Ohio State", "Duke"). Uses text search.',
      },
      division: {
        type: 'string',
        description:
          'Competition division filter. Common values: "NCAA Division I", "NCAA Division II", ' +
          '"NCAA Division III", "NAIA", "NJCAA", "CCCAA". Partial matches are supported. ' +
          'You may also use shorthand like "Division 1", "D1", "D2", "D3" — these are ' +
          'automatically normalized. Always prefer "NCAA Division I" over "Division 1".',
      },
      conference: {
        type: 'string',
        description:
          'Conference name filter (e.g., "SEC", "Big Ten", "ACC", "Pac-12"). Partial matches supported.',
      },

      // ── Academic Filters ────────────────────────────────────────────
      maxGpa: {
        type: 'number',
        description:
          'Maximum average GPA requirement. Returns schools with averageGPA ≤ this value. ' +
          'For example, 3.0 returns schools that accept students with a 3.0 GPA or below.',
      },
      minAcceptanceRate: {
        type: 'number',
        description:
          'Minimum acceptance rate (0–100). Returns schools with acceptanceRate ≥ this value. ' +
          'For example, 50 returns schools that accept at least 50% of applicants.',
      },
      maxAcceptanceRate: {
        type: 'number',
        description:
          'Maximum acceptance rate (0–100). Returns schools with acceptanceRate ≤ this value. ' +
          'For example, 30 returns highly selective schools.',
      },
      maxMathSAT: {
        type: 'number',
        description:
          'Maximum Math SAT score (200–800). Returns schools whose mathSAT ≤ this value. ' +
          'Useful for finding schools that accept students at a given SAT level.',
      },
      maxReadingSAT: {
        type: 'number',
        description:
          'Maximum Reading SAT score (200–800). Returns schools whose readingSAT ≤ this value.',
      },

      // ── Financial Filters ───────────────────────────────────────────
      maxTuition: {
        type: 'number',
        description:
          'Maximum total cost (tuition) in USD. Returns schools with totalCost ≤ this value.',
      },

      // ── Demographic & Institutional Filters ─────────────────────────
      hbcu: {
        type: 'boolean',
        description:
          'Set to true to filter only HBCUs (Historically Black Colleges and Universities).',
      },
      publicOnly: {
        type: 'boolean',
        description: 'Set to true to filter only public institutions.',
      },
      communityCollege: {
        type: 'boolean',
        description: 'Set to true to filter only community/junior colleges.',
      },
      womenOnly: {
        type: 'boolean',
        description: 'Set to true to filter only women-only institutions.',
      },
      religiousAffiliation: {
        type: 'string',
        description:
          'Filter by religious affiliation (e.g., "Catholic", "Baptist", "Methodist"). ' +
          'Partial matches are supported.',
      },
      majorsOffered: {
        type: 'string',
        description:
          'Search for colleges offering a specific major or program (e.g., "Nursing", ' +
          '"Engineering", "Business"). Partial matches are supported.',
      },

      // ── Pagination ──────────────────────────────────────────────────
      limit: {
        type: 'number',
        description: `Number of results to return (1–${MAX_RESULTS}). Defaults to ${DEFAULT_LIMIT}.`,
      },
    },
    required: ['sport'],
  } as const;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'database' as const;

  // ─── Execute ────────────────────────────────────────────────────────

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    // ── 1. Parse & validate input ──────────────────────────────────────
    const sport = this.str(input, 'sport');
    if (!sport) {
      return this.paramError('sport');
    }

    const state = this.str(input, 'state');
    const division = this.str(input, 'division');
    const conference = this.str(input, 'conference');
    const maxGpa = this.num(input, 'maxGpa');
    const maxTuition = this.num(input, 'maxTuition');
    const name = this.str(input, 'name');
    const rawLimit = this.num(input, 'limit') ?? DEFAULT_LIMIT;
    const limit = Math.min(Math.max(1, Math.round(rawLimit)), MAX_RESULTS);

    // Academic filters
    const minAcceptanceRate = this.num(input, 'minAcceptanceRate');
    const maxAcceptanceRate = this.num(input, 'maxAcceptanceRate');
    const maxMathSAT = this.num(input, 'maxMathSAT');
    const maxReadingSAT = this.num(input, 'maxReadingSAT');

    // String filters
    const religiousAffiliation = this.str(input, 'religiousAffiliation');
    const majorsOffered = this.str(input, 'majorsOffered');

    // Boolean filters
    const hbcu = input['hbcu'] === true ? true : undefined;
    const publicOnly = input['publicOnly'] === true ? true : undefined;
    const communityCollege = input['communityCollege'] === true ? true : undefined;
    const womenOnly = input['womenOnly'] === true ? true : undefined;

    // ── 2. Build aggregation pipeline ─────────────────────────────────
    // Uses the same $objectToArray + $toLower pattern as colleges.routes.ts so
    // that sport matching is case-insensitive and independent of the `sport`
    // array field (which has inconsistent capitalization in the DB).

    // Normalize division input: convert common arabic-numeral patterns to
    // Roman numerals so "Division 1", "D1", "NCAA D1" all resolve to "NCAA Division I".
    const normalizedDivision = division ? normalizeDivisionInput(division) : null;

    // Stage 1: pre-filter on indexed scalar fields before the expensive
    // Map unwinding.  Only add conditions that are always present.
    const preMatch: Record<string, unknown> = {};

    if (state) preMatch['state'] = state.toUpperCase();
    if (name) preMatch['$text'] = { $search: name };
    if (maxGpa != null && maxGpa > 0) preMatch['averageGPA'] = { $lte: maxGpa };
    if (maxTuition != null && maxTuition > 0) preMatch['totalCost'] = { $lte: maxTuition };
    if (maxMathSAT != null && maxMathSAT > 0) preMatch['mathSAT'] = { $lte: maxMathSAT };
    if (maxReadingSAT != null && maxReadingSAT > 0)
      preMatch['readingSAT'] = { $lte: maxReadingSAT };
    if (hbcu) preMatch['hbcu'] = true;
    if (publicOnly) preMatch['public'] = true;
    if (communityCollege) preMatch['community_college'] = true;
    if (womenOnly) preMatch['women_only'] = true;

    if (religiousAffiliation) {
      preMatch['religious_affiliation'] = {
        $regex: escapeRegex(religiousAffiliation),
        $options: 'i',
      };
    }
    if (majorsOffered) {
      preMatch['majorsOffered'] = { $regex: escapeRegex(majorsOffered), $options: 'i' };
    }

    // Acceptance rate range
    if (minAcceptanceRate != null || maxAcceptanceRate != null) {
      const ar: Record<string, number> = {};
      if (minAcceptanceRate != null && minAcceptanceRate >= 0) ar['$gte'] = minAcceptanceRate;
      if (maxAcceptanceRate != null && maxAcceptanceRate > 0) ar['$lte'] = maxAcceptanceRate;
      if (Object.keys(ar).length > 0) preMatch['acceptanceRate'] = ar;
    }

    // Build the per-sport-entry condition for $filter over $objectToArray.
    // $$si.k = the Map key (sport name), $$si.v = the SportInfo sub-doc.
    const sportEntryConditions: unknown[] = [
      // Primary: case-insensitive sport name match
      { $eq: [{ $toLower: '$$si.k' }, sport.toLowerCase()] },
    ];

    if (normalizedDivision) {
      sportEntryConditions.push({
        $regexMatch: {
          input: { $ifNull: ['$$si.v.division', ''] },
          regex: escapeRegex(normalizedDivision),
          options: 'i',
        },
      });
    }

    if (conference) {
      sportEntryConditions.push({
        $regexMatch: {
          input: { $ifNull: ['$$si.v.conference', ''] },
          regex: escapeRegex(conference),
          options: 'i',
        },
      });
    }

    // ── 3. Execute aggregation ─────────────────────────────────────────
    try {
      const colleges = await CollegeModel.aggregate([
        // Pre-filter on scalar indexed fields (fast path)
        ...(Object.keys(preMatch).length > 0 ? [{ $match: preMatch }] : []),

        // Unwind sportInfo Map, keep only entries that match sport + filters
        {
          $addFields: {
            _matchedSport: {
              $filter: {
                input: { $objectToArray: { $ifNull: ['$sportInfo', {}] } },
                as: 'si',
                cond: { $and: sportEntryConditions },
              },
            },
          },
        },

        // Keep only colleges that have the matched sport entry
        { $match: { _matchedSport: { $ne: [] } } },

        // Cap results before projection
        { $limit: limit },

        // Project only the fields the LLM needs
        {
          $project: {
            _id: 1,
            name: 1,
            city: 1,
            state: 1,
            averageGPA: 1,
            acceptanceRate: 1,
            mathSAT: 1,
            readingSAT: 1,
            compositeACT: 1,
            majorsOffered: 1,
            totalCost: 1,
            undergradsNo: 1,
            male: 1,
            female: 1,
            hbcu: 1,
            public: 1,
            community_college: 1,
            women_only: 1,
            religious_affiliation: 1,
            logoUrl: 1,
            landingUrl: 1,
            // Keep the first matched sport entry so we can extract division/conference/etc.
            _matchedSport: 1,
          },
        },
      ]);

      // ── 4. Map to distilled DTO for the LLM ─────────────────────────
      interface AggregateResult {
        _id: unknown;
        name?: string;
        city?: string;
        state?: string;
        averageGPA?: number;
        acceptanceRate?: number;
        mathSAT?: number;
        readingSAT?: number;
        compositeACT?: string;
        majorsOffered?: string;
        totalCost?: number;
        undergradsNo?: string;
        male?: string;
        female?: string;
        hbcu?: boolean;
        public?: boolean;
        community_college?: boolean;
        women_only?: boolean;
        religious_affiliation?: string;
        logoUrl?: string;
        landingUrl?: string;
        _matchedSport: Array<{ k: string; v: Record<string, string | undefined> }>;
      }

      const results = (colleges as AggregateResult[]).map((c) => {
        // Extract sport info from the first matched Map entry ($$si.v)
        const info: Record<string, string | undefined> = c._matchedSport[0]?.v ?? {};
        return {
          id: String(c._id),
          name: c.name,
          city: c.city,
          state: c.state,

          // Sport-specific classification
          division: info['division'] ?? 'Unknown',
          conference: info['conference'] ?? 'Unknown',

          // Sport-specific recruiting links
          questionnaire: info['questionnaire'] ?? null,
          twitter: info['twitter'] ?? null,
          camp: info['camp'] ?? null,
          sportLandingUrl: info['sportLandingUrl'] ?? null,

          // Academics
          averageGPA: c.averageGPA ?? null,
          acceptanceRate: c.acceptanceRate ?? null,
          mathSAT: c.mathSAT ?? null,
          readingSAT: c.readingSAT ?? null,
          compositeACT: c.compositeACT ?? null,
          majorsOffered: c.majorsOffered ?? null,

          // Financials
          totalCost: c.totalCost ?? null,

          // Demographics
          undergradsNo: c.undergradsNo ?? null,
          male: c.male ?? null,
          female: c.female ?? null,
          hbcu: c.hbcu ?? false,
          public: c.public ?? false,
          communityCollege: c.community_college ?? false,
          womenOnly: c.women_only ?? false,
          religiousAffiliation: c.religious_affiliation ?? null,

          // Branding & links
          logoUrl: c.logoUrl ?? null,
          landingUrl: c.landingUrl ?? null,
        };
      });

      // ── 5. ReAct fallback nudge on empty results ──────────────────────
      if (results.length === 0) {
        return {
          success: true,
          data: {
            count: 0,
            sport,
            filtersApplied: buildFilterSummary(input),
            colleges: [],
            _agent_hint:
              'No colleges matched these criteria in the NXT1 database. ' +
              "You should now use the 'web_search' tool to find this information online, " +
              'or suggest the user broaden their search (e.g., remove the state or division filter).',
          },
        };
      }

      return {
        success: true,
        data: {
          count: results.length,
          sport,
          filtersApplied: buildFilterSummary(input),
          colleges: results,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'College search failed';
      return { success: false, error: message };
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Escape special regex characters from user input to prevent ReDoS attacks.
 * This is critical since division/conference values come from the LLM.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalize LLM division input to the Roman-numeral format stored in the DB.
 * Handles common LLM outputs like "Division 1", "D1", "NCAA D1", "NCAA Division 1".
 * Examples:
 *   "Division 1"       → "Division I"
 *   "NCAA Division 1"  → "NCAA Division I"
 *   "D1"               → "DI"
 *   "D2"               → "DII"
 *   "Division 3"       → "Division III"
 */
function normalizeDivisionInput(division: string): string {
  return division
    .replace(/\bDivision\s+1\b/gi, 'Division I')
    .replace(/\bDivision\s+2\b/gi, 'Division II')
    .replace(/\bDivision\s+3\b/gi, 'Division III')
    .replace(/\bD\.?\s*1\b/gi, 'DI')
    .replace(/\bD\.?\s*2\b/gi, 'DII')
    .replace(/\bD\.?\s*3\b/gi, 'DIII');
}

/**
 * Build a human-readable summary of which filters were applied.
 * Returned to the LLM so it can explain to the user what it searched for.
 */
function buildFilterSummary(input: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  const keys = [
    'sport',
    'state',
    'division',
    'conference',
    'maxGpa',
    'maxTuition',
    'minAcceptanceRate',
    'maxAcceptanceRate',
    'maxMathSAT',
    'maxReadingSAT',
    'name',
    'hbcu',
    'publicOnly',
    'communityCollege',
    'womenOnly',
    'religiousAffiliation',
    'majorsOffered',
  ];
  for (const key of keys) {
    if (input[key] != null && input[key] !== '' && input[key] !== false) {
      summary[key] = input[key];
    }
  }
  return summary;
}
