/**
 * @fileoverview Usage Event Types
 * @module @nxt1/backend/modules/billing
 *
 * Types for usage-based billing events
 */

import type { Timestamp } from 'firebase-admin/firestore';
import type { BillingMode, BudgetInterval } from '@nxt1/core/usage';

// NOTE: UsageEvent and PaymentLog use plain Date (MongoDB). All other interfaces
// (BillingState, StripeCustomer, WalletHold, etc.) keep Firestore Timestamp.

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
  CHAT_CONVERSATION = 'chat-conversation',
  PLAYBOOK_GENERATION = 'playbook-generation',
  BRIEFING_GENERATION = 'briefing-generation',
  SCOUT_REPORT = 'scout-report',
  ATHLETE_INTEL = 'athlete-intel',
  TEAM_INTEL = 'team-intel',

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
 * How the cost for this event was determined.
 * - `static`  — Looked up from USAGE_PRODUCT_CONFIGS (hardcoded per-feature price).
 * - `dynamic` — Calculated at runtime from actual AI provider token usage + margin.
 */
export type UsageCostType = 'static' | 'dynamic';

/**
 * Usage event stored in MongoDB via Mongoose (SOURCE OF TRUTH)
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

  /** How cost was determined: 'static' (hardcoded) or 'dynamic' (AI token-based) */
  costType: UsageCostType;

  /** Raw provider cost in USD before margin (only present for dynamic pricing) */
  rawProviderCostUsd?: number;

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
  lastRetryAt?: Date;

  /** Metadata for debugging */
  metadata?: Record<string, unknown>;

  /** Created timestamp (plain Date — stored in MongoDB) */
  createdAt: Date;

  /** Updated timestamp (plain Date — stored in MongoDB) */
  updatedAt: Date;
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

  // ── Dynamic pricing fields (Phase 1 — AI token-based costs) ──

  /**
   * When provided, this is the dynamically calculated cost in cents
   * (from `resolveAICost()`). Takes precedence over static `unitCostSnapshot`.
   */
  dynamicCostCents?: number;

  /**
   * Raw provider cost in USD (e.g. OpenRouter `costUsd`).
   * Stored on the event for audit trail / margin analysis.
   */
  rawProviderCostUsd?: number;
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

  /** Created timestamp (plain Date — stored in MongoDB) */
  createdAt: Date;
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

/** Who pays: the individual user or the parent organization */
export type BillingEntity = 'individual' | 'organization';

/** How this billing state is funded */
export type PaymentProvider = 'stripe' | 'iap';

/**
 * Resolved billing state projected from normalized wallet, preference, and ledger documents.
 * Determines whether a user's usage is billed to them or to their organization.
 */
export interface BillingState {
  /** Firebase Auth UID for individual-user billing contexts */
  userId?: string;

  /** Organization admin UID that owns billing setup for organization aggregate docs */
  billingOwnerUid?: string;

  /** The team this user belongs to (if any) */
  teamId?: string;

  /** The organization that pays (if billingEntity is 'organization') */
  organizationId?: string;

  /** Current wallet-routing mode for new charges */
  billingMode?: BillingMode;

  /** Who is billed for this user's usage */
  billingEntity: BillingEntity;

  /** Budget cadence for the current spending window */
  budgetInterval?: BudgetInterval;

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

  /** Whether budget-threshold notifications are enabled for this billing context */
  budgetAlertsEnabled?: boolean;

  /** Wallet balance captured after the latest top-up, used for credits-low thresholds */
  creditsAlertBaselineCents?: number;

  /** Total rewarded individual referrals credited to this billing context */
  totalReferralRewards?: number;

  /** Whether the 80% remaining credits alert has fired for the current baseline */
  creditsNotified80?: boolean;

  /** Whether the 50% remaining credits alert has fired for the current baseline */
  creditsNotified50?: boolean;

  /** Whether the 25% remaining credits alert has fired for the current baseline */
  creditsNotified25?: boolean;

  /** Whether the budget hard-stop is enabled (stops tasks at 100%) */
  hardStop: boolean;

  /** How this context is funded ('stripe' = post-paid/org wallet, 'iap' = personal prepaid wallet) */
  paymentProvider: PaymentProvider;

  /**
   * Pre-paid wallet balance in cents.
   * For 'iap' individual users: decremented on each usage event.
   * For 'organization' / 'team' entities: decremented via deductOrgWallet.
   * Rolls over indefinitely (no monthly reset).
   */
  walletBalanceCents: number;

  /**
   * Pending hold amount in cents.
   * Represents funds reserved by in-flight AI operations but not yet captured.
   * Prevents race conditions where parallel requests all pass the balance check simultaneously.
   */
  pendingHoldsCents: number;

  /**
   * Optional custom name for the primary budget.
   * If omitted, falls back to "Overall Budget" in the UI.
   * For example, default orgs can be named "Starter budget".
   */
  budgetName?: string;

  /** Whether auto top-up is enabled for this billing context */
  autoTopUpEnabled?: boolean;

  /** Wallet balance threshold in cents that triggers an auto top-up */
  autoTopUpThresholdCents?: number;

  /** Amount in cents to reload when auto top-up fires */
  autoTopUpAmountCents?: number;

  /**
   * True while an auto top-up Stripe charge is in-flight.
   * Prevents duplicate charges when multiple deductions fire in quick succession.
   */
  autoTopUpInProgress?: boolean;

  /**
   * Server timestamp set when autoTopUpInProgress is locked.
   * Used to detect and recover from stale locks caused by process crashes.
   * Any lock held for more than 5 minutes is treated as expired.
   */
  autoTopUpLockedAt?: Timestamp;

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

  /** Budget cadence for this team allocation */
  budgetInterval?: BudgetInterval;

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

/**
 * Organization-owned budget document.
 * Each document represents exactly one target + cadence pair.
 */
export interface OrganizationBudgetDocument {
  /** Document ID */
  id: string;

  /** Parent organization ID */
  organizationId: string;

  /** Budget target type */
  targetType: 'organization' | 'team';

  /** Target identifier — orgId for org budgets, teamId for team budgets */
  targetId: string;

  /** Budget cadence */
  budgetInterval: BudgetInterval;

  /** Limit in cents */
  budgetLimit: number;

  /** Whether this budget blocks usage when the limit is exceeded */
  hardStop: boolean;

  /** Accumulated spend this period */
  currentPeriodSpend: number;

  /** Current billing window start */
  periodStart: string;

  /** Current billing window end */
  periodEnd: string;

  /** Alert flags */
  notified50: boolean;
  notified80: boolean;
  notified100: boolean;

  /** Created timestamp */
  createdAt: Timestamp;

  /** Updated timestamp */
  updatedAt: Timestamp;
}

// ============================================
// BUDGET DEFAULTS
// ============================================

/**
 * Wallet hold — a temporary reservation of funds for an in-flight AI operation.
 * Stored in Firestore `WalletHolds` collection.
 */
export interface WalletHold {
  /** Hold document ID */
  id: string;
  /** User who owns this hold */
  userId: string;
  /** Billing owner ID for the reserved wallet */
  ownerId?: string;
  /** Billing owner type for the reserved wallet */
  ownerType?: 'individual' | 'organization';
  /** Organization ID — set for org-entity users so hold ops update org master budget */
  organizationId?: string;
  /** Team ID — set for org-entity users with team sub-allocations */
  teamId?: string;
  /** Amount reserved in cents */
  amountCents: number;
  /** Whether the hold has been captured or released */
  status: 'active' | 'captured' | 'released' | 'expired';
  /** Job ID that triggered this hold (for correlation with usage events) */
  jobId: string;
  /** Feature being used */
  feature: string;
  /** Created timestamp */
  createdAt: Timestamp;
  /** When captured/released */
  resolvedAt?: Timestamp;
  /** Actual cost captured (if captured) */
  capturedAmountCents?: number;
}

/** Result of creating a wallet hold */
export interface WalletHoldResult {
  /** Whether the hold was successfully created */
  success: boolean;
  /** Hold document ID (if successful) */
  holdId?: string;
  /** Reason for failure (if not successful) */
  reason?: string;
  /** Available balance after hold */
  availableBalance?: number;
}

/** Default monthly budget for individual accounts (in cents) */
export const DEFAULT_INDIVIDUAL_BUDGET = 0;

/** Fallback starter wallet balance for individual accounts (in cents) when AppConfig is unset */
export const DEFAULT_INDIVIDUAL_STARTER_BALANCE = 500; // $5

/** Default monthly budget for team/organization accounts (in cents) */
export const DEFAULT_TEAM_BUDGET = 20000; // $200

/** Default monthly budget for organization accounts (in cents) */
export const DEFAULT_ORGANIZATION_BUDGET = 0;

/** Fallback starter wallet balance for organization accounts (in cents) when AppConfig is unset */
export const DEFAULT_ORGANIZATION_STARTER_BALANCE = 2000; // $20

/** Budget alert thresholds as percentages */
export const BUDGET_ALERT_THRESHOLDS = [50, 80, 100] as const;
