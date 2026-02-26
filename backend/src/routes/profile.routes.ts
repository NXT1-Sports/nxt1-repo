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
  firstName?: string;
  lastName?: string;
  username?: string;
  role?: string;

  // Profile
  profileImg?: string | null;
  bannerImg?: string | null;
  profileImages?: string[];
  aboutMe?: string;

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

  // Athlete-specific
  athlete?: Record<string, unknown>;
  classOf?: number;
  height?: string;
  weight?: string;

  // Coach-specific
  coach?: Record<string, unknown>;

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
  agentX?: Record<string, unknown>;

  // Awards & team history
  awards?: Array<Record<string, unknown>>;
  teamHistory?: Array<Record<string, unknown>>;

  // Subscription
  planTier?: string;

  // Meta
  onboardingCompleted?: boolean;
  updatedAt?: string;
  createdAt?: string;
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
async function invalidateProfileCaches(userId: string, username?: string): Promise<void> {
  const cache = getCacheService();

  const keysToDelete: string[] = [buildProfileByIdCacheKey(userId)];
  if (username) {
    keysToDelete.push(buildProfileByUsernameCacheKey(username));
  }

  await Promise.all(keysToDelete.map((k) => cache.del(k)));

  // Invalidate all profile search results (pattern delete)
  await cache.del(`${PROFILE_CACHE_KEYS.SEARCH}*`);

  logger.debug('[Profile] Cache invalidated', { userId, username });
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
  return {
    id: docId,
    firstName: data['firstName'] ?? '',
    lastName: data['lastName'] ?? '',
    profileImg: (data['profileImg'] as string | null) ?? null,
    role: data['role'] as UserSummary['role'],
    location: {
      city: (data['location']?.['city'] as string | undefined) ?? data['city'] ?? '',
      state: (data['location']?.['state'] as string | undefined) ?? data['state'] ?? '',
    },
    primarySport: data['primarySport'] as string | undefined,
    primaryPosition: (data['sports'] as SportProfile[] | undefined)?.[0]?.positions?.[0],
    classOf: data['athlete']?.['classOf'] as number | undefined,
  };
}

// ============================================
// ROUTES
// ============================================

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

    // Validate allowed fields (whitelist to prevent mass-assignment)
    const allowedFields: Array<keyof UpdateProfileRequest> = [
      'firstName',
      'lastName',
      'profileImg',
      'bannerImg',
      'profileImages',
      'aboutMe',
      'location',
      'social',
    ];
    const updates: Partial<Record<string, unknown>> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
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

    updates['updatedAt'] = new Date().toISOString();

    await userRef.update(updates);

    // Fetch updated document
    const updatedDoc = await userRef.get();
    const updatedUser = docToUser(updatedDoc.id, updatedDoc.data() as UserFirestoreDoc);

    // Invalidate stale cache entries
    await invalidateProfileCaches(userId, currentUsername);

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

    await userRef.update({
      profileImg: imageUrl.trim(),
      updatedAt: new Date().toISOString(),
    });

    await invalidateProfileCaches(userId, currentUsername);

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
    await invalidateProfileCaches(userId, currentUsername);

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
    await invalidateProfileCaches(userId, currentUsername);

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
    await invalidateProfileCaches(userId, currentUsername);

    logger.info('[Profile] Sport removed', { userId, sportIndex });
    res.json({ success: true, data: null });
  })
);

export default router;
