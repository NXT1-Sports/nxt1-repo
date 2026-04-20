/**
 * @fileoverview On User Profile Updated - Handle side effects
 * @module @nxt1/functions/user/onUserProfileUpdated
 *
 * Firestore trigger for user profile changes.
 * - Handles verification status changes
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

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

  // Handle verification status change
  const wasVerified = beforeData['verified'] as boolean | undefined;
  const isVerified = afterData['verified'] as boolean | undefined;

  if (!wasVerified && isVerified) {
    logger.info('User verified', { userId });
  }
});
