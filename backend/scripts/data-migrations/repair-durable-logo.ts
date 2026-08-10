#!/usr/bin/env npx tsx
/**
 * Repairs legacy Organization and Team logo references without deleting source objects.
 *
 * The script is dry-run by default. It only writes when --apply is supplied, and then:
 * 1. promotes a verified object from the configured Firebase Storage bucket;
 * 2. obtains a durable Firebase download-token URL through AgentMediaLifecycleService; and
 * 3. atomically updates logoUrl only when the document still has the scanned value.
 *
 * Usage:
 *   cd backend
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/data-migrations/repair-durable-logo.ts --organization-id=<id>
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/data-migrations/repair-durable-logo.ts --organization-id=<id> --apply
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/data-migrations/repair-durable-logo.ts --team-id=<id> --apply
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/data-migrations/repair-durable-logo.ts --page-size=250 --organization-cursor=<last-id>
 *
 * Credentials: Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS must grant
 * Firestore read/write and Storage object read/write access for FIREBASE_STORAGE_BUCKET.
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp } from 'firebase-admin/app';
import {
  FieldPath,
  FieldValue,
  getFirestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { AgentMediaLifecycleService } from '../../src/modules/agent/tools/media/agent-media-lifecycle.service.js';
import {
  classifyLogoForDurableRepair,
  type DurableLogoEntity,
} from './repair-durable-logo.helpers.js';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(scriptDirectory, '../../.env') });

const args = process.argv.slice(2);

function argumentValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function positiveIntegerArgument(name: string, fallback: number): number {
  const value = argumentValue(name);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

const apply = args.includes('--apply');
const organizationId = argumentValue('organization-id')?.trim();
const teamId = argumentValue('team-id')?.trim();
const pageSize = Math.min(500, positiveIntegerArgument('page-size', 250));
const limit = positiveIntegerArgument('limit', Number.MAX_SAFE_INTEGER);
const organizationCursor = argumentValue('organization-cursor')?.trim();
const teamCursor = argumentValue('team-cursor')?.trim();
const configuredBucketName =
  argumentValue('bucket')?.trim() ?? process.env['FIREBASE_STORAGE_BUCKET']?.trim();
const projectId =
  argumentValue('project-id')?.trim() ?? process.env['GOOGLE_CLOUD_PROJECT']?.trim();

if (organizationId && teamId) {
  throw new Error('Use only one focused selector: --organization-id or --team-id');
}
if ((organizationId || teamId) && (organizationCursor || teamCursor)) {
  throw new Error('Focused selectors cannot be combined with resume cursors');
}
if (!configuredBucketName) {
  throw new Error('Set FIREBASE_STORAGE_BUCKET or pass --bucket=<bucket-name>');
}
const bucketName: string = configuredBucketName;

const appName = 'repair-durable-logo';
const app =
  getApps().find((candidate) => candidate.name === appName) ??
  initializeApp(
    {
      storageBucket: bucketName,
      ...(projectId ? { projectId } : {}),
    },
    appName
  );
const db = getFirestore(app);
type DurableLogoBucket = {
  readonly name: string;
  file: (storagePath: string) => {
    exists: () => Promise<[boolean]>;
  };
};
const bucket: DurableLogoBucket = getStorage(app).bucket(bucketName);

type CollectionName = 'Organizations' | 'Teams';

interface RepairSummary {
  readonly mode: 'dry-run' | 'apply';
  readonly bucket: string;
  scanned: number;
  withoutLogo: number;
  canonical: number;
  wouldPromote: number;
  promoted: number;
  skipped: Record<string, number>;
  failed: number;
  nextCursors: Partial<Record<CollectionName, string>>;
  readonly samples: RepairSample[];
}

interface RepairSample {
  readonly collection: CollectionName;
  readonly id: string;
  readonly action: 'canonical' | 'promote' | 'skip' | 'failed';
  readonly reason?: string;
  readonly sourcePath?: string;
  readonly destinationPath?: string;
}

const summary: RepairSummary = {
  mode: apply ? 'apply' : 'dry-run',
  bucket: bucketName,
  scanned: 0,
  withoutLogo: 0,
  canonical: 0,
  wouldPromote: 0,
  promoted: 0,
  skipped: {},
  failed: 0,
  nextCursors: {},
  samples: [],
};

function addSkip(reason: string): void {
  summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1;
}

function recordSample(sample: RepairSample): void {
  if (summary.samples.length < 50) summary.samples.push(sample);
}

function entityForCollection(collection: CollectionName): DurableLogoEntity {
  return collection === 'Organizations' ? 'organization' : 'team';
}

async function sourceExists(storagePath: string): Promise<boolean> {
  const [exists] = await bucket.file(storagePath).exists();
  return exists;
}

async function repairDocument(
  collection: CollectionName,
  snapshot: QueryDocumentSnapshot
): Promise<void> {
  summary.scanned += 1;
  const logoUrl = snapshot.get('logoUrl');
  if (typeof logoUrl !== 'string' || !logoUrl.trim()) {
    summary.withoutLogo += 1;
    return;
  }

  const decision = classifyLogoForDurableRepair({
    bucketName,
    entity: entityForCollection(collection),
    entityId: snapshot.id,
    logoUrl,
  });

  if (decision.kind === 'canonical') {
    summary.canonical += 1;
    recordSample({
      collection,
      id: snapshot.id,
      action: 'canonical',
      destinationPath: decision.destinationPath,
    });
    return;
  }

  if (decision.kind === 'skip') {
    addSkip(decision.reason);
    recordSample({ collection, id: snapshot.id, action: 'skip', reason: decision.reason });
    return;
  }

  try {
    if (!(await sourceExists(decision.sourcePath))) {
      addSkip('source-not-found');
      recordSample({
        collection,
        id: snapshot.id,
        action: 'skip',
        reason: 'source-not-found',
        sourcePath: decision.sourcePath,
        destinationPath: decision.destinationPath,
      });
      return;
    }
  } catch (error) {
    addSkip('source-not-accessible');
    recordSample({
      collection,
      id: snapshot.id,
      action: 'skip',
      reason: 'source-not-accessible',
      sourcePath: decision.sourcePath,
      destinationPath: decision.destinationPath,
    });
    return;
  }

  if (!apply) {
    summary.wouldPromote += 1;
    recordSample({
      collection,
      id: snapshot.id,
      action: 'promote',
      reason: 'dry-run',
      sourcePath: decision.sourcePath,
      destinationPath: decision.destinationPath,
    });
    return;
  }

  try {
    const promoted = await AgentMediaLifecycleService.promoteStorageObjectToDurableDestination({
      bucket,
      storagePath: decision.sourcePath,
      destinationPath: decision.destinationPath,
    });

    await db.runTransaction(async (transaction) => {
      const latest = await transaction.get(snapshot.ref);
      if (!latest.exists || latest.get('logoUrl') !== logoUrl) {
        throw new Error('logo-url-changed-during-repair');
      }
      transaction.update(snapshot.ref, {
        logoUrl: promoted.url,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    summary.promoted += 1;
    recordSample({
      collection,
      id: snapshot.id,
      action: 'promote',
      sourcePath: decision.sourcePath,
      destinationPath: decision.destinationPath,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason === 'logo-url-changed-during-repair') {
      addSkip(reason);
      recordSample({
        collection,
        id: snapshot.id,
        action: 'skip',
        reason,
        sourcePath: decision.sourcePath,
        destinationPath: decision.destinationPath,
      });
      return;
    }

    summary.failed += 1;
    recordSample({
      collection,
      id: snapshot.id,
      action: 'failed',
      reason,
      sourcePath: decision.sourcePath,
      destinationPath: decision.destinationPath,
    });
  }
}

async function scanCollection(params: {
  readonly collection: CollectionName;
  readonly cursor?: string;
  readonly focusedId?: string;
}): Promise<void> {
  const { collection, cursor, focusedId } = params;
  if (focusedId) {
    const snapshot = await db.collection(collection).doc(focusedId).get();
    if (!snapshot.exists) {
      addSkip('document-not-found');
      recordSample({ collection, id: focusedId, action: 'skip', reason: 'document-not-found' });
      return;
    }
    await repairDocument(collection, snapshot as QueryDocumentSnapshot);
    return;
  }

  let nextCursor = cursor;
  while (summary.scanned < limit) {
    const remaining = limit - summary.scanned;
    let query = db
      .collection(collection)
      .orderBy(FieldPath.documentId())
      .limit(Math.min(pageSize, remaining));
    if (nextCursor) query = query.startAfter(nextCursor);

    const page = await query.get();
    if (page.empty) return;

    for (const snapshot of page.docs) {
      await repairDocument(collection, snapshot);
    }

    nextCursor = page.docs[page.docs.length - 1]?.id;
    if (nextCursor && (page.size === pageSize || summary.scanned >= limit)) {
      summary.nextCursors[collection] = nextCursor;
    }
    if (page.size < pageSize) return;
  }
}

async function main(): Promise<void> {
  const collections: Array<{
    collection: CollectionName;
    cursor?: string;
    focusedId?: string;
  }> = organizationId
    ? [{ collection: 'Organizations', focusedId: organizationId }]
    : teamId
      ? [{ collection: 'Teams', focusedId: teamId }]
      : [
          { collection: 'Organizations', cursor: organizationCursor },
          { collection: 'Teams', cursor: teamCursor },
        ];

  for (const collection of collections) {
    if (summary.scanned >= limit) break;
    await scanCollection(collection);
  }

  console.log(JSON.stringify({ migration: 'repair-durable-logo', summary }, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        migration: 'repair-durable-logo',
        fatal: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
