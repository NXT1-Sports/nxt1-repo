/**
 * @fileoverview Storage Adapter Interface
 * @module @nxt1/core/storage
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Platform-agnostic storage interface that can be implemented by:
 * - Browser localStorage/sessionStorage
 * - Capacitor Preferences plugin
 * - React Native AsyncStorage
 * - Node.js file system (testing)
 *
 * This abstraction enables the same auth/state management code to work
 * across all platforms without modification.
 *
 * @example Web Implementation
 * ```typescript
 * const webStorage: StorageAdapter = {
 *   get: async (key) => localStorage.getItem(key),
 *   set: async (key, value) => localStorage.setItem(key, value),
 *   remove: async (key) => localStorage.removeItem(key),
 *   clear: async () => localStorage.clear(),
 * };
 * ```
 *
 * @example Capacitor Implementation
 * ```typescript
 * import { Preferences } from '@capacitor/preferences';
 *
 * const capacitorStorage: StorageAdapter = {
 *   get: async (key) => (await Preferences.get({ key })).value,
 *   set: async (key, value) => Preferences.set({ key, value }),
 *   remove: async (key) => Preferences.remove({ key }),
 *   clear: async () => Preferences.clear(),
 * };
 * ```
 */

/**
 * Storage adapter interface - implemented differently per platform
 */
export interface StorageAdapter {
  /**
   * Get a value from storage
   * @param key - Storage key
   * @returns Value or null if not found
   */
  get(key: string): Promise<string | null>;

  /**
   * Set a value in storage
   * @param key - Storage key
   * @param value - Value to store
   */
  set(key: string, value: string): Promise<void>;

  /**
   * Remove a value from storage
   * @param key - Storage key
   */
  remove(key: string): Promise<void>;

  /**
   * Clear all values from storage
   */
  clear(): Promise<void>;

  /**
   * Get all keys in storage
   * @returns Array of keys
   */
  keys(): Promise<string[]>;

  /**
   * Check if a key exists in storage
   * @param key - Storage key
   * @returns True if key exists
   */
  has(key: string): Promise<boolean>;

  /**
   * Get a JSON-parsed value from storage
   * @param key - Storage key
   * @returns Parsed value or null if not found or invalid JSON
   */
  getJSON<T>(key: string): Promise<T | null>;

  /**
   * Set a JSON-stringified value in storage
   * @param key - Storage key
   * @param value - Value to store (will be JSON.stringify'd)
   */
  setJSON<T>(key: string, value: T): Promise<void>;
}

/**
 * Storage keys used across the application
 * Centralized to prevent key collisions and typos
 */
export const STORAGE_KEYS = {
  // Auth
  AUTH_TOKEN: 'nxt1_auth_token',
  REFRESH_TOKEN: 'nxt1_refresh_token',
  USER_ID: 'nxt1_user_id',
  USER_PROFILE: 'nxt1_user_profile',

  // Session
  SESSION_ID: 'nxt1_session_id',
  LAST_ACTIVITY: 'nxt1_last_activity',

  // Preferences
  THEME: 'nxt1_theme',
  LANGUAGE: 'nxt1_language',
  NOTIFICATIONS_ENABLED: 'nxt1_notifications_enabled',

  // Cache
  CACHE_PREFIX: 'nxt1_cache_',

  // Onboarding
  ONBOARDING_COMPLETED: 'nxt1_onboarding_completed',
  ONBOARDING_STEP: 'nxt1_onboarding_step',
  ONBOARDING_SESSION: 'nxt1_onboarding_session',
  ONBOARDING_FORM_DATA: 'nxt1_onboarding_form_data',
  ONBOARDING_SELECTED_ROLE: 'nxt1_onboarding_selected_role',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
