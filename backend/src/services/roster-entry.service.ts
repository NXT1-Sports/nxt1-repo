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

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import {
  RosterEntry,
  RosterEntryStatus,
  RosterRole,
  type CreateRosterEntryInput,
  type UpdateRosterEntryInput,
  type ApproveRosterEntryInput,
  type GetUserTeamsQuery,
  type GetTeamRosterQuery,
  type GetOrganizationMembersQuery,
} from '@nxt1/core/models';
import { getCacheService } from './cache.service.js';
import { notFoundError, conflictError } from '@nxt1/core/errors';
import { logger } from '../utils/logger.js';

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
    role: data['role'] ?? RosterRole.ATHLETE,
    status: data['status'] ?? RosterEntryStatus.PENDING,
    jerseyNumber: data['jerseyNumber'],
    positions: data['positions'] ?? [],
    primaryPosition: data['primaryPosition'],
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
    profileImg: data['profileImg'],
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
   * Create a roster entry (user joins team)
   * This is the NEW way of joining teams!
   */
  async createRosterEntry(input: CreateRosterEntryInput): Promise<RosterEntry> {
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

    const entryData = {
      userId: input.userId,
      teamId: input.teamId,
      organizationId: input.organizationId,
      role: input.role,
      status: input.status ?? RosterEntryStatus.PENDING,
      jerseyNumber: input.jerseyNumber ?? null,
      positions: input.positions ?? [],
      primaryPosition: input.primaryPosition ?? null,
      season: input.season ?? null,
      invitedBy: input.invitedBy ?? null,
      joinedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      // Cached user data for display
      firstName: input.firstName ?? '',
      lastName: input.lastName ?? '',
      email: input.email ?? '',
      phoneNumber: input.phoneNumber ?? '',
      profileImg: input.profileImg ?? null,
      classOf: input.classOf ?? null,
    };

    const docRef = await this.db.collection(this.COLLECTION).add(entryData);
    const doc = await docRef.get();

    logger.info('[RosterEntryService] Roster entry created', { entryId: docRef.id });

    // Invalidate caches
    await this.invalidateCaches(input.userId, input.teamId, input.organizationId);

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

    const updateData: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (input.role !== undefined) updateData['role'] = input.role;
    if (input.status !== undefined) updateData['status'] = input.status;
    if (input.jerseyNumber !== undefined) updateData['jerseyNumber'] = input.jerseyNumber;
    if (input.positions !== undefined) updateData['positions'] = input.positions;
    if (input.primaryPosition !== undefined) updateData['primaryPosition'] = input.primaryPosition;
    if (input.rating !== undefined) updateData['rating'] = input.rating;
    if (input.coachNotes !== undefined) updateData['coachNotes'] = input.coachNotes;
    if (input.stats !== undefined) updateData['stats'] = input.stats;

    await this.db.collection(this.COLLECTION).doc(entryId).update(updateData);

    // Invalidate cache
    const entry = await this.getRosterEntryById(entryId);
    await this.invalidateCaches(entry.userId, entry.teamId, entry.organizationId);

    return this.getRosterEntryById(entryId);
  }

  /**
   * Approve roster entry (pending -> active)
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
    await this.invalidateCaches(entry.userId, entry.teamId, entry.organizationId);

    return entry;
  }

  /**
   * Remove user from team (soft delete)
   */
  async removeFromTeam(entryId: string): Promise<void> {
    logger.info('[RosterEntryService] Removing from team', { entryId });

    const entry = await this.getRosterEntryById(entryId);

    await this.db.collection(this.COLLECTION).doc(entryId).update({
      status: RosterEntryStatus.REMOVED,
      leftAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await this.invalidateCaches(entry.userId, entry.teamId, entry.organizationId);
  }

  /**
   * Update cached user data across all roster entries for a user
   * Call this when User profile changes
   */
  async updateCachedUserData(userId: string, userData: Partial<RosterEntry>): Promise<void> {
    logger.info('[RosterEntryService] Updating cached user data', { userId });

    const entries = await this.getUserTeams({ userId, includeInactive: true });

    const updateData: Record<string, unknown> = {};
    if (userData.firstName) updateData['firstName'] = userData.firstName;
    if (userData.lastName) updateData['lastName'] = userData.lastName;
    if (userData.email) updateData['email'] = userData.email;
    if (userData.phoneNumber) updateData['phoneNumber'] = userData.phoneNumber;
    if (userData.profileImg !== undefined) updateData['profileImg'] = userData.profileImg ?? null;
    if (userData.classOf) updateData['classOf'] = userData.classOf;
    if (userData.height) updateData['height'] = userData.height;
    if (userData.weight) updateData['weight'] = userData.weight;

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
   * Invalidate caches
   */
  private async invalidateCaches(userId: string, teamId: string, orgId: string): Promise<void> {
    const cache = getCache();
    if (!cache) return;

    await Promise.all([
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
