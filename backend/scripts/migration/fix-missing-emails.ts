#!/usr/bin/env tsx
/**
 * Fix 2 users with missing email in top-level Auth record
 * Email exists in providerUserInfo but not in user.email field
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

// Initialize Staging V2 Firebase app
const stagingApp = initializeApp(
  {
    credential: cert({
      projectId: process.env.STAGING_FIREBASE_PROJECT_ID,
      clientEmail: process.env.STAGING_FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.STAGING_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    projectId: process.env.STAGING_FIREBASE_PROJECT_ID,
  },
  'staging-fix-emails'
);

const usersToFix = [
  {
    uid: 'evIdVndqrIPCVUjFyKZyc5WTQeA3',
    email: 'sonngoc.dev@gmail.com',
    displayName: 'Sơn Ngọc (Nolan)',
  },
  {
    uid: 'pXBew7UKMPPuMvpX8HBDZaqjvIA3',
    email: 'web.developer.gz@gmail.com',
    displayName: 'Dev Test',
  },
];

async function fixMissingEmails() {
  console.log('🔧 Fixing 2 users with missing emails in staging-v2...\n');

  const auth = getAuth(stagingApp);
  let successCount = 0;
  let failCount = 0;

  for (const user of usersToFix) {
    try {
      console.log(`📝 Updating UID: ${user.uid}`);
      console.log(`   Email: ${user.email}`);

      await auth.updateUser(user.uid, {
        email: user.email,
        emailVerified: true, // Since they have Google OAuth
      });

      console.log(`✅ Success!\n`);
      successCount++;
    } catch (error) {
      console.error(`❌ Failed: ${(error as Error).message}\n`);
      failCount++;
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 FIX SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`✅ Fixed: ${successCount}/2`);
  console.log(`❌ Failed: ${failCount}/2\n`);

  if (successCount === 2) {
    console.log('🎉 All emails fixed! No more anonymous users.');
  }

  await stagingApp.delete();
}

fixMissingEmails().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
