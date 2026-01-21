/**
 * @fileoverview Native Storage Adapter for Mobile
 * @module @nxt1/mobile
 *
 * Uses static import of Capacitor Preferences to avoid dynamic import issues on iOS.
 * This adapter is specifically for the mobile app where Capacitor is always available.
 */

import { Preferences } from '@capacitor/preferences';
import type { StorageAdapter } from '@nxt1/core';

/**
 * Create a native storage adapter using Capacitor Preferences
 *
 * Unlike @nxt1/core's createCapacitorStorageAdapter which uses dynamic imports,
 * this version uses static imports since we know Capacitor is always available in the mobile app.
 */
export function createNativeStorageAdapter(): StorageAdapter {
  return {
    async get(key: string): Promise<string | null> {
      try {
        const { value } = await Preferences.get({ key });
        return value;
      } catch (error) {
        console.warn(`[NativeStorage] Failed to get key: ${key}`, error);
        return null;
      }
    },

    async set(key: string, value: string): Promise<void> {
      try {
        await Preferences.set({ key, value });
      } catch (error) {
        console.error(`[NativeStorage] Failed to set key: ${key}`, error);
        throw error;
      }
    },

    async remove(key: string): Promise<void> {
      try {
        await Preferences.remove({ key });
      } catch (error) {
        console.warn(`[NativeStorage] Failed to remove key: ${key}`, error);
      }
    },

    async clear(): Promise<void> {
      try {
        await Preferences.clear();
      } catch (error) {
        console.warn('[NativeStorage] Failed to clear storage', error);
      }
    },

    async keys(): Promise<string[]> {
      try {
        const { keys } = await Preferences.keys();
        return keys;
      } catch {
        return [];
      }
    },

    async has(key: string): Promise<boolean> {
      try {
        const { value } = await Preferences.get({ key });
        return value !== null;
      } catch {
        return false;
      }
    },

    async getJSON<T>(key: string): Promise<T | null> {
      try {
        const { value } = await Preferences.get({ key });
        if (value === null) return null;
        return JSON.parse(value) as T;
      } catch {
        console.warn(`[NativeStorage] Failed to parse JSON for key: ${key}`);
        return null;
      }
    },

    async setJSON<T>(key: string, value: T): Promise<void> {
      try {
        await Preferences.set({ key, value: JSON.stringify(value) });
      } catch (error) {
        console.error(`[NativeStorage] Failed to set JSON for key: ${key}`, error);
        throw error;
      }
    },
  };
}
