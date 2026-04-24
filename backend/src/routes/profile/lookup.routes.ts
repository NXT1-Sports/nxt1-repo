/**
 * @fileoverview Profile — lookup routes.
 *
 * GET /me
 * GET /unicode/:unicode
 * GET /related
 * GET /search
 * GET /:userId
 */

import { Router, type Request, type Response } from 'express';
import { appGuard, optionalAuth } from '../../middleware/auth/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import { getCacheService } from '../../services/core/cache.service.js';
import { markCacheHit } from '../../middleware/cache/cache-status.middleware.js';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import { validationError, notFoundError } from '@nxt1/core/errors';
import type { User, UserSummary, ProfileSearchParams } from '@nxt1/core';
import { PROFILE_CACHE_KEYS } from '@nxt1/core';
import {
  USERS_COLLECTION,
  CACHE_TTL,
  buildProfileByIdCacheKey,
  buildProfileByUnicodeCacheKey,
  buildProfileSearchCacheKey,
  docToUser,
  docToUserSummary,
  getHydrationService,
  type UserFirestoreDoc,
} from './shared.js';

const router = Router();

// ─── GET /me ──────────────────────────────────────────────────────────────────

router.get(
  '/me',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.uid;
    const cacheKey = buildProfileByIdCacheKey(userId);
    const cache = getCacheService();

    const cached = await cache.get<User>(cacheKey);
    if (cached) {
      logger.debug('[Profile] /me cache hit', { userId });
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: cached });
      return;
    }

    const db = req.firebase!.db;
    const doc = await db.collection(USERS_COLLECTION).doc(userId).get();

    if (!doc.exists) {
      sendError(res, notFoundError('profile'));
      return;
    }

    const rawUser = docToUser(doc.id, doc.data() as UserFirestoreDoc);
    const hydrationService = getHydrationService(db);
    const user = await hydrationService.hydrateUser(rawUser);

    const isTeamRole = user.role === 'coach' || user.role === 'director';
    const activeSportData = user.sports?.[user.activeSportIndex ?? 0] ?? user.sports?.[0];
    const teamId =
      (user as unknown as Record<string, unknown> & { teamCode?: { teamId?: string } }).teamCode
        ?.teamId ?? activeSportData?.team?.teamId;
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

// ─── GET /unicode/:unicode ────────────────────────────────────────────────────

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

    const cached = await cache.get<User>(cacheKey);
    if (cached) {
      logger.debug('[Profile] Unicode cache hit', { unicode });
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: cached });
      return;
    }

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
    const hydrationService = getHydrationService(db);
    const user = await hydrationService.hydrateUser(rawUser);

    await Promise.all([
      cache.set(cacheKey, user, { ttl: CACHE_TTL.PROFILES }),
      cache.set(buildProfileByIdCacheKey(doc.id), user, { ttl: CACHE_TTL.PROFILES }),
    ]);

    logger.debug('[Profile] Unicode cache set', { unicode, userId: doc.id });
    res.json({ success: true, data: user });
  })
);

// ─── GET /related ─────────────────────────────────────────────────────────────

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

    const POOL_SIZE = 50;
    const snapshot = await db
      .collection(USERS_COLLECTION)
      .where('primarySport', '==', sport)
      .limit(POOL_SIZE)
      .get();

    const pool: UserSummary[] = snapshot.docs.map((doc) =>
      docToUserSummary(doc.id, doc.data() as UserFirestoreDoc)
    );

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

// ─── GET /search ──────────────────────────────────────────────────────────────

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

    const { page = 1, limit = 20 } = params;

    let firestoreQuery = db.collection(USERS_COLLECTION).limit(limit);
    if (params.sport) firestoreQuery = firestoreQuery.where('primarySport', '==', params.sport);
    if (params.state) firestoreQuery = firestoreQuery.where('location.state', '==', params.state);
    if (params.classOf)
      firestoreQuery = firestoreQuery.where('athlete.classOf', '==', params.classOf);
    if (params.position) firestoreQuery = firestoreQuery.where('position', '==', params.position);

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

// ─── GET /:userId ─────────────────────────────────────────────────────────────

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

    const cached = await cache.get<User>(cacheKey);
    if (cached) {
      logger.debug('[Profile] Profile cache hit', { userId });
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: cached });
      return;
    }

    const db = req.firebase!.db;
    const doc = await db.collection(USERS_COLLECTION).doc(userId).get();

    if (!doc.exists) {
      sendError(res, notFoundError('profile'));
      return;
    }

    const rawUser = docToUser(doc.id, doc.data() as UserFirestoreDoc);
    const hydrationService = getHydrationService(db);
    const user = await hydrationService.hydrateUser(rawUser);

    const isTeamRole = user.role === 'coach' || user.role === 'director';
    const activeSportData = user.sports?.[user.activeSportIndex ?? 0] ?? user.sports?.[0];
    const teamId =
      (user as unknown as Record<string, unknown> & { teamCode?: { teamId?: string } }).teamCode
        ?.teamId ?? activeSportData?.team?.teamId;
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

export default router;
