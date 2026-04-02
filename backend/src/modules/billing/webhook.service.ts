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

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      // We don't use subscriptions, but log for debugging
      logger.info('[handleWebhookEvent] Subscription event ignored (usage-based billing only)', {
        eventType: event.type,
      });
      break;

    default:
      logger.info('[handleWebhookEvent] Unhandled event type', {
        eventType: event.type,
      });
  }
}
