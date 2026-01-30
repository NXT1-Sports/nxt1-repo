/**
 * @fileoverview On User Profile Created - Initialize user data
 * @module @nxt1/functions/auth/onUserProfileCreated
 *
 * Triggered when a new user document is created in Firestore.
 * - Creates user_analytics document
 * - Creates notification_preferences document
 */

import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();

/**
 * On user profile created - initialize user data
 * Triggered when a new user document is created in Firestore.
 */
export const onUserProfileCreatedV2 = onDocumentCreated('users/{userId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    logger.warn('No data in user profile creation event');
    return;
  }

  const userId = event.params.userId;
  const userData = snapshot.data();

  logger.info('User profile created', { userId, email: userData?.['email'] });

  try {
    // Initialize analytics tracking
    await db.collection('user_analytics').doc(userId).set({
      userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      profileViews: 0,
      totalConnections: 0,
      lastActive: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Initialize notification preferences
    await db.collection('notification_preferences').doc(userId).set({
      userId,
      email: true,
      push: true,
      sms: false,
      marketing: false,
      weeklyDigest: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info('User initialization complete', { userId });
  } catch (error) {
    logger.error('Error initializing user data', { userId, error });
  }
});
