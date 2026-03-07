/**
 * @fileoverview Settings Persistence Adapter - DI Token & Interface
 * @module @nxt1/ui/settings
 * @version 1.0.0
 *
 * Injection token that decouples SettingsService (shared state) from
 * platform-specific HTTP adapters (web / mobile).
 *
 * Follows the same pattern as ANALYTICS_ADAPTER in this package.
 *
 * ⭐ USAGE ⭐
 * Platform wrappers (e.g., SettingsApiService in the web app) implement
 * this interface and provide themselves via:
 *   { provide: SETTINGS_PERSISTENCE_ADAPTER, useExisting: SettingsApiService }
 *
 * SettingsService injects it with { optional: true }; when absent the
 * service falls back to in-memory defaults (useful in tests / Storybook).
 */

import { InjectionToken } from '@angular/core';
import type { SettingsPreferences } from '@nxt1/core';

/**
 * Contract for persisting and loading settings preferences.
 */
export interface SettingsPersistenceAdapter {
  /**
   * Load all persisted preferences for the current user.
   * Called once during settings initialisation.
   */
  loadPreferences(): Promise<SettingsPreferences>;

  /**
   * Persist a single preference change.
   *
   * @param key     The SettingsPreferences key (e.g. 'pushNotifications')
   * @param value   The new value
   */
  updatePreference(key: string, value: unknown): Promise<void>;
}

/**
 * DI token for the settings persistence adapter.
 */
export const SETTINGS_PERSISTENCE_ADAPTER = new InjectionToken<SettingsPersistenceAdapter>(
  'SETTINGS_PERSISTENCE_ADAPTER'
);
