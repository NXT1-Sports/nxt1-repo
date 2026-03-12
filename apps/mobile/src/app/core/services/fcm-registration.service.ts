/**
 * @fileoverview FCM Token Registration Service
 * @module @nxt1/mobile/core
 *
 * Handles FCM token registration after user login.
 * Calls Cloud Function to save token to FcmTokens/{userId} collection.
 *
 * Usage:
 * ```typescript
 * // In auth-flow.service.ts after successful login
 * await this.fcmRegistration.registerToken();
 * ```
 */

import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Platform } from '@ionic/angular/standalone';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { NxtLoggingService } from '@nxt1/ui';
import type { ILogger } from '@nxt1/core/logging';

interface RegisterTokenResponse {
  success: boolean;
}

@Injectable({ providedIn: 'root' })
export class FcmRegistrationService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ionicPlatform = inject(Platform);
  private readonly functions = inject(Functions);
  private readonly logger: ILogger = inject(NxtLoggingService).child('FcmRegistrationService');

  /** Cached FCM token for current device */
  private cachedToken?: string;
  private readonly STORAGE_KEY = 'nxt1_fcm_token';

  /**
   * Request permission and register FCM token for the current user.
   * Should be called after successful login.
   */
  async registerToken(): Promise<void> {
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
      const { PushNotifications } = await import('@capacitor/push-notifications');

      // Request permission
      const permissionResult = await PushNotifications.requestPermissions();

      if (permissionResult.receive === 'granted') {
        this.logger.debug('Push notification permission granted');

        // Setup listener BEFORE calling register() to avoid race condition
        const registrationPromise = new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('FCM registration timeout'));
          }, 10000); // 10s timeout

          // Remove old listeners first
          PushNotifications.removeAllListeners();

          PushNotifications.addListener('registration', (token) => {
            clearTimeout(timeout);
            this.logger.debug('FCM token received', { token: token.value });
            resolve(token.value);
          });

          PushNotifications.addListener('registrationError', (error) => {
            clearTimeout(timeout);
            this.logger.error('FCM registration error', error);
            reject(error);
          });
        });

        // Register with FCM (will trigger 'registration' event)
        await PushNotifications.register();

        const token = await registrationPromise;

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

        await registerFcmToken({ token, platform });

        // Cache token for later unregister
        this.cachedToken = token;
        try {
          const { Preferences } = await import('@capacitor/preferences');
          await Preferences.set({ key: this.STORAGE_KEY, value: token });
        } catch (storageError) {
          this.logger.warn('Failed to cache FCM token', { error: storageError });
        }

        this.logger.info('FCM token registered successfully', { platform });
      } else {
        this.logger.warn('Push notification permission denied');
      }
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
        // Try to get from storage
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
      try {
        const { Preferences } = await import('@capacitor/preferences');
        await Preferences.remove({ key: this.STORAGE_KEY });
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
