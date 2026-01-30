/**
 * @fileoverview Send Notification - Create notification document
 * @module @nxt1/functions/notification/sendNotification
 *
 * Callable function to send a notification to a user.
 * Creates notification document which triggers push via onNotificationCreated.
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();

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
