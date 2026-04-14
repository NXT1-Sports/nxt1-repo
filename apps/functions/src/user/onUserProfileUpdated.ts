/**
 * @fileoverview On User Profile Updated - Handle side effects
 * @module @nxt1/functions/user/onUserProfileUpdated
 *
 * Firestore trigger for user profile changes.
 * - Tracks profile completeness
 * - Logs sport changes
 * - Handles verification status changes
 */

import * as admin from 'firebase-admin';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { calculateProfileCompleteness } from './helpers';

const db = admin.firestore();

/**
 * On user profile updated - handle side effects
 */
export const onUserProfileUpdatedV3 = onDocumentUpdated('Users/{userId}', async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();
  const userId = event.params.userId;

  if (!beforeData || !afterData) {
    logger.warn('Missing data in profile update', { userId });
    return;
  }

  // Track profile completeness
  const completeness = calculateProfileCompleteness(afterData);
  const prevCompleteness = beforeData['profileCompleteness'] as number | undefined;

  if (completeness !== prevCompleteness) {
    await db.collection('Users').doc(userId).update({
      profileCompleteness: completeness,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info('Profile completeness updated', { userId, completeness });
  }

  // Update analytics on sport change
  const beforeSport = beforeData['primarySport'] as string | undefined;
  const afterSport = afterData['primarySport'] as string | undefined;

  if (beforeSport !== afterSport) {
    await db
      .collection('user_analytics')
      .doc(userId)
      .update({
        sportChanges: admin.firestore.FieldValue.increment(1),
        lastSportChange: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  // Handle verification status change
  const wasVerified = beforeData['verified'] as boolean | undefined;
  const isVerified = afterData['verified'] as boolean | undefined;

  if (!wasVerified && isVerified) {
    logger.info('User verified', { userId });
  }
});
