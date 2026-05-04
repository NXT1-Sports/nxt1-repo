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
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { appGuard, optionalAuth } from '../../middleware/auth/auth.middleware.js';
import { validateBody, validateQuery } from '../../middleware/validation/validation.middleware.js';
import {
  CreateTeamDto,
  GetTeamsDto,
  TeamType,
  JoinTeamDto,
  InviteMemberDto,
} from '../../dtos/teams.dto.js';
import { asyncHandler, sendSuccess } from '@nxt1/core/errors/express';
import { forbiddenError, validationError } from '@nxt1/core/errors';
import { ROLE, RosterEntryStatus, type UserRole } from '@nxt1/core/models';
import * as teamCodeService from '../../services/team/team-code.service.js';
import { RosterEntryService } from '../../services/team/roster-entry.service.js';
import { createTeamAdapter } from '../../adapters/team.adapter.js';
import {
  mapTeamCodeToProfile,
  type MapTeamProfileOptions,
} from '../../adapters/team-profile.adapter.js';
import { logger } from '../../utils/logger.js';
import { dispatch } from '../../services/communications/notification.service.js';
import { notifyTeamJoined } from '../../services/communications/team-join-notifications.js';
import { getUserById } from '../../services/profile/users.service.js';
import { resolveRosterPositions } from '../../services/team/roster-sport-profile.service.js';
import { NOTIFICATION_TYPES } from '@nxt1/core';
import {
  performanceMiddleware,
  testPerformance,
} from '../../middleware/performance/performance.middleware.js';
import { isTeamIntelEnabled } from '../../config/feature-flags.js';
import {
  getCacheService,
  CACHE_TTL,
  invalidateTeamProfileCache,
} from '../../services/core/cache.service.js';
import { markCacheHit } from '../../middleware/cache/cache-status.middleware.js';
import type { TeamProfilePageData } from '@nxt1/core/team-profile';
import type { Organization } from '@nxt1/core/models';
import { SyncDiffService } from '../../modules/agent/sync/index.js';
import {
  buildDistilledProfileFromTeamRecord,
  buildPreviousStateFromTeamRecord,
} from '../../modules/agent/sync/manual-sync-state.helpers.js';
import { onDailySyncComplete } from '../../modules/agent/triggers/trigger.listeners.js';
import { createTimelineService } from '../../services/profile/timeline.service.js';
import {
  canGenerateTeamIntelForUser,
  canManageTeamMembershipForRole,
} from '../../services/team/team-intel-permissions.js';

export {
  canGenerateTeamIntelForUser,
  canManageTeamMembershipForRole,
} from '../../services/team/team-intel-permissions.js';

const router: ExpressRouter = Router();

// Define interface for requests with cache helpers
interface ValidatedRequest extends Request {
  markCacheHit?: (source: string, key: string) => void;
  markCacheMiss?: () => void;
}

type RosterSportLookupItem = {
  sport?: string;
  positions?: string[];
  order?: number;
};

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

function parseRosterEditorRole(role: string | undefined): UserRole | undefined {
  if (role === undefined) return undefined;

  const normalized = role.trim().toLowerCase();

  switch (normalized) {
    case 'athlete':
      return 'athlete';
    case 'coach':
    case 'head-coach':
    case 'assistant-coach':
    case 'staff':
      return 'coach';
    case 'director':
    case 'admin':
    case 'administrative':
    case 'owner':
    case 'program-director':
      return 'director';
    default:
      throw validationError([
        {
          field: 'role',
          message: 'Role must be athlete, coach, or director',
          rule: 'enum',
        },
      ]);
  }
}

function parseRosterEditorStatus(status: string | undefined): RosterEntryStatus | undefined {
  if (status === undefined) return undefined;

  const normalized = status.trim().toLowerCase();
  if (Object.values(RosterEntryStatus).includes(normalized as RosterEntryStatus)) {
    return normalized as RosterEntryStatus;
  }

  throw validationError([
    {
      field: 'status',
      message: `Status must be one of: ${Object.values(RosterEntryStatus).join(', ')}`,
      rule: 'enum',
    },
  ]);
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
      organizationLogoUrl,
      logoUrl,
      galleryImages,
      connectedSources,
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

    const normalizedConnectedSources = Array.isArray(connectedSources)
      ? connectedSources
          .filter(
            (
              source
            ): source is {
              platform: string;
              profileUrl: string;
              faviconUrl?: string;
              lastSyncedAt?: string;
              syncStatus?: 'pending' | 'synced' | 'failed';
              lastError?: string;
              scopeType?: 'global' | 'sport' | 'team';
              scopeId?: string;
              displayOrder?: number;
            } => {
              if (!source || typeof source !== 'object') return false;
              const sourceObj = source as Record<string, unknown>;
              return (
                typeof sourceObj['platform'] === 'string' &&
                sourceObj['platform'].trim().length > 0 &&
                typeof sourceObj['profileUrl'] === 'string' &&
                sourceObj['profileUrl'].trim().length > 0
              );
            }
          )
          .map((source) => ({
            platform: source.platform.trim(),
            profileUrl: source.profileUrl.trim(),
            ...(typeof source.faviconUrl === 'string' && source.faviconUrl.trim().length > 0
              ? { faviconUrl: source.faviconUrl.trim() }
              : {}),
            ...(typeof source.lastSyncedAt === 'string' && source.lastSyncedAt.trim().length > 0
              ? { lastSyncedAt: source.lastSyncedAt.trim() }
              : {}),
            ...(source.syncStatus ? { syncStatus: source.syncStatus } : {}),
            ...(typeof source.lastError === 'string' && source.lastError.trim().length > 0
              ? { lastError: source.lastError.trim() }
              : {}),
            ...(source.scopeType ? { scopeType: source.scopeType } : {}),
            ...(typeof source.scopeId === 'string' && source.scopeId.trim().length > 0
              ? { scopeId: source.scopeId.trim() }
              : {}),
            ...(typeof source.displayOrder === 'number' && Number.isFinite(source.displayOrder)
              ? { displayOrder: Math.max(0, Math.trunc(source.displayOrder)) }
              : {}),
          }))
      : undefined;

    const team = await teamCodeService.updateTeamCode(db, String(id), userId, {
      teamName: teamName?.trim(),
      sport: sportName?.trim(),
      athleteMember: athleteMember !== undefined ? parseInt(String(athleteMember), 10) : undefined,
      panelMember: panelMember !== undefined ? parseInt(String(panelMember), 10) : undefined,
      isActive,
      unicode: unicode?.trim(),
      division: division?.trim(),
      conference: conference?.trim(),
      email: typeof email === 'string' ? email.trim() : undefined,
      phone: typeof phone === 'string' ? phone.trim() : undefined,
      website: typeof website === 'string' ? website.trim() : undefined,
      address: typeof address === 'string' ? address.trim() : undefined,
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
      accentColor: typeof accentColor === 'string' ? accentColor.trim() : undefined,
    });

    if (normalizedConnectedSources !== undefined) {
      await db.collection('Teams').doc(String(id)).update({
        connectedSources: normalizedConnectedSources,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const normalizedOrganizationLogoUrl =
      typeof organizationLogoUrl === 'string' ? organizationLogoUrl.trim() : undefined;
    const resolvedOrganizationId =
      typeof (team as { organizationId?: unknown }).organizationId === 'string'
        ? ((team as { organizationId?: string }).organizationId ?? '').trim()
        : '';

    const normalizedOrgLevel = typeof teamType === 'string' ? teamType.trim() : undefined;
    const normalizedOrgMascot = typeof mascot === 'string' ? mascot.trim() : undefined;
    const normalizedOrgCity = typeof city === 'string' ? city.trim() : undefined;
    const normalizedOrgState = typeof state === 'string' ? state.trim() : undefined;
    const normalizedPrimaryColor =
      typeof primaryColor === 'string' ? primaryColor.trim() : undefined;
    const normalizedSecondaryColor =
      typeof secondaryColor === 'string' ? secondaryColor.trim() : undefined;

    const validOrganizationTypes = new Set<Organization['type']>([
      'high-school',
      'middle-school',
      'club',
      'college',
      'juco',
      'organization',
    ]);

    if (resolvedOrganizationId.length > 0) {
      try {
        const organizationUpdates: Record<string, unknown> = {
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (normalizedOrganizationLogoUrl !== undefined) {
          organizationUpdates['logoUrl'] = normalizedOrganizationLogoUrl || null;
        }

        if (normalizedOrgLevel !== undefined) {
          organizationUpdates['level'] = normalizedOrgLevel || null;

          if (validOrganizationTypes.has(normalizedOrgLevel as Organization['type'])) {
            organizationUpdates['type'] = normalizedOrgLevel;
          }
        }

        if (normalizedOrgMascot !== undefined) {
          organizationUpdates['mascot'] = normalizedOrgMascot || null;
        }

        if (normalizedPrimaryColor !== undefined) {
          organizationUpdates['primaryColor'] = normalizedPrimaryColor || null;
        }

        if (normalizedSecondaryColor !== undefined) {
          organizationUpdates['secondaryColor'] = normalizedSecondaryColor || null;
        }

        if (normalizedOrgCity !== undefined) {
          organizationUpdates['location.city'] = normalizedOrgCity;
        }

        if (normalizedOrgState !== undefined) {
          organizationUpdates['location.state'] = normalizedOrgState;
        }

        await db
          .collection('Organizations')
          .doc(resolvedOrganizationId)
          .update(organizationUpdates);

        logger.info('[Teams API] Organization display fields updated from manage-team', {
          teamId: id,
          organizationId: resolvedOrganizationId,
          userId,
          updatedFields: Object.keys(organizationUpdates).filter((field) => field !== 'updatedAt'),
        });
      } catch (err) {
        logger.warn('[Teams API] Failed to update organization display fields from manage-team', {
          teamId: id,
          organizationId: resolvedOrganizationId,
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

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

    void dispatch(db, {
      userId,
      type: NOTIFICATION_TYPES.TEAM_JOIN_REQUEST,
      title: `You joined ${team.teamName}`,
      body: `Welcome to ${team.teamName}!`,
      data: team.id ? { teamId: team.id } : undefined,
      source: { teamName: team.teamName },
    }).catch((err) =>
      logger.error('[Teams] Failed to dispatch team_join_request notification', { error: err })
    );

    // Fire-and-forget: notify ALL org admins (not just team.createdBy) that a
    // new member joined. Direct-join via /teams/:teamCode/join is always an
    // ACTIVE join (no approval workflow on this path), so pending=false.
    if (team.id) {
      void (async () => {
        const joiner = await getUserById(userId, db);
        const joinerName =
          (joiner
            ? `${(joiner['firstName'] as string | undefined) ?? ''} ${(joiner['lastName'] as string | undefined) ?? ''}`.trim()
            : '') || 'Someone';
        const joinerAvatarUrl = (joiner?.['profileImgs'] as string[] | undefined)?.[0] ?? null;

        await notifyTeamJoined(db, {
          teamId: team.id!,
          teamName: team.teamName ?? 'your team',
          organizationId: team.organizationId,
          joinerUid: userId,
          joinerName,
          joinerAvatarUrl,
          pending: false,
        });
      })().catch((err) =>
        logger.error('[Teams] Failed to dispatch org-level team join notification', {
          error: err,
        })
      );
    }

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

    void (async () => {
      const teamName = existingTeam?.teamName ?? 'the team';
      const normalizedTargetUserId = String(targetUserId);
      const isSelfLeave = removerId === normalizedTargetUserId;

      await dispatch(db, {
        userId: normalizedTargetUserId,
        type: NOTIFICATION_TYPES.TEAM_MEMBER_LEFT,
        title: isSelfLeave ? `You left ${teamName}` : `You were removed from ${teamName}`,
        body: isSelfLeave
          ? `Your membership in ${teamName} has been removed.`
          : `Your membership in ${teamName} was updated by a team admin.`,
        deepLink: '/activity',
        data: { teamId: String(id) },
        source: { teamName },
      });

      const teamDoc = await db.collection('Teams').doc(String(id)).get();
      const ownerId = teamDoc.data()?.['createdBy'] as string | undefined;
      if (isSelfLeave || !ownerId || ownerId === removerId || ownerId === normalizedTargetUserId) {
        return;
      }

      await dispatch(db, {
        userId: ownerId,
        type: NOTIFICATION_TYPES.TEAM_MEMBER_LEFT,
        title: 'A member left your team',
        body: `${teamName} has one fewer active member.`,
        data: { teamId: String(id), memberUserId: normalizedTargetUserId },
        source: { teamName },
      });
    })().catch((err) =>
      logger.error('[Teams] Failed to dispatch team_member_left notification', {
        error: err,
        teamId: id,
        targetUserId,
      })
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
    if (!isTeamIntelEnabled()) {
      sendSuccess(res, null);
      return;
    }

    const { id } = req.params as { id: string };
    const db = req.firebase!.db;

    const { IntelGenerationService } =
      await import('../../modules/agent/services/intel.service.js');
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
    if (!isTeamIntelEnabled()) {
      throw validationError([
        {
          field: 'feature',
          message: 'Team Intel is currently disabled',
          rule: 'feature_flag',
        },
      ]);
    }

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

    const { IntelGenerationService } =
      await import('../../modules/agent/services/intel.service.js');
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
    if (!isTeamIntelEnabled()) {
      throw validationError([
        {
          field: 'feature',
          message: 'Team Intel is currently disabled',
          rule: 'feature_flag',
        },
      ]);
    }

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

    const { IntelGenerationService } =
      await import('../../modules/agent/services/intel.service.js');
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

    const validFilters = new Set([
      'all',
      'media',
      'stats',
      'games',
      'schedule',
      'recruiting',
      'news',
    ]);
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

// ============================================
// TEAM POST MANAGEMENT ROUTES
// ============================================

/**
 * Toggle pin state on a team post.
 * PATCH /api/v1/teams/:teamId/posts/:postId/pin
 * Requires team admin or coach role.
 */
router.patch(
  '/:teamId/posts/:postId/pin',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { teamId, postId } = req.params as { teamId: string; postId: string };
    const requesterId = req.user!.uid;

    const db = req.firebase!.db;

    await assertMembershipEditorPermission(db, teamId, requesterId);

    const requestedPinState = (req.body as Record<string, unknown> | undefined)?.['isPinned'];
    if (typeof requestedPinState !== 'boolean') {
      res.status(400).json({ success: false, error: 'isPinned must be a boolean' });
      return;
    }

    const postRef = db.collection('Posts').doc(postId);
    const postDoc = await postRef.get();

    if (!postDoc.exists) {
      res.status(404).json({ success: false, error: 'Post not found' });
      return;
    }

    const postData = postDoc.data() as Record<string, unknown>;
    if (postData['teamId'] !== teamId) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    await postRef.update({ isPinned: requestedPinState, updatedAt: FieldValue.serverTimestamp() });
    await invalidateTeamProfileCache(teamId);

    logger.info('[Teams API] Post pin state updated', {
      teamId,
      postId,
      isPinned: requestedPinState,
      requesterId,
    });
    sendSuccess(res, { postId, isPinned: requestedPinState });
  })
);

/**
 * Delete a team post (admin/coach only).
 * DELETE /api/v1/teams/:teamId/posts/:postId
 * Requires team admin or coach role.
 */
router.delete(
  '/:teamId/posts/:postId',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { teamId, postId } = req.params as { teamId: string; postId: string };
    const requesterId = req.user!.uid;

    const db = req.firebase!.db;

    await assertMembershipEditorPermission(db, teamId, requesterId);

    const postRef = db.collection('Posts').doc(postId);
    const postDoc = await postRef.get();

    if (!postDoc.exists) {
      res.status(404).json({ success: false, error: 'Post not found' });
      return;
    }

    const postData = postDoc.data() as Record<string, unknown>;
    if (postData['teamId'] !== teamId) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    await postRef.delete();

    // Best-effort: delete the Cloudflare Stream asset if this was a video post
    const cloudflareVideoId =
      typeof postData['cloudflareVideoId'] === 'string' ? postData['cloudflareVideoId'] : null;

    if (cloudflareVideoId) {
      const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
      const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
      if (accountId && apiToken) {
        try {
          await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${cloudflareVideoId}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
              },
            }
          );
        } catch (cfErr) {
          logger.warn('[Teams API] Cloudflare Stream asset deletion failed', {
            teamId,
            postId,
            cloudflareVideoId,
            error: cfErr instanceof Error ? cfErr.message : String(cfErr),
          });
        }
      }
    }

    await invalidateTeamProfileCache(teamId);

    logger.info('[Teams API] Post deleted', { teamId, postId, requesterId });
    sendSuccess(res, { postId });
  })
);

// ============================================
// MEMBERSHIP EDITOR ROUTES
// ============================================

/**
 * Permission helper: checks that the requesting user is an active admin or coach
 * on the team via RosterEntries (V2-first) with fallback to legacy team.members (V1).
 */
async function assertMembershipEditorPermission(
  db: FirebaseFirestore.Firestore,
  teamId: string,
  requesterId: string
): Promise<void> {
  const rosterService = new RosterEntryService(db);
  const entry = await rosterService.getActiveOrPendingRosterEntry(requesterId, teamId);
  if (canManageTeamMembershipForRole(entry?.role)) return;

  // V1 fallback: check team.members[]
  const { team } = await teamCodeService.getTeamCodeById(db, teamId, false);
  const legacyMember = team.members?.find(
    (m: { id: string; role: string }) => m.id === requesterId
  );
  if (canManageTeamMembershipForRole(legacyMember?.role)) return;

  throw forbiddenError('permission');
}

/**
 * Map a RosterEntry document to the normalized MembershipEditorItem shape
 * consumed by the shared UI editor component.
 */
function mapRosterEntryToEditorItem(
  entryId: string,
  entry: Record<string, unknown>
): Record<string, unknown> {
  const role = typeof entry['role'] === 'string' ? entry['role'] : '';
  const isAthlete = role.toLowerCase() === 'athlete';
  const status = typeof entry['status'] === 'string' ? entry['status'] : 'active';
  const firstName = typeof entry['firstName'] === 'string' ? entry['firstName'] : '';
  const lastName = typeof entry['lastName'] === 'string' ? entry['lastName'] : '';

  return {
    entryId,
    userId: typeof entry['userId'] === 'string' ? entry['userId'] : undefined,
    sourceKind: 'account-backed',
    membershipKind: isAthlete ? 'roster' : 'staff',
    firstName,
    lastName,
    displayName:
      typeof entry['displayName'] === 'string'
        ? entry['displayName']
        : [firstName, lastName].filter(Boolean).join(' '),
    profileImgs: Array.isArray(entry['profileImgs']) ? entry['profileImgs'] : [],
    unicode: typeof entry['unicode'] === 'string' ? entry['unicode'] : undefined,
    role,
    title: typeof entry['title'] === 'string' ? entry['title'] : undefined,
    status,
    isPending: status === 'pending',
    jerseyNumber: isAthlete ? entry['jerseyNumber'] : undefined,
    positions: isAthlete && Array.isArray(entry['positions']) ? entry['positions'] : undefined,
    sport: typeof entry['sport'] === 'string' ? entry['sport'] : undefined,
    classOf: isAthlete && typeof entry['classOf'] === 'number' ? entry['classOf'] : undefined,
    email: typeof entry['email'] === 'string' ? entry['email'] : undefined,
    phone: typeof entry['phone'] === 'string' ? entry['phone'] : undefined,
    joinedAt: entry['joinedAt'] ? String(entry['joinedAt']) : undefined,
    approvedAt: entry['approvedAt'] ? String(entry['approvedAt']) : undefined,
  };
}

async function loadUserSportsLookup(
  db: Firestore,
  userIds: readonly string[]
): Promise<Map<string, RosterSportLookupItem[]>> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return new Map();
  }

  const userRefs = uniqueUserIds.map((userId) => db.collection('Users').doc(userId));
  const userDocs = await db.getAll(...userRefs);
  const lookup = new Map<string, RosterSportLookupItem[]>();

  for (const userDoc of userDocs) {
    const sports = userDoc.data()?.['sports'];
    if (Array.isArray(sports)) {
      lookup.set(userDoc.id, sports as RosterSportLookupItem[]);
    }
  }

  return lookup;
}

/**
 * List all membership editor items for a team.
 * GET /api/v1/teams/:teamId/membership
 */
router.get(
  '/:teamId/membership',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const teamId = String(req.params['teamId'] ?? '');
    const requesterId = req.user!.uid;
    const db = req.firebase!.db;

    validateRequired(teamId, 'Team ID');
    await assertMembershipEditorPermission(db, teamId, requesterId);

    const rosterService = new RosterEntryService(db);
    const entries = await rosterService.getTeamRoster({
      teamId,
      status: [RosterEntryStatus.ACTIVE, RosterEntryStatus.PENDING],
    });

    const teamDoc = await db.collection('Teams').doc(teamId).get();
    const teamSport =
      typeof teamDoc.data()?.['sport'] === 'string' ? teamDoc.data()?.['sport'] : '';
    const athleteUserIdsNeedingFallback = entries
      .map((entry) => entry as unknown as Record<string, unknown>)
      .filter((entry) => {
        const role = typeof entry['role'] === 'string' ? entry['role'].trim().toLowerCase() : '';
        return (
          role === 'athlete' &&
          typeof entry['userId'] === 'string' &&
          !Array.isArray(entry['positions'])
        );
      })
      .map((entry) => String(entry['userId'] ?? ''));
    const userSportsLookup = await loadUserSportsLookup(db, athleteUserIdsNeedingFallback);

    const members = entries.map((entry) => {
      const raw = entry as unknown as Record<string, unknown>;
      const role = typeof raw['role'] === 'string' ? raw['role'].trim().toLowerCase() : '';
      const userId = typeof raw['userId'] === 'string' ? raw['userId'] : undefined;
      if (role === 'athlete' && userId && !Array.isArray(raw['positions'])) {
        const fallbackSport =
          typeof raw['sport'] === 'string' && raw['sport'].trim() ? raw['sport'] : teamSport;
        const fallbackPositions = resolveRosterPositions(
          userSportsLookup.get(userId),
          fallbackSport
        );
        if (fallbackPositions) {
          raw['positions'] = fallbackPositions;
        }
      }
      return mapRosterEntryToEditorItem(String(raw['id'] ?? raw['entryId'] ?? ''), raw);
    });

    const rosterCount = members.filter((member) => member['membershipKind'] === 'roster').length;
    const staffCount = members.filter((member) => member['membershipKind'] === 'staff').length;
    const pendingCount = members.filter((member) => member['isPending'] === true).length;

    logger.info('[Teams API] Membership editor list', { teamId, total: members.length });
    sendSuccess(res, { teamId, members, rosterCount, staffCount, pendingCount });
  })
);

/**
 * Edit a membership entry (role, title, jersey, positions, status).
 * PATCH /api/v1/teams/:teamId/membership/:entryId
 */
router.patch(
  '/:teamId/membership/:entryId',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const teamId = String(req.params['teamId'] ?? '');
    const entryId = String(req.params['entryId'] ?? '');
    const requesterId = req.user!.uid;
    const db = req.firebase!.db;

    validateRequired(teamId, 'Team ID');
    validateRequired(entryId, 'Entry ID');
    await assertMembershipEditorPermission(db, teamId, requesterId);

    const { role, title, jerseyNumber, positions, status } = req.body as {
      role?: string;
      title?: string;
      jerseyNumber?: string | number;
      positions?: string[];
      status?: string;
    };
    const nextRole = parseRosterEditorRole(role);
    const nextStatus = parseRosterEditorStatus(status);

    const rosterService = new RosterEntryService(db);
    const updated = await rosterService.updateRosterEntry(entryId, {
      role: nextRole,
      title,
      jerseyNumber,
      positions,
      status: nextStatus,
    });

    const raw = updated as unknown as Record<string, unknown>;
    const item = mapRosterEntryToEditorItem(entryId, raw);

    logger.info('[Teams API] Membership entry updated', { teamId, entryId, requesterId });
    sendSuccess(res, item);
  })
);

/**
 * Remove a member from the team (soft delete).
 * DELETE /api/v1/teams/:teamId/membership/:entryId
 */
router.delete(
  '/:teamId/membership/:entryId',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const teamId = String(req.params['teamId'] ?? '');
    const entryId = String(req.params['entryId'] ?? '');
    const requesterId = req.user!.uid;
    const db = req.firebase!.db;

    validateRequired(teamId, 'Team ID');
    validateRequired(entryId, 'Entry ID');
    await assertMembershipEditorPermission(db, teamId, requesterId);

    const rosterService = new RosterEntryService(db);
    await rosterService.removeFromTeam(entryId);

    logger.info('[Teams API] Membership entry removed', { teamId, entryId, requesterId });
    sendSuccess(res, { message: 'Member removed successfully' });
  })
);

/**
 * Approve a pending membership entry.
 * POST /api/v1/teams/:teamId/membership/:entryId/approve
 */
router.post(
  '/:teamId/membership/:entryId/approve',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const teamId = String(req.params['teamId'] ?? '');
    const entryId = String(req.params['entryId'] ?? '');
    const requesterId = req.user!.uid;
    const db = req.firebase!.db;

    validateRequired(teamId, 'Team ID');
    validateRequired(entryId, 'Entry ID');
    await assertMembershipEditorPermission(db, teamId, requesterId);

    const rosterService = new RosterEntryService(db);
    const approved = await rosterService.approveRosterEntry({
      entryId,
      approvedBy: requesterId,
    });

    const raw = approved as unknown as Record<string, unknown>;
    const item = mapRosterEntryToEditorItem(entryId, raw);

    logger.info('[Teams API] Membership entry approved', { teamId, entryId, requesterId });
    sendSuccess(res, item);
  })
);

export default router;
