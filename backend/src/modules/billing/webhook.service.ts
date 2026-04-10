/**
 * @fileoverview Webhook Service
 * @module @nxt1/backend/modules/billing
 *
 * Service for handling Stripe webhooks
 */

import type Stripe from 'stripe';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { getStripeClient } from './stripe.service.js';
import { getStripeConfig, COLLECTIONS } from './config.js';
import { logger } from '../../utils/logger.js';
import { NOTIFICATION_TYPES } from '@nxt1/core';
import { addWalletTopUp } from './budget.service.js';
import type { PaymentLog } from './types/index.js';

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  environment: 'staging' | 'production'
): Stripe.Event {
  try {
    const stripe = getStripeClient(environment);
    const config = getStripeConfig(environment);

    if (!config.webhookSecret) {
      throw new Error(`Webhook secret not configured for ${environment}`);
    }

    const event = stripe.webhooks.constructEvent(payload, signature, config.webhookSecret);

    logger.info('[verifyWebhookSignature] Signature verified', {
      eventType: event.type,
      eventId: event.id,
    });

    return event;
  } catch (error) {
    logger.error('[verifyWebhookSignature] Signature verification failed', {
      error,
    });
    throw error;
  }
}

/**
 * Handle invoice.finalized event
 */
export async function handleInvoiceFinalized(
  db: Firestore,
  invoice: Stripe.Invoice,
  _environment: 'staging' | 'production'
): Promise<void> {
  try {
    logger.info('[handleInvoiceFinalized] Processing invoice', {
      invoiceId: invoice.id,
      customerId: invoice.customer,
      amountDue: invoice.amount_due,
    });

    // Log payment (even if not paid yet)
    const now = FieldValue.serverTimestamp();
    const paymentLog: Omit<PaymentLog, 'createdAt'> = {
      invoiceId: invoice.id,
      customerId: invoice.customer as string,
      userId: invoice.metadata?.['userId'] || '',
      teamId: invoice.metadata?.['teamId'],
      amountDue: invoice.amount_due / 100, // Convert cents to dollars
      amountPaid: invoice.amount_paid / 100,
      currency: invoice.currency,
      status: invoice.status === 'paid' ? 'PAID' : 'PENDING',
      invoiceUrl: invoice.hosted_invoice_url || undefined,
      rawEvent: invoice as unknown as Record<string, unknown>,
    };

    await db.collection(COLLECTIONS.PAYMENT_LOGS).add({
      ...paymentLog,
      createdAt: now,
    });

    logger.info('[handleInvoiceFinalized] Payment log created', {
      invoiceId: invoice.id,
    });
  } catch (error) {
    logger.error('[handleInvoiceFinalized] Failed to handle invoice finalized', {
      error,
      invoiceId: invoice.id,
    });
    throw error;
  }
}

/**
 * Handle invoice.payment_succeeded event
 */
export async function handleInvoicePaymentSucceeded(
  db: Firestore,
  invoice: Stripe.Invoice,
  _environment: 'staging' | 'production'
): Promise<void> {
  try {
    logger.info('[handleInvoicePaymentSucceeded] Processing payment success', {
      invoiceId: invoice.id,
      customerId: invoice.customer,
      amountPaid: invoice.amount_paid,
    });

    // Update or create payment log
    const existingLog = await db
      .collection(COLLECTIONS.PAYMENT_LOGS)
      .where('invoiceId', '==', invoice.id)
      .limit(1)
      .get();

    if (!existingLog.empty) {
      // Update existing log
      const logDoc = existingLog.docs[0];
      await logDoc?.ref.update({
        status: 'PAID',
        amountPaid: invoice.amount_paid / 100,
        rawEvent: invoice as unknown as Record<string, unknown>,
      });

      logger.info('[handleInvoicePaymentSucceeded] Payment log updated', {
        invoiceId: invoice.id,
      });
    } else {
      // Create new log
      const now = FieldValue.serverTimestamp();
      const paymentLog: Omit<PaymentLog, 'createdAt'> = {
        invoiceId: invoice.id,
        customerId: invoice.customer as string,
        userId: invoice.metadata?.['userId'] || '',
        teamId: invoice.metadata?.['teamId'],
        amountDue: invoice.amount_due / 100,
        amountPaid: invoice.amount_paid / 100,
        currency: invoice.currency,
        status: 'PAID',
        invoiceUrl: invoice.hosted_invoice_url || undefined,
        rawEvent: invoice as unknown as Record<string, unknown>,
      };

      await db.collection(COLLECTIONS.PAYMENT_LOGS).add({
        ...paymentLog,
        createdAt: now,
      });

      logger.info('[handleInvoicePaymentSucceeded] Payment log created', {
        invoiceId: invoice.id,
      });
    }
  } catch (error) {
    logger.error('[handleInvoicePaymentSucceeded] Failed to handle payment success', {
      error,
      invoiceId: invoice.id,
    });
    throw error;
  }
}

/**
 * Handle invoice.payment_failed event
 */
export async function handleInvoicePaymentFailed(
  db: Firestore,
  invoice: Stripe.Invoice,
  _environment: 'staging' | 'production'
): Promise<void> {
  try {
    logger.warn('[handleInvoicePaymentFailed] Processing payment failure', {
      invoiceId: invoice.id,
      customerId: invoice.customer,
      amountDue: invoice.amount_due,
    });

    // Update or create payment log
    const existingLog = await db
      .collection(COLLECTIONS.PAYMENT_LOGS)
      .where('invoiceId', '==', invoice.id)
      .limit(1)
      .get();

    if (!existingLog.empty) {
      // Update existing log
      const logDoc = existingLog.docs[0];
      await logDoc?.ref.update({
        status: 'FAILED',
        rawEvent: invoice as unknown as Record<string, unknown>,
      });

      logger.info('[handleInvoicePaymentFailed] Payment log updated', {
        invoiceId: invoice.id,
      });
    } else {
      // Create new log
      const now = FieldValue.serverTimestamp();
      const paymentLog: Omit<PaymentLog, 'createdAt'> = {
        invoiceId: invoice.id,
        customerId: invoice.customer as string,
        userId: invoice.metadata?.['userId'] || '',
        teamId: invoice.metadata?.['teamId'],
        amountDue: invoice.amount_due / 100,
        amountPaid: invoice.amount_paid / 100,
        currency: invoice.currency,
        status: 'FAILED',
        invoiceUrl: invoice.hosted_invoice_url || undefined,
        rawEvent: invoice as unknown as Record<string, unknown>,
      };

      await db.collection(COLLECTIONS.PAYMENT_LOGS).add({
        ...paymentLog,
        createdAt: now,
      });

      logger.info('[handleInvoicePaymentFailed] Payment log created', {
        invoiceId: invoice.id,
      });
    }

    // Notify user about failed payment via unified NotificationService
    const { dispatch } = await import('../../services/notification.service.js');
    await dispatch(db, {
      userId: invoice.customer as string,
      type: NOTIFICATION_TYPES.PAYMENT_FAILED,
      title: 'Payment Failed',
      body: 'We were unable to process your payment. Please update your payment method.',
      deepLink: '/settings/billing',
      priority: 'high',
      source: { userName: 'NXT1 Billing' },
    }).catch((notifyErr: unknown) => {
      // Payment failure logging already handled above — push is best-effort
      logger.error('[handleInvoicePaymentFailed] Failed to dispatch notification', {
        error: notifyErr,
        invoiceId: invoice.id,
      });
    });
  } catch (error) {
    logger.error('[handleInvoicePaymentFailed] Failed to handle payment failure', {
      error,
      invoiceId: invoice.id,
    });
    throw error;
  }
}

/**
 * Handle charge.refunded event
 * Decrements currentPeriodSpend on the org billing context and marks the
 * payment log as REFUNDED. Stripe fires this after a Refund is successfully
 * completed (partial or full).
 */
export async function handleChargeRefunded(
  db: Firestore,
  charge: Stripe.Charge,
  environment: 'staging' | 'production'
): Promise<void> {
  try {
    const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;

    if (!customerId) {
      logger.warn('[handleChargeRefunded] No customer on charge', { chargeId: charge.id });
      return;
    }

    const amountRefundedCents = charge.amount_refunded;
    if (!amountRefundedCents) return;

    // Look up our internal billing user via stripeCustomers cache
    const customerSnap = await db
      .collection(COLLECTIONS.STRIPE_CUSTOMERS)
      .where('stripeCustomerId', '==', customerId)
      .where('environment', '==', environment)
      .limit(1)
      .get();

    if (customerSnap.empty) {
      logger.warn('[handleChargeRefunded] Stripe customer not found in cache', {
        customerId,
        environment,
      });
      return;
    }

    const billingUserId = customerSnap.docs[0]!.data()['userId'] as string;

    // Decrement currentPeriodSpend (floor at 0 — can't go negative)
    const billingSnap = await db
      .collection(COLLECTIONS.BILLING_CONTEXTS)
      .where('userId', '==', billingUserId)
      .limit(1)
      .get();

    if (!billingSnap.empty) {
      const currentSpend = (billingSnap.docs[0]!.data()['currentPeriodSpend'] as number) ?? 0;
      const decrement = Math.min(amountRefundedCents, currentSpend);

      await billingSnap.docs[0]!.ref.update({
        currentPeriodSpend: FieldValue.increment(-decrement),
        updatedAt: FieldValue.serverTimestamp(),
      });

      logger.info('[handleChargeRefunded] currentPeriodSpend decremented', {
        billingUserId,
        decrement,
        amountRefundedCents,
      });
    }

    // Update payment log status to REFUNDED (look up by invoice ID if present)
    // The `invoice` field exists on Charge objects but may not be in all SDK type versions
    const chargeRaw = charge as unknown as Record<string, unknown>;
    const rawInvoice = chargeRaw['invoice'];
    const invoiceId =
      typeof rawInvoice === 'string'
        ? rawInvoice
        : rawInvoice != null && typeof (rawInvoice as Record<string, unknown>)['id'] === 'string'
          ? ((rawInvoice as Record<string, unknown>)['id'] as string)
          : undefined;

    if (invoiceId) {
      const logSnap = await db
        .collection(COLLECTIONS.PAYMENT_LOGS)
        .where('invoiceId', '==', invoiceId)
        .limit(1)
        .get();

      if (!logSnap.empty) {
        await logSnap.docs[0]!.ref.update({
          status: 'REFUNDED',
          amountRefunded: amountRefundedCents / 100,
          updatedAt: FieldValue.serverTimestamp(),
        });

        logger.info('[handleChargeRefunded] Payment log marked REFUNDED', { invoiceId });
      }
    }
  } catch (error) {
    logger.error('[handleChargeRefunded] Failed to handle charge refund', {
      error,
      chargeId: charge.id,
    });
    throw error;
  }
}

/**
 * Handle customer.deleted event
 * Removes the stale Stripe customer cache entry from Firestore so future
 * billing calls create a fresh customer record instead of hitting a deleted one.
 */
export async function handleCustomerDeleted(
  db: Firestore,
  customer: Stripe.Customer | Stripe.DeletedCustomer,
  environment: 'staging' | 'production'
): Promise<void> {
  try {
    const snap = await db
      .collection(COLLECTIONS.STRIPE_CUSTOMERS)
      .where('stripeCustomerId', '==', customer.id)
      .where('environment', '==', environment)
      .limit(1)
      .get();

    if (!snap.empty) {
      await snap.docs[0]!.ref.delete();
      logger.info('[handleCustomerDeleted] Stripe customer cache entry removed', {
        customerId: customer.id,
        environment,
      });
    }
  } catch (error) {
    logger.error('[handleCustomerDeleted] Failed to remove customer cache', {
      error,
      customerId: customer.id,
    });
    throw error;
  }
}

/**
 * Handle setup_intent.succeeded event
 * Sets the payment method as the customer's default after a successful card save.
 */
export async function handleSetupIntentSucceeded(
  _db: Firestore,
  setupIntent: Stripe.SetupIntent,
  environment: 'staging' | 'production'
): Promise<void> {
  try {
    const customerId =
      typeof setupIntent.customer === 'string' ? setupIntent.customer : setupIntent.customer?.id;

    const paymentMethodId =
      typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;

    if (!customerId || !paymentMethodId) {
      logger.warn('[handleSetupIntentSucceeded] Missing customer or payment_method', {
        setupIntentId: setupIntent.id,
      });
      return;
    }

    const stripe = getStripeClient(environment);
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    logger.info('[handleSetupIntentSucceeded] Default payment method updated', {
      customerId,
      paymentMethodId,
      setupIntentId: setupIntent.id,
    });
  } catch (error) {
    logger.error('[handleSetupIntentSucceeded] Failed to set default payment method', {
      error,
      setupIntentId: setupIntent.id,
    });
    throw error;
  }
}

/**
 * Handle checkout.session.completed
 *
 * Processes completed Stripe Checkout Sessions. Currently handles:
 * - `wallet_topup`: Credits the user's prepaid wallet balance via addWalletTopUp.
 */
async function handleCheckoutSessionCompleted(
  db: Firestore,
  session: Stripe.Checkout.Session
): Promise<void> {
  const metadata = session.metadata ?? {};
  const type = metadata['type'];

  if (type !== 'wallet_topup') {
    logger.info('[handleCheckoutSessionCompleted] Ignoring non-wallet checkout session', {
      sessionId: session.id,
      type,
    });
    return;
  }

  const userId = metadata['userId'];
  const amountCents = parseInt(metadata['amountCents'] ?? '0', 10);

  if (!userId || !amountCents || amountCents <= 0) {
    logger.error('[handleCheckoutSessionCompleted] Missing or invalid metadata', {
      sessionId: session.id,
      userId,
      amountCents,
    });
    return;
  }

  if (session.payment_status !== 'paid') {
    logger.warn('[handleCheckoutSessionCompleted] Payment not confirmed', {
      sessionId: session.id,
      paymentStatus: session.payment_status,
    });
    return;
  }

  try {
    const { newBalance } = await addWalletTopUp(db, userId, amountCents, 'stripe');

    // Write payment log so the dashboard's Payment History section shows this top-up
    const now = FieldValue.serverTimestamp();
    await db.collection(COLLECTIONS.PAYMENT_LOGS).add({
      invoiceId: session.id,
      customerId: (session.customer as string) ?? '',
      userId,
      amountDue: amountCents / 100,
      amountPaid: amountCents / 100,
      currency: session.currency ?? 'usd',
      status: 'PAID',
      paymentMethodLabel: 'Card',
      type: 'wallet_topup',
      invoiceUrl: null,
      rawEvent: session as unknown as Record<string, unknown>,
      createdAt: now,
    });

    logger.info('[handleCheckoutSessionCompleted] Wallet topped up via Stripe Checkout', {
      sessionId: session.id,
      userId,
      amountCents,
      newBalance,
    });
  } catch (error) {
    logger.error('[handleCheckoutSessionCompleted] Failed to credit wallet', {
      error,
      sessionId: session.id,
      userId,
      amountCents,
    });
    throw error;
  }
}

/**
 * Main webhook handler - routes events to appropriate handlers
 */
export async function handleWebhookEvent(
  db: Firestore,
  event: Stripe.Event,
  environment: 'staging' | 'production'
): Promise<void> {
  logger.info('[handleWebhookEvent] Processing webhook event', {
    eventType: event.type,
    eventId: event.id,
  });

  switch (event.type) {
    case 'invoice.finalized':
      await handleInvoiceFinalized(db, event.data.object as Stripe.Invoice, environment);
      break;

    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(db, event.data.object as Stripe.Invoice, environment);
      break;

    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(db, event.data.object as Stripe.Invoice, environment);
      break;

    case 'setup_intent.succeeded':
      await handleSetupIntentSucceeded(db, event.data.object as Stripe.SetupIntent, environment);
      break;

    case 'charge.refunded':
      await handleChargeRefunded(db, event.data.object as Stripe.Charge, environment);
      break;

    case 'customer.deleted':
      await handleCustomerDeleted(
        db,
        event.data.object as Stripe.Customer | Stripe.DeletedCustomer,
        environment
      );
      break;

    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(db, event.data.object as Stripe.Checkout.Session);
      break;

    default:
      logger.info('[handleWebhookEvent] Unhandled event type', {
        eventType: event.type,
      });
  }
}
