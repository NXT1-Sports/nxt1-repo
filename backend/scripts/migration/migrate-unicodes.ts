#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Migrate Unicodes — Legacy Users → Unicodes collection in staging
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Reads the migrated users from the staging `Users` collection, extracts their
 * `unicode` field, and creates the corresponding document in the `Unicodes`
 * collection with the same shape used by the V3 system.
 *
 * Usage:
 *   npx tsx scripts/migration/migrate-unicodes.ts
 *   npx tsx scripts/migration/migrate-unicodes.ts --dry-run
 *   npx tsx scripts/migration/migrate-unicodes.ts --target-users
 *
 * Flags:
 *   --dry-run       Log what would be written but write nothing
 *   --target-users  Only process the 6 canary users (from user-uid-mapping.json)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { Timestamp } from 'firebase-admin/firestore';
import { initTargetApp, isDryRun, hasFlag, COLLECTIONS, printBanner } from './migration-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  printBanner('Unicodes Migration');

  const dryRun = isDryRun;
  const targetUsersOnly = hasFlag('target-users');

  console.log(`  Mode     : ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Scope    : ${targetUsersOnly ? 'canary users only' : 'all migrated users'}`);
  console.log();

  // ── Init Firebase ──────────────────────────────────────────────────────────
  const { db: targetDb } = initTargetApp();

  // ── Determine which UIDs to process ───────────────────────────────────────
  let targetUids: Set<string> | null = null;
  if (targetUsersOnly) {
    const mappingPath = resolve(__dirname, 'user-uid-mapping.json');
    const mapping = JSON.parse(readFileSync(mappingPath, 'utf8'));
    targetUids = new Set<string>((mapping.results as { uid: string }[]).map((r) => r.uid));
    console.log(`  Target UIDs: ${[...targetUids].join(', ')}\n`);
  }

  // ── Fetch users from staging Users collection ──────────────────────────────
  console.log(`Fetching users from staging ${COLLECTIONS.USERS} collection...`);
  const query = targetDb.collection(COLLECTIONS.USERS) as FirebaseFirestore.Query;
  const snapshot = await query.get();

  const users = snapshot.docs.filter((doc) => {
    if (targetUids && !targetUids.has(doc.id)) return false;
    return true;
  });

  console.log(`  Found ${users.length} user(s) to process\n`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const userDoc of users) {
    const data = userDoc.data();
    const uid = userDoc.id;
    const email = data['email'] || uid;
    const unicode: string | undefined =
      typeof data['unicode'] === 'string' && data['unicode'].trim()
        ? data['unicode'].trim()
        : undefined;

    if (!unicode) {
      console.log(`  ⚠  SKIP  ${email} — no unicode field`);
      skipped++;
      continue;
    }

    // Unicodes document ID is the unicode string (numeric string like "20846078")
    const unicodeDocRef = targetDb.collection('Unicodes').doc(unicode);

    // Check if already exists
    const existing = await unicodeDocRef.get();
    if (existing.exists) {
      console.log(`  ✔  EXISTS ${email} — Unicodes/${unicode} already present`);
      skipped++;
      continue;
    }

    // Build the Unicodes document
    const now = Timestamp.now();
    // Use user's createdAt if available, otherwise now
    let createdAt: Timestamp = now;
    if (data['createdAt'] instanceof Timestamp) {
      createdAt = data['createdAt'];
    } else if (
      data['createdAt'] &&
      typeof (data['createdAt'] as { toDate?: () => Date }).toDate === 'function'
    ) {
      createdAt = Timestamp.fromDate((data['createdAt'] as { toDate: () => Date }).toDate());
    }

    const unicodeDoc = {
      assignedAt: createdAt,
      createdAt: createdAt,
      used: true,
      userId: uid,
    };

    console.log(`  ${dryRun ? '[DRY]' : '➜ '} ${email} → Unicodes/${unicode}  (userId: ${uid})`);

    if (!dryRun) {
      try {
        await unicodeDocRef.set(unicodeDoc);
        migrated++;
      } catch (err) {
        console.error(`  ✗  ERROR ${email}: ${(err as Error).message}`);
        errors++;
      }
    } else {
      migrated++;
    }
  }

  console.log();
  console.log('═══════════════════════════════════════════════');
  console.log(`  Migrated : ${migrated}`);
  console.log(`  Skipped  : ${skipped}`);
  console.log(`  Errors   : ${errors}`);
  console.log('═══════════════════════════════════════════════');

  if (dryRun) {
    console.log('\n  DRY RUN — no data was written');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
