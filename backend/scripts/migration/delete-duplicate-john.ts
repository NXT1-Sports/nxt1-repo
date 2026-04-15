#!/usr/bin/env tsx
/**
 * Delete duplicate john@nxt1sports.com account from staging-v2
 * Keep only the legacy account (p8OiVVIknKhgncxVahKeRs8HzD63)
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const STAGING_ACCOUNT_UID = '6EojsEOJIeRwWV9IrfmV11zoKS52'; // Account to DELETE
const LEGACY_ACCOUNT_UID = 'p8OiVVIknKhgncxVahKeRs8HzD63'; // Account to KEEP
const EMAIL = 'john@nxt1sports.com';

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

async function deleteDuplicate() {
  console.log('🗑️  Deleting duplicate john@nxt1sports.com account...\n');

  try {
    // Verify staging account exists
    console.log('📋 Verifying accounts...\n');

    try {
      const stagingAccount = await stagingAuth.getUser(STAGING_ACCOUNT_UID);
      console.log('⚠️  STAGING Account (TO DELETE):');
      console.log(`   UID: ${stagingAccount.uid}`);
      console.log(`   Email: ${stagingAccount.email}`);
      console.log(`   Created: ${new Date(stagingAccount.metadata.creationTime).toLocaleString()}`);
      console.log(`   Display Name: ${stagingAccount.displayName || 'N/A'}`);
      console.log('');
    } catch (error: any) {
      console.log('   ℹ️  Staging account not found (may be already deleted)');
      console.log('');
    }

    // Verify legacy account exists
    const legacyAccount = await stagingAuth.getUser(LEGACY_ACCOUNT_UID);
    console.log('✅ LEGACY Account (TO KEEP):');
    console.log(`   UID: ${legacyAccount.uid}`);
    console.log(`   Email: ${legacyAccount.email}`);
    console.log(`   Created: ${new Date(legacyAccount.metadata.creationTime).toLocaleString()}`);
    console.log(`   Display Name: ${legacyAccount.displayName || 'N/A'}`);
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔥 DELETING STAGING ACCOUNT...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await stagingAuth.deleteUser(STAGING_ACCOUNT_UID);

    console.log(`✅ Successfully deleted staging account: ${STAGING_ACCOUNT_UID}`);
    console.log(`✅ Legacy account preserved: ${LEGACY_ACCOUNT_UID}`);
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 RESULT');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Email: ${EMAIL}`);
    console.log(`✅ Only legacy account remains (UID: ${LEGACY_ACCOUNT_UID})`);
    console.log('✅ Duplicate resolved!');
    console.log('');
    console.log('💡 Verify with: npx tsx scripts/migration/verify-auth-import.ts');
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      console.log('ℹ️  Account already deleted or does not exist');
    } else {
      console.error('❌ Error:', error.message);
      throw error;
    }
  }
}

deleteDuplicate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
