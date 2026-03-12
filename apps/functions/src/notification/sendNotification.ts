/**
 * @fileoverview Send Notification - Admin callable to enqueue a notification
 * @module @nxt1/functions/notification/sendNotification
 *
 * Callable function for admin/internal use only.
 * Writes both the push queue doc and activity feed doc atomically via
 * the shared notifyUser helper — same guarantee as NotificationService.dispatch().
 *
 * Feature-level code should call NotificationService.dispatch() from the
 * backend instead (it also resolves deep links, truncates titles, and maps
 * notification types to activity tabs automatically).
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { notifyUser } from './notifyUser.js';

const db = admin.firestore();

/**
 * Enqueue a notification for a user (admin callable).
 * Writes both the push queue doc AND the activity feed doc atomically.
 */
export const sendNotification = onCall(async (request) => {
  const { userId, type, category, priority, title, body, data, deepLink } = request.data as {
    userId?: string;
    type?: string;
    category?: string;
    priority?: string;
    title?: string;
    body?: string;
    data?: Record<string, unknown>;
    deepLink?: string;
  };

  if (!userId || !title) {
    throw new HttpsError('invalid-argument', 'userId and title are required');
  }

  const result = await notifyUser(db, {
    userId,
    type: type ?? 'general',
    category: category ?? 'system',
    priority: priority === 'high' ? 'high' : 'normal',
    title,
    body: body ?? '',
    deepLink: deepLink ?? '',
    data: data ?? {},
  });

  logger.info('Notification enqueued', {
    notificationId: result.notificationId,
    activityId: result.activityId,
    userId,
    type,
    category,
  });

  return { notificationId: result.notificationId, activityId: result.activityId };
});
