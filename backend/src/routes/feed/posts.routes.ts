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
import { PostVisibility } from '@nxt1/core';

const router = Router();
const POSTS_COLLECTION = 'Posts';
const USERS_COLLECTION = 'Users';

function isFirestorePostDoc(value: unknown): value is FirestorePostDoc {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  // Only enforce fields that are truly required and non-nullable.
  // content → may be absent on media-only / video posts (normalised to '' below)
  // stats   → may be missing on older documents (normalised to defaults below)
  // visibility → may be absent; treated as 'public' when missing
  return typeof record['userId'] === 'string' && typeof record['type'] === 'string';
}

/**
 * Fill in safe defaults for optional Firestore fields that older or
 * media-only post documents may omit before passing to the adapter.
 */
function normalisePostDoc(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    content: typeof raw['content'] === 'string' ? raw['content'] : '',
    // Absent visibility defaults to PostVisibility.PUBLIC value
    visibility: typeof raw['visibility'] === 'string' ? raw['visibility'] : PostVisibility.PUBLIC,
    stats:
      raw['stats'] !== null && typeof raw['stats'] === 'object'
        ? raw['stats']
        : { shares: 0, views: 0 },
  };
}

router.get(
  '/:postId',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    type FeedRequest = Request & {
      firebase: { db: FirebaseFirestore.Firestore };
      user?: { uid?: string };
    };

    const feedReq = req as FeedRequest;
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

    const db = feedReq.firebase.db;

    const postDoc = await db.collection(POSTS_COLLECTION).doc(postId).get();
    if (!postDoc.exists) {
      res.status(404).json({ success: false, error: 'Post not found' });
      return;
    }

    const rawPostData = postDoc.data() as Record<string, unknown>;
    if (!isFirestorePostDoc(rawPostData)) {
      logger.warn('[posts] Post document missing required fields (userId/type)', { postId });
      res.status(500).json({ success: false, error: 'Post data is invalid' });
      return;
    }

    const postData = normalisePostDoc(rawPostData) as unknown as FirestorePostDoc;
    const visibility = postData.visibility;
    const requestingUid: string | null = feedReq.user?.uid ?? null;
    const ownerId = postData.userId;

    if (visibility && visibility !== PostVisibility.PUBLIC) {
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
      title: (rawPostData['title'] as string | undefined) ?? undefined, // rawPostData keeps extra fields not in FirestorePostDoc
      content: feedPost.content,
      body: feedPost.content ?? undefined,
      thumbnailUrl: videoMedia?.thumbnailUrl ?? imageMedia?.url ?? undefined,
      mediaUrl: videoMedia?.hlsUrl ?? videoMedia?.url ?? imageMedia?.url ?? undefined,
      iframeUrl: videoMedia?.iframeUrl ?? undefined,
      hlsUrl: videoMedia?.hlsUrl ?? undefined,
      cloudflareVideoId: videoMedia?.cloudflareVideoId ?? undefined,
      processingStatus: videoMedia?.processingStatus ?? undefined,
      externalLink: (postData.externalLinks ?? [])[0] ?? undefined,
      shareCount: feedPost.engagement.shareCount,
      viewCount: feedPost.engagement.viewCount,
      duration: videoMedia?.duration ?? undefined,
      isPinned: feedPost.isPinned,
      location: feedPost.location,
      media: feedPost.media,
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
