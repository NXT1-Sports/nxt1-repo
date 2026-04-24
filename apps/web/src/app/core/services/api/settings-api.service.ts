/**
 * @fileoverview Settings API Service - Angular HTTP Adapter
 * @module @nxt1/web/features/settings
 * @version 1.0.0
 *
 * Angular HTTP adapter for the Settings API.
 * Implements SettingsPersistenceAdapter so it can be provided as the
 * DI token that SettingsService uses for load/persist operations.
 *
 * Pattern:
 * - Performance traces go here (not in SettingsService which is in @nxt1/ui)
 * - HTTP calls go here using Angular HttpClient
 * - SettingsService (packages/ui) calls this via SETTINGS_PERSISTENCE_ADAPTER token
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { SettingsPreferences, SettingsUsage, UserPreferences } from '@nxt1/core';
import { DEFAULT_SETTINGS_PREFERENCES } from '@nxt1/core';
import type { SettingsPersistenceAdapter } from '@nxt1/ui/settings';
import { environment } from '../../../../environments/environment';
import { PerformanceService } from '..';
import { WebPushService } from '../web/web-push.service';
import { AnalyticsService } from '../infrastructure/analytics.service';
import { TRACE_NAMES, ATTRIBUTE_NAMES } from '@nxt1/core/performance';

/** Shape of all settings API responses */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Settings API Service.
 *
 * Implements SettingsPersistenceAdapter so it can be registered via:
 *   { provide: SETTINGS_PERSISTENCE_ADAPTER, useExisting: SettingsApiService }
 */
@Injectable({ providedIn: 'root' })
export class SettingsApiService implements SettingsPersistenceAdapter {
  private readonly http = inject(HttpClient);
  private readonly performance = inject(PerformanceService);
  private readonly webPush = inject(WebPushService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly baseUrl = environment.apiURL;

  /**
   * Debounce buffer for notification preference changes.
   *
   * All three notification toggles (push/email/marketing) map to the same
   * backend key `notifications`. Without debouncing, flipping all three quickly
   * fires three sequential PATCHes. Instead we accumulate changes for 500ms
   * and flush a single merged PATCH.
   */
  private readonly notifBuffer: { push?: boolean; email?: boolean; marketing?: boolean } = {};
  private notifFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private notifFlushResolve: (() => void) | null = null;
  private notifFlushReject: ((err: unknown) => void) | null = null;
  private notifFlushPromise: Promise<void> | null = null;

  // ============================================================
  // SettingsPersistenceAdapter implementation
  // ============================================================

  /**
   * Load user preferences from the backend.
   * Called once during settings initialisation by SettingsService.
   */
  async loadPreferences(): Promise<SettingsPreferences> {
    const prefs = await this.performance.trace(
      TRACE_NAMES.SETTINGS_LOAD,
      async () => {
        const response = await firstValueFrom(
          this.http.get<ApiResponse<UserPreferences>>(`${this.baseUrl}/settings/preferences`)
        );

        if (!response.success || !response.data) {
          throw new Error(response.error ?? 'Failed to load preferences');
        }

        return this.mapToSettingsPreferences(response.data);
      },
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'settings',
          operation: 'load_preferences',
        },
      }
    );

    // Apply saved analytics opt-in/out state immediately on load (defaults to true)
    this.analyticsService.setEnabled(prefs.analyticsTracking);

    return prefs;
  }

  /**
   * Persist a single preference change to the backend.
   * Uses PATCH /settings/preferences/:key with merging for nested fields.
   */
  async updatePreference(key: string, value: unknown): Promise<void> {
    // Handle push notifications toggle — register or unregister FCM token
    if (key === 'pushNotifications') {
      if (value === true) {
        await this.webPush.requestPermission();
      } else {
        await this.webPush.revokeToken();
      }
      // Continue to persist preference to backend
    }

    // Handle analytics tracking toggle — enable/disable client-side event relay immediately
    if (key === 'analyticsTracking') {
      this.analyticsService.setEnabled(value as boolean);
      // Continue to persist preference to backend
    }

    const { backendKey, backendValue } = this.mapToBackendPreference(key, value);

    if (!backendKey) {
      // Key not persisted to backend (e.g. crashReporting)
      return;
    }

    // Notification toggles share the same backend key — debounce into one PATCH
    if (backendKey === 'notifications') {
      return this.queueNotificationFlush(backendValue as Record<string, boolean>);
    }

    return this.performance.trace(
      TRACE_NAMES.SETTINGS_PREFERENCE_UPDATE,
      async () => {
        await firstValueFrom(
          this.http.patch<ApiResponse<UserPreferences>>(
            `${this.baseUrl}/settings/preferences/${backendKey}`,
            { value: backendValue }
          )
        );
      },
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'settings',
          preference_key: key,
        },
      }
    );
  }

  /**
   * Accumulate a notification sub-field change and schedule a single flush.
   * Any further changes within 500ms extend the window (leading-edge = false).
   */
  private queueNotificationFlush(incoming: Record<string, boolean>): Promise<void> {
    // Merge into the buffer
    Object.assign(this.notifBuffer, incoming);

    // Cancel any pending flush
    if (this.notifFlushTimer !== null) {
      clearTimeout(this.notifFlushTimer);
    }

    // Reuse the same promise if one is already pending (callers can await it)
    if (!this.notifFlushPromise) {
      this.notifFlushPromise = new Promise<void>((resolve, reject) => {
        this.notifFlushResolve = resolve;
        this.notifFlushReject = reject;
      });
    }

    this.notifFlushTimer = setTimeout(() => this.flushNotifications(), 500);

    return this.notifFlushPromise;
  }

  private async flushNotifications(): Promise<void> {
    const payload = { ...this.notifBuffer };

    // Clear buffer + timer references before the await so a new change
    // arriving mid-flight starts a fresh cycle
    Object.keys(this.notifBuffer).forEach(
      (k) => delete (this.notifBuffer as Record<string, unknown>)[k]
    );
    this.notifFlushTimer = null;
    const resolve = this.notifFlushResolve;
    const reject = this.notifFlushReject;
    this.notifFlushPromise = null;
    this.notifFlushResolve = null;
    this.notifFlushReject = null;

    try {
      await this.performance.trace(
        TRACE_NAMES.SETTINGS_PREFERENCE_UPDATE,
        async () => {
          await firstValueFrom(
            this.http.patch<ApiResponse<UserPreferences>>(
              `${this.baseUrl}/settings/preferences/notifications`,
              { value: payload }
            )
          );
        },
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'settings',
            preference_key: 'notifications',
            batched_fields: Object.keys(payload).join(','),
          },
        }
      );
      resolve?.();
    } catch (err) {
      reject?.(err);
    }
  }

  // ============================================================
  // Additional helpers (available to the wrapper component)
  // ============================================================

  /**
   * Fetch current usage stats (storage, AI requests, etc.).
   */
  async getUsage(): Promise<SettingsUsage | null> {
    return this.performance.trace(
      TRACE_NAMES.SETTINGS_LOAD,
      async (): Promise<SettingsUsage | null> => {
        const response = await firstValueFrom(
          this.http.get<ApiResponse<SettingsUsage>>(`${this.baseUrl}/settings/usage`)
        ).catch(() => ({ success: false, data: undefined }));

        return response.success ? (response.data ?? null) : null;
      },
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'settings',
          operation: 'get_usage',
        },
      }
    );
  }

  /**
   * Acknowledge a completed password change after Firebase confirms success.
   * This is not currently called by the UI because the app still uses emailed
   * reset links rather than an in-app reset completion flow.
   */
  async recordPasswordChanged(): Promise<void> {
    await this.performance.trace(
      TRACE_NAMES.SETTINGS_PREFERENCE_UPDATE,
      async () => {
        const response = await firstValueFrom(
          this.http.post<ApiResponse<void>>(`${this.baseUrl}/settings/password-changed`, {})
        );

        if (!response.success) {
          throw new Error(response.error ?? 'Failed to record password change');
        }
      },
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'settings',
          operation: 'record_password_changed',
        },
      }
    );
  }

  // ============================================================
  // Private mapping helpers
  // ============================================================

  /**
   * Map backend UserPreferences → frontend SettingsPreferences.
   * Fields that have no backend equivalent keep their default value.
   */
  private mapToSettingsPreferences(prefs: UserPreferences): SettingsPreferences {
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
    };
  }

  /**
   * Map a frontend settingKey + value to the backend's preference key and payload.
   * Returns { backendKey: null } for keys that are managed client-side only.
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
      default:
        return { backendKey: null, backendValue: null };
    }
  }
}
