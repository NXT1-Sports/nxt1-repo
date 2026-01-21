/**
 * @fileoverview Persistent Cache Implementation
 * @module @nxt1/core/cache
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Persistent cache using StorageAdapter for cross-platform storage.
 * Data survives page refreshes and app restarts.
 *
 * Features:
 * - Uses platform-agnostic StorageAdapter
 * - Works with localStorage, Capacitor Preferences, AsyncStorage
 * - TTL-based expiration
 * - Namespace support for isolation
 * - Automatic serialization/deserialization
 *
 * @example
 * ```typescript
 * // Web
 * const storage = createBrowserStorageAdapter();
 * const cache = createPersistentCache<User>(storage, { ttl: 60 * 60 * 1000 });
 *
 * // Mobile
 * const storage = createCapacitorStorageAdapter();
 * const cache = createPersistentCache<User>(storage, { ttl: 60 * 60 * 1000 });
 * ```
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import type { StorageAdapter } from '../storage/storage-adapter';
import type { Cache, CacheEntry, CacheOptions, CacheStats } from './cache.types';
import { CACHE_CONFIG } from './cache.constants';
import {
  isExpired,
  createCacheEntry,
  touchCacheEntry,
  serializeCacheEntry,
  deserializeCacheEntry,
  matchPattern,
} from './cache.utils';

/**
 * Persistent cache options
 */
export interface PersistentCacheOptions extends Partial<CacheOptions> {
  /** Storage key prefix (added to namespace) */
  storagePrefix?: string;
}

/**
 * Persistent cache instance type
 */
export interface PersistentCache<T> extends Cache<T> {
  /** Force cleanup of expired entries from storage */
  cleanup(): Promise<void>;
}

/**
 * Create a persistent cache instance using StorageAdapter
 * @param storage - Platform storage adapter
 * @param options - Cache configuration
 * @returns Persistent cache instance
 */
export function createPersistentCache<T>(
  storage: StorageAdapter,
  options: PersistentCacheOptions = {}
): PersistentCache<T> {
  const {
    ttl = CACHE_CONFIG.DEFAULT_TTL,
    slidingExpiration = false,
    namespace = '',
    version = CACHE_CONFIG.CACHE_VERSION,
    storagePrefix = CACHE_CONFIG.STORAGE_PREFIX,
    onExpire,
  } = options;

  // Stats (in-memory, reset on restart)
  const stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    expirations: 0,
  };

  /**
   * Get full storage key
   */
  function getStorageKey(key: string): string {
    return `${storagePrefix}${namespace}${key}`;
  }

  /**
   * Check and update entry version
   */
  function isValidVersion(entry: CacheEntry<T>): boolean {
    return !version || entry.version === version;
  }

  return {
    async get(key: string): Promise<T | null> {
      const storageKey = getStorageKey(key);

      try {
        const raw = await storage.get(storageKey);
        const entry = deserializeCacheEntry<T>(raw);

        if (!entry || isExpired(entry) || !isValidVersion(entry)) {
          if (entry) {
            await storage.remove(storageKey);
            stats.expirations++;
            if (onExpire) onExpire(storageKey, entry);
          }
          stats.misses++;
          return null;
        }

        // Update access stats
        if (slidingExpiration) {
          const updated = touchCacheEntry(entry, true, ttl);
          await storage.set(storageKey, serializeCacheEntry(updated));
        }

        stats.hits++;
        return entry.data;
      } catch {
        stats.misses++;
        return null;
      }
    },

    async set(key: string, value: T, customTtl?: number): Promise<void> {
      const storageKey = getStorageKey(key);
      const entry = createCacheEntry(value, customTtl ?? ttl, undefined, version);

      await storage.set(storageKey, serializeCacheEntry(entry));
    },

    async has(key: string): Promise<boolean> {
      const storageKey = getStorageKey(key);
      const raw = await storage.get(storageKey);
      const entry = deserializeCacheEntry<T>(raw);
      return entry !== null && !isExpired(entry) && isValidVersion(entry);
    },

    async delete(key: string): Promise<boolean> {
      const storageKey = getStorageKey(key);
      const exists = await storage.has(storageKey);
      if (exists) {
        await storage.remove(storageKey);
      }
      return exists;
    },

    async clear(prefix?: string): Promise<void> {
      const keys = await storage.keys();
      const fullPrefix = prefix
        ? `${storagePrefix}${namespace}${prefix}`
        : `${storagePrefix}${namespace}`;

      const keysToDelete = keys.filter((key) => key.startsWith(fullPrefix));

      await Promise.all(keysToDelete.map((key) => storage.remove(key)));
    },

    getStats(): CacheStats {
      // For persistent cache, we can't easily calculate all stats
      // Return what we have tracked in-memory
      const total = stats.hits + stats.misses;
      return {
        ...stats,
        size: 0, // Would need to scan storage
        hitRatio: total > 0 ? stats.hits / total : 0,
        avgAge: 0,
        oldestAge: 0,
      };
    },

    async keys(): Promise<string[]> {
      const allKeys = await storage.keys();
      const prefix = `${storagePrefix}${namespace}`;
      return allKeys.filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
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
      const keys = await this.keys();
      let count = 0;

      for (const key of keys) {
        if (matchPattern(key, pattern)) {
          await this.delete(key);
          count++;
        }
      }

      return count;
    },

    async getMetadata(key: string): Promise<Omit<CacheEntry<T>, 'data'> | null> {
      const storageKey = getStorageKey(key);
      const raw = await storage.get(storageKey);
      const entry = deserializeCacheEntry<T>(raw);

      if (!entry || isExpired(entry) || !isValidVersion(entry)) {
        return null;
      }

      const { data: _, ...metadata } = entry;
      return metadata;
    },

    async cleanup(): Promise<void> {
      const keys = await this.keys();
      const now = Date.now();

      for (const key of keys) {
        const storageKey = getStorageKey(key);
        const raw = await storage.get(storageKey);
        const entry = deserializeCacheEntry<T>(raw);

        if (entry && (now > entry.expiresAt || !isValidVersion(entry))) {
          await storage.remove(storageKey);
          stats.expirations++;
          if (onExpire) onExpire(storageKey, entry);
        }
      }
    },
  };
}
