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

interface TokenData {
  token: string;
  platform: string;
  addedAt: admin.firestore.Timestamp;
}

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

    const tokenPlatform = platform || 'unknown';

    // Get current tokens to check if this token already exists
    const docRef = db.collection('FcmTokens').doc(userId);
    const doc = await docRef.get();
    const existingData = doc.data();
    const existingTokens: TokenData[] = existingData?.['tokens'] || [];

    // Check if token already exists
    const tokenExists = existingTokens.some((t) => t.token === token);

    if (!tokenExists) {
      // Add new token with platform info
      await docRef.set(
        {
          tokens: admin.firestore.FieldValue.arrayUnion({
            token,
            platform: tokenPlatform,
            addedAt: admin.firestore.FieldValue.serverTimestamp(),
          }),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      logger.info('FCM token registered (new)', { userId, platform: tokenPlatform });
    } else {
      logger.info('FCM token already registered', { userId, platform: tokenPlatform });
    }

    return { success: true };
  }
);
