/**
 * @fileoverview Seed Routes — Staging / Dev Only
 * @module @nxt1/backend/routes/seed
 *
 * Populates comprehensive test data into Firestore for a given user.
 * Uses batch writes for efficiency (max 500 ops/batch — auto-split).
 *
 * Endpoints:
 *   POST /api/v1/staging/seed/:userId          — seed ALL collections
 *   DELETE /api/v1/staging/seed/:userId        — wipe seeded data
 *
 * Requires: Bearer token (appGuard). Users can only seed their own data.
 * Available on /api/v1/staging/* only (registered separately in index.ts).
 */

import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { type Firestore, type WriteBatch } from 'firebase-admin/firestore';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import { notFoundError } from '@nxt1/core/errors';
import { logger } from '../utils/logger.js';
import type { SportProfile } from '@nxt1/core';
import { POSTS_COLLECTIONS } from '@nxt1/core/constants';
import { PROFILE_CACHE_KEYS } from '@nxt1/core';
import { getCacheService } from '../services/cache.service.js';
import {
  buildScheduleEvents,
  buildRecruitingActivities,
  buildVerifiedStats,
  buildVerifiedMetrics,
  buildBasketballStats,
  buildBasketballMetrics,
  buildBasketballScheduleEvents,
  buildBasketballRecruitingActivities,
  buildPosts,
  buildNewsArticles,
  buildFollows,
  buildRankings,
  buildScoutReports,
  buildVideos,
  buildDenormalizedSportUpdates,
} from '../utils/seed-factories.js';

const router: ExpressRouter = Router();

// ─── Cache helpers ────────────────────────────────────────────────────────────
async function bustProfileCache(
  userId: string,
  username?: string | null,
  unicode?: string | null
): Promise<void> {
  const cache = getCacheService();
  const keys: string[] = [`${PROFILE_CACHE_KEYS.BY_ID}${userId}`];
  if (username) keys.push(`${PROFILE_CACHE_KEYS.BY_USERNAME}${username.toLowerCase()}`);
  if (unicode) keys.push(`${PROFILE_CACHE_KEYS.BY_UNICODE}${unicode.toLowerCase()}`);
  await Promise.all(keys.map((k) => cache.del(k)));
  logger.debug('[Seed] Profile cache busted', { userId, keys: keys.length });
}

// ─── Collection names ─────────────────────────────────────────────────────────
const USERS_COL = 'Users';
const RANKINGS_COL = 'Rankings';
const NEWS_COL = 'News'; // top-level: News/{articleId}
const SCOUT_REPORTS_COL = 'ScoutReports'; // top-level: ScoutReports/{reportId}

// ─── Batch helper: auto-split into chunks of 499 ─────────────────────────────
async function commitBatches(
  db: Firestore,
  ops: Array<(batch: WriteBatch) => void>
): Promise<void> {
  const CHUNK = 499;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch();
    ops.slice(i, i + CHUNK).forEach((op) => op(batch));
    await batch.commit();
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────────
// All mock data factories live in ../utils/seed-factories.ts

router.post(
  '/:userId',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };

    const db = req.firebase!.db;
    const now = new Date().toISOString();

    // Build all seed data — football (sports[0])
    const scheduleEvents = buildScheduleEvents(userId);
    const recruitingActivities = buildRecruitingActivities(userId);
    const verifiedStats = buildVerifiedStats(userId);
    const verifiedMetrics = buildVerifiedMetrics(userId);

    // Build all seed data — basketball (sports[1])
    const bbStats = buildBasketballStats(userId);
    const bbMetrics = buildBasketballMetrics(userId);
    const bbScheduleEvents = buildBasketballScheduleEvents(userId);
    const bbRecruitingActivities = buildBasketballRecruitingActivities(userId);

    const posts = buildPosts(userId);
    const newsArticles = buildNewsArticles(userId);
    const follows = buildFollows(userId);
    const rankings = buildRankings(userId);
    const scoutReports = buildScoutReports(userId);
    const videos = buildVideos(userId);

    // Denormalized summaries for User doc sports[0]
    const { featuredStats, featuredMetrics } = buildDenormalizedSportUpdates(
      verifiedStats,
      verifiedMetrics,
      scheduleEvents
    );

    // Denormalized summaries for User doc sports[1] (basketball)
    const { featuredStats: bbFeaturedStats, featuredMetrics: bbFeaturedMetrics } =
      buildDenormalizedSportUpdates(bbStats, bbMetrics, bbScheduleEvents);

    const userRef = db.collection(USERS_COL).doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      sendError(res, notFoundError('user'));
      return;
    }

    const userData = userDoc.data() as {
      sports?: SportProfile[];
      username?: string;
      unicode?: string;
    };
    const sports: SportProfile[] = userData.sports ?? [];

    // ── Merge seed data into existing sports by NAME (not by index) ──────────
    // This ensures we never overwrite a basketball slot with football data,
    // even if the user registered with a non-standard sport order.
    const findSport = (name: string) =>
      sports.find((s) => s.sport.toLowerCase() === name.toLowerCase());

    const footballSport: SportProfile = findSport('football') ?? {
      sport: 'football',
      order: sports.length === 0 ? 0 : sports.length,
      accountType: 'athlete',
    };
    const basketballSport: SportProfile = findSport('basketball') ?? {
      sport: 'basketball',
      order: footballSport.order + 1,
      accountType: 'athlete',
      positions: ['Point Guard'],
    };

    const mergedFootball: SportProfile = {
      ...footballSport,
      verifiedStats,
      verifiedMetrics,
      upcomingEvents: scheduleEvents,
      recruitingActivities,
      featuredStats,
      featuredMetrics,
    } as SportProfile;

    const mergedBasketball: SportProfile = {
      ...basketballSport,
      verifiedStats: bbStats,
      verifiedMetrics: bbMetrics,
      upcomingEvents: bbScheduleEvents,
      recruitingActivities: bbRecruitingActivities,
      featuredStats: bbFeaturedStats,
      featuredMetrics: bbFeaturedMetrics,
    } as SportProfile;

    // Rebuild sports array: replace matched sports in-place, append new ones
    const updatedSports: SportProfile[] = sports
      .map((s) => {
        const name = s.sport.toLowerCase();
        if (name === 'football') return mergedFootball;
        if (name === 'basketball') return mergedBasketball;
        return s;
      })
      .concat(
        // Append football/basketball only if they didn't exist in the original array
        findSport('football') ? [] : [mergedFootball],
        findSport('basketball') ? [] : [mergedBasketball]
      )
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // Collect all batch operations
    type BatchOp = (batch: WriteBatch) => void;
    const ops: BatchOp[] = [];

    // 1. Schedule events: also kept in sub-collection for future querying (football)
    const scheduleCol = userRef.collection('schedule');
    for (const event of scheduleEvents) {
      const ref = scheduleCol.doc(event.id);
      ops.push((b) => b.set(ref, { ...event, updatedAt: now }));
    }

    // 1b. Basketball schedule events
    for (const event of bbScheduleEvents) {
      const ref = scheduleCol.doc(event.id);
      ops.push((b) => b.set(ref, { ...event, updatedAt: now }));
    }

    // 2. Recruiting activities: also kept in sub-collection for future querying (football)
    const recruitingCol = userRef.collection('recruiting');
    for (const activity of recruitingActivities) {
      const ref = recruitingCol.doc(activity.id);
      ops.push((b) => b.set(ref, { ...activity }));
    }

    // 2b. Basketball recruiting activities
    for (const activity of bbRecruitingActivities) {
      const ref = recruitingCol.doc(activity.id);
      ops.push((b) => b.set(ref, { ...activity }));
    }

    // NOTE: verifiedStats & verifiedMetrics are embedded directly in User.sports[]
    // (see footballSportUpdate / basketballSportUpdate above).
    // No separate sports/{sport}/stats or sports/{sport}/metrics sub-collections needed.

    // 5. Timeline posts — top-level Posts/{postId} collection (NOT sub-collection)
    for (let i = 0; i < posts.length; i++) {
      const docId = `seed_${userId}_post_${i}`;
      const post = posts[i]!;
      // Store createdAt as ISO string for the frontend mapper
      const createdAtIso = (post.createdAt as unknown as { toDate(): Date }).toDate().toISOString();
      // Build the doc and strip undefined fields (Firestore rejects them)
      const timelineDoc: Record<string, unknown> = {
        id: docId,
        userId: post.userId,
        sport: post.sport,
        sportId: post.sportId,
        content: post.content,
        type: post.type,
        isPinned: post.isPinned,
        images: post.images,
        hashtags: post.hashtags,
        createdAt: createdAtIso,
        updatedAt: createdAtIso,
        stats: post.stats,
      };
      if (post.title !== undefined) timelineDoc['title'] = post.title;
      if (post.mediaUrl !== undefined) timelineDoc['mediaUrl'] = post.mediaUrl;
      if (post.thumbnailUrl !== undefined) timelineDoc['thumbnailUrl'] = post.thumbnailUrl;
      if (post.duration !== undefined) timelineDoc['duration'] = post.duration;
      ops.push((b) => b.set(db.collection(POSTS_COLLECTIONS.POSTS).doc(docId), timelineDoc));
    }

    // 5b. News articles — top-level News/{articleId} collection (NOT sub-collection)
    for (const article of newsArticles) {
      const a = article as { id: string };
      ops.push((b) => b.set(db.collection(NEWS_COL).doc(a.id), article));
    }

    // 6. Follows — sub-collections only (no top-level Follows collection needed)
    for (const follow of follows) {
      // users/{uid}/followers/{followerId} — who follows this user
      if (follow.followingId === userId) {
        const followerRef = userRef.collection('followers').doc(follow.followerId);
        ops.push((b) =>
          b.set(followerRef, {
            userId: follow.followerId,
            followedAt: follow.createdAt,
          })
        );
      }

      // users/{uid}/following/{followingId} — who this user follows
      if (follow.followerId === userId) {
        const followingRef = userRef.collection('following').doc(follow.followingId);
        ops.push((b) =>
          b.set(followingRef, {
            userId: follow.followingId,
            followedAt: follow.createdAt,
          })
        );
      }
    }

    // 7. Rankings — top-level Rankings/{rankingId} collection
    for (const ranking of rankings) {
      ops.push((b) => b.set(db.collection(RANKINGS_COL).doc(ranking.id), ranking));
    }

    // 8. Scout reports — top-level ScoutReports/{reportId} collection (NOT sub-collection)
    for (const report of scoutReports) {
      const r = report as { id: string };
      ops.push((b) => b.set(db.collection(SCOUT_REPORTS_COL).doc(r.id), report));
    }

    // 9. Videos — users/{uid}/videos/{videoId} sub-collection
    const videosCol = userRef.collection('videos');
    for (const video of videos) {
      const v = video as { id: string };
      ops.push((b) => b.set(videosCol.doc(v.id), video));
    }

    // 8. Update User doc: denormalized sports summary + counters only
    // recentPosts is NO LONGER embedded — timeline data lives in the
    // users/{uid}/timeline sub-collection per SUB-COLLECTIONS ARCHITECTURE in user.model.ts
    const followersCount = follows.filter((f) => f.followingId === userId).length;
    const followingCount = follows.filter((f) => f.followerId === userId).length;

    ops.push((b) =>
      b.update(userRef, {
        sports: updatedSports,
        '_counters.followersCount': followersCount,
        '_counters.followingCount': followingCount,
        '_counters.postsCount': posts.length,
        updatedAt: now,
      })
    );

    // Commit in chunks
    await commitBatches(db, ops);

    // Bust ALL profile cache keys so next request always re-fetches from Firestore
    await bustProfileCache(userId, userData.username, userData.unicode);

    logger.info('[Seed] Seed completed', {
      userId,
      football: {
        scheduleEvents: scheduleEvents.length,
        recruitingActivities: recruitingActivities.length,
        verifiedStats: verifiedStats.length,
        verifiedMetrics: verifiedMetrics.length,
      },
      basketball: {
        scheduleEvents: bbScheduleEvents.length,
        recruitingActivities: bbRecruitingActivities.length,
        verifiedStats: bbStats.length,
        verifiedMetrics: bbMetrics.length,
      },
      posts: posts.length,
      news: newsArticles.length,
      follows: follows.length,
      rankings: rankings.length,
      scoutReports: scoutReports.length,
      videos: videos.length,
    });

    res.json({
      success: true,
      data: {
        userId,
        seeded: {
          football: {
            scheduleEvents: scheduleEvents.length,
            recruitingActivities: recruitingActivities.length,
            verifiedStats: verifiedStats.length,
            verifiedMetrics: verifiedMetrics.length,
          },
          basketball: {
            scheduleEvents: bbScheduleEvents.length,
            recruitingActivities: bbRecruitingActivities.length,
            verifiedStats: bbStats.length,
            verifiedMetrics: bbMetrics.length,
          },
          posts: posts.length,
          news: newsArticles.length,
          follows: follows.length,
          rankings: rankings.length,
          scoutReports: scoutReports.length,
          videos: videos.length,
        },
      },
    });
  })
);

/**
 * Wipe seeded data for a user (safe to re-run seed after this).
 * DELETE /seed/:userId
 */
router.delete(
  '/:userId',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };

    const db = req.firebase!.db;
    const userRef = db.collection(USERS_COL).doc(userId);

    type BatchOp = (batch: WriteBatch) => void;
    const ops: BatchOp[] = [];

    // Helper: delete all docs in a sub-collection query
    async function collectDeletions(
      col: FirebaseFirestore.CollectionReference,
      prefix: string
    ): Promise<void> {
      const snap = await col
        .where('id', '>=', prefix)
        .where('id', '<', prefix + '\uffff')
        .get();
      for (const doc of snap.docs) {
        ops.push((b) => b.delete(doc.ref));
      }
    }

    await Promise.all([
      collectDeletions(userRef.collection('schedule'), `seed_${userId}`),
      collectDeletions(userRef.collection('recruiting'), `seed_${userId}`),
      collectDeletions(userRef.collection('videos'), `seed_${userId}`),
      // Legacy cleanup: remove any old sub-collection docs from prior seed versions
      collectDeletions(userRef.collection('timeline'), `seed_${userId}`),
      collectDeletions(userRef.collection('news'), `seed_${userId}`),
      collectDeletions(userRef.collection('rankings'), `seed_${userId}`),
      collectDeletions(userRef.collection('scoutReports'), `seed_${userId}`),
      collectDeletions(
        userRef.collection('sports').doc('football').collection('stats'),
        `seed_${userId}`
      ),
      collectDeletions(
        userRef.collection('sports').doc('basketball').collection('stats'),
        `seed_${userId}`
      ),
      collectDeletions(
        userRef.collection('sports').doc('football').collection('metrics'),
        `seed_${userId}`
      ),
      collectDeletions(
        userRef.collection('sports').doc('basketball').collection('metrics'),
        `seed_${userId}`
      ),
    ]);

    // Delete all docs in followers/following sub-collections (no seed prefix on those doc IDs)
    async function deleteAllDocs(col: FirebaseFirestore.CollectionReference): Promise<void> {
      const snap = await col.limit(200).get();
      for (const doc of snap.docs) {
        ops.push((b) => b.delete(doc.ref));
      }
    }
    await Promise.all([
      deleteAllDocs(userRef.collection('followers')),
      deleteAllDocs(userRef.collection('following')),
    ]);

    // Clear the embedded fields on sports[0] (football) and sports[1] (basketball)
    const userDocForDelete = await userRef.get();
    const deleteUserData = userDocForDelete.data() as
      | {
          sports?: unknown[];
          username?: string;
          unicode?: string;
        }
      | undefined;
    if (userDocForDelete.exists && deleteUserData) {
      const existingSports = (deleteUserData.sports ?? []) as Record<string, unknown>[];
      if (existingSports.length > 0) {
        const fieldsToRemove = [
          'verifiedStats',
          'verifiedMetrics',
          'recruitingActivities',
          'featuredStats',
          'featuredMetrics',
          'upcomingEvents',
          'upcomingEventsPreview',
        ];
        const cleanedSports = existingSports.map((sp, i) => {
          // Clean embedded seed data from football (index 0) and basketball (index 1)
          if (i === 0 || i === 1) {
            const clean = { ...sp };
            for (const field of fieldsToRemove) delete clean[field];
            return clean;
          }
          return sp;
        });
        ops.push((b) => b.update(userRef, { sports: cleanedSports }));
      }
    }

    // Top-level collections by doc ID prefix
    async function collectTopLevelDeletions(colName: string, prefix: string): Promise<void> {
      const snap = await db.collection(colName).where('userId', '==', userId).get();
      for (const doc of snap.docs) {
        if (doc.id.startsWith(prefix)) {
          ops.push((b) => b.delete(doc.ref));
        }
      }
    }

    await Promise.all([
      collectTopLevelDeletions(POSTS_COLLECTIONS.POSTS, `seed_${userId}`),
      collectTopLevelDeletions(NEWS_COL, `seed_${userId}`),
      collectTopLevelDeletions(SCOUT_REPORTS_COL, `seed_${userId}`),
      collectTopLevelDeletions(RANKINGS_COL, `seed_${userId}`),
    ]);

    await commitBatches(db, ops);

    // Bust ALL profile cache keys so next request re-fetches fresh data from Firestore
    await bustProfileCache(userId, deleteUserData?.username, deleteUserData?.unicode);

    logger.info('[Seed] Seed data wiped', { userId, deletedOps: ops.length });

    res.json({ success: true, data: { userId, deletedDocs: ops.length } });
  })
);

export default router;
