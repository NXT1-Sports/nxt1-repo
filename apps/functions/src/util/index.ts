/**
 * @fileoverview Utility Functions - Callable Helpers
 * @module @nxt1/functions/util
 * @version 1.0.0
 *
 * Utility/callable functions for various platform needs:
 * - Health checks
 * - Data validation
 * - Search indexing
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import {
  DISPOSABLE_EMAIL_DOMAINS,
  RESERVED_USERNAMES,
  FIELD_LENGTHS,
  VALIDATION_PATTERNS,
} from '@nxt1/core';

const db = admin.firestore();

// ============================================
// HEALTH CHECK
// ============================================

/**
 * Simple health check callable function
 */
export const healthCheck = onCall(async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    environment: process.env['NODE_ENV'] || 'production',
  };
});

/**
 * HTTP health check endpoint for monitoring
 */
export const healthCheckHttp = onRequest(async (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  });
});

// ============================================
// DATA VALIDATION
// ============================================

/**
 * Validate username availability
 */
export const checkUsernameAvailability = onCall(async (request) => {
  const { username } = request.data;

  if (!username || typeof username !== 'string') {
    throw new HttpsError('invalid-argument', 'Username is required');
  }

  const normalizedUsername = username.toLowerCase().trim();
  const { min, max } = FIELD_LENGTHS.USERNAME;

  if (normalizedUsername.length < min || normalizedUsername.length > max) {
    return { available: false, reason: `Username must be ${min}-${max} characters` };
  }

  if (!VALIDATION_PATTERNS.USERNAME.test(normalizedUsername)) {
    return {
      available: false,
      reason: 'Username can only contain letters, numbers, and underscores',
    };
  }

  if ((RESERVED_USERNAMES as readonly string[]).includes(normalizedUsername)) {
    return { available: false, reason: 'This username is reserved' };
  }

  const existing = await db
    .collection('users')
    .where('username', '==', normalizedUsername)
    .limit(1)
    .get();

  if (!existing.empty) {
    return { available: false, reason: 'Username is already taken' };
  }

  return { available: true };
});

/**
 * Validate email for registration
 */
export const validateEmail = onCall(async (request) => {
  const { email } = request.data;

  if (!email || typeof email !== 'string') {
    throw new HttpsError('invalid-argument', 'Email is required');
  }

  const normalizedEmail = email.toLowerCase().trim();

  if (!VALIDATION_PATTERNS.EMAIL.test(normalizedEmail)) {
    return { valid: false, reason: 'Invalid email format' };
  }

  const domain = normalizedEmail.split('@')[1];
  if ((DISPOSABLE_EMAIL_DOMAINS as readonly string[]).includes(domain)) {
    return { valid: false, reason: 'Please use a valid email address' };
  }

  const existing = await db
    .collection('users')
    .where('email', '==', normalizedEmail)
    .limit(1)
    .get();

  if (!existing.empty) {
    return { valid: false, reason: 'Email is already registered' };
  }

  return { valid: true };
});

// ============================================
// SEARCH INDEXING
// ============================================

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

// ============================================
// ACCOUNT DELETION
// ============================================

/**
 * Delete user account and all associated data
 */
export const deleteUserAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = request.auth.uid;

  logger.info('User account deletion requested', { userId });

  try {
    await admin.auth().deleteUser(userId);
    logger.info('User account deleted', { userId });
    return { success: true };
  } catch (error) {
    logger.error('Failed to delete user account', { userId, error });
    throw new HttpsError('internal', 'Failed to delete account');
  }
});
