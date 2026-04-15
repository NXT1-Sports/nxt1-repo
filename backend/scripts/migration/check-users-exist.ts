/**
 * @fileoverview Step 4: Check if target users exist in legacy production
 *
 * This script queries Firestore Users collection in nxt-1-de054 to:
 * 1. Get UIDs for the target emails
 * 2. Verify users exist in Firebase Authentication
 * 3. Output UID mapping for migration
 *
 * Usage:
 *   cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend
 *   npx tsx scripts/migration/check-users-exist.ts
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// ─── Load target users ────────────────────────────────────────────────────────
const targetUsersPath = resolve(__dirname, './target-users.json');
const targetUsers = JSON.parse(readFileSync(targetUsersPath, 'utf-8'));
const targetEmails: string[] = targetUsers.targetEmails;

console.log(`\n🎯 Target emails to migrate: ${targetEmails.length}`);
targetEmails.forEach((email, i) => console.log(`  ${i + 1}. ${email}`));

// ─── Initialize Legacy Firebase ───────────────────────────────────────────────
const legacyProjectId = process.env['LEGACY_FIREBASE_PROJECT_ID']!;
const legacyClientEmail = process.env['LEGACY_FIREBASE_CLIENT_EMAIL']!;
const legacyPrivateKey = process.env['LEGACY_FIREBASE_PRIVATE_KEY']!.replace(/\\n/g, '\n');

if (!legacyProjectId || !legacyClientEmail || !legacyPrivateKey) {
  console.error('❌ Missing LEGACY Firebase credentials in .env');
  process.exit(1);
}

console.log(`\n🔥 Connecting to Legacy Firebase: ${legacyProjectId}`);

const legacyApp =
  getApps().find((a) => a.name === 'legacy') ??
  initializeApp(
    {
      credential: cert({
        projectId: legacyProjectId,
        clientEmail: legacyClientEmail,
        privateKey: legacyPrivateKey,
      }),
    },
    'legacy'
  );

const legacyDb = getFirestore(legacyApp);
const legacyAuth = getAuth(legacyApp);

// ─── Query Firestore for users ────────────────────────────────────────────────
async function checkUsersExist() {
  console.log('\n📊 Querying Firestore Users collection...\n');

  const results: Array<{
    email: string;
    uid: string | null;
    firestoreExists: boolean;
    authExists: boolean;
    firstName?: string;
    lastName?: string;
    role?: string;
  }> = [];

  for (const email of targetEmails) {
    try {
      // Query Firestore by email
      const usersSnapshot = await legacyDb
        .collection('Users')
        .where('email', '==', email)
        .limit(1)
        .get();

      if (usersSnapshot.empty) {
        console.log(`❌ ${email} - Not found in Firestore`);
        results.push({
          email,
          uid: null,
          firestoreExists: false,
          authExists: false,
        });
        continue;
      }

      const userDoc = usersSnapshot.docs[0];
      const firestoreUid = userDoc.id;
      const userData = userDoc.data();

      console.log(`✅ ${email}`);
      console.log(`   Firestore UID: ${firestoreUid}`);
      console.log(`   Name: ${userData.firstName || ''} ${userData.lastName || ''}`);
      console.log(`   Role: ${userData.role || userData.athleteOrParentOrCoach || 'N/A'}`);

      // Check Firebase Auth - try both methods
      let authExists = false;
      let authUid = null;
      let authEmail = null;

      // Method 1: Check by UID from Firestore
      try {
        const authUserByUid = await legacyAuth.getUser(firestoreUid);
        authExists = true;
        authUid = authUserByUid.uid;
        authEmail = authUserByUid.email || null;
        console.log(`   Auth UID: ${authUid} ✅`);
        console.log(`   Auth Email: ${authEmail || 'N/A'}`);

        if (authEmail && authEmail !== email) {
          console.log(`   ⚠️  WARNING: Email mismatch! Expected: ${email}, Auth has: ${authEmail}`);
        } else if (!authEmail) {
          console.log(`   ⚠️  WARNING: Auth record has no email!`);
        }
      } catch (authError) {
        console.log(`   Auth by UID: ❌ Not found`);

        // Method 2: Try by email as fallback
        try {
          const authUserByEmail = await legacyAuth.getUserByEmail(email);
          authExists = true;
          authUid = authUserByEmail.uid;
          authEmail = authUserByEmail.email || null;
          console.log(`   Auth UID (by email): ${authUid} ✅`);
          console.log(`   ⚠️  UID mismatch! Firestore: ${firestoreUid}, Auth: ${authUid}`);
        } catch (emailError) {
          console.log(`   Auth by Email: ❌ Not found either`);
        }
      }

      results.push({
        email,
        uid: authUid || firestoreUid, // Use Auth UID if exists, fallback to Firestore UID
        firestoreExists: true,
        authExists,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role || userData.athleteOrParentOrCoach,
      });

      console.log('');
    } catch (error) {
      console.error(`❌ Error checking ${email}:`, error);
      results.push({
        email,
        uid: null,
        firestoreExists: false,
        authExists: false,
      });
    }
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const firestoreCount = results.filter((r) => r.firestoreExists).length;
  const authCount = results.filter((r) => r.authExists).length;

  console.log(`Total target users: ${targetEmails.length}`);
  console.log(`Found in Firestore: ${firestoreCount}/${targetEmails.length}`);
  console.log(`Found in Auth: ${authCount}/${targetEmails.length}`);

  console.log('\n📝 UID Mapping:');
  results
    .filter((r) => r.uid)
    .forEach((r) => {
      console.log(`  ${r.email} → ${r.uid}`);
    });

  if (firestoreCount < targetEmails.length || authCount < targetEmails.length) {
    console.log('\n⚠️  WARNING: Some users are missing!');
    const missing = results.filter((r) => !r.firestoreExists || !r.authExists);
    missing.forEach((r) => {
      console.log(`  ❌ ${r.email} - Firestore: ${r.firestoreExists}, Auth: ${r.authExists}`);
    });
  } else {
    console.log('\n✅ All users found! Ready for migration.');
  }

  // ─── Write results to JSON ──────────────────────────────────────────────────
  const outputPath = resolve(__dirname, './user-uid-mapping.json');
  const fs = await import('fs/promises');
  await fs.writeFile(
    outputPath,
    JSON.stringify(
      {
        migrationId: targetUsers.migrationId,
        checkedAt: new Date().toISOString(),
        sourceProject: legacyProjectId,
        results,
      },
      null,
      2
    )
  );

  console.log(`\n💾 Results saved to: ${outputPath}`);
}

// ─── Run ──────────────────────────────────────────────────────────────────────
checkUsersExist()
  .then(() => {
    console.log('\n✅ Check complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
