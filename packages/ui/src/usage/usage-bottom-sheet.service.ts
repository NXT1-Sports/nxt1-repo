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
import { NxtBottomSheetService } from '../components/bottom-sheet';
import { USAGE_TIMEFRAME_OPTIONS, type UsageTimeframe } from '@nxt1/core';
import type {
  BottomSheetAction,
  BottomSheetResult,
} from '../components/bottom-sheet/bottom-sheet.types';

export interface UsageBottomSheetResult {
  readonly action: string;
  readonly value?: string;
}

@Injectable({ providedIn: 'root' })
export class UsageBottomSheetService {
  private readonly bottomSheet = inject(NxtBottomSheetService);

  /**
   * Optional override for the buy-credits flow (e.g. Apple IAP on iOS).
   * When registered, `showBuyCreditsOptions()` delegates to this handler
   * (which handles the entire purchase internally) and returns `null`.
   */
  private _buyCreditsOverride: (() => Promise<void>) | null = null;

  /**
   * Register a platform-specific buy-credits handler.
   * On iOS the mobile app registers `IapService.showProductsAndPurchase()`
   * so that every surface (Agent X, Usage, billing card) opens Apple IAP
   * instead of the basic Stripe credit-package selector.
   */
  registerBuyCreditsHandler(handler: () => Promise<void>): void {
    this._buyCreditsOverride = handler;
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

  /** Open credit package selector for buying credits (B2C).
   * If a platform-specific handler is registered (e.g. Apple IAP), delegates
   * to it and returns `null` (the handler completes the full purchase flow).
   */
  async showBuyCreditsOptions(): Promise<number | null> {
    // Delegate to IAP / platform override when registered
    if (this._buyCreditsOverride) {
      await this._buyCreditsOverride();
      return null;
    }

    // Stripe credit packages: 100 credits per dollar
    const packages = [
      { credits: 500, price: '$4.99' },
      { credits: 1_000, price: '$9.99' },
      { credits: 2_500, price: '$24.99' },
      { credits: 5_000, price: '$49.99' },
      { credits: 10_000, price: '$99.99' },
      { credits: 25_000, price: '$249.99' },
      { credits: 50_000, price: '$499.99' },
    ] as const;

    const result = await this.bottomSheet.show<BottomSheetAction>({
      title: 'Buy Credits',
      icon: 'card-outline',
      subtitle: 'Credits let you unlock premium actions across NXT1.',
      actions: packages.map((pkg) => ({
        label: `${pkg.credits.toLocaleString()} Credits — ${pkg.price}`,
        role: 'primary' as const,
      })),
    });

    if (!result?.confirmed) return null;
    const selectedLabel = (result.data as BottomSheetAction | undefined)?.label;
    const selected = packages.find(
      (pkg) => `${pkg.credits.toLocaleString()} Credits — ${pkg.price}` === selectedLabel
    );
    if (!selected) return null;

    // Parse price to cents for the Stripe checkout
    const priceCents = Math.round(parseFloat(selected.price.replace('$', '')) * 100);
    return priceCents;
  }
}
