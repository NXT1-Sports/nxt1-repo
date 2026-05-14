#!/usr/bin/env tsx
/**
 * @fileoverview Migrate Firestore collection casing: diagramAssets -> DiagramAssets
 *
 * Idempotent migration:
 * - Copies source docs from `diagramAssets` into `DiagramAssets` with the same document IDs.
 * - Skips target documents that already exist unless `--overwrite` is provided.
 *
 * Usage:
 *   npx tsx scripts/data-migrations/migrate-diagram-assets-collection-case.ts
 *   npx tsx scripts/data-migrations/migrate-diagram-assets-collection-case.ts --commit
 *   npx tsx scripts/data-migrations/migrate-diagram-assets-collection-case.ts --staging --commit
 *   npx tsx scripts/data-migrations/migrate-diagram-assets-collection-case.ts --commit --overwrite
 */

import { config as loadDotenv } from 'dotenv';
import admin from 'firebase-admin';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, '../..');
loadDotenv({ path: resolve(backendRoot, '.env') });
loadDotenv({ path: resolve(backendRoot, '.env.local'), override: true });

const SOURCE_COLLECTION = 'diagramAssets';
const TARGET_COLLECTION = 'DiagramAssets';
const WRITE_BATCH_SIZE = 400;
const SCAN_PAGE_SIZE = 500;

interface CliOptions {
  readonly dryRun: boolean;
  readonly staging: boolean;
  readonly overwrite: boolean;
}

interface MigrationStats {
  scanned: number;
  toCreate: number;
  created: number;
  skippedExisting: number;
  overwritten: number;
  errors: number;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  return {
    dryRun: !args.includes('--commit'),
    staging: args.includes('--staging'),
    overwrite: args.includes('--overwrite'),
  };
}

function resolveConfiguredProjectId(staging: boolean): string | undefined {
  if (staging) {
    return (
      process.env['STAGING_FIREBASE_PROJECT_ID'] ??
      process.env['GOOGLE_CLOUD_PROJECT'] ??
      process.env['GCLOUD_PROJECT']
    );
  }

  return (
    process.env['FIREBASE_PROJECT_ID'] ??
    process.env['GOOGLE_CLOUD_PROJECT'] ??
    process.env['GCLOUD_PROJECT']
  );
}

function assertExpectedProjectTarget(staging: boolean): string {
  const expectedProjectId = staging ? 'nxt-1-staging-v2' : 'nxt-1-v2';
  const configuredProjectId = resolveConfiguredProjectId(staging);

  if (!configuredProjectId) {
    throw new Error(
      `Unable to resolve Firebase project id. Set GOOGLE_CLOUD_PROJECT/GCLOUD_PROJECT to ${expectedProjectId}.`
    );
  }

  if (configuredProjectId !== expectedProjectId) {
    throw new Error(
      `Refusing to run migration: resolved project id is ${configuredProjectId}, expected ${expectedProjectId}.`
    );
  }

  return configuredProjectId;
}

async function getFirestoreForEnvironment(staging: boolean): Promise<Firestore> {
  const projectId = staging
    ? process.env['STAGING_FIREBASE_PROJECT_ID']
    : process.env['FIREBASE_PROJECT_ID'];
  const clientEmail = staging
    ? process.env['STAGING_FIREBASE_CLIENT_EMAIL']
    : process.env['FIREBASE_CLIENT_EMAIL'];
  const privateKey = staging
    ? process.env['STAGING_FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n')
    : process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n');

  const appName = `diagram-assets-case-migration-${staging ? 'staging' : 'production'}`;
  const existingApp = admin.apps.find((app) => app?.name === appName);

  const app =
    existingApp ??
    admin.initializeApp(
      {
        credential:
          projectId && clientEmail && privateKey
            ? admin.credential.cert({ projectId, clientEmail, privateKey })
            : admin.credential.applicationDefault(),
      },
      appName
    );

  const db = app.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

async function listSourceDocs(db: Firestore): Promise<QueryDocumentSnapshot[]> {
  const docs: QueryDocumentSnapshot[] = [];
  let lastDoc: QueryDocumentSnapshot | null = null;

  while (true) {
    let query = db.collection(SOURCE_COLLECTION).orderBy('__name__').limit(SCAN_PAGE_SIZE);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snap = await query.get();
    if (snap.empty) {
      break;
    }

    docs.push(...snap.docs);
    lastDoc = snap.docs[snap.docs.length - 1] ?? null;

    if (snap.docs.length < SCAN_PAGE_SIZE) {
      break;
    }
  }

  return docs;
}

async function main(): Promise<void> {
  const options = parseArgs();
  const environment = options.staging ? 'staging' : 'production';
  const projectId = assertExpectedProjectTarget(options.staging);
  const db = await getFirestoreForEnvironment(options.staging);

  const stats: MigrationStats = {
    scanned: 0,
    toCreate: 0,
    created: 0,
    skippedExisting: 0,
    overwritten: 0,
    errors: 0,
  };

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  DiagramAssets Collection Case Migration');
  console.log(`  Environment: ${environment}`);
  console.log(`  Project: ${projectId}`);
  console.log(`  Source: ${SOURCE_COLLECTION}`);
  console.log(`  Target: ${TARGET_COLLECTION}`);
  console.log(`  Mode: ${options.dryRun ? 'DRY RUN (no writes)' : 'COMMIT MODE'}`);
  console.log(`  Overwrite existing: ${options.overwrite ? 'yes' : 'no'}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  const sourceDocs = await listSourceDocs(db);
  stats.scanned = sourceDocs.length;

  if (sourceDocs.length === 0) {
    console.log(`No documents found in ${SOURCE_COLLECTION}. Nothing to migrate.`);
    return;
  }

  const targetRefs = sourceDocs.map((doc) => db.collection(TARGET_COLLECTION).doc(doc.id));

  for (let i = 0; i < targetRefs.length; i += WRITE_BATCH_SIZE) {
    const chunk = targetRefs.slice(i, i + WRITE_BATCH_SIZE);
    const existingSnaps = await db.getAll(...chunk);

    let batch = db.batch();
    let opsInBatch = 0;

    for (let offset = 0; offset < existingSnaps.length; offset++) {
      const sourceDoc = sourceDocs[i + offset];
      const existing = existingSnaps[offset];

      if (!sourceDoc || !existing) {
        continue;
      }

      const targetRef = db.collection(TARGET_COLLECTION).doc(sourceDoc.id);
      const sourceData = sourceDoc.data();

      if (existing.exists && !options.overwrite) {
        stats.skippedExisting += 1;
        continue;
      }

      stats.toCreate += 1;

      if (!options.dryRun) {
        if (existing.exists) {
          stats.overwritten += 1;
        }

        batch.set(targetRef, sourceData, { merge: false });
        opsInBatch += 1;

        if (opsInBatch === WRITE_BATCH_SIZE) {
          try {
            await batch.commit();
            stats.created += opsInBatch;
          } catch (error) {
            stats.errors += opsInBatch;
            console.error('Batch commit failed:', error);
          }

          batch = db.batch();
          opsInBatch = 0;
        }
      }
    }

    if (!options.dryRun && opsInBatch > 0) {
      try {
        await batch.commit();
        stats.created += opsInBatch;
      } catch (error) {
        stats.errors += opsInBatch;
        console.error('Batch commit failed:', error);
      }
    }
  }

  console.log('Migration summary:');
  console.log(`  scanned source docs : ${stats.scanned}`);
  console.log(`  write candidates    : ${stats.toCreate}`);
  console.log(`  created/updated     : ${options.dryRun ? 0 : stats.created}`);
  console.log(`  skipped existing    : ${stats.skippedExisting}`);
  console.log(`  overwritten         : ${options.dryRun ? 0 : stats.overwritten}`);
  console.log(`  errors              : ${stats.errors}`);

  if (options.dryRun) {
    console.log('');
    console.log('Dry run complete. Re-run with --commit to apply writes.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal migration error:', error);
    process.exit(1);
  });
