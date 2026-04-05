/**
 * @fileoverview Search Colleges Tool — MongoDB College Program Query
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Enables Agent X to search the NXT1 college database for programs matching
 * specific criteria: sport, state, division, conference, GPA, tuition,
 * school type, and free-text name search.
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
 * - `{ state: 1, acceptanceRate: 1 }` — compound for state + GPA filtering
 * - `{ name: 'text' }` — full-text search on college name
 *
 * Use cases:
 * - "Find every D2 baseball program in Ohio"
 * - "Show me NAIA schools in Texas with a GPA under 3.0"
 * - "List D1 football programs in the SEC"
 * - "Find HBCUs that offer basketball"
 * - "Search for community colleges with baseball in California"
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
    'You MUST provide at least the sport. You can optionally filter by state, division, ' +
    'conference, GPA, tuition, school type (HBCU, public, community college), or search by name. ' +
    'If 0 results are returned, pivot to the web_search tool to find the information online.';

  readonly parameters = {
    type: 'object',
    properties: {
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
      division: {
        type: 'string',
        description:
          'Competition division filter. Common values: "NCAA Division I", "NCAA Division II", ' +
          '"NCAA Division III", "NAIA", "NJCAA", "CCCAA". Partial matches are supported.',
      },
      conference: {
        type: 'string',
        description:
          'Conference name filter (e.g., "SEC", "Big Ten", "ACC", "Pac-12"). Partial matches supported.',
      },
      maxGpa: {
        type: 'number',
        description:
          'Maximum average GPA requirement. Returns schools with averageGPA ≤ this value. ' +
          'For example, 3.0 returns schools that accept students with a 3.0 GPA or below.',
      },
      maxTuition: {
        type: 'number',
        description:
          'Maximum total cost (tuition) in USD. Returns schools with totalCost ≤ this value.',
      },
      name: {
        type: 'string',
        description: 'Search for a college by name (e.g., "Ohio State", "Duke"). Uses text search.',
      },
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

    // Boolean filters
    const hbcu = input['hbcu'] === true ? true : undefined;
    const publicOnly = input['publicOnly'] === true ? true : undefined;
    const communityCollege = input['communityCollege'] === true ? true : undefined;

    // ── 2. Build MongoDB filter ────────────────────────────────────────
    const filter: Record<string, unknown> = {
      // Primary: the college must offer the requested sport
      sport: sport,
    };

    if (state) {
      filter['state'] = state.toUpperCase();
    }

    // Sport-specific sub-document queries (Map field)
    if (division) {
      filter[`sportInfo.${sport}.division`] = { $regex: escapeRegex(division), $options: 'i' };
    }

    if (conference) {
      filter[`sportInfo.${sport}.conference`] = { $regex: escapeRegex(conference), $options: 'i' };
    }

    // Numeric range filters
    if (maxGpa != null && maxGpa > 0) {
      filter['averageGPA'] = { $lte: maxGpa };
    }

    if (maxTuition != null && maxTuition > 0) {
      filter['totalCost'] = { $lte: maxTuition };
    }

    // Text search on name (uses the { name: 'text' } index)
    if (name) {
      filter['$text'] = { $search: name };
    }

    // Boolean flags
    if (hbcu) filter['hbcu'] = true;
    if (publicOnly) filter['public'] = true;
    if (communityCollege) filter['community_college'] = true;

    // ── 3. Execute query with strict projection ────────────────────────
    try {
      const colleges = await CollegeModel.find(filter)
        .select({
          name: 1,
          city: 1,
          state: 1,
          averageGPA: 1,
          totalCost: 1,
          acceptanceRate: 1,
          hbcu: 1,
          public: 1,
          community_college: 1,
          logoUrl: 1,
          landingUrl: 1,
          [`sportInfo.${sport}`]: 1,
        })
        .limit(limit)
        .lean()
        .exec();

      // ── 4. Map to distilled DTO for the LLM ─────────────────────────
      const results = colleges.map((c) => {
        // .lean() returns plain objects — extract the sport-specific info
        const info: { division?: string; conference?: string } = c.sportInfo?.[sport] ?? {};
        return {
          id: String(c._id),
          name: c.name,
          city: c.city,
          state: c.state,
          division: info.division ?? 'Unknown',
          conference: info.conference ?? 'Unknown',
          averageGPA: c.averageGPA ?? null,
          totalCost: c.totalCost ?? null,
          acceptanceRate: c.acceptanceRate ?? null,
          hbcu: c.hbcu ?? false,
          public: c.public ?? false,
          communityCollege: c.community_college ?? false,
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
    'name',
    'hbcu',
    'publicOnly',
    'communityCollege',
  ];
  for (const key of keys) {
    if (input[key] != null && input[key] !== '' && input[key] !== false) {
      summary[key] = input[key];
    }
  }
  return summary;
}
