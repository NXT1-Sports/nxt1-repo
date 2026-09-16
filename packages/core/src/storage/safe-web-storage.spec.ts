/**
 * @fileoverview Unit Tests for Safe Synchronous Web Storage Helpers
 * @module @nxt1/core/storage
 *
 * Runs in the package's Node test environment; `window` is stubbed manually
 * since @nxt1/core has no DOM dependency at runtime.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { safeWebStorageGet, safeWebStorageSet, safeWebStorageRemove } from './safe-web-storage';

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

describe('safe-web-storage', () => {
  let localStorageMock: Storage;
  let sessionStorageMock: Storage;

  beforeEach(() => {
    localStorageMock = createFakeStorage();
    sessionStorageMock = createFakeStorage();
    vi.stubGlobal('window', {
      localStorage: localStorageMock,
      sessionStorage: sessionStorageMock,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads and writes through localStorage', () => {
    expect(safeWebStorageSet('local', 'key', 'value')).toBe(true);
    expect(safeWebStorageGet('local', 'key')).toBe('value');
  });

  it('reads and writes through sessionStorage', () => {
    expect(safeWebStorageSet('session', 'key', 'value')).toBe(true);
    expect(safeWebStorageGet('session', 'key')).toBe('value');
  });

  it('removes a key without throwing', () => {
    safeWebStorageSet('session', 'key', 'value');
    safeWebStorageRemove('session', 'key');
    expect(safeWebStorageGet('session', 'key')).toBeNull();
  });

  it('returns null instead of throwing when storage access throws (private browsing)', () => {
    vi.stubGlobal('window', {
      localStorage: localStorageMock,
      get sessionStorage(): Storage {
        throw new Error('SecurityError: The operation is insecure.');
      },
    });

    expect(() => safeWebStorageGet('session', 'key')).not.toThrow();
    expect(safeWebStorageGet('session', 'key')).toBeNull();
  });

  it('returns false instead of throwing when writes fail (quota exceeded)', () => {
    sessionStorageMock.setItem = () => {
      throw new Error('QuotaExceededError: Quota exceeded');
    };

    expect(() => safeWebStorageSet('session', 'key', 'value')).not.toThrow();
    expect(safeWebStorageSet('session', 'key', 'value')).toBe(false);
  });

  it('no-ops instead of throwing when remove fails', () => {
    sessionStorageMock.removeItem = () => {
      throw new Error('SecurityError: The operation is insecure.');
    };

    expect(() => safeWebStorageRemove('session', 'key')).not.toThrow();
  });

  it('returns null/false/no-op when window is undefined (SSR)', () => {
    vi.unstubAllGlobals();

    expect(safeWebStorageGet('local', 'key')).toBeNull();
    expect(safeWebStorageSet('local', 'key', 'value')).toBe(false);
    expect(() => safeWebStorageRemove('local', 'key')).not.toThrow();
  });
});
