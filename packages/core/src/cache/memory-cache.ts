/**
 * @fileoverview In-Memory Cache Implementation
 * @module @nxt1/core/cache
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Fast in-memory cache with TTL support.
 * Best for short-lived data that doesn't need to survive page refreshes.
 *
 * Features:
 * - O(1) get/set operations
 * - TTL-based expiration
 * - Optional sliding expiration
 * - Statistics tracking
 * - Pattern-based invalidation
 *
 * @example
 * ```typescript
 * const cache = createMemoryCache<User>({
 *   ttl: 5 * 60 * 1000, // 5 minutes
 *   maxSize: 100,
 * });
 *
 * await cache.set('user:123', userData);
 * const user = await cache.get('user:123');
 * ```
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import type { Cache, CacheEntry, CacheOptions, CacheStats } from './cache.types';
import { CACHE_CONFIG } from './cache.constants';
import {
  isExpired,
  createCacheEntry,
  touchCacheEntry,
  calculateCacheStats,
  matchPattern,
} from './cache.utils';

/**
 * Memory cache options
 */
export interface MemoryCacheOptions extends Partial<CacheOptions> {
  /** Enable automatic cleanup interval */
  autoCleanup?: boolean;
  /** Cleanup interval in ms (default: 60s) */
  cleanupInterval?: number;
}

/**
 * Memory cache instance type
 */
export interface MemoryCache<T> extends Cache<T> {
  /** Force cleanup of expired entries */
  cleanup(): void;
  /** Destroy the cache and clear intervals */
  destroy(): void;
}

/**
 * Create an in-memory cache instance
 * @param options - Cache configuration
 * @returns Memory cache instance
 */
export function createMemoryCache<T>(options: MemoryCacheOptions = {}): MemoryCache<T> {
  const {
    ttl = CACHE_CONFIG.DEFAULT_TTL,
    maxSize = CACHE_CONFIG.DEFAULT_MAX_SIZE,
    slidingExpiration = false,
    namespace = '',
    version = CACHE_CONFIG.CACHE_VERSION,
    onEvict,
    onExpire,
    autoCleanup = true,
    cleanupInterval = 60000,
  } = options;

  // Internal state
  const entries = new Map<string, CacheEntry<T>>();
  const stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    expirations: 0,
  };

  let cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Start auto-cleanup if enabled
  if (autoCleanup && typeof setInterval !== 'undefined') {
    cleanupTimer = setInterval(() => cleanup(), cleanupInterval);
  }

  /**
   * Get full key with namespace
   */
  function getKey(key: string): string {
    return namespace ? `${namespace}${key}` : key;
  }

  /**
   * Evict oldest entry when at max size
   */
  function evictIfNeeded(): void {
    if (entries.size >= maxSize) {
      // Find oldest entry
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      entries.forEach((entry, key) => {
        if (entry.lastAccessedAt < oldestTime) {
          oldestTime = entry.lastAccessedAt;
          oldestKey = key;
        }
      });

      if (oldestKey) {
        const entry = entries.get(oldestKey);
        entries.delete(oldestKey);
        stats.evictions++;
        if (onEvict && entry) {
          onEvict(oldestKey, entry);
        }
      }
    }
  }

  /**
   * Cleanup expired entries
   */
  function cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    entries.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => {
      const entry = entries.get(key);
      entries.delete(key);
      stats.expirations++;
      if (onExpire && entry) {
        onExpire(key, entry);
      }
    });
  }

  return {
    async get(key: string): Promise<T | null> {
      const fullKey = getKey(key);
      const entry = entries.get(fullKey);

      if (!entry || isExpired(entry)) {
        if (entry) {
          entries.delete(fullKey);
          stats.expirations++;
          if (onExpire) onExpire(fullKey, entry);
        }
        stats.misses++;
        return null;
      }

      // Update access stats
      entries.set(fullKey, touchCacheEntry(entry, slidingExpiration, ttl));
      stats.hits++;

      return entry.data;
    },

    async set(key: string, value: T, customTtl?: number): Promise<void> {
      const fullKey = getKey(key);
      evictIfNeeded();

      const entry = createCacheEntry(value, customTtl ?? ttl, undefined, version);
      entries.set(fullKey, entry);
    },

    async has(key: string): Promise<boolean> {
      const fullKey = getKey(key);
      const entry = entries.get(fullKey);
      return entry !== undefined && !isExpired(entry);
    },

    async delete(key: string): Promise<boolean> {
      const fullKey = getKey(key);
      return entries.delete(fullKey);
    },

    async clear(prefix?: string): Promise<void> {
      if (prefix) {
        const keysToDelete: string[] = [];
        entries.forEach((_, key) => {
          if (key.startsWith(prefix)) {
            keysToDelete.push(key);
          }
        });
        keysToDelete.forEach((key) => entries.delete(key));
      } else {
        entries.clear();
      }
    },

    getStats(): CacheStats {
      return calculateCacheStats(entries, stats);
    },

    async keys(): Promise<string[]> {
      return Array.from(entries.keys());
    },

    async getOrSet(key: string, factory: () => Promise<T>, customTtl?: number): Promise<T> {
      const cached = await this.get(key);
      if (cached !== null) {
        return cached;
      }

      const value = await factory();
      await this.set(key, value, customTtl);
      return value;
    },

    async invalidate(pattern: string): Promise<number> {
      // Apply namespace so pattern matches stored keys (which include namespace prefix)
      const namespacedPattern = getKey(pattern);
      const keysToDelete: string[] = [];

      entries.forEach((_, key) => {
        if (matchPattern(key, namespacedPattern)) {
          keysToDelete.push(key);
        }
      });

      keysToDelete.forEach((key) => entries.delete(key));
      return keysToDelete.length;
    },

    async getMetadata(key: string): Promise<Omit<CacheEntry<T>, 'data'> | null> {
      const fullKey = getKey(key);
      const entry = entries.get(fullKey);

      if (!entry || isExpired(entry)) {
        return null;
      }

      const { data: _, ...metadata } = entry;
      return metadata;
    },

    cleanup,

    destroy(): void {
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
      }
      entries.clear();
    },
  };
}
