/**
 * @fileoverview Build Search Index
 * @module @nxt1/functions/util/buildSearchIndex
 *
 * Builds search tokens for user profile discovery.
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();

/**
 * Build search index for a user profile
 */
export const buildSearchIndex = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = request.auth.uid;

  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'User not found');
  }

  const userData = userDoc.data()!;
  const searchTokens: string[] = [];

  // Name tokens
  const displayName = userData['displayName'] as string | undefined;
  if (displayName) {
    const nameParts = displayName.toLowerCase().split(/\s+/);
    searchTokens.push(...nameParts);
    nameParts.forEach((part: string) => {
      for (let i = 1; i <= part.length; i++) {
        searchTokens.push(part.substring(0, i));
      }
    });
  }

  // Sport tokens
  const primarySport = userData['primarySport'] as string | undefined;
  if (primarySport) {
    searchTokens.push(primarySport.toLowerCase());
  }

  // Location tokens
  const location = userData['location'] as { city?: string; state?: string } | undefined;
  if (location?.city) {
    searchTokens.push(location.city.toLowerCase());
  }
  if (location?.state) {
    searchTokens.push(location.state.toLowerCase());
  }

  // High school tokens
  const highSchool = userData['highSchool'] as string | undefined;
  if (highSchool) {
    const schoolParts = highSchool.toLowerCase().split(/\s+/);
    searchTokens.push(...schoolParts);
  }

  // Dedupe and store
  const uniqueTokens = [...new Set(searchTokens)];

  await db.collection('users').doc(userId).update({
    searchTokens: uniqueTokens,
    searchUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info('Search index built', { userId, tokenCount: uniqueTokens.length });
  return { success: true, tokenCount: uniqueTokens.length };
});
