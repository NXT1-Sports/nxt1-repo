/**
 * @fileoverview Unit Tests for Memory Storage Adapter
 * @module @nxt1/core/storage
 *
 * Comprehensive tests for in-memory storage implementation.
 * Coverage target: 100%
 *
 * @version 2.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMemoryStorageAdapter, memoryStorage } from './memory-storage';

describe('createMemoryStorageAdapter', () => {
  let storage: ReturnType<typeof createMemoryStorageAdapter>;

  beforeEach(() => {
    storage = createMemoryStorageAdapter();
  });

  // ============================================
  // get() method
  // ============================================
  describe('get', () => {
    it('should return null for non-existent key', async () => {
      const result = await storage.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should return stored value', async () => {
      await storage.set('key', 'value');
      const result = await storage.get('key');
      expect(result).toBe('value');
    });

    it('should return empty string when stored', async () => {
      await storage.set('empty', '');
      const result = await storage.get('empty');
      expect(result).toBe('');
    });

    it('should handle special characters in keys', async () => {
      await storage.set('key:with:colons', 'value1');
      await storage.set('key/with/slashes', 'value2');
      await storage.set('key.with.dots', 'value3');

      expect(await storage.get('key:with:colons')).toBe('value1');
      expect(await storage.get('key/with/slashes')).toBe('value2');
      expect(await storage.get('key.with.dots')).toBe('value3');
    });

    it('should handle unicode keys and values', async () => {
      await storage.set('日本語', '値');
      await storage.set('emoji🎉', 'celebration🎊');

      expect(await storage.get('日本語')).toBe('値');
      expect(await storage.get('emoji🎉')).toBe('celebration🎊');
    });
  });

  // ============================================
  // set() method
  // ============================================
  describe('set', () => {
    it('should store a value', async () => {
      await storage.set('newKey', 'newValue');
      expect(await storage.get('newKey')).toBe('newValue');
    });

    it('should overwrite existing value', async () => {
      await storage.set('key', 'original');
      await storage.set('key', 'updated');
      expect(await storage.get('key')).toBe('updated');
    });

    it('should handle large values', async () => {
      const largeValue = 'x'.repeat(10000);
      await storage.set('large', largeValue);
      expect(await storage.get('large')).toBe(largeValue);
    });

    it('should handle JSON-like strings', async () => {
      const jsonString = '{"name":"John","age":30}';
      await storage.set('json', jsonString);
      expect(await storage.get('json')).toBe(jsonString);
    });
  });

  // ============================================
  // remove() method
  // ============================================
  describe('remove', () => {
    it('should remove existing key', async () => {
      await storage.set('toRemove', 'value');
      await storage.remove('toRemove');
      expect(await storage.get('toRemove')).toBeNull();
    });

    it('should not throw for non-existent key', async () => {
      await expect(storage.remove('nonexistent')).resolves.toBeUndefined();
    });

    it('should only remove specified key', async () => {
      await storage.set('keep1', 'value1');
      await storage.set('remove', 'value2');
      await storage.set('keep2', 'value3');

      await storage.remove('remove');

      expect(await storage.get('keep1')).toBe('value1');
      expect(await storage.get('keep2')).toBe('value3');
      expect(await storage.get('remove')).toBeNull();
    });
  });

  // ============================================
  // clear() method
  // ============================================
  describe('clear', () => {
    it('should remove all stored values', async () => {
      await storage.set('key1', 'value1');
      await storage.set('key2', 'value2');
      await storage.set('key3', 'value3');

      await storage.clear();

      expect(await storage.get('key1')).toBeNull();
      expect(await storage.get('key2')).toBeNull();
      expect(await storage.get('key3')).toBeNull();
    });

    it('should work on empty storage', async () => {
      await expect(storage.clear()).resolves.toBeUndefined();
    });

    it('should allow new values after clear', async () => {
      await storage.set('key', 'value');
      await storage.clear();
      await storage.set('newKey', 'newValue');

      expect(await storage.get('newKey')).toBe('newValue');
    });
  });

  // ============================================
  // keys() method
  // ============================================
  describe('keys', () => {
    it('should return empty array for empty storage', async () => {
      const keys = await storage.keys();
      expect(keys).toEqual([]);
    });

    it('should return all stored keys', async () => {
      await storage.set('alpha', 'a');
      await storage.set('beta', 'b');
      await storage.set('gamma', 'g');

      const keys = await storage.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('alpha');
      expect(keys).toContain('beta');
      expect(keys).toContain('gamma');
    });

    it('should reflect removed keys', async () => {
      await storage.set('keep', 'value');
      await storage.set('remove', 'value');
      await storage.remove('remove');

      const keys = await storage.keys();
      expect(keys).toEqual(['keep']);
    });

    it('should return empty after clear', async () => {
      await storage.set('key', 'value');
      await storage.clear();

      const keys = await storage.keys();
      expect(keys).toEqual([]);
    });
  });

  // ============================================
  // has() method
  // ============================================
  describe('has', () => {
    it('should return false for non-existent key', async () => {
      expect(await storage.has('nonexistent')).toBe(false);
    });

    it('should return true for existing key', async () => {
      await storage.set('exists', 'value');
      expect(await storage.has('exists')).toBe(true);
    });

    it('should return true for empty string value', async () => {
      await storage.set('empty', '');
      expect(await storage.has('empty')).toBe(true);
    });

    it('should return false after remove', async () => {
      await storage.set('key', 'value');
      await storage.remove('key');
      expect(await storage.has('key')).toBe(false);
    });
  });

  // ============================================
  // getJSON() method
  // ============================================
  describe('getJSON', () => {
    it('should return null for non-existent key', async () => {
      const result = await storage.getJSON('nonexistent');
      expect(result).toBeNull();
    });

    it('should parse and return JSON object', async () => {
      await storage.set('user', '{"name":"John","age":30}');
      const result = await storage.getJSON<{ name: string; age: number }>('user');
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('should parse and return JSON array', async () => {
      await storage.set('items', '[1,2,3,4,5]');
      const result = await storage.getJSON<number[]>('items');
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should parse primitive values', async () => {
      await storage.set('num', '42');
      await storage.set('bool', 'true');
      await storage.set('null', 'null');
      await storage.set('str', '"hello"');

      expect(await storage.getJSON<number>('num')).toBe(42);
      expect(await storage.getJSON<boolean>('bool')).toBe(true);
      expect(await storage.getJSON<null>('null')).toBe(null);
      expect(await storage.getJSON<string>('str')).toBe('hello');
    });

    it('should return null for invalid JSON', async () => {
      // Suppress console.warn for this test
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await storage.set('invalid', 'not valid json');
      const result = await storage.getJSON('invalid');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[MemoryStorage] Failed to parse JSON for key: invalid'
      );

      consoleSpy.mockRestore();
    });

    it('should handle nested objects', async () => {
      const nested = {
        user: {
          profile: {
            name: 'John',
            settings: {
              theme: 'dark',
            },
          },
        },
      };
      await storage.set('nested', JSON.stringify(nested));
      const result = await storage.getJSON<typeof nested>('nested');
      expect(result).toEqual(nested);
    });
  });

  // ============================================
  // setJSON() method
  // ============================================
  describe('setJSON', () => {
    it('should store object as JSON string', async () => {
      await storage.setJSON('user', { name: 'John', age: 30 });
      const raw = await storage.get('user');
      expect(raw).toBe('{"name":"John","age":30}');
    });

    it('should store array as JSON string', async () => {
      await storage.setJSON('items', [1, 2, 3]);
      const raw = await storage.get('items');
      expect(raw).toBe('[1,2,3]');
    });

    it('should store primitive values', async () => {
      await storage.setJSON('num', 42);
      await storage.setJSON('bool', true);
      await storage.setJSON('null', null);
      await storage.setJSON('str', 'hello');

      expect(await storage.get('num')).toBe('42');
      expect(await storage.get('bool')).toBe('true');
      expect(await storage.get('null')).toBe('null');
      expect(await storage.get('str')).toBe('"hello"');
    });

    it('should roundtrip complex objects', async () => {
      const complex = {
        id: 1,
        name: 'Test',
        tags: ['a', 'b', 'c'],
        metadata: {
          created: '2024-01-01',
          nested: {
            value: true,
          },
        },
      };

      await storage.setJSON('complex', complex);
      const result = await storage.getJSON<typeof complex>('complex');

      expect(result).toEqual(complex);
    });
  });

  // ============================================
  // Instance isolation
  // ============================================
  describe('instance isolation', () => {
    it('should create isolated storage instances', async () => {
      const storage1 = createMemoryStorageAdapter();
      const storage2 = createMemoryStorageAdapter();

      await storage1.set('key', 'value1');
      await storage2.set('key', 'value2');

      expect(await storage1.get('key')).toBe('value1');
      expect(await storage2.get('key')).toBe('value2');
    });

    it('should not affect other instances on clear', async () => {
      const storage1 = createMemoryStorageAdapter();
      const storage2 = createMemoryStorageAdapter();

      await storage1.set('key', 'value1');
      await storage2.set('key', 'value2');
      await storage1.clear();

      expect(await storage1.get('key')).toBeNull();
      expect(await storage2.get('key')).toBe('value2');
    });
  });
});

// ============================================
// Pre-configured memoryStorage export
// ============================================
describe('memoryStorage (singleton)', () => {
  it('should be a valid storage adapter', async () => {
    expect(memoryStorage).toBeDefined();
    expect(typeof memoryStorage.get).toBe('function');
    expect(typeof memoryStorage.set).toBe('function');
    expect(typeof memoryStorage.remove).toBe('function');
    expect(typeof memoryStorage.clear).toBe('function');
    expect(typeof memoryStorage.keys).toBe('function');
    expect(typeof memoryStorage.has).toBe('function');
    expect(typeof memoryStorage.getJSON).toBe('function');
    expect(typeof memoryStorage.setJSON).toBe('function');
  });
});
