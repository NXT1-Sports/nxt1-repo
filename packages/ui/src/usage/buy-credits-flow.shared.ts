/**
 * @fileoverview Shared Buy Credits + Auto Top-Up flow constants and helpers
 * @module @nxt1/ui/usage
 */

/** Auto top-up settings payload */
export interface AutoTopupSettings {
  readonly enabled: boolean;
  readonly thresholdCents: number;
  readonly amountCents: number;
}

/** Union result type emitted by buy-credits surfaces. */
export type BuyCreditsAutoTopupResult =
  | { readonly type: 'buy'; readonly amountCents: number }
  | ({ readonly type: 'auto-topup' } & AutoTopupSettings)
  | null;

/** Credit package dollar amounts. */
export const CREDIT_PACKAGES_USD = [5, 10, 25, 50, 100, 250, 500] as const;

/** Preset threshold values at which auto top-up fires (in cents). */
export const THRESHOLD_PRESETS_CENTS = [200, 500, 1_000, 2_500] as const;

/** Preset top-up amounts (in cents). */
export const TOPUP_AMOUNT_PRESETS_CENTS = [500, 1_000, 2_500, 5_000, 10_000] as const;

export type CreditPackageUsd = (typeof CREDIT_PACKAGES_USD)[number];
export type BuyCreditsTab = 'buy' | 'auto-topup';

export function normalizeUsdInput(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, '');
  const [whole = '', ...decimals] = cleaned.split('.');
  if (decimals.length === 0) return whole;

  return `${whole}.${decimals.join('').slice(0, 2)}`;
}

export function parseUsdToCents(value: string): number | null {
  if (value.length === 0) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(value)) return null;

  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return Math.round(amount * 100);
}
