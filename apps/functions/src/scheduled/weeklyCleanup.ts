/**
 * @fileoverview Weekly Cleanup - Remove stale data
 * @module @nxt1/functions/scheduled/weeklyCleanup
 *
 * Runs every Sunday at midnight UTC.
 * - Deletes old read notifications (90 days)
 * - Removes expired FCM tokens (90 days)
 */

import { db } from '../firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';

const BATCH_SIZE = 250;

async function deleteQueryInBatches(query: FirebaseFirestore.Query): Promise<number> {
  let totalDeleted = 0;

  while (true) {
    const snapshot = await query.limit(BATCH_SIZE).get();
    if (snapshot.empty) {
      return totalDeleted;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    totalDeleted += snapshot.size;
  }
}

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
      const deletedNotifications = await deleteQueryInBatches(
        db.collection('Notifications').where('createdAt', '<', ninetyDaysAgo)
      );

      logger.info('Deleted processed notifications', { count: deletedNotifications });

      // Clean up expired sessions/tokens (90 days)
      const deletedTokens = await deleteQueryInBatches(
        db.collection('FcmTokens').where('updatedAt', '<', ninetyDaysAgo)
      );

      logger.info('Deleted expired FCM tokens', { count: deletedTokens });
      logger.info('Weekly cleanup complete');
    } catch (error) {
      logger.error('Weekly cleanup failed', { error });
    }
  }
);
