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
import type { DocumentData } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { appGuard, optionalAuth } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';
import { getCacheService, CACHE_TTL } from '../services/cache.service.js';
import { markCacheHit } from '../middleware/cache-status.middleware.js';

// Shared types and constants from @nxt1/core
import type { User, UserSummary, SportProfile } from '@nxt1/core';
import type {
  UpdateProfileRequest,
  UpdateSportProfileRequest,
  ProfileSearchParams,
} from '@nxt1/core';
import { PROFILE_CACHE_KEYS } from '@nxt1/core';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import { validationError, notFoundError, forbiddenError } from '@nxt1/core/errors';

const router: ExpressRouter = Router();

// ============================================
// FIRESTORE COLLECTION
// ============================================

const USERS_COLLECTION = 'Users';

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
  profileImg?: string | null;
  bannerImg?: string | null;
  profileImages?: string[];
  aboutMe?: string;

  // Physical attributes (top-level)
  height?: string;
  weight?: string;
  classOf?: number;

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
  collegeCoach?: Record<string, unknown>;
  director?: Record<string, unknown>;
  scout?: Record<string, unknown>;
  recruitingService?: Record<string, unknown>;
  media?: Record<string, unknown>;
  parent?: Record<string, unknown>;
  fan?: Record<string, unknown>;

  // Verification & AI
  verificationStatus?: string;
  connectedSources?: Array<{
    platform: string;
    profileUrl: string;
    lastSyncedAt?: string;
    syncStatus?: string;
    syncedFields?: string[];
    lastError?: string;
  }>;
  connectedEmails?: Array<Record<string, unknown>>;

  // Awards & team history
  awards?: Array<Record<string, unknown>>;
  teamHistory?: Array<Record<string, unknown>>;

  // Subscription
  planTier?: string;

  // Preferences & counters
  preferences?: Record<string, unknown>;
  _counters?: Record<string, unknown>;

  // Onboarding
  onboardingCompleted?: boolean;

  // Timestamps
  updatedAt?: string;
  createdAt?: string;
  lastLoginAt?: string;

  // Push notifications
  fcmToken?: string | null;

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
 */
async function invalidateProfileCaches(
  userId: string,
  username?: string,
  unicode?: string | null
): Promise<void> {
  const cache = getCacheService();

  const keysToDelete: string[] = [buildProfileByIdCacheKey(userId)];
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
  const sports = data['sports'] as SportProfile[] | undefined;
  const primarySport = sports?.find((s) => s.order === 0) ?? sports?.[0];
  return {
    id: docId,
    unicode: data['unicode'] as string | null | undefined,
    firstName: data['firstName'] ?? '',
    lastName: data['lastName'] ?? '',
    displayName: data['displayName'] as string | undefined,
    profileImg: (data['profileImg'] as string | null) ?? null,
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

    const user = docToUser(doc.id, doc.data() as UserFirestoreDoc);

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
    const user = docToUser(doc.id, doc.data() as UserFirestoreDoc);

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
    const user = docToUser(doc.id, doc.data() as UserFirestoreDoc);

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
 * Get timeline posts from top-level Posts collection (filtered by userId).
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

    const db = req.firebase!.db;
    let query = db.collection('Posts').where('userId', '==', userId) as FirebaseFirestore.Query;
    if (sportId) query = query.where('sportId', '==', sportId);
    query = query.orderBy('createdAt', 'desc').limit(limit);

    const snap = await query.get();
    const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ success: true, data: posts });
  })
);

/**
 * Get VerifiedStat entries from the sport stats sub-collection.
 * GET /api/v1/auth/profile/:userId/sports/:sportId/stats
 */
router.get(
  '/:userId/sports/:sportId/stats',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, sportId } = req.params as { userId: string; sportId: string };
    const limit = Math.min(100, parseInt(String(req.query['limit'] ?? '50'), 10));

    const db = req.firebase!.db;
    const snap = await db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection('sports')
      .doc(sportId)
      .collection('stats')
      .orderBy('dateRecorded', 'desc')
      .limit(limit)
      .get();

    const stats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ success: true, data: stats });
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

    const db = req.firebase!.db;
    let query = db.collection('News').where('userId', '==', userId) as FirebaseFirestore.Query;
    if (sportId) query = query.where('sportId', '==', sportId);
    query = query.orderBy('publishedAt', 'desc').limit(limit);

    const snap = await query.get();
    const articles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
    res.json({ success: true, data: reports });
  })
);

/**
 * Get followers from the user's followers sub-collection.
 * GET /api/v1/auth/profile/:userId/followers
 */
router.get(
  '/:userId/followers',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const limit = Math.min(100, parseInt(String(req.query['limit'] ?? '50'), 10));

    const db = req.firebase!.db;
    const snap = await db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection('followers')
      .orderBy('followedAt', 'desc')
      .limit(limit)
      .get();

    const followers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ success: true, data: followers });
  })
);

/**
 * Get following from the user's following sub-collection.
 * GET /api/v1/auth/profile/:userId/following
 */
router.get(
  '/:userId/following',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const limit = Math.min(100, parseInt(String(req.query['limit'] ?? '50'), 10));

    const db = req.firebase!.db;
    const snap = await db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection('following')
      .orderBy('followedAt', 'desc')
      .limit(limit)
      .get();

    const following = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ success: true, data: following });
  })
);

/**
 * Get video highlights from the user's videos sub-collection.
 * GET /api/v1/auth/profile/:userId/videos
 */
router.get(
  '/:userId/videos',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const limit = Math.min(50, parseInt(String(req.query['limit'] ?? '20'), 10));

    const db = req.firebase!.db;
    const snap = await db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection('videos')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const videos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

    const db = req.firebase!.db;
    let query = db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection('schedule')
      .orderBy('date', 'asc')
      .limit(limit);

    // Filter by sport if provided (for multi-sport athletes)
    if (sportId) {
      query = query.where('sport', '==', sportId.toLowerCase()) as FirebaseFirestore.Query;
    }

    const snap = await query.get();
    const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ success: true, data: events });
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

    const user = docToUser(doc.id, doc.data() as UserFirestoreDoc);

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
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const requestingUid = req.user!.uid;

    if (requestingUid !== userId) {
      sendError(res, forbiddenError());
      return;
    }

    const body = req.body as UpdateProfileRequest;

    // Whitelist of all writable User fields — system/read-only fields
    // (id, email, planTier, _counters, _schemaVersion, unicode, profileCode,
    //  fcmToken, onboardingCompleted, role, status, teamCode) are excluded.
    const allowedFields: string[] = [
      // Core identity
      'firstName',
      'lastName',
      'displayName',
      'username',
      'aboutMe',
      'profileImg',
      'bannerImg',
      'profileImages',
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
      'collegeCoach',
      'director',
      'scout',
      'recruitingService',
      'media',
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
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const requestingUid = req.user!.uid;

    if (requestingUid !== userId) {
      sendError(res, forbiddenError());
      return;
    }

    const { imageUrl } = req.body as { imageUrl?: string };

    if (!imageUrl?.trim()) {
      sendError(
        res,
        validationError([{ field: 'imageUrl', message: 'imageUrl is required', rule: 'required' }])
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
    const currentUsername = currentData['username'] as string | undefined;
    const currentUnicode = currentData['unicode'] as string | null | undefined;

    await userRef.update({
      profileImg: imageUrl.trim(),
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

    const sport = req.body as Partial<SportProfile>;

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
      accountType: sport.accountType ?? 'athlete',
    } as SportProfile;

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

export default router;
