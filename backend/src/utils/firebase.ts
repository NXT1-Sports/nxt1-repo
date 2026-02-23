/**
 * @fileoverview Firebase Admin SDK initialization
 * @module @nxt1/backend
 */

import admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import type { Storage } from 'firebase-admin/storage';

// Initialize Firebase Admin (Production — nxt-1-v2)
if (!admin.apps.length) {
  const projectId = process.env['FIREBASE_PROJECT_ID'];
  const clientEmail = process.env['FIREBASE_CLIENT_EMAIL'];
  const privateKey = process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n');
  const storageBucket = process.env['FIREBASE_STORAGE_BUCKET'];

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      storageBucket,
    });
  } else {
    // Fallback to Application Default Credentials (e.g. on Firebase hosting)
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket,
    });
  }
}

export const db: Firestore = admin.firestore();
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
