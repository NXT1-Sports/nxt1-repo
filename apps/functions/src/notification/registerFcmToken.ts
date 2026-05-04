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

// Maximum tokens per platform to prevent unlimited growth
const MAX_TOKENS_PER_PLATFORM: Record<string, number> = {
  web: 3, // Multiple browsers/tabs
  ios: 2, // Multiple iOS devices
  android: 2, // Multiple Android devices
  unknown: 2,
};

/**
 * Register FCM token for a user
 *
 * Features:
 * - Supports multiple tokens per user (multi-device, multi-platform)
 * - Limits tokens per platform to prevent unlimited growth
 * - Auto-removes oldest tokens when limit exceeded
 * - Deduplicates identical tokens
 */
export const registerFcmToken = onCall(
  {
    cors: true, // Allow CORS for web clients
    enforceAppCheck: false, // Enable in production if using App Check
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const { token, platform } = request.data;
      const userId = request.auth.uid;

      if (!token) {
        throw new HttpsError('invalid-argument', 'FCM token is required');
      }

      const tokenPlatform = platform || 'unknown';

      // Get current tokens
      const docRef = db.collection('FcmTokens').doc(userId);
      const doc = await docRef.get();
      const existingData = doc.data();
      let existingTokens: TokenData[] = existingData?.['tokens'] || [];

      // Check if this exact token already exists
      const tokenExists = existingTokens.some((t) => t.token === token);

      if (tokenExists) {
        logger.info('FCM token already registered', { userId, platform: tokenPlatform });
        return { success: true };
      }

      // Add new token
      const newToken: TokenData = {
        token,
        platform: tokenPlatform,
        addedAt: admin.firestore.Timestamp.now(),
      };

      // Get tokens for this platform and enforce limit
      const platformTokens = existingTokens.filter((t) => t.platform === tokenPlatform);
      const maxTokens = MAX_TOKENS_PER_PLATFORM[tokenPlatform] || 2;

      if (platformTokens.length >= maxTokens) {
        // Remove oldest token(s) for this platform to stay within limit
        // Sort by addedAt ascending (oldest first)
        platformTokens.sort((a, b) => a.addedAt.toMillis() - b.addedAt.toMillis());

        const tokensToRemove = platformTokens.slice(0, platformTokens.length - maxTokens + 1);
        existingTokens = existingTokens.filter(
          (t) => !tokensToRemove.some((old) => old.token === t.token)
        );

        logger.info('Removed old tokens to enforce limit', {
          userId,
          platform: tokenPlatform,
          removed: tokensToRemove.length,
          limit: maxTokens,
        });
      }

      // Add new token to the list
      existingTokens.push(newToken);

      // Save updated token list
      await docRef.set(
        {
          tokens: existingTokens,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      logger.info('FCM token registered', {
        userId,
        platform: tokenPlatform,
        totalTokens: existingTokens.length,
        platformTokens: existingTokens.filter((t) => t.platform === tokenPlatform).length,
      });

      return { success: true };
    } catch (error) {
      // Expected client/auth errors (unauthenticated, invalid-argument, etc.)
      // are logged at info level — they must NOT create Error Reporting entries.
      if (error instanceof HttpsError && error.code !== 'internal') {
        logger.info('FCM token registration rejected', {
          code: error.code,
          userId: request.auth?.uid,
          platform: request.data?.platform,
        });
        throw error;
      }

      // Unexpected server-side failures — log at error level for Error Reporting.
      logger.error('Failed to register FCM token', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId: request.auth?.uid,
        platform: request.data?.platform,
      });

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError('internal', 'Failed to register FCM token');
    }
  }
);
