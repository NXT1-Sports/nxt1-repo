/**
 * @fileoverview On User Profile Updated - Handle side effects
 * @module @nxt1/functions/user/onUserProfileUpdated
 *
 * Firestore trigger for user profile changes.
 * - Handles verification status changes
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { linkPendingRosterEntriesForUser } from './linkPendingRosterEntries';

function stableJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return '';
  }
}

function shouldAttemptPendingLink(
  beforeData: FirebaseFirestore.DocumentData,
  afterData: FirebaseFirestore.DocumentData
): boolean {
  const watchedKeys: Array<keyof FirebaseFirestore.DocumentData> = [
    'firstName',
    'lastName',
    'displayName',
    'name',
    'classOf',
    'unicode',
    'teamCode',
    'sports',
  ];

  return watchedKeys.some((key) => stableJson(beforeData[key]) !== stableJson(afterData[key]));
}

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

  if (!shouldAttemptPendingLink(beforeData, afterData)) {
    return;
  }

  await linkPendingRosterEntriesForUser({ userId, userData: afterData });
});
