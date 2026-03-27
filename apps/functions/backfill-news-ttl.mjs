#!/usr/bin/env node
/**
 * Backfill: adds expiresAt to existing News docs that are missing it,
 * then triggers the full dailyPulseUpdates pipeline to generate fresh articles.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const ARTICLE_TTL_DAYS = 14;
const NEWS_COLLECTION = 'News';

const saPath = new URL(
  '../../../nxt1-backend/assets/nxt-1-de054-firebase-adminsdk-w01w0-2bab8ae108.json',
  import.meta.url
);
const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

async function run() {
  // 1. Backfill expiresAt on existing docs
  console.log('1. Checking for News docs missing expiresAt...');
  const allDocs = await db.collection(NEWS_COLLECTION).get();
  console.log(`   Found ${allDocs.size} total docs in News collection`);

  let backfilled = 0;
  const batch = db.batch();
  for (const doc of allDocs.docs) {
    const data = doc.data();
    if (!data.expiresAt) {
      // Give them 14 days from NOW (not from their original publishedAt)
      const expiresAt = Timestamp.fromDate(
        new Date(Date.now() + ARTICLE_TTL_DAYS * 24 * 60 * 60 * 1000)
      );
      batch.update(doc.ref, { expiresAt });
      backfilled++;
    }
  }

  if (backfilled > 0) {
    await batch.commit();
    console.log(`   ✅ Backfilled expiresAt on ${backfilled} docs\n`);
  } else {
    console.log('   All docs already have expiresAt\n');
  }

  // 2. Verify they're now visible
  console.log('2. Verifying backend query returns articles...');
  const visible = await db
    .collection(NEWS_COLLECTION)
    .where('expiresAt', '>', Timestamp.now())
    .orderBy('publishedAt', 'desc')
    .get();
  console.log(`   ✅ ${visible.size} articles now visible to the app`);
  for (const doc of visible.docs) {
    const d = doc.data();
    console.log(`      - [${d.sport}] ${d.title?.slice(0, 60)}...`);
  }
}

run().catch((err) => {
  console.error('❌ Failed:', err.message ?? err);
  process.exit(1);
});
