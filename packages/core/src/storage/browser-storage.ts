/**
 * @fileoverview Browser Storage Adapter
 * @module @nxt1/core/storage
 *
 * localStorage/sessionStorage implementation of StorageAdapter.
 * Use this in web applications.
 *
 * @example
 * ```typescript
 * import { createBrowserStorageAdapter } from '@nxt1/core/storage';
 *
 * // Use localStorage (persistent)
 * const storage = createBrowserStorageAdapter('local');
 *
 * // Use sessionStorage (cleared on tab close)
 * const sessionStorage = createBrowserStorageAdapter('session');
 * ```
 */

import type { StorageAdapter } from './storage-adapter';

export type BrowserStorageType = 'local' | 'session';

/**
 * Create a browser storage adapter
 * @param type - 'local' for localStorage, 'session' for sessionStorage
 */
export function createBrowserStorageAdapter(type: BrowserStorageType = 'local'): StorageAdapter {
  const getStorage = (): Storage | null => {
    if (typeof window === 'undefined') return null;
    return type === 'local' ? window.localStorage : window.sessionStorage;
  };

  return {
    async get(key: string): Promise<string | null> {
      const storage = getStorage();
      if (!storage) return null;

      try {
        return storage.getItem(key);
      } catch {
        console.warn(`[BrowserStorage] Failed to get key: ${key}`);
        return null;
      }
    },

    async set(key: string, value: string): Promise<void> {
      const storage = getStorage();
      if (!storage) return;

      try {
        storage.setItem(key, value);
      } catch (error) {
        // Handle quota exceeded
        if (error instanceof Error && error.name === 'QuotaExceededError') {
          console.error('[BrowserStorage] Storage quota exceeded');
        }
        throw error;
      }
    },

    async remove(key: string): Promise<void> {
      const storage = getStorage();
      if (!storage) return;

      try {
        storage.removeItem(key);
      } catch {
        console.warn(`[BrowserStorage] Failed to remove key: ${key}`);
      }
    },

    async clear(): Promise<void> {
      const storage = getStorage();
      if (!storage) return;

      try {
        storage.clear();
      } catch {
        console.warn('[BrowserStorage] Failed to clear storage');
      }
    },

    async keys(): Promise<string[]> {
      const storage = getStorage();
      if (!storage) return [];

      try {
        return Object.keys(storage);
      } catch {
        return [];
      }
    },
  };
}

/**
 * Pre-configured localStorage adapter
 */
export const browserLocalStorage = createBrowserStorageAdapter('local');

/**
 * Pre-configured sessionStorage adapter
 */
export const browserSessionStorage = createBrowserStorageAdapter('session');
