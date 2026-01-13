/**
 * @fileoverview In-Memory Storage Adapter
 * @module @nxt1/core/storage
 *
 * In-memory implementation of StorageAdapter.
 * Useful for:
 * - Server-side rendering (SSR)
 * - Unit testing
 * - Environments without persistent storage
 *
 * @example
 * ```typescript
 * import { createMemoryStorageAdapter } from '@nxt1/core/storage';
 *
 * const storage = createMemoryStorageAdapter();
 * await storage.set('key', 'value');
 * // Data is lost when the process ends
 * ```
 */

import type { StorageAdapter } from './storage-adapter';

/**
 * Create an in-memory storage adapter
 *
 * Data is stored in a Map and persists only for the lifetime
 * of the JavaScript execution context.
 */
export function createMemoryStorageAdapter(): StorageAdapter {
  const store = new Map<string, string>();

  return {
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },

    async set(key: string, value: string): Promise<void> {
      store.set(key, value);
    },

    async remove(key: string): Promise<void> {
      store.delete(key);
    },

    async clear(): Promise<void> {
      store.clear();
    },

    async keys(): Promise<string[]> {
      return Array.from(store.keys());
    },

    async has(key: string): Promise<boolean> {
      return store.has(key);
    },

    async getJSON<T>(key: string): Promise<T | null> {
      const value = store.get(key);
      if (value === undefined) return null;

      try {
        return JSON.parse(value) as T;
      } catch {
        console.warn(`[MemoryStorage] Failed to parse JSON for key: ${key}`);
        return null;
      }
    },

    async setJSON<T>(key: string, value: T): Promise<void> {
      store.set(key, JSON.stringify(value));
    },
  };
}

/**
 * Pre-configured memory storage adapter
 */
export const memoryStorage = createMemoryStorageAdapter();
