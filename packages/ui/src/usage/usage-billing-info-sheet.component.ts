/**
 * @fileoverview Usage Billing Info Sheet — DEPRECATED
 * @module @nxt1/ui/usage
 * @deprecated Billing info is now managed via Stripe Customer Portal.
 *             This file is retained only for backwards-compatible type exports.
 */

export type BillingInfoSheetMode = 'billing' | 'additional';

export interface BillingInfoSheetResult {
  readonly saved: boolean;
}
