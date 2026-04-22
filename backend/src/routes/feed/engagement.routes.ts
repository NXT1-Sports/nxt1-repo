/**
 * @fileoverview Universal Feed Item Engagement Routes
 * @module @nxt1/backend/routes/engagement
 *
 * POST /engagement/:id/view   — Fire-and-forget view impression increment (204)
 * POST /engagement/:id/share  — Increment share count, bust author timeline cache
 *
 * Uses a dedicated `Engagement` Firestore collection keyed by feed item ID.
 * This is intentionally collection-agnostic: the same endpoints serve Posts,
 * Events, Stats, Recruiting, and any future feed item types — no per-type routing.
 *
 * Feed item IDs are unique across all source collections because non-post items
 * carry a type prefix (e.g. "event-abc", "stat-xyz") while posts use their raw
 * Firestore document ID.
 *
 * The timeline service does a single batched read of Engagement docs after
 * assembly and merges counts into every FeedItem.
 */

import { Router, type Request, type Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { optionalAuth } from '../../middleware/auth/auth.middleware.js';
import { asyncHandler } from '@nxt1/core/errors/express';
import { logger } from '../../utils/logger.js';
import { getCacheService } from '../../services/core/cache.service.js';
import { getAnalyticsLoggerService } from '../../services/core/analytics-logger.service.js';

const router = Router();

/** Firestore collection that stores per-item engagement counters */
const ENGAGEMENT_COLLECTION = 'Engagement';

/**
 * Resolve the post author's userId from either the Posts collection (for raw
 * post IDs) or skip cache-busting for prefixed item IDs (events, stats, etc.)
 * that do not have a dedicated author cache key.
 */
async function resolveAuthorId(
  db: FirebaseFirestore.Firestore,
  itemId: string
): Promise<string | null> {
  // Prefixed IDs (event-*, stat-*, recruiting-*, etc.) are not in Posts
  if (/^[a-z]+-/.test(itemId)) return null;

  try {
    const postDoc = await db.collection('Posts').doc(itemId).get();
    if (!postDoc.exists) return null;
    return (postDoc.data()!['userId'] as string | undefined) ?? null;
  } catch {
    return null;
  }
}

// ─── POST /engagement/:id/view ────────────────────────────────────────────────

/**
 * Fire-and-forget view impression.
 * Responds 204 immediately; Firestore write is non-blocking.
 * Uses set+merge so the document is auto-created on first view.
 */
router.post(
  '/:id/view',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const db = req.firebase!.db;

    // Respond immediately — never block the client on a view write
    res.status(204).end();

    const viewerUserId = (req as Request & { user?: { uid?: string } }).user?.uid ?? null;

    db.collection(ENGAGEMENT_COLLECTION)
      .doc(id)
      .set({ views: FieldValue.increment(1) }, { merge: true })
      .catch((err) =>
        logger.warn('[Engagement] viewCount increment failed', {
          itemId: id,
          error: err?.message,
        })
      );

    // Mirror to MongoDB so Agent X analytics queries reflect live view counts
    if (viewerUserId) {
      void getAnalyticsLoggerService()
        .safeTrack({
          subjectId: viewerUserId,
          subjectType: 'user',
          domain: 'engagement',
          eventType: 'content_viewed',
          source: 'system',
          actorUserId: viewerUserId,
          sessionId: null,
          threadId: null,
          tags: ['feed_card', 'view'],
          payload: { itemId: id },
          metadata: { initiatedBy: 'engagement_route' },
        })
        .catch((err) =>
          logger.warn('[Engagement] analytics track view failed', {
            itemId: id,
            error: err?.message,
          })
        );
    }
  })
);

// ─── POST /engagement/:id/share ───────────────────────────────────────────────

/**
 * Increment share count and bust the author's timeline cache.
 * Returns the updated shareCount so the UI can reflect it immediately.
 *
 * Response: { success: true, data: { shareCount: number } }
 */
router.post(
  '/:id/share',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const db = req.firebase!.db;

    const engRef = db.collection(ENGAGEMENT_COLLECTION).doc(id);

    // Atomic increment — creates the doc if it does not yet exist
    await engRef.set({ shares: FieldValue.increment(1) }, { merge: true });

    // Bust the author's timeline cache so the new count is visible immediately
    const authorId = await resolveAuthorId(db, id);
    if (authorId) {
      const cache = getCacheService();
      await cache.delByPrefix(`profile:sub:timeline:v2:${authorId}`);
    }

    // Read current count to return to client
    const snap = await engRef.get();
    const data = snap.data() ?? {};
    const shareCount = (data['shares'] as number | undefined) ?? 1;

    logger.info('[Engagement] Share recorded', {
      itemId: id,
      shareCount,
      sharerUid: req.user?.uid ?? 'anonymous',
    });

    // Mirror to MongoDB so Agent X analytics queries reflect live share counts
    const sharerUserId = req.user?.uid ?? null;
    if (sharerUserId) {
      void getAnalyticsLoggerService()
        .safeTrack({
          subjectId: sharerUserId,
          subjectType: 'user',
          domain: 'engagement',
          eventType: 'content_shared',
          source: 'system',
          actorUserId: sharerUserId,
          sessionId: null,
          threadId: null,
          tags: ['feed_card', 'share'],
          payload: { itemId: id, shareCount },
          metadata: { initiatedBy: 'engagement_route' },
        })
        .catch((err) =>
          logger.warn('[Engagement] analytics track share failed', {
            itemId: id,
            error: err?.message,
          })
        );
    }

    res.json({ success: true, data: { shareCount } });
  })
);

export default router;
