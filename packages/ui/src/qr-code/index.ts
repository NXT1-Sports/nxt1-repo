/**
 * @fileoverview QR Code Feature Barrel Export
 * @module @nxt1/ui/qr-code
 *
 * Exports all QR code related components, services, and types.
 *
 * Two presentation modes supported:
 * 1. Bottom Sheet: Native draggable sheet for mobile/tablet
 * 2. Web Modal: Centered overlay for desktop
 *
 * Use the unified QrCodeService for automatic platform detection,
 * or use QrCodeBottomSheetService directly for mobile-only code.
 *
 * Usage:
 * ```typescript
 * import { QrCodeService } from '@nxt1/ui/qr-code';
 *
 * // Adaptive (auto-selects bottom sheet vs modal)
 * await qrCodeService.open({
 *   url: 'https://nxt1sports.com/profile/abc123',
 *   displayName: 'John Smith',
 * });
 * ```
 */

// Components
export { NxtQrCodeContentComponent } from './qr-code-content.component';
export { NxtQrCodeMobileComponent } from './qr-code-mobile.component';
export { NxtQrCodeModalComponent } from './qr-code-modal.component';

// Services
export { QrCodeService } from './qr-code.service';
export { QrCodeBottomSheetService } from './qr-code-bottom-sheet.service';

// Types
export type { QrCodeConfig, QrCodeResult } from './qr-code.types';
