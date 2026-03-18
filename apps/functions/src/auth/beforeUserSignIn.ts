/**
 * @fileoverview Before User Sign In - Pre-signin validation
 * @module @nxt1/functions/auth/beforeUserSignIn
 *
 * Runs before Firebase allows a sign-in.
 * - Checks if user is disabled/banned
 * - Updates last sign-in timestamp
 */

import * as admin from 'firebase-admin';
import { beforeUserSignedIn, HttpsError } from 'firebase-functions/v2/identity';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();

/**
 * Before user sign-in - validate access
 * Runs before Firebase allows the sign-in.
 */
export const beforeUserSignIn = beforeUserSignedIn(async (event) => {
  const userData = event.data;
  if (!userData) {
    logger.warn('No user data in beforeUserSignedIn event');
    return {};
  }

  const uid = userData.uid;
  const email = userData.email;
  const disabled = userData.disabled;

  logger.info('beforeUserSignIn triggered', { uid, email });

  // Check if user is disabled
  if (disabled) {
    throw new HttpsError('permission-denied', 'This account has been disabled');
  }

  // Check for banned users in Firestore
  const userDoc = await db.collection('Users').doc(uid).get();
  if (userDoc.exists) {
    const data = userDoc.data();
    if (data && data['banned']) {
      throw new HttpsError('permission-denied', 'This account has been banned');
    }
  }

  return {};
});
