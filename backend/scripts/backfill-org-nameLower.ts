/**
 * Backfill script: Add `nameLower` field to all existing Organizations.
 *
 * Usage:
 *   npx tsx backend/scripts/backfill-org-nameLower.ts
 *
 * This writes `nameLower = name.toLowerCase()` to every Organization doc
 * that doesn't already have the field. It processes in batches of 500
 * (Firestore batch write limit).
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env['STAGING_FIREBASE_PROJECT_ID']!;
const clientEmail = process.env['STAGING_FIREBASE_CLIENT_EMAIL']!;
const privateKey = process.env['STAGING_FIREBASE_PRIVATE_KEY']!.replace(/\\n/g, '\n');

const app = initializeApp(
  {
    credential: cert({ projectId, clientEmail, privateKey }),
  },
  'backfill-nameLower-' + Date.now()
);

const db = getFirestore(app);

async function backfill(): Promise<void> {
  const COLLECTION = 'Organizations';
  const BATCH_SIZE = 500;

  const snapshot = await db.collection(COLLECTION).get();

  console.log(`Found ${snapshot.size} organizations. Starting backfill...`);

  let updated = 0;
  let skipped = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const name: string = data['name'] ?? '';

    // Skip if nameLower already exists and matches
    if (data['nameLower'] === name.toLowerCase()) {
      skipped++;
      continue;
    }

    batch.update(doc.ref, { nameLower: name.toLowerCase() });
    updated++;
    batchCount++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      console.log(`  Committed batch of ${batchCount} updates (${updated} total)`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  // Commit remaining
  if (batchCount > 0) {
    await batch.commit();
    console.log(`  Committed final batch of ${batchCount} updates`);
  }

  console.log(`\nBackfill complete: ${updated} updated, ${skipped} already up-to-date.`);
}

backfill()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
