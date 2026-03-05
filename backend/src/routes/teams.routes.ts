/**
 * @fileoverview Team Management Routes (Firebase TeamCodes)
 * @module @nxt1/backend/routes/teams
 *
 * Complete team management with Firebase Firestore TeamCodes:
 * - TeamCode CRUD operations
 * - Role-based membership (Administrative, Coach, Athlete, Media)
 * - Bulk operations
 * - Redis cache integration
 * - Production/Staging Firebase support
 */

import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { appGuard } from '../middleware/auth.middleware.js';
import { validateBody, validateQuery } from '../middleware/validation.middleware.js';
import { CreateTeamDto, GetTeamsDto, TeamType } from '../dtos/common.dto.js';
import { asyncHandler, sendSuccess } from '@nxt1/core/errors/express';
import { validationError } from '@nxt1/core/errors';
import { ROLE } from '@nxt1/core/models';
import * as teamCodeService from '../services/team-code.service.js';
import {
  mapTeamCodeToProfile,
  parseSlugToUnicode,
  type MapTeamProfileOptions,
} from '../services/team-profile-mapper.service.js';
import { logger } from '../utils/logger.js';
import { performanceMiddleware, testPerformance } from '../middleware/performance.middleware.js';
import { getCacheService, CACHE_TTL } from '../services/cache.service.js';
import { markCacheHit } from '../middleware/cache-status.middleware.js';
import type { TeamProfilePageData } from '@nxt1/core/team-profile';

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
      sportName: teamData.sport.trim(),
      state: teamData.state?.trim() || '',
      city: teamData.city?.trim() || '',
      athleteMember: 0, // Default values - these would come from package
      panelMember: 0,
      packageId: 'default', // Default package
      createdBy: userId,
      teamLogoImg: teamData.logoUrl?.trim(),
      teamColor1: undefined,
      teamColor2: undefined,
      mascot: undefined,
      unicode: undefined,
      division: undefined,
      conference: undefined,
      expireAt: undefined, // No expiration by default
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
 * Get team profile by slug (for team profile pages)
 * GET /api/v1/teams/by-slug/:slug
 * Returns full TeamProfilePageData with roster, stats, etc.
 */
router.get(
  '/by-slug/:slug',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { slug } = req.params;
    const db = req.firebase!.db;
    const userId = req.user?.uid; // Optional - for admin/member checks

    validateRequired(slug, 'Slug');

    // Parse unicode from slug
    const unicode = parseSlugToUnicode(String(slug));

    if (!unicode) {
      res.status(400).json({
        success: false,
        error: 'Invalid team slug format. Expected: TeamName-Sport-Unicode',
      });
      return;
    }

    logger.debug('Fetching team by slug', { slug, unicode, userId });

    // Fetch team by unicode (with Redis cache)
    const { team: teamCode, cached } = await teamCodeService.getTeamCodeByUnicode(db, unicode);

    if (!teamCode) {
      res.status(404).json({
        success: false,
        error: 'Team not found',
      });
      return;
    }

    // Check full-profile Redis cache (separate from teamCode cache)
    const cache = getCacheService();
    const profileCacheKey = `team:profile:slug:${unicode}:${userId ?? 'public'}`;
    const cachedProfile = await cache.get<TeamProfilePageData>(profileCacheKey);
    if (cachedProfile) {
      logger.debug('[Teams API] Team profile served from cache', { slug, unicode, userId });
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

    // Store in Redis cache (3-minute TTL — balances freshness vs DB load)
    await cache.set(profileCacheKey, profileData, { ttl: CACHE_TTL.POSTS });

    logger.info('[Teams API] Team profile fetched by slug', {
      teamId: teamCode.id,
      slug,
      unicode,
      userId,
      cached,
      rosterCount: profileData.roster.length,
      staffCount: profileData.staff.length,
    });

    sendSuccess(res, profileData, { cached });
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
      state,
      city,
      athleteMember,
      panelMember,
      isActive,
      teamLogoImg,
      teamColor1,
      teamColor2,
      mascot,
      unicode,
      division,
      conference,
      expireAt,
    } = req.body;

    const userId = req.user!.uid;
    const db = req.firebase!.db;

    validateRequired(id, 'Team ID');

    const team = await teamCodeService.updateTeamCode(db, String(id), userId, {
      teamName: teamName?.trim(),
      teamType,
      sportName: sportName?.trim(),
      state: state?.trim(),
      city: city?.trim(),
      athleteMember: athleteMember !== undefined ? parseInt(athleteMember, 10) : undefined,
      panelMember: panelMember !== undefined ? parseInt(panelMember, 10) : undefined,
      isActive,
      teamLogoImg: teamLogoImg?.trim(),
      teamColor1: teamColor1?.trim(),
      teamColor2: teamColor2?.trim(),
      mascot: mascot?.trim(),
      unicode: unicode?.trim(),
      division: division?.trim(),
      conference: conference?.trim(),
      expireAt: expireAt ? new Date(expireAt) : undefined,
    });

    logger.info('[Teams API] TeamCode updated', { teamId: id, userId });

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

    await teamCodeService.removeMember(db, String(id), String(targetUserId), removerId);

    logger.info('[Teams API] Member removed', { teamId: id, targetUserId });

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
 * Get team schedule events from TeamEvents collection.
 * Supports filtering by status and pagination.
 * GET /api/v1/teams/:teamId/events
 */
router.get(
  '/:teamId/events',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { teamId } = req.params;
    const limit = Math.min(100, parseInt(String(req.query['limit'] ?? '50'), 10));
    const status = req.query['status'] as string | undefined; // upcoming | final | live | postponed | cancelled

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
      .collection('TeamEvents')
      .where('teamId', '==', teamId) as FirebaseFirestore.Query;

    if (status) {
      query = query.where('status', '==', status);
    }

    const snap = await query.get();

    // Sort in-memory by date asc (avoid composite index requirement)
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

export default router;
