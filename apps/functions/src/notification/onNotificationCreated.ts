/**
 * @fileoverview On Notification Created - Send push notification
 * @module @nxt1/functions/notification/onNotificationCreated
 *
 * Firestore trigger when notification document is created.
 * - Sends FCM push notification
 * - Cleans up invalid tokens
 */

import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();
const messaging = admin.messaging();

/**
 * On notification created - send push notification
 */
export const onNotificationCreatedV2 = onDocumentCreated(
  'notifications/{notificationId}',
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const notification = snapshot.data();
    const userId = notification['userId'] as string;
    const type = notification['type'] as string;
    const title = notification['title'] as string;
    const body = notification['body'] as string;
    const data = notification['data'] as Record<string, string> | undefined;

    logger.info('Notification created', { userId, type, title });

    try {
      // Get user's FCM tokens
      const tokensDoc = await db.collection('fcm_tokens').doc(userId).get();
      if (!tokensDoc.exists) {
        logger.info('No FCM tokens for user', { userId });
        return;
      }

      const tokenData = tokensDoc.data();
      const tokens = tokenData?.['tokens'] as string[] | undefined;

      if (!tokens || tokens.length === 0) {
        logger.info('Empty FCM tokens array', { userId });
        return;
      }

      // Check notification preferences
      const prefsDoc = await db.collection('notification_preferences').doc(userId).get();
      if (prefsDoc.exists) {
        const prefs = prefsDoc.data();
        if (!prefs?.['push']) {
          logger.info('Push notifications disabled for user', { userId });
          return;
        }
      }

      // Build FCM message
      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: { title, body },
        data: {
          notificationId: snapshot.id,
          type: type || 'general',
          ...data,
        },
        apns: {
          payload: { aps: { badge: 1, sound: 'default' } },
        },
        android: {
          priority: 'high',
          notification: { sound: 'default', channelId: 'default' },
        },
      };

      const response = await messaging.sendEachForMulticast(message);

      logger.info('Push notification sent', {
        userId,
        successCount: response.successCount,
        failureCount: response.failureCount,
      });

      // Clean up invalid tokens
      if (response.failureCount > 0) {
        const invalidTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;
            if (
              errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered'
            ) {
              invalidTokens.push(tokens[idx]);
            }
          }
        });

        if (invalidTokens.length > 0) {
          await db
            .collection('fcm_tokens')
            .doc(userId)
            .update({
              tokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
            });
          logger.info('Removed invalid FCM tokens', { userId, count: invalidTokens.length });
        }
      }
    } catch (error) {
      logger.error('Error sending push notification', { userId, error });
    }
  }
);
