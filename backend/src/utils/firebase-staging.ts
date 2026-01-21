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
  const serviceAccount = process.env['STAGING_FIREBASE_SERVICE_ACCOUNT']
    ? JSON.parse(process.env['STAGING_FIREBASE_SERVICE_ACCOUNT'])
    : undefined;

  if (!serviceAccount) {
    console.warn('⚠️  STAGING_FIREBASE_SERVICE_ACCOUNT not configured');
  }

  stagingApp = admin.initializeApp(
    {
      credential: serviceAccount
        ? admin.credential.cert(serviceAccount)
        : admin.credential.applicationDefault(),
      storageBucket: process.env['STAGING_FIREBASE_STORAGE_BUCKET'],
    },
    'staging'
  );
} else {
  stagingApp = admin.app('staging');
}

export const stagingDb: Firestore = stagingApp.firestore();
export const stagingAuth: Auth = stagingApp.auth();
export const stagingStorage: Storage = stagingApp.storage();

export default stagingApp;
