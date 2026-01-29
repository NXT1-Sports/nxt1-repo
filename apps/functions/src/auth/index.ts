/**
 * @fileoverview Auth Triggers - User Lifecycle Events
 * @module @nxt1/functions/auth
 * @version 1.0.0
 *
 * Firebase Auth triggers for user lifecycle management:
 * - beforeCreate: Pre-registration validation
 * - beforeSignIn: Pre-signin validation
 * - onUserProfileCreated: Initialize user data in Firestore
 */

import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { beforeUserCreated, beforeUserSignedIn, HttpsError } from 'firebase-functions/v2/identity';
import { logger } from 'firebase-functions/v2';
import { DISPOSABLE_EMAIL_DOMAINS } from '@nxt1/core';

const db = admin.firestore();

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if email domain is disposable
 */
function isDisposableDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? (DISPOSABLE_EMAIL_DOMAINS as readonly string[]).includes(domain) : false;
}

// ============================================
// IDENTITY TRIGGERS
// ============================================

/**
 * Before user creation - validate and enrich
 * Runs before Firebase creates the user account.
 */
export const beforeUserCreate = beforeUserCreated(async (event) => {
  const userData = event.data;
  if (!userData) {
    logger.warn('No user data in beforeUserCreated event');
    return {};
  }

  const email = userData.email;
  const displayName = userData.displayName;
  const photoURL = userData.photoURL;

  logger.info('beforeUserCreate triggered', { email, displayName });

  // Block disposable email domains
  if (email && isDisposableDomain(email)) {
    throw new HttpsError('invalid-argument', 'Disposable email addresses are not allowed');
  }

  // Return enriched user data
  return {
    displayName: displayName || email?.split('@')[0],
    photoURL: photoURL || undefined,
    customClaims: {
      role: 'user',
      createdAt: new Date().toISOString(),
    },
  };
});

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
  const userDoc = await db.collection('users').doc(uid).get();
  if (userDoc.exists) {
    const data = userDoc.data();
    if (data && data['banned']) {
      throw new HttpsError('permission-denied', 'This account has been banned');
    }
  }

  // Update last sign-in timestamp
  await db
    .collection('users')
    .doc(uid)
    .set({ lastSignIn: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  return {};
});

// ============================================
// FIRESTORE TRIGGERS
// ============================================

/**
 * On user profile created - initialize user data
 * Triggered when a new user document is created in Firestore.
 */
export const onUserProfileCreated = onDocumentCreated('users/{userId}', async (event) => {
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
