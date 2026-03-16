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
} from './types/index.js';

// Stripe client instances (cached)
const stripeClients: Map<string, Stripe> = new Map();

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
    apiVersion: '2026-01-28.clover',
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
    const customerDoc = await db
      .collection(COLLECTIONS.STRIPE_CUSTOMERS)
      .where('userId', '==', userId)
      .where('environment', '==', environment)
      .limit(1)
      .get();

    if (!customerDoc.empty) {
      const customer = customerDoc.docs[0]?.data() as StripeCustomer;
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
        idempotencyKey: `customer-${userId}-${environment}`,
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
  } catch (error) {
    logger.error('[getOrCreateCustomer] Failed to get or create customer', {
      error,
      userId,
      environment,
    });
    throw error;
  }
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
