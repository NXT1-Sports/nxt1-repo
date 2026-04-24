/**
 * @fileoverview Stripe Service
 * @module @nxt1/backend/modules/billing
 *
 * Service for interacting with Stripe API
 * Handles customer management, invoice items, and payment processing
 */

import Stripe from 'stripe';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from '../../utils/logger.js';
import { getStripeConfig, COLLECTIONS, RETRY_CONFIG } from './config.js';
import type {
  StripeCustomer,
  CreateInvoiceItemResult,
  GetOrCreateCustomerResult,
  GenerateInvoiceResult,
  ChargeOffSessionResult,
} from './types/index.js';

// Stripe client instances (cached)
const stripeClients: Map<string, Stripe> = new Map();

/** Clear the cached Stripe clients — only for use in tests. */
export function _clearStripeClientCacheForTesting(): void {
  stripeClients.clear();
}

/**
 * Get Stripe client for environment
 */
export function getStripeClient(environment: 'staging' | 'production'): Stripe {
  const cacheKey = environment;

  if (stripeClients.has(cacheKey)) {
    return stripeClients.get(cacheKey)!;
  }

  const config = getStripeConfig(environment);

  if (!config.enabled || !config.secretKey) {
    throw new Error(`Stripe not configured for environment: ${environment}`);
  }

  const stripe = new Stripe(config.secretKey, {
    apiVersion: '2026-02-25.clover',
    typescript: true,
  });

  stripeClients.set(cacheKey, stripe);
  return stripe;
}

/**
 * Get or create Stripe customer
 * Checks Firestore cache first, then creates in Stripe if needed
 */
export async function getOrCreateCustomer(
  db: Firestore,
  userId: string,
  email: string,
  teamId: string | undefined,
  environment: 'staging' | 'production'
): Promise<GetOrCreateCustomerResult> {
  try {
    // Check Firestore cache
    const customerQuery = await db
      .collection(COLLECTIONS.STRIPE_CUSTOMERS)
      .where('userId', '==', userId)
      .where('environment', '==', environment)
      .limit(1)
      .get();

    if (!customerQuery.empty) {
      const cachedDoc = customerQuery.docs[0]!;
      const customer = cachedDoc.data() as StripeCustomer;

      // Verify the cached customer still exists in Stripe.
      // Stale entries can occur after switching Stripe accounts or environments.
      const stripe = getStripeClient(environment);
      try {
        await stripe.customers.retrieve(customer.stripeCustomerId);
      } catch (verifyErr: unknown) {
        const stripeErr = verifyErr as { code?: string };
        if (stripeErr.code === 'resource_missing') {
          logger.warn(
            '[getOrCreateCustomer] Cached customer missing from Stripe — purging stale entry',
            {
              userId,
              staleCustomerId: customer.stripeCustomerId,
            }
          );
          await cachedDoc.ref.delete();
          // Fall through to create a new customer below
          return createAndCacheCustomer(db, stripe, userId, email, teamId, environment);
        }
        throw verifyErr;
      }

      logger.info('[getOrCreateCustomer] Customer found in cache', {
        userId,
        customerId: customer.stripeCustomerId,
      });

      return {
        customerId: customer.stripeCustomerId,
        isNew: false,
      };
    }

    // Create in Stripe
    const stripe = getStripeClient(environment);
    return createAndCacheCustomer(db, stripe, userId, email, teamId, environment);
  } catch (error) {
    logger.error('[getOrCreateCustomer] Failed to get or create customer', {
      error,
      userId,
      environment,
    });
    throw error;
  }
}

/** Create a Stripe customer and cache the mapping in Firestore. */
async function createAndCacheCustomer(
  db: Firestore,
  stripe: Stripe,
  userId: string,
  email: string,
  teamId: string | undefined,
  environment: string
): Promise<GetOrCreateCustomerResult> {
  const customer = await stripe.customers.create(
    {
      email,
      metadata: {
        userId,
        teamId: teamId || '',
        environment,
      },
    },
    {
      idempotencyKey: `customer-${userId}-${environment}-${Date.now()}`,
    }
  );

  logger.info('[getOrCreateCustomer] Customer created in Stripe', {
    userId,
    customerId: customer.id,
  });

  // Cache in Firestore
  const now = FieldValue.serverTimestamp();
  await db.collection(COLLECTIONS.STRIPE_CUSTOMERS).add({
    userId,
    stripeCustomerId: customer.id,
    teamId,
    email,
    environment,
    createdAt: now,
    updatedAt: now,
  });

  return {
    customerId: customer.id,
    isNew: true,
  };
}

/**
 * Attach payment method to customer
 */
export async function attachPaymentMethod(
  customerId: string,
  paymentMethodId: string,
  environment: 'staging' | 'production'
): Promise<void> {
  try {
    const stripe = getStripeClient(environment);

    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Set as default
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    logger.info('[attachPaymentMethod] Payment method attached', {
      customerId,
      paymentMethodId,
    });
  } catch (error) {
    logger.error('[attachPaymentMethod] Failed to attach payment method', {
      error,
      customerId,
      paymentMethodId,
    });
    throw error;
  }
}

/**
 * Create invoice item for usage
 * This adds a line item to the customer's next invoice
 */
export async function createInvoiceItem(
  customerId: string,
  stripePriceId: string,
  quantity: number,
  idempotencyKey: string,
  environment: 'staging' | 'production',
  description?: string
): Promise<CreateInvoiceItemResult> {
  try {
    const stripe = getStripeClient(environment);

    const invoiceItem = await stripe.invoiceItems.create(
      stripePriceId
        ? {
            customer: customerId,
            pricing: { price: stripePriceId },
            quantity,
            description: description || `Usage: ${stripePriceId}`,
          }
        : {
            customer: customerId,
            amount: quantity, // quantity is total cost in cents when no price ID
            currency: 'usd',
            description: description || 'Usage charge',
          },
      {
        idempotencyKey,
      }
    );

    logger.info('[createInvoiceItem] Invoice item created', {
      customerId,
      invoiceItemId: invoiceItem.id,
      quantity,
    });

    return {
      success: true,
      invoiceItemId: invoiceItem.id,
    };
  } catch (error) {
    logger.error('[createInvoiceItem] Failed to create invoice item', {
      error,
      customerId,
      stripePriceId,
      quantity,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate invoice for customer
 * For team customers, uses 'send_invoice' (Net 30) collection method.
 * For individual customers, uses 'charge_automatically'.
 */
export async function generateInvoice(
  customerId: string,
  environment: 'staging' | 'production',
  options?: { collectionMethod?: 'charge_automatically' | 'send_invoice'; daysUntilDue?: number }
): Promise<GenerateInvoiceResult> {
  try {
    const stripe = getStripeClient(environment);

    const collectionMethod = options?.collectionMethod ?? 'charge_automatically';
    const invoiceParams: Record<string, unknown> = {
      customer: customerId,
      auto_advance: collectionMethod === 'charge_automatically',
      collection_method: collectionMethod,
    };

    if (collectionMethod === 'send_invoice') {
      invoiceParams['days_until_due'] = options?.daysUntilDue ?? 30;
      // Stripe defaults pending_invoice_items_behavior to 'exclude' for send_invoice.
      // Must override to 'include' so invoice items added before this call are picked up.
      invoiceParams['pending_invoice_items_behavior'] = 'include';
    }

    const invoice = await stripe.invoices.create(
      invoiceParams as Parameters<typeof stripe.invoices.create>[0]
    );

    // Finalize the invoice
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

    logger.info('[generateInvoice] Invoice generated', {
      customerId,
      invoiceId: finalizedInvoice.id,
      collectionMethod,
    });

    return {
      success: true,
      invoiceId: finalizedInvoice.id,
      invoiceUrl: finalizedInvoice.hosted_invoice_url ?? undefined,
    };
  } catch (error) {
    logger.error('[generateInvoice] Failed to generate invoice', {
      error,
      customerId,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get customer invoices
 */
export async function getCustomerInvoices(
  customerId: string,
  environment: 'staging' | 'production',
  limit: number = 10
): Promise<Stripe.Invoice[]> {
  try {
    const stripe = getStripeClient(environment);

    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit,
    });

    return invoices.data;
  } catch (error) {
    logger.error('[getCustomerInvoices] Failed to get customer invoices', {
      error,
      customerId,
    });
    throw error;
  }
}

/**
 * Create a Stripe SetupIntent for saving a card.
 * Used only for Org/Team users — Individual users use Apple IAP.
 * Returns the client_secret to be used with Stripe Elements on the frontend.
 */
export async function createSetupIntent(
  customerId: string,
  environment: 'staging' | 'production'
): Promise<string> {
  const stripe = getStripeClient(environment);

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    usage: 'off_session',
    payment_method_types: ['card'],
  });

  logger.info('[createSetupIntent] SetupIntent created', {
    customerId,
    setupIntentId: setupIntent.id,
  });

  if (!setupIntent.client_secret) {
    throw new Error('Stripe returned SetupIntent without client_secret');
  }

  return setupIntent.client_secret;
}

function getDefaultPaymentMethodId(
  customer: Stripe.Customer | Stripe.DeletedCustomer | string
): string | null {
  if (typeof customer === 'string' || customer.deleted) {
    return null;
  }

  const defaultPaymentMethod = customer.invoice_settings?.default_payment_method;
  if (typeof defaultPaymentMethod === 'string') {
    return defaultPaymentMethod;
  }

  return defaultPaymentMethod?.id ?? null;
}

export async function getDefaultCardPaymentMethodId(
  customerId: string,
  environment: 'staging' | 'production'
): Promise<string | null> {
  try {
    const stripe = getStripeClient(environment);
    const customer = await stripe.customers.retrieve(customerId);
    const defaultPaymentMethodId = getDefaultPaymentMethodId(customer);

    if (!defaultPaymentMethodId) {
      return null;
    }

    const paymentMethod = await stripe.paymentMethods.retrieve(defaultPaymentMethodId);
    if (paymentMethod.type !== 'card') {
      logger.info('[getDefaultCardPaymentMethodId] Default payment method is not a card', {
        customerId,
        paymentMethodId: defaultPaymentMethodId,
        paymentMethodType: paymentMethod.type,
      });
      return null;
    }

    return paymentMethod.id;
  } catch (error) {
    logger.warn('[getDefaultCardPaymentMethodId] Failed to resolve default card payment method', {
      error,
      customerId,
      environment,
    });
    return null;
  }
}

/**
 * Check whether a Stripe customer has at least one saved card.
 * Used to gate Org/Team users from running agent jobs before adding a payment method.
 */
export async function hasPaymentMethod(
  customerId: string,
  environment: 'staging' | 'production'
): Promise<boolean> {
  try {
    const stripe = getStripeClient(environment);
    const methods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 1,
    });
    return methods.data.length > 0;
  } catch (error) {
    logger.error('[hasPaymentMethod] Failed to check payment methods', { error, customerId });
    return false;
  }
}

/**
 * Charge a saved payment method off-session (auto top-up).
 *
 * Creates and immediately confirms a PaymentIntent against the customer's
 * default payment method without requiring the user to be present.
 *
 * This is the Stripe-recommended approach for off-session charges:
 *   - `confirm: true` — confirms immediately
 *   - `off_session: true` — signals to Stripe that the user is not present
 *   - If the card requires 3DS (SCA), Stripe returns `requires_action` and
 *     this function returns `{ success: false, errorCode: 'authentication_required' }`
 *
 * IMPORTANT: Only call this when the user has already confirmed the charge
 * during the SetupIntent flow (i.e., they agreed to automatic top-up).
 */
/**
 * Retrieve the Stripe-hosted receipt URL for a PaymentIntent.
 * Stripe attaches receipt_url to the latest Charge under the PaymentIntent.
 * Returns null if not available (non-card payments, test mode, etc.).
 */
export async function getPaymentIntentReceiptUrl(
  paymentIntentId: string,
  environment: 'staging' | 'production'
): Promise<string | null> {
  try {
    const stripe = getStripeClient(environment);
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
    });
    const charge = pi.latest_charge;
    if (!charge || typeof charge === 'string') return null;
    return charge.receipt_url ?? null;
  } catch {
    return null;
  }
}

export async function chargeOffSession(
  customerId: string,
  paymentMethodId: string,
  amountCents: number,
  description: string,
  idempotencyKey: string,
  environment: 'staging' | 'production'
): Promise<ChargeOffSessionResult> {
  try {
    if (amountCents <= 0 || !Number.isInteger(amountCents)) {
      return { success: false, error: `Invalid amountCents: ${amountCents}` };
    }

    const stripe = getStripeClient(environment);

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: 'usd',
        customer: customerId,
        payment_method: paymentMethodId,
        confirm: true,
        off_session: true,
        description,
        metadata: {
          type: 'auto_wallet_topup',
          customerId,
        },
      },
      { idempotencyKey }
    );

    if (paymentIntent.status === 'succeeded') {
      logger.info('[chargeOffSession] PaymentIntent succeeded', {
        paymentIntentId: paymentIntent.id,
        customerId,
        amountCents,
      });

      // Retrieve the receipt URL from the latest charge (non-fatal).
      const receiptUrl = await getPaymentIntentReceiptUrl(paymentIntent.id, environment);
      return { success: true, paymentIntentId: paymentIntent.id, receiptUrl };
    }

    // Covers 'requires_action', 'requires_payment_method', etc.
    logger.warn('[chargeOffSession] PaymentIntent not succeeded', {
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      customerId,
    });
    return {
      success: false,
      paymentIntentId: paymentIntent.id,
      errorCode: paymentIntent.status,
      error: `PaymentIntent status: ${paymentIntent.status}`,
    };
  } catch (error: unknown) {
    const stripeError = error as { code?: string; message?: string };
    logger.error('[chargeOffSession] Charge failed', {
      error,
      customerId,
      amountCents,
      errorCode: stripeError.code,
    });
    return {
      success: false,
      errorCode: stripeError.code,
      error: stripeError.message ?? 'Unknown error',
    };
  }
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retryCount: number = 0
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retryCount >= RETRY_CONFIG.MAX_RETRIES) {
      throw error;
    }

    // Check if it's a rate limit error
    const isRateLimit =
      error instanceof Error &&
      (error.message.includes('rate_limit') || error.message.includes('429'));

    if (!isRateLimit) {
      throw error;
    }

    const delay = Math.min(
      RETRY_CONFIG.INITIAL_DELAY_MS * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, retryCount),
      RETRY_CONFIG.MAX_DELAY_MS
    );

    logger.warn('[retryWithBackoff] Rate limited, retrying', {
      retryCount: retryCount + 1,
      delayMs: delay,
    });

    await new Promise((resolve) => setTimeout(resolve, delay));

    return retryWithBackoff(fn, retryCount + 1);
  }
}

/**
 * Create invoice item with retry
 */
export async function createInvoiceItemWithRetry(
  customerId: string,
  stripePriceId: string,
  quantity: number,
  idempotencyKey: string,
  environment: 'staging' | 'production',
  description?: string
): Promise<CreateInvoiceItemResult> {
  return retryWithBackoff(() =>
    createInvoiceItem(customerId, stripePriceId, quantity, idempotencyKey, environment, description)
  );
}

// ============================================
// METERED BILLING (B2B Scale-Ready)
// ============================================

/**
 * Stripe Meter event name for AI usage.
 * Must match the meter created in Stripe Dashboard or via `createUsageMeter()`.
 */
const METER_EVENT_NAME = 'nxt1_ai_usage';

/**
 * Report a metered billing event to Stripe.
 *
 * Instead of creating individual invoice items for each AI call (which hits
 * rate limits at scale), this streams lightweight "usage ticks" to a Stripe
 * Billing Meter. Stripe aggregates these automatically and produces a single
 * clean line item on the monthly invoice.
 *
 * For B2B teams/organizations with high-volume usage (100s–1000s of AI calls
 * per billing period), this is the production-grade approach.
 *
 * @param customerId Stripe customer ID
 * @param costCents Total cost in cents for this usage event
 * @param environment Stripe environment
 * @param metadata Additional context for the meter event
 * @returns The meter event ID from Stripe
 */
export async function reportMeterEvent(
  customerId: string,
  costCents: number,
  environment: 'staging' | 'production',
  metadata?: {
    userId?: string;
    teamId?: string;
    feature?: string;
    usageEventId?: string;
  }
): Promise<{ success: boolean; meterEventId?: string; error?: string }> {
  try {
    const stripe = getStripeClient(environment);

    // Stripe billing.meterEvents.create expects positive integer values
    const value = Math.max(1, Math.round(costCents));

    // Stripe Billing Meters API (2024+) — not yet in @types/stripe
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const billing = (stripe as Record<string, any>)['billing'];
    const meterEvent = await billing.meterEvents.create({
      event_name: METER_EVENT_NAME,
      payload: {
        stripe_customer_id: customerId,
        value: String(value),
      },
      timestamp: Math.floor(Date.now() / 1000),
    });

    logger.info('[reportMeterEvent] Meter event reported', {
      meterEventId: meterEvent.identifier,
      customerId,
      costCents,
      feature: metadata?.feature,
    });

    return {
      success: true,
      meterEventId: meterEvent.identifier,
    };
  } catch (error) {
    logger.error('[reportMeterEvent] Failed to report meter event', {
      error,
      customerId,
      costCents,
      metadata,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Report meter event with exponential backoff retry.
 * Used by the usage processing worker for B2B billing.
 */
export async function reportMeterEventWithRetry(
  customerId: string,
  costCents: number,
  environment: 'staging' | 'production',
  metadata?: {
    userId?: string;
    teamId?: string;
    feature?: string;
    usageEventId?: string;
  }
): Promise<{ success: boolean; meterEventId?: string; error?: string }> {
  return retryWithBackoff(() => reportMeterEvent(customerId, costCents, environment, metadata));
}

/**
 * Create an AI usage meter in Stripe (one-time setup).
 * Call this during initial environment provisioning or via an admin endpoint.
 *
 * The meter aggregates usage ticks (cost in cents) per customer per billing period.
 * Stripe automatically adds the aggregated amount as a single line item to invoices.
 */
export async function createUsageMeter(
  environment: 'staging' | 'production'
): Promise<{ success: boolean; meterId?: string; error?: string }> {
  try {
    const stripe = getStripeClient(environment);

    // Stripe Billing Meters API (2024+) — not yet in @types/stripe
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const billing = (stripe as Record<string, any>)['billing'];
    const meter = await billing.meters.create({
      display_name: 'NXT1 AI Usage',
      event_name: METER_EVENT_NAME,
      default_aggregation: {
        formula: 'sum',
      },
      customer_mapping: {
        type: 'by_id',
        event_payload_key: 'stripe_customer_id',
      },
      value_settings: {
        event_payload_key: 'value',
      },
    });

    logger.info('[createUsageMeter] Meter created', {
      meterId: meter.id,
      environment,
    });

    return { success: true, meterId: meter.id };
  } catch (error) {
    logger.error('[createUsageMeter] Failed to create meter', { error, environment });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Issue a refund for a Stripe charge.
 * Used by org admins to credit back a disputed or erroneous charge.
 *
 * @param chargeId  Stripe charge ID (ch_...)
 * @param environment  Stripe environment
 * @param amountCents  Partial refund amount in cents. Omit for a full refund.
 * @returns The created Stripe Refund object
 */
export async function refundCharge(
  chargeId: string,
  environment: 'staging' | 'production',
  amountCents?: number
): Promise<Stripe.Refund> {
  const stripe = getStripeClient(environment);

  const params: Stripe.RefundCreateParams = { charge: chargeId };
  if (amountCents != null && amountCents > 0) {
    params.amount = Math.round(amountCents);
  }

  const refund = await stripe.refunds.create(params);

  logger.info('[refundCharge] Refund created', {
    refundId: refund.id,
    chargeId,
    amountCents: refund.amount,
    status: refund.status,
    environment,
  });

  return refund;
}
