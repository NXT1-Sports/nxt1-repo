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
  const privateKey = process.env['STAGING_FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n');
  const storageBucket = process.env['STAGING_FIREBASE_STORAGE_BUCKET'];

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('⚠️  STAGING_FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY not configured');
  }

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
