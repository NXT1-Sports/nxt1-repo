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
import { AlertController } from '@ionic/angular/standalone';
import { CapacitorHttpAdapter } from '../infrastructure';
import { environment } from '../../../environments/environment';
import { BiometricService } from '../../features/auth/services/biometric.service';
import { AuthFlowService } from '../../features/auth/services/auth-flow.service';
import { FcmRegistrationService } from './fcm-registration.service';

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
  private readonly authService = inject(AuthFlowService);
  private readonly alertController = inject(AlertController);
  private readonly fcmRegistration = inject(FcmRegistrationService);

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
        // Register FCM token when user enables push notifications
        void this.fcmRegistration.registerToken();
      } else {
        // Unregister FCM token when user disables push notifications
        void this.fcmRegistration.unregisterToken();
      }
      // Continue to persist preference to backend
    }

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
  // Biometric enrollment helpers
  // ============================================================

  /**
   * Enable biometric login:
   * 1. Verify the device has biometric hardware.
   * 2. Ask the user to confirm their current password (needed to store credentials).
   * 3. Trigger the native Face ID / Touch ID prompt via BiometricService.
   * 4. Only if enrollment succeeds, persist `biometricLogin: true` to the backend.
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

    // 2. Retrieve authenticated user's email
    const email = this.authService.user()?.email;
    if (!email) {
      throw new Error('No authenticated user email found');
    }

    // 3. Ask user for their password (needed for secure credential storage)
    const password = await this.promptForPassword();
    if (!password) {
      throw new UserCancelledError();
    }

    // 4. Run the native enrollment flow (triggers Face ID / Touch ID prompt)
    const result = await this.biometricService.promptNativeEnrollment(email, password);
    if (!result.enrolled) {
      if (result.reason === 'cancelled') {
        throw new UserCancelledError();
      }
      throw new Error(
        `Could not enable ${this.biometricService.biometryName()}. Please try again.`
      );
    }

    // 5. Persist to backend only after successful enrollment
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
   * Show an Ionic alert prompting the user for their current password.
   * Returns the password string or `null` if cancelled.
   */
  private promptForPassword(): Promise<string | null> {
    return new Promise((resolve) => {
      this.alertController
        .create({
          header: `Enable ${this.biometricService.biometryName()}`,
          message: `Enter your password to save it securely for ${this.biometricService.biometryName()} sign-in.`,
          inputs: [
            {
              name: 'password',
              type: 'password',
              placeholder: 'Current password',
              attributes: { autocomplete: 'current-password' },
            },
          ],
          buttons: [
            {
              text: 'Cancel',
              role: 'cancel',
              handler: () => resolve(null),
            },
            {
              text: 'Enable',
              handler: (data: { password: string }) => {
                resolve(data.password?.trim() || null);
              },
            },
          ],
        })
        .then((alert) => alert.present());
    });
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
