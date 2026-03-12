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

        // Register with FCM
        await PushNotifications.register();

        // Wait for registration to complete
        const registrationPromise = new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('FCM registration timeout'));
          }, 10000); // 10s timeout

          PushNotifications.addListener('registration', (token) => {
            clearTimeout(timeout);
            resolve(token.value);
          });

          PushNotifications.addListener('registrationError', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });

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
      const { PushNotifications } = await import('@capacitor/push-notifications');

      // Get current token
      const registrationPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('FCM token retrieval timeout'));
        }, 5000);

        PushNotifications.addListener('registration', (token) => {
          clearTimeout(timeout);
          resolve(token.value);
        });

        PushNotifications.addListener('registrationError', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      await PushNotifications.register();
      const token = await registrationPromise;

      // Call Cloud Function to remove token
      const unregisterFcmToken = httpsCallable<{ token: string }, RegisterTokenResponse>(
        this.functions,
        'unregisterFcmToken'
      );

      await unregisterFcmToken({ token });

      this.logger.info('FCM token unregistered successfully');
    } catch (error) {
      this.logger.error('Failed to unregister FCM token', error);
      // Don't throw - logout should proceed even if unregistration fails
    }
  }
}
