/**
 * @fileoverview Cache Module Tests
 * @module @nxt1/core/cache
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createMemoryCache,
  createLRUCache,
  createPersistentCache,
  generateCacheKey,
  isExpired,
  createCacheKeyGenerator,
  CACHE_CONFIG,
  CACHE_KEYS,
} from './index';
import type { CacheEntry } from './cache.types';
import type { StorageAdapter } from '../storage/storage-adapter';

// ============================================
// MEMORY CACHE TESTS
// ============================================

describe('createMemoryCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should set and get values', async () => {
    const cache = createMemoryCache<string>({ ttl: 60000 });

    await cache.set('key1', 'value1');
    const result = await cache.get('key1');

    expect(result).toBe('value1');
  });

  it('should return null for non-existent keys', async () => {
    const cache = createMemoryCache<string>();

    const result = await cache.get('nonexistent');

    expect(result).toBeNull();
  });

  it('should expire entries after TTL', async () => {
    const cache = createMemoryCache<string>({ ttl: 1000 });

    await cache.set('key1', 'value1');
    expect(await cache.get('key1')).toBe('value1');

    // Advance time past TTL
    vi.advanceTimersByTime(1001);

    expect(await cache.get('key1')).toBeNull();
  });

  it('should delete entries', async () => {
    const cache = createMemoryCache<string>();

    await cache.set('key1', 'value1');
    expect(await cache.has('key1')).toBe(true);

    await cache.delete('key1');
    expect(await cache.has('key1')).toBe(false);
  });

  it('should clear all entries', async () => {
    const cache = createMemoryCache<string>();

    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');

    await cache.clear();

    expect(await cache.get('key1')).toBeNull();
    expect(await cache.get('key2')).toBeNull();
  });

  it('should clear entries by prefix', async () => {
    const cache = createMemoryCache<string>();

    await cache.set('user:1', 'user1');
    await cache.set('user:2', 'user2');
    await cache.set('team:1', 'team1');

    await cache.clear('user:');

    expect(await cache.get('user:1')).toBeNull();
    expect(await cache.get('user:2')).toBeNull();
    expect(await cache.get('team:1')).toBe('team1');
  });

  it('should track statistics', async () => {
    const cache = createMemoryCache<string>();

    await cache.set('key1', 'value1');
    await cache.get('key1'); // hit
    await cache.get('key1'); // hit
    await cache.get('nonexistent'); // miss

    const stats = cache.getStats();

    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.size).toBe(1);
  });

  it('should use getOrSet pattern', async () => {
    const cache = createMemoryCache<string>();
    const factory = vi.fn().mockResolvedValue('computed');

    // First call should invoke factory
    const result1 = await cache.getOrSet('key1', factory);
    expect(result1).toBe('computed');
    expect(factory).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const result2 = await cache.getOrSet('key1', factory);
    expect(result2).toBe('computed');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('should support sliding expiration', async () => {
    const cache = createMemoryCache<string>({
      ttl: 1000,
      slidingExpiration: true,
    });

    await cache.set('key1', 'value1');

    // Access before expiry (extends TTL)
    vi.advanceTimersByTime(500);
    expect(await cache.get('key1')).toBe('value1');

    // Should still be valid (TTL was extended)
    vi.advanceTimersByTime(500);
    expect(await cache.get('key1')).toBe('value1');
  });

  it('should invalidate by pattern', async () => {
    const cache = createMemoryCache<string>();

    await cache.set('user:profile:1', 'profile1');
    await cache.set('user:profile:2', 'profile2');
    await cache.set('user:settings:1', 'settings1');

    const count = await cache.invalidate('user:profile:*');

    expect(count).toBe(2);
    expect(await cache.get('user:profile:1')).toBeNull();
    expect(await cache.get('user:settings:1')).toBe('settings1');
  });
});

// ============================================
// LRU CACHE TESTS
// ============================================

describe('createLRUCache', () => {
  it('should evict least recently used when full', async () => {
    const cache = createLRUCache<string>({ maxSize: 2, ttl: 60000 });

    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');

    // Access key1 to make it more recent
    await cache.get('key1');

    // Add third item - should evict key2
    await cache.set('key3', 'value3');

    expect(await cache.get('key1')).toBe('value1');
    expect(await cache.get('key2')).toBeNull();
    expect(await cache.get('key3')).toBe('value3');
  });

  it('should track most/least recent', async () => {
    const cache = createLRUCache<string>({ maxSize: 3, ttl: 60000 });

    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.set('key3', 'value3');

    expect(cache.getMostRecent()).toBe('key3');
    expect(cache.getLeastRecent()).toBe('key1');

    // Access key1 - moves to front
    await cache.get('key1');

    expect(cache.getMostRecent()).toBe('key1');
    expect(cache.getLeastRecent()).toBe('key2');
  });

  it('should peek without updating order', async () => {
    const cache = createLRUCache<string>({ maxSize: 3, ttl: 60000 });

    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');

    // Peek doesn't update LRU order
    const peeked = await cache.peek('key1');
    expect(peeked).toBe('value1');
    expect(cache.getMostRecent()).toBe('key2');
  });

  it('should throw on invalid maxSize', () => {
    expect(() => createLRUCache({ maxSize: 0 })).toThrow();
    expect(() => createLRUCache({ maxSize: -1 })).toThrow();
  });
});

// ============================================
// PERSISTENT CACHE TESTS
// ============================================

describe('createPersistentCache', () => {
  let mockStorage: StorageAdapter;
  let storageData: Map<string, string>;

  beforeEach(() => {
    storageData = new Map();
    mockStorage = {
      get: vi.fn((key: string) => Promise.resolve(storageData.get(key) ?? null)),
      set: vi.fn((key: string, value: string) => {
        storageData.set(key, value);
        return Promise.resolve();
      }),
      remove: vi.fn((key: string) => {
        storageData.delete(key);
        return Promise.resolve();
      }),
      clear: vi.fn(() => {
        storageData.clear();
        return Promise.resolve();
      }),
      keys: vi.fn(() => Promise.resolve(Array.from(storageData.keys()))),
      has: vi.fn((key: string) => Promise.resolve(storageData.has(key))),
      getJSON: vi.fn(),
      setJSON: vi.fn(),
    };
  });

  it('should persist values to storage', async () => {
    const cache = createPersistentCache<string>(mockStorage, { ttl: 60000 });

    await cache.set('key1', 'value1');

    expect(mockStorage.set).toHaveBeenCalled();
    expect(storageData.size).toBe(1);
  });

  it('should retrieve values from storage', async () => {
    const cache = createPersistentCache<string>(mockStorage, { ttl: 60000 });

    await cache.set('key1', 'value1');
    const result = await cache.get('key1');

    expect(result).toBe('value1');
  });

  it('should include namespace in storage key', async () => {
    const cache = createPersistentCache<string>(mockStorage, {
      ttl: 60000,
      namespace: 'test:',
    });

    await cache.set('key1', 'value1');

    const storedKey = Array.from(storageData.keys())[0];
    expect(storedKey).toContain('test:');
  });
});

// ============================================
// UTILITY TESTS
// ============================================

describe('generateCacheKey', () => {
  it('should generate key from URL', () => {
    const key = generateCacheKey('/api/users');
    expect(key).toBe('/api/users');
  });

  it('should include sorted params', () => {
    const key = generateCacheKey('/api/users', { page: 2, sort: 'name' });
    expect(key).toBe('/api/users?page=2&sort=name');
  });

  it('should exclude undefined params', () => {
    const key = generateCacheKey('/api/users', { page: 1, filter: undefined });
    expect(key).toBe('/api/users?page=1');
  });

  it('should sort params alphabetically', () => {
    const key = generateCacheKey('/api/users', { z: 1, a: 2, m: 3 });
    expect(key).toBe('/api/users?a=2&m=3&z=1');
  });
});

describe('isExpired', () => {
  it('should return true for null entry', () => {
    expect(isExpired(null)).toBe(true);
  });

  it('should return true for expired entry', () => {
    const entry: CacheEntry<string> = {
      data: 'test',
      createdAt: Date.now() - 10000,
      expiresAt: Date.now() - 1000,
      hits: 0,
      lastAccessedAt: Date.now() - 10000,
    };
    expect(isExpired(entry)).toBe(true);
  });

  it('should return false for valid entry', () => {
    const entry: CacheEntry<string> = {
      data: 'test',
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
      hits: 0,
      lastAccessedAt: Date.now(),
    };
    expect(isExpired(entry)).toBe(false);
  });
});

describe('createCacheKeyGenerator', () => {
  it('should create generator with prefix', () => {
    const generator = createCacheKeyGenerator('user:profile:');
    const key = generator('123');
    expect(key).toBe('user:profile:123');
  });

  it('should handle multiple arguments', () => {
    const generator = createCacheKeyGenerator('api:');
    const key = generator('users', 'page', 1);
    expect(key).toBe('api:users:page:1');
  });

  it('should hash objects', () => {
    const generator = createCacheKeyGenerator('query:');
    const key = generator({ id: 1, name: 'test' });
    expect(key).toMatch(/^query:[a-z0-9]+$/);
  });
});

// ============================================
// CONSTANTS TESTS
// ============================================

describe('CACHE_CONFIG', () => {
  it('should have correct TTL values', () => {
    expect(CACHE_CONFIG.SHORT_TTL).toBe(60 * 1000);
    expect(CACHE_CONFIG.MEDIUM_TTL).toBe(15 * 60 * 1000);
    expect(CACHE_CONFIG.LONG_TTL).toBe(60 * 60 * 1000);
    expect(CACHE_CONFIG.EXTENDED_TTL).toBe(24 * 60 * 60 * 1000);
  });

  it('should have default sizes', () => {
    expect(CACHE_CONFIG.DEFAULT_MAX_SIZE).toBe(100);
    expect(CACHE_CONFIG.SMALL_MAX_SIZE).toBe(25);
    expect(CACHE_CONFIG.LARGE_MAX_SIZE).toBe(500);
  });
});

describe('CACHE_KEYS', () => {
  it('should have all expected prefixes', () => {
    expect(CACHE_KEYS.USER_PROFILE).toBe('user:profile:');
    expect(CACHE_KEYS.TEAM_DETAILS).toBe('team:details:');
    expect(CACHE_KEYS.COLLEGE_LIST).toBe('college:list');
    expect(CACHE_KEYS.API_RESPONSE).toBe('api:');
  });
});
