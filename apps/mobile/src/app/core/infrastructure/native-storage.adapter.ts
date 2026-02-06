/**
 * @fileoverview Native Storage Adapter for Mobile
 * @module @nxt1/mobile
 *
 * Uses static import of Capacitor Preferences to avoid dynamic import issues on iOS.
 * This adapter is specifically for the mobile app where Capacitor is always available.
 * Falls back to localStorage if Preferences plugin is not available.
 */

import { Preferences } from '@capacitor/preferences';
import type { StorageAdapter } from '@nxt1/core';

/**
 * Check if Preferences plugin is available
 * Fixes "Preferences plugin not implemented" error on Android/iOS
 */
let preferencesAvailable: boolean | null = null;

async function isPreferencesAvailable(): Promise<boolean> {
  if (preferencesAvailable !== null) return preferencesAvailable;

  try {
    // Check if Preferences is properly implemented
    if (!Preferences || typeof Preferences.get !== 'function') {
      console.warn(
        '[NativeStorage] Preferences plugin not available (undefined or missing methods)'
      );
      preferencesAvailable = false;
      return false;
    }

    // Try a simple get operation to verify it works
    const testResult = await Preferences.get({ key: '__nxt1_test__' });

    // If we got here without error, it works
    preferencesAvailable = true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(
      '[NativeStorage] Preferences plugin not available, falling back to localStorage:',
      errorMessage
    );
    preferencesAvailable = false;
  }

  return preferencesAvailable;
}

/**
 * Create a native storage adapter using Capacitor Preferences
 *
 * Unlike @nxt1/core's createCapacitorStorageAdapter which uses dynamic imports,
 * this version uses static imports since we know Capacitor is always available in the mobile app.
 * Falls back to localStorage if Preferences plugin is not available (e.g., "Preferences plugin not implemented" error).
 */
export function createNativeStorageAdapter(): StorageAdapter {
  return {
    async get(key: string): Promise<string | null> {
      try {
        const available = await isPreferencesAvailable();
        if (!available) {
          return localStorage.getItem(key);
        }
        const { value } = await Preferences.get({ key });
        return value;
      } catch (error) {
        console.warn(`[NativeStorage] Failed to get key: ${key}`, error);
        // Fallback to localStorage
        try {
          return localStorage.getItem(key);
        } catch {
          return null;
        }
      }
    },

    async set(key: string, value: string): Promise<void> {
      try {
        const available = await isPreferencesAvailable();
        if (!available) {
          localStorage.setItem(key, value);
          return;
        }
        await Preferences.set({ key, value });
      } catch (error) {
        console.error(`[NativeStorage] Failed to set key: ${key}`, error);
        // Fallback to localStorage
        try {
          localStorage.setItem(key, value);
        } catch {
          throw error;
        }
      }
    },

    async remove(key: string): Promise<void> {
      try {
        const available = await isPreferencesAvailable();
        if (!available) {
          localStorage.removeItem(key);
          return;
        }
        await Preferences.remove({ key });
      } catch (error) {
        console.warn(`[NativeStorage] Failed to remove key: ${key}`, error);
        // Fallback to localStorage
        try {
          localStorage.removeItem(key);
        } catch {
          // ignore
        }
      }
    },

    async clear(): Promise<void> {
      try {
        const available = await isPreferencesAvailable();
        if (!available) {
          localStorage.clear();
          return;
        }
        await Preferences.clear();
      } catch (error) {
        console.warn('[NativeStorage] Failed to clear storage', error);
        // Fallback to localStorage
        try {
          localStorage.clear();
        } catch {
          // ignore
        }
      }
    },

    async keys(): Promise<string[]> {
      try {
        const available = await isPreferencesAvailable();
        if (!available) {
          return Object.keys(localStorage);
        }
        const { keys } = await Preferences.keys();
        return keys;
      } catch {
        // Fallback to localStorage
        try {
          return Object.keys(localStorage);
        } catch {
          return [];
        }
      }
    },

    async has(key: string): Promise<boolean> {
      try {
        const available = await isPreferencesAvailable();
        if (!available) {
          return localStorage.getItem(key) !== null;
        }
        const { value } = await Preferences.get({ key });
        return value !== null;
      } catch {
        // Fallback to localStorage
        try {
          return localStorage.getItem(key) !== null;
        } catch {
          return false;
        }
      }
    },

    async getJSON<T>(key: string): Promise<T | null> {
      try {
        const available = await isPreferencesAvailable();
        let value: string | null = null;

        if (!available) {
          value = localStorage.getItem(key);
        } else {
          const result = await Preferences.get({ key });
          value = result.value;
        }

        if (value === null) return null;
        return JSON.parse(value) as T;
      } catch {
        console.warn(`[NativeStorage] Failed to parse JSON for key: ${key}`);
        return null;
      }
    },

    async setJSON<T>(key: string, value: T): Promise<void> {
      try {
        const available = await isPreferencesAvailable();
        const jsonString = JSON.stringify(value);

        if (!available) {
          localStorage.setItem(key, jsonString);
          return;
        }
        await Preferences.set({ key, value: jsonString });
      } catch (error) {
        console.error(`[NativeStorage] Failed to set JSON for key: ${key}`, error);
        // Fallback to localStorage
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } catch {
          throw error;
        }
      }
    },
  };
}
