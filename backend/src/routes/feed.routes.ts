/**
 * @fileoverview Feed Routes
 * @module @nxt1/backend/routes/feed
 *
 * Feed API routes matching FEED_API_ENDPOINTS from @nxt1/core/feed/constants.
 * Mounted at /api/v1/feed in index.ts.
 *
 * Caching Strategy:
 * - GET /          : SHORT_TTL (first page only, cursor-based pages are not cached)
 * - GET /users/:uid: To be implemented
 * - GET /teams/:teamCode: To be implemented
 *
 * NOTE: Post CRUD (create, delete, edit) lives in posts.routes.ts (/api/v1/posts).
 * The /posts/* routes here are intentionally absent — post actions (like, comment)
 * are served from posts.routes.ts at /api/v1/posts/:id/... until a dedicated
 * migration to /api/v1/feed/posts/:id/... is completed.
 */

import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { optionalAuth } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';
import { validationError } from '@nxt1/core/errors';
import {
  PostVisibility,
  POSTS_COLLECTIONS,
  POSTS_CACHE_PREFIX,
  POSTS_CACHE_TTL,
} from '@nxt1/core/constants';
import type { GetFeedQuery, FeedCursor, FeedPost, FeedItem, FeedAuthor } from '@nxt1/core/feed';
import { feedPostToFeedItem } from '@nxt1/core/feed';
import { getCacheService } from '../services/cache.service.js';
import type { FirestorePostDoc, UserProfile } from '../adapters/firestore-posts.adapter.js';
import {
  firestorePostToFeedPost,
  userProfileToFeedAuthor,
} from '../adapters/firestore-posts.adapter.js';
import { createTimelineService } from '../services/timeline.service.js';
import type { Firestore } from 'firebase-admin/firestore';

const router: ExpressRouter = Router();

const CACHE_TTL_FEED = POSTS_CACHE_TTL.FEED;

// ============================================
// HELPERS (shared with posts.routes.ts)
// ============================================

function buildFeedCacheKey(
  visibility: PostVisibility,
  teamId: string | undefined,
  limit: number
): string {
  return `${POSTS_CACHE_PREFIX}feed:${visibility}:${teamId || 'all'}:${limit}`;
}

function buildNextCursor(posts: FeedPost[]): string | undefined {
  if (posts.length === 0) return undefined;
  const last = posts[posts.length - 1];
  return Buffer.from(
    JSON.stringify({ lastCreatedAt: last.createdAt, lastPostId: last.id })
  ).toString('base64');
}

async function batchGetUsersInfo(
  db: Firestore,
  userIds: string[]
): Promise<
  Map<string, { displayName: string; photoURL?: string; position?: string; schoolName?: string }>
> {
  if (userIds.length === 0) return new Map();
  const map = new Map();
  for (let i = 0; i < userIds.length; i += 10) {
    const chunk = userIds.slice(i, i + 10);
    const snap = await db.collection('Users').where('__name__', 'in', chunk).get();
    snap.docs.forEach((doc) => {
      const d = doc.data();
      map.set(doc.id, {
        displayName: d['displayName'] || 'Unknown User',
        photoURL: d['photoURL'],
        position: d['position'],
        schoolName: d['schoolName'],
      });
    });
  }
  return map;
}

async function enrichPostsWithMetadata(
  posts: Array<{ id: string; data: FirestorePostDoc }>,
  db: Firestore,
  currentUserId?: string
): Promise<FeedPost[]> {
  if (posts.length === 0) return [];
  const userIds = [...new Set(posts.map((p) => p.data.userId))];
  const usersMap = await batchGetUsersInfo(db, userIds);

  return Promise.all(
    posts.map(async (post) => {
      const authorInfo = usersMap.get(post.data.userId);
      const userProfile: UserProfile = {
        uid: post.data.userId,
        displayName: authorInfo?.displayName ?? 'Unknown User',
        photoURL: authorInfo?.photoURL,
        position: authorInfo?.position,
        schoolName: authorInfo?.schoolName,
        isVerified: false,
      };
      const author = userProfileToFeedAuthor(userProfile);

      let isLiked = false;
      if (currentUserId) {
        const likeDoc = await db
          .collection(POSTS_COLLECTIONS.POST_LIKES)
          .doc(`${post.id}_${currentUserId}`)
          .get();
        isLiked = likeDoc.exists;
      }

      return firestorePostToFeedPost(post.id, post.data, author, {
        isLiked,
        isBookmarked: false,
        isReposted: false,
      });
    })
  );
}

// ============================================
// ROUTES
// ============================================

/**
 * Get main feed with cursor-based pagination.
 * GET /api/v1/feed
 * Query: visibility, teamId, limit, cursor
 */
router.get('/', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query as GetFeedQuery;
    const db = req.firebase!.db;
    const currentUserId = req.user?.uid;

    const visibility = (query.visibility?.toUpperCase() as PostVisibility) || PostVisibility.PUBLIC;
    const limit = Math.min(parseInt(String(query.limit || 20)) || 20, 50);
    const cursor = query.cursor as string | undefined;
    const teamId = query.teamId as string | undefined;

    if (!['PUBLIC', 'TEAM', 'PRIVATE'].includes(visibility)) {
      const error = validationError([
        {
          field: 'visibility',
          message: 'visibility must be PUBLIC, TEAM, or PRIVATE',
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
        feedCursor = JSON.parse(Buffer.from(cursor, 'base64').toString()) as FeedCursor;
      } catch {
        logger.warn('[Feed] Invalid cursor', { cursor });
      }
    }

    // Cache — first page only
    if (!feedCursor) {
      const cacheKey = buildFeedCacheKey(visibility, teamId, limit);
      const cache = getCacheService();
      const cached = await cache.get<FeedPost[]>(cacheKey);
      if (cached) {
        logger.debug('[Feed] Cache hit', { cacheKey });
        res.set('X-Cache-Status', 'HIT');
        res.json({
          success: true,
          data: cached,
          pagination: {
            page: 1,
            limit,
            total: cached.length,
            hasMore: cached.length === limit,
            nextCursor: buildNextCursor(cached),
          },
        });
        return;
      }
    }

    // Build query
    let queryRef = db
      .collection(POSTS_COLLECTIONS.POSTS)
      .where('deletedAt', '==', null)
      .where('visibility', '==', visibility) as FirebaseFirestore.Query;

    if (teamId) queryRef = queryRef.where('teamId', '==', teamId);
    queryRef = queryRef.orderBy('createdAt', 'desc');

    if (feedCursor) {
      const cursorDate = new Date(feedCursor.lastCreatedAt);
      queryRef = queryRef.startAfter(Timestamp.fromMillis(cursorDate.getTime()));
    }

    queryRef = queryRef.limit(limit + 1);

    const snapshot = await queryRef.get();
    const posts = snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as FirestorePostDoc,
    }));
    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;

    const enrichedPosts = await enrichPostsWithMetadata(resultPosts, db, currentUserId);

    // Cache first page
    if (!feedCursor) {
      const cacheKey = buildFeedCacheKey(visibility, teamId, limit);
      const cache = getCacheService();
      await cache.set(cacheKey, enrichedPosts, { ttl: CACHE_TTL_FEED });
    }

    res.set('X-Cache-Status', 'MISS');
    res.json({
      success: true,
      data: enrichedPosts,
      pagination: {
        page: feedCursor ? -1 : 1,
        limit,
        total: enrichedPosts.length,
        hasMore,
        nextCursor: buildNextCursor(enrichedPosts),
      },
    });
  } catch (error) {
    logger.error('[Feed] Failed to get feed', { error });
    res.status(500).json({ success: false, error: 'Failed to get feed' });
  }
});

/**
 * Get a specific user's public feed (polymorphic timeline).
 * GET /api/v1/feed/users/:uid
 * Proxies to the TimelineService for read-time assembly.
 */
router.get('/users/:uid', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = req.firebase!.db;
    const { uid } = req.params as { uid: string };
    const limit = Math.min(parseInt(String(req.query['limit'] || 20)) || 20, 50);
    const cursor = req.query['cursor'] as string | undefined;

    // Fetch user profile for author enrichment
    const userDoc = await db.collection('Users').doc(uid).get();
    if (!userDoc.exists) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    const userData = userDoc.data()!;
    const author = userProfileToFeedAuthor({
      uid,
      displayName: (userData['displayName'] as string) || 'Unknown User',
      photoURL: userData['photoURL'] as string | undefined,
      role: userData['role'] as string | undefined,
      sport: userData['sport'] as string | undefined,
      position: userData['position'] as string | undefined,
      schoolName: userData['schoolName'] as string | undefined,
      isVerified: userData['isVerified'] as boolean | undefined,
      profileCode: userData['profileCode'] as string | undefined,
      firstName: userData['firstName'] as string | undefined,
      lastName: userData['lastName'] as string | undefined,
      classYear: userData['classYear'] as string | undefined,
      schoolLogoUrl: userData['schoolLogoUrl'] as string | undefined,
    });

    const timelineService = createTimelineService(db);
    const result = await timelineService.getProfileTimeline(uid, author, {
      limit,
      viewerUserId: req.user?.uid,
      cursor,
    });

    res.json(result);
  } catch (error) {
    logger.error('[Feed] Failed to get user feed', { error });
    res.status(500).json({ success: false, error: 'Failed to get user feed' });
  }
});

/**
 * Get a team's polymorphic feed.
 * GET /api/v1/feed/teams/:teamCode
 * Query: limit, cursor
 *
 * Resolves teamCode → team document, queries Posts where teamId == team.id,
 * maps to FeedItem[], sorts chronologically, and paginates.
 */

router.get('/teams/:teamCode', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = req.firebase!.db;
    const { teamCode } = req.params as { teamCode: string };
    const limit = Math.min(parseInt(String(req.query['limit'] || 20)) || 20, 50);
    const cursor = req.query['cursor'] as string | undefined;

    // Resolve teamCode string → team document
    const teamCodeService = await import('../services/team-code.service.js');
    const { team: teamDoc } = await teamCodeService.getTeamCodeByCode(db, teamCode);

    if (!teamDoc) {
      res.status(404).json({ success: false, error: 'Team not found' });
      return;
    }

    // Build FeedAuthor from team data
    const teamId = teamDoc.id!;
    const teamAuthor: FeedAuthor = {
      uid: teamId,
      profileCode: teamDoc.slug || teamDoc.teamCode || teamId,
      displayName: teamDoc.teamName || teamDoc.teamCode || 'Unknown Team',
      firstName: teamDoc.teamName || '',
      lastName: '',
      avatarUrl: teamDoc.logoUrl || teamDoc.teamLogoImg,
      role: 'team' as const,
      verificationStatus: 'verified' as const,
      isVerified: true,
    };

    // Build Firestore query for team posts
    const fetchLimit = limit + 1;
    let query = db
      .collection(POSTS_COLLECTIONS.POSTS)
      .where('teamId', '==', teamId)
      .where('deletedAt', '==', null)
      .orderBy('createdAt', 'desc') as FirebaseFirestore.Query;

    if (cursor) {
      try {
        const cursorDate = new Date(Buffer.from(cursor, 'base64').toString());
        query = query.startAfter(Timestamp.fromMillis(cursorDate.getTime()));
      } catch {
        logger.warn('[Feed] Invalid team cursor', { cursor, teamCode });
      }
    }

    query = query.limit(fetchLimit);
    const snapshot = await query.get();

    const posts = snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as FirestorePostDoc,
    }));

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;

    // Map to FeedItem[] via existing mappers
    const items: FeedItem[] = resultPosts.map((post) => {
      const feedPost = firestorePostToFeedPost(post.id, post.data, teamAuthor);
      return feedPostToFeedItem(feedPost);
    });

    const nextCursor =
      items.length > 0
        ? Buffer.from(items[items.length - 1].createdAt).toString('base64')
        : undefined;

    logger.debug('[Feed] Team feed assembled', {
      teamCode,
      teamId: teamId,
      count: items.length,
      hasMore,
    });

    res.json({
      success: true,
      data: items,
      nextCursor: hasMore ? nextCursor : undefined,
      hasMore,
    });
  } catch (error) {
    logger.error('[Feed] Failed to get team feed', { error, teamCode: req.params['teamCode'] });
    res.status(500).json({ success: false, error: 'Failed to get team feed' });
  }
});

export default router;
