/**
 * @fileoverview Search College Coaches Tool — MongoDB Contact Lookup (Elite)
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Enables Agent X to retrieve coaching staff contact information (emails,
 * phone numbers, Twitter handles, titles) for college sports programs.
 *
 * Architecture:
 * - Starts from the `College` collection to find matching school(s).
 * - Uses `$lookup` to join the `contacts` collection via the `contacts`
 *   ObjectId array stored on each College document.
 * - Filters the populated contacts by sport (case-insensitive) and
 *   optionally by position/title (e.g., "Head Coach").
 * - Returns a distilled DTO to protect the LLM context window.
 * - Hard-caps results at 10 colleges (each with up to 25 contacts).
 * - Includes a ReAct fallback nudge when 0 results are found.
 *
 * Indexes leveraged:
 * - `{ name: 'text' }` — full-text search on college name
 * - `{ sport: 1, state: 1 }` — compound index for sport + state filtering
 *
 * Security:
 * - Read-only (isMutation = false).
 * - All agents can invoke this tool.
 * - Input strings are sanitized to prevent regex injection.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { CollegeModel } from '../../../../models/core/college.model.js';
import { ContactModel } from '../../../../models/core/contact.model.js';
import { logger } from '../../../../utils/logger.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Hard ceiling on college results to protect the LLM context window. */
const MAX_COLLEGES = 10;

/** Hard ceiling on contacts per college. */
const MAX_CONTACTS_PER_COLLEGE = 25;

const SearchCollegeCoachesInputSchema = z.object({
  collegeName: z.string().trim().min(1).optional(),
  sport: z.string().trim().min(1).optional(),
  division: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  position: z.string().trim().min(1).optional(),
  limit: z.coerce.number().optional(),
});

// ─── State Normalization (shared with search-colleges) ──────────────────────

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

// ─── Tool Definition ────────────────────────────────────────────────────────

export class SearchCollegeCoachesTool extends BaseTool {
  readonly name = 'search_college_coaches';

  readonly description =
    'Search the NXT1 database for college coaching staff contact information. ' +
    'Use this when the user asks for coach emails, phone numbers, Twitter handles, ' +
    'or contact details for college sports programs. ' +
    'You can filter by college name, sport, division, state, and coach position/title. ' +
    'Results include: coach name, position/title, email, phone number, Twitter handle. ' +
    'If 0 results are returned, pivot to the web_search tool to find the information online.';

  readonly parameters = SearchCollegeCoachesInputSchema;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'database' as const;

  readonly entityGroup = 'platform_tools' as const;
  // ─── Execute ────────────────────────────────────────────────────────

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = SearchCollegeCoachesInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues
          .map((issue) =>
            issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message
          )
          .join(', '),
      };
    }

    const emitStage = context?.emitStage;

    const {
      collegeName,
      sport: rawSport,
      division: rawDivision,
      state: rawState,
      position,
    } = parsed.data;

    const parsedSportAndDivision = normalizeSportAndDivision(rawSport, rawDivision);
    const sport = parsedSportAndDivision.sport;
    const division = parsedSportAndDivision.division;
    const rawLimit = parsed.data.limit ?? 5;
    const limit = Math.min(Math.max(1, Math.round(rawLimit)), MAX_COLLEGES);

    if (!collegeName && !sport && !rawState && !division) {
      return {
        success: false,
        error:
          'At least one of collegeName, sport, division, or state is required to search coaching contacts.',
      };
    }

    // ── 2. Build the college match filter ──────────────────────────────
    const collegeMatch: Record<string, unknown> = {};

    // Use regex matching so this tool doesn't fail if Mongo text indexes are unavailable.
    if (collegeName) {
      collegeMatch['name'] = { $regex: escapeRegex(collegeName), $options: 'i' };
    }

    // State filter (same dual-format regex as search-colleges)
    if (rawState) {
      const state = normalizeStateInput(rawState);
      const fullName = STATE_ABBR_TO_NAME[state];
      const patterns = [escapeRegex(state)];
      if (fullName) patterns.push(escapeRegex(fullName));
      collegeMatch['state'] = { $regex: `^(${patterns.join('|')})$`, $options: 'i' };
    }

    // If sport is provided, ensure the college has that sport in its sport array
    if (sport) {
      collegeMatch['sport'] = { $regex: escapeRegex(sport), $options: 'i' };
    }

    if (division) {
      collegeMatch['$expr'] = buildDivisionExpr(division, sport);
    }

    emitStage?.('fetching_data', {
      icon: 'search',
      collegeName,
      sport,
      division,
      position,
      limit,
      phase: 'lookup_coaching_staff',
    });

    // ── 3. Build aggregation pipeline ──────────────────────────────────
    try {
      // Build the contact filter conditions for $filter
      const contactFilterConditions: unknown[] = [];

      if (sport) {
        contactFilterConditions.push({
          $regexMatch: {
            input: { $ifNull: ['$$contact.sport', ''] },
            regex: escapeRegex(sport),
            options: 'i',
          },
        });
      }

      if (position) {
        contactFilterConditions.push({
          $regexMatch: {
            input: { $ifNull: ['$$contact.position', ''] },
            regex: escapeRegex(position),
            options: 'i',
          },
        });
      }

      // The $filter condition: all provided filters must match (AND logic)
      const filterCond =
        contactFilterConditions.length === 0
          ? true // no filtering — return all contacts
          : contactFilterConditions.length === 1
            ? contactFilterConditions[0]
            : { $and: contactFilterConditions };

      const pipeline = [
        // Stage 1: Match colleges by name (+ optional state/sport)
        { $match: collegeMatch },

        // Stage 2: Limit colleges before the expensive $lookup
        { $limit: limit },

        // Stage 3: Join contacts collection
        // Uses $lookup with let/pipeline for ObjectId-safe joining.
        // The College.contacts field stores strings/ObjectIds — we use
        // $toString to normalize both sides for comparison.
        {
          $lookup: {
            from: ContactModel.collection.name,
            let: { contactIds: { $ifNull: ['$contacts', []] } },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $in: [
                      { $toString: '$_id' },
                      {
                        $map: {
                          input: '$$contactIds',
                          as: 'cid',
                          in: { $toString: '$$cid' },
                        },
                      },
                    ],
                  },
                },
              },
            ],
            as: 'populatedContacts',
          },
        },

        // Stage 4: Filter contacts by sport/position
        {
          $addFields: {
            filteredContacts:
              filterCond === true
                ? { $slice: ['$populatedContacts', MAX_CONTACTS_PER_COLLEGE] }
                : {
                    $slice: [
                      {
                        $filter: {
                          input: '$populatedContacts',
                          as: 'contact',
                          cond: filterCond,
                        },
                      },
                      MAX_CONTACTS_PER_COLLEGE,
                    ],
                  },
          },
        },

        // Stage 5: Project only what the LLM needs
        {
          $project: {
            _id: 1,
            name: 1,
            city: 1,
            state: 1,
            logoUrl: 1,
            filteredContacts: 1,
          },
        },
      ];

      // ── DEBUG: Log database connection info ─────────────────────
      logger.info('[search_college_coaches] Executing coach search', {
        tool: 'search_college_coaches',
        collegeName: collegeName ?? null,
        sport,
        division,
        rawState,
        position,
        limit,
        collegeMatch: JSON.stringify(collegeMatch),
        collegeModelName: CollegeModel.modelName,
        collegeCollectionName: CollegeModel.collection.name,
        contactModelName: ContactModel.modelName,
        contactCollectionName: ContactModel.collection.name,
      });

      // ── DEBUG: Log connection details ──────────────────────────
      const mongooseConnection = CollegeModel.collection.conn;
      const dbName = mongooseConnection.db?.databaseName ?? 'unknown';
      const dbNamespace = CollegeModel.collection.namespace;

      logger.info('[search_college_coaches] MongoDB Connection Details', {
        tool: 'search_college_coaches',
        dbName,
        dbNamespace,
        mongooseConnectionName: mongooseConnection.name,
      });

      const colleges = await CollegeModel.aggregate(pipeline);

      logger.info('[search_college_coaches] Query results', {
        tool: 'search_college_coaches',
        collegeName: collegeName ?? null,
        division,
        collegesFound: colleges.length,
        pipelineStages: pipeline.length,
      });

      // ── 4. Map to distilled DTO ────────────────────────────────────────
      interface AggregateCollege {
        _id: unknown;
        name?: string;
        city?: string;
        state?: string;
        logoUrl?: string;
        filteredContacts: Array<{
          _id: unknown;
          firstName?: string;
          lastName?: string;
          email?: string;
          phoneNumber?: string;
          position?: string;
          sport?: string;
          twitter?: string;
        }>;
      }

      const results = (colleges as AggregateCollege[]).map((c) => ({
        id: String(c._id),
        name: c.name ?? 'Unknown',
        city: c.city ?? null,
        state: c.state ?? null,
        logoUrl: c.logoUrl ?? null,
        coaches: c.filteredContacts.map((contact) => ({
          id: String(contact._id),
          firstName: contact.firstName ?? null,
          lastName: contact.lastName ?? null,
          fullName: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null,
          position: contact.position ?? null,
          sport: contact.sport ?? null,
          email: contact.email ?? null,
          phoneNumber: contact.phoneNumber ?? null,
          twitter: contact.twitter ?? null,
        })),
        coachCount: c.filteredContacts.length,
      }));

      // ── 5. Calculate total coaches found ─────────────────────────────
      const totalCoaches = results.reduce((sum, r) => sum + r.coachCount, 0);
      emitStage?.('fetching_data', {
        icon: 'search',
        collegeName,
        totalCoaches,
        collegeCount: results.length,
        phase: 'coaching_staff_found',
      });

      // ── 6. Return results ────────────────────────────────────────────
      if (totalCoaches === 0) {
        const queryLabel =
          collegeName && collegeName.trim().length > 0
            ? `"${collegeName}"`
            : 'the requested filters';

        return {
          success: true,
          data: {
            count: 0,
            collegeName: collegeName ?? null,
            filtersApplied: buildFilterSummary(input),
            colleges: [],
            _agent_hint:
              results.length === 0
                ? `No colleges matching ${queryLabel} were found in the NXT1 database. ` +
                  "You should now use the 'web_search' tool to find coaching staff contact " +
                  'information online, or ask the user to verify the college name.'
                : `Found ${results.length} college(s) matching ${queryLabel} but none had ` +
                  'coaching contacts in the database' +
                  (sport ? ` for ${sport}` : '') +
                  (division ? ` in ${division}` : '') +
                  (position ? ` matching "${position}"` : '') +
                  '. ' +
                  "You should now use the 'web_search' tool to find their coaching staff " +
                  'contact information online.',
          },
        };
      }

      return {
        success: true,
        data: {
          count: totalCoaches,
          collegesFound: results.length,
          collegeName: collegeName ?? null,
          filtersApplied: buildFilterSummary(input),
          colleges: results,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'College coach search failed';
      logger.error('[search_college_coaches] Error executing coach search', {
        tool: 'search_college_coaches',
        error: message,
        collegeName: collegeName ?? null,
        sport,
        division,
        position,
        stack: err instanceof Error ? err.stack : undefined,
      });
      return { success: false, error: message };
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Escape special regex characters from user input to prevent ReDoS attacks. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function normalizeSportAndDivision(
  rawSport?: string,
  rawDivision?: string
): { sport?: string; division?: string } {
  const sport = rawSport?.trim();
  const division = rawDivision?.trim();

  if (!sport) return { sport, division };

  const extractedDivision = extractDivisionFromSportPhrase(sport);
  if (!extractedDivision) return { sport: normalizeSportPhrase(sport), division };

  const cleanedSport = removeDivisionFromSportPhrase(sport, extractedDivision).trim();
  return {
    sport: cleanedSport.length > 0 ? normalizeSportPhrase(cleanedSport) : undefined,
    division: division ?? extractedDivision,
  };
}

function normalizeSportPhrase(sport: string): string {
  const value = sport.trim();
  const lower = value.toLowerCase();

  const aliases: Array<{ keyword: string; canonical: string }> = [
    { keyword: 'basketball', canonical: 'Basketball' },
    { keyword: 'football', canonical: 'Football' },
    { keyword: 'baseball', canonical: 'Baseball' },
    { keyword: 'softball', canonical: 'Softball' },
    { keyword: 'soccer', canonical: 'Soccer' },
    { keyword: 'lacrosse', canonical: 'Lacrosse' },
    { keyword: 'volleyball', canonical: 'Volleyball' },
    { keyword: 'golf', canonical: 'Golf' },
    { keyword: 'track', canonical: 'Track & Field' },
    { keyword: 'cross country', canonical: 'Cross Country' },
    { keyword: 'field hockey', canonical: 'Field Hockey' },
    { keyword: 'ice hockey', canonical: 'Ice Hockey' },
    { keyword: 'tennis', canonical: 'Tennis' },
    { keyword: 'swimming', canonical: 'Swimming' },
    { keyword: 'rowing', canonical: 'Rowing' },
    { keyword: 'wrestling', canonical: 'Wrestling' },
    { keyword: 'gymnastics', canonical: 'Gymnastics' },
    { keyword: 'water polo', canonical: 'Water Polo' },
    { keyword: 'bowling', canonical: 'Bowling' },
  ];

  const alias = aliases.find((entry) => lower.includes(entry.keyword));
  return alias ? alias.canonical : value;
}

function extractDivisionFromSportPhrase(sport: string): string | undefined {
  const value = sport.toLowerCase();

  if (/(^|\s)(fbs)(\s|$)/i.test(value)) return 'FBS';
  if (/(^|\s)(fcs)(\s|$)/i.test(value)) return 'FCS';
  if (/(^|\s)(naia)(\s|$)/i.test(value)) return 'NAIA';
  if (/(^|\s)(njcaa|juco)(\s|$)/i.test(value)) return 'JUCO';
  if (/(^|\s)(division\s*(1|i)|d\s*1|di|ncaa\s*d\s*1|ncaa\s*division\s*i)(\s|$)/i.test(value)) {
    return 'D1';
  }
  if (/(^|\s)(division\s*(2|ii)|d\s*2|dii|ncaa\s*d\s*2|ncaa\s*division\s*ii)(\s|$)/i.test(value)) {
    return 'D2';
  }
  if (
    /(^|\s)(division\s*(3|iii)|d\s*3|diii|ncaa\s*d\s*3|ncaa\s*division\s*iii)(\s|$)/i.test(value)
  ) {
    return 'D3';
  }

  return undefined;
}

function removeDivisionFromSportPhrase(sport: string, division: string): string {
  const patternsByDivision: Record<string, RegExp> = {
    D1: /\b(?:ncaa\s*)?(?:division\s*(?:1|i)|d\s*1|di)\b/gi,
    D2: /\b(?:ncaa\s*)?(?:division\s*(?:2|ii)|d\s*2|dii)\b/gi,
    D3: /\b(?:ncaa\s*)?(?:division\s*(?:3|iii)|d\s*3|diii)\b/gi,
    FBS: /\bfbs\b/gi,
    FCS: /\bfcs\b/gi,
    NAIA: /\bnaia\b/gi,
    JUCO: /\b(?:njcaa|juco)\b/gi,
  };

  const pattern = patternsByDivision[division] ?? null;
  if (!pattern) return sport;

  return sport.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
}

function buildDivisionExpr(division: string, sport?: string): Record<string, unknown> {
  const divisionRegex = normalizeDivisionInput(division, sport);

  const divisionMatch: Record<string, unknown> = {
    $or: [
      {
        $regexMatch: {
          input: { $ifNull: ['$$si.v.division', ''] },
          regex: divisionRegex,
          options: 'i',
        },
      },
      {
        $and: [
          { $isArray: '$$si.v.division' },
          {
            $anyElementTrue: {
              $map: {
                input: '$$si.v.division',
                as: 'div',
                in: {
                  $regexMatch: {
                    input: { $toString: '$$div' },
                    regex: divisionRegex,
                    options: 'i',
                  },
                },
              },
            },
          },
        ],
      },
    ],
  };

  const sportCondition = sport
    ? {
        $regexMatch: {
          input: '$$si.k',
          regex: escapeRegex(sport),
          options: 'i',
        },
      }
    : null;

  const filterCond = sportCondition ? { $and: [sportCondition, divisionMatch] } : divisionMatch;

  return {
    $gt: [
      {
        $size: {
          $filter: {
            input: { $objectToArray: { $ifNull: ['$sportInfo', {}] } },
            as: 'si',
            cond: filterCond,
          },
        },
      },
      0,
    ],
  };
}

function normalizeDivisionInput(division: string, sport?: string): string {
  const cleaned = division.trim().toLowerCase().replace(/\s+/g, ' ');

  const isFootball = (sport ?? '').toLowerCase().includes('football');

  if (/^(d\.?\s*1|d\.?\s*i|division\s*(1|i)|ncaa\s*d\.?\s*1|ncaa\s*division\s*i)$/.test(cleaned)) {
    return isFootball
      ? '^(FBS|FCS|NCAA D1|NCAA Division I|Division I|D1|DI|NCAA DI)$'
      : '^(NCAA D1|NCAA Division I|Division I|D1|DI|NCAA DI)$';
  }

  if (
    /^(d\.?\s*2|d\.?\s*ii|division\s*(2|ii)|ncaa\s*d\.?\s*2|ncaa\s*division\s*ii)$/.test(cleaned)
  ) {
    return '^(NCAA DII|NCAA Division II|Division II|D2|DII|NCAA D2)$';
  }

  if (
    /^(d\.?\s*3|d\.?\s*iii|division\s*(3|iii)|ncaa\s*d\.?\s*3|ncaa\s*division\s*iii)$/.test(cleaned)
  ) {
    return '^(NCAA DIII|NCAA Division III|Division III|D3|DIII|NCAA D3)$';
  }

  if (/^(naia)$/.test(cleaned)) return '^(NAIA)$';
  if (/^(juco|njcaa)$/.test(cleaned)) return '^(NJCAA|JUCO)$';
  if (/^(fbs)$/.test(cleaned)) return '^(FBS)$';
  if (/^(fcs)$/.test(cleaned)) return '^(FCS)$';

  return escapeRegex(division.trim());
}

/** Build a human-readable summary of which filters were applied. */
function buildFilterSummary(input: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  const keys = ['collegeName', 'sport', 'division', 'state', 'position', 'limit'];
  for (const key of keys) {
    if (input[key] != null && input[key] !== '' && input[key] !== false) {
      summary[key] = input[key];
    }
  }
  return summary;
}
