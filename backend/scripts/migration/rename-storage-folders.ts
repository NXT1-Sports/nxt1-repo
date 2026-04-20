#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Firebase Storage Folder Rename — nxt-1-staging-v2
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Renames Storage "folders" by copying every file under the old prefix
 * to the new prefix, preserving relative path, content-type, and metadata.
 * Optionally deletes source files after a successful copy.
 *
 * Rename map:
 *   agent-x/  → AgentX/
 *   users/    → Users/
 *
 * Usage:
 *   npx tsx scripts/migration/rename-storage-folders.ts --dry-run --target=staging
 *   npx tsx scripts/migration/rename-storage-folders.ts --target=staging
 *   npx tsx scripts/migration/rename-storage-folders.ts --target=staging --delete-source
 *   npx tsx scripts/migration/rename-storage-folders.ts --target=staging --only=agent-x
 *
 * Flags:
 *   --dry-run        List files but do not copy or delete
 *   --delete-source  Delete source files after successful copy
 *   --verbose        Print per-file detail
 *   --only=prefix    Only process folder with this prefix (e.g. --only=agent-x)
 *   --target=        staging (default) | production
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync } from 'fs';

// ─── CLI helpers ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isVerbose = args.includes('--verbose');
const deleteSource = args.includes('--delete-source');

function getArg(name: string): string | null {
  const prefixed = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefixed));
  return found ? found.slice(prefixed.length) : null;
}

const target = getArg('target') === 'production' ? 'production' : 'staging';
const onlyFolder = getArg('only');

// ─── Rename map ───────────────────────────────────────────────────────────────

const RENAME_MAP: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'agent-x', to: 'AgentX' },
  { from: 'users', to: 'Users' },
];

// ─── Firebase init ────────────────────────────────────────────────────────────

const STAGING_SA = resolve(__dirname, '../../assets/nxt-1-staging-v2-ae4fac811aa4.json');
const PRODUCTION_SA =
  process.env['GOOGLE_APPLICATION_CREDENTIALS'] ||
  resolve(__dirname, '../../assets/nxt-1-v2-firebase-adminsdk.json');

function initApp() {
  const APP_NAME = 'storage-rename';
  try {
    return getApp(APP_NAME);
  } catch {
    // not yet initialized
  }

  const stagingProjectId = process.env['STAGING_FIREBASE_PROJECT_ID'];
  const stagingClientEmail = process.env['STAGING_FIREBASE_CLIENT_EMAIL'];
  const stagingPrivateKey = process.env['STAGING_FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n');

  const productionProjectId = process.env['PRODUCTION_FIREBASE_PROJECT_ID'];
  const productionClientEmail = process.env['PRODUCTION_FIREBASE_CLIENT_EMAIL'];
  const productionPrivateKey = process.env['PRODUCTION_FIREBASE_PRIVATE_KEY']?.replace(
    /\\n/g,
    '\n'
  );

  if (target === 'staging' && stagingProjectId && stagingClientEmail && stagingPrivateKey) {
    console.log(`  Target (staging): env credentials → ${stagingProjectId}`);
    return initializeApp(
      {
        credential: cert({
          projectId: stagingProjectId,
          clientEmail: stagingClientEmail,
          privateKey: stagingPrivateKey,
        }),
      },
      APP_NAME
    );
  }

  if (
    target === 'production' &&
    productionProjectId &&
    productionClientEmail &&
    productionPrivateKey
  ) {
    console.log(`  Target (production): env credentials → ${productionProjectId}`);
    return initializeApp(
      {
        credential: cert({
          projectId: productionProjectId,
          clientEmail: productionClientEmail,
          privateKey: productionPrivateKey,
        }),
      },
      APP_NAME
    );
  }

  // Fallback to SA file
  const saPath = target === 'production' ? PRODUCTION_SA : STAGING_SA;
  console.log(`  Target (${target}): SA file → ${saPath}`);
  const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
  return initializeApp({ credential: cert(sa) }, APP_NAME);
}

// ─── Stats ────────────────────────────────────────────────────────────────────

interface FolderStats {
  from: string;
  to: string;
  found: number;
  copied: number;
  copyErrors: number;
  deleted: number;
  deleteErrors: number;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const line = '═'.repeat(35);
  console.log(`╔${line}╗\n║   Firebase Storage Folder Rename   ║\n╚${line}╝`);

  const app = initApp();

  const stagingBucketName =
    process.env['STAGING_FIREBASE_STORAGE_BUCKET'] || 'nxt-1-staging-v2.firebasestorage.app';
  const productionBucketName =
    process.env['FIREBASE_STORAGE_BUCKET'] || 'nxt-1-v2.firebasestorage.app';
  const bucketName = target === 'production' ? productionBucketName : stagingBucketName;

  const bucket = getStorage(app).bucket(bucketName);

  console.log(`\n  Bucket     : ${bucket.name}`);
  console.log(`  Mode       : ${isDryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log(`  Delete src : ${deleteSource ? 'YES' : 'NO'}`);

  const pairs = onlyFolder ? RENAME_MAP.filter((p) => p.from === onlyFolder) : [...RENAME_MAP];

  if (onlyFolder && pairs.length === 0) {
    console.error(
      `\n  ❌ Unknown folder: ${onlyFolder}. Valid: ${RENAME_MAP.map((p) => p.from).join(', ')}`
    );
    process.exit(1);
  }

  if (!isDryRun && deleteSource) {
    console.log('\n  ⚠️  --delete-source: source files will be DELETED after copy.');
    console.log('  Press Ctrl+C within 5 seconds to abort...\n');
    await new Promise((r) => setTimeout(r, 5000));
  }

  const allStats: FolderStats[] = [];

  for (const { from, to } of pairs) {
    console.log(`\n  ── ${from}/  →  ${to}/ ──`);

    const stats: FolderStats = {
      from,
      to,
      found: 0,
      copied: 0,
      copyErrors: 0,
      deleted: 0,
      deleteErrors: 0,
    };

    // List all files under the old prefix
    const [files] = await bucket.getFiles({ prefix: `${from}/` });

    if (files.length === 0) {
      console.log(`     (empty — skipping)`);
      allStats.push(stats);
      continue;
    }

    stats.found = files.length;
    console.log(`     Files found: ${files.length.toLocaleString()}`);

    for (const file of files) {
      const oldPath = file.name;
      const newPath = to + oldPath.slice(from.length); // replace prefix

      if (isVerbose) {
        console.log(`\n     [copy] ${oldPath}  →  ${newPath}`);
      }

      if (!isDryRun) {
        try {
          await file.copy(bucket.file(newPath));
          stats.copied++;
        } catch (err) {
          stats.copyErrors++;
          console.error(
            `\n     ❌ copy failed: ${oldPath}`,
            err instanceof Error ? err.message : err
          );
          continue;
        }
      } else {
        stats.copied++;
      }

      // Delete source if requested and copy succeeded
      if (deleteSource && !isDryRun) {
        try {
          await file.delete();
          stats.deleted++;
        } catch (err) {
          stats.deleteErrors++;
          console.error(
            `\n     ❌ delete failed: ${oldPath}`,
            err instanceof Error ? err.message : err
          );
        }
      }

      // Progress dot every 50 files
      if (stats.copied % 50 === 0) process.stdout.write('.');
    }

    process.stdout.write('\n');
    console.log(`     Copied : ${stats.copied}  Errors: ${stats.copyErrors}`);
    if (deleteSource) {
      console.log(`     Deleted: ${stats.deleted}  Errors: ${stats.deleteErrors}`);
    }

    allStats.push(stats);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalFiles = allStats.reduce((s, r) => s + r.found, 0);
  const totalCopied = allStats.reduce((s, r) => s + r.copied, 0);
  const totalDeleted = allStats.reduce((s, r) => s + r.deleted, 0);
  const totalErrors = allStats.reduce((s, r) => s + r.copyErrors + r.deleteErrors, 0);

  console.log(`\n  ── Run Complete ──`);
  console.log(`    Total files found  : ${totalFiles.toLocaleString()}`);
  console.log(`    Files copied       : ${totalCopied.toLocaleString()}`);
  console.log(`    Files deleted      : ${totalDeleted.toLocaleString()}`);
  console.log(`    Errors             : ${totalErrors}`);
  console.log(`    Mode               : ${isDryRun ? 'DRY RUN' : 'LIVE'}\n`);

  if (totalErrors > 0) {
    console.error(`  ❌ Completed with ${totalErrors} error(s). Review logs above.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n  ❌ Fatal error:', err);
  process.exit(1);
});
