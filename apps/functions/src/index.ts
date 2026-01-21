/**
 * @fileoverview Firebase Cloud Functions Entry Point
 * @module @nxt1/functions
 *
 * Cloud Functions for NXT1 platform - triggers, scheduled tasks, and webhooks.
 * Uses shared @nxt1/core types for type safety across the platform.
 *
 * NOTE: This is a minimal skeleton for infrastructure setup.
 * Add function implementations as features are developed.
 */

import * as admin from 'firebase-admin';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();

// Set default options for all functions
setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10,
});

// ============================================================================
// HEALTH CHECK - Verify functions are deployed and working
// ============================================================================

/**
 * Simple health check callable function
 * Use to verify Cloud Functions deployment is working
 */
export const healthCheck = onCall(async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  };
});

/**
 * Generate unique profile slug for a user
 * This is a real utility function that will be used
 */
export const generateProfileSlug = onCall(async (request) => {
  const { firstName, lastName } = request.data;

  if (!firstName || !lastName) {
    throw new HttpsError('invalid-argument', 'First and last name required');
  }

  const baseSlug = `${firstName}-${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');

  // Check for uniqueness
  let slug = baseSlug;
  let counter = 0;

  while (true) {
    const existing = await db.collection('Users').where('slug', '==', slug).limit(1).get();

    if (existing.empty) {
      break;
    }

    counter++;
    slug = `${baseSlug}-${counter}`;
  }

  return { slug };
});
