/**
 * Cache Service - Wrapper around @nxt1/cache for backend usage
 *
 * This service provides a singleton cache instance with Redis + Memory fallback.
 * Uses CACHE_CONFIG from @nxt1/core as the single source of truth for TTL values.
 */
import { CacheFactory, MemoryCacheService, type CacheService as ICacheService } from '@nxt1/cache';
import { CACHE_CONFIG } from '@nxt1/core';
import { logger } from '../../utils/logger.js';

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
    // Build Redis URL with optional DB index for environment isolation
    const redisHost = process.env['REDIS_URL'] || 'redis://localhost:6379';
    const redisDb = process.env['REDIS_DB'];
    const redisUrl = redisDb ? `${redisHost.replace(/\/$/, '')}/${redisDb}` : redisHost;
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
 * Convert milliseconds (from @nxt1/core CACHE_CONFIG) to seconds (for Redis TTL).
 */
function msToSeconds(ms: number): number {
  return Math.round(ms / 1000);
}

/**
 * Cache TTL presets (in seconds) — derived from @nxt1/core CACHE_CONFIG
 *
 * Choose based on data characteristics:
 * - COLLEGES/DIVISIONS/SPORTS: Static data, rarely changes → EXTENDED_TTL (24 hours)
 * - RANKINGS/LEADERBOARDS: Semi-static → LONG_TTL (1 hour)
 * - SEARCH/TRENDING: Semi-static → MEDIUM_TTL (15 minutes)
 * - PROFILES: User data, can change → MEDIUM_TTL (15 minutes)
 * - FEED/POSTS: Fast-changing → SHORT_TTL (1 minute)
 */
export const CACHE_TTL = {
  // Static data (admin-managed) — 24 hours
  COLLEGES: msToSeconds(CACHE_CONFIG.EXTENDED_TTL),
  DIVISIONS: msToSeconds(CACHE_CONFIG.EXTENDED_TTL),
  SPORTS: msToSeconds(CACHE_CONFIG.EXTENDED_TTL),

  // Semi-static (updated periodically)
  RANKINGS: msToSeconds(CACHE_CONFIG.LONG_TTL),
  LEADERBOARDS: msToSeconds(CACHE_CONFIG.LONG_TTL),
  SEARCH: msToSeconds(CACHE_CONFIG.MEDIUM_TTL),
  TRENDING: msToSeconds(CACHE_CONFIG.MEDIUM_TTL * 2),

  // Dynamic user data
  PROFILES: msToSeconds(CACHE_CONFIG.MEDIUM_TTL),

  // Fast-changing content
  FEED: msToSeconds(CACHE_CONFIG.SHORT_TTL * 2),
  POSTS: msToSeconds(CACHE_CONFIG.SHORT_TTL * 3),

  // Counts/stats
  COUNTS: msToSeconds(CACHE_CONFIG.SHORT_TTL),
  STATS: msToSeconds(CACHE_CONFIG.DEFAULT_TTL),
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

/**
 * Invalidate all cached team profile entries for a given team.
 *
 * Always removes the id-keyed entries (`team:profile:id:<teamId>:*`).
 * When the team's slug is provided, also removes slug-keyed entries
 * (`team:profile:slug:<slug>:*`).
 * When the team's teamCode is provided, also removes teamcode-keyed entries
 * (`team:profile:code:<teamCode>:*`).
 *
 * Non-blocking: errors are logged as warnings and never propagate.
 */
export async function invalidateTeamProfileCache(
  teamId: string,
  slug?: string,
  teamCode?: string
): Promise<void> {
  try {
    const cache = getCacheService();
    const tasks: Promise<void>[] = [cache.delByPrefix(`team:profile:id:${teamId}:`)];
    if (slug) {
      tasks.push(cache.delByPrefix(`team:profile:slug:${slug}:`));
    }
    if (teamCode) {
      tasks.push(cache.delByPrefix(`team:profile:code:${teamCode}:`));
    }
    await Promise.all(tasks);
    logger.debug('[Cache] Team profile cache invalidated', { teamId, slug, teamCode });
  } catch (error) {
    logger.warn('[Cache] Failed to invalidate team profile cache', {
      teamId,
      slug,
      teamCode,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
