/**
 * @fileoverview Unit Tests for Browser Storage Adapter
 * @module @nxt1/core/storage
 *
 * Focused on the resilience added for blocked/private-browsing storage access,
 * which previously could throw synchronously and crash callers. Runs in the
 * package's Node test environment; `window` is stubbed manually since
 * @nxt1/core has no DOM dependency at runtime.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBrowserStorageAdapter } from './browser-storage';

function createFakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe('createBrowserStorageAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      localStorage: createFakeStorage(),
      sessionStorage: createFakeStorage(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gets and sets values through localStorage', async () => {
    const storage = createBrowserStorageAdapter('local');
    await storage.set('key', 'value');
    expect(await storage.get('key')).toBe('value');
  });

  it('does not throw when the storage object itself is inaccessible (private browsing)', async () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('SecurityError: The operation is insecure.');
      },
      sessionStorage: createFakeStorage(),
    });

    const storage = createBrowserStorageAdapter('local');

    await expect(storage.get('key')).resolves.toBeNull();
    await expect(storage.has('key')).resolves.toBe(false);
    await expect(storage.keys()).resolves.toEqual([]);
    await expect(storage.getJSON('key')).resolves.toBeNull();
    // set/remove/clear no-op rather than throw when storage is unavailable.
    await expect(storage.set('key', 'value')).resolves.toBeUndefined();
    await expect(storage.remove('key')).resolves.toBeUndefined();
    await expect(storage.clear()).resolves.toBeUndefined();
  });
});
