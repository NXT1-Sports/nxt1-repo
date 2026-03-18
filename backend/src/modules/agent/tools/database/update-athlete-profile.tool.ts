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
 * 2. **Collection-backed stats**: Extracted physical measurements and season
 *    statistics are persisted into dedicated collections:
 *    `Users/{uid}/sports/{sportId}/metrics/{metricId}` and top-level
 *    `PlayerStats/{userId}_{sportId}_{season}`.
 *
 * 3. **ConnectedSource sync records**: Every successful write appends or updates
 *    a `ConnectedSource` entry in the top-level `connectedSources[]` array with
 *    the actual `profileUrl`, `syncStatus`, and `lastSyncedAt`.
 *
 * 4. **Append-safe arrays**: `teamHistory[]` and `awards[]` are merged by
 *    deduplication keys (name+sport+season for team history, title+sport+season
 *    for awards) — new entries are appended, existing entries are updated.
 *
 * 5. **Academics**: GPA, SAT, ACT, class rank, and intended major are written
 *    to top-level `academics` so the profile UI can consume them directly.
 *
 * Security:
 * - Only `data_coordinator` and `performance_coordinator` can invoke this tool.
 * - System fields (email, role, status, planTier, _counters) are NEVER writable.
 * - All writes are scoped to the userId from the job payload — the router
 *   enforces upstream that the agent cannot target arbitrary users.
 * - Source attribution is mandatory on every write.
 */

import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { TeamTypeApi } from '@nxt1/core';
import { BaseTool, type ToolResult } from '../base.tool.js';
import { getCacheService } from '../../../../services/cache.service.js';
import { normalizeProgramType } from '../../../../services/onboarding-program-provisioning.service.js';
import { createOrganizationService } from '../../../../services/organization.service.js';
import { invalidateTeamCache } from '../../../../services/team-code.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../services/users.service.js';
import { ContextBuilder } from '../../memory/context-builder.js';
import { invalidateProfileCaches } from '../../../../routes/profile.routes.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const USERS_COLLECTION = 'Users';
const PLAYER_STATS_COLLECTION = 'PlayerStats';

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
  readonly programType?: string;
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
    '    - team: { name, type?, programType?, mascot?, colors?, conference?, division? }.\n' +
    '    - clubTeam: same shape as team.\n' +
    '    - coach: { firstName, lastName, email?, phone?, title? }.\n' +
    '  • teamHistory: array of { name, type?, sport?, location?, record?, startDate?, endDate?, isCurrent? }.\n' +
    '  • awards: array of { title, category?, sport?, season?, issuer?, date? }.\n' +
    '  • academics: { gpa?, weightedGpa?, satScore?, actScore?, classRank?, classSize?, ncaaEligibilityCenter?, intendedMajor? }.';

  readonly parameters = {
    type: 'object',
    properties: {
      userId: { type: 'string' },
      source: { type: 'string' },
      profileUrl: { type: 'string' },
      faviconUrl: { type: 'string' },
      targetSport: { type: 'string' },
      fields: {
        type: 'object',
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
                  programType: { type: 'string' },
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
                  programType: { type: 'string' },
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
    if (!userId) return this.paramTypeError('userId', 'non-empty string');

    const source = this.requireString(input, 'source');
    if (!source) return this.paramTypeError('source', 'non-empty string (e.g. "maxpreps")');

    const profileUrl = this.requireString(input, 'profileUrl');
    if (!profileUrl) return this.paramTypeError('profileUrl', 'non-empty string (the scraped URL)');

    const faviconUrl =
      typeof input['faviconUrl'] === 'string' && input['faviconUrl'].trim().length > 0
        ? input['faviconUrl'].trim()
        : undefined;

    const targetSport = this.requireString(input, 'targetSport');
    if (!targetSport)
      return this.paramTypeError('targetSport', 'non-empty string (e.g. "football")');

    const rawFields = input['fields'];
    if (!rawFields || typeof rawFields !== 'object' || Array.isArray(rawFields)) {
      return this.paramTypeError('fields', 'an object with profile data');
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
      // Normalise: Firestore dot-notation writes can convert the sports array to
      // a numbered map {"0": {...}}. Convert back to a real array before merging.
      const rawSports = userData['sports'];
      const existingSports: Record<string, unknown>[] = Array.isArray(rawSports)
        ? (rawSports as Record<string, unknown>[])
        : rawSports && typeof rawSports === 'object'
          ? (Object.values(rawSports) as Record<string, unknown>[])
          : [];
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
          now,
          existingSports.length
        );
        // Write the full array — arrayUnion + dot-notation mix causes map corruption
        payload['sports'] = [...existingSports, newSportProfile];
        writtenSections.push(`sports[NEW:${targetSport}]`);
      } else if (fields.sportData) {
        // Collect sport-level changes into a temp payload keyed by "sports.<index>.<field>",
        // then apply them in-memory and write the whole sports array.
        // Using Firestore dot-notation (e.g. "sports.0.positions") inside update()
        // silently converts the array to a map — writing the full array avoids this.
        const tempPayload: Record<string, unknown> = {};
        this.mergeSportData(
          fields.sportData,
          sportIndex,
          existingSports[sportIndex] as Record<string, unknown>,
          now,
          tempPayload,
          writtenSections
        );

        // Apply dot-notation changes from tempPayload to an in-memory copy of
        // the sports array, then write the full array to avoid map corruption.
        if (Object.keys(tempPayload).length > 0) {
          const updatedSports = existingSports.map((s) => ({ ...s }));
          const sportObj = { ...(updatedSports[sportIndex] ?? {}) } as Record<string, unknown>;

          for (const [key, value] of Object.entries(tempPayload)) {
            // Keys look like "sports.0.positions" — strip the "sports.<index>." prefix
            const dotParts = key.split('.');
            if (dotParts.length >= 3 && dotParts[0] === 'sports') {
              const field = dotParts.slice(2).join('.');
              // Handle single-level and nested fields
              if (dotParts.length === 3) {
                sportObj[field] = value;
              } else {
                // Nested: e.g. "sports.0.metrics.speed" → metrics.speed
                let target = sportObj as Record<string, unknown>;
                const nestedParts = dotParts.slice(2);
                for (let i = 0; i < nestedParts.length - 1; i++) {
                  if (!target[nestedParts[i]] || typeof target[nestedParts[i]] !== 'object') {
                    target[nestedParts[i]] = {};
                  }
                  target = target[nestedParts[i]] as Record<string, unknown>;
                }
                target[nestedParts[nestedParts.length - 1]] = value;
              }
            }
          }

          updatedSports[sportIndex] = sportObj;
          payload['sports'] = updatedSports;
        }
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

      // --- Academics (top-level, not nested under athlete) ---
      if (fields.academics) {
        const existingAcademics = (userData['academics'] ?? {}) as Record<string, unknown>;
        payload['academics'] = {
          ...existingAcademics,
          ...this.sanitizeAcademics(fields.academics),
        };
        writtenSections.push('academics');
      }

      // --- Connected source sync record ---
      payload['connectedSources'] = this.buildConnectedSourcesUpdate(
        (userData['connectedSources'] ?? []) as Record<string, unknown>[],
        source,
        profileUrl,
        targetSport,
        now,
        faviconUrl
      );

      if (fields.sportData?.team || fields.sportData?.clubTeam) {
        payload['conference'] = FieldValue.delete();
        payload['division'] = FieldValue.delete();
        payload['level'] = FieldValue.delete();
      }

      // --- Timestamp ---
      payload['updatedAt'] = FieldValue.serverTimestamp();

      if (writtenSections.length === 0) {
        return {
          success: false,
          error: 'No actionable fields were provided in the payload.',
        };
      }

      const resolvedSportIndex = isNewSport ? existingSports.length : sportIndex;
      const nextSports = Array.isArray(payload['sports'])
        ? (payload['sports'] as Record<string, unknown>[])
        : existingSports;
      const resolvedSport = nextSports[resolvedSportIndex] as Record<string, unknown> | undefined;

      if (fields.sportData?.team) {
        await this.syncTeamAndOrganizationMetadata(
          resolvedSport?.['team'] as Record<string, unknown> | undefined,
          fields.sportData.team,
          'team'
        );
      }

      if (fields.sportData?.clubTeam) {
        await this.syncTeamAndOrganizationMetadata(
          resolvedSport?.['clubTeam'] as Record<string, unknown> | undefined,
          fields.sportData.clubTeam,
          'clubTeam'
        );
      }

      const sportId = this.normalizeSportId(targetSport);

      // ── Write ────────────────────────────────────────────────────────
      await userRef.update(payload);

      if (fields.sportData?.metrics?.length) {
        await this.syncMetricsCollection(userId, sportId, fields.sportData.metrics, source, now);
      }

      if (fields.sportData?.stats?.length) {
        await this.syncPlayerStatsCollection(
          userId,
          sportId,
          fields.sportData.stats,
          fields.sportData.positions?.[0],
          source,
          now
        );
      }

      // ── Cache invalidation (best-effort) ─────────────────────────────
      try {
        const cache = getCacheService();
        await Promise.all([
          cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
          cache.del(`profile:sub:stats:${userId}:${sportId}`),
          cache.del(`profile:sub:metrics:${userId}:${sportId}`),
          invalidateProfileCaches(
            userId,
            typeof userData['username'] === 'string' ? userData['username'] : undefined,
            typeof userData['unicode'] === 'string' ? userData['unicode'] : null
          ),
        ]);
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

    if (sportData.team) profile['team'] = this.mergeUserTeamReference(undefined, sportData.team);
    if (sportData.clubTeam)
      profile['clubTeam'] = this.mergeUserTeamReference(undefined, sportData.clubTeam);
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

    if (sportData.team) {
      const existingTeam = (existingSport['team'] ?? {}) as Record<string, unknown>;
      payload[`${prefix}.team`] = this.mergeUserTeamReference(existingTeam, sportData.team);
      written.push('sportData.team');
    }

    if (sportData.clubTeam) {
      const existingClub = (existingSport['clubTeam'] ?? {}) as Record<string, unknown>;
      payload[`${prefix}.clubTeam`] = this.mergeUserTeamReference(existingClub, sportData.clubTeam);
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

  private normalizeSportId(value: string): string {
    return value.trim().toLowerCase();
  }

  private async syncMetricsCollection(
    userId: string,
    sportId: string,
    metrics: MetricInput[],
    source: string,
    now: string
  ): Promise<void> {
    if (!metrics.length) return;

    const metricsCol = this.db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection('sports')
      .doc(sportId)
      .collection('metrics');

    await Promise.all(
      metrics.map(async (metric) => {
        const docId = metric.field.trim().toLowerCase();
        const record = this.toVerifiedMetric(metric, source, now);
        await metricsCol.doc(docId).set({ ...record, id: docId, sportId }, { merge: true });
      })
    );
  }

  private async syncPlayerStatsCollection(
    userId: string,
    sportId: string,
    stats: StatInput[],
    position: string | undefined,
    source: string,
    now: string
  ): Promise<void> {
    if (!stats.length) return;

    const statsBySeason = new Map<string, StatInput[]>();
    for (const stat of stats) {
      const season = (stat.season ?? 'career').trim() || 'career';
      if (!statsBySeason.has(season)) statsBySeason.set(season, []);
      statsBySeason.get(season)!.push(stat);
    }

    await Promise.all(
      Array.from(statsBySeason.entries()).map(async ([season, seasonStats]) => {
        const docId = `${userId}_${sportId}_${season}`;
        const docRef = this.db.collection(PLAYER_STATS_COLLECTION).doc(docId);
        const existingDoc = await docRef.get();
        const existingStats = existingDoc.exists
          ? (((existingDoc.data()?.['stats'] as Record<string, unknown>[] | undefined) ??
              []) as Record<string, unknown>[])
          : [];

        const mergedStats = this.mergeVerifiedStats(existingStats, seasonStats, source, now);
        const existingData = existingDoc.data() as Record<string, unknown> | undefined;

        await docRef.set(
          {
            id: docId,
            userId,
            sportId,
            season,
            ...(position ? { position } : {}),
            stats: mergedStats,
            source,
            verified: false,
            createdAt: existingData?.['createdAt'] ?? now,
            updatedAt: now,
          },
          { merge: true }
        );
      })
    );
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

  private mergeUserTeamReference(
    existing: Record<string, unknown> | undefined,
    team: TeamInfoInput
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const key of ['teamId', 'organizationId', 'teamCode', 'updatedAt']) {
      const value = existing?.[key];
      if (value !== undefined && value !== null && value !== '') {
        result[key] = value;
      }
    }

    return {
      ...result,
      ...this.sanitizeTeamInfo(team),
    };
  }

  // ─── Sanitizers ─────────────────────────────────────────────────────────

  private sanitizeTeamInfo(team: TeamInfoInput): Record<string, unknown> {
    // Only store the lightweight user→team relationship on the User document.
    // Conference/division/program type live on Team/Organization docs.
    const result: Record<string, unknown> = {};
    if (team.name) result['name'] = team.name.trim();
    if (team.type) result['type'] = team.type;
    return result;
  }

  private parseProgramType(value?: string): TeamTypeApi | null {
    const normalized = (value ?? '').trim().toLowerCase();

    if (!normalized) return null;

    switch (normalized) {
      case 'high-school':
      case 'high school':
      case 'school':
      case 'hs':
        return 'high-school';
      case 'middle-school':
      case 'middle school':
      case 'ms':
        return 'middle-school';
      case 'club':
      case 'travel':
      case 'travel-ball':
      case 'travel ball':
      case 'aau':
      case 'academy':
      case 'elite':
        return 'club';
      case 'college':
      case 'university':
      case 'ncaa':
      case 'naia':
        return 'college';
      case 'juco':
      case 'junior college':
      case 'community college':
        return 'juco';
      case 'organization':
        return 'organization';
      default:
        return null;
    }
  }

  private inferProgramType(
    team: TeamInfoInput,
    relationKind: 'team' | 'clubTeam',
    existingTeamType?: string
  ): TeamTypeApi {
    const explicit = this.parseProgramType(team.programType);
    if (explicit) return normalizeProgramType(explicit);

    const normalizedName = `${team.name ?? ''} ${team.type ?? ''}`.toLowerCase();
    if (relationKind === 'clubTeam' || /(travel|aau|academy|elite|club)/.test(normalizedName)) {
      return 'club';
    }
    if (/(high school|\bhs\b|varsity|junior varsity|\bjv\b|freshman|prep)/.test(normalizedName)) {
      return 'high-school';
    }
    if (/(middle school|\bms\b)/.test(normalizedName)) {
      return 'middle-school';
    }
    if (/(juco|junior college|community college)/.test(normalizedName)) {
      return 'juco';
    }
    if (/(college|university|ncaa|naia)/.test(normalizedName)) {
      return 'college';
    }

    return this.parseProgramType(existingTeamType) ?? 'organization';
  }

  private normalizeTeamLevel(team: TeamInfoInput): string | null {
    const level = team.type?.trim();
    if (!level) return null;
    if (this.parseProgramType(level)) return null;
    return level;
  }

  /**
   * Extract the branding fields scraped for a team.
   * These fields must be written to the parent **Organization** document,
   * NOT to the User document, to maintain the Single Source of Truth.
   */
  private extractOrgBranding(team: TeamInfoInput): Record<string, unknown> | null {
    const branding: Record<string, unknown> = {};
    if (team.mascot) branding['mascot'] = team.mascot.trim();
    if (team.logoUrl) branding['logoUrl'] = team.logoUrl.trim();
    if (team.primaryColor) branding['primaryColor'] = team.primaryColor.trim();
    if (team.secondaryColor) branding['secondaryColor'] = team.secondaryColor.trim();
    return Object.keys(branding).length > 0 ? branding : null;
  }

  private async syncTeamAndOrganizationMetadata(
    teamRef: Record<string, unknown> | undefined,
    teamInput: TeamInfoInput,
    relationKind: 'team' | 'clubTeam'
  ): Promise<void> {
    const teamId = this.requireString(teamRef ?? {}, 'teamId');
    const orgIdFromRef = this.requireString(teamRef ?? {}, 'organizationId');

    let teamCode: string | undefined;
    let teamUnicode: string | undefined;
    let existingTeamType: string | undefined;
    let organizationId = orgIdFromRef;

    if (teamId) {
      const teamDoc = await this.db.collection('Teams').doc(teamId).get();
      if (teamDoc.exists) {
        const data = teamDoc.data() ?? {};
        teamCode = typeof data['teamCode'] === 'string' ? data['teamCode'] : undefined;
        teamUnicode = typeof data['unicode'] === 'string' ? data['unicode'] : undefined;
        existingTeamType = typeof data['teamType'] === 'string' ? data['teamType'] : undefined;
        organizationId ||=
          typeof data['organizationId'] === 'string' ? data['organizationId'] : null;

        const updateData: Record<string, unknown> = {
          updatedAt: FieldValue.serverTimestamp(),
        };
        const programType = this.inferProgramType(teamInput, relationKind, existingTeamType);
        const teamLevel = this.normalizeTeamLevel(teamInput);

        if (programType !== existingTeamType) {
          updateData['teamType'] = programType;
        }
        if (teamLevel && teamLevel !== data['level']) {
          updateData['level'] = teamLevel;
        }
        if (teamInput.conference !== undefined) {
          updateData['conference'] = teamInput.conference.trim();
        }
        if (teamInput.division !== undefined) {
          updateData['division'] = teamInput.division.trim();
        }

        if (Object.keys(updateData).length > 1) {
          await this.db.collection('Teams').doc(teamId).update(updateData);
          await invalidateTeamCache(teamId, teamCode, teamUnicode);
        }

        await this.syncOrganizationMetadata(organizationId, teamInput, programType);
        return;
      }
    }

    await this.syncOrganizationMetadata(
      organizationId,
      teamInput,
      this.inferProgramType(teamInput, relationKind, existingTeamType)
    );
  }

  private async syncOrganizationMetadata(
    organizationId: string | null,
    teamInput: TeamInfoInput,
    programType: TeamTypeApi
  ): Promise<void> {
    if (!organizationId) return;

    const branding = this.extractOrgBranding(teamInput);
    const updateData: Record<string, unknown> = {
      type: programType,
      ...(branding ?? {}),
    };

    if (Object.keys(updateData).length === 0) return;

    const organizationService = createOrganizationService(this.db);
    await organizationService.updateOrganization(organizationId, updateData, 'agent-x-scraper');
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

  private paramTypeError(param: string, expected: string): ToolResult {
    return {
      success: false,
      error: `Parameter "${param}" is required and must be a ${expected}.`,
    };
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
