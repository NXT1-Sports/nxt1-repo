/**
 * @fileoverview Weekly Cleanup - Remove stale data
 * @module @nxt1/functions/scheduled/weeklyCleanup
 *
 * Runs every Sunday at midnight UTC.
 * - Deletes old read notifications (90 days)
 * - Removes expired FCM tokens (90 days)
 */

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();

/**
 * Weekly cleanup - remove stale data
 */
export const weeklyCleanup = onSchedule(
  {
    schedule: '0 0 * * 0',
    timeZone: 'UTC',
    retryCount: 2,
  },
  async () => {
    logger.info('Starting weekly cleanup job');

    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      // Delete processed notifications older than 90 days
      const oldNotifications = await db
        .collection('Notifications')
        .where('createdAt', '<', ninetyDaysAgo)
        .limit(500)
        .get();

      const batch = db.batch();
      oldNotifications.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      logger.info('Deleted processed notifications', { count: oldNotifications.size });

      // Clean up expired sessions/tokens (90 days)
      const expiredTokens = await db
        .collection('FcmTokens')
        .where('updatedAt', '<', ninetyDaysAgo)
        .limit(500)
        .get();

      const tokenBatch = db.batch();
      expiredTokens.docs.forEach((doc) => tokenBatch.delete(doc.ref));
      await tokenBatch.commit();

      logger.info('Deleted expired FCM tokens', { count: expiredTokens.size });
      logger.info('Weekly cleanup complete');
    } catch (error) {
      logger.error('Weekly cleanup failed', { error });
    }
  }
);
