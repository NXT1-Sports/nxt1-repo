/**
 * @fileoverview Stripe-specific types
 * @module @nxt1/backend/modules/billing
 */

import type Stripe from 'stripe';

/**
 * Stripe configuration for environment
 */
export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  enabled: boolean;
  prices: {
    [key: string]: string;
  };
}

/**
 * Result of creating an invoice item
 */
export interface CreateInvoiceItemResult {
  success: boolean;
  invoiceItemId?: string;
  error?: string;
}

/**
 * Result of customer creation/retrieval
 */
export interface GetOrCreateCustomerResult {
  customerId: string;
  isNew: boolean;
}

/**
 * Invoice generation result
 */
export interface GenerateInvoiceResult {
  success: boolean;
  invoiceId?: string;
  invoiceUrl?: string;
  error?: string;
}

/**
 * Result of an off-session Stripe charge (auto top-up)
 */
export interface ChargeOffSessionResult {
  success: boolean;
  paymentIntentId?: string;
  /** Stripe-hosted receipt URL (available after a successful charge) */
  receiptUrl?: string | null;
  /** Stripe error code (e.g. 'card_declined', 'authentication_required') */
  errorCode?: string;
  error?: string;
}

/**
 * Webhook event data
 */
export interface WebhookEventData {
  event: Stripe.Event;
  environment: 'staging' | 'production';
}
