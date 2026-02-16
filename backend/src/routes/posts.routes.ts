/**
 * @fileoverview Posts Routes
 * @module @nxt1/backend/routes/posts
 *
 * Comprehensive post management routes for sports social platform.
 * Includes creation, editing, sharing, analytics, and moderation.
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { appGuard, optionalAuth } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';

// Import from @nxt1/core
import { validationError, notFoundError, forbiddenError } from '@nxt1/core/errors';
import {
  PostVisibility,
  POSTS_COLLECTIONS,
  POSTS_CACHE_PREFIX,
  POSTS_CACHE_TTL,
} from '@nxt1/core/constants';
import type {
  GetFeedQuery,
  GetCommentsQuery,
  FeedCursor,
  FeedPost,
  FeedComment,
} from '@nxt1/core/feed';
import {
  validateCreatePost,
  validateComment,
  sanitizeContent,
  extractHashtags,
  extractMentions,
} from '@nxt1/core/validation';
import { getCacheService } from '../services/cache.service.js';
import type {
  FirestorePostDoc,
  FirestoreCommentDoc,
  UserProfile,
} from '../adapters/firestore-posts.adapter.js';
import {
  firestorePostToFeedPost,
  firestoreCommentToFeedComment,
  userProfileToFeedAuthor,
  userProfileToCommentAuthor,
} from '../adapters/firestore-posts.adapter.js';

const router: ExpressRouter = Router();

// ============================================
// CACHE CONFIGURATION (from @nxt1/core)
// ============================================
const {
  FEED: CACHE_TTL_FEED,
  POST: CACHE_TTL_POST,
  COMMENTS: CACHE_TTL_COMMENTS,
} = POSTS_CACHE_TTL;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Build cache key for feed
 */
function buildFeedCacheKey(
  visibility: PostVisibility,
  teamId: string | undefined,
  limit: number
): string {
  return `${POSTS_CACHE_PREFIX}feed:${visibility}:${teamId || 'all'}:${limit}`;
}

/**
 * Build next cursor for pagination
 */
function buildNextCursor(posts: FeedPost[]): string | undefined {
  if (posts.length === 0) return undefined;

  const lastPost = posts[posts.length - 1];
  const cursor: FeedCursor = {
    lastCreatedAt: lastPost.createdAt,
    lastPostId: lastPost.id,
  };

  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

/**
 * Build comments cursor
 */
function buildCommentsCursor(comments: FeedComment[]): string | undefined {
  if (comments.length === 0) return undefined;

  const lastComment = comments[comments.length - 1];
  const cursor = {
    lastCreatedAt: lastComment.createdAt,
    lastCommentId: lastComment.id,
  };

  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

// ============================================
// DATABASE HELPER FUNCTIONS
// ============================================

/**
 * Batch get user info from Firestore
 */
async function batchGetUsersInfo(
  db: Firestore,
  userIds: string[]
): Promise<
  Map<string, { displayName: string; photoURL?: string; position?: string; schoolName?: string }>
> {
  if (userIds.length === 0) return new Map();

  const usersMap = new Map();
  const chunks = [];

  // Firestore 'in' queries support up to 10 values
  for (let i = 0; i < userIds.length; i += 10) {
    chunks.push(userIds.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    const usersSnapshot = await db.collection('users').where('__name__', 'in', chunk).get();
    usersSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      usersMap.set(doc.id, {
        displayName: data['displayName'] || 'Unknown User',
        photoURL: data['photoURL'],
        position: data['position'],
        schoolName: data['schoolName'],
      });
    });
  }

  return usersMap;
}

/**
 * Get single user info from Firestore
 */
async function getUserInfo(
  db: Firestore,
  userId: string
): Promise<{
  displayName: string;
  photoURL?: string;
  position?: string;
  schoolName?: string;
} | null> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return null;

  const data = userDoc.data();
  return {
    displayName: data?.['displayName'] || 'Unknown User',
    photoURL: data?.['photoURL'],
    position: data?.['position'],
    schoolName: data?.['schoolName'],
  };
}

/**
 * Check if user has liked a post
 */
async function hasUserLikedPost(db: Firestore, postId: string, userId: string): Promise<boolean> {
  const likeDoc = await db
    .collection(POSTS_COLLECTIONS.POST_LIKES)
    .doc(`${postId}_${userId}`)
    .get();
  return likeDoc.exists;
}

/**
 * Enrich posts with metadata (author info, isLiked) - converts to FeedPost
 */
async function enrichPostsWithMetadata(
  posts: Array<{ id: string; data: FirestorePostDoc }>,
  db: Firestore,
  currentUserId?: string
): Promise<FeedPost[]> {
  if (posts.length === 0) return [];

  // Get unique user IDs
  const userIds = [...new Set(posts.map((p) => p.data.userId))];

  // Batch get user info
  const usersMap = await batchGetUsersInfo(db, userIds);

  // Convert to FeedPost
  const feedPosts: FeedPost[] = await Promise.all(
    posts.map(async (post) => {
      const authorInfo = usersMap.get(post.data.userId);
      if (!authorInfo) {
        throw new Error(`User ${post.data.userId} not found`);
      }

      // Convert to UserProfile for adapter
      const userProfile: UserProfile = {
        uid: post.data.userId,
        displayName: authorInfo.displayName,
        photoURL: authorInfo.photoURL,
        position: authorInfo.position,
        schoolName: authorInfo.schoolName,
        isVerified: false,
      };

      const author = userProfileToFeedAuthor(userProfile);

      // Check if liked
      let isLiked = false;
      if (currentUserId) {
        isLiked = await hasUserLikedPost(db, post.id, currentUserId);
      }

      return firestorePostToFeedPost(post.id, post.data, author, {
        isLiked,
        isBookmarked: false,
        isReposted: false,
        isFollowingAuthor: false,
      });
    })
  );

  return feedPosts;
}

/**
 * Enrich comments with author info - converts to FeedComment
 */
async function enrichCommentsWithMetadata(
  comments: Array<{ id: string; data: FirestoreCommentDoc }>,
  db: Firestore
): Promise<FeedComment[]> {
  if (comments.length === 0) return [];

  const userIds = [...new Set(comments.map((c) => c.data.userId))];
  const usersMap = await batchGetUsersInfo(db, userIds);

  return Promise.all(
    comments.map(async (comment) => {
      const authorInfo = usersMap.get(comment.data.userId);
      if (!authorInfo) {
        throw new Error(`User ${comment.data.userId} not found`);
      }

      // Convert to UserProfile for adapter
      const userProfile: UserProfile = {
        uid: comment.data.userId,
        displayName: authorInfo.displayName,
        photoURL: authorInfo.photoURL,
        isVerified: false,
      };

      const author = userProfileToCommentAuthor(userProfile);

      // TODO: Check if user liked comment
      const isLiked = false;

      return firestoreCommentToFeedComment(comment.id, comment.data, author, isLiked);
    })
  );
}

/**
 * Invalidate feed caches
 */
async function invalidateFeedCaches(visibility: PostVisibility, teamId?: string): Promise<void> {
  const cache = getCacheService();
  const patterns = [
    `${POSTS_CACHE_PREFIX}feed:${visibility}:${teamId || 'all'}:*`,
    `${POSTS_CACHE_PREFIX}feed:${visibility}:*`,
  ];

  for (const pattern of patterns) {
    await cache.del(pattern);
  }
}

/**
 * Invalidate post cache
 */
async function invalidatePostCache(postId: string): Promise<void> {
  const cache = getCacheService();
  await cache.del(`${POSTS_CACHE_PREFIX}post:${postId}`);
}

/**
 * Invalidate comments cache
 */
async function invalidateCommentsCache(postId: string): Promise<void> {
  const cache = getCacheService();
  await cache.del(`${POSTS_CACHE_PREFIX}comments:${postId}:*`);
}

// ============================================
// FEED
// ============================================

/**
 * Get feed with pagination
 * GET /api/v1/posts/feed
 * Query params: visibility, teamId, limit, cursor
 */
router.get('/feed', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query as GetFeedQuery;
    const db = req.firebase!.db;
    const currentUserId = req.user?.uid;

    // Parse and validate query params
    const visibility = (query.visibility?.toUpperCase() as PostVisibility) || PostVisibility.PUBLIC;
    const limit = Math.min(parseInt(String(query.limit || 20)) || 20, 50);
    const cursor = query.cursor as string | undefined;
    const teamId = query.teamId as string | undefined;

    // Validate visibility
    if (!['PUBLIC', 'FOLLOWERS', 'TEAM', 'PRIVATE'].includes(visibility)) {
      const error = validationError([
        {
          field: 'visibility',
          message: 'visibility must be PUBLIC, FOLLOWERS, TEAM, or PRIVATE',
          rule: 'enum',
        },
      ]);
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    // Parse cursor
    let feedCursor: FeedCursor | undefined;
    if (cursor) {
      try {
        feedCursor = JSON.parse(Buffer.from(cursor, 'base64').toString());
      } catch {
        logger.warn('[Posts] Invalid cursor', { cursor });
      }
    }

    // Check cache (only for first page)
    if (!feedCursor) {
      const cacheKey = buildFeedCacheKey(visibility, teamId, limit);
      const cache = getCacheService();
      const cached = await cache.get<FeedPost[]>(cacheKey);

      if (cached) {
        logger.debug('[Posts] Feed cache hit', { cacheKey });
        res.set('X-Cache-Status', 'HIT');
        res.json({
          success: true,
          data: {
            posts: cached,
            nextCursor: buildNextCursor(cached),
            hasMore: cached.length === limit,
          },
          cached: true,
        });
        return;
      }
    }

    // Build Firestore query
    let queryRef = db
      .collection(POSTS_COLLECTIONS.POSTS)
      .where('deletedAt', '==', null)
      .where('visibility', '==', visibility);

    if (teamId) {
      queryRef = queryRef.where('teamId', '==', teamId);
    }

    queryRef = queryRef.orderBy('createdAt', 'desc');

    // Apply cursor
    if (feedCursor) {
      const cursorDate = new Date(feedCursor.lastCreatedAt);
      queryRef = queryRef.startAfter(Timestamp.fromMillis(cursorDate.getTime()));
    }

    queryRef = queryRef.limit(limit + 1); // Fetch one extra to check hasMore

    // Execute query
    const snapshot = await queryRef.get();
    const posts = snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as FirestorePostDoc,
    }));

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;

    // Enrich with metadata (converts to FeedPost)
    const enrichedPosts = await enrichPostsWithMetadata(resultPosts, db, currentUserId);

    // Cache first page only
    if (!feedCursor) {
      const cacheKey = buildFeedCacheKey(visibility, teamId, limit);
      const cache = getCacheService();
      await cache.set(cacheKey, enrichedPosts, { ttl: CACHE_TTL_FEED });
    }

    res.set('X-Cache-Status', 'MISS');
    res.json({
      success: true,
      data: {
        posts: enrichedPosts,
        nextCursor: buildNextCursor(enrichedPosts),
        hasMore,
      },
      cached: false,
    });
  } catch (error) {
    logger.error('[Posts] Failed to get feed', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get feed',
    });
  }
});

// ============================================
// POST CREATION & DRAFTS
// ============================================

/**
 * Get draft posts
 * GET /api/v1/posts/drafts
 */
router.get('/drafts', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Save draft
 * POST /api/v1/posts/drafts
 */
router.post('/drafts', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update draft
 * PUT /api/v1/posts/drafts/:id
 */
router.put('/drafts/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Delete draft
 * DELETE /api/v1/posts/drafts/:id
 */
router.delete('/drafts/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get XP preview for post
 * POST /api/v1/posts/xp-preview
 *
 * Calculate XP rewards before posting
 */
router.post('/xp-preview', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Upload media file
 * POST /api/v1/posts/media
 *
 * Handles file uploads (images, videos, highlights).
 * Expects multipart/form-data with file field.
 */
router.post('/media', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Create a new post
 * POST /api/v1/posts
 */
router.post('/', appGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = req.firebase!.db;
    const userId = req.user!.uid;

    // Validate request
    const validation = validateCreatePost(req.body);
    if (!validation.success) {
      const errorMessages =
        validation.errors?.map((e) => `${e.field}: ${e.message}`).join('; ') || 'Invalid input';
      const error = validationError([
        {
          field: 'body',
          message: errorMessages,
          rule: 'validation',
        },
      ]);
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    const request = validation.data!;

    // Sanitize content
    const sanitizedContent = sanitizeContent(request.content);

    // Extract hashtags and mentions if not provided
    const hashtags = extractHashtags(request.content);
    const mentions = extractMentions(request.content);

    // Process poll if exists
    let pollData: FirestorePostDoc['poll'] | undefined;
    if (request.poll) {
      pollData = {
        question: request.poll.question,
        options: [...request.poll.options],
        durationHours: request.poll.durationHours,
        endAt: Timestamp.fromMillis(Date.now() + request.poll.durationHours * 60 * 60 * 1000),
        votes: {},
      };
    }

    // Process scheduled date
    let scheduledTimestamp: Timestamp | undefined;
    if (request.scheduledFor) {
      scheduledTimestamp = Timestamp.fromDate(new Date(request.scheduledFor));
    }

    // Convert privacy to visibility (core uses 'privacy', backend uses 'visibility')
    const visibilityMap: Record<string, PostVisibility> = {
      public: PostVisibility.PUBLIC,
      followers: PostVisibility.FOLLOWERS,
      team: PostVisibility.TEAM,
      private: PostVisibility.PRIVATE,
    };
    const visibility = visibilityMap[request.privacy] || PostVisibility.PUBLIC;

    // Create post document
    const now = Timestamp.now();
    const postData: Omit<FirestorePostDoc, 'id'> = {
      userId,
      content: sanitizedContent,
      type: request.type,
      visibility,
      teamId: request.locationId, // locationId can be used as teamId
      images: [], // mediaIds would need to be resolved to URLs
      videoUrl: undefined,
      externalLinks: [],
      mentions,
      hashtags,
      location: request.locationId,
      poll: pollData,
      scheduledFor: scheduledTimestamp,
      isPinned: false,
      commentsDisabled: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: undefined,
      stats: {
        likes: 0,
        comments: 0,
        shares: 0,
        views: 0,
      },
    };

    const docRef = await db.collection(POSTS_COLLECTIONS.POSTS).add(postData);

    // Invalidate feed caches
    await invalidateFeedCaches(visibility);

    res.status(201).json({
      success: true,
      data: {
        postId: docRef.id,
      },
    });
  } catch (error) {
    logger.error('[Posts] Failed to create post', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to create post',
    });
  }
});

// ============================================
// POST MANAGEMENT
// ============================================

/**
 * Get post by ID
 * GET /api/v1/posts/:id
 */
router.get('/:id', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = req.firebase!.db;
    const postId = String(req.params['id']);
    const currentUserId = req.user?.uid;

    // Check cache first (only for non-authenticated)
    if (!currentUserId) {
      const cacheKey = `${POSTS_CACHE_PREFIX}post:${postId}`;
      const cache = getCacheService();
      const cached = await cache.get<FeedPost>(cacheKey);

      if (cached) {
        logger.debug('[Posts] Post cache hit', { postId });
        res.set('X-Cache-Status', 'HIT');
        res.json({
          success: true,
          data: cached,
          cached: true,
        });
        return;
      }
    }

    // Fetch from database
    const postDoc = await db.collection(POSTS_COLLECTIONS.POSTS).doc(postId).get();

    if (!postDoc.exists) {
      const error = notFoundError('post', postId);
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    const postData = postDoc.data() as FirestorePostDoc;

    if (postData.deletedAt) {
      const error = notFoundError('post', postId);
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    // Check if current user liked
    let isLiked = false;
    if (currentUserId) {
      isLiked = await hasUserLikedPost(db, postId, currentUserId);
    }

    // Get author info
    const authorInfo = await getUserInfo(db, postData.userId);
    if (!authorInfo) {
      const error = notFoundError('user', postData.userId);
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    // Convert to UserProfile for adapter
    const userProfile: UserProfile = {
      uid: postData.userId,
      displayName: authorInfo.displayName,
      photoURL: authorInfo.photoURL,
      position: authorInfo.position,
      schoolName: authorInfo.schoolName,
      isVerified: false,
    };

    const author = userProfileToFeedAuthor(userProfile);

    // Convert to FeedPost
    const result: FeedPost = firestorePostToFeedPost(postDoc.id, postData, author, {
      isLiked,
      isBookmarked: false,
      isReposted: false,
      isFollowingAuthor: false,
    });

    // Cache for non-authenticated requests
    if (!currentUserId) {
      const cacheKey = `${POSTS_CACHE_PREFIX}post:${postId}`;
      const cache = getCacheService();
      await cache.set(cacheKey, result, { ttl: CACHE_TTL_POST });
    }

    res.set('X-Cache-Status', 'MISS');
    res.json({
      success: true,
      data: result,
      cached: false,
    });
  } catch (error) {
    logger.error('[Posts] Failed to get post', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get post',
    });
  }
});

/**
 * Edit/Update post
 * PUT /api/v1/posts/:id
 *
 * Athletes can edit their posts (text, media, tags)
 */
router.put('/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Delete post
 * DELETE /api/v1/posts/:id
 */
router.delete('/:id', appGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = req.firebase!.db;
    const postId = String(req.params['id']);
    const userId = req.user!.uid;

    // Verify ownership
    const postDoc = await db.collection(POSTS_COLLECTIONS.POSTS).doc(postId).get();

    if (!postDoc.exists) {
      const error = notFoundError('post', postId);
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    const postData = postDoc.data() as FirestorePostDoc;

    if (postData.userId !== userId) {
      const error = forbiddenError('owner');
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    // Soft delete - set deletedAt timestamp
    await db.collection(POSTS_COLLECTIONS.POSTS).doc(postId).update({
      deletedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Invalidate caches
    await invalidateFeedCaches(postData.visibility, postData.teamId);
    await invalidatePostCache(postId);

    res.json({
      success: true,
      message: 'Post deleted successfully',
    });
  } catch (error) {
    logger.error('[Posts] Failed to delete post', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to delete post',
    });
  }
});

/**
 * Pin post to profile
 * POST /api/v1/posts/:id/pin
 *
 * Pin important posts to top of profile (max 3 pinned)
 */
router.post('/:id/pin', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Unpin post
 * DELETE /api/v1/posts/:id/pin
 */
router.delete('/:id/pin', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

// ============================================
// LIKES
// ============================================

/**
 * Like a post
 * POST /api/v1/posts/:id/like
 */
router.post('/:id/like', appGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = req.firebase!.db;
    const postId = String(req.params['id']);
    const userId = req.user!.uid;

    // Use Firestore transaction to atomically create like and increment counter
    await db.runTransaction(async (transaction) => {
      const likeRef = db.collection(POSTS_COLLECTIONS.POST_LIKES).doc(`${postId}_${userId}`);
      const postRef = db.collection(POSTS_COLLECTIONS.POSTS).doc(postId);

      const likeDoc = await transaction.get(likeRef);
      if (likeDoc.exists) {
        // Already liked, do nothing
        return;
      }

      // Create like document
      transaction.set(likeRef, {
        postId,
        userId,
        createdAt: Timestamp.now(),
      });

      // Increment likes count
      transaction.update(postRef, {
        'stats.likes': FieldValue.increment(1),
        updatedAt: Timestamp.now(),
      });
    });

    // Invalidate post cache
    await invalidatePostCache(postId);

    res.json({
      success: true,
      data: { success: true },
    });
  } catch (error) {
    logger.error('[Posts] Failed to like post', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to like post',
    });
  }
});

/**
 * Unlike a post
 * DELETE /api/v1/posts/:id/like
 */
router.delete('/:id/like', appGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = req.firebase!.db;
    const postId = String(req.params['id']);
    const userId = req.user!.uid;

    // Use Firestore transaction to atomically delete like and decrement counter
    await db.runTransaction(async (transaction) => {
      const likeRef = db.collection(POSTS_COLLECTIONS.POST_LIKES).doc(`${postId}_${userId}`);
      const postRef = db.collection(POSTS_COLLECTIONS.POSTS).doc(postId);

      const likeDoc = await transaction.get(likeRef);
      if (!likeDoc.exists) {
        // Not liked, do nothing
        return;
      }

      // Delete like document
      transaction.delete(likeRef);

      // Decrement likes count
      transaction.update(postRef, {
        'stats.likes': FieldValue.increment(-1),
        updatedAt: Timestamp.now(),
      });
    });

    // Invalidate post cache
    await invalidatePostCache(postId);

    res.json({
      success: true,
      data: { success: true },
    });
  } catch (error) {
    logger.error('[Posts] Failed to unlike post', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to unlike post',
    });
  }
});

// ============================================
// COMMENTS
// ============================================

/**
 * Create a comment on post
 * POST /api/v1/posts/:id/comments
 */
router.post('/:id/comments', appGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = req.firebase!.db;
    const postId = String(req.params['id']);
    const userId = req.user!.uid;

    // Validate comment
    const validation = validateComment(req.body.content);
    if (!validation.success) {
      const errorMessages = validation.errors?.map((e) => e.message).join('; ') || 'Invalid input';
      const error = validationError([
        {
          field: 'content',
          message: errorMessages,
          rule: 'validation',
        },
      ]);
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    const content = validation.data!.content;

    // Sanitize content
    const sanitizedContent = sanitizeContent(content);

    // Create comment document
    const now = Timestamp.now();
    const commentData: Omit<FirestoreCommentDoc, 'id'> = {
      postId,
      userId,
      content: sanitizedContent,
      createdAt: now,
      updatedAt: now,
      deletedAt: undefined,
    };

    // Use transaction to create comment and increment counter
    let commentId: string;
    await db.runTransaction(async (transaction) => {
      const commentRef = db.collection(POSTS_COLLECTIONS.POST_COMMENTS).doc();
      commentId = commentRef.id;
      const postRef = db.collection(POSTS_COLLECTIONS.POSTS).doc(postId);

      transaction.set(commentRef, commentData);
      transaction.update(postRef, {
        'stats.comments': FieldValue.increment(1),
        updatedAt: now,
      });
    });

    // Get author info
    const author = await getUserInfo(db, userId);

    // Invalidate caches
    await invalidatePostCache(postId);
    await invalidateCommentsCache(postId);

    res.status(201).json({
      success: true,
      data: {
        ...commentData,
        id: commentId!,
        userProfile: author || undefined,
      },
    });
  } catch (error) {
    logger.error('[Posts] Failed to create comment', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to create comment',
    });
  }
});

/**
 * Get comments for a post
 * GET /api/v1/posts/:id/comments
 */
router.get('/:id/comments', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = req.firebase!.db;
    const postId = String(req.params['id']);
    const query = req.query as GetCommentsQuery;

    const limit = Math.min(parseInt(String(query.limit || 20)) || 20, 100);
    const cursor = query.cursor as string | undefined;

    // Parse cursor
    let commentCursor: { lastCreatedAt: string; lastCommentId: string } | undefined;
    if (cursor) {
      try {
        commentCursor = JSON.parse(Buffer.from(cursor, 'base64').toString());
      } catch {
        logger.warn('[Posts] Invalid cursor', { cursor });
      }
    }

    // Check cache (only for first page)
    if (!commentCursor) {
      const cacheKey = `${POSTS_CACHE_PREFIX}comments:${postId}:${limit}`;
      const cache = getCacheService();
      const cached = await cache.get<FeedComment[]>(cacheKey);

      if (cached) {
        logger.debug('[Posts] Comments cache hit', { postId });
        res.set('X-Cache-Status', 'HIT');
        res.json({
          success: true,
          data: {
            comments: cached,
            nextCursor: buildCommentsCursor(cached),
            hasMore: cached.length === limit,
          },
          cached: true,
        });
        return;
      }
    }

    // Build Firestore query
    let queryRef = db
      .collection(POSTS_COLLECTIONS.POST_COMMENTS)
      .where('postId', '==', postId)
      .where('deletedAt', '==', null)
      .orderBy('createdAt', 'desc');

    // Apply cursor
    if (commentCursor) {
      const cursorDate = new Date(commentCursor.lastCreatedAt);
      queryRef = queryRef.startAfter(Timestamp.fromMillis(cursorDate.getTime()));
    }

    queryRef = queryRef.limit(limit + 1);

    // Execute query
    const snapshot = await queryRef.get();
    const comments = snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as FirestoreCommentDoc,
    }));

    const hasMore = comments.length > limit;
    const resultComments = hasMore ? comments.slice(0, limit) : comments;

    // Enrich with author info (converts to FeedComment)
    const enrichedComments = await enrichCommentsWithMetadata(resultComments, db);

    // Cache first page only
    if (!commentCursor) {
      const cacheKey = `${POSTS_CACHE_PREFIX}comments:${postId}:${limit}`;
      const cache = getCacheService();
      await cache.set(cacheKey, enrichedComments, { ttl: CACHE_TTL_COMMENTS });
    }

    res.set('X-Cache-Status', 'MISS');
    res.json({
      success: true,
      data: {
        comments: enrichedComments,
        nextCursor: buildCommentsCursor(enrichedComments),
        hasMore,
      },
      cached: false,
    });
  } catch (error) {
    logger.error('[Posts] Failed to get comments', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get comments',
    });
  }
});

/**
 * Delete a comment
 * DELETE /api/v1/posts/comments/:commentId
 */
router.delete(
  '/comments/:commentId',
  appGuard,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const db = req.firebase!.db;
      const commentId = String(req.params['commentId']);
      const userId = req.user!.uid;

      // Get comment to check ownership and postId
      const commentDoc = await db.collection(POSTS_COLLECTIONS.POST_COMMENTS).doc(commentId).get();

      if (!commentDoc.exists) {
        const error = notFoundError('comment', commentId);
        res.status(error.statusCode).json(error.toResponse());
        return;
      }

      const commentData = commentDoc.data() as FirestoreCommentDoc;

      if (commentData.userId !== userId) {
        const error = forbiddenError('owner');
        res.status(error.statusCode).json(error.toResponse());
        return;
      }

      // Use transaction to soft delete comment and decrement counter
      await db.runTransaction(async (transaction) => {
        const commentRef = db.collection(POSTS_COLLECTIONS.POST_COMMENTS).doc(commentId);
        const postRef = db.collection(POSTS_COLLECTIONS.POSTS).doc(commentData.postId);

        transaction.update(commentRef, {
          deletedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });

        transaction.update(postRef, {
          'stats.comments': FieldValue.increment(-1),
          updatedAt: Timestamp.now(),
        });
      });

      // Invalidate caches
      await invalidatePostCache(commentData.postId);
      await invalidateCommentsCache(commentData.postId);

      res.json({
        success: true,
        message: 'Comment deleted successfully',
      });
    } catch (error: any) {
      logger.error('[Posts] Failed to delete comment', { error });

      if (error.message === 'Comment not found') {
        const err = notFoundError('comment');
        res.status(err.statusCode).json(err.toResponse());
        return;
      }

      if (error.message === 'Not authorized to delete this comment') {
        const err = forbiddenError('owner');
        res.status(err.statusCode).json(err.toResponse());
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to delete comment',
      });
    }
  }
);

// ============================================
// POST SHARING & ENGAGEMENT
// ============================================

/**
 * Share/Repost
 * POST /api/v1/posts/:id/share
 *
 * Share another athlete's post with optional comment
 * Body: { comment?: string, privacy?: string }
 */
router.post('/:id/share', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get post shares
 * GET /api/v1/posts/:id/shares
 *
 * Get list of users who shared this post
 */
router.get('/:id/shares', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Remove share/repost
 * DELETE /api/v1/posts/:id/share
 */
router.delete('/:id/share', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

// ============================================
// POST ANALYTICS (Sports Specific)
// ============================================

/**
 * Get post analytics
 * GET /api/v1/posts/:id/analytics
 *
 * View stats: views, reach, engagement rate, demographics
 * Important for athletes to track their content performance
 */
router.get('/:id/analytics', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get post viewers
 * GET /api/v1/posts/:id/viewers
 *
 * See who viewed the post (especially for highlight reels)
 */
router.get('/:id/viewers', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Track post view
 * POST /api/v1/posts/:id/view
 *
 * Record when someone views a post (for analytics)
 */
router.post('/:id/view', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

// ============================================
// POST SCHEDULING
// ============================================

/**
 * Schedule post for later
 * POST /api/v1/posts/schedule
 *
 * Schedule posts for optimal times (e.g., game day announcements)
 * Body: { post: PostData, scheduledAt: string }
 */
router.post('/schedule', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get scheduled posts
 * GET /api/v1/posts/scheduled
 */
router.get('/scheduled', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update scheduled post
 * PUT /api/v1/posts/scheduled/:id
 */
router.put('/scheduled/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Cancel scheduled post
 * DELETE /api/v1/posts/scheduled/:id
 */
router.delete('/scheduled/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

// ============================================
// MODERATION & REPORTING
// ============================================

/**
 * Report post
 * POST /api/v1/posts/:id/report
 *
 * Report inappropriate content, spam, harassment
 * Body: { reason: string, details?: string }
 */
router.post('/:id/report', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Hide post from feed
 * POST /api/v1/posts/:id/hide
 *
 * Hide post without unfollowing the athlete
 */
router.post('/:id/hide', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Unhide post
 * DELETE /api/v1/posts/:id/hide
 */
router.delete('/:id/hide', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

// ============================================
// MENTIONS & TAGS
// ============================================

/**
 * Get posts mentioning user
 * GET /api/v1/posts/mentions
 *
 * Get all posts where current user is mentioned/tagged
 */
router.get('/mentions', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get tagged athletes in post
 * GET /api/v1/posts/:id/tags
 */
router.get('/:id/tags', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Add tags to post
 * POST /api/v1/posts/:id/tags
 *
 * Tag teammates after posting
 * Body: { athleteIds: string[] }
 */
router.post('/:id/tags', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Remove tag from post
 * DELETE /api/v1/posts/:id/tags/:athleteId
 */
router.delete('/:id/tags/:athleteId', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

// ============================================
// SPORTS-SPECIFIC: GAME STATS & HIGHLIGHTS
// ============================================

/**
 * Get game stats templates
 * GET /api/v1/posts/templates/stats
 *
 * Pre-built templates for posting game statistics
 */
router.get('/templates/stats', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Create post from game stats
 * POST /api/v1/posts/game-stats
 *
 * Create formatted post with game statistics
 * Body: { gameId: string, stats: GameStats, template?: string }
 */
router.post('/game-stats', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Link highlight to game
 * POST /api/v1/posts/:id/link-game
 *
 * Associate highlight video with specific game
 * Body: { gameId: string, quarter?: number, timestamp?: string }
 */
router.post('/:id/link-game', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get highlights by game
 * GET /api/v1/posts/game/:gameId/highlights
 *
 * Get all highlight posts for a specific game
 */
router.get('/game/:gameId/highlights', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

// ============================================
// COLLABORATION (Team Posts)
// ============================================

/**
 * Create collaborative post
 * POST /api/v1/posts/collab
 *
 * Create post that multiple athletes contribute to (e.g., team celebration)
 * Body: { post: PostData, collaborators: string[], permissions: CollabPermissions }
 */
router.post('/collab', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Invite collaborators to post
 * POST /api/v1/posts/:id/collab/invite
 *
 * Body: { athleteIds: string[] }
 */
router.post('/:id/collab/invite', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Accept collaboration invite
 * POST /api/v1/posts/:id/collab/accept
 */
router.post('/:id/collab/accept', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get collaborative posts
 * GET /api/v1/posts/collab
 */
router.get('/collab', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * Bulk delete posts
 * POST /api/v1/posts/bulk/delete
 *
 * Delete multiple posts at once
 * Body: { postIds: string[] }
 */
router.post('/bulk/delete', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Bulk change privacy
 * POST /api/v1/posts/bulk/privacy
 *
 * Body: { postIds: string[], privacy: string }
 */
router.post('/bulk/privacy', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
