/**
 * @fileoverview Explore/Search Routes
 * @module @nxt1/backend/routes/explore
 *
 * Document-based explore and search feature routes.
 * Matches EXPLORE_API_ENDPOINTS from @nxt1/core/explore/constants.
 *
 * Implements comprehensive search across:
 * - Colleges
 * - Athletes (Users with accountType: 'athlete')
 * - Teams
 * - Videos
 * - Camps
 * - Events
 * - Scout Reports
 * - Leaderboards
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import type {
  ExploreSearchQuery,
  ExploreSearchResponse,
  ExploreItem,
  ExploreTabId,
  ExplorePagination,
  ExploreTabCounts,
} from '@nxt1/core';
import { logger } from '../utils/logger.js';
import { getCacheService } from '../services/cache.service.js';

const router: ExpressRouter = Router();

// ============================================
// CACHE CONFIGURATION (Redis-based)
// ============================================

const CACHE_TTL = {
  search: 5 * 60, // 5 minutes (in seconds)
  counts: 60, // 1 minute
  suggestions: 10 * 60, // 10 minutes
  trending: 30 * 60, // 30 minutes
} as const;

/**
 * Redis Cache Helper for Explore Module
 */
class ExploreCacheHelper {
  private readonly prefix = 'explore:';

  /**
   * Get cached data from Redis
   */
  async get<T>(namespace: string, key: string): Promise<T | null> {
    try {
      const cache = getCacheService();
      const cacheKey = `${this.prefix}${namespace}:${key}`;
      const cached = await cache.get<T>(cacheKey);

      if (cached) {
        logger.debug(`[ExploreCacheHelper] Cache HIT: ${cacheKey}`);
      } else {
        logger.debug(`[ExploreCacheHelper] Cache MISS: ${cacheKey}`);
      }

      return cached;
    } catch (error) {
      logger.error('[ExploreCacheHelper] Cache get error:', { error });
      return null;
    }
  }

  /**
   * Set cache data in Redis
   */
  async set<T>(namespace: string, key: string, data: T, ttl: number): Promise<void> {
    try {
      const cache = getCacheService();
      const cacheKey = `${this.prefix}${namespace}:${key}`;
      await cache.set(cacheKey, data, { ttl });
      logger.debug(`[ExploreCacheHelper] Cache SET: ${cacheKey} (TTL: ${ttl}s)`);
    } catch (error) {
      logger.error('[ExploreCacheHelper] Cache set error:', { error });
    }
  }

  /**
   * Build cache key from search parameters
   */
  buildKey(params: Partial<ExploreSearchQuery>): string {
    return JSON.stringify(params);
  }
}

const cacheHelper = new ExploreCacheHelper();

// ============================================
// COLLECTION NAMES
// ============================================

const COLLECTIONS = {
  users: 'Users',
  colleges: 'Colleges',
  teams: 'Teams',
  videos: 'Videos',
  camps: 'Camps',
  events: 'Events',
  scoutReports: 'ScoutReports',
  leaderboards: 'Leaderboards',
} as const;

// ============================================
// SEARCH HELPERS
// ============================================

/**
 * Normalize search query for better matching
 */
function normalizeQuery(query: string): string {
  return query.toLowerCase().trim();
}

/**
 * Search in Athletes (Users with accountType: 'athlete')
 */
async function searchAthletes(
  db: FirebaseFirestore.Firestore,
  query: string,
  limit: number
): Promise<ExploreItem[]> {
  const normalized = normalizeQuery(query);
  const items: ExploreItem[] = [];

  try {
    // Search by display name
    const snapshot = await db
      .collection(COLLECTIONS.users)
      .where('accountType', '==', 'athlete')
      .where('searchIndex', 'array-contains', normalized)
      .limit(limit)
      .get();

    snapshot.forEach((doc) => {
      const data = doc.data();
      items.push({
        id: doc.id,
        type: 'athletes',
        name:
          data['displayName'] || data['firstName'] + ' ' + data['lastName'] || 'Unknown Athlete',
        subtitle: [data['sport'], data['position'], data['location']].filter(Boolean).join(' • '),
        imageUrl: data['profileImage'] || data['avatar'],
        isVerified: data['isVerified'] || false,
        route: `/athletes/${doc.id}`,
        sport: data['sport'] || '',
        position: data['position'] || '',
        classYear: data['classYear'] || undefined,
        location: data['location'] || data['state'] || undefined,
        team: data['team']?.name || data['highSchool'] || undefined,
        followers: data['followersCount'] || 0,
        videoCount: data['videoCount'] || 0,
        commitment: data['commitment']
          ? {
              collegeName: data['commitment']['collegeName'],
              collegeLogoUrl: data['commitment']['collegeLogoUrl'],
            }
          : undefined,
      });
    });
  } catch (error) {
    logger.error('Error searching athletes', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return items;
}

/**
 * Search in Colleges
 */
async function searchColleges(
  db: FirebaseFirestore.Firestore,
  query: string,
  limit: number
): Promise<ExploreItem[]> {
  const normalized = normalizeQuery(query);
  const items: ExploreItem[] = [];

  try {
    const snapshot = await db
      .collection(COLLECTIONS.colleges)
      .where('searchIndex', 'array-contains', normalized)
      .limit(limit)
      .get();

    snapshot.forEach((doc) => {
      const data = doc.data();
      items.push({
        id: doc.id,
        type: 'colleges',
        name: data['name'] || 'Unknown College',
        subtitle: [data['location'], data['division']].filter(Boolean).join(' • '),
        imageUrl: data['logo'] || data['imageUrl'],
        isVerified: true,
        route: `/colleges/${doc.id}`,
        location: data['location'] || `${data['city']}, ${data['state']}` || '',
        division: data['division'] || '',
        conference: data['conference'],
        sports: data['sports'] || [],
        colors: data['colors'],
        ranking: data['ranking'],
      });
    });
  } catch (error) {
    logger.error('Error searching colleges', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return items;
}

/**
 * Search in Teams
 */
async function searchTeams(
  db: FirebaseFirestore.Firestore,
  query: string,
  limit: number
): Promise<ExploreItem[]> {
  const normalized = normalizeQuery(query);
  const items: ExploreItem[] = [];

  try {
    const snapshot = await db
      .collection(COLLECTIONS.teams)
      .where('searchIndex', 'array-contains', normalized)
      .limit(limit)
      .get();

    snapshot.forEach((doc) => {
      const data = doc.data();
      items.push({
        id: doc.id,
        type: 'teams',
        name: data['name'] || 'Unknown Team',
        subtitle: [data['sport'], data['location']].filter(Boolean).join(' • '),
        imageUrl: data['logo'] || data['imageUrl'],
        isVerified: data['isVerified'] || false,
        route: `/teams/${doc.id}`,
        location: data['location'] || '',
        sport: data['sport'] || '',
        memberCount: data['memberCount'] || 0,
        record: data['record'],
        colors: data['colors'],
        teamType: data['type'] || data['teamType'],
      });
    });
  } catch (error) {
    logger.error('Error searching teams', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return items;
}

/**
 * Search in Videos
 */
async function searchVideos(
  db: FirebaseFirestore.Firestore,
  query: string,
  limit: number
): Promise<ExploreItem[]> {
  const normalized = normalizeQuery(query);
  const items: ExploreItem[] = [];

  try {
    const snapshot = await db
      .collection(COLLECTIONS.videos)
      .where('searchIndex', 'array-contains', normalized)
      .limit(limit)
      .get();

    snapshot.forEach((doc) => {
      const data = doc.data();
      items.push({
        id: doc.id,
        type: 'videos',
        name: data['title'] || 'Untitled Video',
        subtitle: data['description']?.substring(0, 100),
        imageUrl: data['thumbnail'] || data['thumbnailUrl'],
        isVerified: data['creator']?.isVerified || false,
        route: `/videos/${doc.id}`,
        thumbnailUrl: data['thumbnail'] || data['thumbnailUrl'] || '',
        duration: data['duration'] || 0,
        views: data['views'] || 0,
        likes: data['likes'] || 0,
        creator: {
          id: data['creatorId'] || data['creator']?.id || '',
          name: data['creatorName'] || data['creator']?.name || 'Unknown',
          avatarUrl: data['creator']?.avatar || data['creator']?.avatarUrl,
        },
        sport: data['sport'],
        uploadedAt: data['createdAt'] || data['uploadedAt'] || new Date().toISOString(),
      });
    });
  } catch (error) {
    logger.error('Error searching videos', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return items;
}

/**
 * Search in Camps
 */
async function searchCamps(
  db: FirebaseFirestore.Firestore,
  query: string,
  limit: number
): Promise<ExploreItem[]> {
  const normalized = normalizeQuery(query);
  const items: ExploreItem[] = [];

  try {
    const snapshot = await db
      .collection(COLLECTIONS.camps)
      .where('searchIndex', 'array-contains', normalized)
      .limit(limit)
      .get();

    snapshot.forEach((doc) => {
      const data = doc.data();
      // Camps are a special type - we'll cast to ExploreItem with required fields
      items.push({
        id: doc.id,
        type: 'camps',
        name: data['name'] || 'Unnamed Camp',
        subtitle: [data['sport'], data['location'], data['date']].filter(Boolean).join(' • '),
        imageUrl: data['imageUrl'] || data['thumbnail'],
        isVerified: data['isVerified'] || false,
        route: `/camps/${doc.id}`,
      } as unknown as ExploreItem);
    });
  } catch (error) {
    logger.error('Error searching camps', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return items;
}

/**
 * Search in Events
 */
async function searchEvents(
  db: FirebaseFirestore.Firestore,
  query: string,
  limit: number
): Promise<ExploreItem[]> {
  const normalized = normalizeQuery(query);
  const items: ExploreItem[] = [];

  try {
    const snapshot = await db
      .collection(COLLECTIONS.events)
      .where('searchIndex', 'array-contains', normalized)
      .limit(limit)
      .get();

    snapshot.forEach((doc) => {
      const data = doc.data();
      items.push({
        id: doc.id,
        type: 'events',
        name: data['name'] || 'Unnamed Event',
        subtitle: [data['type'], data['location'], data['date']].filter(Boolean).join(' • '),
        imageUrl: data['imageUrl'] || data['thumbnail'],
        isVerified: data['isVerified'] || false,
        route: `/events/${doc.id}`,
      } as unknown as ExploreItem);
    });
  } catch (error) {
    logger.error('Error searching events', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return items;
}

/**
 * Search in Scout Reports
 */
async function searchScoutReports(
  db: FirebaseFirestore.Firestore,
  query: string,
  limit: number
): Promise<ExploreItem[]> {
  const normalized = normalizeQuery(query);
  const items: ExploreItem[] = [];

  try {
    const snapshot = await db
      .collection(COLLECTIONS.scoutReports)
      .where('searchIndex', 'array-contains', normalized)
      .limit(limit)
      .get();

    snapshot.forEach((doc) => {
      const data = doc.data();
      items.push({
        id: doc.id,
        type: 'scout-reports',
        name: data['athleteName'] || 'Scout Report',
        subtitle: data['eventName'] || data['notes']?.substring(0, 100),
        imageUrl: data['athleteImage'],
        isVerified: data['isVerified'] || false,
        route: `/scout-reports/${doc.id}`,
      } as unknown as ExploreItem);
    });
  } catch (error) {
    logger.error('Error searching scout reports', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return items;
}

/**
 * Search in Leaderboards
 */
async function searchLeaderboards(
  db: FirebaseFirestore.Firestore,
  query: string,
  limit: number
): Promise<ExploreItem[]> {
  const normalized = normalizeQuery(query);
  const items: ExploreItem[] = [];

  try {
    const snapshot = await db
      .collection(COLLECTIONS.leaderboards)
      .where('searchIndex', 'array-contains', normalized)
      .limit(limit)
      .get();

    snapshot.forEach((doc) => {
      const data = doc.data();
      items.push({
        id: doc.id,
        type: 'leaderboards',
        name: data['name'] || 'Leaderboard',
        subtitle: [data['sport'], data['category']].filter(Boolean).join(' • '),
        imageUrl: data['imageUrl'],
        isVerified: true,
        route: `/leaderboards/${doc.id}`,
      } as unknown as ExploreItem);
    });
  } catch (error) {
    logger.error('Error searching leaderboards', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return items;
}

/**
 * Perform search based on tab
 */
async function performSearch(
  db: FirebaseFirestore.Firestore,
  query: string,
  tab: ExploreTabId,
  limit: number
): Promise<ExploreItem[]> {
  switch (tab) {
    case 'athletes':
      return searchAthletes(db, query, limit);
    case 'colleges':
      return searchColleges(db, query, limit);
    case 'teams':
      return searchTeams(db, query, limit);
    case 'videos':
      return searchVideos(db, query, limit);
    case 'camps':
      return searchCamps(db, query, limit);
    case 'events':
      return searchEvents(db, query, limit);
    case 'scout-reports':
      return searchScoutReports(db, query, limit);
    case 'leaderboards':
      return searchLeaderboards(db, query, limit);
    default:
      return [];
  }
}

/**
 * Get counts for all tabs
 */
async function getTabCounts(
  db: FirebaseFirestore.Firestore,
  query: string
): Promise<ExploreTabCounts> {
  const normalized = normalizeQuery(query);

  // Run all counts in parallel for better performance
  const [athletes, colleges, teams, videos, camps, events, scoutReports, leaderboards] =
    await Promise.all([
      db
        .collection(COLLECTIONS.users)
        .where('accountType', '==', 'athlete')
        .where('searchIndex', 'array-contains', normalized)
        .count()
        .get(),
      db
        .collection(COLLECTIONS.colleges)
        .where('searchIndex', 'array-contains', normalized)
        .count()
        .get(),
      db
        .collection(COLLECTIONS.teams)
        .where('searchIndex', 'array-contains', normalized)
        .count()
        .get(),
      db
        .collection(COLLECTIONS.videos)
        .where('searchIndex', 'array-contains', normalized)
        .count()
        .get(),
      db
        .collection(COLLECTIONS.camps)
        .where('searchIndex', 'array-contains', normalized)
        .count()
        .get(),
      db
        .collection(COLLECTIONS.events)
        .where('searchIndex', 'array-contains', normalized)
        .count()
        .get(),
      db
        .collection(COLLECTIONS.scoutReports)
        .where('searchIndex', 'array-contains', normalized)
        .count()
        .get(),
      db
        .collection(COLLECTIONS.leaderboards)
        .where('searchIndex', 'array-contains', normalized)
        .count()
        .get(),
    ]);

  return {
    'for-you': 0,
    feed: 0,
    following: 0,
    news: 0,
    athletes: athletes.data().count,
    colleges: colleges.data().count,
    teams: teams.data().count,
    videos: videos.data().count,
    camps: camps.data().count,
    events: events.data().count,
    'scout-reports': scoutReports.data().count,
    leaderboards: leaderboards.data().count,
  };
}

// ============================================
// ROUTE HANDLERS
// ============================================

/**
 * Search across all content types
 * GET /api/v1/explore/search
 *
 * Query parameters:
 * - q: Search query string (required)
 * - tab: Tab filter (default: 'colleges')
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 * - sortBy: Sort option
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = (req.query['q'] as string) || '';
    const tab = (req.query['tab'] as ExploreTabId) || 'colleges';
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 20;

    // Validate query
    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters',
      });
    }

    // Check cache first (cache-first architecture)
    const cacheKey = cacheHelper.buildKey({ query, tab, page, limit });
    const cached = await cacheHelper.get<ExploreSearchResponse>('search', cacheKey);
    if (cached) {
      logger.info('Search cache hit', { query, tab });
      res.set('X-Cache-Status', 'HIT');
      return res.json({ ...cached, cached: true });
    }

    // Get Firestore instance
    const db = req.firebase?.db;
    if (!db) {
      throw new Error('Firestore not initialized');
    }

    // Perform search
    const items = await performSearch(db, query, tab, limit);

    // Build pagination
    const total = items.length;
    const totalPages = Math.ceil(total / limit);
    const hasMore = page < totalPages;

    const pagination: ExplorePagination = {
      page,
      limit,
      total,
      totalPages,
      hasMore,
    };

    // Build response
    const response: ExploreSearchResponse = {
      success: true,
      items,
      pagination,
    };

    // Cache the result
    await cacheHelper.set('search', cacheKey, response, CACHE_TTL.search);

    res.set('X-Cache-Status', 'MISS');
    return res.json({ ...response, cached: false });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Search error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      error: 'Failed to perform search',
    });
  }
});

/**
 * Get search suggestions
 * GET /api/v1/explore/suggestions
 *
 * Query parameters:
 * - q: Partial search query
 * - limit: Maximum suggestions (default: 8)
 */
router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const query = (req.query['q'] as string) || '';
    const limit = parseInt(req.query['limit'] as string) || 8;

    if (!query || query.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: [],
      });
    }

    // Check cache
    const cacheKey = `${query}:${limit}`;
    const cached = await cacheHelper.get<readonly string[]>('suggestions', cacheKey);
    if (cached) {
      res.set('X-Cache-Status', 'HIT');
      return res.json({
        success: true,
        suggestions: cached,
        cached: true,
      });
    }

    const db = req.firebase?.db;
    if (!db) {
      throw new Error('Firestore not initialized');
    }

    // Get suggestions from various sources
    const normalized = normalizeQuery(query);
    const suggestions: string[] = [];

    // This is a simplified implementation
    // In production, you'd want a dedicated suggestions collection or service
    const [athletesSnap, collegesSnap] = await Promise.all([
      db
        .collection(COLLECTIONS.users)
        .where('accountType', '==', 'athlete')
        .where('searchIndex', 'array-contains', normalized)
        .limit(limit)
        .get(),
      db
        .collection(COLLECTIONS.colleges)
        .where('searchIndex', 'array-contains', normalized)
        .limit(limit)
        .get(),
    ]);

    athletesSnap.forEach((doc) => {
      const data = doc.data();
      suggestions.push(data['displayName'] || `${data['firstName']} ${data['lastName']}`);
    });

    collegesSnap.forEach((doc) => {
      const data = doc.data();
      suggestions.push(data['name']);
    });

    // Deduplicate and limit
    const uniqueSuggestions = [...new Set(suggestions)].slice(0, limit);

    // Cache
    await cacheHelper.set('suggestions', cacheKey, uniqueSuggestions, CACHE_TTL.suggestions);

    res.set('X-Cache-Status', 'MISS');
    return res.json({
      success: true,
      suggestions: uniqueSuggestions,
      cached: false,
    });
  } catch (error) {
    logger.error('Suggestions error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to get suggestions',
    });
  }
});

/**
 * Get trending content
 * GET /api/v1/explore/trending
 *
 * Query parameters:
 * - limit: Maximum items (default: 10)
 */
router.get('/trending', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query['limit'] as string) || 10;

    // Check cache first
    const cacheKey = `${limit}`;
    const cached = await cacheHelper.get<string[]>('trending', cacheKey);
    if (cached) {
      res.set('X-Cache-Status', 'HIT');
      return res.json({
        success: true,
        trending: cached,
        cached: true,
      });
    }

    const db = req.firebase?.db;
    if (!db) {
      throw new Error('Firestore not initialized');
    }

    // Get trending items (most viewed/popular in last 24h)
    // This is a simplified implementation
    const videosSnap = await db
      .collection(COLLECTIONS.videos)
      .orderBy('views', 'desc')
      .limit(limit)
      .get();

    const trending: string[] = [];
    videosSnap.forEach((doc) => {
      const data = doc.data();
      trending.push(data['title']);
    });

    await cacheHelper.set('trending', cacheKey, trending, CACHE_TTL.trending);

    res.set('X-Cache-Status', 'MISS');
    return res.json({
      success: true,
      trending,
      cached: false,
    });
  } catch (error) {
    logger.error('Trending error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to get trending content',
    });
  }
});

/**
 * Get result counts by tab
 * GET /api/v1/explore/counts
 *
 * Query parameters:
 * - q: Search query
 */
router.get('/counts', async (req: Request, res: Response) => {
  try {
    const query = (req.query['q'] as string) || '';

    if (!query || query.trim().length < 2) {
      // Return zeros if no valid query
      return res.json({
        success: true,
        counts: {
          athletes: 0,
          colleges: 0,
          teams: 0,
          videos: 0,
          camps: 0,
          events: 0,
          'scout-reports': 0,
          leaderboards: 0,
        },
      });
    }

    // Check cache
    const cacheKey = query;
    const cached = await cacheHelper.get<ExploreTabCounts>('counts', cacheKey);
    if (cached) {
      res.set('X-Cache-Status', 'HIT');
      return res.json({
        success: true,
        counts: cached,
        cached: true,
      });
    }

    const db = req.firebase?.db;
    if (!db) {
      throw new Error('Firestore not initialized');
    }

    // Get counts
    const counts = await getTabCounts(db, query);

    // Cache
    await cacheHelper.set('counts', cacheKey, counts, CACHE_TTL.counts);

    res.set('X-Cache-Status', 'MISS');
    return res.json({
      success: true,
      counts,
      cached: false,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Counts error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      error: 'Failed to get counts',
    });
  }
});

export default router;
