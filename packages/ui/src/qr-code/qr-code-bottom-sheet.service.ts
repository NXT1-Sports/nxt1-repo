/**
 * @fileoverview QR Code Bottom Sheet Service - Mobile Native Sheet
 * @module @nxt1/ui/qr-code
 * @version 1.0.0
 *
 * Feature-specific service that uses the shared NxtBottomSheetService
 * to open the QR Code feature in a native draggable bottom sheet.
 *
 * Architecture:
 * - NxtBottomSheetService.openSheet() = Unified service for ALL content sheets
 * - QrCodeBottomSheetService.open() = Thin wrapper configured for QR Code
 *
 * This is a thin wrapper that:
 * 1. Uses the generic NxtBottomSheetService.openSheet() method
 * 2. Configures it specifically for the QR Code feature
 * 3. Provides native iOS/Android sheet UX
 *
 * USES SHARED NxtBottomSheetService - NOT HARDCODED
 *
 * Following same pattern as InviteBottomSheetService and EditProfileBottomSheetService.
 *
 * @example
 * ```typescript
 * // In a component or service
 * private readonly qrSheet = inject(QrCodeBottomSheetService);
 *
 * async showQrCode(): Promise<void> {
 *   await this.qrSheet.open({
 *     url: 'https://nxt1sports.com/profile/abc123',
 *     displayName: 'John Smith',
 *     profileImg: 'https://...',
 *     sport: 'Football',
 *   });
 * }
 * ```
 *
 * ⭐ MOBILE BOTTOM SHEET ⭐
 */

import { Injectable, inject } from '@angular/core';
import { NxtBottomSheetService } from '../components/bottom-sheet';
import { NxtQrCodeModalComponent } from './qr-code-modal.component';
import type { QrCodeConfig, QrCodeResult } from './qr-code.types';

@Injectable({ providedIn: 'root' })
export class QrCodeBottomSheetService {
  private readonly bottomSheet = inject(NxtBottomSheetService);

  /**
   * Opens the QR Code in a native draggable bottom sheet.
   *
   * Uses NxtBottomSheetService.openSheet() with QR Code configuration:
   * - Breakpoints: 0 (closed), 0.75 (default), 1 (full)
   * - Native drag handle
   * - Swipe-to-dismiss enabled
   *
   * @param config - Configuration including URL, display name, etc.
   * @returns Promise resolving to the QR code result
   */
  async open(config: QrCodeConfig): Promise<QrCodeResult> {
    const result = await this.bottomSheet.openSheet<QrCodeResult>({
      // The component to inject
      component: NxtQrCodeModalComponent,

      // Component inputs (regular properties via Ionic componentProps)
      componentProps: {
        url: config.url,
        displayName: config.displayName,
        profileImg: config.profileImg ?? '',
        sport: config.sport ?? '',
      },

      // Breakpoints for draggable resize
      // 0 = closed, 0.75 = default (shows full QR), 1 = full screen
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,

      // Show native drag handle bar
      showHandle: true,
      handleBehavior: 'cycle',

      // Backdrop behavior
      backdropDismiss: true,
      backdropBreakpoint: 0.5,

      // Allow swipe-to-dismiss
      canDismiss: true,

      // QR Code specific styling
      cssClass: 'nxt1-qr-code-modal',
    });

    return {
      dismissed: true,
      shared: result.role === 'share',
      action: (result.data as QrCodeResult | undefined)?.action ?? 'dismiss',
    };
  }
}
