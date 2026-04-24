/**
 * @fileoverview Normalized Billing Domain Types
 * @module @nxt1/core/usage
 *
 * Canonical storage models for the billing system. These are intentionally
 * distinct from API-facing summary payloads so backend routes can aggregate
 * and project normalized storage into stable frontend contracts.
 */

import type { BudgetInterval, PaymentProviderType } from './usage.types';

/** Owner of a billable wallet. */
export type BillingOwnerType = 'individual' | 'organization';

/** Why the active billing target resolved to the selected wallet. */
export type BillingTargetSource = 'default' | 'personal' | 'organization';

/**
 * Active billing target stored on the user profile.
 * This is the runtime routing source of truth for wallet deductions.
 */
export interface BillingTargetReference {
  readonly ownerId: string;
  readonly ownerType: BillingOwnerType;
  readonly source: BillingTargetSource;
  readonly userSelected?: boolean;
  readonly organizationId?: string;
  readonly teamId?: string;
}

/**
 * Pure financial ledger for available and reserved credits.
 * No policy or monthly budget logic belongs here.
 */
export interface Wallet {
  readonly id: string;
  readonly ownerId: string;
  readonly ownerType: BillingOwnerType;
  readonly balanceCents: number;
  readonly pendingHoldsCents: number;
  readonly creditsAlertBaselineCents?: number;
  readonly creditsNotified80?: boolean;
  readonly creditsNotified50?: boolean;
  readonly creditsNotified25?: boolean;
  readonly iapLowBalanceNotified?: boolean;
  readonly totalReferralRewardsCents?: number;
}

/**
 * Billing configuration and payment behavior.
 * This document changes rarely and never stores running financial balances.
 */
export interface BillingPreference {
  readonly id: string;
  readonly ownerId: string;
  readonly ownerType: BillingOwnerType;
  readonly paymentProvider: PaymentProviderType;
  readonly billingOwnerUid?: string;
  readonly budgetName?: string;
  readonly budgetAlertsEnabled?: boolean;
  readonly budgetInterval?: BudgetInterval;
  readonly hardStop: boolean;
  readonly autoTopUpEnabled?: boolean;
  readonly autoTopUpThresholdCents?: number;
  readonly autoTopUpAmountCents?: number;
  readonly autoTopUpInProgress?: boolean;
  readonly autoTopUpLockedAt?: string;
}

/**
 * Period-scoped spend ledger used for budget enforcement and monthly resets.
 */
export interface PeriodLedger {
  readonly id: string;
  readonly ownerId: string;
  readonly ownerType: BillingOwnerType;
  readonly periodKey: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly monthlyBudget: number;
  readonly currentPeriodSpend: number;
  readonly notified50: boolean;
  readonly notified80: boolean;
  readonly notified100: boolean;
}
