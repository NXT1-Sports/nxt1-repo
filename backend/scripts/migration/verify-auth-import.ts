/**
 * @fileoverview Phase 2, Step 8: Verify Auth Import
 *
 * This script verifies that auth users were successfully imported
 * to staging-v2 Firebase project.
 *
 * Usage:
 *   cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend
 *   npx tsx scripts/migration/verify-auth-import.ts
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// ─── Load UID mapping ─────────────────────────────────────────────────────────
const uidMappingPath = resolve(__dirname, './user-uid-mapping.json');
const uidMapping = JSON.parse(readFileSync(uidMappingPath, 'utf-8'));
const targetUsers = uidMapping.results.filter((r: any) => r.uid && r.authExists);

console.log(`\n🎯 Verifying ${targetUsers.length} auth imports to staging-v2...\n`);

// ─── Initialize Staging V2 Firebase ──────────────────────────────────────────
const stagingProjectId = process.env['STAGING_FIREBASE_PROJECT_ID']!;
const stagingClientEmail = process.env['STAGING_FIREBASE_CLIENT_EMAIL']!;
const stagingPrivateKey = process.env['STAGING_FIREBASE_PRIVATE_KEY']!.replace(/\\n/g, '\n');

if (!stagingProjectId || !stagingClientEmail || !stagingPrivateKey) {
  console.error('❌ Missing STAGING Firebase credentials in .env');
  process.exit(1);
}

console.log(`🔥 Connecting to Staging V2: ${stagingProjectId}\n`);

const stagingApp =
  getApps().find((a) => a.name === 'staging') ??
  initializeApp(
    {
      credential: cert({
        projectId: stagingProjectId,
        clientEmail: stagingClientEmail,
        privateKey: stagingPrivateKey,
      }),
    },
    'staging'
  );

const stagingAuth = getAuth(stagingApp);

// ─── Verify each user ─────────────────────────────────────────────────────────
async function verifyAuthImport() {
  const results: Array<{
    email: string;
    uid: string;
    existsInStaging: boolean;
    emailMatch: boolean;
    error?: string;
  }> = [];

  for (const targetUser of targetUsers) {
    const { email, uid } = targetUser;

    try {
      const stagingUser = await stagingAuth.getUser(uid);

      const emailMatch = stagingUser.email === email || (!stagingUser.email && !email);

      console.log(`✅ ${email || 'N/A'}`);
      console.log(`   UID: ${uid}`);
      console.log(`   Staging Email: ${stagingUser.email || 'N/A'}`);
      console.log(`   Email Match: ${emailMatch ? '✅' : '⚠️'}`);
      console.log(`   Created: ${new Date(stagingUser.metadata.creationTime).toLocaleString()}`);
      console.log(
        `   Last Sign In: ${stagingUser.metadata.lastSignInTime ? new Date(stagingUser.metadata.lastSignInTime).toLocaleString() : 'Never'}`
      );

      if (stagingUser.providerData && stagingUser.providerData.length > 0) {
        console.log(
          `   Providers: ${stagingUser.providerData.map((p) => p.providerId).join(', ')}`
        );
      }

      console.log('');

      results.push({
        email,
        uid,
        existsInStaging: true,
        emailMatch,
      });
    } catch (error: any) {
      console.log(`❌ ${email || uid}`);
      console.log(`   UID: ${uid}`);
      console.log(`   Error: ${error.code || error.message}`);
      console.log('');

      results.push({
        email,
        uid,
        existsInStaging: false,
        emailMatch: false,
        error: error.code || error.message,
      });
    }
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 VERIFICATION SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const successCount = results.filter((r) => r.existsInStaging).length;
  const emailMatchCount = results.filter((r) => r.emailMatch).length;
  const failureCount = results.filter((r) => !r.existsInStaging).length;

  console.log(`Total target users: ${targetUsers.length}`);
  console.log(`✅ Found in staging-v2: ${successCount}/${targetUsers.length}`);
  console.log(`✅ Email matches: ${emailMatchCount}/${targetUsers.length}`);
  console.log(`❌ NOT found in staging-v2: ${failureCount}`);

  if (failureCount > 0) {
    console.log('\n⚠️  FAILED IMPORTS:');
    results
      .filter((r) => !r.existsInStaging)
      .forEach((r) => {
        console.log(`   ❌ ${r.email || r.uid} - ${r.error}`);
      });
  }

  const emailMismatchCount = results.filter((r) => r.existsInStaging && !r.emailMatch).length;
  if (emailMismatchCount > 0) {
    console.log('\n⚠️  EMAIL MISMATCHES (May need manual update):');
    results
      .filter((r) => r.existsInStaging && !r.emailMatch)
      .forEach((r) => {
        console.log(`   ⚠️  ${r.email || r.uid} - UID exists but email doesn't match`);
      });
  }

  if (successCount === targetUsers.length && emailMatchCount === targetUsers.length) {
    console.log('\n✅ ALL AUTH IMPORTS VERIFIED SUCCESSFULLY!');
    console.log('   Ready to proceed to Phase 3: Firestore Migration');
  } else if (successCount === targetUsers.length) {
    console.log('\n✅ All users imported, but some have email mismatches.');
    console.log('   You can proceed to Phase 3 and fix emails later.');
  } else {
    console.log('\n❌ Some users failed to import!');
    console.log('   Review errors above and re-run auth import.');
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────────
verifyAuthImport()
  .then(() => {
    console.log('\n✅ Verification complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
