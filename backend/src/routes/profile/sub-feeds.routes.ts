/**
 * @fileoverview Profile — sub-feed routes.
 *
 * GET /:userId/timeline
 * GET /:userId/sports/:sportId/stats
 * GET /:userId/sports/:sportId/game-logs
 * GET /:userId/sports/:sportId/metrics
 * GET /:userId/news
 * GET /:userId/rankings
 * GET /:userId/scout-reports
 * GET /:userId/videos
 * GET /:userId/schedule
 * GET /:userId/recruiting
 */

import { Router, type Request, type Response } from 'express';
import { optionalAuth } from '../../middleware/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import { getCacheService } from '../../services/cache.service.js';
import { markCacheHit } from '../../middleware/cache-status.middleware.js';
import { asyncHandler } from '@nxt1/core/errors/express';
import { createTimelineService } from '../../services/timeline.service.js';
import {
  userProfileToFeedAuthor,
  type UserProfile as PostsUserProfile,
} from '../../adapters/firestore-posts.adapter.js';
import type { FeedItemResponse } from '@nxt1/core/feed';
import { USERS_COLLECTION, PLAYER_STATS_COLLECTION, CACHE_TTL } from './shared.js';

const router = Router();

// ─── GET /:userId/timeline ────────────────────────────────────────────────────

router.get(
  '/:userId/timeline',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const limit = Math.min(50, parseInt(String(req.query['limit'] ?? '20'), 10));
    const sportId = req.query['sportId'] ? String(req.query['sportId']) : null;
    const cursor = req.query['cursor'] ? String(req.query['cursor']) : undefined;

    const cache = getCacheService();
    const cacheKey = `profile:sub:timeline:v2:${userId}${sportId ? `:${sportId}` : ''}:${limit}${cursor ? `:${cursor}` : ''}`;

    if (!cursor) {
      const hit = await cache.get<FeedItemResponse>(cacheKey);
      if (hit) {
        markCacheHit(req, 'redis', cacheKey);
        res.json(hit);
        return;
      }
    }

    const db = req.firebase!.db;
    const userDoc = await db.collection(USERS_COLLECTION).doc(userId).get();
    if (!userDoc.exists) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const userData = userDoc.data()!;
    const authorProfile: PostsUserProfile = {
      uid: userId,
      displayName: (userData['displayName'] as string) || 'Unknown User',
      firstName: userData['firstName'] as string | undefined,
      lastName: userData['lastName'] as string | undefined,
      photoURL: userData['photoURL'] as string | undefined,
      role: userData['role'] as string | undefined,
      sport: userData['sport'] as string | undefined,
      position: userData['position'] as string | undefined,
      schoolName: userData['schoolName'] as string | undefined,
      schoolLogoUrl: userData['schoolLogoUrl'] as string | undefined,
      isVerified: userData['isVerified'] as boolean | undefined,
      verificationStatus: userData['verificationStatus'] as string | undefined,
      profileCode: userData['profileCode'] as string | undefined,
      classYear: userData['classYear'] as string | undefined,
    };
    const author = userProfileToFeedAuthor(authorProfile);

    const timelineService = createTimelineService(db);
    const result = await timelineService.getProfileTimeline(userId, author, {
      limit,
      sportId: sportId ?? undefined,
      viewerUserId: req.user?.uid,
      cursor,
    });

    if (!cursor) {
      await cache.set(cacheKey, result, { ttl: CACHE_TTL.FEED });
    }

    res.json(result);
  })
);

// ─── GET /:userId/sports/:sportId/stats ───────────────────────────────────────

router.get(
  '/:userId/sports/:sportId/stats',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, sportId } = req.params as { userId: string; sportId: string };
    const limit = Math.min(100, parseInt(String(req.query['limit'] ?? '50'), 10));

    const cache = getCacheService();
    const cacheKey = `profile:sub:stats:${userId}:${sportId}`;
    const hit = await cache.get<unknown[]>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: hit });
      return;
    }

    const db = req.firebase!.db;
    const snap = await db
      .collection(PLAYER_STATS_COLLECTION)
      .where('userId', '==', userId)
      .where('sportId', '==', sportId.toLowerCase())
      .get();

    const stats = snap.docs
      .flatMap((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const season = data['season'] as string | undefined;
        const source = data['source'] as string | undefined;
        const verified = data['verified'] as boolean | undefined;
        const entries = Array.isArray(data['stats']) ? data['stats'] : [];

        return entries.map((entry, index) => {
          const stat = entry as Record<string, unknown>;
          return {
            id: (stat['id'] as string | undefined) ?? `${doc.id}_${index}`,
            ...stat,
            ...(season ? { season } : {}),
            ...(source ? { source } : {}),
            ...(verified !== undefined && stat['verified'] === undefined ? { verified } : {}),
          };
        });
      })
      .sort((a, b) => String(b['season'] ?? '').localeCompare(String(a['season'] ?? '')))
      .slice(0, limit);

    await cache.set(cacheKey, stats, { ttl: CACHE_TTL.STATS });
    res.json({ success: true, data: stats });
  })
);

// ─── GET /:userId/sports/:sportId/game-logs ───────────────────────────────────

router.get(
  '/:userId/sports/:sportId/game-logs',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, sportId } = req.params as { userId: string; sportId: string };

    const cache = getCacheService();
    const cacheKey = `profile:sub:gamelogs:${userId}:${sportId}`;
    const hit = await cache.get<unknown[]>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: hit });
      return;
    }

    const db = req.firebase!.db;
    const snap = await db
      .collection(PLAYER_STATS_COLLECTION)
      .where('userId', '==', userId)
      .where('sportId', '==', sportId.toLowerCase())
      .get();

    const gameLogs = snap.docs
      .flatMap((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return Array.isArray(data['gameLogs']) ? data['gameLogs'] : [];
      })
      .sort((a, b) => {
        const sa = String((a as Record<string, unknown>)['season'] ?? '');
        const sb = String((b as Record<string, unknown>)['season'] ?? '');
        return sb.localeCompare(sa);
      });

    await cache.set(cacheKey, gameLogs, { ttl: CACHE_TTL.STATS });
    res.json({ success: true, data: gameLogs });
  })
);

// ─── GET /:userId/sports/:sportId/metrics ─────────────────────────────────────

router.get(
  '/:userId/sports/:sportId/metrics',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, sportId } = req.params as { userId: string; sportId: string };
    const limit = Math.min(100, parseInt(String(req.query['limit'] ?? '50'), 10));

    const cache = getCacheService();
    const cacheKey = `profile:metrics:${userId}:${sportId}`;
    const hit = await cache.get<unknown[]>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: hit });
      return;
    }

    const db = req.firebase!.db;
    const snap = await db
      .collection('PlayerMetrics')
      .where('userId', '==', userId)
      .where('sportId', '==', sportId)
      .orderBy('dateRecorded', 'desc')
      .limit(limit)
      .get();

    const metrics = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    await cache.set(cacheKey, metrics, { ttl: CACHE_TTL.STATS });
    res.json({ success: true, data: metrics });
  })
);

// ─── GET /:userId/news ────────────────────────────────────────────────────────

router.get(
  '/:userId/news',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const limit = Math.min(50, parseInt(String(req.query['limit'] ?? '20'), 10));
    const sportId = req.query['sportId'] ? String(req.query['sportId']) : null;

    const cache = getCacheService();
    const cacheKey = `profile:sub:news:${userId}${sportId ? `:${sportId}` : ''}:${limit}`;
    const hit = await cache.get<unknown[]>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: hit });
      return;
    }

    const db = req.firebase!.db;
    let query = db.collection('News').where('userId', '==', userId) as FirebaseFirestore.Query;
    if (sportId) query = query.where('sportId', '==', sportId);
    query = query.orderBy('publishedAt', 'desc').limit(limit);

    const snap = await query.get();
    const articles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    await cache.set(cacheKey, articles, { ttl: CACHE_TTL.FEED });
    res.json({ success: true, data: articles });
  })
);

// ─── GET /:userId/rankings ────────────────────────────────────────────────────

router.get(
  '/:userId/rankings',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const limit = Math.min(50, parseInt(String(req.query['limit'] ?? '20'), 10));
    const sportId = req.query['sportId'] ? String(req.query['sportId']) : null;

    const cache = getCacheService();
    const cacheKey = `profile:sub:rankings:${userId}${sportId ? `:${sportId}` : ''}`;
    const hit = await cache.get<unknown[]>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: hit });
      return;
    }

    const db = req.firebase!.db;
    let query = db.collection('Rankings').where('userId', '==', userId) as FirebaseFirestore.Query;
    if (sportId) query = query.where('sportId', '==', sportId);
    query = query.limit(limit);

    const snap = await query.get();
    const rankings = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const aRank = (a['nationalRank'] as number | null) ?? Infinity;
        const bRank = (b['nationalRank'] as number | null) ?? Infinity;
        if (aRank !== bRank) return aRank - bRank;
        // Tiebreaker: most recently published first
        const aDate = new Date(String(a['publishedAt'] ?? '')).getTime();
        const bDate = new Date(String(b['publishedAt'] ?? '')).getTime();
        return bDate - aDate;
      });

    await cache.set(cacheKey, rankings, { ttl: CACHE_TTL.RANKINGS });
    res.json({ success: true, data: rankings });
  })
);

// ─── GET /:userId/scout-reports ───────────────────────────────────────────────

router.get(
  '/:userId/scout-reports',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const limit = Math.min(50, parseInt(String(req.query['limit'] ?? '20'), 10));
    const sportId = req.query['sportId'] ? String(req.query['sportId']) : null;

    const cache = getCacheService();
    const cacheKey = `profile:sub:scout-reports:${userId}${sportId ? `:${sportId}` : ''}`;
    const hit = await cache.get<unknown[]>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: hit });
      return;
    }

    const db = req.firebase!.db;
    let query = db
      .collection('ScoutReports')
      .where('userId', '==', userId) as FirebaseFirestore.Query;
    if (sportId) query = query.where('sportId', '==', sportId);
    query = query.orderBy('publishedAt', 'desc').limit(limit);

    const snap = await query.get();
    const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    await cache.set(cacheKey, reports, { ttl: CACHE_TTL.STATS });
    res.json({ success: true, data: reports });
  })
);

// ─── GET /:userId/videos ──────────────────────────────────────────────────────

router.get(
  '/:userId/videos',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const limit = Math.min(50, parseInt(String(req.query['limit'] ?? '20'), 10));
    const sportId = req.query['sportId'] ? String(req.query['sportId']) : null;

    const cache = getCacheService();
    const cacheKey = `profile:videos:${userId}${sportId ? `:${sportId}` : ''}:${limit}`;
    const hit = await cache.get<unknown[]>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: hit });
      return;
    }

    const db = req.firebase!.db;
    let query = db
      .collection('Posts')
      .where('userId', '==', userId)
      .where('type', '==', 'highlight') as FirebaseFirestore.Query;
    if (sportId) query = query.where('sportId', '==', sportId);
    query = query.orderBy('createdAt', 'desc').limit(limit);

    const snap = await query.get();
    const videos = snap.docs.map((d) => {
      const data = d.data();
      const playback =
        data['playback'] && typeof data['playback'] === 'object'
          ? (data['playback'] as Record<string, unknown>)
          : null;

      return {
        id: d.id,
        ...data,
        createdAt:
          typeof data['createdAt']?.['toDate'] === 'function'
            ? data['createdAt'].toDate().toISOString()
            : (data['createdAt'] as string | undefined),
        updatedAt:
          typeof data['updatedAt']?.['toDate'] === 'function'
            ? data['updatedAt'].toDate().toISOString()
            : (data['updatedAt'] as string | undefined),
        mediaUrl:
          (data['mediaUrl'] as string | undefined) ??
          (data['videoUrl'] as string | undefined) ??
          (playback?.['iframeUrl'] as string | undefined) ??
          (playback?.['hlsUrl'] as string | undefined),
        thumbnailUrl:
          (data['thumbnailUrl'] as string | undefined) ??
          (data['poster'] as string | undefined) ??
          (data['previewUrl'] as string | undefined),
        duration:
          (data['duration'] as number | undefined) ??
          (data['durationSeconds'] as number | undefined) ??
          undefined,
      };
    });

    await cache.set(cacheKey, videos, { ttl: CACHE_TTL.POSTS });
    res.json({ success: true, data: videos });
  })
);

// ─── GET /:userId/schedule ────────────────────────────────────────────────────

router.get(
  '/:userId/schedule',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const limit = Math.min(100, parseInt(String(req.query['limit'] ?? '50'), 10));
    const sportId = req.query['sportId'] as string | undefined;

    const cache = getCacheService();
    const cacheKey = `profile:sub:schedule:${userId}${sportId ? `:${sportId}` : ''}`;
    const hit = await cache.get<unknown[]>(cacheKey);
    if (hit) {
      markCacheHit(req, 'redis', cacheKey);
      res.json({ success: true, data: hit });
      return;
    }

    const db = req.firebase!.db;
    let query = db
      .collection('Events')
      .where('userId', '==', userId)
      .where('ownerType', '==', 'user')
      .orderBy('date', 'asc')
      .limit(limit) as FirebaseFirestore.Query;
    if (sportId) {
      query = query.where('sport', '==', sportId.toLowerCase()) as FirebaseFirestore.Query;
    }

    const snap = await query.get();
    const events = snap.docs.map((d) => {
      const data = d.data();
      let eventType = data['eventType'] as string;
      if (eventType === 'tournament' || eventType === 'tryout') eventType = 'other';

      return {
        id: d.id,
        type: eventType,
        name: data['title'] || 'Untitled Event',
        description: data['description'],
        location: data['location'],
        startDate: data['date'],
        endDate: data['endDate'],
        isAllDay: data['isAllDay'],
        url: data['url'],
        opponent: data['opponent'],
        result: data['result'],
        logoUrl: data['logoUrl'],
        graphicUrl: data['graphicUrl'],
        sport: data['sport'],
      };
    });

    logger.debug('[Profile] Schedule events fetched', {
      userId,
      count: events.length,
      types: events.map((e) => e.type),
      sportFilter: sportId,
    });

    await cache.set(cacheKey, events, { ttl: CACHE_TTL.FEED });
    res.json({ success: true, data: events });
  })
);

// ─── GET /:userId/recruiting ──────────────────────────────────────────────────

router.get(
  '/:userId/recruiting',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const sportId = (req.query['sportId'] as string) || null;
    const limit = parseInt((req.query['limit'] as string) || '50', 10);

    const cacheKey = sportId
      ? `profile:${userId}:recruiting:${sportId}`
      : `profile:${userId}:recruiting:all`;

    const cache = getCacheService();
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug('[Profile] Recruiting activities cache hit', { userId, sportId });
      res.json({ success: true, data: cached });
      return;
    }

    const db = req.firebase!.db;
    let query = db
      .collection('Recruiting')
      .where('userId', '==', userId)
      .where('ownerType', '==', 'user')
      .orderBy('date', 'desc')
      .limit(limit) as FirebaseFirestore.Query;
    if (sportId) {
      query = query.where('sport', '==', sportId.toLowerCase()) as FirebaseFirestore.Query;
    }

    const snap = await query.get();
    const activities = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        category: data['category'],
        collegeId: data['collegeId'],
        collegeName: data['collegeName'],
        division: data['division'],
        conference: data['conference'],
        city: data['city'],
        state: data['state'],
        sport: data['sport'],
        scholarshipType: data['scholarshipType'],
        visitType: data['visitType'],
        date: data['date'],
        endDate: data['endDate'],
        coachName: data['coachName'],
        coachTitle: data['coachTitle'],
        notes: data['notes'],
        source: data['source'],
        verified: data['verified'],
        createdAt: data['createdAt'],
        updatedAt: data['updatedAt'],
      };
    });

    logger.debug('[Profile] Recruiting activities fetched', {
      userId,
      count: activities.length,
      categories: activities.map((a) => a.category),
      sportFilter: sportId,
    });

    await cache.set(cacheKey, activities, { ttl: CACHE_TTL.FEED });
    res.json({ success: true, data: activities });
  })
);

export default router;
