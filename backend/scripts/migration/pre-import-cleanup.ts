#!/usr/bin/env tsx
/**
 * Pre-Import Cleanup: Delete duplicate accounts in staging BEFORE importing from legacy
 *
 * This script should run BEFORE firebase auth:import to ensure no conflicts.
 * It checks all target users and deletes any existing accounts in staging that
 * have the same email but different UID from legacy.
 *
 * Usage:
 *   cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend
 *   npx tsx scripts/migration/pre-import-cleanup.ts
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Load target users and their legacy UIDs
const uidMappingPath = resolve(__dirname, './user-uid-mapping.json');
const uidMapping = JSON.parse(readFileSync(uidMappingPath, 'utf-8'));

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

interface DuplicateAccount {
  email: string;
  legacyUID: string;
  stagingUID: string;
  createdTime: string;
  displayName?: string;
  providers: string[];
}

async function findDuplicates(): Promise<DuplicateAccount[]> {
  console.log('🔍 Scanning for duplicate accounts in staging...\n');

  const users = uidMapping.results || uidMapping;
  const duplicatesToDelete: DuplicateAccount[] = [];

  for (const user of users) {
    if (!user.email || !user.uid) continue;

    const legacyUID = user.uid;
    const email = user.email;

    try {
      // List all users and find matches by email
      const listResult = await stagingAuth.listUsers(1000);
      const matchingUsers = listResult.users.filter((u) => u.email === email);

      if (matchingUsers.length > 1) {
        // Multiple accounts with same email - find non-legacy ones
        const nonLegacyAccounts = matchingUsers.filter((u) => u.uid !== legacyUID);

        for (const account of nonLegacyAccounts) {
          duplicatesToDelete.push({
            email: email,
            legacyUID: legacyUID,
            stagingUID: account.uid,
            createdTime: account.metadata.creationTime,
            displayName: account.displayName,
            providers: account.providerData.map((p) => p.providerId),
          });

          console.log(`⚠️  Found duplicate: ${email}`);
          console.log(`   Legacy UID: ${legacyUID} (KEEP)`);
          console.log(`   Staging UID: ${account.uid} (DELETE)`);
          console.log(`   Created: ${new Date(account.metadata.creationTime).toLocaleString()}`);
          console.log(`   Display Name: ${account.displayName || 'N/A'}`);
          console.log('');
        }
      } else if (matchingUsers.length === 1 && matchingUsers[0].uid !== legacyUID) {
        // Single account but with wrong UID
        const account = matchingUsers[0];
        duplicatesToDelete.push({
          email: email,
          legacyUID: legacyUID,
          stagingUID: account.uid,
          createdTime: account.metadata.creationTime,
          displayName: account.displayName,
          providers: account.providerData.map((p) => p.providerId),
        });

        console.log(`⚠️  Found account with wrong UID: ${email}`);
        console.log(`   Expected (legacy): ${legacyUID}`);
        console.log(`   Current (staging): ${account.uid} (DELETE)`);
        console.log(`   Created: ${new Date(account.metadata.creationTime).toLocaleString()}`);
        console.log('');
      }
    } catch (error: any) {
      // User might not exist in staging yet - that's OK
      continue;
    }
  }

  return duplicatesToDelete;
}

async function deleteDuplicates(duplicates: DuplicateAccount[]) {
  if (duplicates.length === 0) {
    console.log('✅ No duplicate accounts found! Staging is clean.\n');
    return;
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🗑️  DELETING ${duplicates.length} DUPLICATE ACCOUNT(S)...`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let deletedCount = 0;
  let errorCount = 0;

  for (const dup of duplicates) {
    try {
      await stagingAuth.deleteUser(dup.stagingUID);
      console.log(`✅ Deleted: ${dup.email} (UID: ${dup.stagingUID})`);
      deletedCount++;
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        console.log(`ℹ️  Already gone: ${dup.email} (UID: ${dup.stagingUID})`);
        deletedCount++;
      } else {
        console.error(`❌ Error deleting ${dup.email}: ${error.message}`);
        errorCount++;
      }
    }
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 CLEANUP SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`✅ Deleted: ${deletedCount}/${duplicates.length}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log('');

  if (deletedCount === duplicates.length) {
    console.log('✅ Staging cleaned! Ready for import.\n');
    console.log('💡 Next step: Run firebase auth:import with hash key:\n');
    console.log('   cd scripts/migration');
    console.log('   firebase auth:import auth-export-filtered.json \\');
    console.log('     --project nxt-1-staging-v2 \\');
    console.log('     --hash-algo=SCRYPT \\');
    console.log('     --rounds=8 \\');
    console.log('     --mem-cost=14 \\');
    console.log('     --salt-separator="Bw==" \\');
    console.log('     --hash-key="<key from hash-config.json>"\n');
  } else {
    console.log('⚠️  Some accounts could not be deleted. Review errors above.');
  }
}

async function preImportCleanup() {
  console.log('🧹 PRE-IMPORT CLEANUP');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Checking for duplicate accounts that would conflict with migration...\n');

  try {
    const duplicates = await findDuplicates();
    await deleteDuplicates(duplicates);
  } catch (error: any) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

preImportCleanup()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
