/**
 * @fileoverview Write Roster Entries Tool — Batch upsert of team roster memberships
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes to the `RosterEntries` collection using a deterministic doc ID of
 * `${teamId}_${playerId}` — making writes idempotent and dedup-safe.
 *
 * CRITICAL: Without valid RosterEntries for a team, `fetchTeamRecruiting()` in
 * timeline.service.ts returns an empty result because it fans out from playerIds
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
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const ROSTER_ENTRIES_COLLECTION = 'RosterEntries';
const MAX_ENTRIES_PER_CALL = 50;

const VALID_STATUSES = new Set(['ghost', 'active', 'inactive', 'committed', 'transferred']);

const RosterEntrySchema = z
  .object({
    playerId: z.string().trim().min(1).optional(),
    status: z.string().trim().min(1).optional(),
    jerseyNumber: z.string().trim().min(1).optional(),
    position: z.string().trim().min(1).optional(),
    year: z.string().trim().min(1).optional(),
    sportId: z.string().trim().min(1).optional(),
    note: z.string().trim().min(1).optional(),
  })
  .passthrough();

const WriteRosterEntriesInputSchema = z.object({
  teamId: z.string().trim().min(1),
  teamCode: z.string().trim().min(1),
  entries: z.array(RosterEntrySchema).min(1).max(MAX_ENTRIES_PER_CALL),
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface RosterEntryInput {
  playerId: string;
  status?: string;
  jerseyNumber?: string;
  position?: string;
  year?: string;
  sportId?: string;
  note?: string;
}

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
    'Each entry uses a deterministic doc ID of `{teamId}_{playerId}` for idempotency.\n\n' +
    'IMPORTANT: RosterEntries are required for the team recruiting timeline to work.\n' +
    'Use status "ghost" for prospectsAgent X has identified but who have not formally committed.\n\n' +
    'Parameters:\n' +
    '- teamId (required): Team document ID.\n' +
    '- teamCode (required): Team code slug (used for cache invalidation).\n' +
    '- entries (required): Array of roster entries to upsert:\n' +
    '  • playerId (required): The user/prospect document ID.\n' +
    '  • status (optional): "ghost" | "active" | "inactive" | "committed" | "transferred". Defaults to "active".\n' +
    '  • jerseyNumber (optional): Jersey number string (e.g. "23").\n' +
    '  • position (optional): Position code (e.g. "PG", "QB").\n' +
    '  • year (optional): Academic year (e.g. "2026", "FR", "SO").\n' +
    '  • sportId (optional): Sport identifier.\n' +
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

    const { teamId, teamCode } = parsed.data;
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

      const rosterEntryService = createRosterEntryService(this.db);
      const userUpdates = new Map<string, Record<string, unknown>>();
      const userUnicodeMap = new Map<string, string | undefined>();

      // Firestore batch limit is 500 writes; entries cap at 50 so a single batch is fine
      const batch = this.db.batch();
      let written = 0;
      let skipped = 0;

      for (const rawEntry of rawEntries) {
        if (!rawEntry || typeof rawEntry !== 'object') {
          skipped++;
          continue;
        }
        const e = rawEntry as Record<string, unknown>;
        const playerId = this.str(e, 'playerId');
        if (!playerId) {
          skipped++;
          continue;
        }

        const rawStatus = this.str(e, 'status');
        const status: string = rawStatus && VALID_STATUSES.has(rawStatus) ? rawStatus : 'active';
        const resolvedSport = entrySportOrTeamSport(this.str(e, 'sportId') ?? undefined, teamSport);
        const normalizedPositions = normalizeEntryPositions(this.str(e, 'position') ?? undefined);
        const numericClassOf = parseClassOf(this.str(e, 'year') ?? undefined);

        const userRef = this.db.collection('Users').doc(playerId);
        const userSnap = await userRef.get();
        const userData = userSnap.exists
          ? ((userSnap.data() ?? {}) as Record<string, unknown>)
          : null;
        const userRecord = userData ?? {};
        const userRole = this.str(userRecord, 'role') ?? 'athlete';
        const unicode = this.str(userRecord, 'unicode') ?? '';
        const displayName = buildDisplayName(userData);
        const profileImgs = Array.isArray(userData?.['profileImgs'])
          ? userData?.['profileImgs'].filter((value): value is string => typeof value === 'string')
          : [];

        const entry: RosterEntryInput = {
          playerId,
          status,
          jerseyNumber: this.str(e, 'jerseyNumber') ?? undefined,
          position: this.str(e, 'position') ?? undefined,
          year: this.str(e, 'year') ?? undefined,
          sportId: this.str(e, 'sportId') ?? undefined,
          note: this.str(e, 'note') ?? undefined,
        };

        // Deterministic doc ID: ensures upsert is idempotent
        const docId = `${teamId}_${playerId}`;
        const docRef = this.db.collection(ROSTER_ENTRIES_COLLECTION).doc(docId);

        const docData: Record<string, unknown> = {
          teamId,
          teamCode,
          userId: playerId,
          playerId,
          organizationId,
          role: userRole,
          status: entry.status,
          ...(resolvedSport ? { sport: resolvedSport, sportId: resolvedSport } : {}),
          ...(unicode ? { unicode, profileCode: unicode } : {}),
          ...(this.str(userRecord, 'firstName')
            ? { firstName: this.str(userRecord, 'firstName') }
            : {}),
          ...(this.str(userRecord, 'lastName')
            ? { lastName: this.str(userRecord, 'lastName') }
            : {}),
          ...(displayName ? { displayName } : {}),
          ...(this.str(userRecord, 'email') ? { email: this.str(userRecord, 'email') } : {}),
          ...(readPhoneNumber(userData) ? { phoneNumber: readPhoneNumber(userData) } : {}),
          ...(profileImgs.length > 0 ? { profileImgs } : {}),
          ...(typeof userData?.['classOf'] === 'number' ? { classOf: userData['classOf'] } : {}),
          ...(readGpa(userData) !== undefined ? { gpa: readGpa(userData) } : {}),
          ...(this.str(userRecord, 'height') ? { height: this.str(userRecord, 'height') } : {}),
          ...(this.str(userRecord, 'weight') ? { weight: this.str(userRecord, 'weight') } : {}),
          ...(numericClassOf !== null
            ? {
                classOfWhenJoined: numericClassOf,
                classOf: numericClassOf,
                classYear: String(numericClassOf),
              }
            : entry.year !== undefined
              ? { classYear: entry.year }
              : {}),
          updatedAt: now,
        };

        if (entry.jerseyNumber !== undefined) docData['jerseyNumber'] = entry.jerseyNumber;
        if (normalizedPositions.length > 0) {
          docData['positions'] = normalizedPositions;
          docData['position'] = normalizedPositions[0];
        }
        if (entry.year !== undefined) docData['year'] = entry.year;
        if (entry.note !== undefined) {
          docData['note'] = entry.note;
          docData['coachNotes'] = entry.note;
        }

        // merge:true preserves existing fields (e.g. joinedAt, statsRef).
        // createdAt is intentionally excluded — with merge:true, any field listed
        // IS overwritten on every call. createdAt is set exactly once by the
        // Firestore onCreate trigger (functions/src/user/roster-entry.trigger.ts).
        // Only updatedAt (already in docData) is updated on every upsert.
        batch.set(docRef, docData, { merge: true });

        if (userData && resolvedSport) {
          const updatedUser = buildUpdatedUserProfile(userData, {
            sport: resolvedSport,
            positions: normalizedPositions,
            jerseyNumber: entry.jerseyNumber,
            teamId,
            organizationId,
            teamName,
            teamType,
            status,
            updatedAt: now,
          });
          userUpdates.set(playerId, updatedUser);
          userUnicodeMap.set(playerId, unicode || undefined);
        }

        written++;
      }

      if (written === 0) {
        return { success: false, error: 'No valid entries after validation.' };
      }

      context?.emitStage?.('submitting_job', {
        icon: 'database',
        entryCount: written,
        phase: 'upsert_roster_entries',
      });
      await batch.commit();

      for (const [userId, updatedUser] of userUpdates.entries()) {
        await this.db
          .collection('Users')
          .doc(userId)
          .set(
            {
              sports: updatedUser['sports'],
              ...(updatedUser['activeSportIndex'] !== undefined
                ? { activeSportIndex: updatedUser['activeSportIndex'] }
                : {}),
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
        cache.delByPrefix(`team:timeline:v1:${teamCode}:`),
        cache.delByPrefix(`team:profile:code:${teamCode}:`),
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
        teamCode,
        written,
        skipped,
      });

      return {
        success: true,
        data: {
          written,
          skipped,
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

function normalizeEntryPositions(position: string | undefined): string[] {
  if (!position) return [];

  const trimmed = position.trim();
  return trimmed ? [trimmed] : [];
}

function parseClassOf(year: string | undefined): number | null {
  if (!year) return null;
  const parsed = Number(year.trim());
  return Number.isInteger(parsed) && parsed >= 1900 && parsed <= 3000 ? parsed : null;
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
