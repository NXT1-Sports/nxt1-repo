/**
 * @fileoverview Team Code Service (Firebase)
 * @module @nxt1/backend/services/team-code
 *
 * Manages TeamCodes collection in Firebase Firestore
 * - Role-based membership (Administrative, Coach, Athlete, Media)
 * - Redis caching
 * - Supports production/staging Firebase instances
 * - User join/invite/approve workflow
 * - Bulk operations
 */

import type { Firestore, FieldValue as FieldValueType } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  TeamCode,
  TeamMember,
  ROLE,
  type CreateTeamCodeInput,
  type UpdateTeamCodeInput,
  type JoinTeamInput,
  type InviteMemberInput,
  type UpdateMemberRoleInput,
  type BulkUpdateMemberInput,
  type BulkUpdateResult,
} from '@nxt1/core/models';
import { getCacheService, CACHE_TTL } from './cache.service.js';
import { notFoundError, conflictError, validationError, forbiddenError } from '@nxt1/core/errors';
import { logger } from '../utils/logger.js';

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
    sportName: data['sportName'] ?? '',
    state: data['state'] ?? '',
    city: data['city'] ?? '',
    athleteMember: data['athleteMember'] ?? 0,
    panelMember: data['panelMember'] ?? 0,
    members: data['members'] ?? [],
    memberIds: data['memberIds'] ?? [],
    packageId: data['packageId'] ?? '',
    isActive: data['isActive'] ?? false,
    createAt: data['createAt']?.toDate?.() ?? data['createAt'],
    expireAt: data['expireAt']?.toDate?.() ?? data['expireAt'],
    teamLogoImg: data['teamLogoImg'],
    teamColor1: data['teamColor1'],
    teamColor2: data['teamColor2'],
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
    analytic: data['analytic'],
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
 * Validate unicode format
 * - Team (created by admin): 6 digits
 * - Member profiles (athlete/coach/media): 8 digits (team_unicode + role_suffix)
 * - Legacy data: Accept 6-8 digits for backward compatibility
 */
function validateUnicodeFormat(unicode: string): void {
  if (!unicode || typeof unicode !== 'string') {
    throw validationError([{ field: 'unicode', message: 'Unicode is required', rule: 'required' }]);
  }

  if (!/^\d{6,8}$/.test(unicode)) {
    throw validationError([
      {
        field: 'unicode',
        message: 'Unicode must be 6-8 digits',
        rule: 'pattern',
      },
    ]);
  }
}

/**
 * Build team URL slug
 * Format: TeamName_with_underscores-sportName-unicode
 * Example: Rockvale_High_School-Basketball_mens-86664157
 */
export function buildTeamSlug(teamName: string, sportName: string, unicode: string): string {
  const namePart = teamName.replace(/\s+/g, '_');
  return `${namePart}-${sportName}-${unicode}`;
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
async function invalidateTeamCache(
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

  const doc = await db.collection('TeamCodes').doc(teamId).get();
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
    .collection('TeamCodes')
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

  const snapshot = await db.collection('TeamCodes').where('unicode', '==', unicode).limit(1).get();

  if (snapshot.empty) {
    return { team: null, cached: false };
  }

  const team = docToTeamCode(snapshot.docs[0]);

  // Cache result
  await cache.set(cacheKey, team, { ttl: TEAM_CACHE_TTL });

  return { team, cached: false };
}

/**
 * Generate unique 6-digit unicode for team (created by admin)
 * Note: Athletes/Coaches/Media who join teams don't create new teams,
 * they just become members of existing teams
 */
async function generateUniqueUnicode(db: Firestore): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    // Generate random 6-digit number (with leading zeros if needed)
    const randomNum = Math.floor(Math.random() * 1000000); // 0 to 999999
    const unicode = randomNum.toString().padStart(6, '0');

    // Check if unique
    const existing = await db
      .collection('TeamCodes')
      .where('unicode', '==', unicode)
      .limit(1)
      .get();

    if (existing.empty) {
      return unicode;
    }

    attempts++;
  }

  // Fallback: use timestamp-based if max attempts reached
  return Date.now().toString().slice(-6);
}

/**
 * Generate member unicode based on team unicode and role
 * Used when member needs individual profile unicode
 * @param teamUnicode - Base team unicode (6 digits)
 * @param role - Member role (athlete=01, coach=02, media=03)
 * @returns 8-digit unicode (teamUnicode + role suffix)
 */
export function generateMemberUnicode(teamUnicode: string, role: ROLE): string {
  const roleSuffixes: Record<ROLE, string> = {
    [ROLE.admin]: '', // Admin uses team unicode (6 digits)
    [ROLE.athlete]: '01',
    [ROLE.coach]: '02',
    [ROLE.media]: '03',
  };

  const suffix = roleSuffixes[role] || '';
  return suffix ? `${teamUnicode}${suffix}` : teamUnicode;
}

/**
 * Create a new TeamCode
 */
export async function createTeamCode(db: Firestore, input: CreateTeamCodeInput): Promise<TeamCode> {
  validateTeamCodeFormat(input.teamCode);

  // Check if team code already exists
  const { team: existing } = await getTeamCodeByCode(db, input.teamCode, false);
  if (existing) {
    throw conflictError('teamCode');
  }

  // Generate unicode if not provided, or validate if provided
  let unicode: string;
  if (input.unicode) {
    validateUnicodeFormat(input.unicode);
    // Check if unicode already exists
    const existingUnicode = await db
      .collection('TeamCodes')
      .where('unicode', '==', input.unicode)
      .limit(1)
      .get();
    if (!existingUnicode.empty) {
      throw conflictError('unicode');
    }
    unicode = input.unicode;
  } else {
    unicode = await generateUniqueUnicode(db);
  }

  // Create owner as first member
  const creatorMember: TeamMember = {
    id: input.createdBy,
    firstName: '',
    lastName: '',
    name: 'Team Owner',
    joinTime: new Date().toISOString(),
    role: ROLE.admin,
    isVerify: true,
    email: '',
    phoneNumber: '',
  };

  const teamData = {
    teamCode: input.teamCode.toUpperCase(),
    teamName: input.teamName,
    teamType: input.teamType,
    sportName: input.sportName,
    state: input.state,
    city: input.city,
    athleteMember: input.athleteMember,
    panelMember: input.panelMember,
    packageId: input.packageId,
    isActive: true,
    members: [creatorMember],
    memberIds: [input.createdBy],
    createAt: FieldValue.serverTimestamp(),
    teamLogoImg: input.teamLogoImg ?? '',
    teamColor1: input.teamColor1 ?? '',
    teamColor2: input.teamColor2 ?? '',
    mascot: input.mascot ?? '',
    unicode,
    division: input.division ?? '',
    conference: input.conference ?? '',
    expireAt: input.expireAt ? Timestamp.fromDate(input.expireAt) : null,
    totalTraffic: 0,
  };

  const docRef = await db.collection('TeamCodes').add(teamData);
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
  if (input.sportName !== undefined) updateData['sportName'] = input.sportName;
  if (input.state !== undefined) updateData['state'] = input.state;
  if (input.city !== undefined) updateData['city'] = input.city;
  if (input.athleteMember !== undefined) updateData['athleteMember'] = input.athleteMember;
  if (input.panelMember !== undefined) updateData['panelMember'] = input.panelMember;
  if (input.isActive !== undefined) updateData['isActive'] = input.isActive;
  if (input.teamLogoImg !== undefined) updateData['teamLogoImg'] = input.teamLogoImg;
  if (input.teamColor1 !== undefined) updateData['teamColor1'] = input.teamColor1;
  if (input.teamColor2 !== undefined) updateData['teamColor2'] = input.teamColor2;
  if (input.mascot !== undefined) updateData['mascot'] = input.mascot;
  if (input.unicode !== undefined) updateData['unicode'] = input.unicode;
  if (input.division !== undefined) updateData['division'] = input.division;
  if (input.conference !== undefined) updateData['conference'] = input.conference;
  if (input.expireAt !== undefined) {
    updateData['expireAt'] = input.expireAt ? Timestamp.fromDate(input.expireAt) : null;
  }

  if (Object.keys(updateData).length === 0) {
    return team;
  }

  await db.collection('TeamCodes').doc(teamId).update(updateData);

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

  await db.collection('TeamCodes').doc(teamId).update({
    isActive: false,
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

  // Check if already a member
  if (team.memberIds?.includes(input.userId)) {
    logger.debug('User already member', { userId: input.userId, teamId: team.id });
    return team;
  }

  // Check member limit
  const currentMemberCount = team.memberIds?.length ?? 0;
  const maxMembers = team.athleteMember + team.panelMember;

  if (currentMemberCount >= maxMembers) {
    throw validationError([
      { field: 'teamCode', message: 'Team has reached maximum member capacity', rule: 'capacity' },
    ]);
  }

  // Create new member
  const newMember: TeamMember = {
    id: input.userId,
    firstName: input.userProfile.firstName,
    lastName: input.userProfile.lastName,
    name: `${input.userProfile.firstName} ${input.userProfile.lastName}`,
    joinTime: new Date().toISOString(),
    role: input.role ?? ROLE.athlete,
    isVerify: false,
    email: input.userProfile.email,
    phoneNumber: input.userProfile.phoneNumber ?? '',
  };

  // Update team with new member (atomic operation)
  await db
    .collection('TeamCodes')
    .doc(team.id!)
    .update({
      members: FieldValue.arrayUnion(newMember) as unknown as FieldValueType,
      memberIds: FieldValue.arrayUnion(input.userId) as unknown as FieldValueType,
    });

  // Invalidate cache
  const cache = getCache();
  await invalidateTeamCache(team.id!, team.teamCode, team.unicode);
  await cache.del(CACHE_KEYS.USER_TEAMS(input.userId));

  logger.info('User joined team', { userId: input.userId, teamId: team.id, role: newMember.role });

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

  // Check if already a member
  if (team.memberIds?.includes(input.userId)) {
    throw conflictError('member');
  }

  // Check member limit
  const currentMemberCount = team.memberIds?.length ?? 0;
  const maxMembers = team.athleteMember + team.panelMember;

  if (currentMemberCount >= maxMembers) {
    throw validationError([
      { field: 'capacity', message: 'Team has reached maximum member capacity', rule: 'capacity' },
    ]);
  }

  // Create invited member
  const newMember: TeamMember = {
    id: input.userId,
    firstName: input.userProfile.firstName,
    lastName: input.userProfile.lastName,
    name: `${input.userProfile.firstName} ${input.userProfile.lastName}`,
    joinTime: new Date().toISOString(),
    role: input.role,
    isVerify: false,
    email: input.userProfile.email,
    phoneNumber: input.userProfile.phoneNumber ?? '',
  };

  // Update team with invited member
  await db
    .collection('TeamCodes')
    .doc(input.teamId)
    .update({
      members: FieldValue.arrayUnion(newMember) as unknown as FieldValueType,
      memberIds: FieldValue.arrayUnion(input.userId) as unknown as FieldValueType,
    });

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

  // Remove member
  const updatedMembers = team.members?.filter((m: TeamMember) => m.id !== userId) ?? [];
  const updatedMemberIds = team.memberIds?.filter((id: string) => id !== userId) ?? [];

  await db.collection('TeamCodes').doc(teamId).update({
    members: updatedMembers,
    memberIds: updatedMemberIds,
  });

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
 */
export async function updateMemberRole(
  db: Firestore,
  input: UpdateMemberRoleInput
): Promise<TeamCode> {
  const { team } = await getTeamCodeById(db, input.teamId, false);

  // Check permissions
  const updater = team.members?.find((m: TeamMember) => m.id === input.updatedBy);
  if (!updater) {
    throw forbiddenError('permission');
  }

  const targetMember = team.members?.find((m: TeamMember) => m.id === input.userId);
  if (!targetMember) {
    throw notFoundError('member');
  }

  // Check role management permissions
  if (!canManageRole(updater.role, input.newRole)) {
    throw forbiddenError('role');
  }

  // Prevent changing last admin
  if (targetMember.role === ROLE.admin && input.newRole !== ROLE.admin) {
    const adminCount = team.members?.filter((m) => m.role === ROLE.admin).length ?? 0;
    if (adminCount <= 1) {
      throw conflictError('Cannot change role of the last administrator');
    }
  }

  // Update member role
  const updatedMembers = team.members?.map((m: TeamMember) => {
    if (m.id === input.userId) {
      return { ...m, role: input.newRole };
    }
    return m;
  });

  await db.collection('TeamCodes').doc(input.teamId).update({
    members: updatedMembers,
  });

  // Invalidate cache
  await invalidateTeamCache(input.teamId, team.teamCode, team.unicode);

  logger.info('Member role updated', {
    userId: input.userId,
    teamId: input.teamId,
    oldRole: targetMember.role,
    newRole: input.newRole,
    updatedBy: input.updatedBy,
  });

  const { team: updatedTeam } = await getTeamCodeById(db, input.teamId, false);
  return updatedTeam;
}

/**
 * Bulk update member roles
 */
export async function bulkUpdateMemberRoles(
  db: Firestore,
  teamId: string,
  updates: BulkUpdateMemberInput[],
  updatedBy: string
): Promise<BulkUpdateResult> {
  const { team } = await getTeamCodeById(db, teamId, false);

  // Check permissions
  const updater = team.members?.find((m: TeamMember) => m.id === updatedBy);
  if (!canManageTeam(updater)) {
    throw forbiddenError('admin');
  }

  const result: BulkUpdateResult = {
    successCount: 0,
    failedCount: 0,
    errors: [],
  };

  const updatedMembers = [...(team.members ?? [])];

  for (const update of updates) {
    try {
      const memberIndex = updatedMembers.findIndex((m) => m.id === update.userId);

      if (memberIndex === -1) {
        result.failedCount++;
        result.errors.push({ userId: update.userId, error: 'Member not found' });
        continue;
      }

      const targetMember = updatedMembers[memberIndex];

      // Check role management permissions
      if (!canManageRole(updater!.role, update.newRole)) {
        result.failedCount++;
        result.errors.push({
          userId: update.userId,
          error: 'Insufficient permissions for this role',
        });
        continue;
      }

      // Update role
      updatedMembers[memberIndex] = { ...targetMember, role: update.newRole };
      result.successCount++;
    } catch (error) {
      result.failedCount++;
      result.errors.push({
        userId: update.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Apply updates if any succeeded
  if (result.successCount > 0) {
    await db.collection('TeamCodes').doc(teamId).update({
      members: updatedMembers,
    });

    // Invalidate cache
    await invalidateTeamCache(teamId, team.teamCode, team.unicode);
  }

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
  let query = db.collection('TeamCodes').where('isActive', '==', true);

  // Apply filters (where clauses)
  if (sportName) {
    query = query.where('sportName', '==', sportName);
  }
  if (state) {
    query = query.where('state', '==', state.toUpperCase());
  }

  // Get all matching docs (Firestore doesn't support orderBy with where without index)
  // We'll sort and paginate client-side
  const snapshot = await query.get();
  let teams = snapshot.docs.map(docToTeamCode);

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
      : sortBy === 'traffic'
        ? 'totalTraffic'
        : sortBy === 'members'
          ? 'memberIds'
          : 'createAt';

  teams.sort((a, b) => {
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
  const snapshot = await db
    .collection('TeamCodes')
    .where('isActive', '==', true)
    .limit(maxLimit)
    .get();

  const teams = snapshot.docs.map(docToTeamCode);

  // Sort client-side (since Firestore index not available)
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
    .collection('TeamCodes')
    .where('memberIds', 'array-contains', userId)
    .where('isActive', '==', true)
    .get();

  const teams = snapshot.docs.map(docToTeamCode);

  // Cache result
  await cache.set(cacheKey, teams, { ttl: TEAM_CACHE_TTL });

  return { teams, cached: false };
}

/**
 * Update team page view counter
 */
export async function incrementTeamPageView(db: Firestore, teamId: string): Promise<void> {
  await db
    .collection('TeamCodes')
    .doc(teamId)
    .update({
      totalTraffic: FieldValue.increment(1) as unknown as FieldValueType,
    });

  // Invalidate cache
  const team = await db.collection('TeamCodes').doc(teamId).get();
  if (team.exists) {
    const data = team.data();
    if (data) {
      await invalidateTeamCache(teamId, data['teamCode'], data['unicode']);
    }
  }
}
