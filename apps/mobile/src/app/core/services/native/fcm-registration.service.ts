/**
 * @fileoverview FCM Token Registration Service
 * @module @nxt1/mobile/core
 *
 * Handles FCM token registration after onboarding completion or an explicit
 * settings opt-in.
 * Uses @capacitor-firebase/messaging to get a proper FCM token
 * (not the raw APNs token from @capacitor/push-notifications).
 * Calls Cloud Function to save token to FcmTokens/{userId} collection.
 *
 * Usage:
 * ```typescript
 * // After onboarding completion or when push is enabled in settings
 * await this.fcmRegistration.registerToken();
 * ```
 */

import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Platform } from '@ionic/angular/standalone';
import { Auth } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { NxtLoggingService } from '@nxt1/ui';
import type { ILogger } from '@nxt1/core/logging';
import { NativeBadgeService } from './native-badge.service';

interface RegisterTokenResponse {
  success: boolean;
}

@Injectable({ providedIn: 'root' })
export class FcmRegistrationService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ionicPlatform = inject(Platform);
  private readonly auth = inject(Auth);
  private readonly functions = inject(Functions);
  private readonly nativeBadge = inject(NativeBadgeService);
  private readonly logger: ILogger = inject(NxtLoggingService).child('FcmRegistrationService');

  /** Cached FCM token for current device (keyed by UID) */
  private cachedToken?: string;
  private cachedTokenUid?: string;
  private readonly STORAGE_KEY = 'nxt1_fcm_token';
  private readonly STORAGE_UID_KEY = 'nxt1_fcm_token_uid';

  /**
   * Request permission and register FCM token for the current user.
   * Should be called only from explicit user opt-in moments.
   */
  async registerToken(): Promise<void> {
    await this.registerTokenInternal({ requestPermission: true });
  }

  /**
   * Refresh/register the token only if notification permission is already granted.
   * This is safe for app resume because it never opens the native permission prompt.
   */
  async registerTokenIfPermissionGranted(): Promise<void> {
    await this.registerTokenInternal({ requestPermission: false });
  }

  private async registerTokenInternal(options: { requestPermission: boolean }): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      this.logger.debug('Not in browser, skipping FCM registration');
      return;
    }

    await this.ionicPlatform.ready();

    if (!this.ionicPlatform.is('capacitor')) {
      this.logger.debug('Not on native platform, skipping FCM registration');
      return;
    }

    try {
      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');

      const permissionResult = options.requestPermission
        ? await FirebaseMessaging.requestPermissions()
        : await FirebaseMessaging.checkPermissions();

      if (permissionResult.receive !== 'granted') {
        if (options.requestPermission) {
          this.logger.warn('Push notification permission denied');
        } else {
          this.logger.debug('Push notification permission not granted; skipping FCM refresh');
        }
        return;
      }

      this.logger.debug('Push notification permission granted');
      await this.nativeBadge.syncAfterNotificationPermission();

      // ── Fast path: reuse cached token if it belongs to the current user ──────
      const currentUid = this.auth.currentUser?.uid;
      let token =
        this.cachedToken && this.cachedTokenUid === currentUid ? this.cachedToken : undefined;

      if (!token && currentUid) {
        try {
          const { Preferences } = await import('@capacitor/preferences');
          const [stored, storedUid] = await Promise.all([
            Preferences.get({ key: this.STORAGE_KEY }),
            Preferences.get({ key: this.STORAGE_UID_KEY }),
          ]);
          if (stored.value && storedUid.value === currentUid) {
            token = stored.value;
          }
        } catch {
          // Storage read failure is non-fatal — fall through to re-register
        }
      }

      if (token) {
        // Token already registered for this user on this device — skip backend call.
        this.cachedToken = token;
        this.cachedTokenUid = currentUid;
        this.logger.debug('FCM token already registered (from cache), skipping backend call', {
          platform: this.ionicPlatform.is('ios') ? 'ios' : 'android',
        });
        return;
      }

      // ── Slow path: get FCM token from Firebase Messaging ──────────────────
      const result = await FirebaseMessaging.getToken();
      token = result.token;
      this.logger.debug('FCM token received', { token });

      // Determine platform
      const platform = this.ionicPlatform.is('ios')
        ? 'ios'
        : this.ionicPlatform.is('android')
          ? 'android'
          : 'unknown';

      // Call Cloud Function to save token
      const registerFcmToken = httpsCallable<
        { token: string; platform: string },
        RegisterTokenResponse
      >(this.functions, 'registerFcmToken');

      await registerFcmToken({ token: token!, platform });

      // Cache token for later unregister (scoped to current user UID)
      this.cachedToken = token;
      this.cachedTokenUid = currentUid;
      try {
        const { Preferences } = await import('@capacitor/preferences');
        await Promise.all([
          Preferences.set({ key: this.STORAGE_KEY, value: token! }),
          Preferences.set({ key: this.STORAGE_UID_KEY, value: currentUid ?? '' }),
        ]);
      } catch (storageError) {
        this.logger.warn('Failed to cache FCM token', { error: storageError });
      }

      this.logger.info('FCM token registered successfully', { platform });
    } catch (error) {
      this.logger.error('Failed to register FCM token', error);
      // Don't throw - FCM registration failure shouldn't block login
    }
  }

  /**
   * Unregister FCM token (call on logout).
   */
  async unregisterToken(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    await this.ionicPlatform.ready();

    if (!this.ionicPlatform.is('capacitor')) return;

    try {
      // Try to get cached token first
      let token = this.cachedToken;

      if (!token) {
        try {
          const { Preferences } = await import('@capacitor/preferences');
          const result = await Preferences.get({ key: this.STORAGE_KEY });
          token = result.value || undefined;
        } catch (storageError) {
          this.logger.warn('Failed to get cached FCM token', { error: storageError });
        }
      }

      if (!token) {
        this.logger.info('No FCM token to unregister');
        return;
      }

      // Call Cloud Function to remove token
      const unregisterFcmToken = httpsCallable<{ token: string }, RegisterTokenResponse>(
        this.functions,
        'unregisterFcmToken'
      );

      await unregisterFcmToken({ token });

      // Clear cached token
      this.cachedToken = undefined;
      this.cachedTokenUid = undefined;
      try {
        const { Preferences } = await import('@capacitor/preferences');
        await Promise.all([
          Preferences.remove({ key: this.STORAGE_KEY }),
          Preferences.remove({ key: this.STORAGE_UID_KEY }),
        ]);
      } catch (storageError) {
        this.logger.warn('Failed to clear cached FCM token', { error: storageError });
      }

      this.logger.info('FCM token unregistered successfully');
    } catch (error) {
      this.logger.error('Failed to unregister FCM token', error);
      // Don't throw - logout should proceed even if unregistration fails
    }
  }
}
