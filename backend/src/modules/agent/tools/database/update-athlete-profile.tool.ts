/**
 * @fileoverview Update Athlete Profile Tool — Production-Ready Sport-Scoped Writer
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Agent X tool that writes extracted athlete data to a user's Firestore
 * profile. Designed for the Data Coordinator to call AFTER scraping an
 * external platform (MaxPreps, Hudl, 247Sports, etc.) and extracting
 * structured fields from the raw markdown.
 *
 * Key architectural decisions:
 *
 * 1. **Sport-scoped merging**: Sport-specific data (positions, metrics, stats,
 *    team info, coach, jersey number) is merged into the correct `sports[i]`
 *    entry using Firestore dot-notation — never overwriting the entire array.
 *    The target sport index is resolved by matching `targetSport` against the
 *    user's existing `sports[]` array, or appending a new entry if the sport
 *    doesn't exist yet.
 *
 * 2. **VerifiedMetric / VerifiedStat**: Extracted physical measurements and
 *    season statistics are written as `VerifiedMetric[]` into
 *    `sports[i].verifiedMetrics` and `VerifiedStat[]` into
 *    `sports[i].featuredStats` — each stamped with `source`, `verified: false`,
 *    and `dateRecorded`. Duplicates are detected by `field` key and merged
 *    (latest value wins).
 *
 * 3. **ConnectedSource sync records**: Every successful write appends or updates
 *    a `ConnectedSource` entry in the top-level `connectedSources[]` array with
 *    the actual `profileUrl`, `syncStatus`, `syncedFields`, and `lastSyncedAt`.
 *
 * 4. **Append-safe arrays**: `teamHistory[]` and `awards[]` are merged by
 *    deduplication keys (name+sport+season for team history, title+sport+season
 *    for awards) — new entries are appended, existing entries are updated.
 *
 * 5. **Academics**: GPA, SAT, ACT, class rank, and intended major are written
 *    to `athlete.academics` — the correct location per the AthleteData model.
 *
 * Security:
 * - Only `data_coordinator` and `performance_coordinator` can invoke this tool.
 * - System fields (email, role, status, planTier, _counters) are NEVER writable.
 * - All writes are scoped to the userId from the job payload — the router
 *   enforces upstream that the agent cannot target arbitrary users.
 * - Source attribution is mandatory on every write.
 */

import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult } from '../base.tool.js';
import { getCacheService } from '../../../../services/cache.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../services/users.service.js';
import { ContextBuilder } from '../../memory/context-builder.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const USERS_COLLECTION = 'Users';

const VALIDATION = {
  MIN_GRADUATION_YEAR: new Date().getFullYear() - 2,
  MAX_GRADUATION_YEAR: new Date().getFullYear() + 8,
  MAX_ABOUT_ME_LENGTH: 2000,
  MAX_NAME_LENGTH: 100,
  MAX_POSITIONS: 5,
  MAX_METRICS: 50,
  MAX_STATS: 100,
  MAX_AWARDS: 50,
  MAX_TEAM_HISTORY: 30,
} as const;

// ─── Input Interfaces (what the LLM sends) ─────────────────────────────────

interface MetricInput {
  readonly field: string;
  readonly label: string;
  readonly value: string | number;
  readonly unit?: string;
  readonly category?: string;
}

interface StatInput {
  readonly field: string;
  readonly label: string;
  readonly value: string | number;
  readonly unit?: string;
  readonly category?: string;
  readonly season?: string;
}

interface TeamInfoInput {
  readonly name?: string;
  readonly type?: string;
  readonly mascot?: string;
  readonly logoUrl?: string;
  readonly primaryColor?: string;
  readonly secondaryColor?: string;
  /** @deprecated Use primaryColor + secondaryColor */
  readonly colors?: string[];
  readonly conference?: string;
  readonly division?: string;
}

interface CoachInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly email?: string;
  readonly phone?: string;
  readonly title?: string;
}

interface TeamHistoryInput {
  readonly name: string;
  readonly type?: string;
  readonly sport?: string;
  readonly location?: string;
  readonly record?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly isCurrent?: boolean;
}

interface AwardInput {
  readonly title: string;
  readonly category?: string;
  readonly sport?: string;
  readonly season?: string;
  readonly issuer?: string;
  readonly date?: string;
}

interface AcademicsInput {
  readonly gpa?: number;
  readonly weightedGpa?: number;
  readonly satScore?: number;
  readonly actScore?: number;
  readonly classRank?: number;
  readonly classSize?: number;
  readonly ncaaEligibilityCenter?: boolean;
  readonly intendedMajor?: string;
}

interface LocationInput {
  readonly city?: string;
  readonly state?: string;
  readonly country?: string;
}

interface SportDataInput {
  readonly positions?: string[];
  readonly jerseyNumber?: number | string;
  readonly side?: string;
  readonly aboutMe?: string;
  readonly metrics?: MetricInput[];
  readonly stats?: StatInput[];
  readonly team?: TeamInfoInput;
  readonly clubTeam?: TeamInfoInput;
  readonly coach?: CoachInput;
}

interface FieldsInput {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly displayName?: string;
  readonly aboutMe?: string;
  readonly height?: string;
  readonly weight?: string;
  readonly classOf?: number;
  readonly location?: LocationInput;
  readonly sportData?: SportDataInput;
  readonly teamHistory?: TeamHistoryInput[];
  readonly awards?: AwardInput[];
  readonly academics?: AcademicsInput;
}

// ─── Tool ───────────────────────────────────────────────────────────────────

export class UpdateAthleteProfileTool extends BaseTool {
  readonly name = 'update_athlete_profile';

  readonly description =
    "Updates an athlete's Firestore profile with data extracted from external platforms. " +
    'Call this AFTER scraping a platform page and extracting structured data.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID of the athlete.\n' +
    '- source (required): Platform slug (e.g. "maxpreps", "hudl", "247sports").\n' +
    '- profileUrl (required): The URL that was scraped (stored in connectedSources).\n' +
    '- targetSport (required): Sport key to scope sport-specific data into (e.g. "football", "basketball").\n' +
    '- fields (required): Object with extracted data. Supported sections:\n' +
    '  • firstName, lastName, displayName, aboutMe — identity/bio strings.\n' +
    '  • height — string like "6\'2\\"" or "74 inches".\n' +
    '  • weight — string like "185 lbs".\n' +
    '  • classOf — graduation year integer (e.g. 2027).\n' +
    '  • location — { city, state, country }.\n' +
    '  • sportData — sport-scoped fields merged into the target sport:\n' +
    '    - positions: string[] (e.g. ["QB", "Safety"]).\n' +
    '    - jerseyNumber: number or string.\n' +
    '    - side: "offense" | "defense" | "both" | "N/A".\n' +
    '    - aboutMe: sport-specific bio.\n' +
    '    - metrics: array of { field, label, value, unit?, category? } — physical measurements.\n' +
    '    - stats: array of { field, label, value, unit?, category?, season? } — season statistics.\n' +
    '    - team: { name, type?, mascot?, colors?, conference?, division? }.\n' +
    '    - clubTeam: same shape as team.\n' +
    '    - coach: { firstName, lastName, email?, phone?, title? }.\n' +
    '  • teamHistory: array of { name, type?, sport?, location?, record?, startDate?, endDate?, isCurrent? }.\n' +
    '  • awards: array of { title, category?, sport?, season?, issuer?, date? }.\n' +
    '  • academics: { gpa?, weightedGpa?, satScore?, actScore?, classRank?, classSize?, ncaaEligibilityCenter?, intendedMajor? }.';

  readonly parameters = {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'The Firebase UID of the athlete whose profile to update.',
      },
      source: {
        type: 'string',
        description:
          'The platform slug the data was extracted from (e.g. "maxpreps", "hudl", "247sports"). ' +
          'Stamped as the DataSource on every VerifiedMetric and VerifiedStat.',
      },
      profileUrl: {
        type: 'string',
        description: 'The exact URL that was scraped. Stored in the connectedSources sync record.',
      },
      faviconUrl: {
        type: 'string',
        description:
          'The favicon URL of the scraped platform, extracted from the page <link rel="icon"> tag by the scrape_webpage tool. ' +
          'Stored in connectedSources for UI display when no built-in platform icon exists.',
      },
      targetSport: {
        type: 'string',
        description:
          'The sport key to scope sport-specific data into (e.g. "football", "basketball", "soccer"). ' +
          "Must match one of the user's existing sports, or a new sport entry will be created.",
      },
      fields: {
        type: 'object',
        description:
          'The extracted profile data. See the tool description for the full schema. ' +
          'Only recognized fields are accepted — unknown keys are silently dropped.',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          displayName: { type: 'string' },
          aboutMe: { type: 'string' },
          height: { type: 'string' },
          weight: { type: 'string' },
          classOf: { type: 'number' },
          location: {
            type: 'object',
            properties: {
              city: { type: 'string' },
              state: { type: 'string' },
              country: { type: 'string' },
            },
          },
          sportData: {
            type: 'object',
            properties: {
              positions: { type: 'array', items: { type: 'string' } },
              jerseyNumber: { type: ['number', 'string'] },
              side: { type: 'string' },
              aboutMe: { type: 'string' },
              metrics: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    field: { type: 'string' },
                    label: { type: 'string' },
                    value: { type: ['string', 'number'] },
                    unit: { type: 'string' },
                    category: { type: 'string' },
                  },
                  required: ['field', 'label', 'value'],
                },
              },
              stats: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    field: { type: 'string' },
                    label: { type: 'string' },
                    value: { type: ['string', 'number'] },
                    unit: { type: 'string' },
                    category: { type: 'string' },
                    season: { type: 'string' },
                  },
                  required: ['field', 'label', 'value'],
                },
              },
              team: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string' },
                  mascot: { type: 'string' },
                  colors: { type: 'array', items: { type: 'string' } },
                  conference: { type: 'string' },
                  division: { type: 'string' },
                },
              },
              clubTeam: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string' },
                  mascot: { type: 'string' },
                  colors: { type: 'array', items: { type: 'string' } },
                  conference: { type: 'string' },
                  division: { type: 'string' },
                },
              },
              coach: {
                type: 'object',
                properties: {
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  email: { type: 'string' },
                  phone: { type: 'string' },
                  title: { type: 'string' },
                },
                required: ['firstName', 'lastName'],
              },
            },
          },
          teamHistory: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string' },
                sport: { type: 'string' },
                location: { type: 'string' },
                record: { type: 'string' },
                startDate: { type: 'string' },
                endDate: { type: 'string' },
                isCurrent: { type: 'boolean' },
              },
              required: ['name'],
            },
          },
          awards: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                category: { type: 'string' },
                sport: { type: 'string' },
                season: { type: 'string' },
                issuer: { type: 'string' },
                date: { type: 'string' },
              },
              required: ['title'],
            },
          },
          academics: {
            type: 'object',
            properties: {
              gpa: { type: 'number' },
              weightedGpa: { type: 'number' },
              satScore: { type: 'number' },
              actScore: { type: 'number' },
              classRank: { type: 'number' },
              classSize: { type: 'number' },
              ncaaEligibilityCenter: { type: 'boolean' },
              intendedMajor: { type: 'string' },
            },
          },
        },
      },
    },
    required: ['userId', 'source', 'profileUrl', 'targetSport', 'fields'],
  } as const;

  override readonly allowedAgents = ['data_coordinator', 'performance_coordinator'] as const;

  readonly isMutation = true;
  readonly category = 'database' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  // ─── Execute ────────────────────────────────────────────────────────────

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const userId = this.requireString(input, 'userId');
    if (!userId) return this.paramError('userId', 'non-empty string');

    const source = this.requireString(input, 'source');
    if (!source) return this.paramError('source', 'non-empty string (e.g. "maxpreps")');

    const profileUrl = this.requireString(input, 'profileUrl');
    if (!profileUrl) return this.paramError('profileUrl', 'non-empty string (the scraped URL)');

    const faviconUrl =
      typeof input['faviconUrl'] === 'string' && input['faviconUrl'].trim().length > 0
        ? input['faviconUrl'].trim()
        : undefined;

    const targetSport = this.requireString(input, 'targetSport');
    if (!targetSport) return this.paramError('targetSport', 'non-empty string (e.g. "football")');

    const rawFields = input['fields'];
    if (!rawFields || typeof rawFields !== 'object' || Array.isArray(rawFields)) {
      return this.paramError('fields', 'an object with profile data');
    }

    const fields = rawFields as FieldsInput;

    // ── Validate ───────────────────────────────────────────────────────
    const errors = this.validateFields(fields);
    if (errors.length > 0) {
      return { success: false, error: `Validation failed: ${errors.join('; ')}` };
    }

    // ── Read existing user doc ─────────────────────────────────────────
    const userRef = this.db.collection(USERS_COLLECTION).doc(userId);

    try {
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        return { success: false, error: `User "${userId}" not found in the database.` };
      }

      const userData = userDoc.data() as Record<string, unknown>;
      const existingSports = (userData['sports'] ?? []) as Record<string, unknown>[];
      const now = new Date().toISOString();

      // ── Build Firestore update payload (dot-notation) ────────────────
      const payload: Record<string, unknown> = {};
      const writtenSections: string[] = [];

      // --- Top-level identity fields ---
      this.mergeIdentity(fields, payload, writtenSections);

      // --- Location ---
      if (fields.location) {
        this.mergeLocation(fields.location, payload, writtenSections);
      }

      // --- Graduation year ---
      if (fields.classOf !== undefined) {
        payload['classOf'] = fields.classOf;
        writtenSections.push('classOf');
      }

      // --- Sport-scoped data ---
      const sportIndex = this.resolveSportIndex(existingSports, targetSport);
      const isNewSport = sportIndex >= existingSports.length;

      if (isNewSport) {
        // Append a new sport entry with all provided data
        const newSportProfile = this.buildNewSportProfile(
          targetSport,
          fields.sportData,
          source,
          now,
          existingSports.length
        );
        payload[`sports`] = FieldValue.arrayUnion(newSportProfile);
        writtenSections.push(`sports[NEW:${targetSport}]`);
      } else if (fields.sportData) {
        // Merge into existing sport at the resolved index
        this.mergeSportData(
          fields.sportData,
          sportIndex,
          existingSports[sportIndex] as Record<string, unknown>,
          source,
          now,
          payload,
          writtenSections
        );
      }

      // --- Team History (append/merge deduplicated) ---
      if (fields.teamHistory?.length) {
        const existingHistory = (userData['teamHistory'] ?? []) as Record<string, unknown>[];
        payload['teamHistory'] = this.mergeTeamHistory(
          existingHistory,
          fields.teamHistory,
          targetSport
        );
        writtenSections.push('teamHistory');
      }

      // --- Awards (append/merge deduplicated) ---
      if (fields.awards?.length) {
        const existingAwards = (userData['awards'] ?? []) as Record<string, unknown>[];
        payload['awards'] = this.mergeAwards(existingAwards, fields.awards, targetSport);
        writtenSections.push('awards');
      }

      // --- Academics (merge into athlete.academics) ---
      if (fields.academics) {
        const existingAthlete = (userData['athlete'] ?? {}) as Record<string, unknown>;
        const existingAcademics = (existingAthlete['academics'] ?? {}) as Record<string, unknown>;
        payload['athlete.academics'] = {
          ...existingAcademics,
          ...this.sanitizeAcademics(fields.academics),
        };
        writtenSections.push('academics');
      }

      // --- Connected source sync record ---
      const syncedFields = [...writtenSections];
      payload['connectedSources'] = this.buildConnectedSourcesUpdate(
        (userData['connectedSources'] ?? []) as Record<string, unknown>[],
        source,
        profileUrl,
        targetSport,
        syncedFields,
        now,
        faviconUrl
      );

      // --- Timestamp ---
      payload['updatedAt'] = FieldValue.serverTimestamp();

      if (writtenSections.length === 0) {
        return {
          success: false,
          error: 'No actionable fields were provided in the payload.',
        };
      }

      // ── Write ────────────────────────────────────────────────────────
      await userRef.update(payload);

      // ── Cache invalidation (best-effort) ─────────────────────────────
      try {
        const cache = getCacheService();
        await cache.del(USER_CACHE_KEYS.USER_BY_ID(userId));
        const contextBuilder = new ContextBuilder();
        await contextBuilder.invalidateContext(userId);
      } catch {
        // Cache invalidation is best-effort
      }

      return {
        success: true,
        data: {
          userId,
          source,
          profileUrl,
          targetSport,
          sportIndex: isNewSport ? existingSports.length : sportIndex,
          isNewSport,
          writtenSections,
          sectionCount: writtenSections.length,
          message:
            `Successfully updated ${writtenSections.length} section(s) on profile ` +
            `for sport "${targetSport}" from source "${source}": ${writtenSections.join(', ')}.`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update profile';
      return { success: false, error: message };
    }
  }

  // ─── Validation ─────────────────────────────────────────────────────────

  private validateFields(fields: FieldsInput): string[] {
    const errors: string[] = [];

    if (fields.firstName !== undefined) {
      if (typeof fields.firstName !== 'string' || fields.firstName.trim().length === 0) {
        errors.push('firstName must be a non-empty string');
      } else if (fields.firstName.length > VALIDATION.MAX_NAME_LENGTH) {
        errors.push(`firstName exceeds ${VALIDATION.MAX_NAME_LENGTH} characters`);
      }
    }

    if (fields.lastName !== undefined) {
      if (typeof fields.lastName !== 'string' || fields.lastName.trim().length === 0) {
        errors.push('lastName must be a non-empty string');
      } else if (fields.lastName.length > VALIDATION.MAX_NAME_LENGTH) {
        errors.push(`lastName exceeds ${VALIDATION.MAX_NAME_LENGTH} characters`);
      }
    }

    if (fields.aboutMe !== undefined) {
      if (typeof fields.aboutMe !== 'string') {
        errors.push('aboutMe must be a string');
      } else if (fields.aboutMe.length > VALIDATION.MAX_ABOUT_ME_LENGTH) {
        errors.push(`aboutMe exceeds ${VALIDATION.MAX_ABOUT_ME_LENGTH} characters`);
      }
    }

    if (fields.height !== undefined) {
      if (typeof fields.height !== 'string' || fields.height.trim().length === 0) {
        errors.push('height must be a non-empty string (e.g. "6\'2\\"")');
      }
    }

    if (fields.weight !== undefined) {
      if (typeof fields.weight !== 'string' || fields.weight.trim().length === 0) {
        errors.push('weight must be a non-empty string (e.g. "185 lbs")');
      }
    }

    if (fields.classOf !== undefined) {
      if (
        typeof fields.classOf !== 'number' ||
        !Number.isInteger(fields.classOf) ||
        fields.classOf < VALIDATION.MIN_GRADUATION_YEAR ||
        fields.classOf > VALIDATION.MAX_GRADUATION_YEAR
      ) {
        errors.push(
          `classOf must be an integer between ${VALIDATION.MIN_GRADUATION_YEAR} and ${VALIDATION.MAX_GRADUATION_YEAR}`
        );
      }
    }

    if (fields.location !== undefined) {
      if (
        !fields.location ||
        typeof fields.location !== 'object' ||
        Array.isArray(fields.location)
      ) {
        errors.push('location must be an object with city, state, country');
      }
    }

    if (fields.sportData?.positions !== undefined) {
      if (!Array.isArray(fields.sportData.positions)) {
        errors.push('sportData.positions must be a string array');
      } else if (fields.sportData.positions.length > VALIDATION.MAX_POSITIONS) {
        errors.push(`sportData.positions exceeds maximum of ${VALIDATION.MAX_POSITIONS}`);
      }
    }

    if (fields.sportData?.metrics !== undefined) {
      if (!Array.isArray(fields.sportData.metrics)) {
        errors.push('sportData.metrics must be an array');
      } else if (fields.sportData.metrics.length > VALIDATION.MAX_METRICS) {
        errors.push(`sportData.metrics exceeds maximum of ${VALIDATION.MAX_METRICS}`);
      } else {
        for (const m of fields.sportData.metrics) {
          if (!m.field || !m.label || m.value === undefined) {
            errors.push('Each metric must have field, label, and value');
            break;
          }
        }
      }
    }

    if (fields.sportData?.stats !== undefined) {
      if (!Array.isArray(fields.sportData.stats)) {
        errors.push('sportData.stats must be an array');
      } else if (fields.sportData.stats.length > VALIDATION.MAX_STATS) {
        errors.push(`sportData.stats exceeds maximum of ${VALIDATION.MAX_STATS}`);
      } else {
        for (const s of fields.sportData.stats) {
          if (!s.field || !s.label || s.value === undefined) {
            errors.push('Each stat must have field, label, and value');
            break;
          }
        }
      }
    }

    if (fields.teamHistory !== undefined) {
      if (!Array.isArray(fields.teamHistory)) {
        errors.push('teamHistory must be an array');
      } else if (fields.teamHistory.length > VALIDATION.MAX_TEAM_HISTORY) {
        errors.push(`teamHistory exceeds maximum of ${VALIDATION.MAX_TEAM_HISTORY}`);
      } else {
        for (const t of fields.teamHistory) {
          if (!t.name || typeof t.name !== 'string') {
            errors.push('Each teamHistory entry must have a non-empty name');
            break;
          }
        }
      }
    }

    if (fields.awards !== undefined) {
      if (!Array.isArray(fields.awards)) {
        errors.push('awards must be an array');
      } else if (fields.awards.length > VALIDATION.MAX_AWARDS) {
        errors.push(`awards exceeds maximum of ${VALIDATION.MAX_AWARDS}`);
      } else {
        for (const a of fields.awards) {
          if (!a.title || typeof a.title !== 'string') {
            errors.push('Each award must have a non-empty title');
            break;
          }
        }
      }
    }

    if (fields.academics !== undefined) {
      if (
        !fields.academics ||
        typeof fields.academics !== 'object' ||
        Array.isArray(fields.academics)
      ) {
        errors.push('academics must be an object');
      } else {
        if (
          fields.academics.gpa !== undefined &&
          (typeof fields.academics.gpa !== 'number' ||
            fields.academics.gpa < 0 ||
            fields.academics.gpa > 5.0)
        ) {
          errors.push('academics.gpa must be a number between 0 and 5.0');
        }
        if (
          fields.academics.satScore !== undefined &&
          (typeof fields.academics.satScore !== 'number' ||
            fields.academics.satScore < 400 ||
            fields.academics.satScore > 1600)
        ) {
          errors.push('academics.satScore must be between 400 and 1600');
        }
        if (
          fields.academics.actScore !== undefined &&
          (typeof fields.academics.actScore !== 'number' ||
            fields.academics.actScore < 1 ||
            fields.academics.actScore > 36)
        ) {
          errors.push('academics.actScore must be between 1 and 36');
        }
      }
    }

    return errors;
  }

  // ─── Merge Helpers ──────────────────────────────────────────────────────

  private mergeIdentity(
    fields: FieldsInput,
    payload: Record<string, unknown>,
    written: string[]
  ): void {
    if (fields.firstName) {
      payload['firstName'] = fields.firstName.trim();
      written.push('firstName');
    }
    if (fields.lastName) {
      payload['lastName'] = fields.lastName.trim();
      written.push('lastName');
    }
    if (fields.displayName) {
      payload['displayName'] = fields.displayName.trim();
      written.push('displayName');
    }
    if (fields.aboutMe) {
      payload['aboutMe'] = fields.aboutMe.trim();
      written.push('aboutMe');
    }
    if (fields.height) {
      payload['height'] = fields.height.trim();
      written.push('height');
    }
    if (fields.weight) {
      payload['weight'] = fields.weight.trim();
      written.push('weight');
    }
  }

  private mergeLocation(
    location: LocationInput,
    payload: Record<string, unknown>,
    written: string[]
  ): void {
    const loc: Record<string, string> = {};
    if (location.city) loc['city'] = location.city.trim();
    if (location.state) loc['state'] = location.state.trim();
    if (location.country) loc['country'] = location.country.trim();
    if (Object.keys(loc).length > 0) {
      payload['location'] = loc;
      written.push('location');
    }
  }

  /**
   * Find the index of the user's existing sport entry matching `targetSport`.
   * Returns the array length if no match (signals "append new sport").
   */
  private resolveSportIndex(
    existingSports: Record<string, unknown>[],
    targetSport: string
  ): number {
    const normalized = targetSport.toLowerCase().trim();
    for (let i = 0; i < existingSports.length; i++) {
      const sport = existingSports[i];
      if (
        typeof sport['sport'] === 'string' &&
        sport['sport'].toLowerCase().trim() === normalized
      ) {
        return i;
      }
    }
    return existingSports.length;
  }

  /**
   * Build a new SportProfile object for appending when the target sport
   * doesn't exist in the user's sports[] array yet.
   */
  private buildNewSportProfile(
    targetSport: string,
    sportData: SportDataInput | undefined,
    source: string,
    now: string,
    order: number
  ): Record<string, unknown> {
    const profile: Record<string, unknown> = {
      sport: targetSport,
      order,
      accountType: 'free',
      createdAt: now,
      updatedAt: now,
    };

    if (!sportData) return profile;

    if (sportData.positions?.length) profile['positions'] = sportData.positions;
    if (sportData.jerseyNumber !== undefined) profile['jerseyNumber'] = sportData.jerseyNumber;
    if (sportData.side) profile['side'] = sportData.side;
    if (sportData.aboutMe) profile['aboutMe'] = sportData.aboutMe.trim();

    if (sportData.metrics?.length) {
      profile['verifiedMetrics'] = sportData.metrics.map((m) =>
        this.toVerifiedMetric(m, source, now)
      );
    }

    if (sportData.stats?.length) {
      profile['featuredStats'] = sportData.stats.map((s) => this.toVerifiedStat(s, source, now));
    }

    if (sportData.team) profile['team'] = this.sanitizeTeamInfo(sportData.team);
    if (sportData.clubTeam) profile['clubTeam'] = this.sanitizeTeamInfo(sportData.clubTeam);
    if (sportData.coach) profile['coach'] = this.sanitizeCoach(sportData.coach);

    return profile;
  }

  /**
   * Merge sport-scoped data into an existing sport entry using
   * Firestore dot-notation (e.g. `sports.0.positions`).
   */
  private mergeSportData(
    sportData: SportDataInput,
    sportIndex: number,
    existingSport: Record<string, unknown>,
    source: string,
    now: string,
    payload: Record<string, unknown>,
    written: string[]
  ): void {
    const prefix = `sports.${sportIndex}`;

    if (sportData.positions?.length) {
      payload[`${prefix}.positions`] = sportData.positions;
      written.push('sportData.positions');
    }

    if (sportData.jerseyNumber !== undefined) {
      payload[`${prefix}.jerseyNumber`] = sportData.jerseyNumber;
      written.push('sportData.jerseyNumber');
    }

    if (sportData.side) {
      payload[`${prefix}.side`] = sportData.side;
      written.push('sportData.side');
    }

    if (sportData.aboutMe) {
      payload[`${prefix}.aboutMe`] = sportData.aboutMe.trim();
      written.push('sportData.aboutMe');
    }

    if (sportData.metrics?.length) {
      const existingMetrics = (existingSport['verifiedMetrics'] ?? []) as Record<string, unknown>[];
      payload[`${prefix}.verifiedMetrics`] = this.mergeVerifiedMetrics(
        existingMetrics,
        sportData.metrics,
        source,
        now
      );
      written.push('sportData.verifiedMetrics');
    }

    if (sportData.stats?.length) {
      const existingStats = (existingSport['featuredStats'] ?? []) as Record<string, unknown>[];
      payload[`${prefix}.featuredStats`] = this.mergeVerifiedStats(
        existingStats,
        sportData.stats,
        source,
        now
      );
      written.push('sportData.featuredStats');
    }

    if (sportData.team) {
      const existingTeam = (existingSport['team'] ?? {}) as Record<string, unknown>;
      payload[`${prefix}.team`] = { ...existingTeam, ...this.sanitizeTeamInfo(sportData.team) };
      written.push('sportData.team');
    }

    if (sportData.clubTeam) {
      const existingClub = (existingSport['clubTeam'] ?? {}) as Record<string, unknown>;
      payload[`${prefix}.clubTeam`] = {
        ...existingClub,
        ...this.sanitizeTeamInfo(sportData.clubTeam),
      };
      written.push('sportData.clubTeam');
    }

    if (sportData.coach) {
      payload[`${prefix}.coach`] = this.sanitizeCoach(sportData.coach);
      written.push('sportData.coach');
    }

    // Always update the sport's updatedAt
    payload[`${prefix}.updatedAt`] = now;
  }

  // ─── VerifiedMetric / VerifiedStat Merging ──────────────────────────────

  /**
   * Merge new metrics into existing ones. Deduplicates by `field` key —
   * if a metric with the same field already exists, it is updated in place
   * (latest value wins). New metrics are appended.
   */
  private mergeVerifiedMetrics(
    existing: Record<string, unknown>[],
    incoming: MetricInput[],
    source: string,
    now: string
  ): Record<string, unknown>[] {
    const merged = [...existing];
    const indexMap = new Map<string, number>();

    for (let i = 0; i < merged.length; i++) {
      const field = merged[i]['field'];
      if (typeof field === 'string') indexMap.set(field.toLowerCase(), i);
    }

    for (const m of incoming) {
      const key = m.field.toLowerCase();
      const record = this.toVerifiedMetric(m, source, now);
      const existingIndex = indexMap.get(key);

      if (existingIndex !== undefined) {
        // Preserve the original id, update value and metadata
        record['id'] = merged[existingIndex]['id'] ?? record['id'];
        merged[existingIndex] = record;
      } else {
        indexMap.set(key, merged.length);
        merged.push(record);
      }
    }

    return merged;
  }

  /**
   * Merge new stats into existing ones. Deduplicates by `field` + `season`.
   */
  private mergeVerifiedStats(
    existing: Record<string, unknown>[],
    incoming: StatInput[],
    source: string,
    now: string
  ): Record<string, unknown>[] {
    const merged = [...existing];
    const indexMap = new Map<string, number>();

    for (let i = 0; i < merged.length; i++) {
      const field = merged[i]['field'];
      const season = merged[i]['season'] ?? '';
      if (typeof field === 'string') {
        indexMap.set(`${field.toLowerCase()}::${String(season).toLowerCase()}`, i);
      }
    }

    for (const s of incoming) {
      const key = `${s.field.toLowerCase()}::${(s.season ?? '').toLowerCase()}`;
      const record = this.toVerifiedStat(s, source, now);
      const existingIndex = indexMap.get(key);

      if (existingIndex !== undefined) {
        record['id'] = merged[existingIndex]['id'] ?? record['id'];
        merged[existingIndex] = record;
      } else {
        indexMap.set(key, merged.length);
        merged.push(record);
      }
    }

    return merged;
  }

  private toVerifiedMetric(m: MetricInput, source: string, now: string): Record<string, unknown> {
    return {
      id: this.generateId(),
      field: m.field,
      label: m.label,
      value: m.value,
      ...(m.unit && { unit: m.unit }),
      ...(m.category && { category: m.category }),
      source,
      verified: false,
      dateRecorded: now,
      updatedAt: now,
    };
  }

  private toVerifiedStat(s: StatInput, source: string, now: string): Record<string, unknown> {
    return {
      id: this.generateId(),
      field: s.field,
      label: s.label,
      value: s.value,
      ...(s.unit && { unit: s.unit }),
      ...(s.category && { category: s.category }),
      ...(s.season && { season: s.season }),
      source,
      verified: false,
      dateRecorded: now,
      updatedAt: now,
    };
  }

  // ─── Array Merge Helpers (Team History, Awards) ─────────────────────────

  /**
   * Merge team history entries. Deduplicates by name + sport + season range.
   */
  private mergeTeamHistory(
    existing: Record<string, unknown>[],
    incoming: TeamHistoryInput[],
    defaultSport: string
  ): Record<string, unknown>[] {
    const merged = [...existing];
    const keyOf = (t: Record<string, unknown>): string => {
      const name = String(t['name'] ?? '')
        .toLowerCase()
        .trim();
      const sport = String(t['sport'] ?? defaultSport)
        .toLowerCase()
        .trim();
      const start = String(t['startDate'] ?? '')
        .toLowerCase()
        .trim();
      return `${name}::${sport}::${start}`;
    };

    const indexMap = new Map<string, number>();
    for (let i = 0; i < merged.length; i++) {
      indexMap.set(keyOf(merged[i]), i);
    }

    for (const entry of incoming) {
      const record: Record<string, unknown> = {
        name: entry.name.trim(),
        sport: entry.sport ?? defaultSport,
        ...(entry.type && { type: entry.type }),
        ...(entry.location && { location: entry.location }),
        ...(entry.record && { record: entry.record }),
        ...(entry.startDate && { startDate: entry.startDate }),
        ...(entry.endDate && { endDate: entry.endDate }),
        ...(entry.isCurrent !== undefined && { isCurrent: entry.isCurrent }),
      };

      const key = keyOf(record);
      const existingIndex = indexMap.get(key);

      if (existingIndex !== undefined) {
        // Merge: preserve existing fields, update with new data
        merged[existingIndex] = { ...merged[existingIndex], ...record };
      } else {
        indexMap.set(key, merged.length);
        merged.push(record);
      }
    }

    return merged;
  }

  /**
   * Merge awards. Deduplicates by title + sport + season.
   */
  private mergeAwards(
    existing: Record<string, unknown>[],
    incoming: AwardInput[],
    defaultSport: string
  ): Record<string, unknown>[] {
    const merged = [...existing];
    const keyOf = (a: Record<string, unknown>): string => {
      const title = String(a['title'] ?? '')
        .toLowerCase()
        .trim();
      const sport = String(a['sport'] ?? defaultSport)
        .toLowerCase()
        .trim();
      const season = String(a['season'] ?? '')
        .toLowerCase()
        .trim();
      return `${title}::${sport}::${season}`;
    };

    const indexMap = new Map<string, number>();
    for (let i = 0; i < merged.length; i++) {
      indexMap.set(keyOf(merged[i]), i);
    }

    for (const entry of incoming) {
      const record: Record<string, unknown> = {
        title: entry.title.trim(),
        sport: entry.sport ?? defaultSport,
        ...(entry.category && { category: entry.category }),
        ...(entry.season && { season: entry.season }),
        ...(entry.issuer && { issuer: entry.issuer }),
        ...(entry.date && { date: entry.date }),
      };

      const key = keyOf(record);
      const existingIndex = indexMap.get(key);

      if (existingIndex !== undefined) {
        merged[existingIndex] = { ...merged[existingIndex], ...record };
      } else {
        indexMap.set(key, merged.length);
        merged.push(record);
      }
    }

    return merged;
  }

  // ─── ConnectedSources ───────────────────────────────────────────────────

  /**
   * Build the updated `connectedSources` array. If a source with the same
   * platform + scopeId already exists, update it in place. Otherwise append.
   */
  private buildConnectedSourcesUpdate(
    existing: Record<string, unknown>[],
    platform: string,
    profileUrl: string,
    scopeId: string,
    syncedFields: string[],
    now: string,
    faviconUrl?: string
  ): Record<string, unknown>[] {
    const updated = [...existing];

    const matchIndex = updated.findIndex(
      (cs) => cs['platform'] === platform && cs['scopeId'] === scopeId
    );

    const record: Record<string, unknown> = {
      platform,
      profileUrl,
      lastSyncedAt: now,
      syncStatus: 'success',
      syncedFields,
      scopeType: 'sport',
      scopeId,
      ...(faviconUrl && { faviconUrl }),
    };

    if (matchIndex >= 0) {
      updated[matchIndex] = { ...updated[matchIndex], ...record };
    } else {
      updated.push(record);
    }

    return updated;
  }

  // ─── Sanitizers ─────────────────────────────────────────────────────────

  private sanitizeTeamInfo(team: TeamInfoInput): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (team.name) result['name'] = team.name.trim();
    if (team.type) result['type'] = team.type;
    if (team.mascot) result['mascot'] = team.mascot.trim();
    // V3 fields (canonical)
    if (team.logoUrl) result['logoUrl'] = team.logoUrl.trim();
    if (team.primaryColor) result['primaryColor'] = team.primaryColor.trim();
    if (team.secondaryColor) result['secondaryColor'] = team.secondaryColor.trim();
    // Legacy fields (backward compat) — derive from V3 or passthrough
    if (team.logoUrl) result['logo'] = team.logoUrl.trim();
    const colors = team.colors?.length
      ? team.colors
      : [team.primaryColor, team.secondaryColor].filter(Boolean);
    if (colors.length) result['colors'] = colors;
    if (team.conference) result['conference'] = team.conference.trim();
    if (team.division) result['division'] = team.division.trim();
    return result;
  }

  private sanitizeCoach(coach: CoachInput): Record<string, unknown> {
    const result: Record<string, unknown> = {
      firstName: coach.firstName.trim(),
      lastName: coach.lastName.trim(),
    };
    if (coach.email) result['email'] = coach.email.trim();
    if (coach.phone) result['phone'] = coach.phone.trim();
    if (coach.title) result['title'] = coach.title.trim();
    return result;
  }

  private sanitizeAcademics(academics: AcademicsInput): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (academics.gpa !== undefined) result['gpa'] = academics.gpa;
    if (academics.weightedGpa !== undefined) result['weightedGpa'] = academics.weightedGpa;
    if (academics.satScore !== undefined) result['satScore'] = academics.satScore;
    if (academics.actScore !== undefined) result['actScore'] = academics.actScore;
    if (academics.classRank !== undefined) result['classRank'] = academics.classRank;
    if (academics.classSize !== undefined) result['classSize'] = academics.classSize;
    if (academics.ncaaEligibilityCenter !== undefined)
      result['ncaaEligibilityCenter'] = academics.ncaaEligibilityCenter;
    if (academics.intendedMajor) result['intendedMajor'] = academics.intendedMajor.trim();
    return result;
  }

  // ─── Utilities ──────────────────────────────────────────────────────────

  private requireString(input: Record<string, unknown>, key: string): string | null {
    const val = input[key];
    if (typeof val === 'string' && val.trim().length > 0) return val.trim();
    return null;
  }

  private paramError(param: string, expected: string): ToolResult {
    return {
      success: false,
      error: `Parameter "${param}" is required and must be a ${expected}.`,
    };
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
