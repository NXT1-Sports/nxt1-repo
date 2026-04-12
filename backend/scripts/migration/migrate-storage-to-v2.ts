#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Phase 6 — Storage Migration (Firebase Storage Buckets)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Analyzes legacy Firebase Storage structure, copies media files to the V3
 * bucket, and optionally rewrites URLs in migrated Firestore documents.
 *
 * This phase operates in three modes:
 *   1. analyze  — Scan legacy bucket, report structure & size (default)
 *   2. copy     — Copy files from legacy → V3 bucket
 *   3. rewrite  — Update URLs in V3 Firestore docs to point to the new bucket
 *
 * Usage:
 *   npx tsx scripts/migration/migrate-storage-to-v2.ts --mode=analyze
 *   npx tsx scripts/migration/migrate-storage-to-v2.ts --mode=copy --dry-run
 *   npx tsx scripts/migration/migrate-storage-to-v2.ts --mode=rewrite --target=staging
 *
 * Flags:
 *   --mode=            analyze (default) | copy | rewrite
 *   --dry-run          Log operations but don't execute
 *   --limit=N          Process at most N files/docs
 *   --target=          staging (default) | production
 *   --verbose          Print per-file detail
 *   --prefix=          Limit to a storage prefix (e.g. profileImages/)
 *   --legacy-sa=       Override path to legacy service account JSON
 *
 * Prerequisites:
 *   npm install @google-cloud/storage (already in firebase-admin deps)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  initLegacyApp,
  initTargetApp,
  isDryRun,
  isVerbose,
  getLimit,
  getArg,
  hasFlag,
  COLLECTIONS,
  PAGE_SIZE,
  BatchWriter,
  ProgressReporter,
  printBanner,
  printSummary,
  writeReport,
  formatNum,
} from './migration-utils.js';

import admin from 'firebase-admin';

// ─── Types ────────────────────────────────────────────────────────────────────

type MigrationMode = 'analyze' | 'copy' | 'rewrite';

interface StorageStats {
  totalFiles: number;
  totalSizeBytes: number;
  byPrefix: Map<string, { count: number; sizeBytes: number }>;
  copied: number;
  copyErrors: number;
  rewritten: number;
  rewriteErrors: number;
}

interface FileInfo {
  name: string;
  prefix: string;
  sizeBytes: number;
  contentType: string;
  updated: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function humanizeBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, idx);
  return `${val.toFixed(1)} ${units[idx]}`;
}

function getPrefix(filePath: string): string {
  const parts = filePath.split('/');
  return parts.length > 1 ? parts[0] : '(root)';
}

/**
 * Build new storage path, preserving structure.
 * Legacy:  gs://nxt-1-de054.appspot.com/profileImages/{uid}/photo.jpg
 * V3:      gs://nxt-1-staging-v2.appspot.com/profileImages/{uid}/photo.jpg
 */
function buildV3Path(legacyPath: string): string {
  // Preserve the same path structure — just different bucket
  return legacyPath;
}

/**
 * Rewrite legacy storage URLs to point to the new bucket.
 */
function rewriteUrl(url: string, legacyBucket: string, targetBucket: string): string | null {
  if (!url || typeof url !== 'string') return null;

  // Handle gs:// URLs
  if (url.includes(legacyBucket)) {
    return url.replace(legacyBucket, targetBucket);
  }

  // Handle HTTPS download URLs
  const legacyEncoded = encodeURIComponent(legacyBucket);
  if (url.includes(legacyEncoded)) {
    return url.replace(legacyEncoded, encodeURIComponent(targetBucket));
  }

  // Handle firebasestorage.googleapis.com URLs
  const legacyProject = legacyBucket.replace('.appspot.com', '');
  const targetProject = targetBucket.replace('.appspot.com', '');
  if (url.includes(`/b/${legacyBucket}/`)) {
    return url.replace(`/b/${legacyBucket}/`, `/b/${targetBucket}/`);
  }
  if (url.includes(legacyProject)) {
    return url.replace(
      new RegExp(legacyProject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      targetProject
    );
  }

  return null; // URL doesn't reference legacy bucket
}

// ─── Analyze Mode ─────────────────────────────────────────────────────────────

async function analyzeStorage(
  legacyApp: admin.app.App,
  stats: StorageStats,
  prefixFilter?: string
): Promise<FileInfo[]> {
  const bucket = legacyApp.storage().bucket();
  const files: FileInfo[] = [];
  const limit = getLimit();

  console.log(`  Bucket: ${bucket.name}`);
  console.log(`  Prefix filter: ${prefixFilter || '(none)'}\n`);

  const [bucketFiles] = await bucket.getFiles({
    prefix: prefixFilter || undefined,
    maxResults: limit > 0 ? limit : 10000,
  });

  const progress = new ProgressReporter('Scanning files');

  for (let i = 0; i < bucketFiles.length; i++) {
    const file = bucketFiles[i];
    const [metadata] = await file.getMetadata();

    const info: FileInfo = {
      name: file.name,
      prefix: getPrefix(file.name),
      sizeBytes: parseInt(String(metadata.size ?? '0'), 10),
      contentType: String(metadata.contentType ?? 'unknown'),
      updated: String(metadata.updated ?? ''),
    };

    files.push(info);
    stats.totalFiles++;
    stats.totalSizeBytes += info.sizeBytes;

    const existing = stats.byPrefix.get(info.prefix) ?? { count: 0, sizeBytes: 0 };
    existing.count++;
    existing.sizeBytes += info.sizeBytes;
    stats.byPrefix.set(info.prefix, existing);

    if (isVerbose && i < 20) {
      console.log(`    ${info.name} (${humanizeBytes(info.sizeBytes)}, ${info.contentType})`);
    }

    progress.tick(i + 1);
  }

  progress.done(bucketFiles.length);
  return files;
}

// ─── Copy Mode ────────────────────────────────────────────────────────────────

async function copyStorage(
  legacyApp: admin.app.App,
  targetApp: admin.app.App,
  stats: StorageStats,
  prefixFilter?: string
): Promise<void> {
  const sourceBucket = legacyApp.storage().bucket();
  const destBucket = targetApp.storage().bucket();
  const limit = getLimit();

  console.log(`  Source: ${sourceBucket.name}`);
  console.log(`  Destination: ${destBucket.name}`);
  console.log(`  Prefix: ${prefixFilter || '(all)'}`);
  console.log(`  Dry run: ${isDryRun}\n`);

  const [files] = await sourceBucket.getFiles({
    prefix: prefixFilter || undefined,
    maxResults: limit > 0 ? limit : 50000,
  });

  const progress = new ProgressReporter('Copying files');

  for (let i = 0; i < files.length; i++) {
    const sourceFile = files[i];
    const destPath = buildV3Path(sourceFile.name);
    const destFile = destBucket.file(destPath);

    try {
      // Check if already exists (idempotent)
      const [exists] = await destFile.exists();
      if (exists) {
        if (isVerbose) console.log(`    ⏭ ${sourceFile.name} (already exists)`);
        stats.copied++;
        progress.tick(i + 1);
        continue;
      }

      if (isDryRun) {
        if (isVerbose) console.log(`    [DRY] Would copy: ${sourceFile.name} → ${destPath}`);
        stats.copied++;
      } else {
        await sourceFile.copy(destFile);
        stats.copied++;
        if (isVerbose) console.log(`    ✅ ${sourceFile.name} → ${destPath}`);
      }
    } catch (err) {
      stats.copyErrors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`    ❌ ${sourceFile.name}: ${msg}`);
    }

    progress.tick(i + 1);
  }

  progress.done(files.length);
}

// ─── Rewrite Mode ─────────────────────────────────────────────────────────────

async function rewriteUrls(
  legacyApp: admin.app.App,
  targetApp: admin.app.App,
  targetDb: FirebaseFirestore.Firestore,
  stats: StorageStats
): Promise<void> {
  const legacyBucket = legacyApp.storage().bucket().name;
  const targetBucket = targetApp.storage().bucket().name;
  const limit = getLimit();
  const writer = new BatchWriter(targetDb, isDryRun);

  console.log(`  Rewriting: ${legacyBucket} → ${targetBucket}`);
  console.log(`  Dry run: ${isDryRun}\n`);

  // Fields known to contain storage URLs
  const URL_FIELDS = [
    'profileImg',
    'coverImg',
    'profileImgs',
    'bannerUrl',
    'videoUrl',
    'thumbnailUrl',
    'mediaUrls',
    'authorProfileImg',
    'logoUrl',
    'iconUrl',
  ];

  const progress = new ProgressReporter('Rewriting user URLs');

  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let processed = 0;

  while (true) {
    let query: FirebaseFirestore.Query = targetDb
      .collection(COLLECTIONS.USERS)
      .orderBy('createdAt', 'asc')
      .limit(PAGE_SIZE);

    if (cursor) query = query.startAfter(cursor);

    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      if (limit > 0 && processed >= limit) break;

      processed++;
      const data = doc.data();
      const updates: Record<string, unknown> = {};
      let hasUpdates = false;

      for (const field of URL_FIELDS) {
        const value = data[field];

        if (typeof value === 'string') {
          const rewritten = rewriteUrl(value, legacyBucket, targetBucket);
          if (rewritten) {
            updates[field] = rewritten;
            hasUpdates = true;
          }
        } else if (Array.isArray(value)) {
          const rewrittenArr = value.map((v) =>
            typeof v === 'string' ? (rewriteUrl(v, legacyBucket, targetBucket) ?? v) : v
          );
          const changed = rewrittenArr.some((v, idx) => v !== value[idx]);
          if (changed) {
            updates[field] = rewrittenArr;
            hasUpdates = true;
          }
        }
      }

      // Check nested sports[].primaryVideo, sports[].media
      const sports = data['sports'];
      if (Array.isArray(sports)) {
        let sportsUpdated = false;
        const newSports = sports.map((s: Record<string, unknown>) => {
          if (!s || typeof s !== 'object') return s;
          const copy = { ...s };
          if (typeof copy['primaryVideo'] === 'string') {
            const r = rewriteUrl(copy['primaryVideo'] as string, legacyBucket, targetBucket);
            if (r) {
              copy['primaryVideo'] = r;
              sportsUpdated = true;
            }
          }
          if (typeof copy['thumbnailUrl'] === 'string') {
            const r = rewriteUrl(copy['thumbnailUrl'] as string, legacyBucket, targetBucket);
            if (r) {
              copy['thumbnailUrl'] = r;
              sportsUpdated = true;
            }
          }
          return copy;
        });
        if (sportsUpdated) {
          updates['sports'] = newSports;
          hasUpdates = true;
        }
      }

      if (hasUpdates) {
        try {
          const ref = targetDb.collection(COLLECTIONS.USERS).doc(doc.id);
          writer.set(ref, updates); // merge:true from BatchWriter
          stats.rewritten++;
          if (isVerbose) {
            console.log(`    ✅ ${doc.id}: ${Object.keys(updates).join(', ')}`);
          }
        } catch (err) {
          stats.rewriteErrors++;
        }
      }

      await writer.flushIfNeeded();
      progress.tick(processed);
    }

    cursor = snap.docs[snap.docs.length - 1];
    if (limit > 0 && processed >= limit) break;
  }

  await writer.flush();
  progress.done(processed);

  // Also rewrite URLs in posts collection
  console.log('\n  Rewriting post URLs…');
  let postCursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let postProcessed = 0;

  while (true) {
    let query: FirebaseFirestore.Query = targetDb
      .collection(COLLECTIONS.POSTS)
      .orderBy('createdAt', 'asc')
      .limit(PAGE_SIZE);

    if (postCursor) query = query.startAfter(postCursor);

    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      postProcessed++;
      const data = doc.data();
      const updates: Record<string, unknown> = {};
      let hasUpdates = false;

      for (const field of ['mediaUrls', 'thumbnailUrl', 'authorProfileImg', 'videoUrl']) {
        const value = data[field];
        if (typeof value === 'string') {
          const r = rewriteUrl(value, legacyBucket, targetBucket);
          if (r) {
            updates[field] = r;
            hasUpdates = true;
          }
        } else if (Array.isArray(value)) {
          const arr = value.map((v) =>
            typeof v === 'string' ? (rewriteUrl(v, legacyBucket, targetBucket) ?? v) : v
          );
          const changed = arr.some((v, idx) => v !== value[idx]);
          if (changed) {
            updates[field] = arr;
            hasUpdates = true;
          }
        }
      }

      if (hasUpdates) {
        const ref = targetDb.collection(COLLECTIONS.POSTS).doc(doc.id);
        writer.set(ref, updates);
        stats.rewritten++;
      }

      await writer.flushIfNeeded();
    }

    postCursor = snap.docs[snap.docs.length - 1];
  }

  await writer.flush();
  console.log(`  Posts processed: ${formatNum(postProcessed)}`);
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  printBanner('Phase 6 — Storage Migration');

  const mode = (getArg('mode') || 'analyze') as MigrationMode;
  const validModes: MigrationMode[] = ['analyze', 'copy', 'rewrite'];
  if (!validModes.includes(mode)) {
    console.error(`  ❌ Invalid --mode=${mode}. Valid: ${validModes.join(', ')}`);
    process.exit(1);
  }

  const prefixFilter = getArg('prefix');
  const { app: legacyApp, db: legacyDb } = initLegacyApp();
  const { app: targetApp, db: targetDb } = initTargetApp();

  const stats: StorageStats = {
    totalFiles: 0,
    totalSizeBytes: 0,
    byPrefix: new Map(),
    copied: 0,
    copyErrors: 0,
    rewritten: 0,
    rewriteErrors: 0,
  };

  console.log(`  Mode: ${mode}`);
  if (isDryRun) console.log('  ⚠ DRY RUN — no writes will be made');
  console.log('');

  switch (mode) {
    case 'analyze': {
      const files = await analyzeStorage(legacyApp, stats, prefixFilter);

      printSummary('Storage Analysis', [
        ['Total files', stats.totalFiles],
        ['Total size', humanizeBytes(stats.totalSizeBytes) as unknown as number],
      ]);

      console.log('\n  By prefix:');
      const sorted = [...stats.byPrefix.entries()].sort((a, b) => b[1].sizeBytes - a[1].sizeBytes);
      for (const [prefix, info] of sorted) {
        console.log(
          `    ${prefix.padEnd(30)} ${formatNum(info.count).padStart(8)} files  ${humanizeBytes(info.sizeBytes).padStart(12)}`
        );
      }

      writeReport(`storage-analysis-${new Date().toISOString().slice(0, 10)}.json`, {
        timestamp: new Date().toISOString(),
        bucket: legacyApp.storage().bucket().name,
        totalFiles: stats.totalFiles,
        totalSizeBytes: stats.totalSizeBytes,
        totalSizeHuman: humanizeBytes(stats.totalSizeBytes),
        byPrefix: Object.fromEntries(
          [...stats.byPrefix.entries()].map(([k, v]) => [
            k,
            { ...v, sizeHuman: humanizeBytes(v.sizeBytes) },
          ])
        ),
        sampleFiles: files.slice(0, 50).map((f) => ({
          name: f.name,
          size: humanizeBytes(f.sizeBytes),
          contentType: f.contentType,
        })),
      });
      break;
    }

    case 'copy': {
      await copyStorage(legacyApp, targetApp, stats, prefixFilter);

      printSummary('Storage Copy Results', [
        ['Files copied', stats.copied],
        ['Copy errors', stats.copyErrors],
      ]);

      writeReport(`storage-copy-${new Date().toISOString().slice(0, 10)}.json`, {
        timestamp: new Date().toISOString(),
        dryRun: isDryRun,
        sourceBucket: legacyApp.storage().bucket().name,
        destBucket: targetApp.storage().bucket().name,
        prefix: prefixFilter || '(all)',
        copied: stats.copied,
        errors: stats.copyErrors,
      });
      break;
    }

    case 'rewrite': {
      await rewriteUrls(legacyApp, targetApp, targetDb, stats);

      printSummary('URL Rewrite Results', [
        ['Documents rewritten', stats.rewritten],
        ['Rewrite errors', stats.rewriteErrors],
      ]);

      writeReport(`storage-rewrite-${new Date().toISOString().slice(0, 10)}.json`, {
        timestamp: new Date().toISOString(),
        dryRun: isDryRun,
        rewritten: stats.rewritten,
        errors: stats.rewriteErrors,
      });
      break;
    }
  }

  const totalErrors = stats.copyErrors + stats.rewriteErrors;
  if (totalErrors > 0) {
    console.log(`\n  ⚠ ${totalErrors} error(s) — check report for details.`);
  }

  console.log('\n  Done.\n');
  process.exit(totalErrors > 0 ? 1 : 0);
}

// ─── Firestore import ─────────────────────────────────────────────────────────
import FirebaseFirestore from 'firebase-admin/firestore';

main().catch((err) => {
  console.error('\n  FATAL:', err);
  process.exit(2);
});
