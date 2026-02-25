/**
 * @fileoverview QR Code Service - Adaptive QR Code Modal/Sheet
 * @module @nxt1/ui/qr-code
 * @version 1.0.0
 *
 * Unified entry point for the QR Code feature that auto-selects
 * the best presentation based on platform:
 *
 * - **Mobile/Native/Touch <768px**: Native draggable bottom sheet
 * - **Web Desktop ≥768px**: Centered modal overlay
 *
 * Following the same adaptive pattern as ExploreFilterModalService.
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
import { ModalController } from '@ionic/angular/standalone';
import { NxtPlatformService } from '../services/platform';
import { NxtBottomSheetService } from '../components/bottom-sheet';
import { NxtLoggingService } from '../services/logging';
import { NxtQrCodeModalComponent } from './qr-code-modal.component';
import type { QrCodeConfig, QrCodeResult } from './qr-code.types';

@Injectable({ providedIn: 'root' })
export class QrCodeService {
  private readonly modalCtrl = inject(ModalController);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly platform = inject(NxtPlatformService);
  private readonly logger = inject(NxtLoggingService).child('QrCodeService');

  /**
   * Opens the QR Code with adaptive presentation:
   * - Mobile/tablet: bottom sheet with drag handle
   * - Desktop: centered modal with backdrop
   *
   * @param config - QR Code configuration
   * @returns Promise resolving to QR code result
   */
  async open(config: QrCodeConfig): Promise<QrCodeResult> {
    this.logger.info('Opening QR code', {
      url: config.url,
      displayName: config.displayName,
      presentation: this.shouldUseBottomSheet() ? 'bottom-sheet' : 'web-modal',
    });

    const useBottomSheet = this.shouldUseBottomSheet();

    if (useBottomSheet) {
      return this.openBottomSheet(config);
    } else {
      return this.openWebModal(config);
    }
  }

  // ============================================
  // BOTTOM SHEET (Mobile/Tablet)
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
  // WEB MODAL (Desktop)
  // ============================================

  private async openWebModal(config: QrCodeConfig): Promise<QrCodeResult> {
    try {
      const modal = await this.modalCtrl.create({
        component: NxtQrCodeModalComponent,
        componentProps: {
          url: config.url,
          displayName: config.displayName,
          profileImg: config.profileImg ?? '',
          sport: config.sport ?? '',
        },
        cssClass: 'nxt1-qr-code-modal nxt1-qr-code-modal--centered',
        backdropDismiss: true,
        showBackdrop: true,
      });

      await modal.present();

      const result = await modal.onDidDismiss<QrCodeResult>();

      return {
        dismissed: true,
        shared: result.role === 'share',
        action: result.data?.action ?? 'dismiss',
      };
    } catch (err) {
      this.logger.error('Failed to create/present QR code modal', err);
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

    // Desktop: centered modal
    return false;
  }
}
