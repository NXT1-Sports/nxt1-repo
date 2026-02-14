/**
 * @fileoverview Usage Event Types
 * @module @nxt1/backend/modules/billing
 *
 * Types for usage-based billing events
 */

import type { Timestamp } from 'firebase-admin/firestore';

/**
 * AI Features that generate billable usage
 */
export enum UsageFeature {
  AI_CONTENT = 'ai-content-generation',
  AI_IMAGE = 'ai-image-generation',
  AI_VIDEO = 'ai-video-generation',
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
