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

    // Look up our internal billing user via StripeCustomers cache
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
 * Sets the payment method as the customer's default on Stripe AND syncs card
 * details to Firestore (StripeCustomers + BillingContexts / Organization).
 */
export async function handleSetupIntentSucceeded(
  db: Firestore,
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

    // Set default on Stripe + fetch full PM details in parallel
    const [, pm] = await Promise.all([
      stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      }),
      stripe.paymentMethods.retrieve(paymentMethodId),
    ]);

    const cardDetails =
      pm.type === 'card' && pm.card
        ? {
            pmId: pm.id,
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year,
            funding: pm.card.funding,
            country: pm.card.country,
          }
        : undefined;

    // Persist to Firestore: StripeCustomers cache + BillingContexts / Organization
    const customerSnap = await db
      .collection(COLLECTIONS.STRIPE_CUSTOMERS)
      .where('stripeCustomerId', '==', customerId)
      .where('environment', '==', environment)
      .limit(1)
      .get();

    if (!customerSnap.empty && cardDetails) {
      await customerSnap.docs[0]!.ref.update({
        defaultPaymentMethod: cardDetails,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await setHasPaymentMethod(db, customerId, environment, true, cardDetails);

    logger.info('[handleSetupIntentSucceeded] Default payment method synced to Firestore', {
      customerId,
      paymentMethodId,
      brand: cardDetails?.brand,
      last4: cardDetails?.last4,
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
 * Handle customer.updated event
 * Fired by Stripe whenever customer data changes — most importantly when
 * invoice_settings.default_payment_method is set after a SetupIntent.
 * Uses metadata.userId for a direct lookup instead of an extra Stripe call.
 */
export async function handleCustomerUpdated(
  db: Firestore,
  customer: Stripe.Customer,
  environment: 'staging' | 'production'
): Promise<void> {
  try {
    const defaultPmId =
      typeof customer.invoice_settings?.default_payment_method === 'string'
        ? customer.invoice_settings.default_payment_method
        : customer.invoice_settings?.default_payment_method?.id;

    if (!defaultPmId) {
      // No default PM set — nothing to sync
      logger.info('[handleCustomerUpdated] No default_payment_method — skipping', {
        customerId: customer.id,
      });
      return;
    }

    const stripe = getStripeClient(environment);
    const pm = await stripe.paymentMethods.retrieve(defaultPmId);

    const cardDetails =
      pm.type === 'card' && pm.card
        ? {
            pmId: pm.id,
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year,
            funding: pm.card.funding,
            country: pm.card.country,
          }
        : undefined;

    // Update StripeCustomers cache
    const customerSnap = await db
      .collection(COLLECTIONS.STRIPE_CUSTOMERS)
      .where('stripeCustomerId', '==', customer.id)
      .where('environment', '==', environment)
      .limit(1)
      .get();

    if (!customerSnap.empty && cardDetails) {
      await customerSnap.docs[0]!.ref.update({
        defaultPaymentMethod: cardDetails,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await setHasPaymentMethod(db, customer.id, environment, true, cardDetails);

    logger.info('[handleCustomerUpdated] Default payment method synced', {
      customerId: customer.id,
      pmId: defaultPmId,
      brand: cardDetails?.brand,
      last4: cardDetails?.last4,
    });
  } catch (error) {
    logger.error('[handleCustomerUpdated] Failed', { error, customerId: customer.id });
    throw error;
  }
}

/**
 * Handle customer.subscription.created
 * Sets billing.subscriptionId + billing.customerId on the Organization doc
 * so getBillingContext treats it as org-level billing.
 */
export async function handleSubscriptionCreated(
  db: Firestore,
  subscription: Stripe.Subscription,
  environment: 'staging' | 'production'
): Promise<void> {
  try {
    await syncSubscriptionToOrg(db, subscription, environment);
    logger.info('[handleSubscriptionCreated] Subscription synced', {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      status: subscription.status,
    });
  } catch (error) {
    logger.error('[handleSubscriptionCreated] Failed', { error, subscriptionId: subscription.id });
    throw error;
  }
}

/**
 * Handle customer.subscription.updated
 * Syncs plan changes, status changes (trialing→active, active→past_due, etc.)
 * and next billing date back to the Organization doc.
 */
export async function handleSubscriptionUpdated(
  db: Firestore,
  subscription: Stripe.Subscription,
  environment: 'staging' | 'production'
): Promise<void> {
  try {
    await syncSubscriptionToOrg(db, subscription, environment);
    logger.info('[handleSubscriptionUpdated] Subscription synced', {
      subscriptionId: subscription.id,
      status: subscription.status,
    });
  } catch (error) {
    logger.error('[handleSubscriptionUpdated] Failed', { error, subscriptionId: subscription.id });
    throw error;
  }
}

/**
 * Handle customer.subscription.deleted
 * Clears billing.subscriptionId on the Organization so getBillingContext
 * falls back to individual billing. Also notifies org admins.
 */
export async function handleSubscriptionDeleted(
  db: Firestore,
  subscription: Stripe.Subscription,
  environment: 'staging' | 'production'
): Promise<void> {
  try {
    const customerId =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

    // Find the org by customerId
    const orgSnap = await db
      .collection('Organizations')
      .where('billing.customerId', '==', customerId)
      .limit(1)
      .get();

    if (orgSnap.empty) {
      logger.warn('[handleSubscriptionDeleted] No org found for customer', {
        customerId,
        environment,
      });
      return;
    }

    const orgDoc = orgSnap.docs[0]!;
    await orgDoc.ref.update({
      'billing.subscriptionId': FieldValue.delete(),
      'billing.subscriptionStatus': 'canceled',
      'billing.nextBillingDate': FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info('[handleSubscriptionDeleted] Subscription cleared from org', {
      orgId: orgDoc.id,
      subscriptionId: subscription.id,
    });

    // Notify org admins
    const orgData = orgDoc.data() as Record<string, unknown>;
    const admins = (orgData['admins'] as Array<{ userId: string }> | undefined) ?? [];
    const { dispatch } = await import('../../services/notification.service.js');
    await Promise.all(
      admins.map((admin) =>
        dispatch(db, {
          userId: admin.userId,
          type: NOTIFICATION_TYPES.PAYMENT_FAILED,
          title: 'Subscription Canceled',
          body: 'Your organization subscription has been canceled. Individual billing is now active.',
          deepLink: '/usage?section=payment-info',
          priority: 'high',
          source: { userName: 'NXT1 Billing' },
        }).catch((err: unknown) =>
          logger.error('[handleSubscriptionDeleted] Notify failed', { error: err })
        )
      )
    );
  } catch (error) {
    logger.error('[handleSubscriptionDeleted] Failed', { error, subscriptionId: subscription.id });
    throw error;
  }
}

/**
 * Shared helper: write subscription state to the matching Organization doc.
 */
async function syncSubscriptionToOrg(
  db: Firestore,
  subscription: Stripe.Subscription,
  environment: 'staging' | 'production'
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  // Find org by customerId
  const orgSnap = await db
    .collection('Organizations')
    .where('billing.customerId', '==', customerId)
    .limit(1)
    .get();

  if (orgSnap.empty) {
    // If no org found, try falling back to StripeCustomers cache → user-level
    const customerCache = await db
      .collection(COLLECTIONS.STRIPE_CUSTOMERS)
      .where('stripeCustomerId', '==', customerId)
      .where('environment', '==', environment)
      .limit(1)
      .get();

    if (!customerCache.empty) {
      logger.info('[syncSubscriptionToOrg] No org found — subscription is user-level, skipping', {
        customerId,
      });
    } else {
      logger.warn('[syncSubscriptionToOrg] No org or user found for customer', { customerId });
    }
    return;
  }

  const orgDoc = orgSnap.docs[0]!;
  const currentPeriodEnd = (subscription as unknown as Record<string, unknown>)[
    'current_period_end'
  ];
  const nextBillingDate =
    typeof currentPeriodEnd === 'number'
      ? new Date(currentPeriodEnd * 1000).toISOString()
      : undefined;

  const update: Record<string, unknown> = {
    'billing.subscriptionId': subscription.id,
    'billing.customerId': customerId,
    'billing.subscriptionStatus': subscription.status,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (nextBillingDate) update['billing.nextBillingDate'] = nextBillingDate;

  await orgDoc.ref.update(update);
}

/**
 * Handle payment_method.attached
 * Marks hasPaymentMethod = true and stores card details for frontend display.
 */
export async function handlePaymentMethodAttached(
  db: Firestore,
  paymentMethod: Stripe.PaymentMethod,
  environment: 'staging' | 'production'
): Promise<void> {
  try {
    const customerId =
      typeof paymentMethod.customer === 'string'
        ? paymentMethod.customer
        : paymentMethod.customer?.id;

    if (!customerId) return;

    // Extract card details for display
    const cardDetails =
      paymentMethod.type === 'card' && paymentMethod.card
        ? {
            pmId: paymentMethod.id,
            brand: paymentMethod.card.brand,
            last4: paymentMethod.card.last4,
            expMonth: paymentMethod.card.exp_month,
            expYear: paymentMethod.card.exp_year,
            funding: paymentMethod.card.funding,
            country: paymentMethod.card.country,
          }
        : undefined;

    // Always update StripeCustomers cache with card info for quick lookup
    const customerSnap = await db
      .collection(COLLECTIONS.STRIPE_CUSTOMERS)
      .where('stripeCustomerId', '==', customerId)
      .where('environment', '==', environment)
      .limit(1)
      .get();

    if (!customerSnap.empty && cardDetails) {
      await customerSnap.docs[0]!.ref.update({
        defaultPaymentMethod: cardDetails,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await setHasPaymentMethod(db, customerId, environment, true, cardDetails);

    logger.info('[handlePaymentMethodAttached] hasPaymentMethod set with card details', {
      customerId,
      paymentMethodId: paymentMethod.id,
      brand: cardDetails?.brand,
      last4: cardDetails?.last4,
    });
  } catch (error) {
    logger.error('[handlePaymentMethodAttached] Failed', {
      error,
      paymentMethodId: paymentMethod.id,
    });
    throw error;
  }
}

/**
 * Handle payment_method.detached
 * Clears hasPaymentMethod flag and card details.
 * Also checks remaining payment methods via Stripe API — only clears if none left.
 */
export async function handlePaymentMethodDetached(
  db: Firestore,
  paymentMethod: Stripe.PaymentMethod,
  environment: 'staging' | 'production'
): Promise<void> {
  try {
    // On detach, customer is null per Stripe docs — look up via StripeCustomers by pmId
    // First try the pmId stored in defaultPaymentMethod to find the right customer
    const pmSnap = await db
      .collection(COLLECTIONS.STRIPE_CUSTOMERS)
      .where('defaultPaymentMethod.pmId', '==', paymentMethod.id)
      .where('environment', '==', environment)
      .limit(1)
      .get();

    if (pmSnap.empty) {
      logger.info('[handlePaymentMethodDetached] PM not found in cache — skipping', {
        paymentMethodId: paymentMethod.id,
      });
      return;
    }

    const customerDoc = pmSnap.docs[0]!;
    const customerId = customerDoc.data()['stripeCustomerId'] as string;

    // Check if customer still has other payment methods
    const stripe = getStripeClient(environment);
    const remainingPMs = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 1,
    });

    const hasRemaining = remainingPMs.data.length > 0;

    if (hasRemaining) {
      // Swap defaultPaymentMethod to the next available card
      const nextPM = remainingPMs.data[0]!;
      const nextCard = nextPM.card
        ? {
            pmId: nextPM.id,
            brand: nextPM.card.brand,
            last4: nextPM.card.last4,
            expMonth: nextPM.card.exp_month,
            expYear: nextPM.card.exp_year,
            funding: nextPM.card.funding,
            country: nextPM.card.country,
          }
        : undefined;

      await customerDoc.ref.update({
        defaultPaymentMethod: nextCard ?? FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await setHasPaymentMethod(db, customerId, environment, true, nextCard);

      logger.info('[handlePaymentMethodDetached] Swapped to next payment method', {
        customerId,
        removedPmId: paymentMethod.id,
        newPmId: nextPM.id,
      });
    } else {
      // No cards left — clear everything
      await customerDoc.ref.update({
        defaultPaymentMethod: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await setHasPaymentMethod(db, customerId, environment, false, undefined);

      logger.info('[handlePaymentMethodDetached] All cards removed — hasPaymentMethod cleared', {
        customerId,
        paymentMethodId: paymentMethod.id,
      });
    }
  } catch (error) {
    logger.error('[handlePaymentMethodDetached] Failed', {
      error,
      paymentMethodId: paymentMethod.id,
    });
    throw error;
  }
}

interface CardDetails {
  pmId: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  funding: string;
  country: string | null;
}

/**
 * Shared helper: set billing.hasPaymentMethod (+ optional card details) on org or BillingContexts.
 */
async function setHasPaymentMethod(
  db: Firestore,
  customerId: string,
  environment: 'staging' | 'production',
  value: boolean,
  cardDetails?: CardDetails
): Promise<void> {
  const pmUpdate = cardDetails
    ? { defaultPaymentMethod: cardDetails }
    : { defaultPaymentMethod: FieldValue.delete() };

  // Try org first
  const orgSnap = await db
    .collection('Organizations')
    .where('billing.customerId', '==', customerId)
    .limit(1)
    .get();

  if (!orgSnap.empty) {
    await orgSnap.docs[0]!.ref.update({
      'billing.hasPaymentMethod': value,
      'billing.defaultPaymentMethod': pmUpdate.defaultPaymentMethod,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  // Fall back to individual user billing context
  const customerSnap = await db
    .collection(COLLECTIONS.STRIPE_CUSTOMERS)
    .where('stripeCustomerId', '==', customerId)
    .where('environment', '==', environment)
    .limit(1)
    .get();

  if (customerSnap.empty) return;

  const userId = customerSnap.docs[0]!.data()['userId'] as string;
  const ctxSnap = await db
    .collection(COLLECTIONS.BILLING_CONTEXTS)
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (!ctxSnap.empty) {
    await ctxSnap.docs[0]!.ref.update({
      hasPaymentMethod: value,
      defaultPaymentMethod: pmUpdate.defaultPaymentMethod,
      updatedAt: FieldValue.serverTimestamp(),
    });
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

    case 'customer.updated':
      await handleCustomerUpdated(db, event.data.object as Stripe.Customer, environment);
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

    case 'customer.subscription.created':
      await handleSubscriptionCreated(db, event.data.object as Stripe.Subscription, environment);
      break;

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(db, event.data.object as Stripe.Subscription, environment);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(db, event.data.object as Stripe.Subscription, environment);
      break;

    case 'payment_method.attached':
      await handlePaymentMethodAttached(db, event.data.object as Stripe.PaymentMethod, environment);
      break;

    case 'payment_method.detached':
      await handlePaymentMethodDetached(db, event.data.object as Stripe.PaymentMethod, environment);
      break;

    default:
      logger.info('[handleWebhookEvent] Unhandled event type', {
        eventType: event.type,
      });
  }
}
