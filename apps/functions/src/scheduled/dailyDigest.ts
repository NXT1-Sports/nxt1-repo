/**
 * @fileoverview Daily Digest - Aggregate stats and prepare emails
 * @module @nxt1/functions/scheduled/dailyDigest
 *
 * Runs daily at 8 AM Eastern.
 * - Queues weekly digest emails (Mondays only)
 * - Aggregates daily metrics
 */

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();

/**
 * Daily digest - aggregate stats and prepare emails
 */
export const dailyDigest = onSchedule(
  {
    schedule: '0 8 * * *',
    timeZone: 'America/New_York',
    retryCount: 3,
  },
  async () => {
    logger.info('Starting daily digest job');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      // Get users who want weekly digest (on Mondays only)
      const dayOfWeek = new Date().getDay();
      if (dayOfWeek === 1) {
        const usersWantingDigest = await db
          .collection('notification_preferences')
          .where('weeklyDigest', '==', true)
          .get();

        logger.info('Users wanting weekly digest', { count: usersWantingDigest.size });

        for (const doc of usersWantingDigest.docs) {
          await db.collection('email_queue').add({
            type: 'weekly_digest',
            userId: doc.id,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      // Aggregate daily stats
      const newUsers = await db
        .collection('users')
        .where('createdAt', '>=', yesterday)
        .where('createdAt', '<', today)
        .count()
        .get();

      const activeUsers = await db
        .collection('users')
        .where('lastActive', '>=', yesterday)
        .count()
        .get();

      // Store daily metrics
      await db.collection('daily_metrics').add({
        date: yesterday.toISOString().split('T')[0],
        newUsers: newUsers.data().count,
        activeUsers: activeUsers.data().count,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info('Daily digest complete', {
        newUsers: newUsers.data().count,
        activeUsers: activeUsers.data().count,
      });
    } catch (error) {
      logger.error('Daily digest failed', { error });
    }
  }
);
