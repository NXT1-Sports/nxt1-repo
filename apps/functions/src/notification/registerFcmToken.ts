/**
 * @fileoverview Register FCM Token - Save user's push token
 * @module @nxt1/functions/notification/registerFcmToken
 *
 * Callable function to register a device's FCM token.
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();

/**
 * Register FCM token for a user
 */
export const registerFcmToken = onCall(
  {
    cors: true, // Allow CORS for web clients
    enforceAppCheck: false, // Enable in production if using App Check
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { token, platform } = request.data;
    const userId = request.auth.uid;

    if (!token) {
      throw new HttpsError('invalid-argument', 'FCM token is required');
    }

    await db
      .collection('FcmTokens')
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
  }
);
