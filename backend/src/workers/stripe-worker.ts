/**
 * @fileoverview Stripe Worker - Processes usage events from Pub/Sub
 * @module @nxt1/backend/workers
 *
 * Async worker that receives usage events from Pub/Sub and sends to Stripe
 * This worker is designed to be deployed as a separate Cloud Run service
 */

import { PubSub, type Message } from '@google-cloud/pubsub';
import { logger } from '../utils/logger.js';
import {
  getUsageEvent,
  tryAcquireEventLock,
  updateUsageEventStatus,
} from '../modules/billing/usage.service.js';
import { UsageEventStatus, type UsageEventMessage } from '../modules/billing/types/index.js';
import {
  getOrCreateCustomer,
  createInvoiceItemWithRetry,
} from '../modules/billing/stripe.service.js';
import { getBillingContext } from '../modules/billing/budget.service.js';

// Firebase initialization
import { db } from '../utils/firebase.js';
import { stagingDb } from '../utils/firebase-staging.js';

/**
 * Process a single usage event
 */
async function processUsageEvent(message: UsageEventMessage): Promise<void> {
  const { usageEventId, environment } = message;

  logger.info('[processUsageEvent] Processing event', {
    usageEventId,
    environment,
  });

  // Get appropriate Firestore instance
  const firestore = environment === 'staging' ? stagingDb : db;

  try {
    // Try to acquire lock (prevents double processing)
    const lockAcquired = await tryAcquireEventLock(firestore, usageEventId);

    if (!lockAcquired) {
      logger.info('[processUsageEvent] Event already processed or being processed', {
        usageEventId,
      });
      return;
    }

    // Get usage event
    const event = await getUsageEvent(firestore, usageEventId);

    if (!event) {
      throw new Error(`Usage event ${usageEventId} not found`);
    }

    logger.info('[processUsageEvent] Event retrieved', {
      usageEventId,
      feature: event.feature,
      quantity: event.quantity,
    });

    // Get user email from Firestore
    const userDoc = await firestore.collection('users').doc(event.userId).get();
    const userData = userDoc.data();
    const userEmail = (userData?.['email'] as string) || `${event.userId}@nxt1.app`;

    // ── Determine billing entity (individual vs team) ────────
    const billingCtx = await getBillingContext(firestore, event.userId);
    const isTeamBilled = billingCtx?.billingEntity === 'team' && billingCtx.teamId;

    let customerEmail = userEmail;
    let customerId: string;
    let customerUserId = event.userId;

    if (isTeamBilled && billingCtx.teamId) {
      // Team pays — get/create a Stripe customer for the team
      const teamDoc = await firestore.collection('teams').doc(billingCtx.teamId).get();
      const teamData = teamDoc.data();
      const teamEmail =
        (teamData?.['billingEmail'] as string) || (teamData?.['email'] as string) || userEmail;
      customerEmail = teamEmail;
      customerUserId = `team:${billingCtx.teamId}`;

      const teamCustomer = await getOrCreateCustomer(
        firestore,
        customerUserId,
        customerEmail,
        billingCtx.teamId,
        environment
      );
      customerId = teamCustomer.customerId;

      logger.info('[processUsageEvent] Billing to team customer', {
        teamId: billingCtx.teamId,
        customerId,
        generatingUserId: event.userId,
      });
    } else {
      // Individual pays
      const userCustomer = await getOrCreateCustomer(
        firestore,
        event.userId,
        userEmail,
        event.teamId,
        environment
      );
      customerId = userCustomer.customerId;

      logger.info('[processUsageEvent] Billing to individual customer', {
        userId: event.userId,
        customerId,
      });
    }

    // Create invoice item with retry — include generating user in description for org billing
    const description = isTeamBilled
      ? `${event.feature} usage - ${event.quantity}x (by ${userEmail})`
      : `${event.feature} usage - ${event.quantity}x`;

    // When a Stripe Price ID is configured, pass quantity (Stripe calculates total).
    // When no Price ID (fallback), pass total cost in cents as the quantity arg.
    const invoiceQuantity = event.stripePriceId
      ? event.quantity
      : event.unitCostSnapshot * event.quantity;

    const result = await createInvoiceItemWithRetry(
      customerId,
      event.stripePriceId,
      invoiceQuantity,
      event.idempotencyKey,
      environment,
      description
    );

    if (!result.success) {
      throw new Error(`Failed to create invoice item: ${result.error}`);
    }

    // Update event status to SENT
    await updateUsageEventStatus(firestore, usageEventId, UsageEventStatus.SENT, {
      stripeInvoiceItemId: result.invoiceItemId,
      errorMessage: undefined,
    });

    logger.info('[processUsageEvent] Event processed successfully', {
      usageEventId,
      invoiceItemId: result.invoiceItemId,
    });
  } catch (error) {
    logger.error('[processUsageEvent] Failed to process event', {
      error,
      usageEventId,
    });

    // Update event status to FAILED
    try {
      const event = await getUsageEvent(firestore, usageEventId);
      const retryCount = (event?.retryCount || 0) + 1;

      await updateUsageEventStatus(firestore, usageEventId, UsageEventStatus.FAILED, {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        retryCount,
      });
    } catch (updateError) {
      logger.error('[processUsageEvent] Failed to update error status', {
        error: updateError,
        usageEventId,
      });
    }

    // Re-throw to trigger Pub/Sub retry
    throw error;
  }
}

/**
 * Main worker function - listens to Pub/Sub subscription
 */
export async function startWorker(subscriptionName: string = 'stripe-worker-sub'): Promise<void> {
  logger.info('[startWorker] Starting Stripe worker', {
    subscriptionName,
  });

  const pubsub = new PubSub();
  const subscription = pubsub.subscription(subscriptionName);

  // Message handler
  const messageHandler = async (message: Message): Promise<void> => {
    try {
      logger.info('[messageHandler] Received message', {
        messageId: message.id,
        publishTime: message.publishTime,
      });

      // Parse message data
      const data = JSON.parse(message.data.toString()) as UsageEventMessage;

      // Process event
      await processUsageEvent(data);

      // Acknowledge message
      message.ack();

      logger.info('[messageHandler] Message processed and acknowledged', {
        messageId: message.id,
      });
    } catch (error) {
      logger.error('[messageHandler] Message processing failed', {
        error,
        messageId: message.id,
      });

      // Nack message for retry
      message.nack();
    }
  };

  // Error handler
  const errorHandler = (error: Error): void => {
    logger.error('[startWorker] Subscription error', {
      error,
    });
  };

  // Listen for messages
  subscription.on('message', messageHandler);
  subscription.on('error', errorHandler);

  logger.info('[startWorker] Worker started successfully');
}

/**
 * Graceful shutdown
 */
export async function shutdownWorker(): Promise<void> {
  logger.info('[shutdownWorker] Shutting down worker...');
  // Close Pub/Sub connections
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', shutdownWorker);
process.on('SIGINT', shutdownWorker);

// Start worker if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker().catch((error) => {
    logger.error('[startWorker] Worker startup failed', { error });
    process.exit(1);
  });
}
