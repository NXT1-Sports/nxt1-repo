#!/usr/bin/env tsx
/**
 * Find duplicate accounts with same email
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
  'staging-find-dup'
);

async function findDuplicate() {
  const auth = getAuth(stagingApp);
  const targetEmail = 'sonngoc.dev@gmail.com';

  console.log(`🔍 Searching for accounts with email: ${targetEmail}\n`);

  try {
    const user = await auth.getUserByEmail(targetEmail);
    console.log('✅ Found account:');
    console.log(`   UID: ${user.uid}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Verified: ${user.emailVerified}`);
    console.log(`   Created: ${new Date(user.metadata.creationTime!).toLocaleString()}`);
    console.log(`   Providers: ${user.providerData.map((p) => p.providerId).join(', ')}`);

    console.log(
      '\n❌ This UID is different from target migration UID: evIdVndqrIPCVUjFyKZyc5WTQeA3'
    );
    console.log('\n💡 Solution: Delete this duplicate account OR change its email first');
  } catch (error) {
    console.error('Error:', (error as Error).message);
  }

  await stagingApp.delete();
}

findDuplicate();
