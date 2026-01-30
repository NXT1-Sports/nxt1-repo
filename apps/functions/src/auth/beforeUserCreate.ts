/**
 * @fileoverview Before User Create - Pre-registration validation
 * @module @nxt1/functions/auth/beforeUserCreate
 *
 * Runs before Firebase creates a user account.
 * - Blocks disposable email domains
 * - Sets initial custom claims
 */

import { beforeUserCreated, HttpsError } from 'firebase-functions/v2/identity';
import { logger } from 'firebase-functions/v2';
import { DISPOSABLE_EMAIL_DOMAINS } from '@nxt1/core';

/**
 * Check if email domain is disposable
 */
function isDisposableDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? (DISPOSABLE_EMAIL_DOMAINS as readonly string[]).includes(domain) : false;
}

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
