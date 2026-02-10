/**
 * @fileoverview Wallet Module — Barrel Export
 * @module @nxt1/ui/wallet
 * @version 1.0.0
 *
 * Public API for the Credit Wallet UI module.
 * Portable UI that can be used as a page, bottom sheet, or modal.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```typescript
 * import {
 *   WalletShellComponent,
 *   WalletService,
 *   WalletBottomSheetService,
 * } from '@nxt1/ui';
 *
 * // Use as standalone page
 * <nxt1-wallet-shell (close)="onClose($event)" />
 *
 * // Use as bottom sheet
 * const result = await this.walletSheet.open();
 * if (result.purchased) this.refreshBalance();
 *
 * // Open directly to bundles (for low-balance prompts)
 * await this.walletSheet.openBundles();
 * ```
 */

// ============================================
// COMPONENTS
// ============================================

export { WalletShellComponent, type WalletCloseEvent } from './wallet-shell.component';
export { WalletSkeletonComponent } from './wallet-skeleton.component';

// ============================================
// SERVICES
// ============================================

export { WalletService } from './wallet.service';
export {
  WalletBottomSheetService,
  WalletModalComponent,
  type WalletSheetOptions,
  type WalletSheetResult,
} from './wallet-bottom-sheet.service';

// ============================================
// SECTION COMPONENTS (for custom layouts)
// ============================================

export { WalletBalanceSectionComponent } from './sections/wallet-balance-section.component';
export { WalletBundlesSectionComponent } from './sections/wallet-bundles-section.component';
export { WalletHistorySectionComponent } from './sections/wallet-history-section.component';
export { WalletSettingsSectionComponent } from './sections/wallet-settings-section.component';

// ============================================
// TYPES
// ============================================

export type {
  WalletSectionId,
  WalletBalance,
  WalletBundle,
  WalletTransaction,
  WalletSection,
  WalletAutoReload,
} from './wallet.mock-data';

// ============================================
// MOCK DATA (for development)
// ============================================

export {
  MOCK_WALLET_BALANCE,
  MOCK_WALLET_BUNDLES,
  MOCK_WALLET_TRANSACTIONS,
  MOCK_WALLET_AUTO_RELOAD,
  WALLET_SECTIONS,
  MOCK_EMPTY_WALLET_BALANCE,
  MOCK_EMPTY_WALLET_TRANSACTIONS,
} from './wallet.mock-data';
