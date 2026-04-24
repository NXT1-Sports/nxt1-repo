/**
 * @fileoverview Roster Entry Service
 * @module @nxt1/backend/services/roster-entry
 *
 * Manages RosterEntries collection in Firebase Firestore
 * This is the CRITICAL junction table connecting Users to Teams.
 *
 * Key Capabilities:
 * - Join team workflow (create RosterEntry)
 * - Query user's teams
 * - Query team's roster
 * - Update role/status per team
 * - Team-specific data (jersey, position, stats)
 * - Redis caching
 *
 * @version 3.0.0
 */

import type { Firestore, WriteBatch } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { normalizeRole } from '@nxt1/core';
import type { SportProfile } from '@nxt1/core';
import {
  RosterEntry,
  RosterEntryStatus,
  UserRole,
  type CreateRosterEntryInput,
  type UpdateRosterEntryInput,
  type ApproveRosterEntryInput,
  type GetUserTeamsQuery,
  type GetTeamRosterQuery,
  type GetOrganizationMembersQuery,
} from '@nxt1/core/models';
import { getCacheService } from '../core/cache.service.js';
import { notFoundError, conflictError } from '@nxt1/core/errors';
import { logger } from '../../utils/logger.js';

// Helper to get cache
const getCache = () => getCacheService();

// ============================================
// CACHE KEYS
// ============================================

const CACHE_KEYS = {
  ENTRY_BY_ID: (entryId: string) => `roster:id:${entryId}`,
  USER_TEAMS: (userId: string) => `roster:user:${userId}:teams`,
  TEAM_ROSTER: (teamId: string) => `roster:team:${teamId}:members`,
  ORG_MEMBERS: (orgId: string) => `roster:org:${orgId}:members`,
} as const;

const ROSTER_CACHE_TTL = 60; // 60s (frequently changing)

type CachedRosterUserDataUpdate = {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  unicode?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  profileImgs?: string[] | null;
  classOf?: number | null;
  gpa?: string | number | null;
  height?: string | null;
  weight?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeSportName(sport: string): string {
  return sport.trim();
}

function normalizeCachedNamePart(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function buildRosterDisplayName(input: {
  displayName?: string;
  firstName?: string;
  lastName?: string;
}): string | undefined {
  const explicitDisplayName = normalizeCachedNamePart(input.displayName);
  if (explicitDisplayName) {
    return explicitDisplayName;
  }

  const derivedDisplayName = [
    normalizeCachedNamePart(input.firstName),
    normalizeCachedNamePart(input.lastName),
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');

  return derivedDisplayName || undefined;
}

function normalizeRosterJerseyNumber(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized ? normalized : undefined;
  }

  return undefined;
}

function readMeasurableValue(userData: Record<string, unknown>, field: string): string | undefined {
  const measurables = userData['measurables'];
  if (!Array.isArray(measurables)) {
    return undefined;
  }

  const entry = measurables.find(
    (candidate): candidate is Record<string, unknown> =>
      isRecord(candidate) && candidate['field'] === field && candidate['value'] !== undefined
  );

  if (!entry) {
    return undefined;
  }

  if (typeof entry['value'] === 'number') {
    return String(entry['value']);
  }

  return normalizeCachedNamePart(typeof entry['value'] === 'string' ? entry['value'] : undefined);
}

function readGpa(userData: Record<string, unknown>): string | number | null {
  const topLevelGpa = userData['gpa'];
  if (typeof topLevelGpa === 'number' || typeof topLevelGpa === 'string') {
    return topLevelGpa;
  }

  const academics = isRecord(userData['academics']) ? userData['academics'] : undefined;
  const athlete = isRecord(userData['athlete']) ? userData['athlete'] : undefined;
  const athleteAcademics = isRecord(athlete?.['academics']) ? athlete['academics'] : undefined;
  const nestedGpa = athleteAcademics?.['gpa'] ?? academics?.['gpa'];

  if (typeof nestedGpa === 'number' || typeof nestedGpa === 'string') {
    return nestedGpa;
  }

  return null;
}

function readSportProfiles(userData: Record<string, unknown>): SportProfile[] {
  const sports = userData['sports'];
  if (!Array.isArray(sports)) {
    return [];
  }

  return sports.filter((sport): sport is SportProfile => isRecord(sport));
}

function buildCachedRosterUserDataFromUserProfile(
  userData: Record<string, unknown>
): CachedRosterUserDataUpdate {
  const contact = isRecord(userData['contact']) ? userData['contact'] : undefined;
  const firstName = normalizeCachedNamePart(
    typeof userData['firstName'] === 'string' ? userData['firstName'] : undefined
  );
  const lastName = normalizeCachedNamePart(
    typeof userData['lastName'] === 'string' ? userData['lastName'] : undefined
  );
  const displayName = buildRosterDisplayName({
    displayName: typeof userData['displayName'] === 'string' ? userData['displayName'] : undefined,
    firstName,
    lastName,
  });
  const email = normalizeCachedNamePart(
    typeof userData['email'] === 'string'
      ? userData['email']
      : typeof contact?.['email'] === 'string'
        ? contact['email']
        : undefined
  );
  const phoneNumber = normalizeCachedNamePart(
    typeof userData['phoneNumber'] === 'string'
      ? userData['phoneNumber']
      : typeof contact?.['phone'] === 'string'
        ? contact['phone']
        : undefined
  );

  return {
    firstName: firstName ?? '',
    lastName: lastName ?? '',
    displayName: displayName ?? '',
    unicode:
      normalizeCachedNamePart(typeof userData['unicode'] === 'string' ? userData['unicode'] : '') ??
      '',
    email: email ?? '',
    phoneNumber: phoneNumber ?? '',
    profileImgs: Array.isArray(userData['profileImgs'])
      ? userData['profileImgs'].filter((img): img is string => typeof img === 'string')
      : [],
    classOf: typeof userData['classOf'] === 'number' ? userData['classOf'] : null,
    gpa: readGpa(userData),
    height:
      normalizeCachedNamePart(
        typeof userData['height'] === 'string' ? userData['height'] : undefined
      ) ??
      readMeasurableValue(userData, 'height') ??
      null,
    weight:
      normalizeCachedNamePart(
        typeof userData['weight'] === 'string' ? userData['weight'] : undefined
      ) ??
      readMeasurableValue(userData, 'weight') ??
      null,
  };
}

function normalizeRosterPositions(
  role: UserRole,
  positions?: readonly string[]
): string[] | undefined {
  if (normalizeRole(role) !== 'athlete' || !Array.isArray(positions)) {
    return undefined;
  }

  const normalized = Array.from(
    new Set(
      positions
        .map((position) => position?.trim())
        .filter((position): position is string => Boolean(position))
    )
  );

  return normalized.length > 0 ? normalized : undefined;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert Firestore document to RosterEntry
 */
function docToRosterEntry(doc: FirebaseFirestore.DocumentSnapshot): RosterEntry {
  if (!doc.exists) {
    throw notFoundError('roster entry');
  }

  const data = doc.data();
  if (!data) {
    throw notFoundError('roster entry');
  }

  return {
    id: doc.id,
    userId: data['userId'] ?? '',
    teamId: data['teamId'] ?? '',
    organizationId: data['organizationId'] ?? '',
    role: (data['role'] ?? 'athlete') as UserRole,
    sport: typeof data['sport'] === 'string' ? data['sport'] : undefined,
    title: data['title'],
    status: data['status'] ?? RosterEntryStatus.PENDING,
    jerseyNumber: data['jerseyNumber'],
    positions: data['positions'] ?? [],
    season: data['season'],
    classOfWhenJoined: data['classOfWhenJoined'],
    stats: data['stats'],
    rating: data['rating'],
    coachNotes: data['coachNotes'],
    joinedAt: data['joinedAt']?.toDate?.() ?? data['joinedAt'],
    updatedAt: data['updatedAt']?.toDate?.() ?? data['updatedAt'],
    leftAt: data['leftAt']?.toDate?.() ?? data['leftAt'],
    invitedBy: data['invitedBy'],
    approvedBy: data['approvedBy'],
    approvedAt: data['approvedAt']?.toDate?.() ?? data['approvedAt'],
    // Cached user data
    firstName: data['firstName'],
    lastName: data['lastName'],
    displayName: buildRosterDisplayName({
      displayName: typeof data['displayName'] === 'string' ? data['displayName'] : undefined,
      firstName: typeof data['firstName'] === 'string' ? data['firstName'] : undefined,
      lastName: typeof data['lastName'] === 'string' ? data['lastName'] : undefined,
    }),
    unicode: typeof data['unicode'] === 'string' ? data['unicode'] : undefined,
    profileCode:
      typeof data['profileCode'] === 'string'
        ? data['profileCode']
        : typeof data['unicode'] === 'string'
          ? data['unicode']
          : undefined,
    profileImgs: Array.isArray(data['profileImgs'])
      ? (data['profileImgs'] as string[])
      : typeof data['profileImg'] === 'string' && data['profileImg'].trim().length > 0
        ? [data['profileImg']]
        : [],
    email: data['email'],
    phoneNumber: data['phoneNumber'],
    classOf: data['classOf'],
    gpa: data['gpa'],
    height: data['height'],
    weight: data['weight'],
  };
}

// ============================================
// SERVICE CLASS
// ============================================

export class RosterEntryService {
  private db: Firestore;
  private readonly COLLECTION = 'RosterEntries';

  constructor(db: Firestore) {
    this.db = db;
  }

  /**
   * Create a roster entry (user joins team).
   *
   * The RosterEntry creation and parent Team member counter increment
   * are always written atomically:
   *  - If `externalBatch` is provided, both ops are queued onto it (caller commits).
   *  - Otherwise an internal WriteBatch is used and committed here.
   *
   * Counter logic: Athletes increment `athleteMember`, all other roles
   * (coaches, directors, staff) increment `panelMember`.
   *
   * @param input          Roster entry payload
   * @param externalBatch  Optional WriteBatch for cross-service atomicity
   */
  async createRosterEntry(
    input: CreateRosterEntryInput,
    externalBatch?: WriteBatch
  ): Promise<RosterEntry> {
    logger.info('[RosterEntryService] Creating roster entry', {
      userId: input.userId,
      teamId: input.teamId,
    });

    // Check if entry already exists
    const existing = await this.db
      .collection(this.COLLECTION)
      .where('userId', '==', input.userId)
      .where('teamId', '==', input.teamId)
      .where('status', 'in', [RosterEntryStatus.ACTIVE, RosterEntryStatus.PENDING])
      .limit(1)
      .get();

    if (!existing.empty) {
      throw conflictError('User already on this team');
    }

    const normalizedRole = normalizeRole(input.role);
    const normalizedTitle = input.title?.trim();
    const isAthleteRole = normalizedRole === 'athlete';
    const normalizedSport = normalizeSportName(input.sport);
    const normalizedPositions = normalizeRosterPositions(normalizedRole, input.positions);
    const normalizedDisplayName = buildRosterDisplayName(input);

    const entryData: Record<string, unknown> = {
      userId: input.userId,
      teamId: input.teamId,
      organizationId: input.organizationId,
      role: normalizedRole,
      sport: normalizedSport,
      status: input.status ?? RosterEntryStatus.PENDING,
      invitedBy: input.invitedBy ?? null,
      joinedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      // Cached user data for display
      firstName: input.firstName ?? '',
      lastName: input.lastName ?? '',
      displayName: normalizedDisplayName ?? '',
      unicode: input.unicode,
      profileCode: input.profileCode ?? input.unicode,
      email: input.email ?? '',
      phoneNumber: input.phoneNumber ?? '',
    };

    // Only write profileImgs if it has values
    if (input.profileImgs?.length) entryData['profileImgs'] = input.profileImgs;
    if (!isAthleteRole && normalizedTitle) entryData['title'] = normalizedTitle;

    // Athlete-specific fields — only written for athletes
    if (isAthleteRole) {
      if (input.jerseyNumber) entryData['jerseyNumber'] = input.jerseyNumber;
      if (normalizedPositions) entryData['positions'] = normalizedPositions;
      if (input.classOf) entryData['classOf'] = input.classOf;
      if (input.season) entryData['season'] = input.season;
    }

    const docRef = this.db.collection(this.COLLECTION).doc();
    const teamRef = this.db.collection('Teams').doc(input.teamId);

    // Athletes increment athleteMember; everyone else increments panelMember
    const isAthlete = normalizedRole === 'athlete';
    const counterField = isAthlete ? 'athleteMember' : 'panelMember';

    if (externalBatch) {
      // Add to caller's batch — caller is responsible for committing
      externalBatch.set(docRef, entryData);
      externalBatch.update(teamRef, {
        [counterField]: FieldValue.increment(1),
      });

      logger.info('[RosterEntryService] Roster entry queued in batch', { entryId: docRef.id });

      // Invalidate caches
      await this.invalidateCaches(input.userId, input.teamId, input.organizationId);

      // Return synthetic entry (doc not yet committed)
      return {
        id: docRef.id,
        userId: entryData['userId'] as string,
        teamId: entryData['teamId'] as string,
        organizationId: entryData['organizationId'] as string,
        role: entryData['role'] as UserRole,
        sport: entryData['sport'] as string,
        title: entryData['title'] as string | undefined,
        status: (entryData['status'] as RosterEntryStatus) ?? RosterEntryStatus.PENDING,
        jerseyNumber: entryData['jerseyNumber'] as string | number | undefined,
        positions: (entryData['positions'] as string[] | undefined) ?? [],
        season: entryData['season'] as string | undefined,
        invitedBy: entryData['invitedBy'] as string | undefined,
        joinedAt: new Date(),
        updatedAt: new Date(),
        firstName: (entryData['firstName'] as string) ?? '',
        lastName: (entryData['lastName'] as string) ?? '',
        displayName: (entryData['displayName'] as string) ?? '',
        unicode: (entryData['unicode'] as string) ?? '',
        profileCode:
          (entryData['profileCode'] as string | undefined) ??
          (entryData['unicode'] as string | undefined) ??
          '',
        email: (entryData['email'] as string) ?? '',
        phoneNumber: (entryData['phoneNumber'] as string) ?? '',
        profileImgs: (entryData['profileImgs'] as string[] | undefined) ?? [],
        classOf: entryData['classOf'] as number | undefined,
      } as RosterEntry;
    }

    // No external batch — use internal batch for atomicity (fixes race condition)
    const batch = this.db.batch();
    batch.set(docRef, entryData);
    batch.update(teamRef, {
      [counterField]: FieldValue.increment(1),
    });
    await batch.commit();

    logger.info('[RosterEntryService] Roster entry created', { entryId: docRef.id });

    // Invalidate caches
    await this.invalidateCaches(input.userId, input.teamId, input.organizationId);

    // Read back the committed document
    const doc = await docRef.get();
    return docToRosterEntry(doc);
  }

  /**
   * Get roster entry by ID
   */
  async getRosterEntryById(entryId: string): Promise<RosterEntry> {
    const cacheKey = CACHE_KEYS.ENTRY_BY_ID(entryId);

    // Try cache first
    const cached = await getCache()?.get<RosterEntry>(cacheKey);
    if (cached) {
      return cached;
    }

    const doc = await this.db.collection(this.COLLECTION).doc(entryId).get();
    const entry = docToRosterEntry(doc);

    // Cache it
    await getCache()?.set(cacheKey, entry, { ttl: ROSTER_CACHE_TTL });

    return entry;
  }

  /**
   * Get an active or pending roster entry for a user on a specific team.
   */
  async getActiveOrPendingRosterEntry(userId: string, teamId: string): Promise<RosterEntry | null> {
    const snapshot = await this.db
      .collection(this.COLLECTION)
      .where('userId', '==', userId)
      .where('teamId', '==', teamId)
      .where('status', 'in', [RosterEntryStatus.ACTIVE, RosterEntryStatus.PENDING])
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return docToRosterEntry(snapshot.docs[0]);
  }

  /**
   * Get all teams for a user
   * This is the NEW way to query "Get my teams"
   */
  async getUserTeams(query: GetUserTeamsQuery): Promise<RosterEntry[]> {
    const cacheKey = CACHE_KEYS.USER_TEAMS(query.userId);

    // Try cache first
    const cached = await getCache()?.get<RosterEntry[]>(cacheKey);
    if (cached) {
      return cached;
    }

    let firestoreQuery = this.db.collection(this.COLLECTION).where('userId', '==', query.userId);

    // Filter by status
    if (query.status && query.status.length > 0) {
      firestoreQuery = firestoreQuery.where('status', 'in', query.status);
    } else if (!query.includeInactive) {
      firestoreQuery = firestoreQuery.where('status', '==', RosterEntryStatus.ACTIVE);
    }

    const snapshot = await firestoreQuery.get();
    const entries = snapshot.docs.map(docToRosterEntry);

    // Cache it
    await getCache()?.set(cacheKey, entries, { ttl: ROSTER_CACHE_TTL });

    return entries;
  }

  /**
   * Get roster for a team
   * This is the NEW way to query "Get team roster"
   */
  async getTeamRoster(query: GetTeamRosterQuery): Promise<RosterEntry[]> {
    const cacheKey = CACHE_KEYS.TEAM_ROSTER(query.teamId);

    // Try cache first if no filters
    if (!query.role && !query.status && !query.season) {
      const cached = await getCache()?.get<RosterEntry[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    let firestoreQuery = this.db.collection(this.COLLECTION).where('teamId', '==', query.teamId);

    // Filter by role
    if (query.role && query.role.length > 0) {
      firestoreQuery = firestoreQuery.where('role', 'in', query.role);
    }

    // Filter by status
    if (query.status && query.status.length > 0) {
      firestoreQuery = firestoreQuery.where('status', 'in', query.status);
    } else {
      // Default: only active members
      firestoreQuery = firestoreQuery.where('status', '==', RosterEntryStatus.ACTIVE);
    }

    // Filter by season
    if (query.season) {
      firestoreQuery = firestoreQuery.where('season', '==', query.season);
    }

    const snapshot = await firestoreQuery.get();
    const entries = snapshot.docs.map(docToRosterEntry);

    // Cache only if no filters
    if (!query.role && !query.status && !query.season) {
      await getCache()?.set(cacheKey, entries, { ttl: ROSTER_CACHE_TTL });
    }

    return entries;
  }

  /**
   * Get all members of an organization
   */
  async getOrganizationMembers(query: GetOrganizationMembersQuery): Promise<RosterEntry[]> {
    let firestoreQuery = this.db
      .collection(this.COLLECTION)
      .where('organizationId', '==', query.organizationId);

    if (query.role && query.role.length > 0) {
      firestoreQuery = firestoreQuery.where('role', 'in', query.role);
    }

    if (query.status && query.status.length > 0) {
      firestoreQuery = firestoreQuery.where('status', 'in', query.status);
    } else {
      firestoreQuery = firestoreQuery.where('status', '==', RosterEntryStatus.ACTIVE);
    }

    const snapshot = await firestoreQuery.get();
    return snapshot.docs.map(docToRosterEntry);
  }

  /**
   * Update roster entry
   */
  async updateRosterEntry(entryId: string, input: UpdateRosterEntryInput): Promise<RosterEntry> {
    logger.info('[RosterEntryService] Updating roster entry', { entryId });

    const currentEntry = await this.getRosterEntryById(entryId);
    const nextRole = input.role !== undefined ? normalizeRole(input.role) : currentEntry.role;
    const normalizedPositions = normalizeRosterPositions(nextRole, input.positions);

    const updateData: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (input.role !== undefined) updateData['role'] = nextRole;
    if (input.sport !== undefined) updateData['sport'] = normalizeSportName(input.sport);
    if (input.title !== undefined) {
      const normalizedTitle = input.title.trim();
      updateData['title'] = normalizedTitle ? normalizedTitle : FieldValue.delete();
    }
    if (input.status !== undefined) updateData['status'] = input.status;
    if (input.jerseyNumber !== undefined) updateData['jerseyNumber'] = input.jerseyNumber;
    if (nextRole !== 'athlete') {
      updateData['positions'] = FieldValue.delete();
    } else if (input.positions !== undefined) {
      updateData['positions'] = normalizedPositions ?? FieldValue.delete();
    }
    if (input.rating !== undefined) updateData['rating'] = input.rating;
    if (input.coachNotes !== undefined) updateData['coachNotes'] = input.coachNotes;
    if (input.stats !== undefined) updateData['stats'] = input.stats;

    await this.db.collection(this.COLLECTION).doc(entryId).update(updateData);

    // Invalidate cache
    const entry = await this.getRosterEntryById(entryId);
    await this.invalidateCaches(entry.userId, entry.teamId, entry.organizationId, entryId);

    return this.getRosterEntryById(entryId);
  }

  /**
   * Approve roster entry (pending -> active).
   * Bidirectional sync: sets sports[n].team on the user doc so the
   * user's profile reflects their team affiliation.
   */
  async approveRosterEntry(input: ApproveRosterEntryInput): Promise<RosterEntry> {
    logger.info('[RosterEntryService] Approving roster entry', {
      entryId: input.entryId,
      approvedBy: input.approvedBy,
    });

    await this.db.collection(this.COLLECTION).doc(input.entryId).update({
      status: RosterEntryStatus.ACTIVE,
      approvedBy: input.approvedBy,
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const entry = await this.getRosterEntryById(input.entryId);

    // Bidirectional sync — set sports[n].team on user doc
    await this.syncUserSportTeamField(entry.userId, entry.sport, entry.teamId);

    await this.invalidateCaches(entry.userId, entry.teamId, entry.organizationId, input.entryId);

    return entry;
  }

  /**
   * Remove user from team (soft delete).
   * Bidirectional sync: clears sports[n].team on the user doc for the
   * matching sport so the user's profile reflects they are no longer on the team.
   */
  async removeFromTeam(entryId: string): Promise<void> {
    logger.info('[RosterEntryService] Removing from team', { entryId });

    const entry = await this.getRosterEntryById(entryId);

    await this.db.collection(this.COLLECTION).doc(entryId).update({
      status: RosterEntryStatus.REMOVED,
      leftAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Bidirectional sync — clear sports[n].team on user doc
    await this.syncUserSportTeamField(entry.userId, entry.sport, null);

    await this.invalidateCaches(entry.userId, entry.teamId, entry.organizationId, entryId);
  }

  /**
   * Update cached user data across all roster entries for a user
   * Call this when User profile changes
   */
  async updateCachedUserData(userId: string, userData: CachedRosterUserDataUpdate): Promise<void> {
    logger.info('[RosterEntryService] Updating cached user data', { userId });

    const entries = await this.getUserTeams({ userId, includeInactive: true });

    const updateData: Record<string, unknown> = {};
    const cachedUserData = userData as CachedRosterUserDataUpdate;

    if ('firstName' in cachedUserData) updateData['firstName'] = cachedUserData.firstName ?? '';
    if ('lastName' in cachedUserData) updateData['lastName'] = cachedUserData.lastName ?? '';
    if (
      'displayName' in cachedUserData ||
      'firstName' in cachedUserData ||
      'lastName' in cachedUserData
    ) {
      updateData['displayName'] =
        buildRosterDisplayName({
          displayName:
            typeof cachedUserData.displayName === 'string' ? cachedUserData.displayName : undefined,
          firstName:
            typeof cachedUserData.firstName === 'string' ? cachedUserData.firstName : undefined,
          lastName:
            typeof cachedUserData.lastName === 'string' ? cachedUserData.lastName : undefined,
        }) ?? '';
    }
    if ('unicode' in cachedUserData) {
      updateData['unicode'] = cachedUserData.unicode ?? '';
      updateData['profileCode'] = cachedUserData.unicode ?? '';
    }
    if ('email' in cachedUserData) updateData['email'] = cachedUserData.email ?? '';
    if ('phoneNumber' in cachedUserData) {
      updateData['phoneNumber'] = cachedUserData.phoneNumber ?? '';
    }
    if ('profileImgs' in cachedUserData) {
      updateData['profileImgs'] = cachedUserData.profileImgs ?? [];
    }
    if ('classOf' in cachedUserData) {
      updateData['classOf'] = cachedUserData.classOf ?? FieldValue.delete();
    }
    if ('gpa' in cachedUserData) {
      updateData['gpa'] = cachedUserData.gpa ?? FieldValue.delete();
    }
    if ('height' in cachedUserData) {
      updateData['height'] = cachedUserData.height ?? FieldValue.delete();
    }
    if ('weight' in cachedUserData) {
      updateData['weight'] = cachedUserData.weight ?? FieldValue.delete();
    }

    if (Object.keys(updateData).length === 0) return;

    updateData['updatedAt'] = FieldValue.serverTimestamp();

    // Batch update all entries
    const batch = this.db.batch();
    for (const entry of entries) {
      if (entry.id) {
        const ref = this.db.collection(this.COLLECTION).doc(entry.id);
        batch.update(ref, updateData);
      }
    }

    await batch.commit();

    // Invalidate all affected caches
    for (const entry of entries) {
      await this.invalidateCaches(userId, entry.teamId, entry.organizationId);
    }
  }

  /**
   * Sync athlete positions from User.sports[] into matching roster entries.
   */
  async syncAthleteSportProfiles(
    userId: string,
    sports: readonly SportProfile[],
    options?: { clearMissing?: boolean }
  ): Promise<void> {
    const normalizedSports = sports
      .map((sport) => ({
        sport: sport.sport?.trim(),
        positions: normalizeRosterPositions('athlete', sport.positions),
        jerseyNumber: normalizeRosterJerseyNumber(sport.jerseyNumber),
      }))
      .filter(
        (
          sport
        ): sport is {
          sport: string;
          positions: string[] | undefined;
          jerseyNumber: string | number | undefined;
        } => Boolean(sport.sport)
      );

    logger.info('[RosterEntryService] Syncing athlete roster positions', {
      userId,
      sportCount: normalizedSports.length,
      clearMissing: options?.clearMissing === true,
    });

    const rosterSnapshot = await this.db
      .collection(this.COLLECTION)
      .where('userId', '==', userId)
      .where('role', '==', 'athlete')
      .get();

    if (rosterSnapshot.empty) {
      return;
    }

    const sportMap = new Map(
      normalizedSports.map((sport) => [sport.sport.toLowerCase(), sport] as const)
    );
    const batch = this.db.batch();
    const affectedEntries: Array<{ entryId: string; teamId: string; organizationId: string }> = [];

    for (const doc of rosterSnapshot.docs) {
      const entry = docToRosterEntry(doc);
      const sportKey = entry.sport?.trim().toLowerCase();
      if (!entry.id || !sportKey) {
        continue;
      }

      if (!sportMap.has(sportKey)) {
        if (!options?.clearMissing) {
          continue;
        }

        batch.update(doc.ref, {
          positions: FieldValue.delete(),
          jerseyNumber: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        affectedEntries.push({
          entryId: entry.id,
          teamId: entry.teamId,
          organizationId: entry.organizationId,
        });
        continue;
      }

      const sportProfile = sportMap.get(sportKey);
      batch.update(doc.ref, {
        positions: sportProfile?.positions ?? FieldValue.delete(),
        jerseyNumber: sportProfile?.jerseyNumber ?? FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      affectedEntries.push({
        entryId: entry.id,
        teamId: entry.teamId,
        organizationId: entry.organizationId,
      });
    }

    if (affectedEntries.length === 0) {
      return;
    }

    await batch.commit();

    for (const entry of affectedEntries) {
      await this.invalidateCaches(userId, entry.teamId, entry.organizationId, entry.entryId);
    }
  }

  async syncTeamSport(teamId: string, sport: string): Promise<void> {
    const normalizedSport = normalizeSportName(sport);
    if (!normalizedSport) {
      return;
    }

    const snapshot = await this.db.collection(this.COLLECTION).where('teamId', '==', teamId).get();

    if (snapshot.empty) {
      return;
    }

    const batch = this.db.batch();
    const affectedEntries: Array<{
      entryId: string;
      teamId: string;
      organizationId: string;
      userId: string;
    }> = [];

    for (const doc of snapshot.docs) {
      const entry = docToRosterEntry(doc);
      if (!entry.id) {
        continue;
      }

      batch.update(doc.ref, {
        sport: normalizedSport,
        updatedAt: FieldValue.serverTimestamp(),
      });
      affectedEntries.push({
        entryId: entry.id,
        teamId: entry.teamId,
        organizationId: entry.organizationId,
        userId: entry.userId,
      });
    }

    if (affectedEntries.length === 0) {
      return;
    }

    await batch.commit();

    for (const entry of affectedEntries) {
      await this.invalidateCaches(entry.userId, entry.teamId, entry.organizationId, entry.entryId);
    }
  }

  async syncUserProfileToRosterEntries(
    userId: string,
    userData: Record<string, unknown>
  ): Promise<void> {
    await this.updateCachedUserData(userId, buildCachedRosterUserDataFromUserProfile(userData));

    const role = typeof userData['role'] === 'string' ? normalizeRole(userData['role']) : undefined;
    if (role === 'athlete') {
      await this.syncAthleteSportProfiles(userId, readSportProfiles(userData), {
        clearMissing: true,
      });
    }
  }

  /**
   * Sync sports[n].team on the user document for a specific sport.
   *
   * - Pass teamId to set the team (join / approve)
   * - Pass null to clear the team (remove / leave)
   *
   * Skips silently if the user doc or sports array cannot be found, so
   * a missing user doc never blocks a membership mutation.
   */
  private async syncUserSportTeamField(
    userId: string,
    sport: string | undefined,
    teamId: string | null
  ): Promise<void> {
    if (!userId || !sport) return;

    try {
      const userRef = this.db.collection('Users').doc(userId);
      const userSnap = await userRef.get();
      if (!userSnap.exists) return;

      const userData = userSnap.data() as Record<string, unknown>;
      const sports = Array.isArray(userData['sports'])
        ? (userData['sports'] as Record<string, unknown>[])
        : [];

      if (sports.length === 0) return;

      const normalizedSport = sport.trim().toLowerCase();
      let matchedIndex = -1;
      for (let i = 0; i < sports.length; i++) {
        const s = sports[i];
        const sportName = typeof s['sport'] === 'string' ? s['sport'].trim().toLowerCase() : '';
        if (sportName === normalizedSport) {
          matchedIndex = i;
          break;
        }
      }

      if (matchedIndex === -1) return;

      // Firestore does not support partial array element updates directly —
      // we overwrite the full array with the one field changed.
      const updatedSports = sports.map((s, idx) => {
        if (idx !== matchedIndex) return s;
        if (teamId === null) {
          const { team: _removed, ...rest } = s as Record<string, unknown> & { team?: unknown };
          void _removed;
          return rest;
        }
        return { ...s, team: { teamId } };
      });

      await userRef.update({
        sports: updatedSports,
        updatedAt: FieldValue.serverTimestamp(),
      });

      logger.info('[RosterEntryService] Synced sports[n].team on user doc', {
        userId,
        sport,
        teamId,
      });
    } catch (err) {
      // Non-fatal — membership mutation already succeeded; log and continue
      logger.warn('[RosterEntryService] Failed to sync sports[n].team on user doc', {
        userId,
        sport,
        teamId,
        err,
      });
    }
  }

  /**
   * Invalidate caches
   */
  private async invalidateCaches(
    userId: string,
    teamId: string,
    orgId: string,
    entryId?: string
  ): Promise<void> {
    const cache = getCache();
    if (!cache) return;

    await Promise.all([
      ...(entryId ? [cache.del(CACHE_KEYS.ENTRY_BY_ID(entryId))] : []),
      cache.del(CACHE_KEYS.USER_TEAMS(userId)),
      cache.del(CACHE_KEYS.TEAM_ROSTER(teamId)),
      cache.del(CACHE_KEYS.ORG_MEMBERS(orgId)),
    ]);
  }
}

/**
 * Create roster entry service instance
 */
export function createRosterEntryService(db: Firestore): RosterEntryService {
  return new RosterEntryService(db);
}
