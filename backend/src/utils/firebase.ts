/**
 * @fileoverview Firebase Admin SDK initialization
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

// This module ALWAYS initializes the PRODUCTION Firebase instance (nxt-1-v2).
// Staging Firebase is handled separately in firebase-staging.ts.
// The firebase-context.middleware.ts selects the correct instance per request
// based on the route path (/api/v1/staging/* vs /api/v1/*).

let app: App;

if (!getApps().length) {
  const projectId = process.env['FIREBASE_PROJECT_ID'];
  const clientEmail = process.env['FIREBASE_CLIENT_EMAIL'];
  const privateKey = process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n');
  const storageBucket = process.env['FIREBASE_STORAGE_BUCKET'];

  if (projectId && clientEmail && privateKey) {
    app = initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      storageBucket,
    });
    console.log('[Firebase] Production instance initialized');
    console.log(`[Firebase] Project: ${projectId}`);
    console.log(`[Firebase] Storage: ${storageBucket}`);
  } else {
    // Fallback to Application Default Credentials
    app = initializeApp({
      credential: applicationDefault(),
      storageBucket,
    });
    console.log('[Firebase] Initialized with Application Default Credentials');
  }
} else {
  app = getApp();
}

export const db: Firestore = getFirestore(app);
if (typeof (db as { settings?: unknown }).settings === 'function') {
  (db as { settings: (options: { ignoreUndefinedProperties: boolean }) => unknown }).settings({
    ignoreUndefinedProperties: true,
  });
}
export const auth: Auth = getAuth(app);
export const storage: Storage = getStorage(app);

/**
 * TASK 5 — Social Login / OAuth configuration (Production)
 *
 * Firebase Console → Authentication → Settings → Authorized domains:
 *   nxt1sports.com, app.nxt1sports.com
 *
 * Google OAuth callback URL:
 *   https://nxt-1-v2.firebaseapp.com/__/auth/handler
 *
 * NOTE: Do NOT add staging domains to the production Firebase project.
 */

export default app;
