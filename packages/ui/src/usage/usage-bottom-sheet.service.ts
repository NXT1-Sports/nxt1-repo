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

  /** Open credit package selector for buying credits (B2C) */
  async showBuyCreditsOptions(): Promise<number | null> {
    const packages = [5, 10, 25, 50, 100, 250, 500];
    const result = await this.bottomSheet.show<BottomSheetAction>({
      title: 'Buy Credits',
      icon: 'card-outline',
      actions: packages.map((amount) => ({
        label: `$${amount}`,
        role: 'primary' as const,
      })),
    });

    if (!result?.confirmed) return null;
    const selectedLabel = (result.data as BottomSheetAction | undefined)?.label;
    const match = selectedLabel?.match(/^\$(\d+)$/);
    return match ? parseInt(match[1], 10) * 100 : null;
  }
}
