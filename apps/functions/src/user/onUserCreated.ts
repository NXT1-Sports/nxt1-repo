/**
 * @fileoverview User Created Trigger - Auto-assign Unicode
 * @module @nxt1/functions/user/onUserCreated
 * @version 1.0.0
 *
 * Automatically generates and assigns a unique 6-digit unicode
 * identifier when a new user document is created.
 *
 * Trigger: onDocumentCreated (Firestore Users collection)
 * Processing: Background (non-blocking)
 * Retries: Automatic (Firebase default)
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { generateUnicodeForUser } from './generateUnicode';
import { linkPendingRosterEntriesForUser } from './linkPendingRosterEntries';

/**
 * Cloud Function: Auto-assign unicode when user is created
 *
 * Triggered whenever a new document is created in the Users collection.
 * Generates a unique 6-digit unicode and updates the user document.
 *
 * @example
 * // Triggered automatically by Firestore:
 * // POST /auth/signup → Backend creates user → Trigger fires → Unicode assigned
 */
export const onUserCreatedV3 = onDocumentCreated(
  {
    document: 'Users/{userId}',
    region: 'us-central1',
    maxInstances: 10,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (event) => {
    const userId = event.params['userId'];
    const snapshot = event.data;

    if (!snapshot) {
      logger.warn('No data in user created event', { userId });
      return;
    }

    const userData = snapshot.data();

    // Skip unicode generation if already present (idempotency), but still
    // attempt pending roster auto-linking.
    if (userData?.['unicode']) {
      logger.info('User already has unicode, skipping generation', {
        userId,
        unicode: userData['unicode'],
      });

      await linkPendingRosterEntriesForUser({ userId, userData });
      return;
    }

    logger.info('New user created, generating unicode', { userId });

    try {
      const unicode = await generateUnicodeForUser(userId);

      logger.info('Unicode successfully assigned', {
        userId,
        unicode,
        email: userData?.['email'],
      });

      const refreshed = await snapshot.ref.get();
      const refreshedData = refreshed.data();
      if (refreshedData) {
        await linkPendingRosterEntriesForUser({ userId, userData: refreshedData });
      }
    } catch (error) {
      logger.error('Failed to generate unicode for user', {
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Error will be retried automatically by Firebase
      throw error;
    }
  }
);
