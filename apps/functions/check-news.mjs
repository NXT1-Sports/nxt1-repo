#!/usr/bin/env node
/** Quick check: list all docs in the News collection on staging */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const saPath = new URL(
  '../../../nxt1-backend/assets/nxt-1-staging-firebase-adminsdk-etj9j-aa600cd843.json',
  import.meta.url
);
const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
console.log('Project ID from SA key:', sa.project_id);

initializeApp({ credential: cert(sa) });
const db = getFirestore();

const snap = await db.collection('News').get();
console.log(`\nTotal docs in News collection: ${snap.size}\n`);

for (const doc of snap.docs) {
  const d = doc.data();
  console.log(`ID: ${doc.id}`);
  console.log(`  title: ${(d.title ?? '(none)').slice(0, 80)}`);
  console.log(`  expiresAt: ${d.expiresAt ? d.expiresAt.toDate().toISOString() : 'MISSING'}`);
  console.log(`  source: ${d.source ?? d.category ?? '(none)'}`);
  console.log();
}
