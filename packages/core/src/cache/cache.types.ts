/**
 * @fileoverview Cache Type Definitions
 * @module @nxt1/core/cache
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Type definitions for the caching system.
 * Pure TypeScript - works on any platform.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T> {
  /** The cached data */
  data: T;

  /** Timestamp when entry was created (ms since epoch) */
  createdAt: number;

  /** Timestamp when entry expires (ms since epoch) */
  expiresAt: number;

  /** Number of times this entry has been accessed */
  hits: number;

  /** Last access timestamp */
  lastAccessedAt: number;

  /** Optional ETag for HTTP cache validation */
  etag?: string;

  /** Optional version for cache invalidation */
  version?: string;
}

/**
 * Cache configuration options
 */
export interface CacheOptions {
  /** Time-to-live in milliseconds */
  ttl: number;

  /** Maximum number of entries (for bounded caches) */
  maxSize?: number;

  /** Whether to update TTL on access (sliding expiration) */
  slidingExpiration?: boolean;

  /** Namespace prefix for cache keys */
  namespace?: string;

  /** Version string for cache invalidation */
  version?: string;

  /** Whether to compress stored data (for persistent caches) */
  compress?: boolean;

  /** Callback when entry is evicted */
  onEvict?: <T>(key: string, entry: CacheEntry<T>) => void;

  /** Callback when entry expires */
  onExpire?: <T>(key: string, entry: CacheEntry<T>) => void;
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  /** Total number of cache hits */
  hits: number;

  /** Total number of cache misses */
  misses: number;

  /** Current number of entries */
  size: number;

  /** Number of evictions */
  evictions: number;

  /** Number of expirations */
  expirations: number;

  /** Cache hit ratio (hits / (hits + misses)) */
  hitRatio: number;

  /** Average entry age in milliseconds */
  avgAge: number;

  /** Oldest entry age in milliseconds */
  oldestAge: number;
}

/**
 * Base cache interface
 */
export interface Cache<T> {
  /**
   * Get a value from the cache
   * @param key - Cache key
   * @returns Cached value or null if not found/expired
   */
  get(key: string): Promise<T | null>;

  /**
   * Set a value in the cache
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Optional TTL override in milliseconds
   */
  set(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Check if a key exists and is not expired
   * @param key - Cache key
   */
  has(key: string): Promise<boolean>;

  /**
   * Delete a specific key
   * @param key - Cache key
   */
  delete(key: string): Promise<boolean>;

  /**
   * Clear all entries (optionally by prefix)
   * @param prefix - Optional key prefix to clear
   */
  clear(prefix?: string): Promise<void>;

  /**
   * Get cache statistics
   */
  getStats(): CacheStats;

  /**
   * Get all keys in the cache
   */
  keys(): Promise<string[]>;

  /**
   * Get or set pattern - fetch from cache or compute and cache
   * @param key - Cache key
   * @param factory - Function to compute value if not cached
   * @param ttl - Optional TTL override
   */
  getOrSet(key: string, factory: () => Promise<T>, ttl?: number): Promise<T>;

  /**
   * Invalidate entries by pattern
   * @param pattern - Glob pattern or prefix
   */
  invalidate(pattern: string): Promise<number>;

  /**
   * Get entry metadata without the data
   * @param key - Cache key
   */
  getMetadata(key: string): Promise<Omit<CacheEntry<T>, 'data'> | null>;
}

/**
 * Function type for generating cache keys
 */
export type CacheKeyGenerator = (...args: unknown[]) => string;

/**
 * HTTP cache-specific options
 */
export interface HttpCacheOptions extends CacheOptions {
  /** HTTP methods to cache */
  methods?: string[];

  /** URL patterns to cache */
  urlPatterns?: RegExp[];

  /** URLs to exclude from caching */
  excludeUrls?: RegExp[];

  /** Whether to include query params in cache key */
  includeQueryParams?: boolean;

  /** Headers to include in cache key */
  varyHeaders?: string[];
}
