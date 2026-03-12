/**
 * @fileoverview Send Notification - Create notification document
 * @module @nxt1/functions/notification/sendNotification
 *
 * Callable function to enqueue a push notification.
 * Creates a document in the `notifications` collection which triggers
 * the unified `onNotificationCreated` Cloud Function.
 *
 * NOTE: This is a convenience callable for admin/internal use.
 * Backend services should use `NotificationService.dispatch()` instead,
 * which also writes the matching activity feed document atomically.
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();

/**
 * Send notification to a user (callable — admin/internal use only).
 *
 * Prefer `NotificationService.dispatch()` from the backend for
 * feature-level notifications (it writes both activity + push atomically).
 */
export const sendNotification = onCall(async (request) => {
  const { userId, type, category, priority, title, body, data } = request.data;

  if (!userId || !title) {
    throw new HttpsError('invalid-argument', 'userId and title are required');
  }

  const notificationRef = await db.collection('notifications').add({
    userId,
    type: type || 'general',
    category: category || 'system',
    priority: priority || 'normal',
    title,
    body: body || '',
    data: data || {},
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info('Notification enqueued', {
    notificationId: notificationRef.id,
    userId,
    type,
    category,
  });
  return { notificationId: notificationRef.id };
});
