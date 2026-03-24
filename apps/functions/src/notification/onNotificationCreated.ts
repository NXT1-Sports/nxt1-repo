/**
 * @fileoverview On Notification Created — Unified Push Processor
 * @module @nxt1/functions/notification/onNotificationCreated
 *
 * The SINGLE Cloud Function responsible for all push delivery on the platform.
 * Triggered when ANY feature writes a document to the `notifications` collection
 * via the backend's unified `NotificationService.dispatch()`.
 *
 * Processing pipeline:
 *  1. Read notification payload (userId, type, category, title, body, data)
 *  2. Fetch user's FCM tokens from `FcmTokens/{userId}`
 *  3. Check user preferences: global kill-switch + per-category opt-out
 *  4. Build platform-specific FCM message (APNS badge/sound, Android channel)
 *  5. Send via `sendEachForMulticast`
 *  6. Clean up invalid tokens automatically
 *  7. Update notification doc with delivery status
 */

import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();
const messaging = admin.messaging();

interface TokenData {
  token: string;
  platform: string;
  addedAt: admin.firestore.Timestamp;
}

/**
 * Category-aware notification preferences stored in `notification_preferences/{userId}`.
 * The schema supports both the legacy flat format and the new category-level format.
 */
interface NotificationPreferences {
  /** Global push kill-switch (legacy + current) */
  push?: boolean;
  /** Per-category granular preferences (2026 schema) */
  categories?: Record<string, { push?: boolean; email?: boolean; sms?: boolean }>;
}

/**
 * On notification created — unified push processor.
 *
 * Every push notification on the entire NXT1 platform flows through this
 * single function. Features never call FCM directly.
 */
export const onNotificationCreatedV2 = onDocumentCreated(
  'notifications/{notificationId}',
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const notification = snapshot.data();
    const notificationId = event.params.notificationId;
    const userId = notification['userId'] as string;
    const type = notification['type'] as string;
    const category = notification['category'] as string | undefined;
    const priority = notification['priority'] as string | undefined;
    const title = notification['title'] as string;
    const body = notification['body'] as string;
    const data = notification['data'] as Record<string, string> | undefined;

    logger.info('Processing notification', { notificationId, userId, type, category });

    try {
      // ─── 1. Fetch FCM tokens ──────────────────────────────────────
      const tokensDoc = await db.collection('FcmTokens').doc(userId).get();
      if (!tokensDoc.exists) {
        logger.info('No FCM tokens registered', { userId });
        await updateStatus(notificationId, 'skipped', 'No FCM tokens');
        return;
      }

      const tokenData = tokensDoc.data();
      const tokenObjects = tokenData?.['tokens'] as (string | TokenData)[] | undefined;

      if (!tokenObjects || tokenObjects.length === 0) {
        logger.info('Empty FCM tokens array', { userId });
        await updateStatus(notificationId, 'skipped', 'Empty token array');
        return;
      }

      // Extract token strings (support both old string format and new object format)
      const tokens = tokenObjects.map((t) => (typeof t === 'string' ? t : t.token));

      // ─── 2. Check notification preferences ────────────────────────
      const prefsDoc = await db.collection('notification_preferences').doc(userId).get();
      if (prefsDoc.exists) {
        const prefs = prefsDoc.data() as NotificationPreferences;

        // Global kill-switch
        if (prefs.push === false) {
          logger.info('Push disabled globally for user', { userId });
          await updateStatus(notificationId, 'skipped', 'Push disabled globally');
          return;
        }

        // Per-category opt-out (if categories are configured)
        if (category && prefs.categories) {
          const categoryPref = prefs.categories[category];
          if (categoryPref && categoryPref.push === false) {
            logger.info('Push disabled for category', { userId, category });
            await updateStatus(notificationId, 'skipped', `Category "${category}" disabled`);
            return;
          }
        }
      }

      // ─── 3. Build FCM message ─────────────────────────────────────
      const isHighPriority = priority === 'high' || priority === 'urgent';
      const imageUrl = data?.['imageUrl'] as string | undefined;

      // ─── 3a. Compute real unread count for native app icon badge ──
      // Query the user's activity feed for unread, non-archived items.
      // This is the same data model the backend's GET /activity/badges uses:
      //   users/{userId}/activity where isRead === false && isArchived === false
      let unreadCount = 1; // Fallback if query fails
      try {
        const activitySnapshot = await db
          .collection('Users')
          .doc(userId)
          .collection('activity')
          .where('isRead', '==', false)
          .where('isArchived', '==', false)
          .count()
          .get();
        unreadCount = activitySnapshot.data().count;
        logger.info('Computed unread badge count', { userId, unreadCount });
      } catch (badgeError) {
        logger.warn('Failed to compute badge count, using fallback', { userId, badgeError });
      }

      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title,
          body,
          ...(imageUrl ? { imageUrl } : {}),
        },
        data: {
          notificationId,
          type: type || 'general',
          ...(data ?? {}),
        },
        apns: {
          payload: {
            aps: {
              badge: unreadCount,
              sound: isHighPriority ? 'default' : 'default',
              'thread-id': category || 'general',
            },
          },
        },
        android: {
          priority: isHighPriority ? 'high' : 'normal',
          notification: {
            sound: 'default',
            channelId: isHighPriority ? 'high_priority' : 'default',
            notificationCount: unreadCount,
          },
        },
      };

      // ─── 4. Send push ─────────────────────────────────────────────
      const response = await messaging.sendEachForMulticast(message);

      logger.info('Push notification delivered', {
        notificationId,
        userId,
        type,
        category,
        successCount: response.successCount,
        failureCount: response.failureCount,
      });

      // ─── 5. Clean up invalid tokens ───────────────────────────────
      if (response.failureCount > 0) {
        const invalidTokenObjects: (string | TokenData)[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;
            if (
              errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered'
            ) {
              invalidTokenObjects.push(tokenObjects[idx]);
            }
          }
        });

        if (invalidTokenObjects.length > 0) {
          await db
            .collection('FcmTokens')
            .doc(userId)
            .update({
              tokens: admin.firestore.FieldValue.arrayRemove(...invalidTokenObjects),
            });
          logger.info('Removed invalid FCM tokens', {
            userId,
            count: invalidTokenObjects.length,
          });
        }
      }

      // ─── 6. Update delivery status ────────────────────────────────
      await updateStatus(
        notificationId,
        response.successCount > 0 ? 'sent' : 'failed',
        response.failureCount > 0
          ? `${response.failureCount}/${tokens.length} devices failed`
          : undefined
      );
    } catch (error) {
      logger.error('Error processing push notification', {
        notificationId,
        userId,
        error,
      });
      await updateStatus(notificationId, 'failed', String(error));
    }
  }
);

/**
 * Update the notification document with delivery status.
 * Never throws — logging only. Status tracking is best-effort.
 */
async function updateStatus(
  notificationId: string,
  status: string,
  statusDetail?: string
): Promise<void> {
  try {
    await db
      .collection('notifications')
      .doc(notificationId)
      .update({
        status,
        ...(statusDetail ? { statusDetail } : {}),
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  } catch {
    // Status update is non-critical — just log
    logger.warn('Failed to update notification status', { notificationId, status });
  }
}
