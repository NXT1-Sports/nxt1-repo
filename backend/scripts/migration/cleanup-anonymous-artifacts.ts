#!/usr/bin/env tsx
/**
 * Clean up leftover anonymous accounts from failed import
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const stagingApp = initializeApp(
  {
    credential: cert({
      projectId: process.env.STAGING_FIREBASE_PROJECT_ID,
      clientEmail: process.env.STAGING_FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.STAGING_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    projectId: process.env.STAGING_FIREBASE_PROJECT_ID,
  },
  'staging-clean-anon'
);

const toDelete = ['rp6L9gBB0dYDxNrUXdpY2v8Mzk33', 'wf6zCnTHkTSL6wKsKHmD4bxDTRg1'];

async function cleanupArtifacts() {
  const auth = getAuth(stagingApp);

  console.log('🗑️  Cleaning up 2 leftover anonymous accounts...\n');

  for (const uid of toDelete) {
    try {
      console.log(`Deleting UID: ${uid}`);
      await auth.deleteUser(uid);
      console.log(`✅ Deleted\n`);
    } catch (error) {
      console.error(`❌ Failed: ${(error as Error).message}\n`);
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Cleanup complete! Staging-v2 now has only valid users.\n');

  await stagingApp.delete();
}

cleanupArtifacts();
