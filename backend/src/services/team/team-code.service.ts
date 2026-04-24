/**
 * @fileoverview Team Code Service (Firebase)
 * @module @nxt1/backend/services/team-code
 *
 * Manages Teams collection in Firebase Firestore
 * - Role-based membership (Administrative, Coach, Athlete, Media)
 * - Redis caching
 * - Supports production/staging Firebase instances
 * - User join/invite/approve workflow
 * - Bulk operations
 */

import type { Firestore, WriteBatch } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import {
  TeamCode,
  TeamMember,
  ROLE,
  type UserRole,
  type CreateTeamCodeInput,
  type UpdateTeamCodeInput,
  type JoinTeamInput,
  type InviteMemberInput,
  type UpdateMemberRoleInput,
  type BulkUpdateMemberInput,
  type BulkUpdateResult,
} from '@nxt1/core/models';
import { getCacheService, CACHE_TTL } from '../core/cache.service.js';
import { notFoundError, conflictError, validationError, forbiddenError } from '@nxt1/core/errors';
import { logger } from '../../utils/logger.js';
import { RosterEntryService } from './roster-entry.service.js';
import { RosterEntryStatus } from '@nxt1/core/models';

// Helper to get cache
const getCache = () => getCacheService();

// ============================================
// CACHE KEYS
// ============================================

const CACHE_KEYS = {
  TEAM_BY_ID: (teamId: string) => `teamcode:id:${teamId}`,
  TEAM_BY_CODE: (code: string) => `teamcode:code:${code.toLowerCase()}`,
  TEAM_BY_UNICODE: (unicode: string) => `teamcode:unicode:${unicode.toLowerCase()}`,
  USER_TEAMS: (userId: string) => `user:${userId}:teams`,
  ALL_TEAMS: () => 'teamcodes:all',
} as const;

const TEAM_CACHE_TTL = CACHE_TTL.PROFILES; // 300s
const ALL_TEAMS_CACHE_TTL = 600; // 10 minutes for all teams

function mapRoleToRosterUserRole(role: ROLE): UserRole {
  switch (role) {
    case ROLE.coach:
      return 'coach';
    case ROLE.admin:
    case ROLE.director:
      return 'director';
    case ROLE.athlete:
    default:
      return 'athlete';
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert Firestore document to TeamCode
 */
function docToTeamCode(doc: FirebaseFirestore.DocumentSnapshot): TeamCode {
  if (!doc.exists) {
    throw notFoundError('team');
  }

  const data = doc.data();
  if (!data) {
    throw notFoundError('team');
  }

  return {
    id: doc.id,
    teamCode: data['teamCode'] ?? '',
    teamName: data['teamName'] ?? '',
    teamType: data['teamType'] ?? 'high-school',
    sport: data['sport'] ?? data['sportName'] ?? '',
    state: data['state'] ?? '',
    city: data['city'] ?? '',
    organizationId: data['organizationId'] ?? undefined,
    athleteMember: data['athleteMember'] ?? 0,
    panelMember: data['panelMember'] ?? 0,
    members: data['members'] ?? [],
    memberIds: data['memberIds'] ?? [],
    isActive: data['isActive'] ?? false,
    createdAt:
      data['createdAt']?.toDate?.() ??
      data['createdAt'] ??
      data['createAt']?.toDate?.() ??
      data['createAt'],
    expireAt: data['expireAt']?.toDate?.() ?? data['expireAt'],
    logoUrl: data['logoUrl'] ?? data['teamLogoImg'],
    teamLogoImg: data['teamLogoImg'] ?? data['logoUrl'],
    primaryColor: data['primaryColor'] ?? data['teamColor1'],
    secondaryColor: data['secondaryColor'] ?? data['teamColor2'],
    mascot: data['mascot'],
    unicode: data['unicode'],
    slug: data['slug'],
    division: data['division'],
    conference: data['conference'],
    description: data['description'],
    seasonHistory: data['seasonHistory'],
    seasonRecord: data['seasonRecord'],
    lastUpdatedStat: data['lastUpdatedStat'],
    socialLinks: data['socialLinks'],
    contactInfo: data['contactInfo'],
    teamLinks: data['teamLinks'],
    sponsor: data['sponsor'],
    totalTraffic: data['totalTraffic'] ?? 0,
    statsCategories: data['statsCategories'],
    recruitingActivities: data['recruitingActivities'],
  } as TeamCode;
}

/**
 * Validate team code format
 */
function validateTeamCodeFormat(code: string): void {
  if (!code || typeof code !== 'string') {
    throw validationError([
      { field: 'teamCode', message: 'Team code is required', rule: 'required' },
    ]);
  }

  const trimmed = code.trim();
  if (trimmed.length < 4 || trimmed.length > 20) {
    throw validationError([
      { field: 'teamCode', message: 'Team code must be 4-20 characters', rule: 'length' },
    ]);
  }

  if (!/^[A-Z0-9-_]+$/i.test(trimmed)) {
    throw validationError([
      {
        field: 'teamCode',
        message: 'Team code can only contain letters, numbers, hyphens, and underscores',
        rule: 'pattern',
      },
    ]);
  }
}

/**
 * Build a URL-friendly team slug from the team name only.
 */
export function buildTeamSlug(teamName: string): string {
  return teamName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accent marks
    .replace(/[^a-z0-9\s-]/g, '') // strip everything except letters, digits, spaces, hyphens
    .trim()
    .replace(/\s+/g, '-') // spaces → hyphens
    .replace(/-+/g, '-') // collapse consecutive hyphens
    .replace(/^-|-$/g, ''); // trim leading/trailing hyphens
}

/**
 * Generate a slug that is unique within the Teams collection.
 * If the base slug is already taken, appends -2, -3, … up to -99.
 */
async function generateUniqueTeamSlug(db: Firestore, teamName: string): Promise<string> {
  const base = buildTeamSlug(teamName);
  if (!base) {
    throw validationError([
      { field: 'teamName', message: 'Team name produces an empty slug', rule: 'invalid' },
    ]);
  }

  const existing = await db.collection('Teams').where('slug', '==', base).limit(1).get();
  if (existing.empty) return base;

  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`;
    const snap = await db.collection('Teams').where('slug', '==', candidate).limit(1).get();
    if (snap.empty) return candidate;
  }

  // Ultimate fallback — timestamp suffix keeps it unique
  return `${base}-${Date.now().toString(36).slice(-5)}`;
}

/**
 * Check if user has permission to manage team
 */
function canManageTeam(member: TeamMember | undefined): boolean {
  return member?.role === ROLE.admin;
}

/**
 * Check if user can manage specific role
 */
function canManageRole(requesterRole: ROLE, targetRole: ROLE): boolean {
  // Admin can manage all roles
  if (requesterRole === ROLE.admin) return true;

  // Coach can manage Athlete only
  if (requesterRole === ROLE.coach && targetRole === ROLE.athlete) return true;

  return false;
}

/**
 * Invalidate all team-related cache
 */
export async function invalidateTeamCache(
  teamId: string,
  teamCode?: string,
  unicode?: string
): Promise<void> {
  const keys = [CACHE_KEYS.TEAM_BY_ID(teamId)];

  if (teamCode) {
    keys.push(CACHE_KEYS.TEAM_BY_CODE(teamCode));
  }

  if (unicode) {
    keys.push(CACHE_KEYS.TEAM_BY_UNICODE(unicode));
  }

  const cache = getCache();
  await Promise.all(keys.map((key) => cache.del(key)));
  logger.debug('Team cache invalidated', { teamId, keys });
}

// ============================================
// TEAM CODE CRUD OPERATIONS
// ============================================

/**
 * Get TeamCode by ID
 */
export async function getTeamCodeById(
  db: Firestore,
  teamId: string,
  useCache = true
): Promise<{ team: TeamCode; cached: boolean }> {
  // Check cache
  const cache = getCache();
  if (useCache) {
    const cached = await cache.get<TeamCode>(CACHE_KEYS.TEAM_BY_ID(teamId));
    if (cached) {
      logger.debug('Team cache hit', { teamId });
      return { team: cached, cached: true };
    }
  }

  const doc = await db.collection('Teams').doc(teamId).get();
  const team = docToTeamCode(doc);

  // Cache result
  await cache.set(CACHE_KEYS.TEAM_BY_ID(teamId), team, { ttl: TEAM_CACHE_TTL });

  return { team, cached: false };
}

/**
 * Get TeamCode by teamCode
 */
export async function getTeamCodeByCode(
  db: Firestore,
  teamCode: string,
  useCache = true
): Promise<{ team: TeamCode | null; cached: boolean }> {
  validateTeamCodeFormat(teamCode);

  const normalizedCode = teamCode.toUpperCase();
  const cacheKey = CACHE_KEYS.TEAM_BY_CODE(normalizedCode);

  // Check cache
  const cache = getCache();
  if (useCache) {
    const cached = await cache.get<TeamCode>(cacheKey);
    if (cached) {
      logger.debug('Team cache hit (by code)', { teamCode: normalizedCode });
      return { team: cached, cached: true };
    }
  }

  const snapshot = await db
    .collection('Teams')
    .where('teamCode', '==', normalizedCode)
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return { team: null, cached: false };
  }

  const team = docToTeamCode(snapshot.docs[0]);

  // Cache result
  await cache.set(cacheKey, team, { ttl: TEAM_CACHE_TTL });

  return { team, cached: false };
}

/**
 * Get TeamCode by unicode (URL slug)
 */
export async function getTeamCodeByUnicode(
  db: Firestore,
  unicode: string,
  useCache = true
): Promise<{ team: TeamCode | null; cached: boolean }> {
  const cacheKey = CACHE_KEYS.TEAM_BY_UNICODE(unicode);

  // Check cache
  const cache = getCache();
  if (useCache) {
    const cached = await cache.get<TeamCode>(cacheKey);
    if (cached) {
      logger.debug('Team cache hit (by unicode)', { unicode });
      return { team: cached, cached: true };
    }
  }

  const snapshot = await db.collection('Teams').where('unicode', '==', unicode).limit(1).get();

  if (snapshot.empty) {
    return { team: null, cached: false };
  }

  const team = docToTeamCode(snapshot.docs[0]);

  // Cache result
  await cache.set(cacheKey, team, { ttl: TEAM_CACHE_TTL });

  return { team, cached: false };
}

/**
 * Generate member unicode based on team unicode and role
 * Used when member needs individual profile unicode
 * @param teamUnicode - Base team unicode (6 digits)
 * @param role - Member role (athlete=01, coach=02, director=03)
 * @returns 8-digit unicode (teamUnicode + role suffix)
 */
export function generateMemberUnicode(teamUnicode: string, role: ROLE): string {
  const roleSuffixes: Record<ROLE, string> = {
    [ROLE.admin]: '', // Admin uses team unicode (6 digits)
    [ROLE.athlete]: '01',
    [ROLE.coach]: '02',
    [ROLE.director]: '03',
  };

  const suffix = roleSuffixes[role] || '';
  return suffix ? `${teamUnicode}${suffix}` : teamUnicode;
}

/**
 * Create a new TeamCode.
 *
 * @param db        Firestore instance
 * @param input     Team creation payload
 * @param externalBatch  Optional WriteBatch — when provided, the new Team doc
 *                       is queued onto this batch instead of being committed
 *                       immediately. The caller is responsible for committing.
 *                       A synthetic TeamCode is returned (not yet persisted).
 */
export async function createTeamCode(
  db: Firestore,
  input: CreateTeamCodeInput,
  externalBatch?: WriteBatch
): Promise<TeamCode> {
  // Validate team name
  if (!input.teamName?.trim()) {
    throw validationError([
      { field: 'teamName', message: 'Team name is required', rule: 'required' },
    ]);
  }
  if (input.teamName.trim().length < 2) {
    throw validationError([
      { field: 'teamName', message: 'Team name must be at least 2 characters', rule: 'minLength' },
    ]);
  }

  validateTeamCodeFormat(input.teamCode);

  // Check if team code already exists
  const { team: existing } = await getTeamCodeByCode(db, input.teamCode, false);
  if (existing) {
    throw conflictError('teamCode');
  }

  // Generate a unique URL slug derived from the team name
  const slug = await generateUniqueTeamSlug(db, input.teamName);

  const teamData = {
    teamCode: input.teamCode.toUpperCase(),
    teamName: input.teamName,
    teamType: input.teamType,
    // Canonical field is `sport`.
    sport: input.sport,
    // Slug is derived from team name only — clean, lowercase, hyphenated
    slug,
    athleteMember: 0,
    panelMember: 0,
    isActive: true,
    // V2: membership is tracked exclusively via RosterEntry docs.
    // Legacy members[] and memberIds[] arrays are no longer written.
    createdAt: FieldValue.serverTimestamp(),
    level: input.level ?? '',
    division: input.division ?? '',
    conference: input.conference ?? '',
  };

  const docRef = db.collection('Teams').doc();

  if (externalBatch) {
    // Add to caller's batch — caller is responsible for committing
    externalBatch.set(docRef, teamData);
    logger.info('Team queued in batch', { teamId: docRef.id, teamCode: input.teamCode });

    // Return synthetic TeamCode (doc not yet committed)
    return {
      id: docRef.id,
      teamCode: teamData.teamCode as string,
      teamName: teamData.teamName as string,
      teamType: teamData.teamType as string,
      sport: teamData.sport as string,
      slug,
      athleteMember: 0,
      panelMember: 0,
      isActive: true,
      createdAt: new Date(),
    } as TeamCode;
  }

  await docRef.set(teamData);
  const doc = await docRef.get();

  const team = docToTeamCode(doc);

  logger.info('Team created', { teamId: team.id, teamCode: input.teamCode });

  return team;
}

/**
 * Update TeamCode
 */
export async function updateTeamCode(
  db: Firestore,
  teamId: string,
  userId: string,
  input: UpdateTeamCodeInput
): Promise<TeamCode> {
  const { team } = await getTeamCodeById(db, teamId, false);

  // Check permissions
  const member = team.members?.find((m: TeamMember) => m.id === userId);
  if (!canManageTeam(member)) {
    throw forbiddenError('admin');
  }

  const updateData: Record<string, unknown> = {};

  if (input.teamName !== undefined) updateData['teamName'] = input.teamName;
  if (input.teamType !== undefined) updateData['teamType'] = input.teamType;
  if (input.sport !== undefined) {
    updateData['sport'] = input.sport;
    updateData['sportName'] = FieldValue.delete();
  }
  if (input.athleteMember !== undefined) updateData['athleteMember'] = input.athleteMember;
  if (input.panelMember !== undefined) updateData['panelMember'] = input.panelMember;
  if (input.isActive !== undefined) updateData['isActive'] = input.isActive;
  if (input.unicode !== undefined) updateData['unicode'] = input.unicode;
  if (input.level !== undefined) updateData['level'] = input.level;
  if (input.division !== undefined) updateData['division'] = input.division;
  if (input.conference !== undefined) updateData['conference'] = input.conference;
  if (input.mascot !== undefined) updateData['mascot'] = input.mascot;
  if (input.city !== undefined) updateData['city'] = input.city;
  if (input.state !== undefined) updateData['state'] = input.state;

  if (input.logoUrl !== undefined) {
    updateData['logoUrl'] = input.logoUrl;
    updateData['teamLogoImg'] = input.logoUrl;
  }

  if (input.galleryImages !== undefined) {
    updateData['galleryImages'] = input.galleryImages;
  }

  if (input.primaryColor !== undefined) {
    updateData['primaryColor'] = input.primaryColor;
    updateData['teamColor1'] = input.primaryColor;
  }

  if (input.secondaryColor !== undefined) {
    updateData['secondaryColor'] = input.secondaryColor;
    updateData['teamColor2'] = input.secondaryColor;
  }

  if (input.accentColor !== undefined) {
    updateData['accentColor'] = input.accentColor;
  }

  const hasContactUpdates =
    input.email !== undefined ||
    input.phone !== undefined ||
    input.website !== undefined ||
    input.address !== undefined;

  if (hasContactUpdates) {
    const currentContactInfo =
      typeof team.contactInfo === 'object' && team.contactInfo !== null
        ? (team.contactInfo as unknown as Record<string, unknown>)
        : {};

    updateData['contactInfo'] = {
      ...currentContactInfo,
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
    };
  }

  if (input.email !== undefined) updateData['email'] = input.email;
  if (input.phone !== undefined) updateData['phone'] = input.phone;
  if (input.website !== undefined) updateData['website'] = input.website;
  if (input.address !== undefined) updateData['address'] = input.address;

  const hasRecordUpdates =
    input.wins !== undefined ||
    input.losses !== undefined ||
    input.ties !== undefined ||
    input.season !== undefined;

  if (hasRecordUpdates) {
    const currentSeasonRecord =
      typeof team.seasonRecord === 'object' && team.seasonRecord !== null
        ? (team.seasonRecord as Record<string, unknown>)
        : {};

    updateData['seasonRecord'] = {
      ...currentSeasonRecord,
      ...(input.wins !== undefined ? { wins: input.wins } : {}),
      ...(input.losses !== undefined ? { losses: input.losses } : {}),
      ...(input.ties !== undefined ? { ties: input.ties } : {}),
      ...(input.season !== undefined ? { season: input.season } : {}),
    };
  }

  if (Object.keys(updateData).length === 0) {
    return team;
  }

  updateData['updatedAt'] = FieldValue.serverTimestamp();

  await db.collection('Teams').doc(teamId).update(updateData);

  // Invalidate cache
  await invalidateTeamCache(teamId, team.teamCode, team.unicode);

  const { team: updatedTeam } = await getTeamCodeById(db, teamId, false);

  logger.info('Team updated', { teamId, userId, fields: Object.keys(updateData) });

  return updatedTeam;
}

/**
 * Delete TeamCode (soft delete by setting isActive = false)
 */
export async function deleteTeamCode(db: Firestore, teamId: string, userId: string): Promise<void> {
  const { team } = await getTeamCodeById(db, teamId, false);

  // Check permissions
  const member = team.members?.find((m: TeamMember) => m.id === userId);
  if (!canManageTeam(member)) {
    throw forbiddenError('admin');
  }

  await db.collection('Teams').doc(teamId).update({
    isActive: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Invalidate cache
  await invalidateTeamCache(teamId, team.teamCode, team.unicode);

  logger.info('Team deleted', { teamId, userId });
}

// ============================================
// MEMBERSHIP OPERATIONS
// ============================================

/**
 * User joins team with teamCode
 */
export async function joinTeam(db: Firestore, input: JoinTeamInput): Promise<TeamCode> {
  const { team } = await getTeamCodeByCode(db, input.teamCode, false);

  if (!team) {
    throw notFoundError('team');
  }

  if (!team.isActive) {
    throw validationError([{ field: 'teamCode', message: 'Team is not active', rule: 'active' }]);
  }

  // V2: Check membership via RosterEntry (source of truth)
  const existingEntry = await db
    .collection('RosterEntries')
    .where('teamId', '==', team.id)
    .where('userId', '==', input.userId)
    .where('status', 'in', [RosterEntryStatus.ACTIVE, RosterEntryStatus.PENDING])
    .limit(1)
    .get();

  if (!existingEntry.empty) {
    logger.debug('User already member (RosterEntry)', { userId: input.userId, teamId: team.id });
    return team;
  }

  // NOTE: athleteMember and panelMember on the Team doc are running COUNTERS
  // (incremented via FieldValue.increment on each join), NOT capacity limits.
  // There is no hard cap on team size in the current data model, so the
  // capacity check has been intentionally removed.

  const role = input.role ?? ROLE.athlete;

  // V2: Membership tracked via RosterEntry docs only.
  // No more memberIds[] writes on the Team doc.

  // Invalidate cache
  const cache = getCache();
  await invalidateTeamCache(team.id!, team.teamCode, team.unicode);
  await cache.del(CACHE_KEYS.USER_TEAMS(input.userId));

  logger.info('User joined team', { userId: input.userId, teamId: team.id, role });

  const { team: updatedTeam } = await getTeamCodeById(db, team.id!, false);
  return updatedTeam;
}

/**
 * Invite member to team
 */
export async function inviteMember(db: Firestore, input: InviteMemberInput): Promise<TeamCode> {
  const { team } = await getTeamCodeById(db, input.teamId, false);

  // Check permissions
  const inviter = team.members?.find((m: TeamMember) => m.id === input.invitedBy);
  if (!canManageTeam(inviter)) {
    throw forbiddenError('admin');
  }

  // V2: Check membership via RosterEntry (source of truth)
  const existingEntry = await db
    .collection('RosterEntries')
    .where('teamId', '==', input.teamId)
    .where('userId', '==', input.userId)
    .where('status', 'in', [RosterEntryStatus.ACTIVE, RosterEntryStatus.PENDING])
    .limit(1)
    .get();

  if (!existingEntry.empty) {
    throw conflictError('member');
  }

  // V2: Check capacity via RosterEntry count (source of truth)
  const rosterCountSnap = await db
    .collection('RosterEntries')
    .where('teamId', '==', input.teamId)
    .where('status', 'in', [RosterEntryStatus.ACTIVE, RosterEntryStatus.PENDING])
    .count()
    .get();
  const currentMemberCount = rosterCountSnap.data().count;
  const maxMembers = team.athleteMember + team.panelMember;

  if (currentMemberCount >= maxMembers) {
    throw validationError([
      { field: 'capacity', message: 'Team has reached maximum member capacity', rule: 'capacity' },
    ]);
  }

  // V2: Membership tracked via RosterEntry docs only.
  // No more memberIds[] writes on the Team doc.

  // Invalidate cache
  await invalidateTeamCache(input.teamId, team.teamCode, team.unicode);

  logger.info('Member invited', {
    userId: input.userId,
    teamId: input.teamId,
    invitedBy: input.invitedBy,
  });

  const { team: updatedTeam } = await getTeamCodeById(db, input.teamId, false);
  return updatedTeam;
}

/**
 * Remove member from team
 */
export async function removeMember(
  db: Firestore,
  teamId: string,
  userId: string,
  removedBy: string
): Promise<TeamCode> {
  const { team } = await getTeamCodeById(db, teamId, false);

  // Check permissions
  const remover = team.members?.find((m: TeamMember) => m.id === removedBy);
  if (!canManageTeam(remover)) {
    throw forbiddenError('admin');
  }

  const memberToRemove = team.members?.find((m: TeamMember) => m.id === userId);
  if (!memberToRemove) {
    throw notFoundError('member');
  }

  // Prevent removing last admin
  if (memberToRemove.role === ROLE.admin) {
    const adminCount = team.members?.filter((m) => m.role === ROLE.admin).length ?? 0;
    if (adminCount <= 1) {
      throw conflictError('Cannot remove the last administrator');
    }
  }

  // V2: Remove via RosterEntry (soft-delete), no more memberIds[] writes.
  const rosterService = new RosterEntryService(db);
  const rosterSnap = await db
    .collection('RosterEntries')
    .where('teamId', '==', teamId)
    .where('userId', '==', userId)
    .where('status', 'in', [RosterEntryStatus.ACTIVE, RosterEntryStatus.PENDING])
    .limit(1)
    .get();

  if (!rosterSnap.empty) {
    await rosterService.removeFromTeam(rosterSnap.docs[0].id);
  }

  // Invalidate cache
  const cache = getCache();
  await invalidateTeamCache(teamId, team.teamCode, team.unicode);
  await cache.del(CACHE_KEYS.USER_TEAMS(userId));

  logger.info('Member removed', { userId, teamId, removedBy });

  const { team: updatedTeam } = await getTeamCodeById(db, teamId, false);
  return updatedTeam;
}

/**
 * Update member role
 * V2: Updates the RosterEntry (source of truth) rather than team.members[].
 * Adjusts athleteMember / panelMember counters when role category changes.
 */
export async function updateMemberRole(
  db: Firestore,
  input: UpdateMemberRoleInput
): Promise<TeamCode> {
  const { team } = await getTeamCodeById(db, input.teamId, false);

  // Permission check — prefer RosterEntry (V2), fall back to legacy members[] (V1)
  const rosterService = new RosterEntryService(db);
  const updaterEntry = await rosterService.getActiveOrPendingRosterEntry(
    input.updatedBy,
    input.teamId
  );
  const updaterRole: ROLE = updaterEntry
    ? (updaterEntry.role as ROLE)
    : (team.members?.find((m: TeamMember) => m.id === input.updatedBy)?.role ?? ('' as ROLE));

  if (!updaterRole) {
    throw forbiddenError('permission');
  }

  const targetEntry = await rosterService.getActiveOrPendingRosterEntry(input.userId, input.teamId);
  const targetLegacyMember = team.members?.find((m: TeamMember) => m.id === input.userId);
  if (!targetEntry && !targetLegacyMember) {
    throw notFoundError('member');
  }

  // Derive current role from RosterEntry or legacy member
  const currentRole: ROLE = targetEntry
    ? (targetEntry.role as ROLE)
    : (targetLegacyMember?.role ?? ROLE.athlete);

  if (!canManageRole(updaterRole, input.newRole)) {
    throw forbiddenError('role');
  }

  // Prevent changing last admin
  if (currentRole === ROLE.admin && input.newRole !== ROLE.admin) {
    const adminCount = team.members?.filter((m) => m.role === ROLE.admin).length ?? 0;
    if (adminCount <= 1) {
      throw conflictError('Cannot change role of the last administrator');
    }
  }

  // V2: Mutate via RosterEntry when the entry exists
  if (targetEntry?.id) {
    await rosterService.updateRosterEntry(targetEntry.id, {
      role: mapRoleToRosterUserRole(input.newRole),
    });

    // Adjust team member counters if role category changed
    const wasAthlete = currentRole === ROLE.athlete;
    const isNowAthlete = input.newRole === ROLE.athlete;
    if (wasAthlete !== isNowAthlete) {
      const counterUpdate: Record<string, unknown> = {};
      if (wasAthlete) {
        counterUpdate['athleteMember'] = FieldValue.increment(-1);
        counterUpdate['panelMember'] = FieldValue.increment(1);
      } else {
        counterUpdate['panelMember'] = FieldValue.increment(-1);
        counterUpdate['athleteMember'] = FieldValue.increment(1);
      }
      await db.collection('Teams').doc(input.teamId).update(counterUpdate);
    }
  } else {
    // V1 fallback: update team.members[] for legacy entries without a RosterEntry
    const updatedMembers = team.members?.map((m: TeamMember) => {
      if (m.id === input.userId) {
        return { ...m, role: input.newRole };
      }
      return m;
    });
    await db.collection('Teams').doc(input.teamId).update({ members: updatedMembers });
  }

  // Invalidate cache
  await invalidateTeamCache(input.teamId, team.teamCode, team.unicode);

  logger.info('Member role updated', {
    userId: input.userId,
    teamId: input.teamId,
    oldRole: currentRole,
    newRole: input.newRole,
    updatedBy: input.updatedBy,
  });

  const { team: updatedTeam } = await getTeamCodeById(db, input.teamId, false);
  return updatedTeam;
}

/**
 * Bulk update member roles
 * V2: Updates RosterEntries (source of truth) for account-backed members;
 * falls back to team.members[] only for legacy members without a RosterEntry.
 */
export async function bulkUpdateMemberRoles(
  db: Firestore,
  teamId: string,
  updates: BulkUpdateMemberInput[],
  updatedBy: string
): Promise<BulkUpdateResult> {
  const { team } = await getTeamCodeById(db, teamId, false);

  // Permission check via RosterEntry (V2) with legacy fallback
  const rosterService = new RosterEntryService(db);
  const updaterEntry = await rosterService.getActiveOrPendingRosterEntry(updatedBy, teamId);
  const updaterRole: ROLE = updaterEntry
    ? (updaterEntry.role as ROLE)
    : (team.members?.find((m: TeamMember) => m.id === updatedBy)?.role ?? ('' as ROLE));

  if (!updaterRole || !canManageTeam({ role: updaterRole } as TeamMember)) {
    throw forbiddenError('admin');
  }

  const result: BulkUpdateResult = {
    successCount: 0,
    failedCount: 0,
    errors: [],
  };

  const legacyMembersToUpdate = [...(team.members ?? [])];
  let legacyChanged = false;

  for (const update of updates) {
    try {
      if (!canManageRole(updaterRole, update.newRole)) {
        result.failedCount++;
        result.errors.push({
          userId: update.userId,
          error: 'Insufficient permissions for this role',
        });
        continue;
      }

      const targetEntry = await rosterService.getActiveOrPendingRosterEntry(update.userId, teamId);

      if (targetEntry?.id) {
        await rosterService.updateRosterEntry(targetEntry.id, {
          role: mapRoleToRosterUserRole(update.newRole),
        });
        result.successCount++;
      } else {
        const memberIndex = legacyMembersToUpdate.findIndex((m) => m.id === update.userId);
        if (memberIndex === -1) {
          result.failedCount++;
          result.errors.push({ userId: update.userId, error: 'Member not found' });
          continue;
        }
        legacyMembersToUpdate[memberIndex] = {
          ...legacyMembersToUpdate[memberIndex],
          role: update.newRole,
        };
        legacyChanged = true;
        result.successCount++;
      }
    } catch (error) {
      result.failedCount++;
      result.errors.push({
        userId: update.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Write legacy members[] only if any legacy-path updates succeeded
  if (legacyChanged) {
    await db.collection('Teams').doc(teamId).update({ members: legacyMembersToUpdate });
  }

  // Invalidate cache
  await invalidateTeamCache(teamId, team.teamCode, team.unicode);

  logger.info('Bulk member role update', {
    teamId,
    updatedBy,
    successCount: result.successCount,
    failedCount: result.failedCount,
  });

  return result;
}

// ============================================
// QUERY OPERATIONS
// ============================================

export interface GetAllTeamsOptions {
  limit?: number;
  offset?: number;
  sportName?: string;
  state?: string;
  search?: string;
  sortBy?: 'name' | 'traffic' | 'created' | 'members';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedTeamsResult {
  teams: TeamCode[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  cached: boolean;
}

/**
 * Get all teams with pagination and filters
 */
export async function getAllTeams(
  db: Firestore,
  options: GetAllTeamsOptions = {}
): Promise<PaginatedTeamsResult> {
  const {
    limit = 20,
    offset = 0,
    sportName,
    state,
    search,
    sortBy = 'traffic',
    sortOrder = 'desc',
  } = options;

  // Start with base query
  let query = db.collection('Teams').where('isActive', '==', true);

  // Apply filters (where clauses)
  const normalizedSportName = sportName?.trim().toLowerCase();
  if (state) {
    query = query.where('state', '==', state.toUpperCase());
  }

  // Get all matching docs (Firestore doesn't support orderBy with where without index)
  // We'll sort and paginate client-side
  const snapshot = await query.get();
  let teams = snapshot.docs.map(docToTeamCode);

  if (normalizedSportName) {
    teams = teams.filter((team) => team.sport?.trim().toLowerCase() === normalizedSportName);
  }

  // Apply client-side search filter
  if (search) {
    const searchLower = search.toLowerCase();
    teams = teams.filter(
      (team) =>
        team.teamName?.toLowerCase().includes(searchLower) ||
        team.teamCode?.toLowerCase().includes(searchLower) ||
        team.city?.toLowerCase().includes(searchLower) ||
        team.unicode?.toLowerCase().includes(searchLower)
    );
  }

  // Sort client-side
  const sortField =
    sortBy === 'name'
      ? 'teamName'
      : sortBy === 'members'
        ? 'memberIds'
        : sortBy === 'traffic'
          ? null // handled separately below
          : 'createdAt';

  teams.sort((a, b) => {
    if (sortBy === 'traffic') {
      const aTraffic = a.totalTraffic || 0;
      const bTraffic = b.totalTraffic || 0;
      return sortOrder === 'desc' ? bTraffic - aTraffic : aTraffic - bTraffic;
    }

    const aVal = a[sortField as keyof TeamCode];
    const bVal = b[sortField as keyof TeamCode];

    // Handle arrays (memberIds)
    const aCompare = Array.isArray(aVal) ? aVal.length : (aVal as number) || 0;
    const bCompare = Array.isArray(bVal) ? bVal.length : (bVal as number) || 0;

    return sortOrder === 'desc' ? bCompare - aCompare : aCompare - bCompare;
  });

  const total = teams.length;

  // Apply pagination client-side
  const paginatedTeams = teams.slice(offset, offset + limit);

  return {
    teams: paginatedTeams,
    total,
    limit,
    offset,
    hasMore: offset + paginatedTeams.length < total,
    cached: false, // Always fresh from Firestore with filters
  };
}

/**
 * Get all teams without pagination (cached)
 * Use for bulk operations, exports, or when full dataset needed
 * Limited to 1000 teams for performance
 */
export async function getAllTeamsData(
  db: Firestore,
  options: { useCache?: boolean; maxLimit?: number } = {}
): Promise<{ teams: TeamCode[]; cached: boolean }> {
  const { useCache = true, maxLimit = 1000 } = options;
  const cacheKey = CACHE_KEYS.ALL_TEAMS();

  // Check cache
  const cache = getCache();
  if (useCache) {
    const cached = await cache.get<TeamCode[]>(cacheKey);
    if (cached) {
      logger.debug('All teams cache hit', { count: cached.length });
      return { teams: cached, cached: true };
    }
  }

  // Fetch from Firestore with reasonable limit
  const snapshot = await db.collection('Teams').where('isActive', '==', true).limit(maxLimit).get();

  const teams = snapshot.docs.map(docToTeamCode);

  // Sort client-side by the legacy totalTraffic field only.
  teams.sort((a, b) => (b.totalTraffic || 0) - (a.totalTraffic || 0));

  // Cache result
  if (useCache) {
    await cache.set(cacheKey, teams, { ttl: ALL_TEAMS_CACHE_TTL });
  }

  logger.info('Fetched all teams from Firestore', { count: teams.length });

  return { teams, cached: false };
}

/**
 * Get teams user is member of
 */
export async function getUserTeams(
  db: Firestore,
  userId: string
): Promise<{ teams: TeamCode[]; cached: boolean }> {
  const cacheKey = CACHE_KEYS.USER_TEAMS(userId);

  // Check cache
  const cache = getCache();
  const cached = await cache.get<TeamCode[]>(cacheKey);
  if (cached) {
    logger.debug('User teams cache hit', { userId });
    return { teams: cached, cached: true };
  }

  const snapshot = await db
    .collection('Teams')
    .where('memberIds', 'array-contains', userId)
    .where('isActive', '==', true)
    .get();

  const teams = snapshot.docs.map(docToTeamCode);

  // Cache result
  await cache.set(cacheKey, teams, { ttl: TEAM_CACHE_TTL });

  return { teams, cached: false };
}

/**
 * Team page view tracking no longer mutates Teams documents.
 * Keep the endpoint behavior stable while analytics live outside the team doc.
 */
export async function incrementTeamPageView(db: Firestore, teamId: string): Promise<void> {
  const teamDoc = await db.collection('Teams').doc(teamId).get();

  if (teamDoc.exists) {
    logger.debug('Skipped legacy team doc page view mutation', { teamId });
    return;
  }

  logger.warn('Team not found in Teams collection', { teamId });
}
