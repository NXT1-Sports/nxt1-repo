/**
 * @fileoverview Firebase Admin SDK initialization for STAGING
 * @module @nxt1/backend
 */

import admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import type { Storage } from 'firebase-admin/storage';

// Initialize Firebase Admin for Staging
let stagingApp: admin.app.App;

if (!admin.apps.find((app) => app?.name === 'staging')) {
  // Staging — nxt-1-staging-v2
  const projectId = process.env['STAGING_FIREBASE_PROJECT_ID'];
  const clientEmail = process.env['STAGING_FIREBASE_CLIENT_EMAIL'];
  const rawKey = process.env['STAGING_FIREBASE_PRIVATE_KEY'];
  // Strip leading/trailing single or double quotes that may have been included
  // when copy-pasting into .env, then normalize \n escape sequences.
  const privateKey = rawKey
    ? rawKey
        .replace(/^['"]|['"]$/g, '')
        .replace(/\\\\n/g, '\n')
        .replace(/\\n/g, '\n')
    : undefined;
  const storageBucket = process.env['STAGING_FIREBASE_STORAGE_BUCKET'];

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('⚠️  STAGING_FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY not configured');
  }

  try {
    stagingApp = admin.initializeApp(
      {
        credential:
          projectId && clientEmail && privateKey
            ? admin.credential.cert({ projectId, clientEmail, privateKey })
            : admin.credential.applicationDefault(),
        storageBucket,
      },
      'staging'
    );
  } catch (err) {
    console.error(
      '[Firebase Staging] Failed to init with service account — falling back to ADC:',
      err
    );
    stagingApp = admin.initializeApp(
      { credential: admin.credential.applicationDefault(), storageBucket },
      'staging'
    );
  }
} else {
  stagingApp = admin.app('staging');
}

export const stagingDb: Firestore = stagingApp.firestore();
stagingDb.settings({ ignoreUndefinedProperties: true });
export const stagingAuth: Auth = stagingApp.auth();
export const stagingStorage: Storage = stagingApp.storage();

/**
 * TASK 5 — Social Login / OAuth configuration (Staging)
 *
 * Firebase Console → Authentication → Settings → Authorized domains:
 *   nxt-1-staging-v2.web.app, nxt-1-staging.firebaseapp.com
 *
 * Google OAuth callback URL:
 *   https://nxt-1-staging-v2.firebaseapp.com/__/auth/handler
 *
 * NOTE: Do NOT add production domains (nxt1sports.com) to the staging project.
 */

export default stagingApp;
