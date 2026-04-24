/**
 * @fileoverview Before User Create - Pre-registration validation & user bootstrapping
 * @module @nxt1/functions/auth/beforeUserCreate
 *
 * Runs before Firebase creates a user account.
 * - Blocks disposable email domains
 * - Sets initial custom claims
 * - Creates Firestore user document (V3 schema) for OAuth providers ONLY when
 *   OAuth tokens (Gmail / Microsoft refresh tokens) need to be persisted.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Email / Password sign-up                                           │
 * │  → NO Firestore write here.                                         │
 * │    POST /auth/create-user (backend) creates the doc with V3 schema. │
 * │    Writing here would cause a 409 conflict on that endpoint.        │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  Google (gmail.send scope + refresh token present)                  │
 * │  Microsoft (refresh token present)                                  │
 * │  → Write V3 doc NOW because the token is only available here.       │
 * │    Backend /create-user call will see an existing doc and skip.     │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  Apple                                                              │
 * │  → Write base V3 doc here (no token available, but frontend does    │
 * │    NOT call POST /auth/create-user after Apple sign-in).            │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  Google (no token) or any other provider                            │
 * │  → NO write here. Backend /create-user handles doc creation.        │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * TOKEN SECURITY MODEL (OWASP A01 / A02):
 * ─────────────────────────────────────────────────────────────────────
 * OAuth refresh tokens are NEVER stored on the User document.
 * Storing them there would expose them via profile API responses and
 * Redis cache — a direct Broken Access Control + Cryptographic Failure.
 *
 * Instead, a two-document pattern is used:
 *   Users/{uid}                        ← connectedEmails[] metadata only
 *   Users/{uid}/oauthTokens/{provider} ← refresh token (server-only)
 *
 * Firestore security rules lock oauthTokens to backend/Functions only.
 *
 * V3 document schema (mirrors UserV3Document in backend/src/routes/auth.routes.ts):
 *   email, onboardingCompleted, createdAt, updatedAt, _schemaVersion
 *   + OAuth-specific: connectedEmails[] (ConnectedEmail metadata, NO tokens)
 */

import { beforeUserCreated, HttpsError } from 'firebase-functions/v2/identity';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { DISPOSABLE_EMAIL_DOMAINS, USER_SCHEMA_VERSION } from '../constants';

// ─── Inlined from @nxt1/core/auth (workspace packages are not available in Cloud Run) ───
const OAUTH_TOKEN_SUBCOLLECTION = 'oauthTokens' as const;
const GOOGLE_OAUTH_TOKEN_DOC_ID = 'google' as const;
// Keep this in sync with packages/core/src/auth/google-oauth.constants.ts.
// Broader legacy markers are retained here so old-but-valid grants still trigger
// token persistence during account creation.
const GOOGLE_OAUTH_SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/presentations',
] as const;
function hasGrantedGoogleWorkspaceScopes(grantedScopes: string): boolean {
  return GOOGLE_OAUTH_SCOPES.some((scope) => grantedScopes.includes(scope));
}

const db = admin.firestore();

/**
 * Check if email domain is disposable
 */
function isDisposableDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? (DISPOSABLE_EMAIL_DOMAINS as readonly string[]).includes(domain) : false;
}

/**
 * Build a V3-compatible base user document.
 * Matches the structure created by POST /auth/create-user in the backend.
 * NOTE: `uid` is intentionally NOT stored on the document (Firestore doc ID is the uid).
 */
function buildV3User(email: string): Record<string, unknown> {
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
        const hasGoogleWorkspacePermission = hasGrantedGoogleWorkspaceScopes(grantedScopes);

        if (hasGoogleWorkspacePermission && refreshToken) {
          const now = new Date().toISOString();

          // ✅ SECURITY: Only metadata goes on the user document.
          // Token is written to the oauthTokens subcollection, which Firestore
          // security rules restrict to server-only access (Cloud Functions / backend).
          const connectedEmailMeta = {
            email,
            provider: 'gmail',
            isActive: true,
            connectedAt: now,
          };
          const newUser = buildV3User(email);
          newUser['connectedEmails'] = [connectedEmailMeta];

          // Use a batch so both writes succeed or both fail atomically.
          const batch = db.batch();
          batch.set(db.collection('Users').doc(uid), newUser);
          batch.set(
            db
              .collection('Users')
              .doc(uid)
              .collection(OAUTH_TOKEN_SUBCOLLECTION)
              .doc(GOOGLE_OAUTH_TOKEN_DOC_ID),
            {
              provider: GOOGLE_OAUTH_TOKEN_DOC_ID,
              refreshToken,
              email,
              grantedScopes,
              lastRefreshedAt: now,
            }
          );
          await batch.commit();

          logger.info('[beforeUserCreate] Google – V3 doc + OAuth token written to subcollection', {
            uid,
          });
        } else {
          // No token to save – backend /create-user will create the standard V3 doc.
          if (hasGoogleWorkspacePermission) {
            logger.info(
              '[beforeUserCreate] Google – scope granted but no refresh token, skipping write',
              { uid }
            );
          } else {
            logger.info(
              '[beforeUserCreate] Google – no configured Google workspace scope, skipping write (backend handles it)',
              { uid }
            );
          }
        }
      } else if (providerId === 'microsoft.com' && uid && email) {
        const refreshToken = credential.refreshToken;

        if (refreshToken) {
          const now = new Date().toISOString();

          // ✅ SECURITY: Metadata on user doc, token in oauthTokens subcollection.
          const connectedEmailMeta = {
            email,
            provider: 'microsoft',
            isActive: true,
            connectedAt: now,
          };
          const newUser = buildV3User(email);
          newUser['connectedEmails'] = [connectedEmailMeta];

          // Atomic batch: user doc + token subcollection
          const batch = db.batch();
          batch.set(db.collection('Users').doc(uid), newUser);
          batch.set(
            db.collection('Users').doc(uid).collection(OAUTH_TOKEN_SUBCOLLECTION).doc('microsoft'),
            {
              provider: 'microsoft',
              refreshToken,
              email,
              lastRefreshedAt: now,
            }
          );
          await batch.commit();

          logger.info('[beforeUserCreate] Microsoft – V3 doc + token written to subcollection', {
            uid,
          });
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
        const newUser = buildV3User(email);
        await db.collection('Users').doc(uid).set(newUser);
        logger.info('[beforeUserCreate] Apple – base V3 doc created (no token)', { uid });
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
