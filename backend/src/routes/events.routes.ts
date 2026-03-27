/**
 * @fileoverview Event Routes — Read + Write
 * @module @nxt1/backend/routes/events
 *
 * Routes for the Events top-level Firestore collection.
 * All events: games, practices, camps, showcases, visits
 * Supports both user and team events via ownerType field.
 *
 * Phase 7: Write endpoints ensure events are stored directly in the
 * Events collection (not embedded on User docs), so the polymorphic
 * TimelineService can surface them as FeedItemEvent.
 *
 * Caching:
 * - GET /:id: 5 min (FEED TTL) — single event detail
 */

import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { asyncHandler, sendSuccess } from '@nxt1/core/errors/express';
import { notFoundError, forbiddenError } from '@nxt1/core/errors';
import { getCacheService, CACHE_TTL } from '../services/cache.service.js';
import { markCacheHit } from '../middleware/cache-status.middleware.js';
import { appGuard } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { CreateEventDto, UpdateEventDto, DataSource } from '../dtos/events.dto.js';
import { logger } from '../utils/logger.js';

const router: ExpressRouter = Router();

const EVENTS_COLLECTION = 'Events';

// ============================================
// READ
// ============================================

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
    const doc = await db.collection(EVENTS_COLLECTION).doc(id).get();

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

// ============================================
// WRITE
// ============================================

/**
 * Create a new Event.
 * POST /api/v1/events
 *
 * Writes directly to the Events collection so the polymorphic
 * TimelineService surfaces it as a FeedItemEvent.
 */
router.post(
  '/',
  appGuard,
  validateBody(CreateEventDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const db = req.firebase!.db;
    const userId = req.user!.uid;
    const body = req.body as CreateEventDto;

    const now = new Date().toISOString();

    const eventDoc = {
      userId,
      ownerType: body.teamId ? 'team' : 'user',
      teamId: body.teamId ?? null,
      eventType: body.eventType,
      title: body.title,
      date: body.date,
      endDate: body.endDate ?? null,
      location: body.location ?? null,
      opponent: body.opponent ?? null,
      opponentLogoUrl: body.opponentLogoUrl ?? null,
      isHome: body.isHome ?? null,
      status: body.status ?? 'upcoming',
      sport: body.sport?.toLowerCase() ?? null,
      description: body.description ?? null,
      isAllDay: body.isAllDay ?? false,
      url: body.url ?? null,
      logoUrl: body.logoUrl ?? null,
      graphicUrl: body.graphicUrl ?? null,
      source: body.source ?? DataSource.MANUAL,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection(EVENTS_COLLECTION).add(eventDoc);

    logger.info('[Events API] Event created', {
      eventId: docRef.id,
      userId,
      eventType: body.eventType,
      sport: body.sport,
    });

    sendSuccess(res, { eventId: docRef.id }, { statusCode: 201 });
  })
);

/**
 * Update an existing Event.
 * PUT /api/v1/events/:id
 *
 * Only the event owner can update.
 */
router.put(
  '/:id',
  appGuard,
  validateBody(UpdateEventDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const db = req.firebase!.db;
    const userId = req.user!.uid;
    const { id } = req.params as { id: string };
    const body = req.body as UpdateEventDto;

    const docRef = db.collection(EVENTS_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      const err = notFoundError('event', id);
      res.status(err.statusCode).json(err.toResponse());
      return;
    }

    const existing = doc.data()!;
    if (existing['userId'] !== userId) {
      const err = forbiddenError('owner');
      res.status(err.statusCode).json(err.toResponse());
      return;
    }

    // Build update object — only include provided fields
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.title !== undefined) updates['title'] = body.title;
    if (body.date !== undefined) updates['date'] = body.date;
    if (body.location !== undefined) updates['location'] = body.location;
    if (body.opponent !== undefined) updates['opponent'] = body.opponent;
    if (body.opponentLogoUrl !== undefined) updates['opponentLogoUrl'] = body.opponentLogoUrl;
    if (body.isHome !== undefined) updates['isHome'] = body.isHome;
    if (body.status !== undefined) updates['status'] = body.status;
    if (body.description !== undefined) updates['description'] = body.description;
    if (body.url !== undefined) updates['url'] = body.url;
    if (body.logoUrl !== undefined) updates['logoUrl'] = body.logoUrl;
    if (body.graphicUrl !== undefined) updates['graphicUrl'] = body.graphicUrl;

    await docRef.update(updates);

    // Invalidate cache
    const cache = getCacheService();
    await cache.del(`event:${id}`);

    logger.info('[Events API] Event updated', {
      eventId: id,
      userId,
      fields: Object.keys(updates),
    });

    sendSuccess(res, { eventId: id });
  })
);

/**
 * Delete an Event (soft delete).
 * DELETE /api/v1/events/:id
 */
router.delete(
  '/:id',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const db = req.firebase!.db;
    const userId = req.user!.uid;
    const { id } = req.params as { id: string };

    const docRef = db.collection(EVENTS_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      const err = notFoundError('event', id);
      res.status(err.statusCode).json(err.toResponse());
      return;
    }

    const existing = doc.data()!;
    if (existing['userId'] !== userId) {
      const err = forbiddenError('owner');
      res.status(err.statusCode).json(err.toResponse());
      return;
    }

    await docRef.update({
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Invalidate cache
    const cache = getCacheService();
    await cache.del(`event:${id}`);

    logger.info('[Events API] Event deleted', { eventId: id, userId });

    sendSuccess(res, { eventId: id });
  })
);

export default router;
