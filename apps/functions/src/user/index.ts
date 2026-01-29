/**
 * @fileoverview User Triggers - Profile & Data Changes
 * @module @nxt1/functions/user
 * @version 1.0.0
 *
 * Firestore triggers for user data changes:
 * - Profile updates (slug generation, completeness)
 * - User deletion cleanup
 */

import * as admin from 'firebase-admin';
import { onDocumentUpdated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();

// ============================================
// PROFILE SLUG GENERATION
// ============================================

/**
 * Generate unique profile slug for a user
 * Callable function for creating SEO-friendly URLs.
 */
export const generateProfileSlug = onCall(async (request) => {
  const { firstName, lastName, userId } = request.data;

  if (!firstName || !lastName) {
    throw new HttpsError('invalid-argument', 'First name and last name are required');
  }

  // Generate base slug
  const baseSlug = `${firstName}-${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .substring(0, 50);

  // Check for uniqueness and add suffix if needed
  let slug = baseSlug;
  let counter = 1;
  let isUnique = false;

  while (!isUnique) {
    const existing = await db.collection('users').where('profileSlug', '==', slug).limit(1).get();

    if (existing.empty) {
      isUnique = true;
    } else {
      const existingDoc = existing.docs[0];
      if (existingDoc.id === userId) {
        isUnique = true;
      } else {
        counter++;
        slug = `${baseSlug}-${counter}`;
      }
    }

    if (counter > 100) {
      slug = `${baseSlug}-${Date.now()}`;
      isUnique = true;
    }
  }

  logger.info('Generated profile slug', { userId, slug });
  return { slug };
});

// ============================================
// PROFILE UPDATE TRIGGERS
// ============================================

/**
 * On user profile updated - handle side effects
 */
export const onUserProfileUpdated = onDocumentUpdated('users/{userId}', async (event) => {
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
    await db.collection('users').doc(userId).update({
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

/**
 * On user deleted - cleanup related data
 */
export const onUserDeleted = onDocumentDeleted('users/{userId}', async (event) => {
  const userId = event.params.userId;

  logger.info('User deleted, cleaning up data', { userId });

  try {
    const batch = db.batch();

    batch.delete(db.collection('user_analytics').doc(userId));
    batch.delete(db.collection('notification_preferences').doc(userId));

    const posts = await db.collection('posts').where('userId', '==', userId).limit(500).get();

    posts.docs.forEach((doc) => batch.delete(doc.ref));

    await batch.commit();

    logger.info('User cleanup complete', { userId, postsDeleted: posts.size });
  } catch (error) {
    logger.error('Error cleaning up user data', { userId, error });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate profile completeness percentage
 */
function calculateProfileCompleteness(userData: FirebaseFirestore.DocumentData): number {
  const fields = [
    'displayName',
    'photoURL',
    'bio',
    'primarySport',
    'positions',
    'location',
    'highSchool',
    'graduationYear',
    'height',
    'weight',
    'gpa',
  ];

  const filledFields = fields.filter((field) => {
    const value = userData[field];
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined && value !== '';
  });

  return Math.round((filledFields.length / fields.length) * 100);
}
