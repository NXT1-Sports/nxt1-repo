/**
 * @fileoverview Scheduled Tasks - Cron Jobs
 * @module @nxt1/functions/scheduled
 * @version 1.0.0
 *
 * Scheduled functions for periodic tasks:
 * - Daily digest
 * - Weekly cleanup
 * - Subscription checks
 */

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();

// ============================================
// DAILY TASKS (runs at 8 AM UTC)
// ============================================

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

// ============================================
// WEEKLY TASKS (runs Sunday at midnight)
// ============================================

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

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      // Delete old read notifications
      const oldNotifications = await db
        .collection('notifications')
        .where('read', '==', true)
        .where('createdAt', '<', thirtyDaysAgo)
        .limit(500)
        .get();

      const batch = db.batch();
      oldNotifications.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      logger.info('Deleted old notifications', { count: oldNotifications.size });

      // Clean up expired sessions/tokens (90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const expiredTokens = await db
        .collection('fcm_tokens')
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

// ============================================
// HOURLY TASKS
// ============================================

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

      logger.info('Expiring subscriptions found', { count: expiringSubscriptions.size });

      // Send expiration warnings
      for (const doc of expiringSubscriptions.docs) {
        const subscription = doc.data();
        const subscriptionUserId = subscription['userId'] as string;

        await db.collection('notifications').add({
          userId: subscriptionUserId,
          type: 'subscription_expiring',
          title: 'Subscription Expiring Soon',
          body: 'Your subscription will expire in less than an hour. Renew now to keep access.',
          data: { subscriptionId: doc.id },
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

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
