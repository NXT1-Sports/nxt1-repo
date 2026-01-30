/**
 * @fileoverview Delete User Account
 * @module @nxt1/functions/util/deleteUserAccount
 *
 * Deletes user's Firebase Auth account (GDPR compliance).
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

/**
 * Delete user account and all associated data
 */
export const deleteUserAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = request.auth.uid;

  logger.info('User account deletion requested', { userId });

  try {
    await admin.auth().deleteUser(userId);
    logger.info('User account deleted', { userId });
    return { success: true };
  } catch (error) {
    logger.error('Failed to delete user account', { userId, error });
    throw new HttpsError('internal', 'Failed to delete account');
  }
});
