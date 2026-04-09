/**
 * @fileoverview Native Badge Service — App Icon Badge Sync
 * @module @nxt1/mobile/core
 *
 * Syncs the Angular signal-based badge state (GlobalBadgeService.totalUnread)
 * to the native iOS/Android app icon badge using @capawesome/capacitor-badge.
 *
 * Architecture:
 * - **Foreground**: An Angular effect() watches totalUnread and instantly
 *   updates the native badge count (e.g., user reads all → badge clears).
 * - **Background**: The FCM push payload sets the badge via APNS/Android
 *   (see onNotificationCreated Cloud Function). When the user reopens the app,
 *   the effect() re-syncs the real count from the backend.
 *
 * This follows the same pattern as Facebook, Instagram, and WhatsApp:
 * the OS badge reflects true server-side unread count at all times.
 *
 * Usage:
 * ```typescript
 * // In app.component.ts — just inject to activate the effect
 * private readonly nativeBadge = inject(NativeBadgeService);
 * ```
 */

import { Injectable, inject, effect, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Platform } from '@ionic/angular/standalone';
import {
  GlobalBadgeService,
  NxtLoggingService,
  NxtBreadcrumbService,
  ANALYTICS_ADAPTER,
} from '@nxt1/ui';
import type { ILogger } from '@nxt1/core/logging';

@Injectable({ providedIn: 'root' })
export class NativeBadgeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ionicPlatform = inject(Platform);
  private readonly badgeService = inject(GlobalBadgeService);
  private readonly logger: ILogger = inject(NxtLoggingService).child('NativeBadge');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  /** Track last synced count to avoid redundant native calls */
  private lastSyncedCount = -1;

  /** Whether badge permission has already been granted (checked once) */
  private permissionGranted: boolean | null = null;

  constructor() {
    // Reactive effect: whenever totalUnread changes, sync to native badge
    effect(() => {
      const count = this.badgeService.totalUnread();
      this.syncBadge(count);
    });
  }

  /**
   * Sync the badge count to the native app icon.
   * Skips redundant calls if the count hasn't changed.
   */
  private syncBadge(count: number): void {
    if (count === this.lastSyncedCount) return;
    this.lastSyncedCount = count;

    if (!isPlatformBrowser(this.platformId)) return;

    void this.applyNativeBadge(count);
  }

  /**
   * Apply the badge count to the native app icon.
   * Uses @capawesome/capacitor-badge for cross-platform support (iOS + Android).
   */
  private async applyNativeBadge(count: number): Promise<void> {
    try {
      await this.ionicPlatform.ready();

      if (!this.ionicPlatform.is('capacitor')) return;

      const { Badge } = await import('@capawesome/capacitor-badge');

      // Check permission once — cache the result for subsequent calls
      if (this.permissionGranted === null) {
        const permResult = await Badge.checkPermissions();
        if (permResult.display === 'granted') {
          this.permissionGranted = true;
        } else {
          const requestResult = await Badge.requestPermissions();
          this.permissionGranted = requestResult.display === 'granted';
        }

        if (!this.permissionGranted) {
          this.logger.info('Badge permission denied by user');
          return;
        }
      }

      if (!this.permissionGranted) return;

      if (count > 0) {
        await Badge.set({ count });
        this.logger.debug('Native badge set', { count });
      } else {
        await Badge.clear();
        this.logger.debug('Native badge cleared');
      }

      this.breadcrumb.trackStateChange(count > 0 ? 'native-badge:set' : 'native-badge:cleared', {
        count,
      });
    } catch (error) {
      this.logger.warn('Failed to sync native badge', { error, count });
    }
  }
}
