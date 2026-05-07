/**
 * @fileoverview Firebase Admin SDK initialization
 * @module @nxt1/backend
 */

import admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import type { Storage } from 'firebase-admin/storage';

// Determine environment: 'staging' or 'production'
const environment = process.env['NODE_ENV'] || 'production';
const isStaging = environment === 'staging';

// Initialize Firebase Admin with environment-specific credentials
if (!admin.apps.length) {
  // Select credentials based on environment
  const projectId = isStaging
    ? process.env['STAGING_FIREBASE_PROJECT_ID']
    : process.env['FIREBASE_PROJECT_ID'];
  const clientEmail = isStaging
    ? process.env['STAGING_FIREBASE_CLIENT_EMAIL']
    : process.env['FIREBASE_CLIENT_EMAIL'];
  const privateKey = isStaging
    ? process.env['STAGING_FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n')
    : process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n');
  const storageBucket = isStaging
    ? process.env['STAGING_FIREBASE_STORAGE_BUCKET']
    : process.env['FIREBASE_STORAGE_BUCKET'];

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      storageBucket,
    });
    console.log(`[Firebase] Initialized for ${isStaging ? 'STAGING' : 'PRODUCTION'} environment`);
    console.log(`[Firebase] Project: ${projectId}`);
    console.log(`[Firebase] Storage: ${storageBucket}`);
  } else {
    // Fallback to Application Default Credentials (e.g. on Firebase hosting)
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket,
    });
    console.log('[Firebase] Initialized with Application Default Credentials');
  }
}

export const db: Firestore = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
export const auth: Auth = admin.auth();
export const storage: Storage = admin.storage();

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

export default admin;
