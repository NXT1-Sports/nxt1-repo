#!/usr/bin/env tsx
/**
 * Delete duplicate staging account to allow legacy UID migration
 * Target: w2PTHsZGFGQG0viJtWuvQlhwpNk1 (staging-v2 test account)
 * Will allow: evIdVndqrIPCVUjFyKZyc5WTQeA3 (legacy prod UID) to use the email
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
  'staging-delete-dup'
);

async function deleteDuplicateAccount() {
  const auth = getAuth(stagingApp);
  const duplicateUID = 'w2PTHsZGFGQG0viJtWuvQlhwpNk1';

  console.log('🗑️  Deleting duplicate staging account...\n');

  try {
    // Get user info first
    const user = await auth.getUser(duplicateUID);
    console.log('📋 Account to delete:');
    console.log(`   UID: ${user.uid}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Created: ${new Date(user.metadata.creationTime!).toLocaleString()}`);
    console.log(`   Providers: ${user.providerData.map((p) => p.providerId).join(', ')}\n`);

    // Delete
    await auth.deleteUser(duplicateUID);

    console.log('✅ Account deleted successfully!');
    console.log(
      '\n💡 Now the legacy UID (evIdVndqrIPCVUjFyKZyc5WTQeA3) can use sonngoc.dev@gmail.com\n'
    );
  } catch (error) {
    console.error('❌ Failed to delete:', (error as Error).message);
    process.exit(1);
  }

  await stagingApp.delete();
}

deleteDuplicateAccount();
