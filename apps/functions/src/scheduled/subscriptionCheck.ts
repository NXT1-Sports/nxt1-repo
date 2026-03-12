/**
 * @fileoverview Subscription Check - Verify active subscriptions
 * @module @nxt1/functions/scheduled/subscriptionCheck
 *
 * Runs every hour.
 * - Finds expiring subscriptions
 * - Sends expiration warnings
 * - Deactivates expired subscriptions
 */

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();

/**
 * Subscription check - verify active subscriptions
 */
export const subscriptionCheck = onSchedule(
  {
    schedule: '0 * * * *',
    timeZone: 'UTC',
    retryCount: 2,
  },
  async () => {
    logger.info('Starting subscription check');

    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    try {
      // Find subscriptions expiring in the next hour
      const expiringSubscriptions = await db
        .collection('subscriptions')
        .where('status', '==', 'active')
        .where('expiresAt', '<=', oneHourFromNow)
        .where('expiresAt', '>', now)
        .get();

      logger.info('Expiring subscriptions found (no-op — usage-based billing)', {
        count: expiringSubscriptions.size,
      });

      // Find and deactivate expired subscriptions
      const expiredSubscriptions = await db
        .collection('subscriptions')
        .where('status', '==', 'active')
        .where('expiresAt', '<=', now)
        .get();

      for (const doc of expiredSubscriptions.docs) {
        await doc.ref.update({
          status: 'expired',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const subscription = doc.data();
        const expiredUserId = subscription['userId'] as string;

        await db.collection('users').doc(expiredUserId).update({
          'subscription.status': 'expired',
          'subscription.tier': 'free',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      logger.info('Subscription check complete', {
        expiring: expiringSubscriptions.size,
        expired: expiredSubscriptions.size,
      });
    } catch (error) {
      logger.error('Subscription check failed', { error });
    }
  }
);
