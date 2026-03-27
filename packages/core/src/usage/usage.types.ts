/**
 * @fileoverview Usage Dashboard Types — Professional Billing Dashboard
 * @module @nxt1/core/usage
 * @version 2.0.0
 *
 * GitHub/Vercel-inspired billing dashboard types.
 * Single scrollable page: Overview → Subscriptions → Metered Usage Chart →
 * Usage Breakdown Table → Payment History → Payment Information.
 *
 * 100% portable — no framework dependencies.
 *
 * @author NXT1 Engineering
 */

import type {
  PaymentProvider,
  PaymentMethodType,
  Currency,
  TransactionStatus,
} from '../constants/payment.constants';

// ============================================
// BILLING PERIOD
// ============================================

/** A billing period range */
export interface UsagePeriod {
  /** ISO date — start of period */
  readonly start: string;
  /** ISO date — end of period */
  readonly end: string;
  /** Display label (e.g. "Feb 1 – Feb 28, 2026") */
  readonly label: string;
}

// ============================================
// TIMEFRAME FILTER
// ============================================

/** Available timeframe filter options */
export type UsageTimeframe =
  | 'current-month'
  | 'last-month'
  | 'last-3-months'
  | 'last-6-months'
  | 'last-12-months'
  | 'custom';

// ============================================
// OVERVIEW CARDS
// ============================================

/** Overview card data for the top-level summary */
export interface UsageOverview {
  /** Current metered usage total in cents */
  readonly currentMeteredUsage: number;
  /** Included usage discounts in cents */
  readonly currentIncludedUsage: number;
  /** Next payment due date (ISO) or null if none */
  readonly nextPaymentDueDate: string | null;
  /** Next payment amount in cents (0 if none) */
  readonly nextPaymentAmount: number;
  /** Billing period for the current data */
  readonly period: UsagePeriod;
  /** Currency code */
  readonly currency: Currency;
  /** Billing entity type — drives B2C vs B2B UI fork */
  readonly billingEntity: BillingEntity;
  /** How this context is funded */
  readonly paymentProvider: PaymentProviderType;
  /** Pre-paid wallet balance in cents (B2C / IAP users) */
  readonly walletBalanceCents: number;
  /** Pending wallet holds in cents (funds reserved for in-flight operations) */
  readonly pendingHoldsCents: number;
}

// ============================================
// SUBSCRIPTIONS
// ============================================

/** An active subscription */
export interface UsageSubscription {
  /** Unique ID */
  readonly id: string;
  /** Plan name (e.g. "NXT1 Free", "NXT1 Pro") */
  readonly name: string;
  /** Monthly cost in cents */
  readonly monthlyCost: number;
  /** Currency */
  readonly currency: Currency;
  /** Whether it's a free plan */
  readonly isFree: boolean;
  /** Plan features summary */
  readonly description: string;
}

// ============================================
// USAGE PRODUCT CATEGORIES
// ============================================

/** Product category for grouping */
export type UsageProductCategory =
  | 'media'
  | 'recruiting'
  | 'ai'
  | 'communication'
  | 'profile'
  | 'teams';

// ============================================
// METERED USAGE (chart + product tabs)
// ============================================

/** A data point on the usage chart (per day) */
export interface UsageChartDataPoint {
  /** ISO date for this point */
  readonly date: string;
  /** Display label (e.g. "Feb 1") */
  readonly label: string;
  /** Cumulative usage in cents at this point */
  readonly amount: number;
}

/** Included usage quota for a product category */
export interface UsageIncludedQuota {
  /** Label (e.g. "Highlight minutes") */
  readonly label: string;
  /** Amount used (in natural units) */
  readonly used: number;
  /** Total included amount */
  readonly included: number;
  /** Unit label (e.g. "min", "GB") */
  readonly unit: string;
}

/** Metered usage per product category (for product tabs) */
export interface UsageProductDetail {
  /** Category ID */
  readonly category: UsageProductCategory;
  /** Display label */
  readonly label: string;
  /** Icon name */
  readonly icon: string;
  /** Billable usage in cents */
  readonly billableAmount: number;
  /** Consumed usage in cents (before discounts) */
  readonly consumedAmount: number;
  /** Discount amount in cents */
  readonly discountAmount: number;
  /** Discount explanation text */
  readonly discountDescription: string;
  /** Included quotas (e.g. free tier limits) */
  readonly includedQuotas: readonly UsageIncludedQuota[];
  /** Days until included usage resets */
  readonly includedResetDays: number;
}

/** Usage data for the top products stacked bar */
export interface UsageTopItem {
  /** Name (e.g. product name) */
  readonly name: string;
  /** Color for the stacked bar segment */
  readonly color: string;
  /** Gross amount in cents */
  readonly grossAmount: number;
}

// ============================================
// USAGE BREAKDOWN TABLE (expandable rows)
// ============================================

/** A single SKU line item inside an expanded breakdown row */
export interface UsageBreakdownLineItem {
  /** SKU display name */
  readonly sku: string;
  /** Units consumed (e.g. "148 min", "384 requests") */
  readonly units: string;
  /** Price per unit formatted (e.g. "$0.006") */
  readonly pricePerUnit: string;
  /** Gross amount in cents */
  readonly grossAmount: number;
  /** Billed (after discounts) in cents */
  readonly billedAmount: number;
}

/** A single day row in the usage breakdown table */
export interface UsageBreakdownRow {
  /** ISO date */
  readonly date: string;
  /** Display date (e.g. "Feb 3, 2026") */
  readonly dateLabel: string;
  /** Total gross amount for the day in cents */
  readonly grossAmount: number;
  /** Total billed amount for the day in cents */
  readonly billedAmount: number;
  /** Line items (shown when row is expanded) */
  readonly lineItems: readonly UsageBreakdownLineItem[];
}

// ============================================
// PAYMENT HISTORY TABLE
// ============================================

/** A single payment history record */
export interface UsagePaymentHistoryRecord {
  /** Unique transaction ID */
  readonly id: string;
  /** Short display ID (e.g. "1FG1LCGT") */
  readonly displayId: string;
  /** Amount in cents */
  readonly amount: number;
  /** Currency */
  readonly currency: Currency;
  /** Transaction status */
  readonly status: TransactionStatus;
  /** Payment method label (e.g. "MasterCard ending in 9639") */
  readonly paymentMethodLabel: string;
  /** Payment provider */
  readonly provider: PaymentProvider;
  /** ISO date */
  readonly createdAt: string;
  /** Display date (e.g. "2026-01-15") */
  readonly dateLabel: string;
  /** Receipt download URL or null */
  readonly receiptUrl: string | null;
  /** Invoice download URL or null */
  readonly invoiceUrl: string | null;
}

// ============================================
// PAYMENT INFORMATION
// ============================================

/** Billing address / billing information */
export interface UsageBillingInfo {
  /** Full name */
  readonly name: string;
  /** Street address line 1 */
  readonly addressLine1: string;
  /** City, state, zip */
  readonly addressLine2: string;
  /** Country */
  readonly country: string;
}

/** A saved payment method */
export interface UsagePaymentMethod {
  /** Unique ID */
  readonly id: string;
  /** Payment method type */
  readonly type: PaymentMethodType;
  /** Provider */
  readonly provider: PaymentProvider;
  /** Display label (e.g. "Credit Card: MasterCard ending 9639") */
  readonly label: string;
  /** Last 4 digits (cards only) */
  readonly last4: string | null;
  /** Card brand (e.g. "visa", "mastercard") */
  readonly brand: string | null;
  /** Expiry month (1-12) */
  readonly expiryMonth: number | null;
  /** Expiry year (e.g. 2029) */
  readonly expiryYear: number | null;
  /** Whether this is the default payment method */
  readonly isDefault: boolean;
  /** Email associated (PayPal) */
  readonly email: string | null;
  /** ISO date when added */
  readonly addedAt: string;
}

/** Active coupon / discount */
export interface UsageCoupon {
  /** Coupon code */
  readonly code: string;
  /** Discount description */
  readonly description: string;
  /** Discount percentage (0-100) or 0 if flat */
  readonly percentOff: number;
  /** Discount flat amount in cents or 0 if percentage */
  readonly amountOff: number;
  /** Expiry date (ISO) or null */
  readonly expiresAt: string | null;
  /** Whether currently active */
  readonly isActive: boolean;
}

// ============================================
// BUDGETS & ALERTS
// ============================================

/** Who pays: the individual user, a team sub-allocation, or the parent organization */
export type BillingEntity = 'individual' | 'team' | 'organization';

/** How a billing context is funded */
export type PaymentProviderType = 'stripe' | 'iap';

/** The user's billing context summary (returned by GET /budget) */
export interface BillingContextSummary {
  readonly billingEntity: BillingEntity;
  readonly monthlyBudget: number;
  readonly currentPeriodSpend: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly percentUsed: number;
  readonly hardStop: boolean;
  readonly teamId?: string;
  readonly organizationId?: string;
  /** How this context is funded */
  readonly paymentProvider: PaymentProviderType;
  /** Pre-paid wallet balance in cents (IAP users only, 0 for stripe) */
  readonly walletBalanceCents: number;
}

/** A team's sub-allocation within an organization budget */
export interface TeamBudgetAllocation {
  /** Team ID */
  readonly teamId: string;
  /** Team display name */
  readonly teamName: string;
  /** Monthly sub-limit in cents (0 = no sub-limit, draws from org pool) */
  readonly monthlyLimit: number;
  /** Current spend this period in cents */
  readonly currentSpend: number;
  /** Percentage of sub-limit used (0 if no sub-limit) */
  readonly percentUsed: number;
}

/** Default budgets (cents) */
export const DEFAULT_INDIVIDUAL_BUDGET = 2000; // $20
export const DEFAULT_TEAM_BUDGET = 20000; // $200
export const DEFAULT_ORGANIZATION_BUDGET = 50000; // $500

/** A product budget configuration */
export interface UsageBudget {
  /** Unique ID */
  readonly id: string;
  /** Product category */
  readonly category: UsageProductCategory;
  /** Product display name */
  readonly productName: string;
  /** Budget limit in cents (0 = unlimited) */
  readonly budgetLimit: number;
  /** Amount spent in cents */
  readonly spent: number;
  /** Percentage of budget used (0-100+) */
  readonly percentUsed: number;
  /** Whether usage stops when budget is reached */
  readonly stopOnLimit: boolean;
  /** Account name */
  readonly accountName: string;
  /** Account ownership percentage (e.g. 100) */
  readonly ownershipPercent: number;
  /** Team allocations (only present for org-level budgets) */
  readonly teamAllocations?: readonly TeamBudgetAllocation[];
}

// ============================================
// COMPLETE DASHBOARD STATE
// ============================================

/** Complete usage dashboard data payload */
export interface UsageDashboardData {
  /** Overview cards */
  readonly overview: UsageOverview;
  /** Active subscriptions */
  readonly subscriptions: readonly UsageSubscription[];
  /** Usage chart data points */
  readonly chartData: readonly UsageChartDataPoint[];
  /** Product detail tabs */
  readonly productDetails: readonly UsageProductDetail[];
  /** Top items stacked bar */
  readonly topItems: readonly UsageTopItem[];
  /** Usage breakdown table rows */
  readonly breakdownRows: readonly UsageBreakdownRow[];
  /** Payment history records */
  readonly paymentHistory: readonly UsagePaymentHistoryRecord[];
  /** Saved payment methods */
  readonly paymentMethods: readonly UsagePaymentMethod[];
  /** Billing info */
  readonly billingInfo: UsageBillingInfo | null;
  /** Active coupon */
  readonly coupon: UsageCoupon | null;
  /** Budgets */
  readonly budgets: readonly UsageBudget[];
  /** Billing entity type — drives B2C vs B2B UI fork */
  readonly billingEntity: BillingEntity;
  /** How this context is funded */
  readonly paymentProvider: PaymentProviderType;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

/** Request params for usage dashboard */
export interface UsageDashboardRequest {
  /** Timeframe filter */
  readonly timeframe?: UsageTimeframe;
  /** Custom period start (ISO date) */
  readonly periodStart?: string;
  /** Custom period end (ISO date) */
  readonly periodEnd?: string;
  /** Product category filter */
  readonly productFilter?: UsageProductCategory;
  /** Search query for filtering */
  readonly searchQuery?: string;
  /** Group by option */
  readonly groupBy?: 'none' | 'product' | 'category';
}

/** API response wrapper */
export interface UsageDashboardResponse {
  readonly success: boolean;
  readonly data?: UsageDashboardData;
  readonly error?: string;
}

/** API response for payment history pagination */
export interface UsageHistoryResponse {
  readonly success: boolean;
  readonly data?: {
    readonly records: readonly UsagePaymentHistoryRecord[];
    readonly total: number;
    readonly hasMore: boolean;
  };
  readonly error?: string;
}
