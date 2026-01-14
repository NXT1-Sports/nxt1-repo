/**
 * @fileoverview Cache Utilities
 * @module @nxt1/core/cache
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Pure utility functions for cache operations.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import type { CacheEntry, CacheKeyGenerator } from './cache.types';
import { CACHE_CONFIG } from './cache.constants';

/**
 * Check if a cache entry is expired
 * @param entry - Cache entry to check
 * @returns True if expired
 */
export function isExpired<T>(entry: CacheEntry<T> | null): boolean {
  if (!entry) return true;
  return Date.now() > entry.expiresAt;
}

/**
 * Check if entry is stale but within revalidation window
 * @param entry - Cache entry to check
 * @returns True if stale but usable
 */
export function isStaleButUsable<T>(entry: CacheEntry<T> | null): boolean {
  if (!entry) return false;
  const now = Date.now();
  const isExpired = now > entry.expiresAt;
  const withinStaleWindow = now < entry.expiresAt + CACHE_CONFIG.MAX_STALE_AGE;
  return isExpired && withinStaleWindow;
}

/**
 * Generate a cache key from URL and params
 * @param url - Base URL
 * @param params - Optional query parameters
 * @returns Cache key string
 */
export function generateCacheKey(
  url: string,
  params?: Record<string, string | number | boolean | undefined>
): string {
  let key = url;

  if (params && Object.keys(params).length > 0) {
    const sortedParams = Object.keys(params)
      .filter((k) => params[k] !== undefined)
      .sort()
      .map((k) => `${k}=${encodeURIComponent(String(params[k]))}`)
      .join('&');

    if (sortedParams) {
      key += `?${sortedParams}`;
    }
  }

  return key;
}

/**
 * Generate a hash for a cache key (for storage)
 * Simple but fast hash function for cache keys
 * @param str - String to hash
 * @returns Hash string
 */
export function hashCacheKey(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to base36 and ensure positive
  return Math.abs(hash).toString(36);
}

/**
 * Create a namespaced cache key
 * @param namespace - Key namespace/prefix
 * @param key - Base key
 * @returns Namespaced key
 */
export function namespacedKey(namespace: string, key: string): string {
  return `${namespace}${key}`;
}

/**
 * Create a cache key generator function
 * @param prefix - Key prefix
 * @returns Generator function
 *
 * @example
 * ```typescript
 * const userCacheKey = createCacheKeyGenerator('user:profile:');
 * const key = userCacheKey(userId); // 'user:profile:abc123'
 * ```
 */
export function createCacheKeyGenerator(prefix: string): CacheKeyGenerator {
  return (...args: unknown[]): string => {
    const parts = args.map((arg) => {
      if (typeof arg === 'object' && arg !== null) {
        return hashCacheKey(JSON.stringify(arg));
      }
      return String(arg);
    });
    return `${prefix}${parts.join(':')}`;
  };
}

/**
 * Create a new cache entry
 * @param data - Data to cache
 * @param ttl - Time to live in ms
 * @param etag - Optional ETag
 * @param version - Optional version
 * @returns Cache entry
 */
export function createCacheEntry<T>(
  data: T,
  ttl: number,
  etag?: string,
  version?: string
): CacheEntry<T> {
  const now = Date.now();
  return {
    data,
    createdAt: now,
    expiresAt: now + ttl,
    hits: 0,
    lastAccessedAt: now,
    etag,
    version,
  };
}

/**
 * Update cache entry on access
 * @param entry - Existing entry
 * @param slidingExpiration - Whether to extend TTL
 * @param ttl - Original TTL for sliding expiration
 * @returns Updated entry
 */
export function touchCacheEntry<T>(
  entry: CacheEntry<T>,
  slidingExpiration: boolean,
  ttl?: number
): CacheEntry<T> {
  const now = Date.now();
  return {
    ...entry,
    hits: entry.hits + 1,
    lastAccessedAt: now,
    expiresAt: slidingExpiration && ttl ? now + ttl : entry.expiresAt,
  };
}

/**
 * Calculate cache statistics
 * @param entries - Map of cache entries
 * @param stats - Current stats object
 * @returns Updated stats
 */
export function calculateCacheStats<T>(
  entries: Map<string, CacheEntry<T>>,
  stats: { hits: number; misses: number; evictions: number; expirations: number }
): {
  hits: number;
  misses: number;
  size: number;
  evictions: number;
  expirations: number;
  hitRatio: number;
  avgAge: number;
  oldestAge: number;
} {
  const now = Date.now();
  let totalAge = 0;
  let oldestAge = 0;

  entries.forEach((entry) => {
    const age = now - entry.createdAt;
    totalAge += age;
    if (age > oldestAge) {
      oldestAge = age;
    }
  });

  const size = entries.size;
  const total = stats.hits + stats.misses;

  return {
    ...stats,
    size,
    hitRatio: total > 0 ? stats.hits / total : 0,
    avgAge: size > 0 ? totalAge / size : 0,
    oldestAge,
  };
}

/**
 * Match a key against a glob pattern
 * Simple pattern matching for cache invalidation
 * @param key - Key to test
 * @param pattern - Pattern (supports * wildcard)
 * @returns True if matches
 */
export function matchPattern(key: string, pattern: string): boolean {
  // Convert glob to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special chars
    .replace(/\*/g, '.*') // Convert * to .*
    .replace(/\?/g, '.'); // Convert ? to .

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(key);
}

/**
 * Serialize data for storage
 * @param entry - Cache entry
 * @returns Serialized string
 */
export function serializeCacheEntry<T>(entry: CacheEntry<T>): string {
  return JSON.stringify(entry);
}

/**
 * Deserialize data from storage
 * @param data - Serialized string
 * @returns Cache entry or null
 */
export function deserializeCacheEntry<T>(data: string | null): CacheEntry<T> | null {
  if (!data) return null;
  try {
    return JSON.parse(data) as CacheEntry<T>;
  } catch {
    return null;
  }
}
