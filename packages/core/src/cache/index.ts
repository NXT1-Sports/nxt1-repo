/**
 * @fileoverview Cache Module Barrel Export
 * @module @nxt1/core/cache
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Production-grade caching utilities for all platforms:
 * - In-memory cache with TTL support
 * - Persistent cache using StorageAdapter
 * - LRU eviction strategy
 * - Cache key generators
 * - Cache statistics
 *
 * @example
 * ```typescript
 * // In-memory cache (fastest, lost on refresh)
 * import { createMemoryCache } from '@nxt1/core/cache';
 * const cache = createMemoryCache<User>({ ttl: 5 * 60 * 1000 });
 *
 * // Persistent cache (survives refresh, uses storage)
 * import { createPersistentCache } from '@nxt1/core/cache';
 * const cache = createPersistentCache<User>(storageAdapter, { ttl: 60 * 60 * 1000 });
 *
 * // Usage
 * await cache.set('user:123', userData);
 * const user = await cache.get('user:123');
 * ```
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

// Types
export type {
  CacheOptions,
  CacheEntry,
  CacheStats,
  Cache,
  CacheKeyGenerator,
  HttpCacheOptions,
} from './cache.types';

// Constants
export { CACHE_CONFIG, CACHE_KEYS, type CacheKeyPrefix } from './cache.constants';

// Memory cache (in-memory, fastest)
export { createMemoryCache, type MemoryCache, type MemoryCacheOptions } from './memory-cache';

// Persistent cache (uses StorageAdapter)
export {
  createPersistentCache,
  type PersistentCache,
  type PersistentCacheOptions,
} from './persistent-cache';

// LRU cache (bounded memory with eviction)
export { createLRUCache, type LRUCache, type LRUCacheOptions } from './lru-cache';

// Utilities
export { generateCacheKey, isExpired, createCacheKeyGenerator } from './cache.utils';

// Re-export StorageAdapter type for consumers
export type { StorageAdapter } from '../storage/storage-adapter';
