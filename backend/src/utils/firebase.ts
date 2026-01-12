/**
 * @fileoverview Firebase Admin SDK initialization
 * @module @nxt1/backend
 */

import admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import type { Storage } from 'firebase-admin/storage';

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = process.env['FIREBASE_SERVICE_ACCOUNT']
    ? JSON.parse(process.env['FIREBASE_SERVICE_ACCOUNT'])
    : undefined;

  admin.initializeApp({
    credential: serviceAccount
      ? admin.credential.cert(serviceAccount)
      : admin.credential.applicationDefault(),
    storageBucket: process.env['FIREBASE_STORAGE_BUCKET'],
  });
}

export const db: Firestore = admin.firestore();
export const auth: Auth = admin.auth();
export const storage: Storage = admin.storage();

export default admin;
