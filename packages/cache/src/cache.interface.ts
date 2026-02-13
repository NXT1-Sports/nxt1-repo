/**
 * @fileoverview Cache Service Interface
 * @module @nxt1/cache
 * @version 1.0.0
 *
 * Abstraction layer for caching with Redis primary and in-memory fallback.
 */

export interface CacheOptions {
  ttl?: number; // Time to live in seconds (default: 3600)
}

export interface CacheService {
  /**
   * Get value from cache
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;

  /**
   * Delete value from cache
   */
  del(key: string): Promise<void>;

  /**
   * Clear all cache
   */
  clear(): Promise<void>;

  /**
   * Check if key exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Get multiple values
   */
  mget<T>(keys: string[]): Promise<(T | null)[]>;

  /**
   * Set multiple values
   */
  mset(entries: Record<string, unknown>, options?: CacheOptions): Promise<void>;
}
