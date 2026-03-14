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

interface TokenData {
  token: string;
  platform: string;
  addedAt: admin.firestore.Timestamp;
}

/**
 * Unregister FCM token for a user
 */
export const unregisterFcmToken = onCall(
  {
    cors: true, // Allow CORS for web clients
    enforceAppCheck: false, // Enable in production if using App Check
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const { token } = request.data;
      const userId = request.auth.uid;

      if (!token) {
        throw new HttpsError('invalid-argument', 'FCM token is required');
      }

      // Get current tokens to find and remove the matching token object
      const docRef = db.collection('FcmTokens').doc(userId);
      const doc = await docRef.get();
      if (!doc.exists) {
        logger.info('No FCM tokens document', { userId });
        return { success: true };
      }

      const existingData = doc.data();
      const existingTokens: TokenData[] = existingData?.['tokens'] || [];

      // Find the token object to remove
      const tokenToRemove = existingTokens.find((t) => t.token === token);

      if (tokenToRemove) {
        await docRef.update({
          tokens: admin.firestore.FieldValue.arrayRemove(tokenToRemove),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        logger.info('FCM token unregistered', { userId });
      } else {
        logger.info('FCM token not found', { userId });
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to unregister FCM token', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId: request.auth?.uid,
      });

      // Re-throw HttpsErrors as-is, wrap others
      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError('internal', 'Failed to unregister FCM token');
    }
  }
);
