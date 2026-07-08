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
import { UserCancelledError } from '@nxt1/ui/settings';
import { NxtLoggingService } from '@nxt1/ui';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import type { ILogger } from '@nxt1/core/logging';
import { CapacitorHttpAdapter } from '../../infrastructure';
import { environment } from '../../../../environments/environment';
import { BiometricService } from '../auth/biometric.service';
import { FcmRegistrationService } from '../native/fcm-registration.service';
import { AnalyticsService } from '../infrastructure/analytics.service';

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
  private readonly biometricService = inject(BiometricService);
  private readonly fcmRegistration = inject(FcmRegistrationService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly logger: ILogger = inject(NxtLoggingService).child('SettingsApiService');
  private readonly breadcrumb = inject(NxtBreadcrumbService);

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

    const prefs = this.mapToSettingsPreferences(response.data);

    // Apply saved analytics opt-in/out state immediately on load (defaults to true)
    this.analyticsService.setEnabled(prefs.analyticsTracking);

    return prefs;
  }

  /**
   * Persist a single preference change to the backend.
   *
   * For the `biometricLogin` key this method intercepts the normal flow and
   * runs the full native enrollment / un-enrollment flow before (and only if
   * successful) persisting the new value to the backend.
   */
  async updatePreference(key: string, value: unknown): Promise<void> {
    if (key === 'biometricLogin') {
      if (value === true) {
        await this.enableBiometricLogin();
      } else {
        await this.disableBiometricLogin();
      }
      return;
    }

    // Handle push notifications toggle
    if (key === 'pushNotifications') {
      if (value === true) {
        // Register (or re-register) FCM token when user enables push notifications.
        // If permission was already granted this is a silent no-op when a valid token exists.
        void this.fcmRegistration.registerToken();
      } else {
        // Unregister FCM token when user disables push notifications
        void this.fcmRegistration.unregisterToken();
      }
      // Continue to persist preference to backend
    }

    // Handle marketing emails toggle — silently register FCM token if push permission is
    // already granted. Does NOT prompt: opting into marketing emails must never trigger
    // a push-permission dialog. If no token exists yet it will be registered; if one
    // already exists the server deduplicates and returns early.
    if (key === 'marketingEmails' && value === true) {
      void this.fcmRegistration.registerTokenIfPermissionGranted();
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

  /**
   * Acknowledge a completed password change after Firebase confirms success.
   * The current mobile UI still uses reset emails, so this method is ready for
   * the future in-app reset completion flow.
   */
  async recordPasswordChanged(): Promise<void> {
    const response = await this.http.post<ApiResponse<void>>(
      `${this.baseUrl}/settings/password-changed`,
      {}
    );

    if (!response.success) {
      throw new Error(response.error ?? 'Failed to record password change');
    }
  }

  // ============================================================
  // Biometric enrollment helpers
  // ============================================================

  /**
   * Enable biometric login:
   * 1. Verify the device has biometric hardware.
   * 2. Run a native biometric verification immediately from Settings.
   * 3. Mark the current persisted session as biometric-protected on device.
   * 4. Only if everything succeeds, persist `biometricLogin: true` to the backend.
   *
   * Throws `UserCancelledError` if the user dismisses any prompt so the caller
   * (SettingsService) rolls back the optimistic toggle silently.
   */
  private async enableBiometricLogin(): Promise<void> {
    // 1. Ensure biometric hardware is available
    const availability = await this.biometricService.initialize();
    if (!availability.available) {
      throw new Error(`${this.biometricService.biometryName()} is not available on this device`);
    }

    const result = await this.biometricService.promptDeviceUnlockEnrollment();
    if (!result.enrolled) {
      if (result.reason === 'cancelled') {
        throw new UserCancelledError();
      }

      throw new Error(
        `Could not enable ${this.biometricService.biometryName()}. Please try again.`
      );
    }

    // 4. Persist to backend only after successful enrollment
    await this.http.patch<ApiResponse<UserPreferences>>(
      `${this.baseUrl}/settings/preferences/biometricLogin`,
      { value: true }
    );
  }

  /**
   * Disable biometric login:
   * 1. Delete stored credentials and enrollment flag from the device.
   * 2. Persist `biometricLogin: false` to the backend.
   */
  private async disableBiometricLogin(): Promise<void> {
    await this.biometricService.clearEnrollment();

    await this.http.patch<ApiResponse<UserPreferences>>(
      `${this.baseUrl}/settings/preferences/biometricLogin`,
      { value: false }
    );
  }

  /**
   * Notify the backend that the device's biometric enrollment state has changed.
   *
   * Called by the auth/signup flow after `BiometricService.promptNativeEnrollment()`
   * succeeds so the backend preference stays in sync without requiring the user to
   * visit Settings. The call is best-effort — failures are swallowed so they never
   * block the signup completion flow.
   *
   * @param enrolled - Whether biometric login is now enabled on this device.
   */
  async syncBiometricPreference(enrolled: boolean): Promise<void> {
    this.logger.info('Syncing biometric preference to backend', { enrolled });
    this.breadcrumb.trackStateChange('settings', 'biometric-sync-initiated', { enrolled });
    try {
      await this.http.patch<ApiResponse<UserPreferences>>(
        `${this.baseUrl}/settings/preferences/biometricLogin`,
        { value: enrolled }
      );
      this.logger.info('Biometric preference synced to backend', { enrolled });
      this.breadcrumb.trackStateChange('settings', 'biometric-sync-complete', { enrolled });
    } catch (err) {
      // Best-effort: Settings will still show the correct device state via
      // BiometricService.isEnrolled() the next time it loads.
      this.logger.error('Failed to sync biometric preference to backend', err, { enrolled });
      this.breadcrumb.trackStateChange('settings', 'biometric-sync-failed', { enrolled });
    }
  }

  // ============================================================
  // Private mapping helpers
  // ============================================================

  /**
   * Map backend UserPreferences → frontend SettingsPreferences.
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
      default:
        return { backendKey: null, backendValue: null };
    }
  }
}
