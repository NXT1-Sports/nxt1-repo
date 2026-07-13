/**
 * @fileoverview Firebase Admin SDK initialization for STAGING
 * @module @nxt1/backend
 */

import {
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getStorage, type Storage } from 'firebase-admin/storage';

// Initialize Firebase Admin for Staging
let stagingApp: App;
const STAGING_APP_NAME = 'staging';

if (!getApps().find((app) => app?.name === STAGING_APP_NAME)) {
  // Staging — nxt-1-staging-v2
  const projectId = process.env['STAGING_FIREBASE_PROJECT_ID'];
  const clientEmail = process.env['STAGING_FIREBASE_CLIENT_EMAIL'];
  const privateKey = process.env['STAGING_FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n');
  const storageBucket = process.env['STAGING_FIREBASE_STORAGE_BUCKET'];

  if (!projectId || !clientEmail || !privateKey) {
    if (process.env['NODE_ENV'] !== 'test') {
      console.warn('⚠️  STAGING_FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY not configured');
    }
  }

  stagingApp = initializeApp(
    {
      credential:
        projectId && clientEmail && privateKey
          ? cert({ projectId, clientEmail, privateKey })
          : applicationDefault(),
      storageBucket,
    },
    STAGING_APP_NAME
  );
} else {
  stagingApp = getApp(STAGING_APP_NAME);
}

export const stagingDb: Firestore = getFirestore(stagingApp);
if (typeof (stagingDb as { settings?: unknown }).settings === 'function') {
  try {
    (
      stagingDb as { settings: (options: { ignoreUndefinedProperties: boolean }) => unknown }
    ).settings({
      ignoreUndefinedProperties: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('Firestore has already been initialized')) {
      throw error;
    }
  }
}
export const stagingAuth: Auth = getAuth(stagingApp);
export const stagingStorage: Storage = getStorage(stagingApp);

/**
 * TASK 5 — Social Login / OAuth configuration (Staging)
 *
 * Firebase Console → Authentication → Settings → Authorized domains:
 *   staging.nxt1sports.com, nxt-1-staging-v2.web.app, nxt-1-staging-v2.firebaseapp.com
 *
 * Google OAuth callback URL:
 *   https://nxt-1-staging-v2.firebaseapp.com/__/auth/handler
 *
 * NOTE: Do NOT add production domains (nxt1sports.com) to the staging project.
 */

export default stagingApp;
