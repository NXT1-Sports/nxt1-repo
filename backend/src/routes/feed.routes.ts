/**
 * @fileoverview Feed Post Engagement Routes
 * @module @nxt1/backend/routes/feed
 *
 * POST /feed/posts/:id/share  — Increment stats.shares, bust timeline cache
 * POST /feed/posts/:id/view   — Fire-and-forget stats.views increment (204 response)
 *
 * These endpoints back the FEED_API_ENDPOINTS.POST_SHARE and .POST_VIEW
 * constants defined in @nxt1/core/posts.
 */

import { Router, type Request, type Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { optionalAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '@nxt1/core/errors/express';
import { logger } from '../utils/logger.js';
import { getCacheService } from '../services/cache.service.js';

const router = Router();

const POSTS_COLLECTION = 'Posts';

// ─── POST /feed/posts/:id/share ───────────────────────────────────────────────

/**
 * Increment stats.shares on a Firestore Post document.
 * Optionally authenticated — records the sharer's UID if provided.
 * Busts the post author's timeline cache so the updated count is reflected
 * immediately on the next timeline load.
 *
 * Response: { success: true, data: { shareCount: number } }
 */
router.post(
  '/posts/:id/share',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const db = req.firebase!.db;

    const postRef = db.collection(POSTS_COLLECTION).doc(id);
    const postDoc = await postRef.get();

    if (!postDoc.exists) {
      res.status(404).json({ success: false, error: 'Post not found' });
      return;
    }

    await postRef.update({ 'stats.shares': FieldValue.increment(1) });

    // Bust the post author's timeline cache so the new count is immediately visible
    const postData = postDoc.data()!;
    const authorId = postData['userId'] as string | undefined;
    if (authorId) {
      const cache = getCacheService();
      await cache.delByPrefix(`profile:sub:timeline:v2:${authorId}`);
    }

    // Read the updated document to return the exact current count
    const updatedDoc = await postRef.get();
    const shareCount =
      ((updatedDoc.data()!['stats'] as Record<string, unknown> | undefined)?.['shares'] as
        | number
        | undefined) ?? 0;

    logger.info('[Feed] Post share recorded', {
      postId: id,
      shareCount,
      sharerUid: req.user?.uid ?? 'anonymous',
    });

    res.json({ success: true, data: { shareCount } });
  })
);

// ─── POST /feed/posts/:id/view ────────────────────────────────────────────────

/**
 * Fire-and-forget view impression increment.
 * Responds with 204 immediately — the Firestore write happens in the background.
 * No authentication required (public content impression tracking).
 * The frontend IntersectionObserver ensures each card only fires this once per mount.
 */
router.post(
  '/posts/:id/view',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const db = req.firebase!.db;

    // Respond immediately — client doesn't wait for the write
    res.status(204).end();

    // Non-blocking background write
    db.collection(POSTS_COLLECTION)
      .doc(id)
      .update({ 'stats.views': FieldValue.increment(1) })
      .catch((err) =>
        logger.warn('[Feed] viewCount increment failed', { postId: id, error: err?.message })
      );
  })
);

export default router;
