/**
 * @fileoverview Profile Routes
 * @module @nxt1/backend/routes/profile
 *
 * Profile API routes matching packages/core/src/profile/profile.api.ts
 * Note: These routes are mounted under /auth/profile in auth.routes.ts
 *
 * Caching Strategy:
 * - GET by ID / by username: MEDIUM_TTL (15 min) via CACHE_TTL.PROFILES
 * - GET search: MEDIUM_TTL (15 min) via CACHE_TTL.SEARCH
 * - PUT / POST / DELETE: invalidate affected cache entries on write
 */

import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { appGuard, optionalAuth } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';
import { getCacheService, CACHE_TTL } from '../services/cache.service.js';
import { markCacheHit } from '../middleware/cache-status.middleware.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../services/users.service.js';
import { AGENT_CONTEXT_PREFIX } from '../modules/agent/memory/context-builder.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { UpdateProfileDto, UploadProfileImageDto } from '../dtos/profile.dto.js';
import { createRosterEntryService } from '../services/roster-entry.service.js';
import * as teamCodeService from '../services/team-code.service.js';
import { createOrganizationService } from '../services/organization.service.js';
import { createProfileHydrationService } from '../services/profile-hydration.service.js';

// Shared types and constants from @nxt1/core
import type { User, UserSummary, SportProfile } from '@nxt1/core';
import type { UpdateSportProfileRequest, ProfileSearchParams } from '@nxt1/core';
import { RosterEntryStatus, RosterRole } from '@nxt1/core/models';
import { PROFILE_CACHE_KEYS } from '@nxt1/core';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import { validationError, notFoundError, forbiddenError } from '@nxt1/core/errors';
import type { FeedItemResponse } from '@nxt1/core/feed';
import { createTimelineService } from '../services/timeline.service.js';
import {
  userProfileToFeedAuthor,
  type UserProfile as PostsUserProfile,
} from '../adapters/firestore-posts.adapter.js';

const router: ExpressRouter = Router();

// ============================================
// FIRESTORE COLLECTION
// ============================================

const USERS_COLLECTION = 'Users';
const PLAYER_STATS_COLLECTION = 'PlayerStats';

// ============================================
// TYPES
// ============================================

/**
 * Shape of a raw Firestore user document (plain object from Firestore).
 * Mapped to the shared User interface after retrieval.
 */
type UserFirestoreDoc = DocumentData & {
  // Identity
  email?: string;
  emailVerified?: boolean;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  username?: string;
  unicode?: string | null;
  gender?: string;
  role?: string;
  status?: string;

  // Profile
  bannerImg?: string | null;
  profileImgs?: string[];
  aboutMe?: string;

  // Physical attributes (top-level)
  height?: string;
  weight?: string;
  classOf?: number;
  academics?: Record<string, unknown>;

  // Sport
  sports?: SportProfile[];
  activeSportIndex?: number;
  primarySport?: string;

  // Location & contact
  location?: Record<string, string>;
  contact?: Record<string, string>;
  social?: Array<{
    platform: string;
    url: string;
    username?: string;
    displayOrder?: number;
    verified?: boolean;
  }>;
  state?: string;
  city?: string;

  // Role-specific data
  athlete?: Record<string, unknown>;
  coach?: Record<string, unknown>;
  director?: Record<string, unknown>;
  recruiter?: Record<string, unknown>;
  parent?: Record<string, unknown>;

  // Verification & AI
  verificationStatus?: string;
  connectedSources?: Array<{
    platform: string;
    profileUrl: string;
    faviconUrl?: string;
    lastSyncedAt?: string;
    syncStatus?: string;
    lastError?: string;
    scopeType?: string;
    scopeId?: string;
    displayOrder?: number;
    createdAt?: string;
    email?: string;
  }>;
  connectedEmails?: Array<Record<string, unknown>>;

  // Awards & team history
  awards?: Array<Record<string, unknown>>;
  teamHistory?: Array<Record<string, unknown>>;

  // Preferences & counters
  preferences?: Record<string, unknown>;
  _counters?: Record<string, unknown>;

  // Onboarding
  onboardingCompleted?: boolean;

  // Timestamps
  updatedAt?: string;
  createdAt?: string;
  lastLoginAt?: string;

  // Schema version
  _schemaVersion?: number;

  // Team code
  teamCode?: Record<string, unknown> | string | null;
  teamCodeTrial?: Record<string, unknown>;
  teamLinks?: Record<string, unknown>;
  profileCode?: string;
};

// ============================================
// CACHE HELPERS
// ============================================

/**
 * Build Redis cache key for a profile by user ID.
 */
function buildProfileByIdCacheKey(userId: string): string {
  return `${PROFILE_CACHE_KEYS.BY_ID}${userId}`;
}

/**
 * Build Redis cache key for a profile by username (case-insensitive).
 */
function buildProfileByUsernameCacheKey(username: string): string {
  return `${PROFILE_CACHE_KEYS.BY_USERNAME}${username.toLowerCase()}`;
}

/**
 * Build Redis cache key for a profile by unicode (case-insensitive).
 */
function buildProfileByUnicodeCacheKey(unicode: string): string {
  return `${PROFILE_CACHE_KEYS.BY_UNICODE}${unicode.toLowerCase()}`;
}

/**
 * Build Redis cache key for profile search results.
 * Keys are sorted for deterministic caching regardless of param order.
 */
function buildProfileSearchCacheKey(params: ProfileSearchParams): string {
  const parts = (Object.keys(params) as Array<keyof ProfileSearchParams>)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}:${params[k]}`);

  return parts.length > 0
    ? `${PROFILE_CACHE_KEYS.SEARCH}${parts.join(':')}`
    : `${PROFILE_CACHE_KEYS.SEARCH}all`;
}

/**
 * Invalidate all cached representations of a user profile.
 * Called after any write operation.
 * Exported so auth.routes.ts can invalidate on onboarding updates.
 */
export async function invalidateProfileCaches(
  userId: string,
  username?: string,
  unicode?: string | null
): Promise<void> {
  const cache = getCacheService();

  const keysToDelete: string[] = [
    buildProfileByIdCacheKey(userId),
    // Also invalidate the users service cache (getUserById) and the
    // assembled agent context so Agent X always sees fresh profile data.
    USER_CACHE_KEYS.USER_BY_ID(userId),
    `${AGENT_CONTEXT_PREFIX}${userId}`,
  ];
  if (username) {
    keysToDelete.push(buildProfileByUsernameCacheKey(username));
  }
  if (unicode) {
    keysToDelete.push(buildProfileByUnicodeCacheKey(unicode));
  }

  await Promise.all(keysToDelete.map((k) => cache.del(k)));

  // Invalidate all profile search results (pattern delete)
  await cache.del(`${PROFILE_CACHE_KEYS.SEARCH}*`);

  logger.debug('[Profile] Cache invalidated', { userId, username, unicode });
}

// ============================================
// DOCUMENT MAPPER
// ============================================

/**
 * Convert Firestore document data + doc ID into a User-shaped object.
 * Keeps the mapping in one place so all routes stay consistent.
 */
function docToUser(docId: string, data: UserFirestoreDoc): User {
  return { id: docId, ...data } as unknown as User;
}

/**
 * Convert Firestore document data + doc ID into a lightweight UserSummary.
 */
function docToUserSummary(docId: string, data: UserFirestoreDoc): UserSummary {
  const sports = Array.isArray(data['sports']) ? (data['sports'] as SportProfile[]) : undefined;
  const primarySport = sports?.find((s) => s.order === 0) ?? sports?.[0];

  // Use profileImgs array only
  const profileImgs = data['profileImgs'] as string[] | undefined;

  return {
    id: docId,
    unicode: data['unicode'] as string | null | undefined,
    firstName: data['firstName'] ?? '',
    lastName: data['lastName'] ?? '',
    displayName: data['displayName'] as string | undefined,
    profileImgs,
    role: data['role'] as UserSummary['role'],
    verificationStatus: data['verificationStatus'] as UserSummary['verificationStatus'],
    location: {
      city: (data['location']?.['city'] as string | undefined) ?? data['city'] ?? '',
      state: (data['location']?.['state'] as string | undefined) ?? data['state'] ?? '',
    },
    primarySport: primarySport?.sport ?? (data['primarySport'] as string | undefined),
    primaryPosition: primarySport?.positions?.[0],
    // classOf lives at top-level on User (moved from athlete.classOf in schema v2)
    classOf:
      (data['classOf'] as number | undefined) ??
      (data['athlete']?.['classOf'] as number | undefined),
    height: data['height'] as string | undefined,
    weight: data['weight'] as string | undefined,
  };
}

// ============================================
// PROFILE HYDRATION
// ============================================

/**
 * Create a ProfileHydrationService for the current request's Firestore instance.
 * Overlays LIVE Organization branding onto User.sports[].team data.
 */
function getHydrationService(db: Firestore) {
  const rosterEntryService = createRosterEntryService(db);
  const organizationService = createOrganizationService(db);
  return createProfileHydrationService(db, rosterEntryService, organizationService);
}

// ============================================
// ROUTES
// ============================================

/**
 * Get current authenticated user's own profile.
 * GET /api/v1/auth/profile/me
 */
router.get(
  '/me',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.uid;
    const cacheKey = buildProfileByIdCacheKey(userId);
    const cache = getCacheService();

    // --- Cache hit ---
    const cached = await cache.get<User>(cacheKey);
    if (cached) {
      logger.debug('[Profile] /me cache hit', { userId });
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: cached });
      return;
    }

    // --- Cache miss: fetch from Firestore ---
    const db = req.firebase!.db;
    const doc = await db.collection(USERS_COLLECTION).doc(userId).get();

    if (!doc.exists) {
      sendError(res, notFoundError('profile'));
      return;
    }

    const rawUser = docToUser(doc.id, doc.data() as UserFirestoreDoc);

    // Hydrate with LIVE Organization branding (replaces stale team snapshots)
    const hydrationService = getHydrationService(db);
    const user = await hydrationService.hydrateUser(rawUser);

    // For coach/director roles, connected sources live on the Team doc.
    // Merge them into the user profile so the frontend sees them.
    const isTeamRole = user.role === 'coach' || user.role === 'director';
    const activeSportData = user.sports?.[user.activeSportIndex ?? 0] ?? user.sports?.[0];
    const teamId = activeSportData?.team?.teamId;
    if (isTeamRole && teamId) {
      try {
        const teamDoc = await db.collection('Teams').doc(teamId).get();
        if (teamDoc.exists) {
          const teamData = teamDoc.data();
          if (
            Array.isArray(teamData?.['connectedSources']) &&
            teamData['connectedSources'].length > 0
          ) {
            user.connectedSources = teamData['connectedSources'];
          }
        }
      } catch (err) {
        logger.warn('[Profile] /me failed to fetch team connected sources', {
          userId,
          teamId,
          err,
        });
      }
    }

    await cache.set(cacheKey, user, { ttl: CACHE_TTL.PROFILES });
    logger.debug('[Profile] /me cache set', { userId });

    res.json({ success: true, data: user });
  })
);

/**
 * Get user profile by unicode (shareable profile code).
 * GET /api/v1/auth/profile/unicode/:unicode
 */
router.get(
  '/unicode/:unicode',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { unicode } = req.params as { unicode: string };

    if (!unicode?.trim()) {
      sendError(
        res,
        validationError([{ field: 'unicode', message: 'Unicode is required', rule: 'required' }])
      );
      return;
    }

    const cacheKey = buildProfileByUnicodeCacheKey(unicode);
    const cache = getCacheService();

    // --- Cache hit ---
    const cached = await cache.get<User>(cacheKey);
    if (cached) {
      logger.debug('[Profile] Unicode cache hit', { unicode });
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: cached });
      return;
    }

    // --- Cache miss: query Firestore ---
    const db = req.firebase!.db;
    const snapshot = await db
      .collection(USERS_COLLECTION)
      .where('unicode', '==', unicode)
      .limit(1)
      .get();

    if (snapshot.empty) {
      sendError(res, notFoundError('profile'));
      return;
    }

    const doc = snapshot.docs[0]!;
    const rawUser = docToUser(doc.id, doc.data() as UserFirestoreDoc);

    // Hydrate with LIVE Organization branding (replaces stale team snapshots)
    const hydrationService = getHydrationService(db);
    const user = await hydrationService.hydrateUser(rawUser);

    // Populate both cache keys so both lookup paths benefit
    await Promise.all([
      cache.set(cacheKey, user, { ttl: CACHE_TTL.PROFILES }),
      cache.set(buildProfileByIdCacheKey(doc.id), user, { ttl: CACHE_TTL.PROFILES }),
    ]);

    logger.debug('[Profile] Unicode cache set', { unicode, userId: doc.id });
    res.json({ success: true, data: user });
  })
);

/**
 * Get related athletes for a given profile.
 * Returns up to 12 athletes matched by sport, then ranked by state + position affinity.
 *
 * Strategy: Query Firestore for same-sport athletes (broad pool of 50),
 * then score in-memory by state (+2) and position (+1) match, return top 12.
 * This guarantees results even when an exact state+position combo has few users.
 *
 * GET /api/v1/auth/profile/related?sport=Football&state=SC&position=QB&exclude=uid123
 */
router.get(
  '/related',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const db = req.firebase!.db;
    const q = req.query as Record<string, string | undefined>;

    const sport = q['sport'];
    const state = q['state'];
    const position = q['position'];
    const excludeId = q['exclude'];

    if (!sport) {
      sendError(
        res,
        validationError([
          { field: 'sport', message: 'sport query parameter is required', rule: 'required' },
        ])
      );
      return;
    }

    // --- Cache ---
    const cacheKey = `${PROFILE_CACHE_KEYS.SEARCH}related:sport:${sport.toLowerCase()}:state:${(state ?? '').toLowerCase()}:pos:${(position ?? '').toLowerCase()}`;
    const cache = getCacheService();

    const cached = await cache.get<UserSummary[]>(cacheKey);
    if (cached) {
      logger.debug('[Profile] Related cache hit', { cacheKey });
      markCacheHit(req, 'redis', cacheKey);
      const filtered = excludeId ? cached.filter((u) => u.id !== excludeId) : cached;
      res.json({ success: true, data: filtered.slice(0, 12) });
      return;
    }

    // --- Query Firestore: broad same-sport pool ---
    const POOL_SIZE = 50;
    const snapshot = await db
      .collection(USERS_COLLECTION)
      .where('primarySport', '==', sport)
      .limit(POOL_SIZE)
      .get();

    const pool: UserSummary[] = snapshot.docs.map((doc) =>
      docToUserSummary(doc.id, doc.data() as UserFirestoreDoc)
    );

    // --- Score by state + position affinity (exclude filtering is NOT done here — applied at response time) ---
    const scored = pool
      .filter((u) => !!u.firstName && !!u.unicode)
      .map((u) => {
        let score = 0;
        if (state && u.location?.state === state) score += 2;
        if (position && u.primaryPosition?.toLowerCase() === position.toLowerCase()) score += 1;
        return { u, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 13)
      .map(({ u }) => u);

    // Cache the scored results WITHOUT exclude filtering — excludeId varies per viewer
    await cache.set(cacheKey, scored, { ttl: CACHE_TTL.SEARCH });

    logger.debug('[Profile] Related athletes computed', {
      sport,
      state,
      position,
      poolSize: pool.length,
      resultSize: scored.length,
    });

    const result = excludeId ? scored.filter((u) => u.id !== excludeId) : scored;
    res.json({ success: true, data: result.slice(0, 12) });
  })
);

/**
 * Search profiles by sport / state / classOf / position / free-text.
 * GET /api/v1/auth/profile/search
 */
router.get(
  '/search',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const db = req.firebase!.db;
    const q = req.query as Record<string, string | undefined>;

    const params: ProfileSearchParams = {
      query: q['query'],
      sport: q['sport'],
      state: q['state'],
      classOf: q['classOf'] ? parseInt(q['classOf'], 10) : undefined,
      position: q['position'],
      page: q['page'] ? Math.max(1, parseInt(q['page'], 10)) : 1,
      limit: Math.min(parseInt(q['limit'] ?? '20', 10) || 20, 50),
    };

    const cacheKey = buildProfileSearchCacheKey(params);
    const cache = getCacheService();

    // --- Cache hit ---
    const cached = await cache.get<{ data: UserSummary[]; total: number }>(cacheKey);
    if (cached) {
      const { page = 1, limit = 20 } = params;
      logger.debug('[Profile] Search cache hit', { cacheKey });
      markCacheHit(req, 'redis', cacheKey);
      res.json({
        success: true,
        data: cached.data,
        pagination: {
          page,
          limit,
          total: cached.total,
          totalPages: Math.ceil(cached.total / limit),
          hasMore: page * limit < cached.total,
        },
      });
      return;
    }

    // --- Cache miss: query Firestore ---
    const { page = 1, limit = 20 } = params;

    let firestoreQuery = db.collection(USERS_COLLECTION).limit(limit);

    if (params.sport) {
      firestoreQuery = firestoreQuery.where('primarySport', '==', params.sport);
    }
    if (params.state) {
      firestoreQuery = firestoreQuery.where('location.state', '==', params.state);
    }
    if (params.classOf) {
      firestoreQuery = firestoreQuery.where('athlete.classOf', '==', params.classOf);
    }
    if (params.position) {
      firestoreQuery = firestoreQuery.where('position', '==', params.position);
    }

    const snapshot = await firestoreQuery.get();
    const users: UserSummary[] = snapshot.docs.map((doc) =>
      docToUserSummary(doc.id, doc.data() as UserFirestoreDoc)
    );

    const result = { data: users, total: users.length };
    await cache.set(cacheKey, result, { ttl: CACHE_TTL.SEARCH });

    res.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total: users.length,
        totalPages: Math.ceil(users.length / limit) || 1,
        hasMore: page * limit < users.length,
      },
    });
  })
);

/**
 * Get user profile by username.
 * GET /api/v1/auth/profile/username/:username
 */
router.get(
  '/username/:username',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { username } = req.params as { username: string };

    if (!username?.trim()) {
      sendError(
        res,
        validationError([{ field: 'username', message: 'Username is required', rule: 'required' }])
      );
      return;
    }

    const cacheKey = buildProfileByUsernameCacheKey(username);
    const cache = getCacheService();

    // --- Cache hit ---
    const cached = await cache.get<User>(cacheKey);
    if (cached) {
      logger.debug('[Profile] Username cache hit', { username });
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: cached });
      return;
    }

    // --- Cache miss: query Firestore ---
    const db = req.firebase!.db;
    const snapshot = await db
      .collection(USERS_COLLECTION)
      .where('username', '==', username.toLowerCase())
      .limit(1)
      .get();

    if (snapshot.empty) {
      sendError(res, notFoundError('profile'));
      return;
    }

    const doc = snapshot.docs[0]!;
    const rawUser = docToUser(doc.id, doc.data() as UserFirestoreDoc);

    // Hydrate with LIVE Organization branding (replaces stale team snapshots)
    const hydrationService = getHydrationService(db);
    const user = await hydrationService.hydrateUser(rawUser);

    // Populate both cache keys so both lookup paths benefit
    await Promise.all([
      cache.set(cacheKey, user, { ttl: CACHE_TTL.PROFILES }),
      cache.set(buildProfileByIdCacheKey(doc.id), user, { ttl: CACHE_TTL.PROFILES }),
    ]);

    logger.debug('[Profile] Username cache set', { username, userId: doc.id });
    res.json({ success: true, data: user });
  })
);

/**
 * Get polymorphic timeline feed for a user profile.
 * Assembles items from Posts, Events, and PlayerStats at read time.
 * Optionally filter by sportId: GET /api/v1/auth/profile/:userId/timeline?sportId=football
 * GET /api/v1/auth/profile/:userId/timeline
 */
router.get(
  '/:userId/timeline',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const limit = Math.min(50, parseInt(String(req.query['limit'] ?? '20'), 10));
    const sportId = req.query['sportId'] ? String(req.query['sportId']) : null;
    const cursor = req.query['cursor'] ? String(req.query['cursor']) : undefined;

    const cache = getCacheService();
    const cacheKey = `profile:sub:timeline:v2:${userId}${sportId ? `:${sportId}` : ''}:${limit}${cursor ? `:${cursor}` : ''}`;

    // Only cache first page (no cursor)
    if (!cursor) {
      const hit = await cache.get<FeedItemResponse>(cacheKey);
      if (hit) {
        markCacheHit(req, 'redis', cacheKey);
        res.json(hit);
        return;
      }
    }

    const db = req.firebase!.db;

    // Fetch user profile for author enrichment
    const userDoc = await db.collection(USERS_COLLECTION).doc(userId).get();
    if (!userDoc.exists) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    const userData = userDoc.data()!;
    const authorProfile: PostsUserProfile = {
      uid: userId,
      displayName: (userData['displayName'] as string) || 'Unknown User',
      firstName: userData['firstName'] as string | undefined,
      lastName: userData['lastName'] as string | undefined,
      photoURL: userData['photoURL'] as string | undefined,
      role: userData['role'] as string | undefined,
      sport: userData['sport'] as string | undefined,
      position: userData['position'] as string | undefined,
      schoolName: userData['schoolName'] as string | undefined,
      schoolLogoUrl: userData['schoolLogoUrl'] as string | undefined,
      isVerified: userData['isVerified'] as boolean | undefined,
      verificationStatus: userData['verificationStatus'] as string | undefined,
      profileCode: userData['profileCode'] as string | undefined,
      classYear: userData['classYear'] as string | undefined,
    };
    const author = userProfileToFeedAuthor(authorProfile);

    // Read-Time Assembly: concurrent fetch from Posts, Events, PlayerStats
    const timelineService = createTimelineService(db);
    const result = await timelineService.getProfileTimeline(userId, author, {
      limit,
      sportId: sportId ?? undefined,
      viewerUserId: req.user?.uid,
      cursor,
    });

    // Cache first page only
    if (!cursor) {
      await cache.set(cacheKey, result, { ttl: CACHE_TTL.FEED });
    }

    res.json(result);
  })
);

/**
 * Get VerifiedStat entries from the top-level PlayerStats collection.
 * GET /api/v1/auth/profile/:userId/sports/:sportId/stats
 */
router.get(
  '/:userId/sports/:sportId/stats',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, sportId } = req.params as { userId: string; sportId: string };
    const limit = Math.min(100, parseInt(String(req.query['limit'] ?? '50'), 10));

    const cache = getCacheService();
    const cacheKey = `profile:sub:stats:${userId}:${sportId}`;
    const hit = await cache.get<unknown[]>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: hit });
      return;
    }

    const db = req.firebase!.db;
    const snap = await db
      .collection(PLAYER_STATS_COLLECTION)
      .where('userId', '==', userId)
      .where('sportId', '==', sportId.toLowerCase())
      .get();

    const stats = snap.docs
      .flatMap((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const season = data['season'] as string | undefined;
        const source = data['source'] as string | undefined;
        const verified = data['verified'] as boolean | undefined;
        const entries = Array.isArray(data['stats']) ? data['stats'] : [];

        return entries.map((entry, index) => {
          const stat = entry as Record<string, unknown>;
          return {
            id: (stat['id'] as string | undefined) ?? `${doc.id}_${index}`,
            ...stat,
            ...(season ? { season } : {}),
            ...(source ? { source } : {}),
            ...(verified !== undefined && stat['verified'] === undefined ? { verified } : {}),
          };
        });
      })
      .sort((a, b) => String(b['season'] ?? '').localeCompare(String(a['season'] ?? '')))
      .slice(0, limit);

    await cache.set(cacheKey, stats, { ttl: CACHE_TTL.STATS });
    res.json({ success: true, data: stats });
  })
);

/**
 * Get game logs (ProfileSeasonGameLog) from the PlayerStats collection.
 * GET /api/v1/auth/profile/:userId/sports/:sportId/game-logs
 */
router.get(
  '/:userId/sports/:sportId/game-logs',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, sportId } = req.params as { userId: string; sportId: string };

    const cache = getCacheService();
    const cacheKey = `profile:sub:gamelogs:${userId}:${sportId}`;
    const hit = await cache.get<unknown[]>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: hit });
      return;
    }

    const db = req.firebase!.db;
    const snap = await db
      .collection(PLAYER_STATS_COLLECTION)
      .where('userId', '==', userId)
      .where('sportId', '==', sportId.toLowerCase())
      .get();

    const gameLogs = snap.docs
      .flatMap((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return Array.isArray(data['gameLogs']) ? data['gameLogs'] : [];
      })
      .sort((a, b) => {
        const sa = String((a as Record<string, unknown>)['season'] ?? '');
        const sb = String((b as Record<string, unknown>)['season'] ?? '');
        return sb.localeCompare(sa);
      });

    await cache.set(cacheKey, gameLogs, { ttl: CACHE_TTL.STATS });
    res.json({ success: true, data: gameLogs });
  })
);

/**
 * Get VerifiedMetric entries from the sport metrics sub-collection.
 * GET /api/v1/auth/profile/:userId/sports/:sportId/metrics
 */
router.get(
  '/:userId/sports/:sportId/metrics',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, sportId } = req.params as { userId: string; sportId: string };
    const limit = Math.min(100, parseInt(String(req.query['limit'] ?? '50'), 10));

    const cache = getCacheService();
    const cacheKey = `profile:sub:metrics:${userId}:${sportId}`;
    const hit = await cache.get<unknown[]>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: hit });
      return;
    }

    const db = req.firebase!.db;
    const snap = await db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection('sports')
      .doc(sportId)
      .collection('metrics')
      .orderBy('dateRecorded', 'desc')
      .limit(limit)
      .get();

    const metrics = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    await cache.set(cacheKey, metrics, { ttl: CACHE_TTL.STATS });
    res.json({ success: true, data: metrics });
  })
);

/**
 * Get news articles from top-level News collection (filtered by userId).
 * Optionally filter by sportId: GET /api/v1/auth/profile/:userId/news?sportId=football
 * GET /api/v1/auth/profile/:userId/news
 */
router.get(
  '/:userId/news',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const limit = Math.min(50, parseInt(String(req.query['limit'] ?? '20'), 10));
    const sportId = req.query['sportId'] ? String(req.query['sportId']) : null;

    const cache = getCacheService();
    const cacheKey = `profile:sub:news:${userId}${sportId ? `:${sportId}` : ''}:${limit}`;
    const hit = await cache.get<unknown[]>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: hit });
      return;
    }

    const db = req.firebase!.db;
    let query = db.collection('News').where('userId', '==', userId) as FirebaseFirestore.Query;
    if (sportId) query = query.where('sportId', '==', sportId);
    query = query.orderBy('publishedAt', 'desc').limit(limit);

    const snap = await query.get();
    const articles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    await cache.set(cacheKey, articles, { ttl: CACHE_TTL.FEED });
    res.json({ success: true, data: articles });
  })
);

/**
 * Get rankings from top-level Rankings collection (filtered by userId).
 * Optionally filter by sportId: GET /api/v1/auth/profile/:userId/rankings?sportId=football
 * GET /api/v1/auth/profile/:userId/rankings
 */
router.get(
  '/:userId/rankings',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const limit = Math.min(50, parseInt(String(req.query['limit'] ?? '20'), 10));
    const sportId = req.query['sportId'] ? String(req.query['sportId']) : null;

    const cache = getCacheService();
    const cacheKey = `profile:sub:rankings:${userId}${sportId ? `:${sportId}` : ''}`;
    const hit = await cache.get<unknown[]>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: hit });
      return;
    }

    const db = req.firebase!.db;
    let query = db.collection('Rankings').where('userId', '==', userId) as FirebaseFirestore.Query;
    if (sportId) query = query.where('sportId', '==', sportId);
    query = query.limit(limit);

    const snap = await query.get();
    // Sort by nationalRank ascending (nulls last) client-side to avoid composite index requirement
    const rankings = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const aRank = (a['nationalRank'] as number | null) ?? Infinity;
        const bRank = (b['nationalRank'] as number | null) ?? Infinity;
        return aRank - bRank;
      });
    await cache.set(cacheKey, rankings, { ttl: CACHE_TTL.RANKINGS });
    res.json({ success: true, data: rankings });
  })
);

/**
 * Get scout reports from top-level ScoutReports collection (filtered by userId).
 * Optionally filter by sportId: GET /api/v1/auth/profile/:userId/scout-reports?sportId=football
 * GET /api/v1/auth/profile/:userId/scout-reports
 */
router.get(
  '/:userId/scout-reports',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const limit = Math.min(50, parseInt(String(req.query['limit'] ?? '20'), 10));
    const sportId = req.query['sportId'] ? String(req.query['sportId']) : null;

    const cache = getCacheService();
    const cacheKey = `profile:sub:scout-reports:${userId}${sportId ? `:${sportId}` : ''}`;
    const hit = await cache.get<unknown[]>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: hit });
      return;
    }

    const db = req.firebase!.db;
    let query = db
      .collection('ScoutReports')
      .where('userId', '==', userId) as FirebaseFirestore.Query;
    if (sportId) query = query.where('sportId', '==', sportId);
    query = query.limit(limit);

    const snap = await query.get();
    // Sort by publishedAt descending client-side to avoid composite index requirement
    const reports = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const aDate = new Date(String(a['publishedAt'] ?? '')).getTime();
        const bDate = new Date(String(b['publishedAt'] ?? '')).getTime();
        return bDate - aDate;
      });
    await cache.set(cacheKey, reports, { ttl: CACHE_TTL.STATS });
    res.json({ success: true, data: reports });
  })
);

/**
 * Get video highlights from the user's videos sub-collection.
 * Optionally filter by sportId: GET /api/v1/auth/profile/:userId/videos?sportId=football
 * GET /api/v1/auth/profile/:userId/videos
 */
router.get(
  '/:userId/videos',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const limit = Math.min(50, parseInt(String(req.query['limit'] ?? '20'), 10));
    const sportId = req.query['sportId'] ? String(req.query['sportId']) : null;

    const cache = getCacheService();
    const cacheKey = `profile:sub:videos:${userId}${sportId ? `:${sportId}` : ''}:${limit}`;
    const hit = await cache.get<unknown[]>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: hit });
      return;
    }

    const db = req.firebase!.db;
    // Query top-level Videos collection filtered by userId and ownerType
    let query = db
      .collection('Videos')
      .where('userId', '==', userId)
      .where('ownerType', '==', 'user') as FirebaseFirestore.Query;

    // Filter by sport if provided (for multi-sport athletes)
    if (sportId) {
      query = query.where('sportId', '==', sportId);
    }

    query = query.orderBy('createdAt', 'desc').limit(limit);

    const snap = await query.get();
    const videos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    await cache.set(cacheKey, videos, { ttl: CACHE_TTL.POSTS });
    res.json({ success: true, data: videos });
  })
);

/**
 * Get schedule events from the user's schedule sub-collection.
 * Ordered by date ascending (upcoming first).
 * Optionally filter by sportId: GET /api/v1/auth/profile/:userId/schedule?sportId=football
 * GET /api/v1/auth/profile/:userId/schedule
 */
router.get(
  '/:userId/schedule',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const limit = Math.min(100, parseInt(String(req.query['limit'] ?? '50'), 10));
    const sportId = req.query['sportId'] as string | undefined;

    const cache = getCacheService();
    const cacheKey = `profile:sub:schedule:${userId}${sportId ? `:${sportId}` : ''}`;
    const hit = await cache.get<unknown[]>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: hit });
      return;
    }

    const db = req.firebase!.db;
    // Query top-level Events collection filtered by userId and ownerType
    let query = db
      .collection('Events')
      .where('userId', '==', userId)
      .where('ownerType', '==', 'user')
      .orderBy('date', 'asc')
      .limit(limit) as FirebaseFirestore.Query;

    // Filter by sport if provided (for multi-sport athletes)
    if (sportId) {
      query = query.where('sport', '==', sportId.toLowerCase()) as FirebaseFirestore.Query;
    }

    const snap = await query.get();
    const events = snap.docs.map((d) => {
      const data = d.data();
      // Transform Firestore ScheduleEvent → ProfileEvent
      // Field mapping: eventType→type, title→name, date→startDate
      // Handle type mismatches: 'tournament'|'tryout' → 'other'
      let eventType = data['eventType'] as string;
      if (eventType === 'tournament' || eventType === 'tryout') {
        eventType = 'other';
      }

      return {
        id: d.id,
        type: eventType, // 'game' | 'camp' | 'visit' | 'combine' | 'showcase' | 'practice' | 'other'
        name: data['title'] || 'Untitled Event',
        description: data['description'],
        location: data['location'],
        startDate: data['date'], // ISO string
        endDate: data['endDate'],
        isAllDay: data['isAllDay'],
        url: data['url'],
        opponent: data['opponent'],
        result: data['result'],
        logoUrl: data['logoUrl'],
        graphicUrl: data['graphicUrl'],
        sport: data['sport'], // Add sport field for frontend filtering
      };
    });

    logger.debug('[Profile] Schedule events fetched', {
      userId,
      count: events.length,
      types: events.map((e) => e.type),
      sportFilter: sportId,
    });

    await cache.set(cacheKey, events, { ttl: CACHE_TTL.FEED });
    res.json({ success: true, data: events });
  })
);

/**
 * Get user recruiting activities (offers, visits, contacts, interest).
 * Supports sport filtering for multi-sport athletes.
 *
 * GET /api/v1/auth/profile/:userId/recruiting?sportId=football
 */
router.get(
  '/:userId/recruiting',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const sportId = (req.query['sportId'] as string) || null;
    const limit = parseInt((req.query['limit'] as string) || '50', 10);

    const cacheKey = sportId
      ? `profile:${userId}:recruiting:${sportId}`
      : `profile:${userId}:recruiting:all`;

    const cache = getCacheService();
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug('[Profile] Recruiting activities cache hit', { userId, sportId });
      res.json({ success: true, data: cached });
      return;
    }

    const db = req.firebase!.db;
    let query = db
      .collection('Recruiting')
      .where('userId', '==', userId)
      .where('ownerType', '==', 'user')
      .orderBy('date', 'desc')
      .limit(limit) as FirebaseFirestore.Query;

    // Filter by sport if provided (for multi-sport athletes)
    if (sportId) {
      query = query.where('sport', '==', sportId.toLowerCase()) as FirebaseFirestore.Query;
    }

    const snap = await query.get();
    const activities = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        category: data['category'], // 'offer' | 'visit' | 'contact' | 'interest'
        collegeId: data['collegeId'],
        collegeName: data['collegeName'],
        division: data['division'],
        conference: data['conference'],
        city: data['city'],
        state: data['state'],
        sport: data['sport'], // For sport filtering
        scholarshipType: data['scholarshipType'],
        visitType: data['visitType'],
        date: data['date'],
        endDate: data['endDate'],
        coachName: data['coachName'],
        coachTitle: data['coachTitle'],
        notes: data['notes'],
        source: data['source'],
        verified: data['verified'],
        createdAt: data['createdAt'],
        updatedAt: data['updatedAt'],
      };
    });

    logger.debug('[Profile] Recruiting activities fetched', {
      userId,
      count: activities.length,
      categories: activities.map((a) => a.category),
      sportFilter: sportId,
    });

    await cache.set(cacheKey, activities, { ttl: CACHE_TTL.FEED });
    res.json({ success: true, data: activities });
  })
);

/**
 * Get user profile by ID.
 * GET /api/v1/auth/profile/:userId
 */
router.get(
  '/:userId',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };

    if (!userId?.trim()) {
      sendError(
        res,
        validationError([{ field: 'userId', message: 'User ID is required', rule: 'required' }])
      );
      return;
    }

    const cacheKey = buildProfileByIdCacheKey(userId);
    const cache = getCacheService();

    // --- Cache hit ---
    const cached = await cache.get<User>(cacheKey);
    if (cached) {
      logger.debug('[Profile] Profile cache hit', { userId });
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: cached });
      return;
    }

    // --- Cache miss: fetch from Firestore ---
    const db = req.firebase!.db;
    const doc = await db.collection(USERS_COLLECTION).doc(userId).get();

    if (!doc.exists) {
      sendError(res, notFoundError('profile'));
      return;
    }

    const rawUser = docToUser(doc.id, doc.data() as UserFirestoreDoc);
    const hydrationService = getHydrationService(db);
    const user = await hydrationService.hydrateUser(rawUser);

    // For coach/director roles, connected sources live on the Team doc.
    // Merge them so callers (including auth sync) see the correct sources.
    const isTeamRole = user.role === 'coach' || user.role === 'director';
    const activeSportData = user.sports?.[user.activeSportIndex ?? 0] ?? user.sports?.[0];
    const teamId = activeSportData?.team?.teamId;
    if (isTeamRole && teamId) {
      try {
        const teamDoc = await db.collection('Teams').doc(teamId).get();
        if (teamDoc.exists) {
          const teamData = teamDoc.data();
          if (
            Array.isArray(teamData?.['connectedSources']) &&
            teamData['connectedSources'].length > 0
          ) {
            user.connectedSources = teamData['connectedSources'];
          }
        }
      } catch (err) {
        logger.warn('[Profile] Failed to fetch team connected sources', { userId, teamId, err });
      }
    }

    await cache.set(cacheKey, user, { ttl: CACHE_TTL.PROFILES });
    logger.debug('[Profile] Profile cache set', { userId });

    res.json({ success: true, data: user });
  })
);

/**
 * Update user profile.
 * PUT /api/v1/auth/profile/:userId
 * Requires authentication. Users can only update their own profiles.
 */
router.put(
  '/:userId',
  appGuard,
  validateBody(UpdateProfileDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const requestingUid = req.user!.uid;

    if (requestingUid !== userId) {
      sendError(res, forbiddenError());
      return;
    }

    const body = req.body;

    // Whitelist of all writable User fields — system/read-only fields
    // (id, email, _counters, _schemaVersion, unicode, profileCode,
    //  onboardingCompleted, role, status, teamCode) are excluded.
    // Note: FCM tokens are stored separately in FcmTokens/{userId} collection
    const allowedFields: string[] = [
      // Core identity
      'firstName',
      'lastName',
      'displayName',
      'username',
      'aboutMe',
      'bannerImg',
      'profileImgs',
      'gender',
      // Physical / class
      'height',
      'weight',
      'classOf',
      // Location & contact
      'location',
      'contact',
      // Social
      'social',
      // Sports
      'sports',
      'activeSportIndex',
      // History & awards
      'teamHistory',
      'awards',
      // Connected sources
      'connectedSources',
      // Role-specific data
      'athlete',
      'coach',
      'director',
      'recruiter',
      'parent',
      // Preferences
      'preferences',
    ];
    const updates: Partial<Record<string, unknown>> = {};

    for (const field of allowedFields) {
      if ((body as Record<string, unknown>)[field] !== undefined) {
        updates[field] = (body as Record<string, unknown>)[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      sendError(
        res,
        validationError([{ field: 'body', message: 'No valid fields to update', rule: 'required' }])
      );
      return;
    }

    const db = req.firebase!.db;
    const userRef = db.collection(USERS_COLLECTION).doc(userId);

    // Fetch current doc to get username for cache invalidation
    const currentDoc = await userRef.get();
    if (!currentDoc.exists) {
      sendError(res, notFoundError('profile'));
      return;
    }

    const currentData = currentDoc.data() as UserFirestoreDoc;
    const currentUsername = currentData['username'] as string | undefined;
    const currentUnicode = currentData['unicode'] as string | null | undefined;

    updates['updatedAt'] = new Date().toISOString();

    await userRef.update(updates);

    // Fetch updated document
    const updatedDoc = await userRef.get();
    const updatedUser = docToUser(updatedDoc.id, updatedDoc.data() as UserFirestoreDoc);

    // Sync cached user data across all RosterEntries for this user.
    // Only propagate the fields that RosterEntry caches for roster list display.
    const rosterCacheFields: Partial<import('@nxt1/core/models').RosterEntry> = {};
    if (updates['firstName']) rosterCacheFields.firstName = updates['firstName'] as string;
    if (updates['lastName']) rosterCacheFields.lastName = updates['lastName'] as string;
    if (updates['profileImgs']) {
      const imgs = updates['profileImgs'] as string[];
      rosterCacheFields.profileImg = imgs[0] ?? null;
    }
    if (updates['height']) rosterCacheFields.height = updates['height'] as string;
    if (updates['weight']) rosterCacheFields.weight = updates['weight'] as string;
    if (updates['classOf']) rosterCacheFields.classOf = updates['classOf'] as number;

    if (Object.keys(rosterCacheFields).length > 0) {
      const rosterEntryService = createRosterEntryService(db);
      await rosterEntryService.updateCachedUserData(userId, rosterCacheFields);
    }

    // Invalidate stale cache entries
    await invalidateProfileCaches(userId, currentUsername, currentUnicode);

    logger.info('[Profile] Profile updated', { userId });
    res.json({ success: true, data: updatedUser });
  })
);

/**
 * Upload profile image.
 * POST /api/v1/auth/profile/:userId/image
 * Requires authentication. Users can only update their own profiles.
 */
router.post(
  '/:userId/image',
  appGuard,
  validateBody(UploadProfileImageDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const requestingUid = req.user!.uid;

    if (requestingUid !== userId) {
      sendError(res, forbiddenError());
      return;
    }

    const { imageUrl } = req.body;

    const db = req.firebase!.db;
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const currentDoc = await userRef.get();

    if (!currentDoc.exists) {
      sendError(res, notFoundError('profile'));
      return;
    }

    const currentData = currentDoc.data() as UserFirestoreDoc;
    const currentUsername = currentData['username'] as string | undefined;
    const currentUnicode = currentData['unicode'] as string | null | undefined;

    // Store as profileImgs array (new format)
    const existingImgs = (currentData['profileImgs'] as string[] | undefined) ?? [];

    // Add new image at the beginning
    const updatedImgs = [
      imageUrl.trim(),
      ...existingImgs.filter((img) => img !== imageUrl.trim()),
    ].slice(0, 5);

    await userRef.update({
      profileImgs: updatedImgs,
      updatedAt: new Date().toISOString(),
    });

    await invalidateProfileCaches(userId, currentUsername, currentUnicode);

    logger.info('[Profile] Profile image updated', { userId });
    res.json({ success: true, data: { url: imageUrl.trim() } });
  })
);

/**
 * Update an existing sport profile entry.
 * PUT /api/v1/auth/profile/:userId/sport
 * Requires authentication. Users can only update their own sport profiles.
 */
router.put(
  '/:userId/sport',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const requestingUid = req.user!.uid;

    if (requestingUid !== userId) {
      sendError(res, forbiddenError());
      return;
    }

    const { sportIndex, updates } = req.body as UpdateSportProfileRequest;

    if (
      sportIndex === undefined ||
      sportIndex === null ||
      !updates ||
      typeof updates !== 'object'
    ) {
      sendError(
        res,
        validationError([
          { field: 'sportIndex', message: 'sportIndex and updates are required', rule: 'required' },
        ])
      );
      return;
    }

    const db = req.firebase!.db;
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const currentDoc = await userRef.get();

    if (!currentDoc.exists) {
      sendError(res, notFoundError('profile'));
      return;
    }

    const currentData = currentDoc.data() as UserFirestoreDoc;
    const sports: SportProfile[] = (currentData['sports'] as SportProfile[] | undefined) ?? [];

    if (sportIndex < 0 || sportIndex >= sports.length) {
      sendError(
        res,
        validationError([
          { field: 'sportIndex', message: `Invalid sportIndex: ${sportIndex}`, rule: 'range' },
        ])
      );
      return;
    }

    // Merge updates into the sport at the given index
    const updatedSport: SportProfile = { ...sports[sportIndex], ...updates } as SportProfile;
    const updatedSports = [...sports];
    updatedSports[sportIndex] = updatedSport;

    await userRef.update({
      sports: updatedSports,
      updatedAt: new Date().toISOString(),
    });

    const currentUsername = currentData['username'] as string | undefined;
    const currentUnicode = currentData['unicode'] as string | null | undefined;
    await invalidateProfileCaches(userId, currentUsername, currentUnicode);

    logger.info('[Profile] Sport updated', { userId, sportIndex });
    res.json({ success: true, data: updatedSport });
  })
);

/**
 * Generate a unique team code (6 characters alphanumeric).
 * Used when a Team Role user adds a new sport, creating a new team.
 */
async function generateUniqueTeamCode(db: Firestore): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { team } = await teamCodeService.getTeamCodeByCode(db, candidate, false);
    if (!team) {
      return candidate;
    }
  }
  return `${Date.now().toString(36).slice(-6)}`.toUpperCase();
}

/**
 * Add a new sport to the profile.
 * POST /api/v1/auth/profile/:userId/sport
 * Requires authentication. Users can only update their own profiles.
 */
router.post(
  '/:userId/sport',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const requestingUid = req.user!.uid;

    if (requestingUid !== userId) {
      sendError(res, forbiddenError());
      return;
    }

    const sport = req.body as Partial<SportProfile> & { teamName?: string; teamType?: string };

    if (!sport.sport?.trim()) {
      sendError(
        res,
        validationError([{ field: 'sport', message: 'sport name is required', rule: 'required' }])
      );
      return;
    }

    const db = req.firebase!.db;
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const currentDoc = await userRef.get();

    if (!currentDoc.exists) {
      sendError(res, notFoundError('profile'));
      return;
    }

    const currentData = currentDoc.data() as UserFirestoreDoc;
    const existingSports: SportProfile[] =
      (currentData['sports'] as SportProfile[] | undefined) ?? [];
    const newSport: SportProfile = {
      ...sport,
      order: existingSports.length,
    } as SportProfile;

    const userRole = currentData['role'] as string | undefined;
    const isTeamRoleUser = userRole === 'coach' || userRole === 'director';

    if (isTeamRoleUser) {
      // ──────────────────────────────────────────────────────────────────
      // COACH / DIRECTOR: Atomic batch — Team + RosterEntry + managedTeamCodes
      // Do NOT write to user.sports[] — the ProfileHydrationService synthesizes
      // sport entries at read-time from the RosterEntry associations.
      // ──────────────────────────────────────────────────────────────────

      // Look up existing Organization/Team to inherit branding
      const rosterEntries = await db
        .collection('RosterEntries')
        .where('userId', '==', userId)
        .limit(1)
        .get();

      let inheritedTeamName = '';
      let inheritedTeamType = 'club';
      let inheritedOrgId = '';

      if (!rosterEntries.empty) {
        const entryData = rosterEntries.docs[0].data();
        inheritedOrgId = entryData['organizationId'] || '';
        if (entryData['teamId']) {
          const primaryTeamDoc = await db.collection('Teams').doc(entryData['teamId']).get();
          if (primaryTeamDoc.exists) {
            inheritedTeamName = primaryTeamDoc.data()?.['teamName'] || '';
            inheritedTeamType = primaryTeamDoc.data()?.['teamType'] || 'club';
            inheritedOrgId = inheritedOrgId || primaryTeamDoc.data()?.['organizationId'] || '';
          }
        }
      } else {
        // Fallback to legacy teamCode on user document if they are from v1
        const teamCodeObj = currentData['teamCode'] as Record<string, unknown> | undefined;
        if (teamCodeObj?.['teamName']) {
          inheritedTeamName = teamCodeObj['teamName'] as string;
          inheritedTeamType = (teamCodeObj['teamType'] as string) || 'club';
          inheritedOrgId = (teamCodeObj['organizationId'] as string) || '';
        }
      }

      // Director adding their first team: allow teamName/teamType from request body
      if (!inheritedTeamName && sport.teamName?.trim()) {
        inheritedTeamName = sport.teamName.trim();
        inheritedTeamType = sport.teamType?.trim() || 'club';
      }

      // Last resort for Directors: look up their own Organization and use its name
      if (!inheritedTeamName && userRole === 'director') {
        const orgSnap = await db
          .collection('Organizations')
          .where('ownerId', '==', userId)
          .limit(1)
          .get();
        if (!orgSnap.empty) {
          const orgData = orgSnap.docs[0].data();
          inheritedOrgId = orgSnap.docs[0].id;
          inheritedTeamName =
            (orgData['name'] as string | undefined) ||
            (orgData['teamName'] as string | undefined) ||
            (orgData['organizationName'] as string | undefined) ||
            '';
          inheritedTeamType = (orgData['teamType'] as string | undefined) || 'organization';
        }
      }

      if (!inheritedTeamName) {
        // Coach/Director has no primary team yet — cannot create a sport team.
        // Return an error instead of falling through to the athlete path.
        logger.warn('[Profile] Coach/Director has no primary team — cannot add sport', { userId });
        sendError(
          res,
          validationError([
            {
              field: 'sport',
              message: 'No primary team found. Complete onboarding first.',
              rule: 'required',
            },
          ])
        );
        return;
      }

      try {
        const batch = db.batch();
        const candidateCode = await generateUniqueTeamCode(db);

        // 1. Queue Team creation in the batch
        const team = await teamCodeService.createTeamCode(
          db,
          {
            teamCode: candidateCode,
            teamName: inheritedTeamName,
            teamType: inheritedTeamType as
              | 'high-school'
              | 'club'
              | 'college'
              | 'middle-school'
              | 'juco'
              | 'organization',
            sport: newSport.sport as string,
            createdBy: userId,
            creatorRole: userRole as 'athlete' | 'coach' | 'director' | 'media',
            creatorName:
              `${currentData['firstName'] || ''} ${currentData['lastName'] || ''}`.trim(),
            creatorEmail: currentData['email'] || '',
            creatorPhoneNumber: currentData['phoneNumber'] || '',
          },
          batch
        );

        // 2. Link Team back to the Organization (if one exists)
        if (inheritedOrgId) {
          batch.update(db.collection('Teams').doc(team.id!), {
            organizationId: inheritedOrgId,
            isClaimed: true,
          });
        }

        // 3. Queue RosterEntry creation in the batch (also increments athleteMember atomically)
        const rosterEntryService = createRosterEntryService(db);
        await rosterEntryService.createRosterEntry(
          {
            userId,
            teamId: team.id!,
            organizationId: inheritedOrgId,
            role: userRole === 'director' ? RosterRole.OWNER : RosterRole.HEAD_COACH,
            status: RosterEntryStatus.ACTIVE,
            firstName: (currentData['firstName'] as string) || '',
            lastName: (currentData['lastName'] as string) || '',
            email: (currentData['email'] as string) || '',
            phoneNumber: (currentData['phoneNumber'] as string) || '',
            profileImg: (currentData['profileImg'] as string) || undefined,
          },
          batch
        );

        // 4. Append team slug to coach.managedTeamCodes (lightweight routing cache)
        const coachData = (currentData['coach'] as Record<string, unknown>) || {};
        const currentManaged: string[] = Array.isArray(coachData['managedTeamCodes'])
          ? (coachData['managedTeamCodes'] as string[])
          : [];
        const newSlug = team.slug ?? team.unicode ?? team.id;
        if (newSlug && !currentManaged.includes(newSlug)) {
          batch.update(userRef, {
            'coach.managedTeamCodes': FieldValue.arrayUnion(newSlug),
            updatedAt: new Date().toISOString(),
          });
        }

        // 5. Commit everything atomically — all or nothing
        await batch.commit();
        logger.info('[Profile] Atomic sport+team+roster created for coach/director', {
          userId,
          teamId: team.id,
          sport: newSport.sport,
        });

        // Invalidate caches and return success
        const currentUsername = currentData['username'] as string | undefined;
        const currentUnicode = currentData['unicode'] as string | null | undefined;
        await invalidateProfileCaches(userId, currentUsername, currentUnicode);

        res.status(201).json({ success: true, data: { sport: newSport.sport, teamId: team.id } });
        return;
      } catch (err) {
        logger.error('[Profile] Atomic team creation failed for added sport', {
          error: err,
          userId,
        });
        sendError(
          res,
          validationError([
            { field: 'sport', message: 'Failed to create team for this sport', rule: 'server' },
          ])
        );
        return;
      }
    }

    // ──────────────────────────────────────────────────────────────────
    // ATHLETE / INDEPENDENT: Write sport directly to user.sports[]
    // Athletes own their physical sport profile (stats, positions, etc.)
    // ──────────────────────────────────────────────────────────────────
    await userRef.update({
      sports: FieldValue.arrayUnion(newSport),
      updatedAt: new Date().toISOString(),
    });

    const currentUsername = currentData['username'] as string | undefined;
    const currentUnicode = currentData['unicode'] as string | null | undefined;
    await invalidateProfileCaches(userId, currentUsername, currentUnicode);

    logger.info('[Profile] Sport added', { userId, sport: newSport.sport });
    res.status(201).json({ success: true, data: newSport });
  })
);

/**
 * Remove a sport from the profile by index.
 * DELETE /api/v1/auth/profile/:userId/sport/:sportIndex
 * Requires authentication. Users can only update their own profiles.
 */
router.delete(
  '/:userId/sport/:sportIndex',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, sportIndex: sportIndexStr } = req.params as {
      userId: string;
      sportIndex: string;
    };
    const requestingUid = req.user!.uid;

    if (requestingUid !== userId) {
      sendError(res, forbiddenError());
      return;
    }

    const sportIndex = parseInt(sportIndexStr, 10);
    if (isNaN(sportIndex) || sportIndex < 0) {
      sendError(
        res,
        validationError([
          {
            field: 'sportIndex',
            message: 'sportIndex must be a non-negative integer',
            rule: 'range',
          },
        ])
      );
      return;
    }

    const db = req.firebase!.db;
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const currentDoc = await userRef.get();

    if (!currentDoc.exists) {
      sendError(res, notFoundError('profile'));
      return;
    }

    const currentData = currentDoc.data() as UserFirestoreDoc;
    const sports: SportProfile[] = (currentData['sports'] as SportProfile[] | undefined) ?? [];

    if (sportIndex >= sports.length) {
      sendError(
        res,
        validationError([
          { field: 'sportIndex', message: `No sport at index ${sportIndex}`, rule: 'range' },
        ])
      );
      return;
    }

    // Remove the sport and re-assign order values
    const updatedSports = sports
      .filter((_, idx) => idx !== sportIndex)
      .map((s, idx) => ({ ...s, order: idx }));

    await userRef.update({
      sports: updatedSports,
      updatedAt: new Date().toISOString(),
    });

    const currentUsername = currentData['username'] as string | undefined;
    const currentUnicode = currentData['unicode'] as string | null | undefined;
    await invalidateProfileCaches(userId, currentUsername, currentUnicode);

    logger.info('[Profile] Sport removed', { userId, sportIndex });
    res.json({ success: true, data: null });
  })
);

// ─── Intel Report Routes ────────────────────────────────────────────────────

/**
 * GET /:userId/intel
 * Fetch the stored athlete Intel report (public, cached).
 */
router.get(
  '/:userId/intel',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const db = req.firebase!.db;

    const { IntelGenerationService } = await import('../modules/agent/services/intel.service.js');
    const intelService = new IntelGenerationService();
    const report = await intelService.getAthleteIntel(userId, db);

    res.json({ success: true, data: report });
  })
);

/**
 * POST /:userId/intel/generate
 * Trigger on-demand athlete Intel generation (authenticated, own profile only).
 */
router.post(
  '/:userId/intel/generate',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const userId_auth = req.user!.uid;
    const db = req.firebase!.db;

    if (userId_auth !== userId) {
      sendError(res, forbiddenError('owner'));
      return;
    }

    const { IntelGenerationService } = await import('../modules/agent/services/intel.service.js');
    const intelService = new IntelGenerationService();
    const report = await intelService.generateAthleteIntel(userId, db);

    logger.info('[Profile] Intel generated', { userId });
    res.json({
      success: true,
      status: 'ready',
      message: 'Intel report generated successfully',
      reportId: report['id'],
      data: report,
    });
  })
);

export default router;
