/**
 * @fileoverview Validate Email
 * @module @nxt1/functions/util/validateEmail
 *
 * Validates email format, disposable domains, and availability.
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { DISPOSABLE_EMAIL_DOMAINS, VALIDATION_PATTERNS } from '@nxt1/core';

const db = admin.firestore();

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
