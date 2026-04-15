#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Phase 6 — Storage File Migration  (nxt-1-de054 → nxt-1-v2)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Copies all storage files from the legacy bucket to the V3 bucket with the
 * path remapping required by the V3 folder structure.
 *
 * PATH MAPPING:
 *   Users/{uid}/...             → Profiles/ProfileImages/{uid}/...    [Phase 1]
 *   ProspectProfiles/{uid}/...  → Profiles/ProfileImages/{uid}/...    [Phase 1]
 *   TeamsLogo/{file}            → Teams/TeamLogos/{file}              [Phase 1]
 *   HighLightImages/{file}      → Profiles/FeedImages/{uid}/{file}    [Phase 2]
 *     (uid looked up from Users.profileImg / profileImgs in Firestore)
 *   posts/{rest}                → Profiles/FeedImages/{uid}/{rest}    [Phase 3]
 *     (uid looked up from Posts.mediaUrls / thumbnailUrl in Firestore)
 *   UserTemplates/{file}        → Teams/GalleryImages/{teamId}/{file} [Phase 4]
 *     (teamId from Teams collection in Firestore)
 *
 * Copy mechanism: stream from legacy bucket → target bucket (two separate SA
 * credentials; no cross-project IAM change needed).
 *
 * Usage:
 *   npx tsx backend/scripts/migration/migrate-storage-to-v2.ts --dry-run
 *   npx tsx backend/scripts/migration/migrate-storage-to-v2.ts --target=production
 *   npx tsx backend/scripts/migration/migrate-storage-to-v2.ts --target=production --phase=1
 *   npx tsx backend/scripts/migration/migrate-storage-to-v2.ts --target=production --phases=1,2,3
 *
 * Flags:
 *   --dry-run         Log operations but copy nothing
 *   --target=         staging (default) | production
 *   --phases=         Comma-separated phases: 1,2,3,4  (default: all)
 *   --phase=N         Run a single phase only
 *   --concurrency=N   Parallel file copies (default: 10)
 *   --limit=N         Stop after N total copied files
 *   --verbose         Print per-file detail
 *   --legacy-sa=      Override path to legacy service account JSON
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// ─── CLI Args ─────────────────────────────────────────────────────────────────

const _args = process.argv.slice(2);
const isDryRun = _args.includes('--dry-run');
const isVerbose = _args.includes('--verbose');
const target = _args.find((a) => a.startsWith('--target='))?.split('=')[1] ?? 'staging';

const _phasesArg = _args.find((a) => a.startsWith('--phases='))?.split('=')[1];
const _phaseArg = _args.find((a) => a.startsWith('--phase='))?.split('=')[1];
const phasesToRun: number[] = _phasesArg
  ? _phasesArg.split(',').map(Number)
  : _phaseArg
    ? [Number(_phaseArg)]
    : [1, 2, 3, 4];

const CONCURRENCY = Number(
  _args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? '10'
);
const LIMIT = Number(_args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0');
const legacySaOverride = _args.find((a) => a.startsWith('--legacy-sa='))?.split('=')[1];

// ─── Constants ────────────────────────────────────────────────────────────────

const LEGACY_BUCKET = process.env['LEGACY_FIREBASE_STORAGE_BUCKET'] ?? 'nxt-1-de054.appspot.com';
const TARGET_BUCKET =
  target === 'production'
    ? (process.env['FIREBASE_STORAGE_BUCKET'] ?? 'nxt-1-v2.firebasestorage.app')
    : (process.env['STAGING_FIREBASE_STORAGE_BUCKET'] ?? 'nxt-1-staging-v2.firebasestorage.app');

const LEGACY_APP = 'storage-legacy';
const TARGET_APP = 'storage-target';
const PAGE_SIZE = 500;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CopyOp {
  legacyPath: string;
  newPath: string;
}

interface Stats {
  copied: number;
  skipped: number; // already existed in target
  missing: number; // not found in legacy
  errors: number;
}

// ─── Firebase Init ────────────────────────────────────────────────────────────

function initLegacy() {
  try {
    return getApp(LEGACY_APP);
  } catch {
    /* not yet initialised */
  }
  const saPath =
    legacySaOverride ??
    resolve(
      __dirname,
      '../../../../nxt1-backend/assets/nxt-1-de054-firebase-adminsdk-w01w0-2bab8ae108.json'
    );
  const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
  return initializeApp({ credential: cert(sa), storageBucket: LEGACY_BUCKET }, LEGACY_APP);
}

function initTarget() {
  try {
    return getApp(TARGET_APP);
  } catch {
    /* not yet initialised */
  }

  // Prefer env vars (matches existing migration pattern)
  const pid =
    target === 'production'
      ? (process.env['PRODUCTION_FIREBASE_PROJECT_ID'] ?? process.env['FIREBASE_PROJECT_ID'])
      : process.env['STAGING_FIREBASE_PROJECT_ID'];
  const email =
    target === 'production'
      ? (process.env['PRODUCTION_FIREBASE_CLIENT_EMAIL'] ?? process.env['FIREBASE_CLIENT_EMAIL'])
      : process.env['STAGING_FIREBASE_CLIENT_EMAIL'];
  const key = (
    target === 'production'
      ? (process.env['PRODUCTION_FIREBASE_PRIVATE_KEY'] ?? process.env['FIREBASE_PRIVATE_KEY'])
      : process.env['STAGING_FIREBASE_PRIVATE_KEY']
  )?.replace(/\\n/g, '\n');

  if (pid && email && key) {
    return initializeApp(
      {
        credential: cert({ projectId: pid, clientEmail: email, privateKey: key }),
        storageBucket: TARGET_BUCKET,
      },
      TARGET_APP
    );
  }

  // Fallback to SA file
  const saPath = resolve(__dirname, '../../assets/nxt-1-v2-firebase-adminsdk.json');
  const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
  return initializeApp({ credential: cert(sa), storageBucket: TARGET_BUCKET }, TARGET_APP);
}

// ─── URL Helpers ──────────────────────────────────────────────────────────────

/** Extract the storage object path from a Firebase Storage HTTPS URL. */
function extractPath(url: string | unknown): string | null {
  if (!url || typeof url !== 'string') return null;
  // https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encoded-path}?...
  const m = url.match(/\/o\/([^?#]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/** Return true if the URL references the TARGET bucket (already migrated URL). */
function isTargetUrl(url: string): boolean {
  return url.includes(TARGET_BUCKET);
}

// ─── Phase 1: Simple Prefix Renames ──────────────────────────────────────────

/**
 * Collect all files under a legacy prefix and map them to their new path
 * by swapping the prefix.
 */
async function collectPhase1Ops(
  legacyBucket: ReturnType<ReturnType<typeof getStorage>['bucket']>
): Promise<CopyOp[]> {
  const PREFIXES: [string, string][] = [
    ['Users/', 'Profiles/ProfileImages/'],
    ['ProspectProfiles/', 'Profiles/ProfileImages/'],
    ['TeamsLogo/', 'Teams/TeamLogos/'],
  ];

  const all: CopyOp[] = [];

  for (const [legacyPrefix, newPrefix] of PREFIXES) {
    process.stdout.write(`  Listing legacy ${legacyPrefix}…`);
    const [files] = await legacyBucket.getFiles({ prefix: legacyPrefix });
    console.log(` ${files.length} files`);
    for (const f of files) {
      all.push({
        legacyPath: f.name,
        newPath: newPrefix + f.name.slice(legacyPrefix.length),
      });
    }
  }

  return all;
}

// ─── Phase 2: HighLightImages (uid from Users Firestore) ─────────────────────

/**
 * Read Users collection from nxt-1-v2 Firestore.
 * For each URL in the Profiles/FeedImages/{uid}/... shape inside profileImg /
 * profileImgs / primarySportProfileImg, produce a CopyOp:
 *   legacyPath = HighLightImages/{filename}
 *   newPath    = Profiles/FeedImages/{uid}/{filename}
 */
async function collectPhase2Ops(db: FirebaseFirestore.Firestore): Promise<CopyOp[]> {
  const ops: CopyOp[] = [];
  const seen = new Set<string>();
  let cursor: FirebaseFirestore.DocumentSnapshot | undefined;
  let users = 0;

  process.stdout.write('  Reading Users for HighLightImages refs…');

  while (true) {
    let q = db
      .collection('Users')
      .orderBy('createdAt', 'asc')
      .limit(PAGE_SIZE) as FirebaseFirestore.Query;
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      users++;
      const d = doc.data();
      const uid = doc.id;

      // Collect all URL values from feed-image fields
      const urls: unknown[] = [
        d['profileImg'],
        ...(Array.isArray(d['profileImgs']) ? d['profileImgs'] : []),
        d['primarySportProfileImg'],
      ];

      for (const url of urls) {
        const p = extractPath(url);
        if (!p) continue;
        if (!p.startsWith('Profiles/FeedImages/')) continue;
        if (!isTargetUrl(String(url))) continue; // skip if not in target bucket
        if (seen.has(p)) continue;
        seen.add(p);

        // Profiles/FeedImages/{uid}/{filename}
        // parts[0]=Profiles, parts[1]=FeedImages, parts[2]=uid, parts[3+]=filename
        const parts = p.split('/');
        if (parts.length < 4) continue;
        const filename = parts.slice(3).join('/');

        ops.push({ legacyPath: `HighLightImages/${filename}`, newPath: p });
      }
    }

    cursor = snap.docs[snap.docs.length - 1];
  }

  console.log(` ${users} users → ${ops.length} HighLightImages ops`);
  return ops;
}

// ─── Phase 3: posts/ files (uid from Posts Firestore) ────────────────────────

/**
 * Read Posts collection from nxt-1-v2 Firestore.
 * For each mediaUrl / thumbnailUrl in the Profiles/FeedImages/{uid}/{rest} shape
 * produce a CopyOp:
 *   legacyPath = posts/{rest}
 *   newPath    = Profiles/FeedImages/{uid}/{rest}
 */
async function collectPhase3Ops(db: FirebaseFirestore.Firestore): Promise<CopyOp[]> {
  const ops: CopyOp[] = [];
  const seen = new Set<string>();
  let cursor: FirebaseFirestore.DocumentSnapshot | undefined;
  let posts = 0;

  process.stdout.write('  Reading Posts for posts/ refs…');

  while (true) {
    let q = db
      .collection('Posts')
      .orderBy('createdAt', 'asc')
      .limit(PAGE_SIZE) as FirebaseFirestore.Query;
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      posts++;
      const d = doc.data();

      const urls: unknown[] = [
        d['thumbnailUrl'],
        d['videoUrl'],
        ...(Array.isArray(d['mediaUrls']) ? d['mediaUrls'] : []),
      ];

      for (const url of urls) {
        const p = extractPath(url);
        if (!p) continue;
        if (!p.startsWith('Profiles/FeedImages/')) continue;
        if (!isTargetUrl(String(url))) continue;
        if (seen.has(p)) continue;
        seen.add(p);

        // Profiles/FeedImages/{uid}/{rest}
        const parts = p.split('/');
        if (parts.length < 4) continue;
        const rest = parts.slice(3).join('/');

        ops.push({ legacyPath: `posts/${rest}`, newPath: p });
      }
    }

    cursor = snap.docs[snap.docs.length - 1];
  }

  console.log(` ${posts} posts → ${ops.length} posts/ ops`);
  return ops;
}

// ─── Phase 4: UserTemplates (teamId from Teams Firestore) ────────────────────

/**
 * Read Teams collection from nxt-1-v2 Firestore.
 * For each Teams/GalleryImages/{teamId}/{filename} URL:
 *   legacyPath = UserTemplates/{filename}
 *   newPath    = Teams/GalleryImages/{teamId}/{filename}
 */
async function collectPhase4Ops(db: FirebaseFirestore.Firestore): Promise<CopyOp[]> {
  const ops: CopyOp[] = [];
  const seen = new Set<string>();

  const snap = await db.collection('Teams').get();
  process.stdout.write(`  Reading Teams (${snap.size} docs) for UserTemplates refs…`);

  for (const doc of snap.docs) {
    const d = doc.data();
    const urls: unknown[] = [
      d['userTemplate'],
      d['templateUrl'],
      ...(Array.isArray(d['templates']) ? d['templates'] : []),
      ...(Array.isArray(d['galleryImages']) ? d['galleryImages'] : []),
    ];

    for (const url of urls) {
      const p = extractPath(url);
      if (!p) continue;
      if (!p.startsWith('Teams/GalleryImages/')) continue;
      if (!isTargetUrl(String(url))) continue;
      if (seen.has(p)) continue;
      seen.add(p);

      // Teams/GalleryImages/{teamId}/{filename}
      const parts = p.split('/');
      if (parts.length < 4) continue;
      const filename = parts.slice(3).join('/');

      ops.push({ legacyPath: `UserTemplates/${filename}`, newPath: p });
    }
  }

  console.log(` ${ops.length} UserTemplates ops`);
  return ops;
}

// ─── Execute Copy Ops ─────────────────────────────────────────────────────────

/**
 * Uses server-side GCS copy (rewriteObject API).
 * targetSrcBkt: target SA's handle to the LEGACY bucket (has objectViewer IAM).
 * targetBkt:    target SA's handle to the target bucket.
 * Both are authenticated with the same (target) SA — GCS copies within-network.
 */
async function executeCopies(
  ops: CopyOp[],
  targetSrcBkt: ReturnType<ReturnType<typeof getStorage>['bucket']>,
  targetBkt: ReturnType<ReturnType<typeof getStorage>['bucket']>,
  stats: Stats
): Promise<void> {
  if (ops.length === 0) {
    console.log('  (no ops)');
    return;
  }

  let done = 0;

  for (let i = 0; i < ops.length; i += CONCURRENCY) {
    if (LIMIT > 0 && stats.copied >= LIMIT) {
      console.log(`\n  Limit of ${LIMIT} reached — stopping.`);
      break;
    }

    const batch = ops.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async (op) => {
        const n = ++done;
        process.stdout.write(`\r  [${n}/${ops.length}] ${op.legacyPath.slice(0, 60).padEnd(60)}`);

        if (isDryRun) {
          if (isVerbose) console.log(`\n  [DRY] ${op.legacyPath} → ${op.newPath}`);
          stats.copied++;
          return;
        }

        try {
          const srcFile = targetSrcBkt.file(op.legacyPath);
          const dstFile = targetBkt.file(op.newPath);

          // Idempotent: skip if already exists in target
          const [dstExists] = await dstFile.exists();
          if (dstExists) {
            stats.skipped++;
            if (isVerbose) console.log(`\n  ⏭  ${op.newPath} (already exists)`);
            return;
          }

          // Server-side copy: stays within GCS network, no local streaming
          // Works because target SA has objectViewer on legacy bucket (IAM granted)
          await srcFile.copy(dstFile);

          stats.copied++;
          if (isVerbose) console.log(`\n  ✅  ${op.legacyPath} → ${op.newPath}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // 404 = file doesn't exist in legacy
          if (msg.includes('404') || msg.includes('No such object')) {
            stats.missing++;
            if (isVerbose) console.log(`\n  ⚠  ${op.legacyPath} (not in legacy bucket)`);
          } else {
            stats.errors++;
            console.error(`\n  ❌  ${op.legacyPath}: ${msg}`);
          }
        }
      })
    );
  }

  process.stdout.write('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startMs = Date.now();

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  Phase 6 — Storage File Migration');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Legacy bucket : ${LEGACY_BUCKET}`);
  console.log(`  Target bucket : ${TARGET_BUCKET}`);
  console.log(`  Dry run       : ${isDryRun}`);
  console.log(`  Phases        : ${phasesToRun.join(', ')}`);
  console.log(`  Concurrency   : ${CONCURRENCY}`);
  if (LIMIT > 0) console.log(`  Limit         : ${LIMIT}`);
  console.log('');

  const legacyApp = initLegacy();
  const targetApp = initTarget();

  // legacyBktForList: use legacy SA credentials to list objects in legacy bucket
  const legacyBktForList = getStorage(legacyApp).bucket(LEGACY_BUCKET);
  // targetSrcBkt: use TARGET SA credentials to READ from legacy bucket
  //   (possible because target SA was granted objectViewer IAM on legacy bucket)
  const targetSrcBkt = getStorage(targetApp).bucket(LEGACY_BUCKET);
  // targetBkt: use target SA credentials to WRITE to target bucket
  const targetBkt = getStorage(targetApp).bucket(TARGET_BUCKET);

  const stats: Stats = { copied: 0, skipped: 0, missing: 0, errors: 0 };

  // ── Phase 1 ────────────────────────────────────────────────────────────────
  if (phasesToRun.includes(1)) {
    console.log('\n── Phase 1: Users / ProspectProfiles / TeamsLogo ─────────────');
    const ops = await collectPhase1Ops(legacyBktForList);
    console.log(`  Total files: ${ops.length}`);
    await executeCopies(ops, targetSrcBkt, targetBkt, stats);
  }

  // ── Phases 2–4 need target Firestore ───────────────────────────────────────
  if (phasesToRun.some((p) => p >= 2)) {
    const db = getFirestore(targetApp);
    db.settings({ ignoreUndefinedProperties: true });

    if (phasesToRun.includes(2)) {
      console.log('\n── Phase 2: HighLightImages → Profiles/FeedImages/{uid}/ ──────');
      const ops = await collectPhase2Ops(db);
      await executeCopies(ops, targetSrcBkt, targetBkt, stats);
    }

    if (phasesToRun.includes(3)) {
      console.log('\n── Phase 3: posts/ → Profiles/FeedImages/{uid}/ ───────────────');
      const ops = await collectPhase3Ops(db);
      await executeCopies(ops, targetSrcBkt, targetBkt, stats);
    }

    if (phasesToRun.includes(4)) {
      console.log('\n── Phase 4: UserTemplates/ → Teams/GalleryImages/{teamId}/ ────');
      const ops = await collectPhase4Ops(db);
      await executeCopies(ops, targetSrcBkt, targetBkt, stats);
    }
  }

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  STORAGE MIGRATION COMPLETE');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Copied  : ${stats.copied}`);
  console.log(`  Skipped : ${stats.skipped}  (already existed in target)`);
  console.log(`  Missing : ${stats.missing}  (not found in legacy bucket)`);
  console.log(`  Errors  : ${stats.errors}`);
  console.log(`  Time    : ${elapsed}s`);
  console.log('');

  if (stats.errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\n[FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});
