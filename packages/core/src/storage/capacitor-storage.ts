/**
 * @fileoverview Capacitor Storage Adapter
 * @module @nxt1/core/storage
 *
 * Capacitor Preferences plugin implementation of StorageAdapter.
 * Use this in Ionic/Capacitor mobile applications.
 *
 * NOTE: This file uses dynamic imports to avoid bundling Capacitor
 * in web builds. The adapter lazily loads the Preferences plugin.
 *
 * @example
 * ```typescript
 * import { createCapacitorStorageAdapter } from '@nxt1/core/storage';
 *
 * const storage = createCapacitorStorageAdapter();
 * await storage.set('user', JSON.stringify(userData));
 * const user = await storage.get('user');
 * ```
 */

import type { StorageAdapter } from './storage-adapter';

/**
 * Capacitor Preferences type (to avoid direct import)
 */
interface CapacitorPreferences {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<{ keys: string[] }>;
}

type CapacitorPreferencesModule = {
  Preferences: CapacitorPreferences;
};

// Lazy-loaded Preferences plugin
let preferencesPlugin: CapacitorPreferences | null = null;

/**
 * Get the Capacitor Preferences plugin (lazy loaded)
 */
async function getPreferences(): Promise<CapacitorPreferences | null> {
  if (preferencesPlugin) return preferencesPlugin;

  try {
    const loadPreferences = new Function(
      'return import("@capacitor/preferences")'
    ) as () => Promise<CapacitorPreferencesModule>;
    const { Preferences } = await loadPreferences();
    preferencesPlugin = Preferences;
    return preferencesPlugin;
  } catch {
    console.warn('[CapacitorStorage] @capacitor/preferences not available');
    return null;
  }
}

/**
 * Create a Capacitor storage adapter
 *
 * Uses the Capacitor Preferences plugin for native storage.
 * Falls back gracefully if the plugin is not available.
 */
export function createCapacitorStorageAdapter(): StorageAdapter {
  return {
    async get(key: string): Promise<string | null> {
      const preferences = await getPreferences();
      if (!preferences) return null;

      try {
        const { value } = await preferences.get({ key });
        return value;
      } catch (error) {
        console.warn(`[CapacitorStorage] Failed to get key: ${key}`, error);
        return null;
      }
    },

    async set(key: string, value: string): Promise<void> {
      const preferences = await getPreferences();
      if (!preferences) return;

      try {
        await preferences.set({ key, value });
      } catch (error) {
        console.error(`[CapacitorStorage] Failed to set key: ${key}`, error);
        throw error;
      }
    },

    async remove(key: string): Promise<void> {
      const preferences = await getPreferences();
      if (!preferences) return;

      try {
        await preferences.remove({ key });
      } catch (error) {
        console.warn(`[CapacitorStorage] Failed to remove key: ${key}`, error);
      }
    },

    async clear(): Promise<void> {
      const preferences = await getPreferences();
      if (!preferences) return;

      try {
        await preferences.clear();
      } catch (error) {
        console.warn('[CapacitorStorage] Failed to clear storage', error);
      }
    },

    async keys(): Promise<string[]> {
      const preferences = await getPreferences();
      if (!preferences) return [];

      try {
        const { keys } = await preferences.keys();
        return keys;
      } catch {
        return [];
      }
    },

    async has(key: string): Promise<boolean> {
      const preferences = await getPreferences();
      if (!preferences) return false;

      try {
        const { value } = await preferences.get({ key });
        return value !== null;
      } catch {
        return false;
      }
    },

    async getJSON<T>(key: string): Promise<T | null> {
      const preferences = await getPreferences();
      if (!preferences) return null;

      try {
        const { value } = await preferences.get({ key });
        if (value === null) return null;
        return JSON.parse(value) as T;
      } catch {
        console.warn(`[CapacitorStorage] Failed to parse JSON for key: ${key}`);
        return null;
      }
    },

    async setJSON<T>(key: string, value: T): Promise<void> {
      const preferences = await getPreferences();
      if (!preferences) return;

      try {
        await preferences.set({ key, value: JSON.stringify(value) });
      } catch (error) {
        console.error(`[CapacitorStorage] Failed to set JSON for key: ${key}`, error);
        throw error;
      }
    },
  };
}

/**
 * Pre-configured Capacitor storage adapter
 */
export const capacitorStorage = createCapacitorStorageAdapter();
