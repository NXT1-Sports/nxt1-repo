/**
 * @fileoverview Reseed specific users in staging with updated data models
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/reseed-staging-users.ts
 *
 * This script updates the specified staging users with:
 * - profileImgs array instead of profileImg
 * - Sport-tagged data across all collections
 * - Full seed data for testing
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Target user IDs to reseed
const TARGET_USER_IDS = ['kjm7AJieFNWYkmTp2HOmYp4r8E3', '05naPoH3KWZftqsdZr7IVwxLHqo2'];

// ─── Firebase init (staging) ──────────────────────────────────────────────────
const projectId = process.env['STAGING_FIREBASE_PROJECT_ID']!;
const clientEmail = process.env['STAGING_FIREBASE_CLIENT_EMAIL']!;
const privateKey = process.env['STAGING_FIREBASE_PRIVATE_KEY']!.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('[reseed-staging] Missing STAGING Firebase credentials in .env');
  process.exit(1);
}

const appName = `reseed-staging-${Date.now()}`;
const app =
  getApps().find((a) => a.name === appName) ??
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, appName);
const db = getFirestore(app);

// ─── Main reseed function ─────────────────────────────────────────────────────
async function reseedUser(userId: string): Promise<void> {
  console.log(`\n🔄 Reseeding user ${userId} in staging...`);

  const userRef = db.collection('Users').doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    console.error(`  ❌ User ${userId} not found in Firestore`);
    return;
  }

  const userData = userDoc.data() as Record<string, unknown>;
  console.log(`  ✓ Found user: ${userData['firstName']} ${userData['lastName']}`);

  // ─── Update profileImg to profileImgs ───────────────────────────────────────
  const updates: Record<string, unknown> = {};

  // Migrate profileImg (string) to profileImgs (array)
  if (userData['profileImg'] && typeof userData['profileImg'] === 'string') {
    const existingImgs = (userData['profileImgs'] as string[] | undefined) || [];
    const profileImg = userData['profileImg'] as string;

    // Only add if not already in array
    if (!existingImgs.includes(profileImg)) {
      updates['profileImgs'] = [profileImg, ...existingImgs];
      console.log(`  ✓ Migrated profileImg to profileImgs array`);
    }
  }

  // Ensure all sports have proper sport names (lowercase for filtering)
  if (Array.isArray(userData['sports'])) {
    const sports = userData['sports'] as Array<Record<string, unknown>>;
    updates['sports'] = sports.map((sport) => ({
      ...sport,
      // Ensure sport name is properly set for filtering
      sport: sport['sport'] || 'Football',
    }));
    console.log(`  ✓ Validated ${sports.length} sport profiles`);
  }

  updates['updatedAt'] = new Date().toISOString();

  // Apply updates
  if (Object.keys(updates).length > 0) {
    await userRef.update(updates);
    console.log(`  ✅ Updated ${Object.keys(updates).length} fields`);
  }

  /*
  // ─── Tag existing posts, videos, schedule with sport ────────────────────────
  await tagSubcollectionWithSport(userRef, 'timeline', userData);
  await tagSubcollectionWithSport(userRef, 'videos', userData);
  await tagSubcollectionWithSport(userRef, 'schedule', userData);
  await tagSubcollectionWithSport(userRef, 'recruiting', userData);
  */

  console.log(`  ✅ Completed reseeding for user ${userId}`);
}

/*
/**
 * Tag subcollection documents with sport field if missing
 * /
async function tagSubcollectionWithSport(
  userRef: FirebaseFirestore.DocumentReference,
  collectionName: string,
  userData: Record<string, unknown>
): Promise<void> {
  const subcollection = userRef.collection(collectionName);
  const snapshot = await subcollection.limit(100).get();

  if (snapshot.empty) {
    console.log(`  ⊘ No ${collectionName} documents to tag`);
    return;
  }

  // Get primary sport name
  const sports = (userData['sports'] as Array<Record<string, unknown>>) || [];
  const primarySport = sports.find((s) => (s['order'] as number) === 0) || sports[0];
  const sportName = (primarySport?.['sport'] as string) || 'Football';

  let updated = 0;
  const batch = db.batch();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data['sport'] && !data['sportId']) {
      batch.update(doc.ref, {
        sport: sportName,
        sportId: sportName.toLowerCase(),
        updatedAt: new Date().toISOString(),
      });
      updated++;
    }
  }

  if (updated > 0) {
    await batch.commit();
    console.log(`  ✓ Tagged ${updated} ${collectionName} documents with sport: ${sportName}`);
  } else {
    console.log(`  ⊘ All ${collectionName} documents already tagged`);
  }
}
*/

// ─── Main execution ───────────────────────────────────────────────────────────
(async () => {
  try {
    console.log(`\n🚀 Reseeding ${TARGET_USER_IDS.length} users in STAGING`);
    console.log(`   Project: ${projectId}\n`);

    for (const userId of TARGET_USER_IDS) {
      await reseedUser(userId);
    }

    console.log(`\n✅ Reseed complete for all users`);
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Reseed failed:', err);
    process.exit(1);
  }
})();
