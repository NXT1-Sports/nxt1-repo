/**
 * @fileoverview Usage Event Types
 * @module @nxt1/backend/modules/billing
 *
 * Types for usage-based billing events
 */

import type { Timestamp } from 'firebase-admin/firestore';

/**
 * Billable features — aligned with USAGE_PRODUCT_CONFIGS in @nxt1/core/usage
 * Each enum value maps to a product ID in the frontend pricing table.
 */
export enum UsageFeature {
  // ── Media ───────────────────────────
  HIGHLIGHTS = 'highlights',
  MOTION_GRAPHICS = 'motion-graphics',
  GRAPHICS = 'graphics',
  WRITE_UP_GRAPHIC = 'write-up-graphic',
  MEDIA_BUNDLES = 'media-bundles',

  // ── Recruiting ──────────────────────
  SCOUT_REPORT_BUNDLE = 'scout-report-bundle',
  MATCH_COLLEGES = 'match-colleges',
  RECRUIT_STRATEGY = 'recruit-strategy',
  COLLEGE_VIEWS = 'college-views',

  // ── AI & Agent X ────────────────────
  ACTIVITY_USAGE = 'activity-usage',

  // ── Communication ───────────────────
  EMAIL_CAMPAIGN = 'email-campaign',
  FOLLOW_UPS = 'follow-ups',

  // ── Profile ─────────────────────────
  PROFILE_BANNERS = 'profile-banners',

  // ── Teams ───────────────────────────
  TEAM_PAGE_URL = 'team-page-url',
}

/**
 * Status of usage event processing
 */
export enum UsageEventStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

/**
 * Usage event stored in Firestore (SOURCE OF TRUTH)
 */
export interface UsageEvent {
  /** Unique event ID */
  id: string;

  /** User who triggered the usage */
  userId: string;

  /** Team context for the usage */
  teamId: string;

  /** Feature that was used */
  feature: UsageFeature;

  /** Quantity of usage (e.g., 1 graphic, 5 minutes of video) */
  quantity: number;

  /** Unit cost snapshot at time of usage (for audit trail) */
  unitCostSnapshot: number;

  /** Currency code (e.g., 'usd') */
  currency: string;

  /** Stripe Price ID for this feature */
  stripePriceId: string;

  /** Idempotency key to prevent duplicate billing */
  idempotencyKey: string;

  /** Processing status */
  status: UsageEventStatus;

  /** Stripe usage record ID (once sent) */
  stripeUsageId?: string;

  /** Stripe invoice item ID (once sent) */
  stripeInvoiceItemId?: string;

  /** Error message if failed */
  errorMessage?: string;

  /** Retry count */
  retryCount?: number;

  /** Last retry timestamp */
  lastRetryAt?: Timestamp;

  /** Metadata for debugging */
  metadata?: Record<string, unknown>;

  /** Created timestamp */
  createdAt: Timestamp;

  /** Updated timestamp */
  updatedAt: Timestamp;
}

/**
 * Input for creating a new usage event
 */
export interface CreateUsageEventInput {
  userId: string;
  teamId: string;
  feature: UsageFeature;
  quantity: number;
  unitCostSnapshot: number;
  currency: string;
  stripePriceId: string;
  /** Optional unique job ID for idempotency */
  jobId?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Stripe customer mapping in Firestore
 */
export interface StripeCustomer {
  /** User ID (primary key) */
  userId: string;

  /** Stripe customer ID */
  stripeCustomerId: string;

  /** Team ID */
  teamId?: string;

  /** Default payment method ID */
  defaultPaymentMethod?: string;

  /** Email */
  email: string;

  /** Environment */
  environment: 'staging' | 'production';

  /** Created timestamp */
  createdAt: Timestamp;

  /** Updated timestamp */
  updatedAt: Timestamp;
}

/**
 * Payment log entry
 */
export interface PaymentLog {
  /** Stripe invoice ID */
  invoiceId: string;

  /** Stripe customer ID */
  customerId: string;

  /** User ID */
  userId: string;

  /** Team ID */
  teamId?: string;

  /** Amount due */
  amountDue: number;

  /** Amount paid */
  amountPaid: number;

  /** Currency */
  currency: string;

  /** Payment status */
  status: 'PAID' | 'FAILED' | 'PENDING' | 'VOID';

  /** Invoice URL */
  invoiceUrl?: string;

  /** Raw Stripe event data */
  rawEvent: Record<string, unknown>;

  /** Created timestamp */
  createdAt: Timestamp;
}

/**
 * Pub/Sub message for usage processing
 */
export interface UsageEventMessage {
  usageEventId: string;
  environment: 'staging' | 'production';
}

// ============================================
// BILLING CONTEXT (Org vs Individual)
// ============================================

/** Who pays: the individual user, a team sub-allocation, or the parent organization */
export type BillingEntity = 'individual' | 'team' | 'organization';

/** How this billing context is funded */
export type PaymentProvider = 'stripe' | 'iap';

/**
 * Billing context stored per user in Firestore (`billingContexts` collection).
 * Determines whether a user's usage is billed to them or to their organization.
 */
export interface BillingContext {
  /** Firebase Auth UID */
  userId: string;

  /** The team this user belongs to (if any) */
  teamId?: string;

  /** The organization that pays (if billingEntity is 'organization') */
  organizationId?: string;

  /** Who is billed for this user's usage */
  billingEntity: BillingEntity;

  /** Monthly spending budget in cents */
  monthlyBudget: number;

  /** Accumulated spend in the current billing period (cents) */
  currentPeriodSpend: number;

  /** ISO date — start of current billing period */
  periodStart: string;

  /** ISO date — end of current billing period */
  periodEnd: string;

  /** Whether the user has been notified at 50% */
  notified50: boolean;

  /** Whether the user has been notified at 80% */
  notified80: boolean;

  /** Whether the user has been notified at 100% (budget reached) */
  notified100: boolean;

  /** Whether the IAP wallet user has been notified of a low balance */
  iapLowBalanceNotified: boolean;

  /** Whether the budget hard-stop is enabled (stops tasks at 100%) */
  hardStop: boolean;

  /** How this context is funded ('stripe' = post-paid, 'iap' = pre-paid wallet) */
  paymentProvider: PaymentProvider;

  /**
   * Pre-paid wallet balance in cents (IAP users only).
   * Decremented on each usage event. Rolls over indefinitely (no monthly reset).
   * Ignored for stripe-billed entities.
   */
  walletBalanceCents: number;

  /** Stripe subscription ID for Pro plan ($50/m) — null if free tier */
  proSubscriptionId?: string;

  /** Created timestamp */
  createdAt: Timestamp;

  /** Updated timestamp */
  updatedAt: Timestamp;
}

/**
 * Team-level budget allocation within an organization.
 * Stored in `teamBudgetAllocations` collection.
 */
export interface TeamBudgetAllocation {
  /** Team ID */
  teamId: string;

  /** Parent organization ID */
  organizationId: string;

  /** Monthly sub-limit in cents (0 = no sub-limit, draws from org pool) */
  monthlyLimit: number;

  /** Accumulated spend this period in cents */
  currentPeriodSpend: number;

  /** ISO date — start of current billing period */
  periodStart: string;

  /** ISO date — end of current billing period */
  periodEnd: string;

  /** Whether this team has been notified at 50% of its sub-limit */
  notified50: boolean;

  /** Whether this team has been notified at 80% of its sub-limit */
  notified80: boolean;

  /** Whether this team has been notified at 100% of its sub-limit */
  notified100: boolean;

  /** Created timestamp */
  createdAt: Timestamp;

  /** Updated timestamp */
  updatedAt: Timestamp;
}

// ============================================
// BUDGET DEFAULTS
// ============================================

/** Default monthly budget for individual accounts (in cents) */
export const DEFAULT_INDIVIDUAL_BUDGET = 2000; // $20

/** Default monthly budget for team/organization accounts (in cents) */
export const DEFAULT_TEAM_BUDGET = 20000; // $200

/** Default monthly budget for organization accounts (in cents) */
export const DEFAULT_ORGANIZATION_BUDGET = 50000; // $500

/** Budget alert thresholds as percentages */
export const BUDGET_ALERT_THRESHOLDS = [50, 80, 100] as const;
