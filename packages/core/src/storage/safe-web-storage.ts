/**
 * @fileoverview Safe Synchronous Web Storage Helpers
 * @module @nxt1/core/storage
 *
 * Thin, defensive wrappers around `window.localStorage` / `window.sessionStorage`
 * for call sites that need synchronous access (unlike the async `StorageAdapter`
 * interface). Accessing `localStorage`/`sessionStorage` — or even reading/writing
 * to them — can throw (`SecurityError`, `InvalidAccessError`) in private
 * browsing modes, sandboxed iframes, or when a user has blocked site storage.
 * These helpers swallow that class of failure instead of letting it crash
 * the caller (e.g. onboarding flow initialization).
 */

export type SafeWebStorageType = 'local' | 'session';

function resolveStorage(type: SafeWebStorageType): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return type === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Reads a key, returning `null` if storage is unavailable or the read fails. */
export function safeWebStorageGet(type: SafeWebStorageType, key: string): string | null {
  const storage = resolveStorage(type);
  if (!storage) return null;

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Writes a key, returning `false` if storage is unavailable or the write fails. */
export function safeWebStorageSet(type: SafeWebStorageType, key: string, value: string): boolean {
  const storage = resolveStorage(type);
  if (!storage) return false;

  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Removes a key; no-ops if storage is unavailable or the removal fails. */
export function safeWebStorageRemove(type: SafeWebStorageType, key: string): void {
  const storage = resolveStorage(type);
  if (!storage) return;

  try {
    storage.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
