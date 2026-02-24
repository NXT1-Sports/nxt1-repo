/**
 * @fileoverview Before User Create - Pre-registration validation & user bootstrapping
 * @module @nxt1/functions/auth/beforeUserCreate
 *
 * Runs before Firebase creates a user account.
 * - Blocks disposable email domains
 * - Sets initial custom claims
 * - Creates Firestore user document (V2 schema) for OAuth providers ONLY when
 *   OAuth tokens (Gmail / Microsoft refresh tokens) need to be persisted.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Email / Password sign-up                                           │
 * │  → NO Firestore write here.                                         │
 * │    POST /auth/create-user (backend) creates the doc with V2 schema. │
 * │    Writing here would cause a 409 conflict on that endpoint.        │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  Google (gmail.send scope + refresh token present)                  │
 * │  Microsoft (refresh token present)                                  │
 * │  → Write V2 doc NOW because the token is only available here.       │
 * │    Backend /create-user call will see an existing doc and skip.     │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  Apple                                                              │
 * │  → Write base V2 doc here (no token available, but frontend does    │
 * │    NOT call POST /auth/create-user after Apple sign-in).            │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  Google (no token) or any other provider                            │
 * │  → NO write here. Backend /create-user handles doc creation.        │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * V2 document schema (mirrors UserV2Document in backend/src/routes/auth.routes.ts):
 *   email, onboardingCompleted, createdAt, updatedAt, _schemaVersion
 *   + OAuth-specific: connectedEmail, connectedGmailToken | connectedMicrosoftToken
 */

import { beforeUserCreated, HttpsError } from 'firebase-functions/v2/identity';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { DISPOSABLE_EMAIL_DOMAINS, USER_SCHEMA_VERSION } from '../constants';

const db = admin.firestore();

/**
 * Check if email domain is disposable
 */
function isDisposableDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? (DISPOSABLE_EMAIL_DOMAINS as readonly string[]).includes(domain) : false;
}

/**
 * Build a V2-compatible base user document.
 * Matches the structure created by POST /auth/create-user in the backend.
 * NOTE: `uid` is intentionally NOT stored on the document (Firestore doc ID is the uid).
 */
function buildV2User(email: string): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    email,
    onboardingCompleted: false,
    createdAt: now,
    updatedAt: now,
    _schemaVersion: USER_SCHEMA_VERSION,
  };
}

/**
 * Before user creation - validate and enrich.
 * Runs before Firebase creates the user account.
 */
export const beforeUserCreate = beforeUserCreated(async (event) => {
  logger.info('[beforeUserCreate] Event received', { credential: !!event.credential });

  const userData = event.data;
  if (!userData) {
    logger.warn('[beforeUserCreate] No user data in event');
    return {};
  }

  const email = (userData.providerData?.[0]?.email ?? userData.email) as string | undefined;
  const displayName = userData.displayName;
  const photoURL = userData.photoURL;
  const uid = userData.uid;

  logger.info('[beforeUserCreate] Triggered', { email, displayName, uid });

  // Block disposable email domains
  if (email && isDisposableDomain(email)) {
    throw new HttpsError('invalid-argument', 'Disposable email addresses are not allowed');
  }

  const credential = event.credential;
  const providerId = credential?.providerId;

  // ------------------------------------------------------------------
  // Email / Password  →  No Firestore write.
  // POST /auth/create-user (backend) is called by the frontend after
  // createUserWithEmailAndPassword succeeds and owns doc creation.
  // ------------------------------------------------------------------
  if (!credential) {
    logger.info(
      '[beforeUserCreate] Email/password sign-up – skipping Firestore write (backend handles it)',
      { uid }
    );
  } else {
    // ------------------------------------------------------------------
    // OAuth providers  →  Only write to Firestore when we have tokens
    // that cannot be retrieved later (OAuth refresh tokens are one-time).
    // ------------------------------------------------------------------
    try {
      if (providerId === 'google.com' && uid && email) {
        const refreshToken = credential.refreshToken;
        const grantedScopes: string =
          (event.additionalUserInfo?.profile as Record<string, string> | undefined)?.[
            'granted_scopes'
          ] ?? '';
        const hasSendEmailPermission = grantedScopes.includes('gmail.send');

        if (hasSendEmailPermission && refreshToken) {
          // Write V2 doc with Gmail token – this is the ONLY opportunity to store it.
          const newUser = buildV2User(email);
          newUser['connectedEmail'] = email;
          newUser['connectedGmailToken'] = refreshToken;

          await db.collection('Users').doc(uid).set(newUser);
          logger.info('[beforeUserCreate] Google – V2 doc created with Gmail refresh token', {
            uid,
          });
        } else {
          // No token to save – backend /create-user will create the standard V2 doc.
          if (hasSendEmailPermission) {
            logger.info(
              '[beforeUserCreate] Google – gmail.send scope but no refresh token, skipping write',
              { uid }
            );
          } else {
            logger.info(
              '[beforeUserCreate] Google – no gmail.send scope, skipping write (backend handles it)',
              { uid }
            );
          }
        }
      } else if (providerId === 'microsoft.com' && uid && email) {
        const refreshToken = credential.refreshToken;

        if (refreshToken) {
          // Write V2 doc with Microsoft token – one-time opportunity.
          const newUser = buildV2User(email);
          newUser['connectedEmail'] = email;
          newUser['connectedMicrosoftToken'] = refreshToken;

          await db.collection('Users').doc(uid).set(newUser);
          logger.info('[beforeUserCreate] Microsoft – V2 doc created with refresh token', { uid });
        } else {
          // No token – backend /create-user handles doc creation.
          logger.info(
            '[beforeUserCreate] Microsoft – no refresh token, skipping write (backend handles it)',
            { uid }
          );
        }
      } else if (providerId === 'apple.com' && uid && email) {
        // Apple – no refresh token available from beforeUserCreate, but the frontend
        // does NOT call POST /auth/create-user after Apple sign-in, so we must create
        const newUser = buildV2User(email);
        await db.collection('Users').doc(uid).set(newUser);
        logger.info('[beforeUserCreate] Apple – base V2 doc created (no token)', { uid });
      } else {
        // Other unknown provider – no tokens to capture; backend handles doc creation.
        logger.info(
          '[beforeUserCreate] Provider has no tokens to capture, skipping write (backend handles it)',
          { uid, providerId }
        );
      }
    } catch (err) {
      // Log but do not rethrow – a Firestore failure must not block account creation.
      logger.error('[beforeUserCreate] Firestore write failed', { err, uid, providerId });
    }
  }

  // ------------------------------------------------------------------
  // Return enriched auth data (custom claims, display name, photo).
  // These are applied to the Firebase Auth user regardless of provider.
  // ------------------------------------------------------------------
  return {
    displayName: displayName || email?.split('@')[0],
    photoURL: photoURL ?? undefined,
    customClaims: {
      role: 'user',
      createdAt: new Date().toISOString(),
    },
  };
});
