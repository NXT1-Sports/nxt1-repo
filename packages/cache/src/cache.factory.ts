/**
 * @fileoverview Cache Factory with Automatic Fallback
 * @module @nxt1/cache
 *
 * Creates cache service with Redis primary and in-memory fallback.
 */

import { RedisCacheService } from './redis-cache.service.js';
import { MemoryCacheService } from './memory-cache.service.js';
import type { CacheService } from './cache.interface.js';

export class CacheFactory {
  private static instance: CacheService | null = null;

  /**
   * Create or get singleton cache instance
   * Tries Redis first, falls back to in-memory if Redis unavailable
   */
  static async create(redisUrl?: string): Promise<CacheService> {
    if (this.instance) {
      return this.instance;
    }

    // Try Redis first
    try {
      const redisCache = new RedisCacheService(redisUrl);
      await redisCache.connect();
      console.log('[CacheFactory] Using Redis cache');
      this.instance = redisCache;
      return this.instance;
    } catch (error) {
      console.warn('[CacheFactory] Redis unavailable, falling back to in-memory cache:', error);
      this.instance = new MemoryCacheService();
      return this.instance;
    }
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  static reset(): void {
    this.instance = null;
  }
}

/**
 * Global cache instance getter
 */
let globalCache: CacheService | null = null;

export async function getCache(redisUrl?: string): Promise<CacheService> {
  if (!globalCache) {
    globalCache = await CacheFactory.create(redisUrl);
  }
  return globalCache;
}

export function resetCache(): void {
  globalCache = null;
  CacheFactory.reset();
}
