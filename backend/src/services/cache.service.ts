/**
 * Cache Service - Wrapper around @nxt1/cache for backend usage
 *
 * This service provides a singleton cache instance with Redis + Memory fallback
 */
import { CacheFactory, MemoryCacheService, type CacheService as ICacheService } from '@nxt1/cache';
import { logger } from '../utils/logger.js';

// Singleton cache instance
let cacheInstance: ICacheService | null = null;

/**
 * Initialize cache service (call once at app startup)
 */
export async function initializeCacheService(): Promise<ICacheService> {
  if (cacheInstance) {
    logger.warn('[Cache] Cache service already initialized');
    return cacheInstance;
  }

  logger.info('[Cache] Initializing cache service...');

  try {
    const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
    cacheInstance = await CacheFactory.create(redisUrl);

    logger.info('[Cache] ✅ Cache service initialized');

    // Test connection (optional, don't fail if test fails)
    try {
      await cacheInstance.set('health-check', 'ok', { ttl: 10 });
      const test = await cacheInstance.get('health-check');

      if (test === 'ok') {
        logger.info('[Cache] ✅ Cache connectivity verified');
      } else {
        logger.warn('[Cache] ⚠️ Cache test failed, but service available');
      }
    } catch (testError) {
      logger.warn('[Cache] ⚠️ Cache test failed (using fallback):', { error: testError });
    }
  } catch (error) {
    logger.error('[Cache] Failed to initialize cache, using in-memory fallback:', { error });
    // Create memory cache fallback
    cacheInstance = new MemoryCacheService();
    logger.info('[Cache] ✅ Memory cache fallback initialized');
  }

  return cacheInstance!;
}

/**
 * Get cache service instance (must call initializeCacheService first)
 */
export function getCacheService(): ICacheService {
  if (!cacheInstance) {
    throw new Error('[Cache] Cache service not initialized. Call initializeCacheService() first.');
  }
  return cacheInstance;
}

/**
 * Generate deterministic cache key from parameters
 *
 * @example
 * generateCacheKey('colleges:filter', { sport: 'Football', state: 'TX' })
 * // => 'colleges:filter:sport:Football:state:TX'
 */

export function generateCacheKey(prefix: string, params: Record<string, unknown>): string {
  const sortedParams = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => {
      const value = Array.isArray(params[key]) ? params[key].join(',') : params[key];
      return `${key}:${value}`;
    })
    .join(':');

  return sortedParams ? `${prefix}:${sortedParams}` : prefix;
}

/**
 * Cache TTL presets (in seconds)
 *
 * Choose based on data characteristics:
 * - COLLEGES: Static data, rarely changes → 24 hours
 * - SEARCH: Semi-static results → 15 minutes
 * - PROFILES: User data, can change → 5 minutes
 * - FEED: Dynamic content → 2 minutes
 */
export const CACHE_TTL = {
  // Static data (admin-managed)
  COLLEGES: 86400, // 24 hours
  DIVISIONS: 86400, // 24 hours
  SPORTS: 86400, // 24 hours

  // Semi-static (updated periodically)
  RANKINGS: 21600, // 6 hours
  LEADERBOARDS: 21600, // 6 hours
  SEARCH: 900, // 15 minutes
  TRENDING: 1800, // 30 minutes

  // Dynamic user data
  PROFILES: 300, // 5 minutes
  FOLLOWERS: 300, // 5 minutes

  // Fast-changing content
  FEED: 120, // 2 minutes
  POSTS: 180, // 3 minutes
  COMMENTS: 60, // 1 minute

  // Counts/stats
  COUNTS: 60, // 1 minute
  STATS: 300, // 5 minutes
} as const;

/**
 * Cache statistics tracking (optional, for monitoring)
 */
interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
}

const stats: CacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
  deletes: 0,
};

export function getCacheStats(): CacheStats & { hitRate: string } {
  const total = stats.hits + stats.misses;
  const hitRate = total > 0 ? ((stats.hits / total) * 100).toFixed(1) : '0.0';

  return {
    ...stats,
    hitRate: `${hitRate}%`,
  };
}

export function incrementCacheHit(): void {
  stats.hits++;
}

export function incrementCacheMiss(): void {
  stats.misses++;
}

export function incrementCacheSet(): void {
  stats.sets++;
}

export function incrementCacheDelete(): void {
  stats.deletes++;
}
