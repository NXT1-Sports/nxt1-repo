/**
 * @fileoverview In-Memory Cache Implementation
 * @module @nxt1/cache
 *
 * Fallback cache implementation using in-memory Map.
 * Used when Redis is unavailable.
 */

import type { CacheService, CacheOptions } from './cache.interface.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MemoryCacheService implements CacheService {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTTL = 3600; // 1 hour in seconds

  constructor() {
    // Cleanup expired entries every minute
    setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) return null;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const ttl = (options?.ttl || this.defaultTTL) * 1000; // Convert to milliseconds
    const expiresAt = Date.now() + ttl;

    this.cache.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async exists(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map((key) => this.get<T>(key)));
  }

  async mset(entries: Record<string, unknown>, options?: CacheOptions): Promise<void> {
    const promises = Object.entries(entries).map(([key, value]) => this.set(key, value, options));
    await Promise.all(promises);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach((key) => this.cache.delete(key));

    if (expiredKeys.length > 0) {
      console.log(`[MemoryCache] Cleaned up ${expiredKeys.length} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}
