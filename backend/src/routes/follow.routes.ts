/**
 * @fileoverview Follow Routes
 * @module @nxt1/backend/routes/follow
 *
 * Follow/unfollow with atomic Firestore transactions and push notifications.
 * - POST /                    → follow a user (dispatches new_follower notification)
 * - DELETE /                  → unfollow a user
 * - GET /followers/:userId    → paginated follower list
 * - GET /following/:userId    → paginated following list
 *
 * Data model: follows/{followerId}_{followingId} (FollowDoc in @nxt1/core)
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { appGuard } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { FollowUserDto, UnfollowUserDto } from '../dtos/social.dto.js';
import { dispatch } from '../services/notification.service.js';
import { getUserById } from '../services/users.service.js';
import { NOTIFICATION_TYPES } from '@nxt1/core';
import { logger } from '../utils/logger.js';

const router: ExpressRouter = Router();

const FOLLOWS_COLLECTION = 'follows';
const USERS_COLLECTION = 'Users';

/**
 * Returns a displayable name for a user fetched via users.service.
 * Falls back to 'Someone' for anonymous / missing users.
 */
function getDisplayName(user: { [key: string]: unknown } | null): string {
  if (!user) return 'Someone';
  const first = (user['firstName'] as string | undefined) ?? '';
  const last = (user['lastName'] as string | undefined) ?? '';
  const full = `${first} ${last}`.trim();
  return full || (user['displayName'] as string | undefined) || 'Someone';
}

// ============================================
// FOLLOW / UNFOLLOW
// ============================================

/**
 * Follow a user
 * POST /api/v1/follow
 * Body: { targetUserId: string }
 *
 * Atomic transaction:
 *   1. Creates follows/{followerId}_{targetUserId} doc (idempotent — no-op if exists)
 *   2. Increments follower.followingCount and target.followersCount
 * Dispatches new_follower notification to the followed user (fire-and-forget).
 */
router.post(
  '/',
  appGuard,
  validateBody(FollowUserDto),
  async (req: Request, res: Response): Promise<void> => {
    const followerId = req.user!.uid;
    const { targetUserId } = req.body as { targetUserId?: string };
    const db = req.firebase!.db;

    if (!targetUserId || typeof targetUserId !== 'string') {
      res.status(400).json({ success: false, error: 'targetUserId is required' });
      return;
    }

    if (followerId === targetUserId) {
      res.status(400).json({ success: false, error: 'Cannot follow yourself' });
      return;
    }

    const followRef = db.collection(FOLLOWS_COLLECTION).doc(`${followerId}_${targetUserId}`);
    const followerRef = db.collection(USERS_COLLECTION).doc(followerId);
    const followingRef = db.collection(USERS_COLLECTION).doc(targetUserId);

    let isNewFollow = false;

    await db.runTransaction(async (transaction) => {
      const followDoc = await transaction.get(followRef);
      if (followDoc.exists) return; // idempotent — already following

      transaction.set(followRef, {
        followerId,
        followingId: targetUserId,
        createdAt: Timestamp.now(),
      });
      transaction.update(followerRef, { followingCount: FieldValue.increment(1) });
      transaction.update(followingRef, { followersCount: FieldValue.increment(1) });
      isNewFollow = true;
    });

    logger.info('[Follow] User followed', { followerId, targetUserId, isNewFollow });

    // Send response immediately — transaction is committed, client is unblocked
    res.json({ success: true, data: { isFollowing: true } });

    // Fire-and-forget: notify the followed user after response is sent
    if (isNewFollow) {
      void (async () => {
        const follower = await getUserById(followerId, db);
        const displayName = getDisplayName(follower);
        await dispatch(db, {
          userId: targetUserId,
          type: NOTIFICATION_TYPES.NEW_FOLLOWER,
          title: `${displayName} started following you`,
          body: 'Tap to view their profile',
          source: {
            userId: followerId,
            userName: displayName,
            avatarUrl: (follower?.['profilePictureUrl'] as string | undefined) ?? undefined,
          },
        });
      })().catch((err) =>
        logger.error('[Follow] Failed to dispatch new_follower notification', { error: err })
      );
    }
  }
);

/**
 * Unfollow a user
 * DELETE /api/v1/follow
 * Body: { targetUserId: string }
 *
 * Atomic transaction: deletes follow doc, decrements both counters.
 * No notification dispatched on unfollow (standard platform behavior).
 */
router.delete(
  '/',
  appGuard,
  validateBody(UnfollowUserDto),
  async (req: Request, res: Response): Promise<void> => {
    const followerId = req.user!.uid;
    const { targetUserId } = req.body as { targetUserId?: string };
    const db = req.firebase!.db;

    if (!targetUserId || typeof targetUserId !== 'string') {
      res.status(400).json({ success: false, error: 'targetUserId is required' });
      return;
    }

    const followRef = db.collection(FOLLOWS_COLLECTION).doc(`${followerId}_${targetUserId}`);
    const followerRef = db.collection(USERS_COLLECTION).doc(followerId);
    const followingRef = db.collection(USERS_COLLECTION).doc(targetUserId);

    await db.runTransaction(async (transaction) => {
      const followDoc = await transaction.get(followRef);
      if (!followDoc.exists) return; // idempotent — not following

      transaction.delete(followRef);
      transaction.update(followerRef, { followingCount: FieldValue.increment(-1) });
      transaction.update(followingRef, { followersCount: FieldValue.increment(-1) });
    });

    logger.info('[Follow] User unfollowed', { followerId, targetUserId });

    res.json({ success: true, data: { isFollowing: false } });
  }
);

// ============================================
// FOLLOWER / FOLLOWING LISTS
// ============================================

/**
 * Get followers for user
 * GET /api/v1/follow/followers/:userId
 * Query: limit (max 100, default 20)
 */
router.get('/followers/:userId', appGuard, async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params as { userId: string };
  const db = req.firebase!.db;
  const limit = Math.min(parseInt(String(req.query['limit'] ?? 20)) || 20, 100);

  const snapshot = await db
    .collection(FOLLOWS_COLLECTION)
    .where('followingId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  const followerIds = snapshot.docs.map((doc) => doc.data()['followerId'] as string);

  res.json({ success: true, data: { followerIds, total: snapshot.size } });
});

/**
 * Get following for user
 * GET /api/v1/follow/following/:userId
 * Query: limit (max 100, default 20)
 */
router.get('/following/:userId', appGuard, async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params as { userId: string };
  const db = req.firebase!.db;
  const limit = Math.min(parseInt(String(req.query['limit'] ?? 20)) || 20, 100);

  const snapshot = await db
    .collection(FOLLOWS_COLLECTION)
    .where('followerId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  const followingIds = snapshot.docs.map((doc) => doc.data()['followingId'] as string);

  res.json({ success: true, data: { followingIds, total: snapshot.size } });
});

export default router;
