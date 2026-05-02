/**
 * Feed — single post lookup
 * GET /:postId  — No auth required for public posts.
 */
import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '@nxt1/core/errors/express';
import { logger } from '../../utils/logger.js';
import { getCacheService, CACHE_TTL } from '../../services/core/cache.service.js';
import { markCacheHit } from '../../middleware/cache/cache-status.middleware.js';
import { optionalAuth } from '../../middleware/auth/auth.middleware.js';
import {
  firestorePostToFeedPost,
  userProfileToFeedAuthor,
  type FirestorePostDoc,
  type UserProfile as PostsUserProfile,
} from '../../adapters/firestore-posts.adapter.js';

const router = Router();
const POSTS_COLLECTION = 'Posts';
const USERS_COLLECTION = 'Users';

function isFirestorePostDoc(value: unknown): value is FirestorePostDoc {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record['userId'] === 'string' &&
    typeof record['content'] === 'string' &&
    typeof record['type'] === 'string' &&
    typeof record['visibility'] === 'string' &&
    record['createdAt'] !== undefined &&
    record['updatedAt'] !== undefined &&
    typeof record['stats'] === 'object' &&
    record['stats'] !== null
  );
}

router.get(
  '/:postId',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const postId = typeof req.params['postId'] === 'string' ? req.params['postId'].trim() : '';
    if (!postId || postId.length > 128) {
      res.status(400).json({ success: false, error: 'Invalid postId' });
      return;
    }

    const cache = getCacheService();
    const cacheKey = `feed:post:${postId}`;
    const cached = await cache.get<object>(cacheKey);
    if (cached) {
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: cached });
      return;
    }

    const db = (req as any).firebase.db;

    const postDoc = await db.collection(POSTS_COLLECTION).doc(postId).get();
    if (!postDoc.exists) {
      res.status(404).json({ success: false, error: 'Post not found' });
      return;
    }

    const rawPostData = postDoc.data() as Record<string, unknown>;
    if (!isFirestorePostDoc(rawPostData)) {
      logger.warn('[posts] Invalid post document shape', { postId });
      res.status(500).json({ success: false, error: 'Post data is invalid' });
      return;
    }

    const postData = rawPostData;
    const visibility = postData['visibility'] as string | undefined;
    const requestingUid: string | null = (req as any).user?.uid ?? null;
    const ownerId = postData['userId'] as string | undefined;

    if (visibility && visibility !== 'public') {
      if (!requestingUid || requestingUid !== ownerId) {
        res.status(403).json({ success: false, error: 'Post is not public' });
        return;
      }
    }

    let authorProfile: PostsUserProfile = { uid: ownerId ?? postId, displayName: 'Athlete' };

    if (ownerId) {
      try {
        const userDoc = await db.collection(USERS_COLLECTION).doc(ownerId).get();
        if (userDoc.exists) {
          const u = userDoc.data() as Record<string, unknown>;
          const fn = String(u['firstName'] ?? '');
          const ln = String(u['lastName'] ?? '');
          authorProfile = {
            uid: ownerId,
            displayName: (u['displayName'] as string) || `${fn} ${ln}`.trim() || 'Athlete',
            firstName: u['firstName'] as string | undefined,
            lastName: u['lastName'] as string | undefined,
            photoURL: u['photoURL'] as string | undefined,
            role: u['role'] as string | undefined,
            sport: u['sport'] as string | undefined,
            position: u['position'] as string | undefined,
            schoolName: u['schoolName'] as string | undefined,
            schoolLogoUrl: u['schoolLogoUrl'] as string | undefined,
            isVerified: u['isVerified'] as boolean | undefined,
            verificationStatus: u['verificationStatus'] as string | undefined,
            profileCode: (u['unicode'] ?? u['profileCode']) as string | undefined,
            classYear: u['classYear'] as string | undefined,
          };
        }
      } catch (err) {
        logger.warn('[posts] Author fetch failed', { postId, ownerId, err });
      }
    }

    const author = userProfileToFeedAuthor(authorProfile);
    const feedPost = firestorePostToFeedPost(postId, postData, author);

    const videoMedia = feedPost.media.find((m) => m.type === 'video');
    const imageMedia = feedPost.media.find((m) => m.type === 'image');

    const postDetail = {
      id: feedPost.id,
      type: feedPost.type,
      title: (rawPostData['title'] as string | undefined) ?? undefined,
      body: feedPost.content ?? undefined,
      thumbnailUrl: videoMedia?.thumbnailUrl ?? imageMedia?.url ?? undefined,
      mediaUrl: videoMedia?.url ?? imageMedia?.url ?? undefined,
      iframeUrl: videoMedia?.iframeUrl ?? undefined,
      externalLink: ((postData['externalLinks'] as string[] | undefined) ?? [])[0] ?? undefined,
      shareCount: feedPost.engagement.shareCount,
      viewCount: feedPost.engagement.viewCount,
      duration: videoMedia?.duration ?? undefined,
      isPinned: feedPost.isPinned,
      createdAt: feedPost.createdAt,
      author: {
        displayName: author.displayName,
        username: author.profileCode,
        profileImg: author.avatarUrl,
      },
    };

    await cache.set(cacheKey, postDetail, { ttl: CACHE_TTL.FEED });
    res.json({ success: true, data: postDetail });
  })
);

export default router;
