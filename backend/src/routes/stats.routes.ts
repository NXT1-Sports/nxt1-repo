/**
 * @fileoverview Player Stats Routes — Read + Write
 * @module @nxt1/backend/routes/stats
 *
 * Routes for the PlayerStats top-level Firestore collection.
 * Document ID = `${userId}_${sportId}_${season}`
 *
 * Phase 7: Write endpoints ensure stats are stored directly in the
 * PlayerStats collection, so the polymorphic TimelineService surfaces
 * them as FeedItemStat.
 *
 * Caching:
 * - GET /me: 5 min — current user's stats
 * - GET /users/:uid: 5 min — specific user's stats
 */

import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { asyncHandler, sendSuccess } from '@nxt1/core/errors/express';
import { notFoundError, forbiddenError } from '@nxt1/core/errors';
import { getCacheService, CACHE_TTL } from '../services/cache.service.js';
import { markCacheHit } from '../middleware/cache-status.middleware.js';
import { appGuard, optionalAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { UpsertPlayerStatsDto, DataSource } from '../dtos/stats.dto.js';
import { logger } from '../utils/logger.js';

const router: ExpressRouter = Router();

const PLAYER_STATS_COLLECTION = 'PlayerStats';

// ============================================
// READ
// ============================================

/**
 * Get current user's stats (all sports/seasons).
 * GET /api/v1/stats/me
 */
router.get(
  '/me',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const db = req.firebase!.db;
    const userId = req.user!.uid;

    const cache = getCacheService();
    const cacheKey = `stats:user:${userId}`;
    const hit = await cache.get<unknown>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      sendSuccess(res, hit, { cached: true });
      return;
    }

    const snap = await db
      .collection(PLAYER_STATS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('updatedAt', 'desc')
      .get();

    const stats = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    await cache.set(cacheKey, stats, { ttl: CACHE_TTL.FEED });

    logger.debug('[Stats API] User stats fetched', { userId, count: stats.length });
    sendSuccess(res, stats);
  })
);

/**
 * Get stats for a specific user (public).
 * GET /api/v1/stats/users/:uid
 */
router.get(
  '/users/:uid',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const db = req.firebase!.db;
    const { uid } = req.params as { uid: string };

    const cache = getCacheService();
    const cacheKey = `stats:user:${uid}`;
    const hit = await cache.get<unknown>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      sendSuccess(res, hit, { cached: true });
      return;
    }

    const snap = await db
      .collection(PLAYER_STATS_COLLECTION)
      .where('userId', '==', uid)
      .orderBy('updatedAt', 'desc')
      .get();

    const stats = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    await cache.set(cacheKey, stats, { ttl: CACHE_TTL.FEED });

    logger.debug('[Stats API] Public stats fetched', { uid, count: stats.length });
    sendSuccess(res, stats);
  })
);

/**
 * Get a single stat document.
 * GET /api/v1/stats/:id
 */
router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const db = req.firebase!.db;
    const { id } = req.params as { id: string };

    const cache = getCacheService();
    const cacheKey = `stats:doc:${id}`;
    const hit = await cache.get<unknown>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      sendSuccess(res, hit, { cached: true });
      return;
    }

    const doc = await db.collection(PLAYER_STATS_COLLECTION).doc(id).get();

    if (!doc.exists) {
      const err = notFoundError('stats', id);
      res.status(err.statusCode).json(err.toResponse());
      return;
    }

    const stats = { id: doc.id, ...doc.data() };
    await cache.set(cacheKey, stats, { ttl: CACHE_TTL.FEED });

    logger.debug('[Stats API] Stat doc fetched', { id });
    sendSuccess(res, stats);
  })
);

// ============================================
// WRITE
// ============================================

/**
 * Upsert player stats for a sport + season.
 * PUT /api/v1/stats
 *
 * Uses deterministic doc ID: `${userId}_${sportId}_${season}`
 * If the doc exists, stats are merged (replaced). If not, it's created.
 *
 * This ensures stats surface as FeedItemStat in the polymorphic timeline.
 */
router.put(
  '/',
  appGuard,
  validateBody(UpsertPlayerStatsDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const db = req.firebase!.db;
    const userId = req.user!.uid;
    const body = req.body as UpsertPlayerStatsDto;

    const sportId = body.sportId.toLowerCase();
    const docId = `${userId}_${sportId}_${body.season}`;
    const now = new Date().toISOString();

    const docRef = db.collection(PLAYER_STATS_COLLECTION).doc(docId);
    const existing = await docRef.get();

    const statsDoc = {
      userId,
      sportId,
      season: body.season,
      position: body.position ?? null,
      stats: body.stats.map((s) => ({
        field: s.field,
        label: s.label,
        value: s.value,
        unit: s.unit ?? null,
        category: s.category ?? null,
        verified: s.verified ?? false,
        verifiedBy: s.verifiedBy ?? null,
      })),
      source: body.source ?? DataSource.MANUAL,
      verified: body.verified ?? false,
      updatedAt: now,
      ...(existing.exists ? {} : { createdAt: now }),
    };

    await docRef.set(statsDoc, { merge: true });

    // Invalidate caches
    const cache = getCacheService();
    await cache.del(`stats:user:${userId}`);
    await cache.del(`stats:doc:${docId}`);

    logger.info('[Stats API] Player stats upserted', {
      docId,
      userId,
      sportId,
      season: body.season,
      statCount: body.stats.length,
      isNew: !existing.exists,
    });

    sendSuccess(
      res,
      { statsId: docId, isNew: !existing.exists },
      {
        statusCode: existing.exists ? 200 : 201,
      }
    );
  })
);

/**
 * Delete a player stats document.
 * DELETE /api/v1/stats/:id
 */
router.delete(
  '/:id',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const db = req.firebase!.db;
    const userId = req.user!.uid;
    const { id } = req.params as { id: string };

    const docRef = db.collection(PLAYER_STATS_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      const err = notFoundError('stats', id);
      res.status(err.statusCode).json(err.toResponse());
      return;
    }

    const existing = doc.data()!;
    if (existing['userId'] !== userId) {
      const err = forbiddenError('owner');
      res.status(err.statusCode).json(err.toResponse());
      return;
    }

    await docRef.delete();

    // Invalidate caches
    const cache = getCacheService();
    await cache.del(`stats:user:${userId}`);
    await cache.del(`stats:doc:${id}`);

    logger.info('[Stats API] Player stats deleted', { statsId: id, userId });

    sendSuccess(res, { statsId: id });
  })
);

export default router;
