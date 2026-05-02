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

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { toMarkdownTable } from '../markdown-helpers.js';
import { resolveUrlDisplay } from '../favicon-registry.js';
import { CollegeModel } from '../../../../models/core/college.model.js';
import { getFirestore } from 'firebase-admin/firestore';
import { resolvePrimarySport } from '../../memory/context-builder.js';
import { logger } from '../../../../utils/logger.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Hard ceiling on results to protect the LLM context window. */
const MAX_RESULTS = 25;

/** Default number of results when the LLM doesn't specify. */
const DEFAULT_LIMIT = 10;

// ─── State Name → Abbreviation ─────────────────────────────────────────────

/** US state full name (lowercased) → 2-letter abbreviation. */
const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
  'puerto rico': 'PR',
  guam: 'GU',
  'virgin islands': 'VI',
};

/** Reverse map: abbreviation → properly cased full state name. */
const STATE_ABBR_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAME_TO_ABBR).map(([name, abbr]) => [
    abbr,
    name.replace(/\b\w/g, (c) => c.toUpperCase()),
  ])
);

// ─── Sport Normalization ────────────────────────────────────────────────────

/** Valid sport keys stored in the college DB sportInfo Map. */
const SPORTS_DB_KEYS = [
  'Football',
  'Basketball Mens',
  'Basketball Womens',
  "Men's Basketball",
  "Women's Basketball",
  'Baseball',
  'Softball',
  'Soccer Mens',
  'Soccer Womens',
  "Men's Soccer",
  "Women's Soccer",
  'Lacrosse Mens',
  'Lacrosse Womens',
  "Men's Lacrosse",
  "Women's Lacrosse",
  'Volleyball Mens',
  'Volleyball Womens',
  "Men's Volleyball",
  "Women's Volleyball",
  'Golf Mens',
  'Golf Womens',
  "Men's Golf",
  "Women's Golf",
  'Track & Field Mens',
  'Track & Field Womens',
  "Men's Track & Field",
  "Women's Track & Field",
  'Cross Country Mens',
  'Cross Country Womens',
  "Men's Cross Country",
  "Women's Cross Country",
  'Field Hockey',
  'Ice Hockey Mens',
  'Ice Hockey Womens',
  "Men's Ice Hockey",
  "Women's Ice Hockey",
  'Tennis Mens',
  'Tennis Womens',
  "Men's Tennis",
  "Women's Tennis",
  'Swimming & Diving Mens',
  'Swimming & Diving Womens',
  "Men's Swimming & Diving",
  "Women's Swimming & Diving",
  'Rowing Mens',
  'Rowing Womens',
  "Men's Rowing",
  "Women's Rowing",
  'Wrestling',
  'Gymnastics Mens',
  'Gymnastics Womens',
  "Men's Gymnastics",
  "Women's Gymnastics",
  'Water Polo Mens',
  'Water Polo Womens',
  "Men's Water Polo",
  "Women's Water Polo",
  'Bowling Womens',
  "Women's Bowling",
] as const;

/** Case-insensitive lookup: lowercased DB key → original casing. */
const SPORT_KEY_LOOKUP = new Map<string, string>(SPORTS_DB_KEYS.map((k) => [k.toLowerCase(), k]));

/** Sports that exist only as one gender (no gender qualification needed). */
const SINGLE_GENDER_DEFAULTS: Record<string, string> = {
  bowling: "Women's Bowling",
};

/** Base sport names that require gender qualification in the DB. */
const GENDER_SPLIT_BASES = new Set([
  'basketball',
  'soccer',
  'lacrosse',
  'volleyball',
  'golf',
  'track & field',
  'cross country',
  'ice hockey',
  'tennis',
  'swimming & diving',
  'rowing',
  'gymnastics',
  'water polo',
]);

/** Common short names that map to full DB sport base names. */
const SPORT_ALIASES: Record<string, string> = {
  swimming: 'Swimming & Diving',
  swim: 'Swimming & Diving',
  track: 'Track & Field',
  'track and field': 'Track & Field',
};

// ─── Retry Filter Categories ────────────────────────────────────────────────

/** Pre-match keys for academic/financial filters (dropped in retry 1). */
const ACADEMIC_FILTER_KEYS = [
  'averageGPA',
  'totalCost',
  'mathSAT',
  'readingSAT',
  'acceptanceRate',
] as const;

/** Pre-match keys for extended filters (dropped in retry 2). */
const EXTENDED_FILTER_KEYS = ['religious_affiliation', 'majorsOffered'] as const;

const CollegeSearchNumberLikeSchema = z.union([z.number(), z.string().trim().min(1)]);

const SearchCollegesInputSchema = z.object({
  sport: z.string().trim().min(1),
  state: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  division: z.string().trim().min(1).optional(),
  conference: z.string().trim().min(1).optional(),
  maxGpa: CollegeSearchNumberLikeSchema.optional(),
  minAcceptanceRate: CollegeSearchNumberLikeSchema.optional(),
  maxAcceptanceRate: CollegeSearchNumberLikeSchema.optional(),
  maxMathSAT: CollegeSearchNumberLikeSchema.optional(),
  maxReadingSAT: CollegeSearchNumberLikeSchema.optional(),
  maxTuition: CollegeSearchNumberLikeSchema.optional(),
  hbcu: z.boolean().optional(),
  publicOnly: z.boolean().optional(),
  communityCollege: z.boolean().optional(),
  womenOnly: z.boolean().optional(),
  religiousAffiliation: z.string().trim().min(1).optional(),
  majorsOffered: z.string().trim().min(1).optional(),
  limit: CollegeSearchNumberLikeSchema.optional(),
});

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

  readonly parameters = SearchCollegesInputSchema;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'database' as const;

  readonly entityGroup = 'platform_tools' as const;
  // ─── Execute ────────────────────────────────────────────────────────

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = SearchCollegesInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const parsedInput = parsed.data;
    const rawSport = parsedInput.sport;

    const emitStage = context?.emitStage;

    const rawState = parsedInput.state;
    const division = parsedInput.division;
    const rawConference = parsedInput.conference;
    const name = parsedInput.name;
    const rawLimit =
      typeof parsedInput.limit === 'number'
        ? parsedInput.limit
        : typeof parsedInput.limit === 'string'
          ? Number(parsedInput.limit)
          : DEFAULT_LIMIT;
    const limit = Math.min(Math.max(1, Math.round(rawLimit)), MAX_RESULTS);

    // Numeric filters (sanitize string inputs like "$40,000" or "3.5 GPA")
    const maxGpa =
      typeof parsedInput.maxGpa === 'number'
        ? parsedInput.maxGpa
        : sanitizeNumericString(parsedInput.maxGpa);
    const maxTuition =
      typeof parsedInput.maxTuition === 'number'
        ? parsedInput.maxTuition
        : sanitizeNumericString(parsedInput.maxTuition);
    const minAcceptanceRate =
      typeof parsedInput.minAcceptanceRate === 'number'
        ? parsedInput.minAcceptanceRate
        : sanitizeNumericString(parsedInput.minAcceptanceRate);
    const maxAcceptanceRate =
      typeof parsedInput.maxAcceptanceRate === 'number'
        ? parsedInput.maxAcceptanceRate
        : sanitizeNumericString(parsedInput.maxAcceptanceRate);
    const maxMathSAT =
      typeof parsedInput.maxMathSAT === 'number'
        ? parsedInput.maxMathSAT
        : sanitizeNumericString(parsedInput.maxMathSAT);
    const maxReadingSAT =
      typeof parsedInput.maxReadingSAT === 'number'
        ? parsedInput.maxReadingSAT
        : sanitizeNumericString(parsedInput.maxReadingSAT);

    // String filters
    const religiousAffiliation = parsedInput.religiousAffiliation;
    const majorsOffered = parsedInput.majorsOffered;

    // Boolean filters
    const hbcu = parsedInput.hbcu === true ? true : undefined;
    const publicOnly = parsedInput.publicOnly === true ? true : undefined;
    const communityCollege = parsedInput.communityCollege === true ? true : undefined;
    const womenOnly = parsedInput.womenOnly === true ? true : undefined;

    // ── 1b. Normalize inputs ───────────────────────────────────────────
    const state = rawState ? normalizeStateInput(rawState) : undefined;
    const conference = rawConference ? normalizeConferenceInput(rawConference) : undefined;

    // Normalize sport: "Women's Basketball" → "Basketball Womens", etc.
    const sportResult = normalizeSportInput(rawSport);
    let sport: string = rawSport; // default; overwritten below

    if (sportResult.needsGender) {
      // Sport is gender-split but no gender was specified — try user profile
      let resolved = false;
      if (context?.userId) {
        try {
          const db = getFirestore();
          const userDoc = await db.collection('Users').doc(context.userId).get();
          if (userDoc.exists) {
            const profileSport = resolvePrimarySport(userDoc.data() as Record<string, unknown>);
            if (profileSport) {
              const profileLower = profileSport.toLowerCase();
              const base = sportResult.baseSport ?? sportResult.key.toLowerCase();
              if (
                profileLower.startsWith(base) ||
                profileLower.replace(/&/g, 'and').startsWith(base.replace(/&/g, 'and'))
              ) {
                sport = SPORT_KEY_LOOKUP.get(profileLower) ?? profileSport;
                resolved = true;
              }
            }
          }
        } catch {
          // Profile fetch failed — fall through to hint
        }
      }

      if (!resolved) {
        return {
          success: true,
          data: {
            count: 0,
            sport: rawSport,
            filtersApplied: buildFilterSummary(parsedInput as unknown as Record<string, unknown>),
            colleges: [],
            _agent_hint:
              `"${rawSport}" is a gender-split sport in our database. ` +
              `Please specify "${rawSport} Mens" or "${rawSport} Womens", ` +
              "or check the user's profile to determine which program to search.",
          },
        };
      }
    } else {
      sport = sportResult.key;
    }

    // ── 2. Build aggregation pipeline ─────────────────────────────────
    // Uses the same $objectToArray + $toLower pattern as colleges.routes.ts so
    // that sport matching is case-insensitive and independent of the `sport`
    // array field (which has inconsistent capitalization in the DB).

    // Normalize division input: convert common arabic-numeral patterns to
    // Roman numerals so "Division 1", "D1", "NCAA D1" all resolve to "NCAA Division I".
    const divisionRegex = division ? normalizeDivisionInput(division, sport) : null;

    // Stage 1: pre-filter on indexed scalar fields before the expensive
    // Map unwinding.  Only add conditions that are always present.
    const preMatch: Record<string, unknown> = {};

    if (state) {
      const fullName = STATE_ABBR_TO_NAME[state];
      const patterns = [escapeRegex(state)];
      if (fullName) patterns.push(escapeRegex(fullName));
      preMatch['state'] = { $regex: `^(${patterns.join('|')})$`, $options: 'i' };
    }
    if (name) {
      // Use regex instead of $text so the tool remains functional when text indexes drift.
      preMatch['name'] = { $regex: escapeRegex(name), $options: 'i' };
    }
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
    const sportKeyVariants = buildSportKeyVariants(sport);
    const sportEntryConditions: unknown[] = [
      // Primary: case-insensitive sport name match with DB naming variants
      { $in: [{ $toLower: '$$si.k' }, sportKeyVariants] },
    ];

    if (divisionRegex) {
      // Array-safe: division may be stored as a string or an array in the DB.
      // divisionRegex is already a regex pattern (with alternation) — no escapeRegex needed.
      sportEntryConditions.push(buildArraySafeRegexCondition('$$si.v.division', divisionRegex));
    }

    if (conference) {
      // Array-safe: conference may be stored as a string or an array in the DB
      sportEntryConditions.push(
        buildArraySafeRegexCondition('$$si.v.conference', escapeRegex(conference))
      );
    }

    // ── 3. Execute aggregation with retry ──────────────────────────────
    emitStage?.('fetching_data', {
      icon: 'search',
      sport,
      state,
      limit,
      phase: 'query_colleges',
    });

    // Build reusable pipeline stages (everything after the pre-match)
    const addFieldsStage = {
      $addFields: {
        _matchedSport: {
          $filter: {
            input: { $objectToArray: { $ifNull: ['$sportInfo', {}] } },
            as: 'si',
            cond: { $and: sportEntryConditions },
          },
        },
      },
    };

    const projectStage = {
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
        _matchedSport: 1,
      },
    };

    const runQuery = (match: Record<string, unknown>) =>
      CollegeModel.aggregate([
        ...(Object.keys(match).length > 0 ? [{ $match: match }] : []),
        addFieldsStage,
        { $match: { _matchedSport: { $ne: [] } } },
        { $limit: limit },
        projectStage,
      ]);

    try {
      // ── DEBUG: Log database connection info ─────────────────────
      logger.info('[search_colleges] Executing college search', {
        tool: 'search_colleges',
        sport,
        state,
        division,
        conference,
        name,
        limit,
        preMatch: JSON.stringify(preMatch),
        modelName: CollegeModel.modelName,
        collectionName: CollegeModel.collection.name,
      });

      // ── DEBUG: Log connection details ──────────────────────────
      const mongooseConnection = CollegeModel.collection.conn;
      const dbName = mongooseConnection.db?.databaseName ?? 'unknown';
      const dbNamespace = CollegeModel.collection.namespace;

      logger.info('[search_colleges] MongoDB Connection Details', {
        tool: 'search_colleges',
        dbName,
        dbNamespace,
        mongooseConnectionName: mongooseConnection.name,
      });

      // Attempt 1: full filters
      let colleges = await runQuery(preMatch);

      logger.info('[search_colleges] Attempt 1 (full filters)', {
        tool: 'search_colleges',
        sport,
        state,
        matchConditions: Object.keys(preMatch),
        resultsCount: colleges.length,
      });

      const relaxed: string[] = [];

      // Retry 1: drop academic/financial filters
      if (colleges.length === 0) {
        const retry1 = dropKeys(preMatch, ACADEMIC_FILTER_KEYS);
        if (Object.keys(retry1).length < Object.keys(preMatch).length) {
          logger.info('[search_colleges] Attempt 2: Retrying without academic filters', {
            tool: 'search_colleges',
            sport,
            state,
            droppedFilters: ACADEMIC_FILTER_KEYS,
            remainingMatchConditions: Object.keys(retry1),
          });

          emitStage?.('fetching_data', {
            icon: 'search',
            sport,
            state,
            phase: 'retry_without_academic_filters',
          });
          colleges = await runQuery(retry1);

          logger.info('[search_colleges] Attempt 2 results', {
            tool: 'search_colleges',
            sport,
            state,
            resultsCount: colleges.length,
          });

          relaxed.push('academic and financial filters (GPA, SAT, tuition, acceptance rate)');
        }
      }

      // Retry 2: also drop extended filters (majors, religious affiliation)
      if (colleges.length === 0) {
        const allDropped = [...ACADEMIC_FILTER_KEYS, ...EXTENDED_FILTER_KEYS];
        const retry2 = dropKeys(preMatch, allDropped);
        const retry1KeyCount = Object.keys(dropKeys(preMatch, ACADEMIC_FILTER_KEYS)).length;
        if (Object.keys(retry2).length < retry1KeyCount) {
          logger.info('[search_colleges] Attempt 3: Retrying without extended filters', {
            tool: 'search_colleges',
            sport,
            state,
            droppedFilters: EXTENDED_FILTER_KEYS,
            remainingMatchConditions: Object.keys(retry2),
          });

          emitStage?.('fetching_data', {
            icon: 'search',
            sport,
            state,
            phase: 'retry_without_extended_filters',
          });
          colleges = await runQuery(retry2);

          logger.info('[search_colleges] Attempt 3 results', {
            tool: 'search_colleges',
            sport,
            state,
            resultsCount: colleges.length,
          });

          relaxed.push('major and religious affiliation filters');
        }
      }

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
        _matchedSport?: Array<{ k: string; v: Record<string, unknown> }>;
      }

      const results = (colleges as AggregateResult[]).map((c) => {
        const info = c._matchedSport?.[0]?.v ?? {};
        const rawDiv = info['division'];
        const rawConf = info['conference'];
        return {
          id: String(c._id),
          name: c.name,
          city: c.city,
          state: c.state,

          // Sport-specific classification (handle string or array)
          division: (Array.isArray(rawDiv) ? rawDiv[0] : rawDiv) ?? 'Unknown',
          conference: (Array.isArray(rawConf) ? rawConf[0] : rawConf) ?? 'Unknown',

          // Sport-specific recruiting links
          questionnaire: (info['questionnaire'] as string) ?? null,
          twitter: (info['twitter'] as string) ?? null,
          camp: (info['camp'] as string) ?? null,
          sportLandingUrl: (info['sportLandingUrl'] as string) ?? null,

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

      emitStage?.('fetching_data', {
        icon: 'search',
        sport,
        state,
        resultCount: results.length,
        phase: 'colleges_found',
      });

      // ── 5. Return results (with retry info if applicable) ────────────
      if (results.length === 0) {
        const relaxedNote =
          relaxed.length > 0 ? ` Filters relaxed during retry: ${relaxed.join('; ')}.` : '';
        return {
          success: true,
          data: {
            count: 0,
            sport,
            filtersApplied: buildFilterSummary(input),
            ...(relaxed.length > 0 && { filtersRelaxed: relaxed }),
            colleges: [],
            _agent_hint:
              'No colleges matched these criteria in the NXT1 database.' +
              relaxedNote +
              ' ' +
              "You should now use the 'web_search' tool to find this information online, " +
              'or suggest the user broaden their search (e.g., remove the state or division filter).',
          },
        };
      }

      const markdown = [
        `## College Search Results (${results.length} programs)`,
        `**Sport:** ${sport} | **Filters:** ${buildFilterSummary(input)}${relaxed.length > 0 ? ` (Relaxed: ${relaxed.join(', ')})` : ''}`,
        '',
        toMarkdownTable(
          results.map((c, i) => ({ ...c, index: i + 1 })),
          [
            { key: 'index', label: '#' },
            { key: 'name', label: 'College' },
            { key: 'division', label: 'Division' },
            { key: 'conference', label: 'Conference' },
            { key: 'state', label: 'State' },
            { key: 'averageGPA', label: 'GPA', format: (val) => String(val ?? '—') },
            {
              key: 'acceptanceRate',
              label: 'Acceptance',
              format: (val) => (val ? val + '%' : '—'),
            },
            {
              key: 'totalCost',
              label: 'Tuition',
              format: (val) => (val ? '$' + Number(val).toLocaleString() : '—'),
            },
          ]
        ),
        '',
        results
          .map(
            (c, i) =>
              `### ${i + 1}. ${c.name}\n` +
              (c.questionnaire
                ? `- 📋 Questionnaire: ${resolveUrlDisplay(c.questionnaire)}\n`
                : '') +
              (c.sportLandingUrl
                ? `- 🔗 Sport Page: ${resolveUrlDisplay(c.sportLandingUrl)}\n`
                : '') +
              (c.twitter ? `- 🐦 Twitter: ${resolveUrlDisplay(c.twitter)}\n` : '') +
              (c.camp ? `- ⛺ Camp: ${resolveUrlDisplay(c.camp)}\n` : '')
          )
          .join('\n'),
      ].join('\n');

      return {
        success: true,
        markdown,
        data: {
          count: results.length,
          sport,
          filtersApplied: buildFilterSummary(input),
          ...(relaxed.length > 0 && { filtersRelaxed: relaxed }),
          colleges: results,
          ...(relaxed.length > 0 && {
            _agent_hint:
              `Note: some filters were relaxed to find results: ${relaxed.join('; ')}. ` +
              'The results may be broader than the user originally requested.',
          }),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'College search failed';
      logger.error('[search_colleges] Error executing college search', {
        tool: 'search_colleges',
        error: message,
        sport,
        state,
        division,
        conference,
        name,
        stack: err instanceof Error ? err.stack : undefined,
      });
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
 * Normalize LLM division input to a regex pattern matching ALL possible DB
 * representations for that division level.  Sport-aware: for Football,
 * "Division 1" / "D1" maps to FBS|FCS (the NCAA subdivision labels stored
 * in the DB), plus other common aliases for safety.
 *
 * Returns a regex-ready pattern (may include alternation).  Caller must NOT
 * wrap this in escapeRegex().
 */
function normalizeDivisionInput(division: string, sport: string): string {
  const cleaned = division.trim().toLowerCase().replace(/\s+/g, ' ');
  const isFootball = sport.toLowerCase() === 'football';
  const level = detectDivisionLevel(cleaned);

  switch (level) {
    case 1:
      return isFootball
        ? '^(FBS|FCS|NCAA D1|NCAA Division I|Division I|D1|DI|NCAA DI)$'
        : '^(NCAA D1|NCAA Division I|Division I|D1|DI|NCAA DI)$';
    case 2:
      return '^(NCAA DII|NCAA Division II|Division II|D2|DII|NCAA D2)$';
    case 3:
      return '^(NCAA DIII|NCAA Division III|Division III|D3|DIII|NCAA D3)$';
    case 'naia':
      return '^NAIA$';
    case 'juco':
      return '^(JC|JC-D1|JC-D2|JC-D3|NJCAA|CCCAA|JUCO)$';
    case 'fbs':
      return '^FBS$';
    case 'fcs':
      return '^FCS$';
    default:
      return escapeRegex(division.trim());
  }
}

/**
 * Detect which conceptual division level the user's input refers to.
 * Checks D3 before D2 before D1 to avoid "DII" / "DIII" matching D1 patterns.
 */
function detectDivisionLevel(input: string): 1 | 2 | 3 | 'naia' | 'juco' | 'fbs' | 'fcs' | null {
  if (/^fbs$/.test(input)) return 'fbs';
  if (/^fcs$/.test(input)) return 'fcs';
  if (/^naia$/.test(input)) return 'naia';
  if (/^(juco|jc|njcaa|cccaa)$/.test(input)) return 'juco';

  // D3 before D2 before D1 to prevent substring false-positives
  if (
    /^(d\.?\s*3|d\.?\s*iii|division\s*(3|iii)|ncaa\s*d\.?\s*3|ncaa\s*d\.?\s*iii|ncaa\s*division\s*(3|iii))$/.test(
      input
    )
  )
    return 3;
  if (
    /^(d\.?\s*2|d\.?\s*ii|division\s*(2|ii)|ncaa\s*d\.?\s*2|ncaa\s*d\.?\s*ii|ncaa\s*division\s*(2|ii))$/.test(
      input
    )
  )
    return 2;
  if (
    /^(d\.?\s*1|d\.?\s*i|division\s*(1|i)|ncaa\s*d\.?\s*1|ncaa\s*d\.?\s*i|ncaa\s*division\s*(1|i))$/.test(
      input
    )
  )
    return 1;

  return null;
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

/**
 * Normalize a US state input to its two-letter abbreviation.
 * Handles full names ("Ohio" → "OH") and already-abbreviated codes ("oh" → "OH").
 */
function normalizeStateInput(state: string): string {
  const trimmed = state.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return STATE_NAME_TO_ABBR[trimmed.toLowerCase()] ?? trimmed.toUpperCase();
}

/**
 * Normalize the LLM's sport input to match DB sportInfo map keys.
 *
 * Returns the resolved DB key and whether gender inference is needed.
 * Examples:
 *   "Football"            → { key: "Football", needsGender: false }
 *   "Women's Basketball"  → { key: "Basketball Womens", needsGender: false }
 *   "Mens Soccer"         → { key: "Soccer Mens", needsGender: false }
 *   "Basketball"          → { key: "Basketball", needsGender: true, baseSport: "basketball" }
 */
function normalizeSportInput(raw: string): {
  key: string;
  needsGender: boolean;
  baseSport?: string;
} {
  const trimmed = raw.trim();

  // 1. Exact match (case-insensitive) against canonical DB keys
  const exact = SPORT_KEY_LOOKUP.get(trimmed.toLowerCase());
  if (exact) return { key: exact, needsGender: false };

  // 2. Gender-prefix patterns: "Women's Basketball", "Mens Soccer", "Female Tennis"
  const prefixMatch = trimmed.match(/^(women'?s?|men'?s?|male|female)\s+(.+)$/i);
  if (prefixMatch) {
    const gender =
      prefixMatch[1].toLowerCase().startsWith('women') || prefixMatch[1].toLowerCase() === 'female'
        ? 'Womens'
        : 'Mens';
    const sportPart = prefixMatch[2].trim();
    const resolved = resolveGenderedSport(sportPart, gender);
    if (resolved) return { key: resolved, needsGender: false };
  }

  // 3. Gender-suffix patterns: "Basketball (Men's)", "Soccer Women"
  const suffixMatch = trimmed.match(/^(.+?)\s*\(?(men'?s?|women'?s?|male|female)\)?$/i);
  if (suffixMatch) {
    const gender =
      suffixMatch[2].toLowerCase().startsWith('women') || suffixMatch[2].toLowerCase() === 'female'
        ? 'Womens'
        : 'Mens';
    const sportPart = suffixMatch[1].trim();
    const resolved = resolveGenderedSport(sportPart, gender);
    if (resolved) return { key: resolved, needsGender: false };
  }

  // 4. Single-gender defaults (e.g., "Bowling" → "Bowling Womens")
  if (SINGLE_GENDER_DEFAULTS[trimmed.toLowerCase()]) {
    return { key: SINGLE_GENDER_DEFAULTS[trimmed.toLowerCase()], needsGender: false };
  }

  // 5. Gender-split base sport (underspecified — needs user context)
  const lower = trimmed.toLowerCase();
  const withAmpersand = lower.replace(/\band\b/g, '&');
  if (GENDER_SPLIT_BASES.has(lower) || GENDER_SPLIT_BASES.has(withAmpersand)) {
    return {
      key: trimmed,
      needsGender: true,
      baseSport: GENDER_SPLIT_BASES.has(lower) ? lower : withAmpersand,
    };
  }

  // 6. Partial base-sport match ("Swimming" → "swimming & diving", "Track" → "track & field")
  for (const base of GENDER_SPLIT_BASES) {
    if (base.startsWith(lower) || base.startsWith(withAmpersand)) {
      return { key: trimmed, needsGender: true, baseSport: base };
    }
  }

  // 7. Fallback: use as-is (will match case-insensitively in aggregation)
  return { key: trimmed, needsGender: false };
}

/** Try to resolve "SportPart Gender" to a DB key, handling "&" / "and" variants + aliases. */
function resolveGenderedSport(sportPart: string, gender: string): string | null {
  const isWomen = gender.toLowerCase() === 'womens';
  const suffixToken = isWomen ? 'Womens' : 'Mens';
  const prefixToken = isWomen ? "Women's" : "Men's";

  const normalizedParts = [
    sportPart,
    sportPart.replace(/\band\b/gi, '&'),
    sportPart.replace(/&/g, 'and'),
  ];

  const candidates = normalizedParts.flatMap((part) => [
    `${part} ${suffixToken}`,
    `${prefixToken} ${part}`,
  ]);

  for (const candidate of candidates) {
    const match = SPORT_KEY_LOOKUP.get(candidate.toLowerCase());
    if (match) return match;
  }

  // Try aliases (e.g., "Swimming" → "Swimming & Diving")
  const alias = SPORT_ALIASES[sportPart.toLowerCase()];
  if (alias) {
    const aliasCandidates = [`${alias} ${suffixToken}`, `${prefixToken} ${alias}`];
    for (const candidate of aliasCandidates) {
      const match = SPORT_KEY_LOOKUP.get(candidate.toLowerCase());
      if (match) return match;
    }
  }

  return null;
}

/**
 * Normalize conference aliases to canonical names.
 * Only handles unambiguous aliases.
 */
function normalizeConferenceInput(conference: string): string {
  return conference
    .replace(/\bBig\s*10\b/gi, 'Big Ten')
    .replace(/\bPac[\s-]*12\b/gi, 'Pac-12')
    .replace(/\bMid[\s-]?American\b/gi, 'Mid-American');
}

/**
 * Build an aggregation expression that handles both string and array field values
 * for regex matching. Uses $cond + $isArray to branch safely.
 */
function buildArraySafeRegexCondition(field: string, regex: string): unknown {
  return {
    $cond: [
      { $isArray: field },
      // Array case: at least one element matches the regex
      {
        $gt: [
          {
            $size: {
              $filter: {
                input: field,
                as: 'elem',
                cond: {
                  $regexMatch: { input: '$$elem', regex, options: 'i' },
                },
              },
            },
          },
          0,
        ],
      },
      // String case: direct regex match
      {
        $regexMatch: {
          input: { $ifNull: [field, ''] },
          regex,
          options: 'i',
        },
      },
    ],
  };
}

/**
 * Build case-insensitive sport key variants to handle multiple DB naming conventions.
 * Example: "Basketball Mens" <-> "Men's Basketball".
 */
function buildSportKeyVariants(sport: string): string[] {
  const variants = new Set<string>();
  const add = (value: string): void => {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalized) variants.add(normalized);
  };

  add(sport);
  add(sport.replace(/\band\b/gi, '&'));
  add(sport.replace(/&/g, 'and'));

  for (const value of [...variants]) {
    const suffix = value.match(/^(.*)\s+(mens|womens)$/i);
    if (suffix) {
      const base = suffix[1]?.trim() ?? '';
      const gender = (suffix[2] ?? '').toLowerCase();
      if (base && gender) {
        const prefix = gender === 'mens' ? "men's" : "women's";
        add(`${prefix} ${base}`);
      }
    }

    const prefix = value.match(/^(men's|women's)\s+(.+)$/i);
    if (prefix) {
      const gender = (prefix[1] ?? '').toLowerCase();
      const base = prefix[2]?.trim() ?? '';
      if (base && gender) {
        const suffixGender = gender === "men's" ? 'mens' : 'womens';
        add(`${base} ${suffixGender}`);
      }
    }
  }

  return [...variants];
}

/**
 * Try to parse a numeric value from a string that may contain currency symbols,
 * commas, or unit labels (e.g., "$40,000", "3.5 GPA", "60%").
 */
function sanitizeNumericString(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value
    .replace(/[$,%]/g, '')
    .replace(/,/g, '')
    .replace(/\b(gpa|sat|act)\b/gi, '')
    .trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

/**
 * Return a shallow copy of `obj` with the specified keys removed.
 * Used by the retry logic to progressively relax non-core filters.
 */
function dropKeys(obj: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const result = { ...obj };
  for (const k of keys) delete result[k];
  return result;
}
