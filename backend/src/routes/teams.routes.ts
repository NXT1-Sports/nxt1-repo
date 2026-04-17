/**
 * @fileoverview Team Management Routes (Firebase Teams)
 * @module @nxt1/backend/routes/teams
 *
 * Complete team management with Firebase Firestore Teams collection:
 * - TeamCode CRUD operations
 * - Role-based membership (Administrative, Coach, Athlete, Media)
 * - Bulk operations
 * - Redis cache integration
 * - Production/Staging Firebase support
 */

import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { appGuard, optionalAuth } from '../middleware/auth.middleware.js';
import { validateBody, validateQuery } from '../middleware/validation.middleware.js';
import {
  CreateTeamDto,
  GetTeamsDto,
  TeamType,
  JoinTeamDto,
  InviteMemberDto,
} from '../dtos/teams.dto.js';
import { asyncHandler, sendSuccess } from '@nxt1/core/errors/express';
import { forbiddenError, validationError } from '@nxt1/core/errors';
import { ROLE } from '@nxt1/core/models';
import * as teamCodeService from '../services/team-code.service.js';
import { createTeamAdapter } from '../services/team-adapter.service.js';
import {
  mapTeamCodeToProfile,
  type MapTeamProfileOptions,
} from '../services/team-profile-mapper.service.js';
import { logger } from '../utils/logger.js';
import { dispatch } from '../services/notification.service.js';
import { getUserById } from '../services/users.service.js';
import { NOTIFICATION_TYPES } from '@nxt1/core';
import { performanceMiddleware, testPerformance } from '../middleware/performance.middleware.js';
import {
  getCacheService,
  CACHE_TTL,
  invalidateTeamProfileCache,
} from '../services/cache.service.js';
import { markCacheHit } from '../middleware/cache-status.middleware.js';
import type { TeamProfilePageData } from '@nxt1/core/team-profile';
import { SyncDiffService } from '../modules/agent/sync/index.js';
import {
  buildDistilledProfileFromTeamRecord,
  buildPreviousStateFromTeamRecord,
} from '../modules/agent/sync/manual-sync-state.helpers.js';
import { onDailySyncComplete } from '../modules/agent/triggers/trigger.listeners.js';
import { createTimelineService } from '../services/timeline.service.js';

const router: ExpressRouter = Router();

// Define interface for requests with cache helpers
interface ValidatedRequest extends Request {
  markCacheHit?: (source: string, key: string) => void;
  markCacheMiss?: () => void;
}

// Add performance tracking to all routes
router.use(performanceMiddleware);

// ============================================
// VALIDATION HELPERS
// ============================================

function validateRequired(value: unknown, fieldName: string): void {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    throw validationError([
      { field: fieldName, message: `${fieldName} is required`, rule: 'required' },
    ]);
  }
}

function validateRole(role: string): void {
  const validRoles = Object.values(ROLE);
  if (!validRoles.includes(role as ROLE)) {
    throw validationError([
      {
        field: 'role',
        message: `Role must be one of: ${validRoles.join(', ')}`,
        rule: 'enum',
      },
    ]);
  }
}

interface TeamIntelPermissionMemberLike {
  readonly id?: string;
  readonly uid?: string;
  readonly userId?: string;
  readonly role?: string | null;
}

interface TeamIntelPermissionInput {
  readonly userId: string;
  readonly legacyMembers?: readonly TeamIntelPermissionMemberLike[];
  readonly roster?: readonly TeamIntelPermissionMemberLike[];
}

const TEAM_INTEL_MANAGER_ROLES = new Set([
  'administrative',
  'admin',
  'coach',
  'director',
  'owner',
  'head-coach',
  'assistant-coach',
  'staff',
  'program-director',
]);

function normalizeTeamIntelRole(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

export function canGenerateTeamIntelForUser({
  userId,
  legacyMembers = [],
  roster = [],
}: TeamIntelPermissionInput): boolean {
  const hasLegacyPermission = legacyMembers.some((member) => {
    const memberId = member.id ?? member.uid ?? member.userId;
    const role = normalizeTeamIntelRole(member.role);
    return memberId === userId && TEAM_INTEL_MANAGER_ROLES.has(role);
  });

  const hasRosterPermission = roster.some((entry) => {
    const role = normalizeTeamIntelRole(entry.role);
    return entry.userId === userId && TEAM_INTEL_MANAGER_ROLES.has(role);
  });

  return hasLegacyPermission || hasRosterPermission;
}

// ============================================
// TEAM CODE CRUD ROUTES
// ============================================

/**
 * Get all teams with pagination
 * GET /api/v1/teams?limit=20&offset=0&sportName=Football&state=CA&search=Lakers&sortBy=traffic
 */
router.get(
  '/',
  validateQuery(GetTeamsDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const db = req.firebase!.db;
    const query = req.query as GetTeamsDto;

    const result = await teamCodeService.getAllTeams(db, {
      limit: query.limit,
      offset: query.page ? (query.page - 1) * (query.limit || 20) : 0,
      sportName: query.sportName,
      state: query.state,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    logger.info('[Teams API] Fetched teams with pagination', {
      count: result.teams.length,
      total: result.total,
      offset: result.offset,
      limit: result.limit,
      cached: result.cached,
    });

    sendSuccess(res, result, { cached: result.cached });
  })
);

/**
 * Get all teams without pagination (cached)
 * GET /api/v1/teams/all?maxLimit=500
 * Returns cached list of all active teams (max 1000)
 */
router.get(
  '/all',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const db = req.firebase!.db;
    const { maxLimit } = req.query;

    const { teams, cached } = await teamCodeService.getAllTeamsData(db, {
      useCache: true,
      maxLimit: maxLimit ? parseInt(String(maxLimit), 10) : undefined,
    });

    // Mark cache status for middleware
    if (cached) {
      (req as ValidatedRequest).markCacheHit?.('redis', `teams:all:${maxLimit || 'default'}`);
    } else {
      (req as ValidatedRequest).markCacheMiss?.();
    }

    logger.info('[Teams API] Fetched all teams', { count: teams.length, cached });

    sendSuccess(res, { teams, total: teams.length });
  })
);

/**
 * Test performance monitoring
 * GET /api/v1/teams/debug/performance
 * Returns performance stats and recent metrics
 */
router.get(
  '/debug/performance',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await testPerformance();
    sendSuccess(res, result);
  })
);

/**
 * Get user's teams
 * GET /api/v1/teams/user/my-teams
 */
router.get(
  '/user/my-teams',
  appGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.uid;
    const db = req.firebase!.db;

    const { teams, cached } = await teamCodeService.getUserTeams(db, userId);

    sendSuccess(res, { teams }, { cached });
  })
);

/**
 * Get team profile by Firestore document ID
 * GET /api/v1/teams/by-id/:id
 * Returns full TeamProfilePageData — same shape as /by-slug but guaranteed to
 * resolve the exact team even when multiple teams share the same name/slug.
 */
router.get(
  '/by-id/:id',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const db = req.firebase!.db;
    const userId = req.user?.uid;

    validateRequired(id, 'Team ID');

    logger.debug('[Teams API] Fetching team profile by ID', { id, userId });

    const cache = getCacheService();
    const profileCacheKey = `team:profile:id:${id}:${userId ?? 'public'}`;
    const cachedProfile = await cache.get<TeamProfilePageData>(profileCacheKey);
    if (cachedProfile) {
      logger.debug('[Teams API] Team profile by ID served from cache', { id, userId });
      markCacheHit(req, 'redis', profileCacheKey);
      sendSuccess(res, cachedProfile, { cached: true });
      return;
    }

    const teamAdapter = createTeamAdapter(db);
    let teamCode;

    try {
      teamCode = await teamAdapter.getTeamWithMembers(String(id));
    } catch {
      teamCode = null;
    }

    if (!teamCode) {
      teamCode = await teamAdapter.getTeamByCode(String(id).trim());
    }

    if (!teamCode) {
      res.status(404).json({ success: false, error: 'Team not found' });
      return;
    }

    const options: MapTeamProfileOptions = {
      userId,
      includeRoster: true,
      includeSchedule: true,
      includePosts: true,
    };

    const profileData = await mapTeamCodeToProfile(teamCode, options, db);

    await cache.set(profileCacheKey, profileData, { ttl: CACHE_TTL.PROFILES });

    logger.info('[Teams API] Team profile fetched by ID', {
      teamId: teamCode.id,
      userId,
      rosterCount: profileData.roster.length,
      staffCount: profileData.staff.length,
    });

    sendSuccess(res, profileData, { cached: false });
  })
);

/**
 * Get team profile by teamCode string (e.g. "57L791")
 * GET /api/v1/teams/by-teamcode/:teamCode
 * Returns full TeamProfilePageData — same shape as /by-slug and /by-id.
 * Resolves via Teams.teamCode field first, then falls back to legacy TeamCodes doc.
 */
router.get(
  '/by-teamcode/:teamCode',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { teamCode } = req.params;
    const db = req.firebase!.db;
    const userId = req.user?.uid;

    validateRequired(teamCode, 'teamCode');

    logger.debug('[Teams API] Fetching team profile by teamCode', { teamCode, userId });

    const cache = getCacheService();
    const profileCacheKey = `team:profile:code:${teamCode}:${userId ?? 'public'}`;
    const cachedProfile = await cache.get<TeamProfilePageData>(profileCacheKey);
    if (cachedProfile) {
      logger.debug('[Teams API] Team profile by teamCode served from cache', { teamCode });
      markCacheHit(req, 'redis', profileCacheKey);
      sendSuccess(res, cachedProfile, { cached: true });
      return;
    }

    const teamAdapter = createTeamAdapter(db);
    const resolvedTeam = await teamAdapter.getTeamByCode(String(teamCode));

    if (!resolvedTeam) {
      res.status(404).json({ success: false, error: 'Team not found' });
      return;
    }

    const options: MapTeamProfileOptions = {
      userId,
      includeRoster: true,
      includeSchedule: true,
      includePosts: true,
    };

    const profileData = await mapTeamCodeToProfile(resolvedTeam, options, db);

    await cache.set(profileCacheKey, profileData, { ttl: CACHE_TTL.PROFILES });

    logger.info('[Teams API] Team profile fetched by teamCode', {
      teamCode,
      teamId: resolvedTeam.id,
      userId,
      rosterCount: profileData.roster.length,
      staffCount: profileData.staff.length,
    });

    sendSuccess(res, profileData, { cached: false });
  })
);

/**
 * Get team profile by slug (for team profile pages)
 * GET /api/v1/teams/by-slug/:slug
 * Returns full TeamProfilePageData with roster, stats, etc.
 * Uses Teams collection with TeamAdapter.
 */
router.get(
  '/by-slug/:slug',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { slug } = req.params;
    const db = req.firebase!.db;
    const userId = req.user?.uid; // Optional - for admin/member checks

    validateRequired(slug, 'Slug');

    logger.debug('Fetching team by slug', { slug, userId });

    // Use team adapter to support both old and new architectures
    const teamAdapter = createTeamAdapter(db);
    const teamCode = await teamAdapter.getTeamBySlug(String(slug));

    if (!teamCode) {
      res.status(404).json({
        success: false,
        error: 'Team not found',
      });
      return;
    }

    // Check full-profile Redis cache (separate from teamCode cache)
    const cache = getCacheService();
    const profileCacheKey = `team:profile:slug:${slug}:${userId ?? 'public'}`;
    const cachedProfile = await cache.get<TeamProfilePageData>(profileCacheKey);
    if (cachedProfile) {
      logger.debug('[Teams API] Team profile served from cache', { slug, userId });
      markCacheHit(req, 'redis', profileCacheKey);
      sendSuccess(res, cachedProfile, { cached: true });
      return;
    }

    // Map to TeamProfilePageData
    const options: MapTeamProfileOptions = {
      userId,
      includeRoster: true,
      includeSchedule: true,
      includePosts: true,
    };

    const profileData = await mapTeamCodeToProfile(teamCode, options, db);

    await cache.set(profileCacheKey, profileData, { ttl: CACHE_TTL.PROFILES });

    logger.info('[Teams API] Team profile fetched by slug', {
      teamId: teamCode.id,
      slug,
      userId,
      rosterCount: profileData.roster.length,
      staffCount: profileData.staff.length,
    });

    sendSuccess(res, profileData, { cached: false });
  })
);

/**
 * Get team by teamCode
 * GET /api/v1/teams/code/:teamCode
 */
router.get(
  '/code/:teamCode',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { teamCode } = req.params;
    const db = req.firebase!.db;

    validateRequired(teamCode, 'Team code');

    const { team, cached } = await teamCodeService.getTeamCodeByCode(db, String(teamCode));

    if (!team) {
      res.status(404).json({
        success: false,
        error: 'Team not found',
      });
      return;
    }

    sendSuccess(res, team, { cached });
  })
);

/**
 * Get team by unicode (URL slug)
 * GET /api/v1/teams/unicode/:unicode
 */
router.get(
  '/unicode/:unicode',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { unicode } = req.params;
    const db = req.firebase!.db;

    validateRequired(unicode, 'Unicode');

    const { team, cached } = await teamCodeService.getTeamCodeByUnicode(db, String(unicode));

    if (!team) {
      res.status(404).json({
        success: false,
        error: 'Team not found',
      });
      return;
    }

    sendSuccess(res, team, { cached });
  })
);

/**
 * Create a new TeamCode
 * POST /api/v1/teams
 */
router.post(
  '/',
  appGuard,
  validateBody(CreateTeamDto),
  asyncHandler(async (req: Request, res: Response) => {
    const teamData = req.body as CreateTeamDto;
    const userId = req.user!.uid;
    const db = req.firebase!.db;

    const team = await teamCodeService.createTeamCode(db, {
      teamCode: teamData.code.trim(),
      teamName: teamData.name.trim(),
      teamType: TeamType.CLUB, // Default to club type
      sport: teamData.sport.trim(),
      createdBy: userId,
    });

    logger.info('[Teams API] TeamCode created', { teamId: team.id, userId });

    res.status(201);
    sendSuccess(res, team);
  })
);

/**
 * Get team by ID
 * GET /api/v1/teams/:id
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const db = req.firebase!.db;

    validateRequired(id, 'Team ID');

    const { team, cached } = await teamCodeService.getTeamCodeById(db, String(id));

    sendSuccess(res, team, { cached });
  })
);

/**
 * Update team
 * PATCH /api/v1/teams/:id
 */
router.patch(
  '/:id',
  appGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      teamName,
      teamType,
      sportName,
      athleteMember,
      panelMember,
      isActive,
      unicode,
      division,
      conference,
      mascot,
      email,
      phone,
      website,
      address,
      city,
      state,
      wins,
      losses,
      ties,
      season,
      logoUrl,
      galleryImages,
      primaryColor,
      secondaryColor,
      accentColor,
    } = req.body;

    const userId = req.user!.uid;
    const db = req.firebase!.db;

    validateRequired(id, 'Team ID');

    let previousTeam: Record<string, unknown> | null = null;
    try {
      const previousSnapshot = await teamCodeService.getTeamCodeById(db, String(id));
      previousTeam = previousSnapshot.team as unknown as Record<string, unknown>;
    } catch (err) {
      logger.warn('[Teams API] Failed to load previous team snapshot for delta', {
        teamId: id,
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const team = await teamCodeService.updateTeamCode(db, String(id), userId, {
      teamName: teamName?.trim(),
      teamType,
      sport: sportName?.trim(),
      athleteMember: athleteMember !== undefined ? parseInt(String(athleteMember), 10) : undefined,
      panelMember: panelMember !== undefined ? parseInt(String(panelMember), 10) : undefined,
      isActive,
      unicode: unicode?.trim(),
      division: division?.trim(),
      conference: conference?.trim(),
      mascot: typeof mascot === 'string' ? mascot.trim() : undefined,
      email: typeof email === 'string' ? email.trim() : undefined,
      phone: typeof phone === 'string' ? phone.trim() : undefined,
      website: typeof website === 'string' ? website.trim() : undefined,
      address: typeof address === 'string' ? address.trim() : undefined,
      city: typeof city === 'string' ? city.trim() : undefined,
      state: typeof state === 'string' ? state.trim() : undefined,
      wins: wins !== undefined ? parseInt(String(wins), 10) : undefined,
      losses: losses !== undefined ? parseInt(String(losses), 10) : undefined,
      ties: ties !== undefined ? parseInt(String(ties), 10) : undefined,
      season: typeof season === 'string' ? season.trim() : undefined,
      logoUrl: typeof logoUrl === 'string' ? logoUrl.trim() : undefined,
      galleryImages: Array.isArray(galleryImages)
        ? galleryImages
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean)
        : undefined,
      primaryColor: typeof primaryColor === 'string' ? primaryColor.trim() : undefined,
      secondaryColor: typeof secondaryColor === 'string' ? secondaryColor.trim() : undefined,
      accentColor: typeof accentColor === 'string' ? accentColor.trim() : undefined,
    });

    logger.info('[Teams API] TeamCode updated', { teamId: id, userId });

    void invalidateTeamProfileCache(String(id), team.slug ?? undefined, team.teamCode ?? undefined);

    if (previousTeam) {
      try {
        const diffService = new SyncDiffService();
        const deltaSport =
          (typeof team.sport === 'string' && team.sport.trim()) ||
          (typeof sportName === 'string' && sportName.trim()) ||
          'general';
        const scopedDelta = {
          ...diffService.diff(
            userId,
            deltaSport,
            'manual-team',
            buildPreviousStateFromTeamRecord(previousTeam),
            buildDistilledProfileFromTeamRecord(
              team as unknown as Record<string, unknown>,
              deltaSport
            )
          ),
          teamId: String(id),
          organizationId:
            typeof (team as { organizationId?: unknown }).organizationId === 'string'
              ? ((team as { organizationId?: string }).organizationId ?? undefined)
              : undefined,
        };

        if (!scopedDelta.isEmpty) {
          logger.info('[Teams API] Manual team delta detected, firing sync trigger', {
            teamId: id,
            userId,
            sport: scopedDelta.sport,
            totalChanges: scopedDelta.summary.totalChanges,
          });
          void onDailySyncComplete(scopedDelta).catch((err) => {
            logger.warn('[Teams API] Manual team sync trigger dispatch failed', {
              teamId: id,
              userId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      } catch (err) {
        logger.warn('[Teams API] Manual team delta computation failed', {
          teamId: id,
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    sendSuccess(res, team);
  })
);

/**
 * Delete team (soft delete)
 * DELETE /api/v1/teams/:id
 */
router.delete(
  '/:id',
  appGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.uid;
    const db = req.firebase!.db;

    validateRequired(id, 'Team ID');

    await teamCodeService.deleteTeamCode(db, String(id), userId);

    logger.info('[Teams API] TeamCode deleted', { teamId: id, userId });

    sendSuccess(res, { message: 'Team deleted successfully' });
  })
);

// ============================================
// MEMBERSHIP ROUTES
// ============================================

/**
 * Join team by teamCode
 * POST /api/v1/teams/:teamCode/join
 */
router.post(
  '/:teamCode/join',
  appGuard,
  validateBody(JoinTeamDto),
  asyncHandler(async (req: Request, res: Response) => {
    const { teamCode } = req.params;
    const { role, firstName, lastName, email, phoneNumber } = req.body;
    const userId = req.user!.uid;
    const db = req.firebase!.db;

    validateRequired(teamCode, 'Team code');
    validateRequired(firstName, 'firstName');
    validateRequired(lastName, 'lastName');
    validateRequired(email, 'email');

    if (role) {
      validateRole(role);
    }

    const team = await teamCodeService.joinTeam(db, {
      userId,
      teamCode: String(teamCode),
      role: role as ROLE,
      userProfile: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phoneNumber: phoneNumber?.trim(),
      },
    });

    logger.info('[Teams API] User joined team', { teamCode, userId });

    void invalidateTeamProfileCache(
      team.id ?? '',
      team.slug ?? undefined,
      team.teamCode ?? undefined
    );

    // Fire-and-forget: notify team owner that a new member joined
    void (async () => {
      if (!team.id) return;
      const [teamDoc, joiner] = await Promise.all([
        db.collection('Teams').doc(team.id).get(),
        getUserById(userId, db),
      ]);
      const teamOwnerId = teamDoc.data()?.['createdBy'] as string | undefined;
      if (!teamOwnerId || teamOwnerId === userId) return;
      const joinerName = joiner
        ? `${(joiner['firstName'] as string | undefined) ?? ''} ${(joiner['lastName'] as string | undefined) ?? ''}`.trim() ||
          'Someone'
        : 'Someone';
      await dispatch(db, {
        userId: teamOwnerId,
        type: NOTIFICATION_TYPES.TEAM_MEMBER_JOINED,
        title: `${joinerName} joined ${team.teamName}`,
        body: 'A new member joined your team',
        data: { teamId: team.id },
        source: { userId, userName: joinerName, teamName: team.teamName },
      });
    })().catch((err) =>
      logger.error('[Teams] Failed to dispatch team_member_joined notification', { error: err })
    );

    res.status(201);
    sendSuccess(res, team);
  })
);

/**
 * Invite member to team
 * POST /api/v1/teams/:id/invite
 */
router.post(
  '/:id/invite',
  appGuard,
  validateBody(InviteMemberDto),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { userId: targetUserId, role, firstName, lastName, email, phoneNumber } = req.body;
    const inviterId = req.user!.uid;
    const db = req.firebase!.db;

    validateRequired(id, 'Team ID');
    validateRequired(targetUserId, 'User ID');
    validateRequired(role, 'Role');
    validateRequired(firstName, 'firstName');
    validateRequired(lastName, 'lastName');
    validateRequired(email, 'email');

    validateRole(role);

    const team = await teamCodeService.inviteMember(db, {
      teamId: String(id),
      userId: targetUserId,
      role: role as ROLE,
      invitedBy: inviterId,
      userProfile: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phoneNumber: phoneNumber?.trim(),
      },
    });

    logger.info('[Teams API] Member invited', { teamId: id, targetUserId, role });

    // Fire-and-forget: notify the invited user
    void (async () => {
      const inviter = await getUserById(inviterId, db);
      const inviterName = inviter
        ? `${(inviter['firstName'] as string | undefined) ?? ''} ${(inviter['lastName'] as string | undefined) ?? ''}`.trim() ||
          'Someone'
        : 'Someone';
      await dispatch(db, {
        userId: targetUserId,
        type: NOTIFICATION_TYPES.TEAM_INVITE,
        title: `${inviterName} invited you to join ${team.teamName}`,
        body: `You've been invited to join ${team.teamName} as ${role}`,
        data: { teamId: team.id ?? String(id) },
        source: { userId: inviterId, userName: inviterName, teamName: team.teamName },
      });
    })().catch((err) =>
      logger.error('[Teams] Failed to dispatch team_invite notification', { error: err })
    );

    res.status(201);
    sendSuccess(res, team);
  })
);

/**
 * Remove member from team
 * DELETE /api/v1/teams/:id/members/:userId
 */
router.delete(
  '/:id/members/:userId',
  appGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const { id, userId: targetUserId } = req.params;
    const removerId = req.user!.uid;
    const db = req.firebase!.db;

    validateRequired(id, 'Team ID');
    validateRequired(targetUserId, 'User ID');

    const { team: existingTeam } = await teamCodeService.getTeamCodeById(db, String(id));

    await teamCodeService.removeMember(db, String(id), String(targetUserId), removerId);

    logger.info('[Teams API] Member removed', { teamId: id, targetUserId });

    void invalidateTeamProfileCache(
      String(id),
      existingTeam?.slug ?? undefined,
      existingTeam?.teamCode ?? undefined
    );

    sendSuccess(res, { message: 'Member removed successfully' });
  })
);

/**
 * Update member role
 * PATCH /api/v1/teams/:id/members/:userId/role
 */
router.patch(
  '/:id/members/:userId/role',
  appGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const { id, userId: targetUserId } = req.params;
    const { role } = req.body;
    const updaterId = req.user!.uid;
    const db = req.firebase!.db;

    validateRequired(id, 'Team ID');
    validateRequired(targetUserId, 'User ID');
    validateRequired(role, 'Role');

    validateRole(role);

    const team = await teamCodeService.updateMemberRole(db, {
      teamId: String(id),
      userId: String(targetUserId),
      newRole: role as ROLE,
      updatedBy: updaterId,
    });

    logger.info('[Teams API] Member role updated', { teamId: id, targetUserId, role });

    void invalidateTeamProfileCache(String(id), team.slug ?? undefined, team.teamCode ?? undefined);

    sendSuccess(res, team);
  })
);

/**
 * Bulk update member roles
 * PATCH /api/v1/teams/:id/members/bulk
 */
router.patch(
  '/:id/members/bulk',
  appGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { updates } = req.body;
    const updaterId = req.user!.uid;
    const db = req.firebase!.db;

    validateRequired(id, 'Team ID');
    validateRequired(updates, 'Updates');

    if (!Array.isArray(updates)) {
      throw validationError([
        { field: 'updates', message: 'Updates must be an array', rule: 'type' },
      ]);
    }

    // Validate all roles in updates
    for (const update of updates) {
      if (update.newRole) {
        validateRole(update.newRole);
      }
    }

    const result = await teamCodeService.bulkUpdateMemberRoles(db, String(id), updates, updaterId);

    logger.info('[Teams API] Bulk member role update', {
      teamId: id,
      successCount: result.successCount,
      failedCount: result.failedCount,
    });

    // bulkUpdateMemberRoles doesn't return the team doc, so we pass the id only;
    // slug/code invalidation is best-effort via a quick lookup.
    void teamCodeService.getTeamCodeById(db, String(id)).then(({ team: t }) => {
      invalidateTeamProfileCache(String(id), t?.slug ?? undefined, t?.teamCode ?? undefined);
    });

    sendSuccess(res, result);
  })
);

/**
 * Get team schedule events from Schedule collection.
 * Supports filtering by status and pagination.
 * GET /api/v1/teams/:teamId/events
 */
router.get(
  '/:teamId/events',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { teamId } = req.params;
    const limit = Math.min(100, parseInt(String(req.query['limit'] ?? '50'), 10));
    const status = req.query['status'] as string | undefined;

    validateRequired(teamId, 'Team ID');

    const cache = getCacheService();
    const cacheKey = `team:events:${teamId}${status ? `:${status}` : ''}:${limit}`;
    const hit = await cache.get<unknown[]>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      sendSuccess(res, { events: hit, total: hit.length }, { cached: true });
      return;
    }

    const db = req.firebase!.db;
    let query = db
      .collection('Events')
      .where('teamId', '==', teamId)
      .where('ownerType', '==', 'team') as FirebaseFirestore.Query;

    if (status) {
      query = query.where('status', '==', status);
    }

    const snap = await query.get();

    const events = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const aDate = String(a['date'] ?? '');
        const bDate = String(b['date'] ?? '');
        return aDate.localeCompare(bDate);
      })
      .slice(0, limit);

    await cache.set(cacheKey, events, { ttl: CACHE_TTL.FEED });

    logger.info('[Teams API] Team events fetched', { teamId, count: events.length, status });
    sendSuccess(res, { events, total: events.length });
  })
);

/**
 * Increment team page view
 * POST /api/v1/teams/:id/view
 */
router.post(
  '/:id/view',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const db = req.firebase!.db;

    validateRequired(id, 'Team ID');

    await teamCodeService.incrementTeamPageView(db, String(id));

    sendSuccess(res, { message: 'View recorded' });
  })
);

/**
 * Track team page view (client-side analytics)
 * POST /api/v1/teams/:id/page-view
 *
 * Body: { viewerId?: string }
 * Auth: Optional — anonymous views are counted too.
 */
router.post(
  '/:id/page-view',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const db = req.firebase!.db;

    validateRequired(id, 'Team ID');

    await teamCodeService.incrementTeamPageView(db, String(id));

    const viewerId: string | undefined = req.body?.viewerId;
    logger.debug('[Teams API] Page view recorded', { teamId: id, viewerId });

    sendSuccess(res, { message: 'Page view recorded' });
  })
);

// ─── Intel Report Routes ────────────────────────────────────────────────────

/**
 * GET /:id/intel
 * Fetch the stored team Intel report (public).
 */
router.get(
  '/:id/intel',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const db = req.firebase!.db;

    const { IntelGenerationService } = await import('../modules/agent/services/intel.service.js');
    const intelService = new IntelGenerationService();
    const report = await intelService.getTeamIntel(id, db);

    sendSuccess(res, report);
  })
);

/**
 * POST /:id/intel/generate
 * Trigger on-demand team Intel generation (authenticated, admin/coach only).
 */
router.post(
  '/:id/intel/generate',
  appGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const userId = req.user!.uid;
    const db = req.firebase!.db;

    const teamAdapter = createTeamAdapter(db);
    let teamWithMembers: Awaited<ReturnType<typeof teamAdapter.getTeamWithMembers>>;

    try {
      teamWithMembers = await teamAdapter.getTeamWithMembers(id);
    } catch {
      throw validationError([{ field: 'id', message: 'Team not found', rule: 'exists' }]);
    }

    const legacyMembers =
      (
        teamWithMembers as unknown as {
          members?: Array<{
            id?: string;
            uid?: string;
            userId?: string;
            role?: string;
          }>;
        }
      ).members ?? [];
    const roster = teamWithMembers.roster ?? [];

    if (!canGenerateTeamIntelForUser({ userId, legacyMembers, roster })) {
      throw forbiddenError('permission');
    }

    const { IntelGenerationService } = await import('../modules/agent/services/intel.service.js');
    const intelService = new IntelGenerationService();
    const report = await intelService.generateTeamIntel(id, db);

    logger.info('[Teams] Intel generated', { teamId: id, userId });
    res.json({
      success: true,
      status: 'ready',
      message: 'Team Intel report generated successfully',
      reportId: (report as Record<string, unknown>)['id'],
      data: report,
    });
  })
);

/**
 * PATCH /:id/intel/section/:sectionId
 * Regenerate a single section of the team Intel report in-place.
 * Requires authentication and admin/coach role.
 */
const VALID_TEAM_SECTIONS = new Set(['agent_overview', 'team', 'stats', 'recruiting', 'schedule']);

router.patch(
  '/:id/intel/section/:sectionId',
  appGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const { id, sectionId } = req.params as { id: string; sectionId: string };
    const userId = req.user!.uid;
    const db = req.firebase!.db;

    if (!VALID_TEAM_SECTIONS.has(sectionId)) {
      throw validationError([
        {
          field: 'sectionId',
          message: `Invalid section id "${sectionId}". Valid sections: ${[...VALID_TEAM_SECTIONS].join(', ')}`,
          rule: 'enum',
        },
      ]);
    }

    const teamAdapter = createTeamAdapter(db);
    let teamWithMembers: Awaited<ReturnType<typeof teamAdapter.getTeamWithMembers>>;

    try {
      teamWithMembers = await teamAdapter.getTeamWithMembers(id);
    } catch {
      throw validationError([{ field: 'id', message: 'Team not found', rule: 'exists' }]);
    }

    const legacyMembers =
      (
        teamWithMembers as unknown as {
          members?: Array<{ id?: string; uid?: string; userId?: string; role?: string }>;
        }
      ).members ?? [];
    const roster = teamWithMembers.roster ?? [];

    if (!canGenerateTeamIntelForUser({ userId, legacyMembers, roster })) {
      throw forbiddenError('permission');
    }

    const { IntelGenerationService } = await import('../modules/agent/services/intel.service.js');
    const intelService = new IntelGenerationService();

    // Cast is safe — we validated sectionId against the valid set above
    const report = await intelService.updateTeamIntelSection(
      id,
      sectionId as Parameters<typeof intelService.updateTeamIntelSection>[1],
      db
    );

    logger.info('[Teams] Intel section updated', { teamId: id, userId, sectionId });
    res.json({
      success: true,
      status: 'ready',
      message: `Section "${sectionId}" updated successfully`,
      sectionId,
      data: report,
    });
  })
);

/**
 * Get polymorphic team timeline
 * GET /api/v1/teams/:teamCode/timeline
 *
 * Returns FeedItem[] sorted newest-first, assembled from:
 *   Posts (teamId), Schedule (ownerType:team), TeamStats, News,
 *   and Recruiting fan-out via RosterEntries.
 *
 * Query params:
 *   - filter: 'all' | 'media' | 'stats' | 'games' | 'schedule' | 'recruiting' | 'news'
 *   - limit: number (default 20, max 50)
 *   - cursor: base64-encoded ISO timestamp for pagination
 *   - sportId: optional sport filter
 */
router.get(
  '/:teamCode/timeline',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { teamCode } = req.params;
    const db = req.firebase!.db;

    validateRequired(teamCode, 'teamCode');

    const rawLimit = parseInt(String(req.query['limit'] ?? '20'), 10);
    const limit = Math.min(isNaN(rawLimit) ? 20 : rawLimit, 50);
    const filter = String(req.query['filter'] ?? 'all') as
      | 'all'
      | 'media'
      | 'stats'
      | 'games'
      | 'schedule'
      | 'recruiting'
      | 'news';
    const cursor = req.query['cursor'] ? String(req.query['cursor']) : undefined;
    const sportId = req.query['sportId'] ? String(req.query['sportId']) : undefined;

    const validFilters = new Set(['all', 'media', 'stats', 'games', 'schedule', 'recruiting', 'news']);
    const resolvedFilter = validFilters.has(filter) ? filter : 'all';

    const cache = getCacheService();
    const cacheKey = `team:timeline:v1:${teamCode}:${resolvedFilter}:${sportId ?? ''}:${cursor ?? ''}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      markCacheHit(req, 'redis', cacheKey);
      sendSuccess(res, cached, { cached: true });
      return;
    }

    const timelineService = createTimelineService(db);
    const result = await timelineService.getTeamTimeline(String(teamCode), {
      limit,
      filter: resolvedFilter,
      sportId,
      cursor,
    });

    await cache.set(
      cacheKey,
      { items: result.data, nextCursor: result.nextCursor, hasMore: result.hasMore },
      { ttl: CACHE_TTL.FEED }
    );

    logger.info('[Teams API] Team timeline assembled', {
      teamCode,
      filter: resolvedFilter,
      count: result.data.length,
      hasMore: result.hasMore,
    });

    sendSuccess(res, {
      items: result.data,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    });
  })
);

export default router;
