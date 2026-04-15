#!/usr/bin/env tsx
/**
 * Master Migration Script - Phase 2: Authentication
 *
 * Automates the entire Phase 2 process in correct order:
 * 1. Pre-import cleanup (delete duplicates)
 * 2. Import users with passwords
 * 3. Fix missing emails
 * 4. Verify import
 *
 * Usage:
 *   cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend
 *   npx tsx scripts/migration/migrate-auth-master.ts
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Load config
const hashConfigPath = resolve(__dirname, './hash-config.json');
const uidMappingPath = resolve(__dirname, './user-uid-mapping.json');
const authExportPath = resolve(__dirname, './auth-export-filtered.json');

interface DuplicateAccount {
  email: string;
  legacyUID: string;
  stagingUID: string;
}

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

async function step1_PreImportCleanup(): Promise<number> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 1: PRE-IMPORT CLEANUP');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const uidMapping = JSON.parse(readFileSync(uidMappingPath, 'utf-8'));
  const users = uidMapping.results || uidMapping;
  const duplicatesToDelete: DuplicateAccount[] = [];

  console.log('🔍 Scanning for duplicate accounts...\n');

  for (const user of users) {
    if (!user.email || !user.uid) continue;

    const legacyUID = user.uid;
    const email = user.email;

    try {
      const listResult = await stagingAuth.listUsers(1000);
      const matchingUsers = listResult.users.filter((u) => u.email === email);

      for (const account of matchingUsers) {
        if (account.uid !== legacyUID) {
          duplicatesToDelete.push({
            email: email,
            legacyUID: legacyUID,
            stagingUID: account.uid,
          });
          console.log(`⚠️  Duplicate found: ${email}`);
          console.log(`   Staging UID: ${account.uid} (will be deleted)`);
          console.log(`   Legacy UID: ${legacyUID} (will be imported)\n`);
        }
      }
    } catch (error) {
      // User doesn't exist yet - that's fine
    }
  }

  if (duplicatesToDelete.length === 0) {
    console.log('✅ No duplicates found. Staging is clean!\n');
    return 0;
  }

  console.log(`🗑️  Deleting ${duplicatesToDelete.length} duplicate account(s)...\n`);

  let deletedCount = 0;
  for (const dup of duplicatesToDelete) {
    try {
      await stagingAuth.deleteUser(dup.stagingUID);
      console.log(`✅ Deleted: ${dup.email} (${dup.stagingUID})`);
      deletedCount++;
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        console.log(`ℹ️  Already deleted: ${dup.email}`);
        deletedCount++;
      } else {
        console.error(`❌ Error: ${error.message}`);
      }
    }
  }

  console.log(`\n✅ Cleanup complete: ${deletedCount}/${duplicatesToDelete.length} deleted\n`);
  return deletedCount;
}

function step2_ImportUsers() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 2: IMPORT USERS WITH PASSWORDS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const hashConfig = JSON.parse(readFileSync(hashConfigPath, 'utf-8'));
  const { signerKey, saltSeparator, rounds, memoryCost } = hashConfig;

  console.log('📦 Loading auth export...');
  const authExport = JSON.parse(readFileSync(authExportPath, 'utf-8'));
  console.log(`   Users to import: ${authExport.users.length}\n`);

  console.log('🔑 Using SCRYPT hash configuration:');
  console.log(`   Rounds: ${rounds}`);
  console.log(`   Memory Cost: ${memoryCost}`);
  console.log(`   Salt Separator: ${saltSeparator}`);
  console.log(`   Signer Key: ${signerKey.substring(0, 20)}...\n`);

  console.log('📤 Importing users via Firebase CLI...\n');

  const command = `cd ${dirname(authExportPath)} && firebase auth:import auth-export-filtered.json --project nxt-1-staging-v2 --hash-algo=SCRYPT --rounds=${rounds} --mem-cost=${memoryCost} --salt-separator="${saltSeparator}" --hash-key="${signerKey}"`;

  try {
    const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    console.log(output);
    console.log('✅ Import successful!\n');
  } catch (error: any) {
    console.error('❌ Import failed:', error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    throw error;
  }
}

async function step3_FixMissingEmails(): Promise<number> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 3: FIX MISSING EMAILS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const uidMapping = JSON.parse(readFileSync(uidMappingPath, 'utf-8'));
  const users = uidMapping.results || uidMapping;

  const usersToFix: Array<{ uid: string; email: string }> = [];

  console.log('🔍 Checking for missing emails...\n');

  for (const user of users) {
    if (!user.email || !user.uid) continue;

    try {
      const userRecord = await stagingAuth.getUser(user.uid);
      if (!userRecord.email) {
        usersToFix.push({ uid: user.uid, email: user.email });
        console.log(`⚠️  Missing email: ${user.email} (${user.uid})`);
      }
    } catch (error) {
      // User might not exist
    }
  }

  if (usersToFix.length === 0) {
    console.log('✅ All users have emails!\n');
    return 0;
  }

  console.log(`\n📝 Fixing ${usersToFix.length} user(s)...\n`);

  let fixedCount = 0;
  for (const user of usersToFix) {
    try {
      await stagingAuth.updateUser(user.uid, { email: user.email });
      console.log(`✅ Fixed: ${user.email}`);
      fixedCount++;
    } catch (error: any) {
      console.error(`❌ Error fixing ${user.email}: ${error.message}`);
    }
  }

  console.log(`\n✅ Fixed: ${fixedCount}/${usersToFix.length}\n`);
  return fixedCount;
}

async function step4_VerifyImport(): Promise<boolean> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 4: VERIFY IMPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const uidMapping = JSON.parse(readFileSync(uidMappingPath, 'utf-8'));
  const users = uidMapping.results || uidMapping;

  let successCount = 0;
  let totalCount = 0;

  for (const user of users) {
    if (!user.email || !user.uid) continue;
    totalCount++;

    try {
      const userRecord = await stagingAuth.getUser(user.uid);
      const emailMatch = userRecord.email === user.email;

      if (emailMatch) {
        console.log(`✅ ${user.email}`);
        console.log(`   UID: ${user.uid}`);
        console.log(
          `   Providers: ${userRecord.providerData.map((p) => p.providerId).join(', ') || 'password'}`
        );
        successCount++;
      } else {
        console.log(`⚠️  ${user.email}`);
        console.log(`   UID: ${user.uid}`);
        console.log(`   Email mismatch: expected ${user.email}, got ${userRecord.email}`);
      }
      console.log('');
    } catch (error: any) {
      console.log(`❌ ${user.email}`);
      console.log(`   UID: ${user.uid}`);
      console.log(`   Error: ${error.message}\n`);
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 VERIFICATION SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`Total users: ${totalCount}`);
  console.log(`✅ Successfully verified: ${successCount}/${totalCount}`);
  console.log(`❌ Issues: ${totalCount - successCount}`);
  console.log('');

  return successCount === totalCount;
}

async function main() {
  console.log('\n🚀 MASTER MIGRATION SCRIPT - PHASE 2: AUTHENTICATION\n');
  console.log('This script will:');
  console.log('  1. Delete duplicate accounts in staging (pre-import cleanup)');
  console.log('  2. Import users from legacy with passwords preserved');
  console.log('  3. Fix any missing emails (Google OAuth users)');
  console.log('  4. Verify all users imported correctly\n');
  console.log('Press Ctrl+C within 5 seconds to cancel...\n');

  await new Promise((resolve) => setTimeout(resolve, 5000));

  try {
    // Step 1: Pre-import cleanup
    await step1_PreImportCleanup();

    // Step 2: Import users
    step2_ImportUsers();

    // Step 3: Fix missing emails
    await step3_FixMissingEmails();

    // Step 4: Verify
    const success = await step4_VerifyImport();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 MIGRATION COMPLETE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (success) {
      console.log('✅ Phase 2 (Authentication) completed successfully!');
      console.log('✅ All users migrated with passwords preserved.');
      console.log('\n💡 Next: Proceed to Phase 3 (Firestore Migration)');
      console.log('   cat scripts/migration/PHASE-3-QUICK-START.md\n');
    } else {
      console.log('⚠️  Migration completed with some issues.');
      console.log('⚠️  Review the verification summary above.');
      console.log('\n💡 You can manually fix issues or re-run this script.\n');
    }
  } catch (error: any) {
    console.error('\n❌ MIGRATION FAILED\n');
    console.error('Error:', error.message);
    console.error('\n💡 Check the error above and try again.\n');
    process.exit(1);
  }
}

main();
