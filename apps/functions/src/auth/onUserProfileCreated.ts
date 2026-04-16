/**
 * @fileoverview On User Profile Created - Initialize user data
 * @module @nxt1/functions/auth/onUserProfileCreated
 *
 * Triggered when a new user document is created in Firestore.
 * - Creates a lightweight UserAnalytics operational document
 * - Initializes notification preferences on the Users document itself
 */

import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();

/**
 * On user profile created - initialize user data
 * Triggered when a new user document is created in Firestore.
 */
export const onUserProfileCreatedV3 = onDocumentCreated('Users/{userId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    logger.warn('No data in user profile creation event');
    return;
  }

  const userId = event.params.userId;
  const userData = snapshot.data();

  logger.info('User profile created', { userId, email: userData?.['email'] });

  try {
    // Initialize lightweight live engagement counters.
    // Historical analytics and reporting are stored in Mongo.
    await db.collection('UserAnalytics').doc(userId).set({
      userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      profileViews: 0,
      totalConnections: 0,
      sportChanges: 0,
      lastActive: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Initialize notification preferences on the Users document.
    // This is a fallback — the primary path is POST /auth/profile/onboarding
    // which writes preferences when onboarding completes. This trigger
    // fires on the initial user document creation (registration) before
    // onboarding, so we only write if preferences don't exist yet.
    // Both paths use marketing: true as the canonical default.
    const userRef = db.collection('Users').doc(userId);
    const userDoc = await userRef.get();
    if (userDoc.exists) {
      const existingPrefs = userDoc.data()?.['preferences']?.['notifications'];
      if (!existingPrefs) {
        await userRef.update({
          'preferences.notifications': {
            push: true,
            email: true,
            marketing: true,
          },
        });
      }
    }

    logger.info('User initialization complete', { userId });
  } catch (error) {
    logger.error('Error initializing user data', { userId, error });
  }
});
