/**
 * @fileoverview LRU Cache Implementation
 * @module @nxt1/core/cache
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Bounded cache with Least Recently Used eviction strategy.
 * Best for caching API responses with predictable memory usage.
 *
 * Features:
 * - O(1) get/set/delete operations
 * - Automatic LRU eviction when full
 * - TTL-based expiration
 * - Configurable max size
 * - Statistics tracking
 *
 * @example
 * ```typescript
 * const cache = createLRUCache<ApiResponse>({
 *   maxSize: 100,
 *   ttl: 5 * 60 * 1000,
 * });
 *
 * // Most recently used items stay in cache
 * await cache.set('api:users', usersResponse);
 * await cache.get('api:users'); // Moves to front
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
 * LRU cache options
 */
export interface LRUCacheOptions extends Partial<CacheOptions> {
  /** Maximum number of entries (required for LRU) */
  maxSize: number;
}

/**
 * LRU cache instance type
 */
export interface LRUCache<T> extends Cache<T> {
  /** Get the most recently used key */
  getMostRecent(): string | null;
  /** Get the least recently used key */
  getLeastRecent(): string | null;
  /** Peek at a value without updating LRU order */
  peek(key: string): Promise<T | null>;
}

/**
 * Doubly linked list node for O(1) operations
 */
interface LRUNode<T> {
  key: string;
  entry: CacheEntry<T>;
  prev: LRUNode<T> | null;
  next: LRUNode<T> | null;
}

/**
 * Create an LRU cache instance
 * @param options - Cache configuration (maxSize required)
 * @returns LRU cache instance
 */
export function createLRUCache<T>(options: LRUCacheOptions): LRUCache<T> {
  const {
    maxSize,
    ttl = CACHE_CONFIG.DEFAULT_TTL,
    slidingExpiration = false,
    namespace = '',
    version = CACHE_CONFIG.CACHE_VERSION,
    onEvict,
    onExpire,
  } = options;

  if (maxSize <= 0) {
    throw new Error('LRU cache maxSize must be greater than 0');
  }

  // Hash map for O(1) lookup
  const map = new Map<string, LRUNode<T>>();

  // Doubly linked list head/tail for O(1) LRU operations
  let head: LRUNode<T> | null = null;
  let tail: LRUNode<T> | null = null;

  const stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    expirations: 0,
  };

  /**
   * Get full key with namespace
   */
  function getKey(key: string): string {
    return namespace ? `${namespace}${key}` : key;
  }

  /**
   * Move node to front (most recently used)
   */
  function moveToFront(node: LRUNode<T>): void {
    if (node === head) return;

    // Remove from current position
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === tail) tail = node.prev;

    // Move to front
    node.prev = null;
    node.next = head;
    if (head) head.prev = node;
    head = node;
    if (!tail) tail = node;
  }

  /**
   * Remove node from list
   */
  function removeNode(node: LRUNode<T>): void {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === head) head = node.next;
    if (node === tail) tail = node.prev;
  }

  /**
   * Add node to front
   */
  function addToFront(node: LRUNode<T>): void {
    node.prev = null;
    node.next = head;
    if (head) head.prev = node;
    head = node;
    if (!tail) tail = node;
  }

  /**
   * Evict least recently used entry
   */
  function evictLRU(): void {
    if (!tail) return;

    const evicted = tail;
    removeNode(evicted);
    map.delete(evicted.key);
    stats.evictions++;

    if (onEvict) {
      onEvict(evicted.key, evicted.entry);
    }
  }

  /**
   * Remove expired entry
   */
  function handleExpired(key: string, node: LRUNode<T>): void {
    removeNode(node);
    map.delete(key);
    stats.expirations++;

    if (onExpire) {
      onExpire(key, node.entry);
    }
  }

  return {
    async get(key: string): Promise<T | null> {
      const fullKey = getKey(key);
      const node = map.get(fullKey);

      if (!node) {
        stats.misses++;
        return null;
      }

      if (isExpired(node.entry)) {
        handleExpired(fullKey, node);
        stats.misses++;
        return null;
      }

      // Update entry and move to front
      node.entry = touchCacheEntry(node.entry, slidingExpiration, ttl);
      moveToFront(node);
      stats.hits++;

      return node.entry.data;
    },

    async set(key: string, value: T, customTtl?: number): Promise<void> {
      const fullKey = getKey(key);
      const existingNode = map.get(fullKey);

      if (existingNode) {
        // Update existing entry
        existingNode.entry = createCacheEntry(value, customTtl ?? ttl, undefined, version);
        moveToFront(existingNode);
        return;
      }

      // Evict if at capacity
      if (map.size >= maxSize) {
        evictLRU();
      }

      // Create new node
      const node: LRUNode<T> = {
        key: fullKey,
        entry: createCacheEntry(value, customTtl ?? ttl, undefined, version),
        prev: null,
        next: null,
      };

      map.set(fullKey, node);
      addToFront(node);
    },

    async has(key: string): Promise<boolean> {
      const fullKey = getKey(key);
      const node = map.get(fullKey);
      return node !== undefined && !isExpired(node.entry);
    },

    async delete(key: string): Promise<boolean> {
      const fullKey = getKey(key);
      const node = map.get(fullKey);

      if (!node) return false;

      removeNode(node);
      map.delete(fullKey);
      return true;
    },

    async clear(prefix?: string): Promise<void> {
      if (prefix) {
        const keysToDelete: string[] = [];
        map.forEach((_, key) => {
          if (key.startsWith(prefix)) {
            keysToDelete.push(key);
          }
        });
        for (const key of keysToDelete) {
          const node = map.get(key);
          if (node) {
            removeNode(node);
            map.delete(key);
          }
        }
      } else {
        map.clear();
        head = null;
        tail = null;
      }
    },

    getStats(): CacheStats {
      // Convert to Map<string, CacheEntry<T>> for stats calculation
      const entries = new Map<string, CacheEntry<T>>();
      map.forEach((node, key) => {
        entries.set(key, node.entry);
      });
      return calculateCacheStats(entries, stats);
    },

    async keys(): Promise<string[]> {
      return Array.from(map.keys());
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
      const keysToDelete: string[] = [];

      map.forEach((_, key) => {
        if (matchPattern(key, pattern)) {
          keysToDelete.push(key);
        }
      });

      for (const key of keysToDelete) {
        await this.delete(key);
      }

      return keysToDelete.length;
    },

    async getMetadata(key: string): Promise<Omit<CacheEntry<T>, 'data'> | null> {
      const fullKey = getKey(key);
      const node = map.get(fullKey);

      if (!node || isExpired(node.entry)) {
        return null;
      }

      const { data: _, ...metadata } = node.entry;
      return metadata;
    },

    getMostRecent(): string | null {
      return head?.key ?? null;
    },

    getLeastRecent(): string | null {
      return tail?.key ?? null;
    },

    async peek(key: string): Promise<T | null> {
      const fullKey = getKey(key);
      const node = map.get(fullKey);

      if (!node || isExpired(node.entry)) {
        return null;
      }

      // Don't update access stats or LRU order
      return node.entry.data;
    },
  };
}
