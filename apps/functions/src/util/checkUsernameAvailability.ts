/**
 * @fileoverview Check Username Availability
 * @module @nxt1/functions/util/checkUsernameAvailability
 *
 * Validates username format and availability.
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { RESERVED_USERNAMES, FIELD_LENGTHS, VALIDATION_PATTERNS } from '../constants';

const db = admin.firestore();

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
