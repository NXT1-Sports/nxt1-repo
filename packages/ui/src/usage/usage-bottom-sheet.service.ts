/**
 * @fileoverview Usage Bottom Sheet Service — Mobile Actions
 * @module @nxt1/ui/usage
 *
 * Bottom sheet for mobile usage actions:
 * - Change timeframe
 * - Budget options
 *
 * Payment method management is handled via Stripe Customer Portal.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject } from '@angular/core';
import { NxtBottomSheetService, SHEET_PRESETS } from '../components/bottom-sheet';
import { USAGE_TIMEFRAME_OPTIONS, type UsageTimeframe } from '@nxt1/core';
import type {
  BottomSheetAction,
  BottomSheetResult,
} from '../components/bottom-sheet/bottom-sheet.types';
import { BuyCreditsAutoTopupSheetComponent } from './buy-credits-autotopup-sheet.component';
import type { BuyCreditsAutoTopupResult } from './buy-credits-flow.shared';

export interface UsageBottomSheetResult {
  readonly action: string;
  readonly value?: string;
}

@Injectable({ providedIn: 'root' })
export class UsageBottomSheetService {
  private readonly bottomSheet = inject(NxtBottomSheetService);

  /**
   * Optional iOS-specific handler for Apple IAP.
   * When registered, the buy-credits sheet exposes a dedicated IAP button
   * alongside the standard Stripe purchase path.
   */
  private _buyCreditsIapHandler: (() => Promise<void>) | null = null;

  /**
   * Register a platform-specific Apple IAP handler.
   * On iOS the mobile app registers `IapService.showProductsAndPurchase()` so
   * compatible buy-credits sheets can expose both Stripe and Apple IAP.
   */
  registerBuyCreditsHandler(handler: () => Promise<void>): void {
    this._buyCreditsIapHandler = handler;
  }

  /** Open timeframe selector */
  async selectTimeframe(): Promise<UsageTimeframe | null> {
    const result = await this.bottomSheet.show({
      title: 'Select Time Period',
      icon: 'calendar-outline',
      actions: USAGE_TIMEFRAME_OPTIONS.map((opt) => ({
        label: opt.label,
        role: 'secondary' as const,
        handler: () => {
          // Selected value handled via result
        },
      })),
    });

    if (!result?.confirmed) return null;
    return ((result as BottomSheetResult & { reason?: string }).reason as UsageTimeframe) ?? null;
  }

  /** Open budget options */
  async showBudgetOptions(): Promise<UsageBottomSheetResult | null> {
    const result = await this.bottomSheet.show({
      title: 'Budget Options',
      icon: 'wallet-outline',
      actions: [
        { label: 'Edit budget', role: 'primary', icon: 'create-outline' },
        { label: 'Disable alerts', role: 'secondary', icon: 'notifications-off-outline' },
        { label: 'Delete budget', role: 'destructive', icon: 'trash-outline' },
      ],
    });

    if (!result?.confirmed) return null;
    const selected = result.data as unknown as BottomSheetAction | undefined;
    return { action: selected?.label ?? 'unknown' };
  }

  /** Open general usage actions */
  async showUsageActions(): Promise<UsageBottomSheetResult | null> {
    const result = await this.bottomSheet.show({
      title: 'Usage Options',
      icon: 'ellipsis-horizontal-outline',
      actions: [
        { label: 'Export as CSV', role: 'secondary', icon: 'download-outline' },
        { label: 'Download PDF report', role: 'secondary', icon: 'document-outline' },
        { label: 'Contact billing support', role: 'secondary', icon: 'chatbox-outline' },
      ],
    });

    if (!result?.confirmed) return null;
    return { action: result.reason ?? 'unknown' };
  }

  /** Open budget limit selector for creating or editing a budget */
  async showBudgetLimit(currentLimit?: number): Promise<number | null> {
    const limits = [10, 25, 50, 100, 250, 500, 1000];
    const result = await this.bottomSheet.show<BottomSheetAction>({
      title: 'Set Budget Limit',
      icon: 'wallet-outline',
      actions: limits.map((amount) => ({
        label: `$${amount} / month`,
        role: 'primary' as const,
        icon: currentLimit === amount * 100 ? ('checkmark-circle-outline' as const) : undefined,
      })),
    });

    if (!result?.confirmed) return null;
    const selectedLabel = (result.data as BottomSheetAction | undefined)?.label;
    const match = selectedLabel?.match(/^\$(\d+)\s*\/\s*month$/);
    return match ? parseInt(match[1], 10) * 100 : null;
  }

  /** Open credit package selector for buying credits (B2C). */
  async showBuyCreditsOptions(): Promise<number | null> {
    const result = await this.openBuyCreditsSheet({
      autoTopupEnabled: false,
      autoTopupThresholdCents: 500,
      autoTopupAmountCents: 1_000,
    });

    if (result?.type === 'buy-iap') {
      await this._buyCreditsIapHandler?.();
      return null;
    }

    return result?.type === 'buy' ? result.amountCents : null;
  }

  /**
   * Combined buy-credits + auto top-up flow for mobile.
   *
   * Step 1: Show credit packages (delegates to `showBuyCreditsOptions`).
   * Step 2: If a package was selected AND auto top-up is not already on, offer
   *         to configure it via a follow-up bottom sheet.
   *
   * Returns `{ amountCents, autoTopup }` where `autoTopup` is non-null only
   * when the user configured it in step 2.
   */
  async showBuyCreditsWithAutoTopup(opts: {
    autoTopupEnabled: boolean;
    autoTopupThresholdCents: number;
    autoTopupAmountCents: number;
  }): Promise<{
    amountCents: number | null;
    autoTopup: { enabled: boolean; thresholdCents: number; amountCents: number } | null;
  }> {
    const result = await this.openBuyCreditsSheet(opts);

    if (result?.type === 'buy-iap') {
      await this._buyCreditsIapHandler?.();
      return { amountCents: null, autoTopup: null };
    }

    if (result?.type === 'buy') {
      return { amountCents: result.amountCents, autoTopup: null };
    }

    if (result?.type === 'auto-topup') {
      return {
        amountCents: null,
        autoTopup: {
          enabled: result.enabled,
          thresholdCents: result.thresholdCents,
          amountCents: result.amountCents,
        },
      };
    }

    return { amountCents: null, autoTopup: null };
  }

  private async openBuyCreditsSheet(opts: {
    autoTopupEnabled: boolean;
    autoTopupThresholdCents: number;
    autoTopupAmountCents: number;
  }): Promise<BuyCreditsAutoTopupResult> {
    const result = await this.bottomSheet.openSheet<BuyCreditsAutoTopupResult>({
      component: BuyCreditsAutoTopupSheetComponent,
      componentProps: {
        initialAutoTopupEnabled: opts.autoTopupEnabled,
        initialThresholdCents: opts.autoTopupThresholdCents,
        initialAutoTopupAmountCents: opts.autoTopupAmountCents,
        showIapPayButton: this._buyCreditsIapHandler !== null,
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      cssClass: 'usage-buy-credits-sheet',
    });

    return result.data ?? null;
  }

  /** Show threshold selector for auto top-up configuration. */
  async showAutoTopupThreshold(): Promise<number | null> {
    const thresholds = [200, 500, 1_000, 2_500];
    const result = await this.bottomSheet.show<BottomSheetAction>({
      title: 'Top up when balance drops below',
      icon: 'arrow-down-circle-outline',
      actions: thresholds.map((cents) => ({
        label: `$${(cents / 100).toFixed(2)}`,
        role: 'primary' as const,
      })),
    });
    if (!result?.confirmed) return null;
    const label = (result.data as BottomSheetAction | undefined)?.label;
    const match = label?.match(/^\$(\d+(?:\.\d+)?)$/);
    return match ? Math.round(parseFloat(match[1]) * 100) : null;
  }

  /** Show amount selector for auto top-up configuration. */
  async showAutoTopupAmount(): Promise<number | null> {
    const amounts = [500, 1_000, 2_500, 5_000, 10_000];
    const result = await this.bottomSheet.show<BottomSheetAction>({
      title: 'Add this much each time',
      icon: 'arrow-up-circle-outline',
      actions: amounts.map((cents) => ({
        label: `$${(cents / 100).toFixed(2)}`,
        role: 'primary' as const,
      })),
    });
    if (!result?.confirmed) return null;
    const label = (result.data as BottomSheetAction | undefined)?.label;
    const match = label?.match(/^\$(\d+(?:\.\d+)?)$/);
    return match ? Math.round(parseFloat(match[1]) * 100) : null;
  }
}
