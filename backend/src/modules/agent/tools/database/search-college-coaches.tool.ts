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
  collegeName: z.string().trim().min(1),
  sport: z.string().trim().min(1).optional(),
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
    'or contact details for a specific college sports program. ' +
    'You can filter by college name (required), sport, state, and coach position/title. ' +
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

    const { collegeName, sport, state: rawState, position } = parsed.data;
    const rawLimit = parsed.data.limit ?? 5;
    const limit = Math.min(Math.max(1, Math.round(rawLimit)), MAX_COLLEGES);

    // ── 2. Build the college match filter ──────────────────────────────
    const collegeMatch: Record<string, unknown> = {};

    // Use regex matching so this tool doesn't fail if Mongo text indexes are unavailable.
    collegeMatch['name'] = { $regex: escapeRegex(collegeName), $options: 'i' };

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

    emitStage?.('fetching_data', {
      icon: 'search',
      collegeName,
      sport,
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
        collegeName,
        sport,
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
        collegeName,
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
        return {
          success: true,
          data: {
            count: 0,
            collegeName,
            filtersApplied: buildFilterSummary(input),
            colleges: [],
            _agent_hint:
              results.length === 0
                ? `No colleges matching "${collegeName}" were found in the NXT1 database. ` +
                  "You should now use the 'web_search' tool to find coaching staff contact " +
                  'information online, or ask the user to verify the college name.'
                : `Found ${results.length} college(s) matching "${collegeName}" but none had ` +
                  'coaching contacts in the database' +
                  (sport ? ` for ${sport}` : '') +
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
          collegeName,
          filtersApplied: buildFilterSummary(input),
          colleges: results,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'College coach search failed';
      logger.error('[search_college_coaches] Error executing coach search', {
        tool: 'search_college_coaches',
        error: message,
        collegeName,
        sport,
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

/** Build a human-readable summary of which filters were applied. */
function buildFilterSummary(input: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  const keys = ['collegeName', 'sport', 'state', 'position', 'limit'];
  for (const key of keys) {
    if (input[key] != null && input[key] !== '' && input[key] !== false) {
      summary[key] = input[key];
    }
  }
  return summary;
}
