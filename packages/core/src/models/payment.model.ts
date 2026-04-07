/**
 * @fileoverview Payment Model
 * @module @nxt1/core/models
 *
 * Professional payment domain models for subscriptions, transactions,
 * one-time purchases, and entitlements.
 * 100% portable - no framework dependencies.
 *
 * Database Collections:
 * - Subscriptions/{userId}         - User subscription state
 * - Transactions/{transactionId}   - Payment history (audit log)
 * - UserEntitlements/{userId}      - Purchased items, credits
 * - Products/{productId}           - Product catalog
 * - Invoices/{invoiceId}           - Invoice records
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import type {
  PaymentProvider,
  PaymentMethodType,
  Currency,
  ProductCategory,
  BillingInterval,
  SubscriptionStatus,
  MediaProductType,
  CreditType,
  TransactionStatus,
  TransactionType,
  RefundReason,
  RefundStatus,
  DiscountType,
  EntitlementStatus,
  InvoiceStatus,
  WebhookStatus,
  DisputeStatus,
} from '../constants/payment.constants';

// ============================================
// SCHEMA VERSION
// ============================================

/** Current schema version for migration tracking */
export const PAYMENT_SCHEMA_VERSION = 1;

// ============================================
// PAYMENT METHOD
// ============================================

/** Stored payment method (PCI compliant - no full card numbers) */
export interface PaymentMethod {
  id: string;
  type: PaymentMethodType;
  provider: PaymentProvider;

  /** Card details (tokenized) */
  card?: {
    brand: string; // 'visa', 'mastercard', 'amex', etc.
    last4: string;
    expiryMonth: number;
    expiryYear: number;
    fingerprint?: string; // For duplicate detection
  };

  /** PayPal details */
  paypal?: {
    email: string;
    payerId: string;
  };

  /** Bank account details */
  bankAccount?: {
    bankName: string;
    last4: string;
    accountType: 'checking' | 'savings';
  };

  /** Billing address */
  billingAddress?: BillingAddress;

  /** Is this the default payment method */
  isDefault: boolean;

  /** Timestamps */
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface BillingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string; // ISO 3166-1 alpha-2
}

// ============================================
// SUBSCRIPTION
// ============================================

/** User subscription state */
export interface Subscription {
  /** User ID (document ID) */
  userId: string;

  /** Current plan */
  plan: string;
  status: SubscriptionStatus;

  /** Billing details */
  billingInterval: BillingInterval;
  currentPeriodStart: Date | string;
  currentPeriodEnd: Date | string;

  /** Cancellation */
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date | string;
  cancelReason?: string;

  /** Trial */
  trialStart?: Date | string;
  trialEnd?: Date | string;

  /** Team code override */
  teamCode?: {
    code: string;
    teamId: string;
    teamName: string;
    providedPlan: string;
    expiresAt?: Date | string;
  };

  /** Payment provider references */
  stripe?: {
    customerId: string;
    subscriptionId: string;
    priceId: string;
    latestInvoiceId?: string;
  };

  paypal?: {
    subscriptionId: string;
    planId: string;
  };

  apple?: {
    originalTransactionId: string;
    productId: string;
  };

  google?: {
    purchaseToken: string;
    productId: string;
  };

  /** Default payment method ID */
  defaultPaymentMethodId?: string;

  /** Monthly credit allocations (reset each period) */
  credits: CreditAllocation;

  /** Timestamps */
  createdAt: Date | string;
  updatedAt: Date | string;

  /** Schema version */
  _schemaVersion: number;
}

export interface CreditAllocation {
  /** AI credits */
  ai: {
    allocated: number; // Credits given this period
    used: number;
    bonus: number; // Purchased credits that carry over
  };

  /** College credits */
  college: {
    allocated: number;
    used: number;
    bonus: number;
  };

  /** Email campaign credits */
  email: {
    allocated: number;
    used: number;
    bonus: number;
  };

  /** When credits reset */
  periodStart: Date | string;
  periodEnd: Date | string;
}

// ============================================
// TRANSACTION
// ============================================

/** Payment transaction record (immutable audit log) */
export interface Transaction {
  /** Unique transaction ID */
  id: string;

  /** User who made the purchase */
  userId: string;

  /** Transaction type */
  type: TransactionType;
  status: TransactionStatus;

  /** What was purchased */
  items: TransactionItem[];

  /** Pricing breakdown (all in cents) */
  pricing: {
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    currency: Currency;
  };

  /** Applied discount */
  discount?: {
    code: string;
    type: DiscountType;
    value: number; // Percentage or cents
    amountOff: number; // Actual amount deducted in cents
  };

  /** Payment provider details */
  provider: PaymentProvider;
  providerTransactionId: string;
  providerCustomerId?: string;
  paymentMethodId?: string;

  /** For subscriptions */
  subscriptionId?: string;
  invoiceId?: string;

  /** Refund details (if applicable) */
  refund?: {
    status: RefundStatus;
    amount: number; // In cents
    reason: RefundReason;
    reasonDetails?: string;
    refundedAt: Date | string;
    providerRefundId: string;
  };

  /** Dispute details (if applicable) */
  dispute?: {
    status: DisputeStatus;
    reason: string;
    amount: number;
    createdAt: Date | string;
    dueBy?: Date | string;
    providerDisputeId: string;
  };

  /** Metadata */
  metadata?: Record<string, unknown>;

  /** Idempotency key for duplicate prevention */
  idempotencyKey?: string;

  /** IP address for fraud detection */
  ipAddress?: string;

  /** Timestamps */
  createdAt: Date | string;
  completedAt?: Date | string;

  /** Schema version */
  _schemaVersion: number;
}

export interface TransactionItem {
  /** Product reference */
  productId: string;
  productCategory: ProductCategory;
  productType: string; // MediaProductType | RecruitingProductType | 'subscription'
  productName: string;

  /** Quantity and pricing */
  quantity: number;
  unitPrice: number; // In cents
  total: number; // In cents

  /** For media purchases - generated asset reference */
  assetId?: string;
  assetUrl?: string;

  /** For recruiting purchases - college IDs */
  collegeIds?: string[];

  /** For credit purchases */
  creditType?: CreditType;
  creditsGranted?: number;
}

// ============================================
// USER ENTITLEMENTS
// ============================================

/** User's purchased entitlements and credit balances */
export interface UserEntitlements {
  /** User ID (document ID) */
  userId: string;

  /** Credit balances (purchased credits, not subscription) */
  credits: {
    ai: number;
    college: number;
    email: number;
  };

  /** Purchased media assets */
  media: MediaEntitlement[];

  /** Opened college connections */
  colleges: CollegeEntitlement[];

  /** Active feature entitlements */
  features: FeatureEntitlement[];

  /** Timestamps */
  createdAt: Date | string;
  updatedAt: Date | string;

  /** Schema version */
  _schemaVersion: number;
}

export interface MediaEntitlement {
  id: string;
  type: MediaProductType;
  transactionId: string;
  status: EntitlementStatus;

  /** Generated asset */
  assetUrl: string;
  thumbnailUrl?: string;
  downloadUrl?: string;

  /** Metadata */
  title?: string;
  sportId?: string;

  /** Timestamps */
  purchasedAt: Date | string;
  expiresAt?: Date | string; // null = never expires
  downloadedAt?: Date | string;
}

export interface CollegeEntitlement {
  collegeId: string;
  collegeName: string;
  collegeLogoUrl?: string;
  transactionId: string;
  status: EntitlementStatus;

  /** Access level */
  accessLevel: 'basic' | 'full' | 'premium';

  /** What the user can do */
  permissions: {
    viewContact: boolean;
    sendEmail: boolean;
    viewAnalytics: boolean;
  };

  /** Usage tracking */
  emailsSent: number;
  lastContactedAt?: Date | string;

  /** Timestamps */
  openedAt: Date | string;
  expiresAt?: Date | string; // null = never expires
}

export interface FeatureEntitlement {
  featureId: string;
  featureName: string;
  transactionId: string;
  status: EntitlementStatus;

  /** Usage limits */
  usageLimit?: number; // null = unlimited
  usageCount: number;

  /** Timestamps */
  grantedAt: Date | string;
  expiresAt?: Date | string;
}

// ============================================
// INVOICE
// ============================================

/** Invoice record */
export interface Invoice {
  id: string;
  userId: string;
  subscriptionId?: string;
  transactionId?: string;

  status: InvoiceStatus;

  /** Invoice number for display */
  invoiceNumber: string;

  /** Line items */
  lineItems: InvoiceLineItem[];

  /** Pricing */
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountDue: number;
  amountPaid: number;
  currency: Currency;

  /** Billing details */
  billingAddress?: BillingAddress;

  /** Provider reference */
  provider: PaymentProvider;
  providerInvoiceId: string;
  providerInvoiceUrl?: string; // Hosted invoice page
  providerPdfUrl?: string; // PDF download

  /** Timestamps */
  createdAt: Date | string;
  dueDate?: Date | string;
  paidAt?: Date | string;
  voidedAt?: Date | string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  periodStart?: Date | string;
  periodEnd?: Date | string;
}

// ============================================
// PRODUCT CATALOG
// ============================================

/** Product definition (admin-managed) */
export interface Product {
  id: string;
  category: ProductCategory;
  type: string;

  /** Display info */
  name: string;
  description: string;

  /** Pricing */
  price: number; // In cents
  currency: Currency;

  /** For tiered pricing */
  tiers?: PriceTier[];

  /** Stripe product/price IDs */
  stripe?: {
    productId: string;
    priceId: string;
  };

  /** Status */
  active: boolean;

  /** Metadata */
  metadata?: Record<string, unknown>;

  /** Timestamps */
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PriceTier {
  minQuantity: number;
  maxQuantity: number; // -1 for unlimited
  pricePerUnit: number; // In cents
  flatFee?: number; // Optional flat fee for this tier
}

// ============================================
// DISCOUNT / COUPON
// ============================================

export interface Coupon {
  id: string;
  code: string;

  /** Discount details */
  type: DiscountType;
  value: number; // Percentage (0-100) or cents

  /** Restrictions */
  appliesTo: {
    categories?: ProductCategory[];
    productIds?: string[];
  };

  /** Limits */
  maxRedemptions?: number;
  timesRedeemed: number;
  maxRedemptionsPerUser?: number;
  minimumPurchase?: number; // In cents

  /** Validity */
  validFrom: Date | string;
  validUntil?: Date | string;
  active: boolean;

  /** First-time purchase only */
  firstPurchaseOnly: boolean;

  /** Timestamps */
  createdAt: Date | string;
  updatedAt: Date | string;
}

// ============================================
// WEBHOOK EVENT
// ============================================

/** Processed webhook event (for idempotency) */
export interface WebhookEvent {
  id: string;
  provider: PaymentProvider;
  eventType: string;
  providerEventId: string;

  /** Processing status */
  status: WebhookStatus;
  processedAt?: Date | string;
  error?: string;
  retryCount: number;

  /** Raw payload (encrypted) */
  payload: string;

  /** Timestamps */
  receivedAt: Date | string;
}

// ============================================
// TYPE GUARDS
// ============================================

export function isSubscriptionActive(subscription: Subscription): boolean {
  return subscription.status === 'active' || subscription.status === 'trialing';
}

export function hasValidTeamCode(subscription: Subscription): boolean {
  if (!subscription.teamCode) return false;
  if (!subscription.teamCode.expiresAt) return true;
  return new Date(subscription.teamCode.expiresAt) > new Date();
}

export function getEffectivePlan(subscription: Subscription): string {
  // Team code can override the plan
  if (hasValidTeamCode(subscription)) {
    return subscription.teamCode!.providedPlan;
  }
  return subscription.plan;
}

export function hasAvailableCredits(
  subscription: Subscription,
  entitlements: UserEntitlements,
  type: CreditType,
  amount: number = 1
): boolean {
  const subCredits = subscription.credits[type];
  const available = subCredits.allocated - subCredits.used + subCredits.bonus;
  const purchased = entitlements.credits[type];
  return available + purchased >= amount;
}

export function isEntitlementValid(
  entitlement: MediaEntitlement | CollegeEntitlement | FeatureEntitlement
): boolean {
  if (entitlement.status !== 'active') return false;
  if (!entitlement.expiresAt) return true;
  return new Date(entitlement.expiresAt) > new Date();
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

export function createDefaultSubscription(userId: string): Subscription {
  const now = new Date().toISOString();
  return {
    userId,
    plan: 'free',
    status: 'active',
    billingInterval: 'month',
    currentPeriodStart: now,
    currentPeriodEnd: now,
    cancelAtPeriodEnd: false,
    credits: createDefaultCreditAllocation(),
    createdAt: now,
    updatedAt: now,
    _schemaVersion: PAYMENT_SCHEMA_VERSION,
  };
}

export function createDefaultCreditAllocation(): CreditAllocation {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  return {
    ai: { allocated: 0, used: 0, bonus: 0 },
    college: { allocated: 0, used: 0, bonus: 0 },
    email: { allocated: 0, used: 0, bonus: 0 },
    periodStart: now.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

export function createDefaultEntitlements(userId: string): UserEntitlements {
  const now = new Date().toISOString();
  return {
    userId,
    credits: { ai: 0, college: 0, email: 0 },
    media: [],
    colleges: [],
    features: [],
    createdAt: now,
    updatedAt: now,
    _schemaVersion: PAYMENT_SCHEMA_VERSION,
  };
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface CreateCheckoutSessionRequest {
  userId: string;
  items: {
    productId: string;
    quantity: number;
  }[];
  successUrl: string;
  cancelUrl: string;
  couponCode?: string;
  metadata?: Record<string, string>;
}

export interface CreateCheckoutSessionResponse {
  sessionId: string;
  sessionUrl: string;
}

export interface CreateSubscriptionRequest {
  userId: string;
  planId: string;
  billingInterval: BillingInterval;
  paymentMethodId: string;
  couponCode?: string;
}

export interface UpdateSubscriptionRequest {
  userId: string;
  planId?: string;
  billingInterval?: BillingInterval;
  cancelAtPeriodEnd?: boolean;
}

export interface PurchaseCreditsRequest {
  userId: string;
  creditType: CreditType;
  quantity: number;
  paymentMethodId: string;
}

export interface PurchaseMediaRequest {
  userId: string;
  productType: MediaProductType;
  paymentMethodId: string;
  metadata?: {
    sportId?: string;
    videoIds?: string[];
  };
}

export interface OpenCollegesRequest {
  userId: string;
  collegeIds: string[];
  paymentMethodId?: string; // Optional if using credits
  useCredits: boolean;
}

export interface RefundRequest {
  transactionId: string;
  amount?: number; // Partial refund amount in cents
  reason: RefundReason;
  reasonDetails?: string;
}

export interface PaymentMethodRequest {
  userId: string;
  provider: PaymentProvider;
  token: string; // Payment method token from client SDK
  setAsDefault?: boolean;
}
