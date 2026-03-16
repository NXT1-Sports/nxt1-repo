/**
 * @fileoverview News Routes
 * @module @nxt1/backend/routes/news
 *
 * Firestore-backed news feature routes with Redis caching.
 * Matches NEWS_API_ENDPOINTS from @nxt1/core/news/constants.
 *
 * Data layout:
 *   Firestore `News/{id}`                           — article documents
 *   Firestore `UserReadingProgress/{userId}_{id}`   — per-user read progress
 *   Firestore `UserReadingStats/{userId}`            — per-user aggregate stats
 *
 * Cache layout (from NEWS_CACHE_KEYS):
 *   news:feed:{category}:p{page}:l{limit}  — paginated feed
 *   news:article:{id}                       — single article
 *   news:stats:{userId}                     — reading stats
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { optionalAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { UpdateNewsProgressDto } from '../dtos/social.dto.js';
import { logger } from '../utils/logger.js';
import { NxtApiError, notFoundError, internalError, validationError } from '@nxt1/core/errors';
import { NEWS_CACHE_KEYS, NEWS_CACHE_TTL } from '@nxt1/core';
import { getCacheService } from '../services/cache.service.js';

const router: ExpressRouter = Router();

// ─── Constants ───────────────────────────────────────────────────────────────

const NEWS_COLLECTION = 'News';
const USER_READING_PROGRESS_COLLECTION = 'UserReadingProgress';
const USER_READING_STATS_COLLECTION = 'UserReadingStats';

/** Cache TTL in seconds (NEWS_CACHE_TTL values are in ms). */
const CACHE_TTL = {
  FEED: Math.round(NEWS_CACHE_TTL.FEED / 1000), // 300 s
  ARTICLE: Math.round(NEWS_CACHE_TTL.ARTICLE / 1000), // 900 s
  STATS: Math.round(NEWS_CACHE_TTL.STATS / 1000), // 1 800 s
} as const;

// ─── Static seed data (used only to pre-populate Firestore on first run) ─────

const _SEED_NOW = Date.now();

const SOURCES = {
  nxt1: {
    id: 'agent-x',
    name: 'NXT 1',
    avatarUrl: 'assets/shared/logo/nxt1_icon.png',
    type: 'ai-agent',
    confidenceScore: 95,
    isVerified: true,
  },
  editorial: {
    id: 'nxt1-editorial',
    name: 'NXT 1',
    avatarUrl: 'assets/shared/logo/nxt1_icon.png',
    type: 'editorial',
    isVerified: true,
  },
  espn: {
    id: 'espn',
    name: 'ESPN',
    avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=ESPN&backgroundColor=cc0000',
    type: 'syndicated',
    isVerified: true,
  },
  rivals: {
    id: 'rivals',
    name: 'Rivals',
    avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=RIV&backgroundColor=ff6600',
    type: 'syndicated',
    isVerified: true,
  },
  s247: {
    id: '247sports',
    name: '247Sports',
    avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=247&backgroundColor=0066cc',
    type: 'syndicated',
    isVerified: true,
  },
  on3: {
    id: 'on3',
    name: 'On3',
    avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=ON3&backgroundColor=00b386',
    type: 'syndicated',
    isVerified: true,
  },
  elite11: {
    id: 'elite-11',
    name: 'Elite 11',
    avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=E11&backgroundColor=222222',
    type: 'syndicated',
    isVerified: true,
  },
  maxpreps: {
    id: 'maxpreps',
    name: 'MaxPreps',
    avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=MP&backgroundColor=1e3a5f',
    type: 'syndicated',
    isVerified: true,
  },
} as const;

function buildSeedArticles() {
  const now = _SEED_NOW;
  return [
    // ── Recruiting ──────────────────────────────────────────────────────────────
    {
      id: 'rec-001',
      title: '5-Star QB Marcus Thompson Narrows Top Schools to Final 3',
      excerpt:
        "The nation's top quarterback prospect has narrowed his recruitment to Alabama, Ohio State, and Georgia ahead of his decision day.",
      content:
        '<p>Marcus Thompson, the consensus number one quarterback in the 2026 class, has officially cut his list to three schools.</p>',
      category: 'recruiting',
      tags: ['quarterback', '5-star', 'class-of-2026'],
      source: SOURCES.nxt1,
      heroImageUrl: 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=800&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=400&q=80',
      readingTimeMinutes: 3,
      publishedAt: new Date(now - 1_800_000).toISOString(), // 30 min ago
      isBookmarked: false,
      isRead: false,
      xpReward: 15,
      viewCount: 2847,
      shareCount: 156,
      likeCount: 892,
      isFeatured: true,
      sportContext: {
        sport: 'football',
        colleges: ['Alabama', 'Ohio State', 'Georgia'],
        players: ['Marcus Thompson'],
      },
    },
    {
      id: 'rec-002',
      title: 'Top 100 Rankings Update: New Risers and Fallers for February',
      excerpt:
        'Our recruiting analysts have updated the national rankings with several big movers based on recent camp performances.',
      content: '<p>The February rankings update brings significant movement in the top 100.</p>',
      category: 'recruiting',
      tags: ['rankings', 'top-100', 'camps'],
      source: SOURCES.espn,
      heroImageUrl: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=800&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400&q=80',
      readingTimeMinutes: 5,
      publishedAt: new Date(now - 7_200_000).toISOString(), // 2 h ago
      isBookmarked: true,
      isRead: false,
      xpReward: 20,
      viewCount: 5621,
      shareCount: 289,
      likeCount: 1456,
      sportContext: { sport: 'football' },
    },
    {
      id: 'rec-003',
      title: 'Elite 11 Finals Preview: 20 QBs Ready to Compete',
      excerpt:
        'The best high school quarterbacks in the country descend on Los Angeles this weekend for the prestigious Elite 11 Finals.',
      content:
        '<p>The Elite 11 Finals, the premier QB competition in high school football, kicks off this weekend.</p>',
      category: 'recruiting',
      tags: ['elite-11', 'quarterbacks', 'competition'],
      source: SOURCES.elite11,
      heroImageUrl: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=800&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=400&q=80',
      readingTimeMinutes: 4,
      publishedAt: new Date(now - 18_000_000).toISOString(), // 5 h ago
      isBookmarked: false,
      isRead: true,
      readingProgress: 100,
      xpReward: 15,
      viewCount: 3892,
      shareCount: 178,
      likeCount: 967,
      sportContext: { sport: 'football' },
    },
    // ── Commits ──────────────────────────────────────────────────────────────────
    {
      id: 'com-001',
      title: '4-Star WR Jaylen Carter Commits to USC',
      excerpt:
        'The explosive playmaker from Texas picks the Trojans over Texas and LSU, giving Lincoln Riley another elite weapon.',
      content: '<p>Jaylen Carter, a 4-star WR from Allen HS in Texas, has committed to USC.</p>',
      category: 'commits',
      tags: ['commitment', 'wide-receiver', 'usc'],
      source: SOURCES.rivals,
      heroImageUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=400&q=80',
      readingTimeMinutes: 2,
      publishedAt: new Date(now - 2_700_000).toISOString(), // 45 min ago
      isBookmarked: false,
      isRead: false,
      xpReward: 10,
      viewCount: 1523,
      shareCount: 87,
      likeCount: 445,
      isBreaking: true,
      sportContext: {
        sport: 'football',
        colleges: ['USC', 'Texas', 'LSU'],
        players: ['Jaylen Carter'],
      },
    },
    {
      id: 'com-002',
      title: 'Duke Lands Top-50 Point Guard in Major Recruiting Win',
      excerpt:
        'The Blue Devils secure their backcourt of the future with the commitment of Jordan Williams.',
      content:
        '<p>Duke basketball has landed a major commitment as Jordan Williams picks the Blue Devils.</p>',
      category: 'commits',
      tags: ['commitment', 'basketball', 'duke'],
      source: SOURCES.s247,
      heroImageUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400&q=80',
      readingTimeMinutes: 3,
      publishedAt: new Date(now - 28_800_000).toISOString(), // 8 h ago
      isBookmarked: false,
      isRead: false,
      xpReward: 15,
      viewCount: 2156,
      shareCount: 134,
      likeCount: 678,
      sportContext: { sport: 'basketball', colleges: ['Duke'], players: ['Jordan Williams'] },
    },
    // ── Transfers ────────────────────────────────────────────────────────────────
    {
      id: 'tra-001',
      title: 'Transfer Portal Tracker: Top 25 Available Players Right Now',
      excerpt:
        'With the spring portal window open, we track the best players looking for new homes.',
      content:
        '<p>The spring transfer portal window has opened, and some big names are looking for new opportunities.</p>',
      category: 'transfers',
      tags: ['transfer-portal', 'tracker', 'rankings'],
      source: SOURCES.on3,
      heroImageUrl: 'https://images.unsplash.com/photo-1577223625816-7546f13df25d?w=800&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1577223625816-7546f13df25d?w=400&q=80',
      readingTimeMinutes: 6,
      publishedAt: new Date(now - 14_400_000).toISOString(), // 4 h ago
      isBookmarked: true,
      isRead: false,
      xpReward: 25,
      viewCount: 8934,
      shareCount: 567,
      likeCount: 2341,
      isFeatured: true,
      sportContext: { sport: 'football' },
    },
    {
      id: 'tra-002',
      title: 'Former 5-Star DE Announces Transfer to Michigan',
      excerpt:
        'After two seasons at Florida, the talented pass rusher is heading north to join the Wolverines.',
      content:
        '<p>Marcus Johnson, a former 5-star DE, has announced his transfer to Michigan from Florida.</p>',
      category: 'transfers',
      tags: ['transfer', 'defensive-end', 'michigan'],
      source: SOURCES.espn,
      heroImageUrl: 'https://images.unsplash.com/photo-1567427017947-545c5f8d16ad?w=800&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1567427017947-545c5f8d16ad?w=400&q=80',
      readingTimeMinutes: 3,
      publishedAt: new Date(now - 43_200_000).toISOString(), // 12 h ago
      isBookmarked: false,
      isRead: false,
      xpReward: 15,
      viewCount: 4521,
      shareCount: 234,
      likeCount: 1123,
      sportContext: {
        sport: 'football',
        colleges: ['Michigan', 'Florida'],
        players: ['Marcus Johnson'],
      },
    },
    // ── College ──────────────────────────────────────────────────────────────────
    {
      id: 'col-001',
      title: 'College Football Playoff Expansion: What It Means for Recruiting',
      excerpt:
        'The expanded playoff format is already changing how teams approach recruiting. We break down the impact.',
      content:
        '<p>The CFP expansion to 12 teams is reshaping the recruiting landscape in significant ways.</p>',
      category: 'college',
      tags: ['cfp', 'analysis', 'recruiting-impact'],
      source: SOURCES.editorial,
      heroImageUrl: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=400&q=80',
      readingTimeMinutes: 7,
      publishedAt: new Date(now - 86_400_000).toISOString(), // 1 day ago
      isBookmarked: false,
      isRead: true,
      readingProgress: 100,
      xpReward: 25,
      viewCount: 12456,
      shareCount: 789,
      likeCount: 3456,
      sportContext: { sport: 'football' },
    },
    {
      id: 'col-002',
      title: 'March Madness Bracket Predictions: Early Look at the Field',
      excerpt:
        'Conference tournaments are approaching. Here are our early bracket predictions for the NCAA Tournament.',
      content:
        '<p>With conference tournaments just weeks away, here are our first bracket predictions for 2026.</p>',
      category: 'college',
      tags: ['basketball', 'march-madness', 'predictions'],
      source: SOURCES.s247,
      heroImageUrl: 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=800&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=400&q=80',
      readingTimeMinutes: 5,
      publishedAt: new Date(now - 129_600_000).toISOString(), // 1.5 days ago
      isBookmarked: false,
      isRead: false,
      xpReward: 20,
      viewCount: 7823,
      shareCount: 456,
      likeCount: 2134,
      sportContext: { sport: 'basketball' },
    },
    // ── Highlights ───────────────────────────────────────────────────────────────
    {
      id: 'hig-001',
      title: 'Top 10 Plays of the Week: Incredible Catches and Runs',
      excerpt:
        'From one-handed grabs to 99-yard runs, here are the best plays from this week in high school football.',
      content:
        '<p>Every week we compile the most impressive plays from high school fields across the country.</p>',
      category: 'highlights',
      tags: ['top-plays', 'highlights', 'weekly'],
      source: SOURCES.maxpreps,
      heroImageUrl: 'https://images.unsplash.com/photo-1570498839593-e565b39455fc?w=800&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1570498839593-e565b39455fc?w=400&q=80',
      readingTimeMinutes: 2,
      publishedAt: new Date(now - 21_600_000).toISOString(), // 6 h ago
      isBookmarked: false,
      isRead: false,
      xpReward: 10,
      viewCount: 15678,
      shareCount: 1234,
      likeCount: 5678,
      isFeatured: true,
      sportContext: { sport: 'football' },
    },
    // ── Pro ──────────────────────────────────────────────────────────────────────
    {
      id: 'pro-001',
      title: 'NFL Draft: Early Mock Draft 1.0 for 2026',
      excerpt:
        "Way-too-early predictions for next year's NFL Draft, including surprise risers and projected top picks.",
      content:
        '<p>It is never too early to look ahead to the NFL Draft. Here is our first mock draft for 2026.</p>',
      category: 'pro',
      tags: ['nfl-draft', 'mock-draft', 'predictions'],
      source: SOURCES.rivals,
      heroImageUrl: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=800&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400&q=80',
      readingTimeMinutes: 8,
      publishedAt: new Date(now - 172_800_000).toISOString(), // 2 days ago
      isBookmarked: true,
      isRead: false,
      xpReward: 30,
      viewCount: 9876,
      shareCount: 654,
      likeCount: 3210,
      sportContext: { sport: 'football' },
    },
  ];
}

// ─── Firestore seeding ────────────────────────────────────────────────────────

let _seeded = false;

/**
 * Seed the News Firestore collection with static articles if it is empty.
 * Runs at most once per server lifetime (guarded by _seeded flag).
 */
async function ensureNewsSeeded(db: Firestore): Promise<void> {
  if (_seeded) return;

  const col = db.collection(NEWS_COLLECTION);
  const probe = await col.limit(1).get();

  if (!probe.empty) {
    _seeded = true;
    return;
  }

  logger.info('[News] Collection empty — seeding articles…');
  const articles = buildSeedArticles();
  const batch = db.batch();

  for (const article of articles) {
    const { id, ...fields } = article as Record<string, unknown> & { id: string };
    batch.set(col.doc(id), {
      ...fields,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  _seeded = true;
  logger.info(`[News] Seeded ${articles.length} articles into Firestore.`);
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

async function invalidateNewsCache(articleId?: string): Promise<void> {
  try {
    const cache = getCacheService();
    if (articleId) {
      await cache.del(`${NEWS_CACHE_KEYS.ARTICLE_PREFIX}${articleId}`);
    }
    // Pattern-style key: del treats it as a literal key in Redis; cache will
    // naturally expire via TTL. Specific known feed keys can be added here.
    await cache.del(`${NEWS_CACHE_KEYS.FEED_PREFIX}all:p1:l20`);
    await cache.del(`${NEWS_CACHE_KEYS.FEED_PREFIX}trending`);
  } catch (err) {
    logger.warn('[News] Cache invalidation failed', { err });
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/news
 * Paginated news feed, optionally filtered by category.
 * Query: category, page, limit
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = req.firebase!.db;
    await ensureNewsSeeded(db);

    const category = req.query['category'] as string | undefined;
    const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query['limit'] ?? '20'), 10)));

    const cacheKey = `${NEWS_CACHE_KEYS.FEED_PREFIX}${category ?? 'all'}:p${page}:l${limit}`;
    const cache = getCacheService();
    const cached = await cache.get(cacheKey);

    if (cached) {
      logger.debug('[News] Feed cache HIT', { cacheKey });
      res.set('X-Cache-Status', 'HIT');
      res.json(cached);
      return;
    }

    logger.debug('[News] Feed cache MISS', { cacheKey });

    let query = db
      .collection(NEWS_COLLECTION)
      .orderBy('publishedAt', 'desc') as FirebaseFirestore.Query;

    if (category && category !== 'for-you') {
      if (category === 'saved') {
        query = query.where('isBookmarked', '==', true);
      } else {
        query = query.where('category', '==', category);
      }
    }

    const allSnap = await query.get();
    const allDocs = allSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const total = allDocs.length;
    const totalPages = Math.ceil(total / limit);
    const data = allDocs.slice((page - 1) * limit, page * limit);

    const response = {
      success: true,
      data,
      pagination: { page, limit, total, totalPages, hasMore: page < totalPages },
    };

    await cache.set(cacheKey, response, { ttl: CACHE_TTL.FEED });
    res.json(response);
  } catch (err) {
    if (err instanceof NxtApiError) {
      res.status(err.statusCode).json(err.toResponse());
      return;
    }
    logger.error('[News] GET / error', { err });
    const error = internalError(err);
    res.status(error.statusCode).json(error.toResponse());
  }
});

/**
 * GET /api/v1/news/trending
 * Top 5 articles by viewCount.
 */
router.get('/trending', async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = _req.firebase!.db;
    await ensureNewsSeeded(db);

    const cacheKey = `${NEWS_CACHE_KEYS.FEED_PREFIX}trending`;
    const cache = getCacheService();
    const cached = await cache.get(cacheKey);

    if (cached) {
      logger.debug('[News] Trending cache HIT');
      res.set('X-Cache-Status', 'HIT');
      res.json(cached);
      return;
    }

    const snap = await db.collection(NEWS_COLLECTION).orderBy('viewCount', 'desc').limit(5).get();

    const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const response = { success: true, data };

    await cache.set(cacheKey, response, { ttl: CACHE_TTL.FEED });
    res.json(response);
  } catch (err) {
    if (err instanceof NxtApiError) {
      res.status(err.statusCode).json(err.toResponse());
      return;
    }
    logger.error('[News] GET /trending error', { err });
    const error = internalError(err);
    res.status(error.statusCode).json(error.toResponse());
  }
});

/**
 * GET /api/v1/news/search?q=
 * In-memory text search across title, excerpt, and tags.
 * (Firestore lacks native full-text search; dataset is small.)
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const q = (req.query['q'] as string | undefined)?.trim().toLowerCase() ?? '';

    if (!q) {
      const error = validationError([
        { field: 'q', message: 'Search query is required.', rule: 'required' },
      ]);
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    const db = req.firebase!.db;
    await ensureNewsSeeded(db);

    const snap = await db.collection(NEWS_COLLECTION).orderBy('publishedAt', 'desc').get();

    type NewsDoc = Record<string, unknown>;
    const all = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as NewsDoc);

    const data = all.filter((a) => {
      const inTitle = String(a['title'] ?? '')
        .toLowerCase()
        .includes(q);
      const inExcerpt = String(a['excerpt'] ?? '')
        .toLowerCase()
        .includes(q);
      const inTags =
        Array.isArray(a['tags']) &&
        (a['tags'] as unknown[]).some((t) => String(t).toLowerCase().includes(q));
      return inTitle || inExcerpt || inTags;
    });

    res.json({ success: true, data });
  } catch (err) {
    if (err instanceof NxtApiError) {
      res.status(err.statusCode).json(err.toResponse());
      return;
    }
    logger.error('[News] GET /search error', { err });
    const error = internalError(err);
    res.status(error.statusCode).json(error.toResponse());
  }
});

/**
 * GET /api/v1/news/stats
 * Per-user reading statistics (articlesRead, minutesRead, streak, xpEarned).
 */
router.get('/stats', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.uid;
    const cacheKey = userId
      ? `${NEWS_CACHE_KEYS.READING_STATS}:${userId}`
      : NEWS_CACHE_KEYS.READING_STATS;

    const cache = getCacheService();
    const cached = await cache.get(cacheKey);

    if (cached) {
      logger.debug('[News] Stats cache HIT', { userId });
      res.set('X-Cache-Status', 'HIT');
      res.json(cached);
      return;
    }

    let articlesRead = 0;
    let minutesRead = 0;
    let streak = 0;
    let xpEarned = 0;

    if (userId) {
      const db = req.firebase!.db;
      const statsSnap = await db.collection(USER_READING_STATS_COLLECTION).doc(userId).get();

      if (statsSnap.exists) {
        const d = statsSnap.data() as Record<string, unknown>;
        articlesRead = Number(d['articlesRead'] ?? 0);
        minutesRead = Number(d['minutesRead'] ?? 0);
        streak = Number(d['streak'] ?? 0);
        xpEarned = Number(d['xpEarned'] ?? 0);
      }
    }

    const response = {
      success: true,
      data: { articlesRead, minutesRead, streak, xpEarned },
    };

    await cache.set(cacheKey, response, { ttl: CACHE_TTL.STATS });
    res.json(response);
  } catch (err) {
    if (err instanceof NxtApiError) {
      res.status(err.statusCode).json(err.toResponse());
      return;
    }
    logger.error('[News] GET /stats error', { err });
    const error = internalError(err);
    res.status(error.statusCode).json(error.toResponse());
  }
});

/**
 * GET /api/v1/news/:id
 * Single article by Firestore document ID.
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params['id'] as string;
    const cacheKey = `${NEWS_CACHE_KEYS.ARTICLE_PREFIX}${id}`;
    const cache = getCacheService();
    const cached = await cache.get(cacheKey);

    if (cached) {
      logger.debug('[News] Article cache HIT', { id });
      res.set('X-Cache-Status', 'HIT');
      res.json(cached);
      return;
    }

    const db = req.firebase!.db;
    await ensureNewsSeeded(db);

    const doc = await db.collection(NEWS_COLLECTION).doc(id).get();
    if (!doc.exists) {
      const error = notFoundError('article', id);
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    const response = { success: true, data: { id: doc.id, ...doc.data() } };
    await cache.set(cacheKey, response, { ttl: CACHE_TTL.ARTICLE });
    res.json(response);
  } catch (err) {
    if (err instanceof NxtApiError) {
      res.status(err.statusCode).json(err.toResponse());
      return;
    }
    logger.error('[News] GET /:id error', { err });
    const error = internalError(err);
    res.status(error.statusCode).json(error.toResponse());
  }
});

/**
 * POST /api/v1/news/:id/bookmark
 * Toggle isBookmarked on the article document.
 */
router.post('/:id/bookmark', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params['id'] as string;
    const db = req.firebase!.db;

    const doc = await db.collection(NEWS_COLLECTION).doc(id).get();
    if (!doc.exists) {
      const error = notFoundError('article', id);
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    const d = doc.data() as Record<string, unknown>;
    const isBookmarked = !(d['isBookmarked'] ?? false);

    await db.collection(NEWS_COLLECTION).doc(id).update({
      isBookmarked,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await invalidateNewsCache(id);
    res.json({ success: true, data: { isBookmarked } });
  } catch (err) {
    if (err instanceof NxtApiError) {
      res.status(err.statusCode).json(err.toResponse());
      return;
    }
    logger.error('[News] POST /:id/bookmark error', { err });
    const error = internalError(err);
    res.status(error.statusCode).json(error.toResponse());
  }
});

/**
 * POST /api/v1/news/:id/progress
 * Update reading progress (0‒100). Awards XP on first completion.
 * Body: { progress: number }
 */
router.post(
  '/:id/progress',
  optionalAuth,
  validateBody(UpdateNewsProgressDto),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      const { progress } = req.body as UpdateNewsProgressDto;
      const userId = req.user?.uid;
      const db = req.firebase!.db;

      const doc = await db.collection(NEWS_COLLECTION).doc(id).get();
      if (!doc.exists) {
        const error = notFoundError('article', id);
        res.status(error.statusCode).json(error.toResponse());
        return;
      }

      const articleData = doc.data() as Record<string, unknown>;
      const isCompleted = progress >= 100;
      let xpEarned = 0;

      if (userId) {
        const progressRef = db.collection(USER_READING_PROGRESS_COLLECTION).doc(`${userId}_${id}`);

        const prevSnap = await progressRef.get();
        const wasCompleted =
          prevSnap.exists && Boolean((prevSnap.data() as Record<string, unknown>)['isCompleted']);

        await progressRef.set(
          { userId, articleId: id, progress, isCompleted, updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );

        if (isCompleted && !wasCompleted) {
          xpEarned = Number(articleData['xpReward'] ?? 10);

          await db
            .collection(USER_READING_STATS_COLLECTION)
            .doc(userId)
            .set(
              {
                articlesRead: FieldValue.increment(1),
                minutesRead: FieldValue.increment(Number(articleData['readingTimeMinutes'] ?? 0)),
                xpEarned: FieldValue.increment(xpEarned),
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );

          const cache = getCacheService();
          await cache.del(`${NEWS_CACHE_KEYS.READING_STATS}:${userId}`);
        }
      }

      res.json({ success: true, data: { xpEarned, isCompleted } });
    } catch (err) {
      if (err instanceof NxtApiError) {
        res.status(err.statusCode).json(err.toResponse());
        return;
      }
      logger.error('[News] POST /:id/progress error', { err });
      const error = internalError(err);
      res.status(error.statusCode).json(error.toResponse());
    }
  }
);

/**
 * POST /api/v1/news/:id/read
 * Mark an article as fully read, increment viewCount, award XP.
 */
router.post('/:id/read', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params['id'] as string;
    const userId = req.user?.uid;
    const db = req.firebase!.db;

    const doc = await db.collection(NEWS_COLLECTION).doc(id).get();
    if (!doc.exists) {
      const error = notFoundError('article', id);
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    const articleData = doc.data() as Record<string, unknown>;

    await db
      .collection(NEWS_COLLECTION)
      .doc(id)
      .update({
        viewCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });

    let xpEarned = 0;

    if (userId) {
      xpEarned = Number(articleData['xpReward'] ?? 10);

      await db.collection(USER_READING_PROGRESS_COLLECTION).doc(`${userId}_${id}`).set(
        {
          userId,
          articleId: id,
          isRead: true,
          progress: 100,
          isCompleted: true,
          readAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await db
        .collection(USER_READING_STATS_COLLECTION)
        .doc(userId)
        .set(
          {
            articlesRead: FieldValue.increment(1),
            xpEarned: FieldValue.increment(xpEarned),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

      const cache = getCacheService();
      await cache.del(`${NEWS_CACHE_KEYS.READING_STATS}:${userId}`);
    }

    await invalidateNewsCache(id);
    res.json({ success: true, data: { xpEarned } });
  } catch (err) {
    if (err instanceof NxtApiError) {
      res.status(err.statusCode).json(err.toResponse());
      return;
    }
    logger.error('[News] POST /:id/read error', { err });
    const error = internalError(err);
    res.status(error.statusCode).json(error.toResponse());
  }
});

/**
 * POST /api/v1/news/generate
 * AI-powered news generation — not yet implemented.
 */
router.post('/generate', (_req: Request, res: Response): void => {
  const error = internalError('AI news generation is not yet implemented.');
  res.status(501).json(error.toResponse());
});

export default router;
