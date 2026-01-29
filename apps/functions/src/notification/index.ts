/**
 * @fileoverview Notification Triggers - Push & Email
 * @module @nxt1/functions/notification
 * @version 1.0.0
 *
 * Handles all notification-related triggers:
 * - Push notifications via FCM
 * - FCM token management
 */

import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();
const messaging = admin.messaging();

// ============================================
// NOTIFICATION CREATION TRIGGER
// ============================================

/**
 * On notification created - send push notification
 */
export const onNotificationCreated = onDocumentCreated(
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

// ============================================
// FCM TOKEN MANAGEMENT
// ============================================

/**
 * Register FCM token for a user
 */
export const registerFcmToken = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  const { token, platform } = request.data;
  const userId = request.auth.uid;

  if (!token) {
    throw new HttpsError('invalid-argument', 'FCM token is required');
  }

  await db
    .collection('fcm_tokens')
    .doc(userId)
    .set(
      {
        tokens: admin.firestore.FieldValue.arrayUnion(token),
        platform: platform || 'unknown',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  logger.info('FCM token registered', { userId, platform });
  return { success: true };
});

/**
 * Unregister FCM token for a user
 */
export const unregisterFcmToken = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  const { token } = request.data;
  const userId = request.auth.uid;

  if (!token) {
    throw new HttpsError('invalid-argument', 'FCM token is required');
  }

  await db
    .collection('fcm_tokens')
    .doc(userId)
    .update({
      tokens: admin.firestore.FieldValue.arrayRemove(token),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  logger.info('FCM token unregistered', { userId });
  return { success: true };
});

/**
 * Send notification to a user (callable from backend)
 */
export const sendNotification = onCall(async (request) => {
  const { userId, type, title, body, data } = request.data;

  if (!userId || !title) {
    throw new HttpsError('invalid-argument', 'userId and title are required');
  }

  const notificationRef = await db.collection('notifications').add({
    userId,
    type: type || 'general',
    title,
    body: body || '',
    data: data || {},
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info('Notification created', { notificationId: notificationRef.id, userId });
  return { notificationId: notificationRef.id };
});
