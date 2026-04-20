#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Migration: Teams/TeamLogos/{file} → Teams/{teamId}/logo/{file}
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Background
 * ──────────
 * The legacy app stored team logos at Teams/TeamLogos/{userId_timestamp} — keyed
 * by the coach's UID, not the team document ID. The new backend writes team logos
 * to Teams/{teamId}/logo/{filename}, scoping assets to the team entity.
 *
 * Approach (Firestore-first — reliable, no userId lookup needed)
 * ──────────────────────────────────────────────────────────────
 *   1. Paginate through ALL Teams Firestore docs
 *   2. For each doc, check if `logoUrl` or `teamLogoImg` points to the legacy path
 *      (contains "Teams/TeamLogos" or "TeamLogos%2F")
 *   3. Extract the GCS object path from the URL
 *   4. Copy the GCS file → Teams/{teamId}/logo/{filename}, make public
 *   5. Update Firestore: set logoUrl = new URL, delete deprecated teamLogoImg field
 *   6. Optionally delete the old GCS file (--delete-old flag)
 *
 * Modes
 * ─────
 *   analyze   — Only report what would be migrated. No writes. (default)
 *   migrate   — Execute the copy + Firestore update
 *
 * Usage
 * ─────
 *   # Dry-run against production
 *   npx tsx backend/scripts/migration/migrate-team-logos-to-team-path.ts --target=production
 *
 *   # Execute against production (copy only, no delete)
 *   npx tsx backend/scripts/migration/migrate-team-logos-to-team-path.ts --mode=migrate --target=production
 *
 *   # Execute and delete old files after verify
 *   npx tsx backend/scripts/migration/migrate-team-logos-to-team-path.ts --mode=migrate --target=production --delete-old
 *
 *   # Limit to first 10 docs for a spot-check
 *   npx tsx backend/scripts/migration/migrate-team-logos-to-team-path.ts --mode=migrate --target=production --limit=10 --verbose
 *
 * Flags
 * ─────
 *   --mode=analyze|migrate        Default: analyze
 *   --target=staging|production   Default: staging
 *   --delete-old                  Delete old GCS file after successful copy
 *   --limit=N                     Process at most N Teams docs with old logos
 *   --verbose                     Print detail for every doc
 *
 * Safety
 * ──────
 *   - Idempotent: if destination already exists, skips GCS copy but still fixes Firestore
 *   - Firestore update uses set+merge so partial writes don't corrupt docs
 *   - Failures are logged and counted; script continues to next doc
 *   - --delete-old is opt-in and only fires after copy + Firestore update succeed
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
import type { Bucket } from '@google-cloud/storage';

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

const { getApp } = await import('firebase-admin/app');
const app = getApp(APP_NAME);
const db = getFirestore(app);
const bucket: Bucket = getStorage(app).bucket();

// ─── Constants ────────────────────────────────────────────────────────────────

const TEAMS_COLLECTION = 'Teams';
const BUCKET_NAME = BUCKET_MAP[TARGET];
const LEGACY_PATH_MARKERS = ['Teams/TeamLogos/', 'Teams%2FTeamLogos%2F', 'TeamLogos%2F'];

// ─── URL helpers ──────────────────────────────────────────────────────────────

/** Returns true if the URL points to the legacy Teams/TeamLogos/ path. */
function isLegacyUrl(url: string): boolean {
  if (!url) return false;
  return LEGACY_PATH_MARKERS.some((marker) => url.includes(marker));
}

/**
 * Extract the GCS object path from a Firebase Storage public URL.
 * Input:  https://firebasestorage.googleapis.com/v0/b/{bucket}/o/Teams%2FTeamLogos%2F{name}?alt=media
 * Output: Teams/TeamLogos/{name}
 */
function extractGcsPath(url: string): string | null {
  try {
    const u = new URL(url);
    // pathname: /v0/b/{bucket}/o/{encoded-path}
    const parts = u.pathname.split('/o/');
    if (parts.length < 2) return null;
    return decodeURIComponent(parts[1]);
  } catch {
    return null;
  }
}

/** Build the public HTTPS URL for a GCS object. */
function publicUrl(gcsPath: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET_NAME}/o/${encodeURIComponent(gcsPath)}?alt=media`;
}

// ─── Stats ───────────────────────────────────────────────────────────────────

const stats = {
  docsScanned: 0,
  needsMigration: 0,
  migrated: 0,
  skippedAlreadyMigrated: 0,
  skippedMissingFile: 0,
  failed: 0,
  deleted: 0,
};

const failures: { teamId: string; error: string }[] = [];

// ─── Core migration logic ─────────────────────────────────────────────────────

async function migrateTeamDoc(
  teamId: string,
  logoUrl: string | undefined,
  teamLogoImg: string | undefined
): Promise<void> {
  // Pick whichever field has the legacy URL (prefer logoUrl)
  const legacyUrl = isLegacyUrl(logoUrl ?? '') ? logoUrl! : teamLogoImg!;

  const gcsPath = extractGcsPath(legacyUrl);
  if (!gcsPath) {
    console.warn(`  ⚠  Could not extract GCS path for teamId=${teamId}: ${legacyUrl}`);
    stats.failed++;
    failures.push({ teamId, error: `Could not extract GCS path from: ${legacyUrl}` });
    return;
  }

  // Use only the last segment of the old path as the new filename
  const filename = gcsPath.split('/').pop() ?? gcsPath.replace(/\//g, '_');
  const destPath = `Teams/${teamId}/logo/${filename}`;

  if (VERBOSE) {
    console.log(`  teamId=${teamId}`);
    console.log(`    from: ${gcsPath}`);
    console.log(`      to: ${destPath}`);
  }

  if (MODE === 'analyze') {
    // Check if source exists for reporting accuracy
    const [srcExists] = await bucket.file(gcsPath).exists();
    console.log(`  → Would copy: ${gcsPath}${srcExists ? '' : ' [SOURCE MISSING]'}`);
    console.log(`          to : ${destPath}  (teamId=${teamId})`);
    stats.migrated++;
    return;
  }

  // ── Idempotent: dest already exists → just fix Firestore ─────────────────
  const [destExists] = await bucket.file(destPath).exists();
  if (destExists) {
    const newUrl = publicUrl(destPath);
    if (VERBOSE) console.log(`    ↩  GCS file already at destination — fixing Firestore only`);
    await db.collection(TEAMS_COLLECTION).doc(teamId).set(
      {
        logoUrl: newUrl,
        teamLogoImg: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    stats.skippedAlreadyMigrated++;
    return;
  }

  // ── Copy ──────────────────────────────────────────────────────────────────
  try {
    const [srcExists] = await bucket.file(gcsPath).exists();
    if (!srcExists) {
      console.warn(`  ⚠  Source file not found in GCS: ${gcsPath} (teamId=${teamId})`);
      stats.skippedMissingFile++;
      return;
    }

    await bucket.file(gcsPath).copy(bucket.file(destPath));
    await bucket.file(destPath).makePublic();

    const newUrl = publicUrl(destPath);

    await db.collection(TEAMS_COLLECTION).doc(teamId).set(
      {
        logoUrl: newUrl,
        teamLogoImg: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (VERBOSE) console.log(`    ✓  Copied → ${destPath}, Firestore updated`);
    stats.migrated++;

    if (DELETE_OLD) {
      await bucket.file(gcsPath).delete();
      if (VERBOSE) console.log(`    🗑  Deleted legacy: ${gcsPath}`);
      stats.deleted++;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗  Failed for teamId=${teamId}: ${msg}`);
    failures.push({ teamId, error: msg });
    stats.failed++;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Team Logo Storage Migration (Firestore-first)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Target  : ${TARGET.toUpperCase()} (${BUCKET_NAME})`);
  console.log(`  Mode    : ${MODE.toUpperCase()}`);
  console.log(`  Delete  : ${DELETE_OLD ? 'YES — will delete old GCS files after copy' : 'NO'}`);
  console.log(`  Limit   : ${LIMIT > 0 ? LIMIT : 'none'}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  if (MODE === 'migrate' && TARGET === 'production' && !DELETE_OLD) {
    console.log('ℹ  Running in copy-only mode — source files will NOT be deleted.');
    console.log('   Re-run with --delete-old after verifying the migration is complete.');
    console.log('');
  }

  // ── Paginate through ALL Teams Firestore docs ─────────────────────────────
  const docsToMigrate: Array<{
    teamId: string;
    logoUrl?: string;
    teamLogoImg?: string;
  }> = [];

  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  const PAGE_SIZE = 500;

  process.stdout.write('Scanning Teams collection');
  while (true) {
    let q = db.collection(TEAMS_COLLECTION).orderBy('__name__').limit(PAGE_SIZE);
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      stats.docsScanned++;
      const data = doc.data();
      const logoUrl: string | undefined = data['logoUrl'];
      const teamLogoImg: string | undefined = data['teamLogoImg'];

      if (isLegacyUrl(logoUrl ?? '') || isLegacyUrl(teamLogoImg ?? '')) {
        docsToMigrate.push({ teamId: doc.id, logoUrl, teamLogoImg });
      }
    }

    cursor = snap.docs[snap.docs.length - 1];
    process.stdout.write('.');
    if (snap.docs.length < PAGE_SIZE) break;
  }
  console.log(' done.\n');

  stats.needsMigration = docsToMigrate.length;
  console.log(`  Docs scanned          : ${stats.docsScanned}`);
  console.log(`  Docs needing migration: ${docsToMigrate.length}`);
  console.log('');

  if (docsToMigrate.length === 0) {
    console.log('✓ Nothing to migrate. All team logos are already at the correct path.');
    console.log('');
    process.exit(0);
  }

  const toProcess = LIMIT > 0 ? docsToMigrate.slice(0, LIMIT) : docsToMigrate;
  if (LIMIT > 0) console.log(`Processing first ${LIMIT} only (--limit=${LIMIT})\n`);

  for (const { teamId, logoUrl, teamLogoImg } of toProcess) {
    await migrateTeamDoc(teamId, logoUrl, teamLogoImg);
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Teams docs scanned    : ${stats.docsScanned}`);
  console.log(`  Needed migration      : ${stats.needsMigration}`);
  console.log(`  Migrated (or would)   : ${stats.migrated}`);
  console.log(`  Already at dest       : ${stats.skippedAlreadyMigrated}`);
  console.log(`  Source file missing   : ${stats.skippedMissingFile}`);
  console.log(`  Deleted old files     : ${stats.deleted}`);
  console.log(`  Failures              : ${stats.failed}`);

  if (failures.length > 0) {
    console.log('');
    console.log('  Failures:');
    for (const f of failures) console.log(`    teamId=${f.teamId}: ${f.error}`);
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
