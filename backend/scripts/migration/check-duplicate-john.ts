#!/usr/bin/env tsx
/**
 * Check for duplicate john@nxt1sports.com accounts in staging-v2
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const EMAIL = 'john@nxt1sports.com';
const LEGACY_UID = 'p8OiVVIknKhgncxVahKeRs8HzD63'; // UID from legacy

// Initialize Staging Firebase
const stagingApp = initializeApp(
  {
    credential: cert({
      projectId: process.env.STAGING_FIREBASE_PROJECT_ID,
      clientEmail: process.env.STAGING_FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.STAGING_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  },
  'staging'
);

const stagingAuth = getAuth(stagingApp);

async function checkDuplicates() {
  console.log(`🔍 Checking for duplicate accounts: ${EMAIL}\n`);

  try {
    // List all users with this email (Firebase allows duplicates if allowDuplicateEmails is enabled)
    const listResult = await stagingAuth.listUsers(1000);
    const matchingUsers = listResult.users.filter(
      (user) => user.email === EMAIL || user.uid === LEGACY_UID
    );

    console.log(`📊 Found ${matchingUsers.length} account(s) related to ${EMAIL}:\n`);

    for (const user of matchingUsers) {
      const isLegacyAccount = user.uid === LEGACY_UID;
      console.log(`${isLegacyAccount ? '✅ LEGACY' : '⚠️  STAGING'} Account:`);
      console.log(`   UID: ${user.uid}`);
      console.log(`   Email: ${user.email || 'N/A'}`);
      console.log(`   Created: ${new Date(user.metadata.creationTime).toLocaleString()}`);
      console.log(`   Last Sign In: ${new Date(user.metadata.lastSignInTime).toLocaleString()}`);
      console.log(
        `   Providers: ${user.providerData.map((p) => p.providerId).join(', ') || 'password'}`
      );
      console.log(`   Display Name: ${user.displayName || 'N/A'}`);
      console.log('');
    }

    // Find non-legacy account to delete
    const accountsToDelete = matchingUsers.filter((user) => user.uid !== LEGACY_UID);

    if (accountsToDelete.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🗑️  ACCOUNTS TO DELETE (non-legacy):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      for (const user of accountsToDelete) {
        console.log(`❌ UID: ${user.uid}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Created: ${new Date(user.metadata.creationTime).toLocaleString()}`);
        console.log(`   Reason: Not the legacy account (legacy UID: ${LEGACY_UID})`);
        console.log('');
      }

      console.log(
        '\n💡 To delete these accounts, run:\n   npx tsx scripts/migration/delete-duplicate-john.ts'
      );
    } else {
      console.log('✅ No duplicate accounts found. Only legacy account exists.');
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

checkDuplicates()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
