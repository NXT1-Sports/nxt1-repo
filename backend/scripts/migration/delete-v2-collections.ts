#!/usr/bin/env npx tsx
/**
 * Delete stale collections from nxt-1-v2 before re-migration.
 * Usage: npx tsx backend/scripts/migration/delete-v2-collections.ts
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp(
  {
    credential: cert({
      projectId: process.env['FIREBASE_PROJECT_ID'],
      clientEmail: process.env['FIREBASE_CLIENT_EMAIL'],
      privateKey: process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
    }),
  },
  'delete-app'
);

const db = getFirestore(app);

async function deleteCollection(name: string): Promise<void> {
  let deleted = 0;
  while (true) {
    const snap = await db.collection(name).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.docs.length;
    process.stdout.write(`\r  ${name}: ${deleted} deleted...`);
  }
  console.log(`\r  ✅ ${name}: ${deleted} docs deleted           `);
}

const COLS = [
  // Uppercase (correct name but wrong data)
  'Users',
  'Organizations',
  'Teams',
  'RosterEntries',
  'BillingContexts',
  'Posts',
  'PlayerStats',
  'GameStats',
  'Recruiting',
  // Lowercase (wrong collection names from old migration)
  'posts',
  'playerStats',
  'gameStats',
  'billingContexts',
  'recruiting',
];

console.log('Deleting stale collections from nxt-1-v2...\n');
for (const col of COLS) {
  await deleteCollection(col);
}
console.log('\n✅ All done. Ready for re-migration.');
process.exit(0);
