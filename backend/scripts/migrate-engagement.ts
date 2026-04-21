/**
 * @fileoverview Migration: Posts.stats → Engagement collection
 * @description
 *   One-time script to move per-post engagement counters from the legacy
 *   `stats: { shares, views }` sub-map on each Posts document into the new
 *   universal `Engagement/{itemId}` collection.
 *
 *   Safe to run multiple times (idempotent) — uses set+merge so existing
 *   Engagement docs are not overwritten, only created where missing.
 *
 * Usage:
 *   npx tsx backend/scripts/migrate-engagement.ts
 *
 * After a successful run you can archive (not delete) the `stats` field from
 * Posts documents in a follow-up cleanup pass.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Firebase init ────────────────────────────────────────────────────────────

const SERVICE_ACCOUNT_PATH = resolve(
  __dirname,
  '../assets/nxt-1-staging-v2-firebase-adminsdk-fbsvc-0e09aefb3e.json'
);

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'))),
  });
}

const db = getFirestore();

// ─── Migration ────────────────────────────────────────────────────────────────

const POSTS_COLLECTION = 'Posts';
const ENGAGEMENT_COLLECTION = 'Engagement';
const BATCH_SIZE = 400; // Firestore batch limit is 500

async function migrateEngagement(): Promise<void> {
  console.log('Starting engagement migration…');

  let migrated = 0;
  let skipped = 0;
  const query = db.collection(POSTS_COLLECTION).limit(BATCH_SIZE);
  let lastDoc: FirebaseFirestore.DocumentSnapshot | null = null;

  for (;;) {
    const snap = await (lastDoc ? query.startAfter(lastDoc) : query).get();
    if (snap.empty) break;

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      const stats = data['stats'] as { shares?: number; views?: number } | undefined;

      // Skip posts that never had stats — Engagement doc will be created on
      // first real interaction via the new endpoints.
      if (!stats || (!(stats.shares ?? 0) && !(stats.views ?? 0))) {
        skipped++;
        continue;
      }

      const engRef = db.collection(ENGAGEMENT_COLLECTION).doc(doc.id);
      batch.set(
        engRef,
        {
          shares: stats.shares ?? 0,
          views: stats.views ?? 0,
        },
        { merge: true } // Don't overwrite if already migrated
      );

      batchCount++;
      migrated++;
    }

    if (batchCount > 0) await batch.commit();

    console.log(`  Processed ${snap.size} posts (migrated: ${migrated}, skipped: ${skipped})`);

    if (snap.size < BATCH_SIZE) break;
    lastDoc = snap.docs[snap.docs.length - 1] ?? null;
  }

  console.log(`\nMigration complete.`);
  console.log(`  Total migrated : ${migrated}`);
  console.log(`  Total skipped  : ${skipped} (no prior engagement data)`);
  console.log(`\nNext step: verify Engagement collection in Firestore console,`);
  console.log(`then run a cleanup pass to remove Posts.stats sub-maps.`);
}

migrateEngagement().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
