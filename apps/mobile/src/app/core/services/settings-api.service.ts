/**
 * @fileoverview Settings API Service — Mobile Capacitor Adapter
 * @module @nxt1/mobile/core/services
 * @version 1.0.0
 *
 * Implements SettingsPersistenceAdapter so SettingsService can load/persist
 * user preferences via the backend. Uses CapacitorHttpAdapter for native
 * HTTP calls (bypasses CORS on iOS/Android).
 *
 * Pattern mirrors apps/web/src/app/features/settings/services/settings-api.service.ts
 * but uses CapacitorHttpAdapter instead of Angular HttpClient.
 */
import { Injectable, inject } from '@angular/core';
import type { SettingsPreferences, SettingsUsage, UserPreferences } from '@nxt1/core';
import { DEFAULT_SETTINGS_PREFERENCES } from '@nxt1/core';
import type { SettingsPersistenceAdapter } from '@nxt1/ui/settings';
import { CapacitorHttpAdapter } from '../infrastructure';
import { environment } from '../../../environments/environment';

/** Shape of all settings API responses */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Settings API Service (Mobile).
 *
 * Registered via:
 *   { provide: SETTINGS_PERSISTENCE_ADAPTER, useExisting: SettingsApiService }
 */
@Injectable({ providedIn: 'root' })
export class SettingsApiService implements SettingsPersistenceAdapter {
  private readonly http = inject(CapacitorHttpAdapter);
  private readonly baseUrl = environment.apiUrl;

  // ============================================================
  // SettingsPersistenceAdapter implementation
  // ============================================================

  /**
   * Load user preferences from the backend.
   * Called once during settings initialisation by SettingsService.
   */
  async loadPreferences(): Promise<SettingsPreferences> {
    const response = await this.http.get<ApiResponse<UserPreferences>>(
      `${this.baseUrl}/settings/preferences`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error ?? 'Failed to load preferences');
    }

    return this.mapToSettingsPreferences(response.data);
  }

  /**
   * Persist a single preference change to the backend.
   * Uses PATCH /settings/preferences/:key.
   */
  async updatePreference(key: string, value: unknown): Promise<void> {
    const { backendKey, backendValue } = this.mapToBackendPreference(key, value);

    if (!backendKey) {
      // Key not persisted to backend (e.g. analyticsTracking / crashReporting)
      return;
    }

    await this.http.patch<ApiResponse<UserPreferences>>(
      `${this.baseUrl}/settings/preferences/${backendKey}`,
      { value: backendValue }
    );
  }

  // ============================================================
  // Additional helpers
  // ============================================================

  /**
   * Fetch current usage stats (storage, AI requests, etc.).
   */
  async getUsage(): Promise<SettingsUsage | null> {
    try {
      const response = await this.http.get<ApiResponse<SettingsUsage>>(
        `${this.baseUrl}/settings/usage`
      );
      return response.success ? (response.data ?? null) : null;
    } catch {
      return null;
    }
  }

  // ============================================================
  // Private mapping helpers
  // ============================================================

  /**
   * Map backend UserPreferences → frontend SettingsPreferences.
   */
  private mapToSettingsPreferences(prefs: UserPreferences): SettingsPreferences {
    const theme = prefs.theme as 'light' | 'dark' | 'system' | undefined;

    return {
      ...DEFAULT_SETTINGS_PREFERENCES,
      pushNotifications:
        prefs.notifications?.push ?? DEFAULT_SETTINGS_PREFERENCES.pushNotifications,
      emailNotifications:
        prefs.notifications?.email ?? DEFAULT_SETTINGS_PREFERENCES.emailNotifications,
      marketingEmails:
        prefs.notifications?.marketing ?? DEFAULT_SETTINGS_PREFERENCES.marketingEmails,
      activityTracking: prefs.activityTracking ?? DEFAULT_SETTINGS_PREFERENCES.activityTracking,
      analyticsTracking: prefs.analyticsTracking ?? DEFAULT_SETTINGS_PREFERENCES.analyticsTracking,
      biometricLogin: prefs.biometricLogin ?? DEFAULT_SETTINGS_PREFERENCES.biometricLogin,
      theme: theme ?? DEFAULT_SETTINGS_PREFERENCES.theme,
      language: prefs.language ?? DEFAULT_SETTINGS_PREFERENCES.language,
    };
  }

  /**
   * Map a frontend settingKey + value to the backend's preference key and payload.
   * Returns { backendKey: null } for client-side-only keys.
   */
  private mapToBackendPreference(
    key: string,
    value: unknown
  ): { backendKey: string | null; backendValue: unknown } {
    switch (key) {
      case 'pushNotifications':
        return { backendKey: 'notifications', backendValue: { push: value } };
      case 'emailNotifications':
        return { backendKey: 'notifications', backendValue: { email: value } };
      case 'marketingEmails':
        return { backendKey: 'notifications', backendValue: { marketing: value } };
      case 'activityTracking':
        return { backendKey: 'activityTracking', backendValue: value };
      case 'analyticsTracking':
        return { backendKey: 'analyticsTracking', backendValue: value };
      case 'biometricLogin':
        return { backendKey: 'biometricLogin', backendValue: value };
      case 'theme':
        return { backendKey: 'theme', backendValue: value };
      case 'language':
        return { backendKey: 'language', backendValue: value };
      default:
        return { backendKey: null, backendValue: null };
    }
  }
}
