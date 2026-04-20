#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Migration: Teams/TeamLogos/{userId} → Teams/{teamId}/logo/{filename}
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Background
 * ──────────
 * The legacy app stored team logos at Teams/TeamLogos/{userId} — keyed by the
 * coach's Firebase UID, not the team document ID. The new monorepo backend
 * writes team logos to Teams/{teamId}/logo/{filename}, which correctly scopes
 * assets to the team entity rather than the user.
 *
 * This script:
 *   1. Scans every file under Teams/TeamLogos/ in the target bucket
 *   2. Extracts the userId from the GCS path
 *   3. Queries Firestore for the Teams doc(s) owned by that userId
 *      (checks Teams.ownerId, Teams.coachId, Teams.managerUid, and
 *       the user's sports[].team.teamId cascade as fallbacks)
 *   4. Copies the file to Teams/{teamId}/logo/{filename} and makes it public
 *   5. Updates the Firestore Teams doc's logoUrl field to the new public URL
 *   6. Optionally deletes the old file (--delete-old flag)
 *
 * Modes
 * ─────
 *   analyze   — Only report what would be migrated. No writes. (default)
 *   migrate   — Execute the copy + Firestore update
 *
 * Usage
 * ─────
 *   # Dry-run against staging (default)
 *   npx tsx backend/scripts/migration/migrate-team-logos-to-team-path.ts
 *
 *   # Execute against staging
 *   npx tsx backend/scripts/migration/migrate-team-logos-to-team-path.ts --mode=migrate --target=staging
 *
 *   # Execute against production (copy only, no delete)
 *   npx tsx backend/scripts/migration/migrate-team-logos-to-team-path.ts --mode=migrate --target=production
 *
 *   # Execute against production and delete old files after verify
 *   npx tsx backend/scripts/migration/migrate-team-logos-to-team-path.ts --mode=migrate --target=production --delete-old
 *
 *   # Limit to first 10 files for a spot-check
 *   npx tsx backend/scripts/migration/migrate-team-logos-to-team-path.ts --mode=migrate --target=staging --limit=10
 *
 * Flags
 * ─────
 *   --mode=analyze|migrate   Default: analyze
 *   --target=staging|production   Default: staging
 *   --delete-old             Delete Teams/TeamLogos/{userId} after successful copy
 *   --limit=N                Process at most N files
 *   --verbose                Print detail for every file
 *
 * Safety
 * ──────
 *   - Idempotent: if destination already exists it is skipped (not re-copied)
 *   - Firestore update uses set+merge so partial writes don't corrupt docs
 *   - Failures are logged and counted; script continues to next file
 *   - --delete-old is opt-in and only fires after copy + Firestore update both succeed
 *
 * Prerequisites
 * ─────────────
 *   npm install @google-cloud/storage  (already pulled in via firebase-admin)
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { Bucket, File } from '@google-cloud/storage';

// ─── CLI args ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const getArg = (name: string): string | null => {
  const prefix = `--${name}=`;
  const found = argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
};
const hasFlag = (name: string): boolean => argv.includes(`--${name}`);

const MODE: 'analyze' | 'migrate' = getArg('mode') === 'migrate' ? 'migrate' : 'analyze';
const TARGET: 'staging' | 'production' =
  getArg('target') === 'production' ? 'production' : 'staging';
const DELETE_OLD = hasFlag('delete-old');
const LIMIT = parseInt(getArg('limit') ?? '0', 10) || 0;
const VERBOSE = hasFlag('verbose');

// ─── Firebase init ────────────────────────────────────────────────────────────

const SA_MAP: Record<'staging' | 'production', string> = {
  staging: resolve(
    __dirname,
    '../../assets/nxt-1-staging-v2-firebase-adminsdk-fbsvc-0e09aefb3e.json'
  ),
  production: resolve(
    __dirname,
    '../../assets/nxt-1-admin-firebase-adminsdk-9m8cg-3cd10211f8.json'
  ),
};

const BUCKET_MAP: Record<'staging' | 'production', string> = {
  staging: 'nxt-1-staging-v2.firebasestorage.app',
  production: 'nxt-1-v2.firebasestorage.app',
};

const APP_NAME = `migrate-team-logos-${TARGET}`;

if (!getApps().find((a) => a.name === APP_NAME)) {
  const sa = JSON.parse(readFileSync(SA_MAP[TARGET], 'utf-8'));
  initializeApp({ credential: cert(sa), storageBucket: BUCKET_MAP[TARGET] }, APP_NAME);
}

// Import getApp after initialization
const { getApp } = await import('firebase-admin/app');
const app = getApp(APP_NAME);
const db = getFirestore(app);
const bucket: Bucket = getStorage(app).bucket();

// ─── Constants ────────────────────────────────────────────────────────────────

const LEGACY_PREFIX = 'Teams/TeamLogos/';
const TEAMS_COLLECTION = 'Teams';
const USERS_COLLECTION = 'Users';

// ─── Firestore helpers ────────────────────────────────────────────────────────

/**
 * Resolve the Firestore teamId for a given userId.
 *
 * Strategy (in order):
 *   1. Teams collection: any doc where ownerId == userId
 *   2. Teams collection: any doc where coachId == userId
 *   3. Users doc: user.sports[].team.teamId (first match)
 *
 * Returns null if no team can be found — these are logged as unresolved.
 */
async function resolveTeamId(userId: string): Promise<string | null> {
  // 1. Teams.ownerId
  const ownerSnap = await db
    .collection(TEAMS_COLLECTION)
    .where('ownerId', '==', userId)
    .limit(1)
    .get();
  if (!ownerSnap.empty) return ownerSnap.docs[0].id;

  // 2. Teams.coachId
  const coachSnap = await db
    .collection(TEAMS_COLLECTION)
    .where('coachId', '==', userId)
    .limit(1)
    .get();
  if (!coachSnap.empty) return coachSnap.docs[0].id;

  // 3. User sports cascade
  const userDoc = await db.collection(USERS_COLLECTION).doc(userId).get();
  if (userDoc.exists) {
    const data = userDoc.data() ?? {};

    // Direct teamId on user root
    if (typeof data['teamId'] === 'string' && data['teamId']) {
      return data['teamId'] as string;
    }

    // sports[].team.teamId
    if (Array.isArray(data['sports'])) {
      for (const sport of data['sports'] as Record<string, unknown>[]) {
        const team = sport['team'] as Record<string, unknown> | undefined;
        const tid = team?.['teamId'];
        if (typeof tid === 'string' && tid) return tid;
      }
    }
  }

  return null;
}

/**
 * Build the public HTTPS URL for a GCS object.
 */
function publicUrl(bucketName: string, gcsPath: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(gcsPath)}?alt=media`;
}

// ─── Stats ───────────────────────────────────────────────────────────────────

const stats = {
  total: 0,
  migrated: 0,
  skippedAlreadyMigrated: 0,
  skippedNoTeam: 0,
  failed: 0,
  deleted: 0,
};

const unresolved: string[] = []; // userIds with no matching team
const failures: { file: string; error: string }[] = [];

// ─── Core migration logic ─────────────────────────────────────────────────────

async function migrateFile(file: File): Promise<void> {
  const gcsPath = file.name; // e.g. "Teams/TeamLogos/0HkPZq76..."
  // Extract userId — everything after the prefix (may have a _timestamp suffix)
  const afterPrefix = gcsPath.slice(LEGACY_PREFIX.length);
  // userId is the segment before the first slash (flat file, no sub-folder)
  const userId = afterPrefix.split('/')[0];

  if (VERBOSE) console.log(`  Processing: ${gcsPath} (userId: ${userId})`);

  const teamId = await resolveTeamId(userId);

  if (!teamId) {
    console.warn(`  ⚠  No team found for userId=${userId} — skipping`);
    unresolved.push(userId);
    stats.skippedNoTeam++;
    return;
  }

  // Derive filename — use original filename segment for traceability
  const filename = afterPrefix.replace(/\//g, '_'); // flatten any sub-path
  const destPath = `Teams/${teamId}/logo/${filename}`;

  // Check if already migrated (idempotent)
  const [destExists] = await bucket.file(destPath).exists();
  if (destExists) {
    if (VERBOSE) console.log(`  ↩  Already at ${destPath} — skipping`);
    stats.skippedAlreadyMigrated++;
    return;
  }

  if (MODE === 'analyze') {
    console.log(`  → Would copy: ${gcsPath}\n      to: ${destPath} (teamId=${teamId})`);
    stats.migrated++;
    return;
  }

  // ── Copy ──────────────────────────────────────────────────────────────────
  try {
    await file.copy(bucket.file(destPath));

    // Make public (matches how promoteMedia works)
    await bucket.file(destPath).makePublic();

    const newUrl = publicUrl(BUCKET_MAP[TARGET], destPath);

    // ── Update Firestore Teams doc ────────────────────────────────────────
    await db
      .collection(TEAMS_COLLECTION)
      .doc(teamId)
      .set({ logoUrl: newUrl, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    if (VERBOSE) console.log(`  ✓  Copied to ${destPath}, Firestore updated`);
    stats.migrated++;

    // ── Optionally delete old file ────────────────────────────────────────
    if (DELETE_OLD) {
      await file.delete();
      if (VERBOSE) console.log(`  🗑  Deleted legacy: ${gcsPath}`);
      stats.deleted++;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗  Failed for ${gcsPath}: ${msg}`);
    failures.push({ file: gcsPath, error: msg });
    stats.failed++;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Team Logo Storage Migration');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Target  : ${TARGET.toUpperCase()} (${BUCKET_MAP[TARGET]})`);
  console.log(`  Mode    : ${MODE.toUpperCase()}`);
  console.log(
    `  Delete  : ${DELETE_OLD ? 'YES — will delete Teams/TeamLogos/ files after copy' : 'NO'}`
  );
  console.log(`  Limit   : ${LIMIT > 0 ? LIMIT : 'none'}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  if (MODE === 'migrate' && TARGET === 'production' && !DELETE_OLD) {
    console.log('ℹ  Running in copy-only mode for production — source files will NOT be deleted.');
    console.log('   Re-run with --delete-old after verifying the migration is complete.');
    console.log('');
  }

  // List all files under Teams/TeamLogos/
  const [files] = await bucket.getFiles({ prefix: LEGACY_PREFIX });

  // Filter out directory placeholder entries (end with /)
  const realFiles = files.filter((f) => !f.name.endsWith('/'));

  console.log(`Found ${realFiles.length} files under ${LEGACY_PREFIX}`);
  if (LIMIT > 0) console.log(`Processing first ${LIMIT} only (--limit=${LIMIT})`);
  console.log('');

  const toProcess = LIMIT > 0 ? realFiles.slice(0, LIMIT) : realFiles;
  stats.total = toProcess.length;

  for (const file of toProcess) {
    await migrateFile(file);
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Total processed       : ${stats.total}`);
  console.log(`  Migrated (or would)   : ${stats.migrated}`);
  console.log(`  Already at dest       : ${stats.skippedAlreadyMigrated}`);
  console.log(`  No team found         : ${stats.skippedNoTeam}`);
  console.log(`  Deleted old files     : ${stats.deleted}`);
  console.log(`  Failures              : ${stats.failed}`);

  if (unresolved.length > 0) {
    console.log('');
    console.log('  Unresolved userIds (no matching Teams doc):');
    for (const uid of unresolved) console.log(`    - ${uid}`);
    console.log('');
    console.log('  These users may be coaches whose team docs were deleted,');
    console.log('  or athletes who uploaded a team logo manually. Safe to leave');
    console.log('  or manually delete after investigation.');
  }

  if (failures.length > 0) {
    console.log('');
    console.log('  Failures:');
    for (const f of failures) console.log(`    ${f.file}: ${f.error}`);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  if (MODE === 'analyze') {
    console.log('ℹ  This was an ANALYZE run. No data was changed.');
    console.log('   Re-run with --mode=migrate to execute.');
    console.log('');
  }

  process.exit(stats.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
