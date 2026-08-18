/**
 * @fileoverview System Release Notes Routes
 * @module @nxt1/backend/routes/release-notes
 *
 * Public read endpoints for AI-generated release notes (What's New modal).
 * Route mount point: /api/v1/system/release-notes
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { cronGuard } from '../../middleware/auth/auth.middleware.js';
import { getCacheService } from '../../services/core/cache.service.js';
import { generateWeeklyReleaseNotes } from '../../services/platform/release-notes-generator.service.js';
import { logger } from '../../utils/logger.js';
import type { SystemReleaseNote } from '@nxt1/core';

const router: ExpressRouter = Router();

const COLLECTION = 'SystemReleaseNotes';
const CACHE_TTL_S = 900; // 15 minutes
const HISTORY_MAX_LIMIT = 50;
const HISTORY_DEFAULT_LIMIT = 10;
const LATEST_SCAN_LIMIT = 25;
const HISTORY_SCAN_MULTIPLIER = 3;

const buildLatestCacheKey = () => 'system:release-notes:latest';
const buildHistoryCacheKey = (limit: number, cursor: string) =>
  `system:release-notes:history:${limit}:${cursor}`;

/**
 * GET /api/v1/system/release-notes/latest
 * Returns the most recent published release note.
 */
router.get('/latest', async (_req: Request, res: Response): Promise<void> => {
  try {
    const cache = getCacheService();
    const cacheKey = buildLatestCacheKey();

    const cached = await cache.get<SystemReleaseNote | null>(cacheKey);
    if (cached !== null && cached !== undefined) {
      res.json({ success: true, data: cached });
      return;
    }

    const db = _req.firebase?.db ?? getFirestore();
    const snap = await db
      .collection(COLLECTION)
      .orderBy('releaseDate', 'desc')
      .limit(LATEST_SCAN_LIMIT)
      .get();

    const note: SystemReleaseNote | null =
      snap.docs
        .map((doc) => doc.data() as SystemReleaseNote)
        .find((candidate) => candidate.isPublished) ?? null;

    await cache.set(cacheKey, note, { ttl: CACHE_TTL_S });

    res.json({ success: true, data: note });
  } catch (err) {
    logger.error('[ReleaseNotes] GET /latest failed', { error: String(err) });
    res.status(500).json({ success: false, error: 'Failed to fetch latest release note' });
  }
});

/**
 * GET /api/v1/system/release-notes/history
 * Returns paginated published release notes in reverse-chronological order.
 */
router.get('/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const rawLimit = parseInt(req.query['limit'] as string, 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(1, rawLimit), HISTORY_MAX_LIMIT)
      : HISTORY_DEFAULT_LIMIT;
    const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : '';

    const cache = getCacheService();
    const cacheKey = buildHistoryCacheKey(limit, cursor);
    const cached = await cache.get<{ data: SystemReleaseNote[]; nextCursor: string | null }>(
      cacheKey
    );
    if (cached) {
      res.json({ success: true, ...cached, hasMore: cached.nextCursor !== null });
      return;
    }

    const db = req.firebase?.db ?? getFirestore();
    let query = db
      .collection(COLLECTION)
      .orderBy('releaseDate', 'desc')
      .limit(limit * HISTORY_SCAN_MULTIPLIER + 1);

    if (cursor) {
      const cursorDoc = await db.collection(COLLECTION).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snap = await query.get();
    const publishedDocs = snap.docs.filter((doc) => (doc.data() as SystemReleaseNote).isPublished);
    const hasMore = publishedDocs.length > limit;
    const docs = hasMore ? publishedDocs.slice(0, limit) : publishedDocs;
    const data = docs.map((d) => d.data() as SystemReleaseNote);
    const nextCursor = hasMore ? docs[docs.length - 1].id : null;

    await cache.set(cacheKey, { data, nextCursor }, { ttl: CACHE_TTL_S });

    res.json({ success: true, data, nextCursor, hasMore });
  } catch (err) {
    logger.error('[ReleaseNotes] GET /history failed', { error: String(err) });
    res.status(500).json({ success: false, error: 'Failed to fetch release notes history' });
  }
});

/**
 * POST /api/v1/system/release-notes/cron/generate
 * Generates a published release note when the repo version advanced since the
 * last stable published note.
 */
router.post('/cron/generate', cronGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = req.firebase?.db ?? getFirestore();
    const result = await generateWeeklyReleaseNotes(db);

    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('[ReleaseNotes] POST /cron/generate failed', { error: String(err) });
    res.status(500).json({ success: false, error: 'Failed to generate release notes' });
  }
});

export default router;
