/**
 * @fileoverview Write Roster Entries Tool — Batch upsert of team roster memberships
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes to the `RosterEntries` collection using deterministic document IDs.
 * - Account-backed entries: `${teamId}_${userId}`
 * - Pending claim entries: `pending_${teamId}_${hash(team+name+sport+class)}`
 *
 * CRITICAL: Without valid RosterEntries for a team, `fetchTeamRecruiting()` in
 * timeline.service.ts returns an empty result because it fans out from userIds
 * collected from this collection.
 *
 * Queried by: TeamTimeline (GET /api/v1/teams/:teamCode/timeline?filter=recruiting)
 */

import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { normalizeBaseSportKey } from '@nxt1/core';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { createRosterEntryService } from '../../../../../services/team/roster-entry.service.js';
import { invalidateProfileCaches } from '../../../../../routes/profile/shared.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../../services/profile/users.service.js';
import { logger } from '../../../../../utils/logger.js';
import { getCachedScrapeResult } from '../../integrations/firecrawl/scraping/scrape-and-index-profile.tool.js';
import crypto from 'node:crypto';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const ROSTER_ENTRIES_COLLECTION = 'RosterEntries';
const MAX_ENTRIES_PER_CALL = 50;

const VALID_STATUSES = new Set(['pending', 'active', 'inactive', 'removed', 'left']);
const RESERVED_ENTRY_KEYS_FOR_USER_PATCH = new Set([
  'userId',
  'status',
  'jerseyNumber',
  'positions',
  'sport',
  'season',
  'classOfWhenJoined',
  'classOf',
  'position',
  'year',
  'sportId',
  'note',
  'coachNotes',
  'teamId',
  'teamCode',
  'organizationId',
]);

const RosterEntrySchema = z
  .object({
    userId: z.string().trim().min(1).optional(),
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    displayName: z.string().trim().min(1).optional(),
    status: z.string().trim().min(1).optional(),
    jerseyNumber: z.string().trim().min(1).optional(),
    positions: z.array(z.string().trim().min(1)).optional(),
    sport: z.string().trim().min(1).optional(),
    season: z.string().trim().min(1).optional(),
    classOfWhenJoined: z.union([z.string().trim().min(1), z.number().int()]).optional(),
    classOf: z.union([z.string().trim().min(1), z.number().int()]).optional(),
    // Legacy aliases still accepted for compatibility.
    position: z.string().trim().min(1).optional(),
    year: z.string().trim().min(1).optional(),
    sportId: z.string().trim().min(1).optional(),
    note: z.string().trim().min(1).optional(),
  })
  .passthrough();

const WriteRosterEntriesInputSchema = z.object({
  teamId: z.string().trim().min(1),
  teamCode: z.string().trim().min(1),
  sourceUrl: z.string().trim().url().optional(),
  strictSourceValidation: z.boolean().optional(),
  entries: z.array(RosterEntrySchema).min(1).max(MAX_ENTRIES_PER_CALL),
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserSportRecord {
  sport: string;
  order: number;
  positions?: string[];
  jerseyNumber?: string;
  team?: Record<string, unknown>;
  updatedAt?: string;
  [key: string]: unknown;
}

// ─── Tool ───────────────────────────────────────────────────────────────────

export class WriteRosterEntriesTool extends BaseTool {
  readonly name = 'write_roster_entries';

  readonly description =
    'Batch-upserts player roster entries for a team in the RosterEntries collection.\n\n' +
    'Each entry uses a deterministic doc ID for idempotency.\n\n' +
    'IMPORTANT: RosterEntries are required for the team recruiting timeline to work.\n' +
    'Use status "pending" for prospects Agent X has identified but who have not formally committed.\n\n' +
    'Parameters:\n' +
    '- teamId (required): Team document ID.\n' +
    '- teamCode (required): Team code slug (used for cache invalidation).\n' +
    '- entries (required): Array of roster entries to upsert:\n' +
    '  • userId (optional): Existing user document ID (account-backed member).\n' +
    '  • firstName (optional): First name for pending-claim roster entries.\n' +
    '  • lastName (optional): Last name for pending-claim roster entries.\n' +
    '  • displayName (optional): Display name fallback for pending-claim entries.\n' +
    '  • status (optional): "pending" | "active" | "inactive" | "removed" | "left". Legacy statuses ("ghost", "committed", "transferred") normalize automatically.\n' +
    '  • jerseyNumber (optional): Jersey number string (e.g. "23").\n' +
    '  • positions (optional): Position codes array (e.g. ["PG", "SG"]).\n' +
    '  • sport (optional): Sport identifier/name.\n' +
    '  • season (optional): Season label (e.g. "2026").\n' +
    '  • classOfWhenJoined (optional): Numeric graduating class year.\n' +
    '  • classOf (optional): Cached class year fallback.\n' +
    '  • Legacy aliases supported: position, year, sportId.\n' +
    '  • note (optional): Internal scouting note (not shown to non-staff).';

  readonly parameters = WriteRosterEntriesInputSchema;

  override readonly allowedAgents = ['data_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;

  readonly entityGroup = 'team_tools' as const;
  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = WriteRosterEntriesInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { teamId, teamCode: inputTeamCode, sourceUrl, strictSourceValidation } = parsed.data;
    const rawEntries = parsed.data.entries;

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    try {
      const teamDoc = await this.db.collection('Teams').doc(teamId).get();
      if (!teamDoc.exists) {
        return { success: false, error: `Team ${teamId} not found.` };
      }

      const teamData = teamDoc.data() ?? {};
      const isAuthorized = await canManageTeamMutationForUser(
        this.db,
        context.userId,
        teamId,
        teamData
      );
      if (!isAuthorized) {
        return { success: false, error: 'Not authorized to update roster entries for this team.' };
      }

      const now = new Date().toISOString();
      const organizationId = this.str(teamData, 'organizationId') ?? '';
      const teamSport = this.str(teamData, 'sport') ?? this.str(teamData, 'sportName') ?? undefined;
      const teamName = this.str(teamData, 'teamName') ?? undefined;
      const teamType = this.str(teamData, 'teamType') ?? undefined;
      const canonicalTeamCode = resolveCanonicalTeamCode(teamData, inputTeamCode);

      const rosterEntryService = createRosterEntryService(this.db);
      const userUpdates = new Map<string, Record<string, unknown>>();
      const userUnicodeMap = new Map<string, string | undefined>();
      const enforceSourceValidation = strictSourceValidation !== false;
      const pendingEntriesExist = rawEntries.some(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          (!('userId' in entry) ||
            typeof (entry as Record<string, unknown>)['userId'] !== 'string' ||
            !(entry as Record<string, unknown>)['userId'])
      );
      const sourceMarkdown = sourceUrl
        ? (getCachedScrapeResult(sourceUrl)?.markdownContent ?? null)
        : null;

      if (pendingEntriesExist && enforceSourceValidation && !sourceUrl) {
        return {
          success: false,
          error:
            'Pending roster entries require source-backed validation. Provide sourceUrl from scrape_and_index_profile and retry.',
        };
      }

      if (pendingEntriesExist && enforceSourceValidation && sourceUrl && !sourceMarkdown) {
        return {
          success: false,
          error:
            'Source validation requires cached scrape data for sourceUrl. Run scrape_and_index_profile for that URL, then retry write_roster_entries.',
        };
      }

      const normalizedSourceMarkdown = sourceMarkdown
        ? normalizeSourceTextForMatching(sourceMarkdown)
        : null;
      const rejectedHallucinatedNames = new Set<string>();

      // Reuse existing roster docs when possible to avoid duplicate people rows.
      const existingRosterSnap = await this.db
        .collection(ROSTER_ENTRIES_COLLECTION)
        .where('teamId', '==', teamId)
        .get();
      const existingByUserId = new Map<string, string>();
      const existingUserDocIdsByUserId = new Map<string, string[]>();
      const existingPendingByExactKey = new Map<string, string>();
      const existingPendingByLooseKey = new Map<string, string>();
      for (const existingDoc of existingRosterSnap.docs) {
        const existingData = (existingDoc.data() ?? {}) as Record<string, unknown>;
        const existingUserId = this.str(existingData, 'userId') ?? undefined;
        if (existingUserId) {
          const existingIds = existingUserDocIdsByUserId.get(existingUserId) ?? [];
          existingIds.push(existingDoc.id);
          existingUserDocIdsByUserId.set(existingUserId, existingIds);

          const canonicalClaimedDocId = `${teamId}_${existingUserId}`;
          const current = existingByUserId.get(existingUserId);
          if (!current || existingDoc.id === canonicalClaimedDocId) {
            existingByUserId.set(existingUserId, existingDoc.id);
          }
          continue;
        }

        const existingStatus = (this.str(existingData, 'status') ?? '').toLowerCase();
        if (existingStatus !== 'pending') {
          continue;
        }

        const existingNormalizedName = normalizePendingEntryName({
          firstName: this.str(existingData, 'firstName') ?? undefined,
          lastName: this.str(existingData, 'lastName') ?? undefined,
          displayName: this.str(existingData, 'displayName') ?? undefined,
        });
        const existingResolvedSport = entrySportOrTeamSport(
          this.str(existingData, 'sport') ?? this.str(existingData, 'sportId') ?? undefined,
          teamSport
        );
        const existingNumericClassOf = parseClassOf(
          this.str(existingData, 'classOfWhenJoined') ??
            this.str(existingData, 'classOf') ??
            this.str(existingData, 'year') ??
            undefined
        );
        const existingPendingMatchKey = buildPendingClaimMatchKey({
          teamId,
          teamName,
          sport: existingResolvedSport,
          classOf: existingNumericClassOf,
          firstName: existingNormalizedName.firstName,
          lastName: existingNormalizedName.lastName,
        });
        if (!existingPendingMatchKey.firstName && !existingPendingMatchKey.lastName) {
          continue;
        }

        const existingExactKey = buildPendingExactKey(existingPendingMatchKey);
        const existingLooseKey = buildPendingLooseKey(existingPendingMatchKey);

        if (!existingPendingByExactKey.has(existingExactKey)) {
          existingPendingByExactKey.set(existingExactKey, existingDoc.id);
        }
        if (!existingPendingByLooseKey.has(existingLooseKey)) {
          existingPendingByLooseKey.set(existingLooseKey, existingDoc.id);
        }
      }
      const seenPendingDocIds = new Set<string>();

      // Firestore batch limit is 500 writes; entries cap at 50 so a single batch is fine
      const batch = this.db.batch();
      const staleUserDocIdsToDelete = new Set<string>();
      let written = 0;
      let skipped = 0;

      for (const rawEntry of rawEntries) {
        if (!rawEntry || typeof rawEntry !== 'object') {
          skipped++;
          continue;
        }
        const e = rawEntry as Record<string, unknown>;
        const userId = this.str(e, 'userId') ?? undefined;
        const inputFirstName = this.str(e, 'firstName') ?? undefined;
        const inputLastName = this.str(e, 'lastName') ?? undefined;
        const inputDisplayName = this.str(e, 'displayName') ?? undefined;
        const normalizedName = normalizePendingEntryName({
          firstName: inputFirstName,
          lastName: inputLastName,
          displayName: inputDisplayName,
        });

        if (!userId && !normalizedName.displayName) {
          skipped++;
          continue;
        }

        if (!userId && enforceSourceValidation && normalizedSourceMarkdown) {
          const candidateName =
            normalizedName.displayName ||
            [normalizedName.firstName, normalizedName.lastName].filter(Boolean).join(' ');
          if (!candidateName || !nameAppearsInSource(candidateName, normalizedSourceMarkdown)) {
            rejectedHallucinatedNames.add(candidateName || 'unknown');
            skipped++;
            continue;
          }
        }

        const rawStatus = this.str(e, 'status') ?? undefined;
        const status = normalizeRosterStatus(rawStatus, userId);
        const resolvedSport = entrySportOrTeamSport(
          this.str(e, 'sport') ?? this.str(e, 'sportId') ?? undefined,
          teamSport
        );
        const inputPositions = normalizeEntryPositions(
          this.str(e, 'position') ?? undefined,
          readStringArray(e['positions'])
        );
        let effectivePositions = inputPositions;
        const classOfInput =
          this.str(e, 'classOfWhenJoined') ??
          this.str(e, 'classOf') ??
          this.str(e, 'year') ??
          undefined;
        const numericClassOf = parseClassOf(classOfInput);

        const pendingMatchKey = buildPendingClaimMatchKey({
          teamId,
          teamName,
          sport: resolvedSport,
          classOf: numericClassOf,
          firstName: normalizedName.firstName,
          lastName: normalizedName.lastName,
        });
        const jerseyNumber = this.str(e, 'jerseyNumber') ?? undefined;
        const note = this.str(e, 'note') ?? undefined;
        const season = this.str(e, 'season') ?? undefined;
        const userProfilePatch = buildUserProfilePatchFromEntry(
          e,
          {
            firstName: normalizedName.firstName,
            lastName: normalizedName.lastName,
            displayName: normalizedName.displayName,
          },
          numericClassOf
        );

        let docId: string;
        if (userId) {
          const canonicalClaimedDocId = `${teamId}_${userId}`;
          docId = canonicalClaimedDocId;

          const existingDocId = existingByUserId.get(userId);
          const existingUserDocIds = existingUserDocIdsByUserId.get(userId) ?? [];
          if (existingDocId && existingDocId !== canonicalClaimedDocId) {
            staleUserDocIdsToDelete.add(existingDocId);
          }
          for (const existingUserDocId of existingUserDocIds) {
            if (existingUserDocId !== canonicalClaimedDocId) {
              staleUserDocIdsToDelete.add(existingUserDocId);
            }
          }

          existingByUserId.set(userId, canonicalClaimedDocId);
        } else {
          const pendingExactKey = buildPendingExactKey(pendingMatchKey);
          const pendingLooseKey = buildPendingLooseKey(pendingMatchKey);
          docId =
            existingPendingByExactKey.get(pendingExactKey) ??
            existingPendingByLooseKey.get(pendingLooseKey) ??
            `pending_${teamId}_${hashPendingMatchKey(pendingMatchKey)}`;

          if (seenPendingDocIds.has(docId)) {
            skipped++;
            continue;
          }

          seenPendingDocIds.add(docId);
          existingPendingByExactKey.set(pendingExactKey, docId);
          existingPendingByLooseKey.set(pendingLooseKey, docId);
        }
        const docRef = this.db.collection(ROSTER_ENTRIES_COLLECTION).doc(docId);

        const docData: Record<string, unknown> = {
          teamId,
          ...(teamName ? { teamName } : {}),
          ...(userId ? { userId } : {}),
          organizationId,
          role: 'athlete',
          status,
          ...(resolvedSport ? { sport: resolvedSport } : {}),
          ...(numericClassOf !== null
            ? {
                classOfWhenJoined: numericClassOf,
                classOf: numericClassOf,
              }
            : {}),
          ...(normalizedName.firstName ? { firstName: normalizedName.firstName } : {}),
          ...(normalizedName.lastName ? { lastName: normalizedName.lastName } : {}),
          ...(normalizedName.displayName ? { displayName: normalizedName.displayName } : {}),
          joinedAt: now,
          updatedAt: now,
          // Keep RosterEntries aligned with canonical model: teamCode is not a model field.
          teamCode: FieldValue.delete(),
        };

        if (jerseyNumber !== undefined) docData['jerseyNumber'] = jerseyNumber;
        // Season is only persisted for claimed users; pending rows should not carry guessed season labels.
        if (season !== undefined && userId) {
          docData['season'] = season;
        } else if (!userId) {
          docData['season'] = FieldValue.delete();
        }
        if (note !== undefined) {
          docData['note'] = note;
          docData['coachNotes'] = note;
        }

        if (userId) {
          const userRef = this.db.collection('Users').doc(userId);
          const userSnap = await userRef.get();
          const userData = userSnap.exists
            ? ((userSnap.data() ?? {}) as Record<string, unknown>)
            : null;

          if (userData) {
            const mergedUserData = {
              ...userData,
              ...userProfilePatch,
            };

            const userRole = this.str(mergedUserData, 'role') ?? 'athlete';
            const unicode = this.str(mergedUserData, 'unicode') ?? '';
            const displayName = buildDisplayName(mergedUserData);
            const profileImgs = Array.isArray(mergedUserData['profileImgs'])
              ? mergedUserData['profileImgs'].filter(
                  (value): value is string => typeof value === 'string'
                )
              : [];

            docData['role'] = userRole;
            if (unicode) {
              docData['unicode'] = unicode;
              docData['profileCode'] = unicode;
            }
            if (this.str(mergedUserData, 'firstName')) {
              docData['firstName'] = this.str(mergedUserData, 'firstName');
            }
            if (this.str(mergedUserData, 'lastName')) {
              docData['lastName'] = this.str(mergedUserData, 'lastName');
            }
            if (displayName) {
              docData['displayName'] = displayName;
            }
            if (this.str(mergedUserData, 'email')) {
              docData['email'] = this.str(mergedUserData, 'email');
            }
            const phone = readPhoneNumber(mergedUserData);
            if (phone) {
              docData['phoneNumber'] = phone;
            }
            if (profileImgs.length > 0) {
              docData['profileImgs'] = profileImgs;
            }
            if (typeof mergedUserData['classOf'] === 'number') {
              docData['classOf'] = mergedUserData['classOf'];
            }
            const gpa = readGpa(mergedUserData);
            if (gpa !== undefined) {
              docData['gpa'] = gpa;
            }
            if (this.str(mergedUserData, 'height')) {
              docData['height'] = this.str(mergedUserData, 'height');
            }
            if (this.str(mergedUserData, 'weight')) {
              docData['weight'] = this.str(mergedUserData, 'weight');
            }

            const userSportPositions = resolveUserPositionsForSport(
              mergedUserData,
              resolvedSport,
              teamSport
            );
            if (userSportPositions.length > 0) {
              effectivePositions = userSportPositions;
            }

            if (resolvedSport) {
              const updatedUser = buildUpdatedUserProfile(mergedUserData, {
                sport: resolvedSport,
                positions: effectivePositions,
                jerseyNumber,
                teamId,
                organizationId,
                teamName,
                teamType,
                status,
                updatedAt: now,
              });
              userUpdates.set(userId, updatedUser);
              userUnicodeMap.set(userId, unicode || undefined);
            }
          }
        }

        if (effectivePositions.length > 0) {
          docData['positions'] = effectivePositions;
        }

        // merge:true preserves existing fields (e.g. joinedAt, statsRef).
        // createdAt is intentionally excluded — with merge:true, any field listed
        // IS overwritten on every call. createdAt is set exactly once by the
        // Firestore onCreate trigger (functions/src/user/roster-entry.trigger.ts).
        // Only updatedAt (already in docData) is updated on every upsert.
        batch.set(docRef, docData, { merge: true });

        written++;
      }

      if (written === 0) {
        if (rejectedHallucinatedNames.size > 0) {
          return {
            success: false,
            error:
              'All pending entries were rejected because they were not found in source roster content: ' +
              Array.from(rejectedHallucinatedNames).slice(0, 15).join(', '),
          };
        }
        return { success: false, error: 'No valid entries after validation.' };
      }

      context?.emitStage?.('submitting_job', {
        icon: 'database',
        entryCount: written,
        phase: 'upsert_roster_entries',
      });
      await batch.commit();

      if (staleUserDocIdsToDelete.size > 0) {
        const cleanupBatch = this.db.batch();
        for (const staleDocId of staleUserDocIdsToDelete) {
          cleanupBatch.delete(this.db.collection(ROSTER_ENTRIES_COLLECTION).doc(staleDocId));
        }
        await cleanupBatch.commit();
      }

      for (const [userId, updatedUser] of userUpdates.entries()) {
        await this.db
          .collection('Users')
          .doc(userId)
          .set(
            {
              ...updatedUser,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

        const refreshedUserSnap = await this.db.collection('Users').doc(userId).get();
        if (refreshedUserSnap.exists) {
          await rosterEntryService.syncUserProfileToRosterEntries(
            userId,
            (refreshedUserSnap.data() ?? {}) as Record<string, unknown>
          );
        }
      }

      // Invalidate recruiting timeline for this team
      const cache = getCacheService();
      await Promise.all([
        cache.delByPrefix(`team:timeline:v1:${canonicalTeamCode}:`),
        cache.delByPrefix(`team:profile:code:${canonicalTeamCode}:`),
        ...(inputTeamCode !== canonicalTeamCode
          ? [
              cache.delByPrefix(`team:timeline:v1:${inputTeamCode}:`),
              cache.delByPrefix(`team:profile:code:${inputTeamCode}:`),
            ]
          : []),
        ...Array.from(userUpdates.keys()).flatMap((userId) => {
          const unicode = userUnicodeMap.get(userId);
          return [
            cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
            invalidateProfileCaches(userId, unicode),
          ];
        }),
      ]);

      logger.info('[WriteRosterEntriesTool] Entries written', {
        teamId,
        teamCode: canonicalTeamCode,
        inputTeamCode,
        written,
        skipped,
        sourceUrl: sourceUrl ?? null,
        sourceValidation: enforceSourceValidation,
        hallucinatedRejected: rejectedHallucinatedNames.size,
        staleDeleted: staleUserDocIdsToDelete.size,
      });

      return {
        success: true,
        data: {
          written,
          skipped,
          rejected: rejectedHallucinatedNames.size,
          rejectedNames:
            rejectedHallucinatedNames.size > 0
              ? Array.from(rejectedHallucinatedNames).slice(0, 20)
              : undefined,
          message: `Upserted ${written} roster entr${written === 1 ? 'y' : 'ies'}${skipped > 0 ? `, skipped ${skipped}` : ''}.`,
        },
      };
    } catch (err) {
      logger.error('[WriteRosterEntriesTool] Failed', {
        teamId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write roster entries.',
      };
    }
  }
}

function entrySportOrTeamSport(
  entrySportId: string | undefined,
  teamSport: string | undefined
): string | undefined {
  const resolved = entrySportId?.trim() || teamSport?.trim();
  return resolved && resolved.length > 0 ? resolved : undefined;
}

function normalizeEntryPositions(
  position: string | undefined,
  positions: readonly string[] | undefined
): string[] {
  const candidates = [
    ...(Array.isArray(positions) ? positions : []),
    ...(position ? [position] : []),
  ];

  const normalized = Array.from(
    new Set(candidates.map((value) => value.trim()).filter((value) => value.length > 0))
  );

  return normalized;
}

function parseClassOf(classOf: string | number | undefined): number | null {
  if (typeof classOf === 'number') {
    return Number.isInteger(classOf) && classOf >= 1900 && classOf <= 3000 ? classOf : null;
  }

  if (!classOf) return null;
  const parsed = Number(classOf.trim());
  return Number.isInteger(parsed) && parsed >= 1900 && parsed <= 3000 ? parsed : null;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item): item is string => item.length > 0);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeRosterStatus(status: string | undefined, userId: string | undefined): string {
  if (!userId) {
    return 'pending';
  }

  const normalized = status?.trim().toLowerCase();
  if (normalized && VALID_STATUSES.has(normalized)) {
    return normalized;
  }

  // Legacy statuses still accepted as input but normalized to canonical model values.
  if (normalized === 'ghost') {
    return 'pending';
  }
  if (normalized === 'committed') {
    return 'active';
  }
  if (normalized === 'transferred') {
    return 'left';
  }

  return userId ? 'active' : 'pending';
}

function normalizeMatchString(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeSourceTextForMatching(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameAppearsInSource(name: string, normalizedSourceText: string): boolean {
  const normalizedName = normalizeSourceTextForMatching(name);
  if (!normalizedName || normalizedName.length < 3) {
    return false;
  }

  if (normalizedSourceText.includes(normalizedName)) {
    return true;
  }

  // Fallback: require both first and last tokens for better OCR/spacing resilience.
  const tokens = normalizedName.split(' ').filter((token) => token.length > 1);
  if (tokens.length >= 2) {
    const [first, last] = [tokens[0], tokens[tokens.length - 1]];
    return normalizedSourceText.includes(first) && normalizedSourceText.includes(last);
  }

  return false;
}

function normalizePendingEntryName(input: {
  firstName?: string;
  lastName?: string;
  displayName?: string;
}): {
  firstName?: string;
  lastName?: string;
  displayName?: string;
} {
  const firstName = input.firstName?.trim() || undefined;
  const lastName = input.lastName?.trim() || undefined;
  const explicitDisplayName = input.displayName?.trim() || undefined;

  if (firstName || lastName) {
    return {
      firstName,
      lastName,
      displayName:
        explicitDisplayName || [firstName, lastName].filter(Boolean).join(' ') || undefined,
    };
  }

  if (!explicitDisplayName) {
    return {};
  }

  const parts = explicitDisplayName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return {};
  }

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      displayName: parts[0],
    };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
    displayName: explicitDisplayName,
  };
}

function buildPendingClaimMatchKey(input: {
  teamId: string;
  teamName?: string;
  sport?: string;
  classOf: number | null;
  firstName?: string;
  lastName?: string;
}): {
  teamId: string;
  teamName: string;
  firstName: string;
  lastName: string;
  sport: string;
  classOf: number | null;
} {
  return {
    teamId: normalizeMatchString(input.teamId),
    teamName: normalizeMatchString(input.teamName),
    firstName: normalizeMatchString(input.firstName),
    lastName: normalizeMatchString(input.lastName),
    sport: normalizeMatchString(input.sport),
    classOf: input.classOf,
  };
}

function hashPendingMatchKey(key: {
  teamId: string;
  teamName: string;
  firstName: string;
  lastName: string;
  sport: string;
  classOf: number | null;
}): string {
  const payload = [
    key.teamId,
    key.teamName,
    key.firstName,
    key.lastName,
    key.sport,
    key.classOf === null ? '' : String(key.classOf),
  ].join('|');

  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 20);
}

function buildPendingExactKey(key: {
  teamId: string;
  teamName: string;
  firstName: string;
  lastName: string;
  sport: string;
  classOf: number | null;
}): string {
  return [
    key.teamId,
    key.teamName,
    key.firstName,
    key.lastName,
    key.sport,
    key.classOf === null ? '' : String(key.classOf),
  ].join('|');
}

function buildPendingLooseKey(key: {
  teamId: string;
  teamName: string;
  firstName: string;
  lastName: string;
  sport: string;
}): string {
  return [key.teamId, key.teamName, key.firstName, key.lastName, key.sport].join('|');
}

function resolveCanonicalTeamCode(
  teamData: Record<string, unknown>,
  inputTeamCode: string
): string {
  const fromSlug = typeof teamData['slug'] === 'string' ? teamData['slug'].trim() : '';
  if (fromSlug) return fromSlug;

  const fromUnicode = typeof teamData['unicode'] === 'string' ? teamData['unicode'].trim() : '';
  if (fromUnicode) return fromUnicode;

  const fromTeamCode = typeof teamData['teamCode'] === 'string' ? teamData['teamCode'].trim() : '';
  if (fromTeamCode) return fromTeamCode;

  return inputTeamCode;
}

function resolveUserPositionsForSport(
  userData: Record<string, unknown>,
  resolvedSport: string | undefined,
  teamSport: string | undefined
): string[] {
  const sports = Array.isArray(userData['sports'])
    ? (userData['sports'] as Array<Record<string, unknown>>)
    : [];
  if (sports.length === 0) {
    return [];
  }

  const normalizedResolvedSport = normalizeBaseSportKey(resolvedSport ?? teamSport ?? '');

  const pickPositions = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return Array.from(
      new Set(
        value
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      )
    );
  };

  if (normalizedResolvedSport) {
    const matchedSport = sports.find((sportEntry) => {
      const sportName = typeof sportEntry['sport'] === 'string' ? String(sportEntry['sport']) : '';
      return normalizeBaseSportKey(sportName) === normalizedResolvedSport;
    });
    const matchedPositions = pickPositions(matchedSport?.['positions']);
    if (matchedPositions.length > 0) {
      return matchedPositions;
    }
  }

  for (const sportEntry of sports) {
    const fallback = pickPositions(sportEntry['positions']);
    if (fallback.length > 0) {
      return fallback;
    }
  }

  return [];
}

function buildDisplayName(userData: Record<string, unknown> | null): string | undefined {
  if (!userData) return undefined;

  const explicitDisplayName =
    typeof userData['displayName'] === 'string' ? userData['displayName'].trim() : '';
  if (explicitDisplayName) return explicitDisplayName;

  const firstName = typeof userData['firstName'] === 'string' ? userData['firstName'].trim() : '';
  const lastName = typeof userData['lastName'] === 'string' ? userData['lastName'].trim() : '';
  const derivedDisplayName = [firstName, lastName].filter(Boolean).join(' ');
  return derivedDisplayName || undefined;
}

function readPhoneNumber(userData: Record<string, unknown> | null): string | undefined {
  if (!userData) return undefined;

  if (typeof userData['phoneNumber'] === 'string' && userData['phoneNumber'].trim()) {
    return userData['phoneNumber'].trim();
  }

  const contact = userData['contact'];
  if (
    contact &&
    typeof contact === 'object' &&
    typeof (contact as Record<string, unknown>)['phone'] === 'string'
  ) {
    const phone = ((contact as Record<string, unknown>)['phone'] as string).trim();
    return phone || undefined;
  }

  return undefined;
}

function readGpa(userData: Record<string, unknown> | null): string | number | undefined {
  if (!userData) return undefined;

  if (typeof userData['gpa'] === 'number' || typeof userData['gpa'] === 'string') {
    return userData['gpa'] as string | number;
  }

  const academics = userData['academics'];
  if (academics && typeof academics === 'object') {
    const value = (academics as Record<string, unknown>)['gpa'];
    if (typeof value === 'number' || typeof value === 'string') {
      return value;
    }
  }

  return undefined;
}

function buildUserProfilePatchFromEntry(
  entry: Record<string, unknown>,
  normalizedName: {
    firstName?: string;
    lastName?: string;
    displayName?: string;
  },
  numericClassOf: number | null
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(entry)) {
    if (RESERVED_ENTRY_KEYS_FOR_USER_PATCH.has(key) || rawValue === undefined) {
      continue;
    }

    if (key === 'profileImgs') {
      const profileImgs = readStringArray(rawValue);
      if (profileImgs && profileImgs.length > 0) {
        patch[key] = profileImgs;
      }
      continue;
    }

    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      if (!trimmed) continue;
      patch[key] = trimmed;
      continue;
    }

    patch[key] = rawValue;
  }

  if (normalizedName.firstName) patch['firstName'] = normalizedName.firstName;
  if (normalizedName.lastName) patch['lastName'] = normalizedName.lastName;
  if (normalizedName.displayName) patch['displayName'] = normalizedName.displayName;
  if (numericClassOf !== null) patch['classOf'] = numericClassOf;

  return patch;
}

function buildUpdatedUserProfile(
  userData: Record<string, unknown>,
  input: {
    sport: string;
    positions: string[];
    jerseyNumber?: string;
    teamId: string;
    organizationId: string;
    teamName?: string;
    teamType?: string;
    status: string;
    updatedAt: string;
  }
): Record<string, unknown> {
  const sports = Array.isArray(userData['sports'])
    ? (userData['sports'] as Record<string, unknown>[]).map((sport) => ({ ...sport }))
    : [];
  const normalizedSport = normalizeBaseSportKey(input.sport);

  let sportIndex = sports.findIndex((sport) => {
    const sportName =
      typeof sport['sport'] === 'string' ? normalizeBaseSportKey(sport['sport']) : '';
    return sportName === normalizedSport;
  });

  if (sportIndex === -1) {
    sportIndex = sports.length;
    sports.push({
      sport: input.sport,
      order: sportIndex,
    } satisfies UserSportRecord);
  }

  const nextSport = { ...sports[sportIndex] } as UserSportRecord;
  nextSport.sport =
    typeof nextSport.sport === 'string' && nextSport.sport.trim() ? nextSport.sport : input.sport;
  nextSport.order = typeof nextSport.order === 'number' ? nextSport.order : sportIndex;

  if (input.positions.length > 0) {
    nextSport.positions = input.positions;
  }

  if (input.jerseyNumber !== undefined) {
    nextSport.jerseyNumber = input.jerseyNumber;
  }

  if (input.status === 'active') {
    nextSport.team = {
      ...(nextSport.team && typeof nextSport.team === 'object' ? nextSport.team : {}),
      teamId: input.teamId,
      organizationId: input.organizationId,
      ...(input.teamName ? { name: input.teamName } : {}),
      ...(input.teamType ? { type: input.teamType } : {}),
    };
  } else if ('team' in nextSport) {
    delete nextSport.team;
  }

  nextSport.updatedAt = input.updatedAt;
  sports[sportIndex] = nextSport;

  const activeSportIndex =
    typeof userData['activeSportIndex'] === 'number'
      ? (userData['activeSportIndex'] as number)
      : sports.length === 1
        ? 0
        : undefined;

  return {
    ...userData,
    sports,
    activeSportIndex: sports.length > 0 ? activeSportIndex : undefined,
  };
}
