#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Rebuild Unicodes Collection (nxt-1-v2)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Steps performed:
 *   1. Delete every User document whose email contains "test" or "demo"
 *   2. Clear the entire Unicodes collection
 *   3. Re-create one Unicodes/{unicode} doc for every remaining User
 *      that has a non-empty `unicode` field
 *
 * Usage:
 *   npx tsx backend/scripts/migration/rebuild-unicodes.ts --target=production
 *   npx tsx backend/scripts/migration/rebuild-unicodes.ts --target=production --dry-run
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../.env') });

import { initTargetApp, isDryRun, getTarget, printBanner } from './migration-utils.js';
import { Timestamp } from 'firebase-admin/firestore';

// ─── Config ───────────────────────────────────────────────────────────────────

const DRY = isDryRun;
const BATCH_SIZE = 400;
const PAGE_SIZE = 500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function deleteCollection(db: FirebaseFirestore.Firestore, name: string): Promise<number> {
  let total = 0;

  if (DRY) {
    // Dry-run: paginate with cursor to count without deleting
    let cursor: FirebaseFirestore.DocumentSnapshot | undefined;
    while (true) {
      let q = db.collection(name).limit(BATCH_SIZE) as FirebaseFirestore.Query;
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) break;
      total += snap.docs.length;
      cursor = snap.docs[snap.docs.length - 1];
      process.stdout.write(`\r  [DRY] ${name}: ${total} docs counted...`);
    }
    process.stdout.write(`\r  [DRY] ${name}: ${total} docs would be deleted          \n`);
    return total;
  }

  // Live: in-place delete (no cursor — same top-400 docs until collection empty)
  while (true) {
    const snap = await db.collection(name).limit(BATCH_SIZE).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.docs.length;
    process.stdout.write(`\r  ${name}: ${total} deleted...`);
  }
  process.stdout.write(`\r  ✅ ${name}: ${total} docs deleted          \n`);
  return total;
}

// ─── Step 1: Remove test/demo Users ──────────────────────────────────────────

async function removeTestDemoUsers(db: FirebaseFirestore.Firestore): Promise<number> {
  console.log('\n── Step 1: Remove test/demo Users ─────────────────────────────');

  let cursor: FirebaseFirestore.DocumentSnapshot | undefined;
  const toDelete: string[] = [];
  let scanned = 0;

  while (true) {
    let q = db
      .collection('Users')
      .orderBy('createdAt', 'asc')
      .limit(PAGE_SIZE) as FirebaseFirestore.Query;
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();
    if (snap.empty) break;
    scanned += snap.docs.length;

    for (const doc of snap.docs) {
      const email: string = (doc.data()['email'] as string | undefined)?.toLowerCase() ?? '';
      if (email.includes('test') || email.includes('demo')) {
        console.log(`  🗑  ${email}  (uid: ${doc.id})`);
        toDelete.push(doc.id);
      }
    }

    cursor = snap.docs[snap.docs.length - 1];
  }

  console.log(`\n  Scanned: ${scanned} Users  |  To delete: ${toDelete.length}`);

  if (toDelete.length > 0 && !DRY) {
    for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
      const batch = db.batch();
      toDelete
        .slice(i, i + BATCH_SIZE)
        .forEach((uid) => batch.delete(db.collection('Users').doc(uid)));
      await batch.commit();
    }
    console.log(`  ✅ Deleted ${toDelete.length} test/demo User docs`);
  } else if (DRY) {
    console.log(`  [DRY] Would delete ${toDelete.length} User docs`);
  }

  return toDelete.length;
}

// ─── Step 2: Clear Unicodes collection ───────────────────────────────────────

async function clearUnicodes(db: FirebaseFirestore.Firestore): Promise<number> {
  console.log('\n── Step 2: Clear Unicodes collection ──────────────────────────');
  return deleteCollection(db, 'Unicodes');
}

// ─── Step 3: Rebuild Unicodes from Users ─────────────────────────────────────

async function rebuildUnicodes(db: FirebaseFirestore.Firestore): Promise<void> {
  console.log('\n── Step 3: Rebuild Unicodes from Users ────────────────────────');

  let cursor: FirebaseFirestore.DocumentSnapshot | undefined;
  let created = 0;
  let noUnicode = 0;
  let errors = 0;

  while (true) {
    let q = db
      .collection('Users')
      .orderBy('createdAt', 'asc')
      .limit(PAGE_SIZE) as FirebaseFirestore.Query;
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
      const d = doc.data();
      const uid = doc.id;
      const unicodeVal = d['unicode'];

      if (!unicodeVal || typeof unicodeVal !== 'string' || !unicodeVal.trim()) {
        noUnicode++;
        continue;
      }

      const unicode = unicodeVal.trim();

      // Resolve createdAt
      let createdAt: Timestamp = Timestamp.now();
      const raw = d['createdAt'];
      if (raw instanceof Timestamp) {
        createdAt = raw;
      } else if (raw && typeof (raw as { toDate?: () => Date }).toDate === 'function') {
        createdAt = Timestamp.fromDate((raw as { toDate: () => Date }).toDate());
      }

      const unicodeRef = db.collection('Unicodes').doc(unicode);
      batch.set(unicodeRef, {
        used: true,
        userId: uid,
        createdAt,
        assignedAt: createdAt,
      });

      batchCount++;
      created++;
      process.stdout.write(`\r  Creating Unicodes: ${created}...`);
    }

    if (batchCount > 0 && !DRY) {
      try {
        await batch.commit();
      } catch (err) {
        errors++;
        console.error(`\n  ❌ Batch commit error: ${err instanceof Error ? err.message : err}`);
      }
    }

    cursor = snap.docs[snap.docs.length - 1];
  }

  process.stdout.write('\n');
  console.log(`  ✅ Created: ${created}  |  No-unicode users: ${noUnicode}  |  Errors: ${errors}`);
  if (DRY) console.log(`  [DRY] Nothing written`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  printBanner('Rebuild Unicodes');
  console.log(`  Target  : ${getTarget()}`);
  console.log(`  Dry run : ${DRY}`);

  const { db } = initTargetApp();

  const removedUsers = await removeTestDemoUsers(db);
  const clearedUnicodes = await clearUnicodes(db);
  await rebuildUnicodes(db);

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  DONE');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Test/demo Users removed : ${removedUsers}`);
  console.log(`  Unicodes cleared        : ${clearedUnicodes}`);
  console.log('');
}

main().catch((err) => {
  console.error('\n[FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});
