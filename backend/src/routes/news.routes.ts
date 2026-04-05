/**
 * @fileoverview News Routes
 * @module @nxt1/backend/routes/news
 *
 * Firestore-backed news feature routes with Redis caching.
 * Matches NEWS_API_ENDPOINTS from @nxt1/core/news/constants.
 *
 * Data layout:
 *   Firestore `News/{id}` — article documents
 *
 * Cache layout (from NEWS_CACHE_KEYS):
 *   news:feed:{sport}:{state}:p{page}:l{limit}  — paginated feed
 *   news:article:{id}                            — single article
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from '../utils/logger.js';
import { NxtApiError, notFoundError, internalError, validationError } from '@nxt1/core/errors';
import { NEWS_CACHE_KEYS, NEWS_CACHE_TTL } from '@nxt1/core';
import { getCacheService } from '../services/cache.service.js';

const router: ExpressRouter = Router();

// ─── Constants ───────────────────────────────────────────────────────────────

const NEWS_COLLECTION = 'News';

/** Cache TTL in seconds (NEWS_CACHE_TTL values are in ms). */
const CACHE_TTL = {
  FEED: Math.round(NEWS_CACHE_TTL.FEED / 1000), // 300 s
  ARTICLE: Math.round(NEWS_CACHE_TTL.ARTICLE / 1000), // 900 s
} as const;

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/news
 * Paginated news feed, optionally filtered by sport and state.
 * Query: sport, state, page, limit
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = req.firebase!.db;

    const sport = req.query['sport'] as string | undefined;
    const state = req.query['state'] as string | undefined;
    const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query['limit'] ?? '20'), 10)));

    const cacheKey = `${NEWS_CACHE_KEYS.FEED_PREFIX}${sport ?? 'all'}:${state ?? 'all'}:p${page}:l${limit}`;
    const cache = getCacheService();
    const cached = await cache.get(cacheKey);

    if (cached) {
      logger.debug('[News] Feed cache HIT', { cacheKey });
      res.set('X-Cache-Status', 'HIT');
      res.json(cached);
      return;
    }

    logger.debug('[News] Feed cache MISS', { cacheKey });

    let query = db
      .collection(NEWS_COLLECTION)
      .where('expiresAt', '>', Timestamp.now())
      .orderBy('publishedAt', 'desc') as FirebaseFirestore.Query;

    if (sport) {
      query = query.where('sport', '==', sport);
    }
    if (state) {
      query = query.where('state', '==', state);
    }

    const allSnap = await query.get();
    const allDocs = allSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const total = allDocs.length;
    const totalPages = Math.ceil(total / limit);
    const data = allDocs.slice((page - 1) * limit, page * limit);

    const response = {
      success: true,
      data,
      pagination: { page, limit, total, totalPages, hasMore: page < totalPages },
    };

    await cache.set(cacheKey, response, { ttl: CACHE_TTL.FEED });
    res.json(response);
  } catch (err) {
    if (err instanceof NxtApiError) {
      res.status(err.statusCode).json(err.toResponse());
      return;
    }
    logger.error('[News] GET / error', {
      err,
      sport: req.query['sport'],
      state: req.query['state'],
      page: req.query['page'],
      limit: req.query['limit'],
    });
    const error = internalError(err);
    res.status(error.statusCode).json(error.toResponse());
  }
});

/**
 * GET /api/v1/news/trending
 * Top 5 articles by viewCount.
 */
router.get('/trending', async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = _req.firebase!.db;

    const cacheKey = `${NEWS_CACHE_KEYS.FEED_PREFIX}trending`;
    const cache = getCacheService();
    const cached = await cache.get(cacheKey);

    if (cached) {
      logger.debug('[News] Trending cache HIT');
      res.set('X-Cache-Status', 'HIT');
      res.json(cached);
      return;
    }

    const snap = await db
      .collection(NEWS_COLLECTION)
      .where('expiresAt', '>', Timestamp.now())
      .orderBy('viewCount', 'desc')
      .limit(5)
      .get();

    const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const response = { success: true, data };

    await cache.set(cacheKey, response, { ttl: CACHE_TTL.FEED });
    res.json(response);
  } catch (err) {
    if (err instanceof NxtApiError) {
      res.status(err.statusCode).json(err.toResponse());
      return;
    }
    logger.error('[News] GET /trending error', { err });
    const error = internalError(err);
    res.status(error.statusCode).json(error.toResponse());
  }
});

/**
 * GET /api/v1/news/search?q=
 * In-memory text search across title and excerpt.
 * (Firestore lacks native full-text search; dataset is small.)
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const q = (req.query['q'] as string | undefined)?.trim().toLowerCase() ?? '';

    if (!q) {
      const error = validationError([
        { field: 'q', message: 'Search query is required.', rule: 'required' },
      ]);
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    const db = req.firebase!.db;

    const snap = await db
      .collection(NEWS_COLLECTION)
      .where('expiresAt', '>', Timestamp.now())
      .orderBy('publishedAt', 'desc')
      .get();

    type NewsDoc = Record<string, unknown>;
    const all = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as NewsDoc);

    const data = all.filter((a) => {
      const inTitle = String(a['title'] ?? '')
        .toLowerCase()
        .includes(q);
      const inExcerpt = String(a['excerpt'] ?? '')
        .toLowerCase()
        .includes(q);
      return inTitle || inExcerpt;
    });

    res.json({ success: true, data });
  } catch (err) {
    if (err instanceof NxtApiError) {
      res.status(err.statusCode).json(err.toResponse());
      return;
    }
    logger.error('[News] GET /search error', { err, query: req.query['q'] });
    const error = internalError(err);
    res.status(error.statusCode).json(error.toResponse());
  }
});

/**
 * GET /api/v1/news/stats
 * News statistics — not yet implemented.
 */
router.get('/stats', (_req: Request, res: Response): void => {
  res.status(501).json({ success: false, error: 'Not implemented' });
});

/**
 * GET /api/v1/news/:id
 * Single article by Firestore document ID. Increments viewCount.
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params['id'] as string;
    const cacheKey = `${NEWS_CACHE_KEYS.ARTICLE_PREFIX}${id}`;
    const cache = getCacheService();
    const cached = await cache.get(cacheKey);

    if (cached) {
      logger.debug('[News] Article cache HIT', { id });
      res.set('X-Cache-Status', 'HIT');
      res.json(cached);
      return;
    }

    const db = req.firebase!.db;

    const doc = await db.collection(NEWS_COLLECTION).doc(id).get();
    if (!doc.exists) {
      const error = notFoundError('article', id);
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    // Increment view count (fire-and-forget)
    db.collection(NEWS_COLLECTION)
      .doc(id)
      .update({ viewCount: FieldValue.increment(1) })
      .catch((err) => logger.warn('[News] viewCount increment failed', { id, err }));

    const response = { success: true, data: { id: doc.id, ...doc.data() } };
    await cache.set(cacheKey, response, { ttl: CACHE_TTL.ARTICLE });
    res.json(response);
  } catch (err) {
    if (err instanceof NxtApiError) {
      res.status(err.statusCode).json(err.toResponse());
      return;
    }
    logger.error('[News] GET /:id error', { err, id: req.params['id'] });
    const error = internalError(err);
    res.status(error.statusCode).json(error.toResponse());
  }
});

/**
 * POST /api/v1/news/:id/bookmark
 * Bookmark a news article — not yet implemented.
 */
router.post('/:id/bookmark', (_req: Request, res: Response): void => {
  res.status(501).json({ success: false, error: 'Not implemented' });
});

/**
 * POST /api/v1/news/generate
 * AI-powered news generation — implemented by dailyPulseUpdates function.
 */
router.post('/generate', (_req: Request, res: Response): void => {
  const error = internalError('Use the scheduled dailyPulseUpdates function instead.');
  res.status(501).json(error.toResponse());
});

export default router;
