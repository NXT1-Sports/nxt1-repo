/**
 * @fileoverview QR Code Service - Adaptive QR Code Modal/Sheet
 * @module @nxt1/ui/qr-code
 * @version 2.0.0
 *
 * Unified entry point for the QR Code feature that auto-selects
 * the best presentation based on platform:
 *
 * - **Mobile/Native/Touch <768px**: Native draggable bottom sheet (Ionic)
 * - **Web Desktop ≥768px**: Pure Angular overlay (NxtOverlayService)
 *
 * v2.0 — Web modal path migrated from Ionic ModalController to the shared
 * NxtOverlayService, eliminating Ionic dependency for desktop web.
 *
 * @example
 * ```typescript
 * import { QrCodeService } from '@nxt1/ui/qr-code';
 *
 * @Component({...})
 * export class ProfileComponent {
 *   private readonly qrCode = inject(QrCodeService);
 *
 *   async onQrCode(): Promise<void> {
 *     await this.qrCode.open({
 *       url: 'https://nxt1sports.com/profile/abc123',
 *       displayName: 'John Smith',
 *       profileImg: 'https://...',
 *       sport: 'Football',
 *     });
 *   }
 * }
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject } from '@angular/core';
import { NxtPlatformService } from '../services/platform';
import { NxtBottomSheetService } from '../components/bottom-sheet';
import { NxtOverlayService } from '../components/overlay';
import { NxtLoggingService } from '../services/logging';
import { NxtQrCodeContentComponent } from './qr-code-content.component';
import { NxtQrCodeModalComponent } from './qr-code-modal.component';
import type { QrCodeConfig, QrCodeResult } from './qr-code.types';

@Injectable({ providedIn: 'root' })
export class QrCodeService {
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly overlay = inject(NxtOverlayService);
  private readonly platform = inject(NxtPlatformService);
  private readonly logger = inject(NxtLoggingService).child('QrCodeService');

  /**
   * Opens the QR Code with adaptive presentation:
   * - Mobile/tablet: bottom sheet with drag handle (Ionic)
   * - Desktop: centered overlay (pure Angular)
   *
   * @param config - QR Code configuration
   * @returns Promise resolving to QR code result
   */
  async open(config: QrCodeConfig): Promise<QrCodeResult> {
    this.logger.info('Opening QR code', {
      url: config.url,
      displayName: config.displayName,
      presentation: this.shouldUseBottomSheet() ? 'bottom-sheet' : 'web-overlay',
    });

    if (this.shouldUseBottomSheet()) {
      return this.openBottomSheet(config);
    }

    return this.openWebOverlay(config);
  }

  // ============================================
  // BOTTOM SHEET (Mobile/Tablet — Ionic)
  // ============================================

  private async openBottomSheet(config: QrCodeConfig): Promise<QrCodeResult> {
    const result = await this.bottomSheet.openSheet<QrCodeResult>({
      component: NxtQrCodeModalComponent,
      componentProps: {
        url: config.url,
        displayName: config.displayName,
        profileImg: config.profileImg ?? '',
        sport: config.sport ?? '',
      },
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      backdropBreakpoint: 0.5,
      canDismiss: true,
      cssClass: 'nxt1-qr-code-modal',
    });

    return {
      dismissed: true,
      shared: result.role === 'share',
      action: (result.data as QrCodeResult | undefined)?.action ?? 'dismiss',
    };
  }

  // ============================================
  // WEB OVERLAY (Desktop — Pure Angular)
  // ============================================

  private async openWebOverlay(config: QrCodeConfig): Promise<QrCodeResult> {
    try {
      const ref = this.overlay.open<NxtQrCodeContentComponent, QrCodeResult>({
        component: NxtQrCodeContentComponent,
        inputs: {
          url: config.url,
          displayName: config.displayName,
          profileImg: config.profileImg ?? '',
          sport: config.sport ?? '',
          embedded: true,
        },
        size: 'lg',
        showCloseButton: true,
        backdropDismiss: true,
        ariaLabel: `QR Code for ${config.displayName}`,
      });

      const result = await ref.closed;

      return {
        dismissed: true,
        shared: result.data?.shared ?? false,
        action: result.data?.action ?? 'dismiss',
      };
    } catch (err) {
      this.logger.error('Failed to open QR code overlay', err);
      throw err;
    }
  }

  // ============================================
  // PLATFORM DETECTION
  // ============================================

  /**
   * Determines if bottom sheet should be used.
   * Same logic as ExploreFilterModalService.
   */
  private shouldUseBottomSheet(): boolean {
    // Native apps always use bottom sheet
    if (this.platform.isNative()) {
      return true;
    }

    // SSR: no bottom sheet
    if (!this.platform.isBrowser()) {
      return false;
    }

    // Mobile viewport: bottom sheet
    const viewportWidth = this.platform.viewport().width;
    if (viewportWidth < 768) {
      return true;
    }

    // Touch device under 1024px: bottom sheet
    const hasTouch = this.platform.hasTouch();
    if (hasTouch && viewportWidth < 1024) {
      return true;
    }

    // Desktop: overlay
    return false;
  }
}
