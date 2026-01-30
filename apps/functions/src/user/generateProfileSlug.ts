/**
 * @fileoverview Generate Profile Slug - SEO-friendly URLs
 * @module @nxt1/functions/user/generateProfileSlug
 *
 * Callable function for creating unique, SEO-friendly profile URLs.
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();

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
