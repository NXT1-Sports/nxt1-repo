/**
 * @fileoverview Mobile Cache Service
 * @module @nxt1/mobile/services
 *
 * Production-grade caching service for Ionic/Capacitor mobile apps.
 *
 * Features:
 * - Persistent cache using Capacitor Preferences
 * - In-memory LRU cache for fast access
 * - Two-tier caching (memory + persistent)
 * - Automatic cache warming on app start
 * - TTL-based expiration
 * - Cache statistics
 * - Offline support
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class ProfilePage {
 *   private cache = inject(MobileCacheService);
 *
 *   async loadProfile(userId: string) {
 *     return this.cache.getOrFetch(
 *       `profile:${userId}`,
 *       () => this.api.getProfile(userId),
 *       CACHE_CONFIG.MEDIUM_TTL
 *     );
 *   }
 * }
 * ```
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import { Injectable, signal, computed } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import {
  createLRUCache,
  createPersistentCache,
  CACHE_CONFIG,
  CACHE_KEYS,
  type LRUCache,
  type PersistentCache,
  type CacheStats,
  type StorageAdapter,
} from '@nxt1/core/cache';

/**
 * Capacitor Preferences storage adapter
 */
const capacitorStorageAdapter: StorageAdapter = {
  async get(key: string): Promise<string | null> {
    const { value } = await Preferences.get({ key });
    return value;
  },

  async set(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  },

  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  },

  async clear(): Promise<void> {
    await Preferences.clear();
  },

  async keys(): Promise<string[]> {
    const { keys } = await Preferences.keys();
    return keys;
  },

  async has(key: string): Promise<boolean> {
    const { value } = await Preferences.get({ key });
    return value !== null;
  },

  async getJSON<T>(key: string): Promise<T | null> {
    const { value } = await Preferences.get({ key });
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  },

  async setJSON<T>(key: string, value: T): Promise<void> {
    await Preferences.set({ key, value: JSON.stringify(value) });
  },
};

/**
 * Cache tier type
 */
type CacheTier = 'memory' | 'persistent' | 'both';

/**
 * Mobile cache configuration
 */
interface MobileCacheConfig {
  /** Maximum memory cache entries */
  memoryMaxSize: number;
  /** Default TTL for memory cache */
  memoryTtl: number;
  /** Default TTL for persistent cache */
  persistentTtl: number;
  /** Keys to warm from persistent cache on init */
  warmupKeys: string[];
}

const DEFAULT_CONFIG: MobileCacheConfig = {
  memoryMaxSize: 50,
  memoryTtl: CACHE_CONFIG.MEDIUM_TTL,
  persistentTtl: CACHE_CONFIG.LONG_TTL,
  warmupKeys: [
    CACHE_KEYS.USER_PROFILE,
    CACHE_KEYS.USER_PREFERENCES,
    CACHE_KEYS.TEAM_LIST,
  ],
};

@Injectable({
  providedIn: 'root',
})
export class MobileCacheService {
  // Two-tier cache system
  private memoryCache: LRUCache<unknown>;
  private persistentCache: PersistentCache<unknown>;

  // Stats tracking
  private readonly _stats = signal<CacheStats | null>(null);
  readonly stats = computed(() => this._stats());

  // Cache ready signal
  private readonly _isReady = signal(false);
  readonly isReady = computed(() => this._isReady());

  constructor() {
    // Initialize memory cache (fast, volatile)
    this.memoryCache = createLRUCache({
      maxSize: DEFAULT_CONFIG.memoryMaxSize,
      ttl: DEFAULT_CONFIG.memoryTtl,
      namespace: 'mobile:',
    });

    // Initialize persistent cache (slower, survives restart)
    this.persistentCache = createPersistentCache(capacitorStorageAdapter, {
      ttl: DEFAULT_CONFIG.persistentTtl,
      namespace: 'mobile:',
    });

    // Warm cache on init
    this.warmCache();
  }

  /**
   * Warm memory cache from persistent storage
   */
  private async warmCache(): Promise<void> {
    try {
      const keys = await this.persistentCache.keys();

      // Load frequently accessed keys into memory
      for (const key of DEFAULT_CONFIG.warmupKeys) {
        const matchingKeys = keys.filter((k) => k.startsWith(key));
        for (const matchKey of matchingKeys.slice(0, 10)) {
          const value = await this.persistentCache.get(matchKey);
          if (value !== null) {
            await this.memoryCache.set(matchKey, value);
          }
        }
      }

      this._isReady.set(true);
    } catch (error) {
      console.warn('[MobileCacheService] Cache warmup failed:', error);
      this._isReady.set(true);
    }
  }

  /**
   * Get value from cache (checks memory first, then persistent)
   * @param key - Cache key
   * @param tier - Which tier to check
   */
  async get<T>(key: string, tier: CacheTier = 'both'): Promise<T | null> {
    // Try memory cache first
    if (tier === 'memory' || tier === 'both') {
      const memoryValue = await this.memoryCache.get(key);
      if (memoryValue !== null) {
        return memoryValue as T;
      }
    }

    // Try persistent cache
    if (tier === 'persistent' || tier === 'both') {
      const persistentValue = await this.persistentCache.get(key);
      if (persistentValue !== null) {
        // Promote to memory cache
        if (tier === 'both') {
          await this.memoryCache.set(key, persistentValue);
        }
        return persistentValue as T;
      }
    }

    return null;
  }

  /**
   * Set value in cache
   * @param key - Cache key
   * @param value - Value to cache
   * @param tier - Which tier to use
   * @param ttl - Optional TTL override
   */
  async set<T>(key: string, value: T, tier: CacheTier = 'both', ttl?: number): Promise<void> {
    if (tier === 'memory' || tier === 'both') {
      await this.memoryCache.set(key, value, ttl);
    }

    if (tier === 'persistent' || tier === 'both') {
      await this.persistentCache.set(key, value, ttl);
    }
  }

  /**
   * Get or fetch pattern - check cache or compute and cache
   * @param key - Cache key
   * @param fetcher - Function to fetch if not cached
   * @param ttl - TTL for cached value
   * @param tier - Which tier to use
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number,
    tier: CacheTier = 'both'
  ): Promise<T> {
    // Try cache first
    const cached = await this.get<T>(key, tier);
    if (cached !== null) {
      return cached;
    }

    // Fetch and cache
    const value = await fetcher();
    await this.set(key, value, tier, ttl);
    return value;
  }

  /**
   * Delete value from cache
   * @param key - Cache key
   * @param tier - Which tier to clear
   */
  async delete(key: string, tier: CacheTier = 'both'): Promise<void> {
    if (tier === 'memory' || tier === 'both') {
      await this.memoryCache.delete(key);
    }

    if (tier === 'persistent' || tier === 'both') {
      await this.persistentCache.delete(key);
    }
  }

  /**
   * Clear cache by pattern
   * @param pattern - Key pattern (supports * wildcard)
   * @param tier - Which tier to clear
   */
  async clear(pattern?: string, tier: CacheTier = 'both'): Promise<void> {
    if (pattern) {
      if (tier === 'memory' || tier === 'both') {
        await this.memoryCache.invalidate(pattern);
      }
      if (tier === 'persistent' || tier === 'both') {
        await this.persistentCache.invalidate(pattern);
      }
    } else {
      if (tier === 'memory' || tier === 'both') {
        await this.memoryCache.clear();
      }
      if (tier === 'persistent' || tier === 'both') {
        await this.persistentCache.clear();
      }
    }
  }

  /**
   * Invalidate user-related caches (call on logout)
   */
  async invalidateUserCache(): Promise<void> {
    await this.clear(`${CACHE_KEYS.USER_PROFILE}*`);
    await this.clear(`${CACHE_KEYS.USER_PREFERENCES}*`);
    await this.clear(`${CACHE_KEYS.AUTH_USER}*`);
    await this.clear(`${CACHE_KEYS.FEED}*`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const memStats = this.memoryCache.getStats();
    this._stats.set(memStats);
    return memStats;
  }

  /**
   * Cleanup expired entries
   */
  async cleanup(): Promise<void> {
    await this.persistentCache.cleanup();
  }
}
