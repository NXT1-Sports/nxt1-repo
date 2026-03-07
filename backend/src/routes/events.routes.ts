/**
 * @fileoverview Event Detail Routes
 * @module @nxt1/backend/routes/events
 *
 * Routes for the Events top-level Firestore collection.
 * All events: games, practices, camps, showcases, visits
 * Supports both user and team events via ownerType field
 *
 * Caching:
 * - GET /:id: 5 min (FEED TTL) — single event detail
 */

import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { asyncHandler, sendSuccess } from '@nxt1/core/errors/express';
import { getCacheService, CACHE_TTL } from '../services/cache.service.js';
import { markCacheHit } from '../middleware/cache-status.middleware.js';
import { logger } from '../utils/logger.js';

const router: ExpressRouter = Router();

/**
 * Get a single Event by document ID.
 * GET /api/v1/events/:id
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    const cache = getCacheService();
    const cacheKey = `event:${id}`;
    const hit = await cache.get<unknown>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      sendSuccess(res, hit, { cached: true });
      return;
    }

    const db = req.firebase!.db;
    const doc = await db.collection('Events').doc(id).get();

    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }

    const event = { id: doc.id, ...doc.data() };
    await cache.set(cacheKey, event, { ttl: CACHE_TTL.FEED });

    logger.debug('[Events API] Event fetched', { id });
    sendSuccess(res, event);
  })
);

export default router;
