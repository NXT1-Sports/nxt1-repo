/**
 * @fileoverview Unregister FCM Token - Remove user's push token
 * @module @nxt1/functions/notification/unregisterFcmToken
 *
 * Callable function to unregister a device's FCM token.
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();

/**
 * Unregister FCM token for a user
 */
export const unregisterFcmToken = onCall(
  {
    cors: true, // Allow CORS for web clients
    enforceAppCheck: false, // Enable in production if using App Check
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { token } = request.data;
    const userId = request.auth.uid;

    if (!token) {
      throw new HttpsError('invalid-argument', 'FCM token is required');
    }

    await db
      .collection('FcmTokens')
      .doc(userId)
      .update({
        tokens: admin.firestore.FieldValue.arrayRemove(token),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    logger.info('FCM token unregistered', { userId });
    return { success: true };
  }
);
