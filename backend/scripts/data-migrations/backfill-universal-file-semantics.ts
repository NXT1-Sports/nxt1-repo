#!/usr/bin/env tsx
import 'dotenv/config';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { UNIVERSAL_FILES_COLLECTION } from '@nxt1/core';
import { connectToMongoDB, disconnectFromMongoDB } from '../../src/config/database.config.js';
import { UniversalFileSemanticService } from '../../src/services/team/universal-file-semantic.service.js';
import { db } from '../../src/utils/firebase.js';
import { stagingDb } from '../../src/utils/firebase-staging.js';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const environment = args.includes('--staging') ? 'staging' : 'production';
const teamId = args.includes('--team') ? args[args.indexOf('--team') + 1] : undefined;
const fileId = args.includes('--file') ? args[args.indexOf('--file') + 1] : undefined;
const limitArg = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : undefined;
const concurrencyArg = args.includes('--concurrency')
  ? Number(args[args.indexOf('--concurrency') + 1])
  : undefined;

const firestore = environment === 'staging' ? stagingDb : db;
const batchSize = 150;
const limit = Number.isFinite(limitArg) && limitArg && limitArg > 0 ? Math.floor(limitArg) : null;
const concurrency =
  Number.isFinite(concurrencyArg) && concurrencyArg && concurrencyArg > 0
    ? Math.min(Math.floor(concurrencyArg), 6)
    : 2;

interface BackfillStats {
  total: number;
  synced: number;
  pending: number;
  failed: number;
  skipped: number;
  missing: number;
  processed: number;
}

function createStats(): BackfillStats {
  return {
    total: 0,
    synced: 0,
    pending: 0,
    failed: 0,
    skipped: 0,
    missing: 0,
    processed: 0,
  };
}

function countSemanticState(stats: BackfillStats, raw: Record<string, unknown>): void {
  stats.total += 1;
  const semanticSync =
    raw['semanticSync'] && typeof raw['semanticSync'] === 'object'
      ? (raw['semanticSync'] as Record<string, unknown>)
      : null;
  const status = typeof semanticSync?.['status'] === 'string' ? semanticSync['status'] : null;

  if (status === 'synced') {
    stats.synced += 1;
  } else if (status === 'pending') {
    stats.pending += 1;
  } else if (status === 'failed') {
    stats.failed += 1;
  } else if (status === 'skipped') {
    stats.skipped += 1;
  } else {
    stats.missing += 1;
  }
}

async function collectDocuments(): Promise<QueryDocumentSnapshot[]> {
  if (fileId?.trim()) {
    const snapshot = await firestore
      .collection(UNIVERSAL_FILES_COLLECTION)
      .doc(fileId.trim())
      .get();
    return snapshot.exists ? [snapshot as QueryDocumentSnapshot] : [];
  }

  const collected: QueryDocumentSnapshot[] = [];
  let lastDoc: QueryDocumentSnapshot | undefined;

  while (true) {
    let query = firestore
      .collection(UNIVERSAL_FILES_COLLECTION)
      .orderBy('updatedAt', 'desc')
      .limit(batchSize);
    if (teamId?.trim()) {
      query = query.where('teamId', '==', teamId.trim()) as typeof query;
    }
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    for (const doc of snapshot.docs) {
      collected.push(doc);
      if (limit && collected.length >= limit) {
        return collected;
      }
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  return collected;
}

async function runWithConcurrency(
  docs: readonly QueryDocumentSnapshot[],
  worker: (doc: QueryDocumentSnapshot, index: number) => Promise<void>
): Promise<void> {
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < docs.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(docs[currentIndex]!, currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, docs.length) }, () => runWorker()));
}

async function main(): Promise<void> {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Universal File Semantic Backfill');
  console.log(`  Environment: ${environment}`);
  console.log(`  Mode: ${commit ? 'COMMIT MODE' : 'DRY RUN (no writes)'}`);
  console.log(`  Concurrency: ${concurrency}`);
  if (teamId?.trim()) {
    console.log(`  Scope: team ${teamId.trim()}`);
  }
  if (fileId?.trim()) {
    console.log(`  Scope: file ${fileId.trim()}`);
  }
  if (limit) {
    console.log(`  Limit: ${limit}`);
  }
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  const docs = await collectDocuments();
  const stats = createStats();

  for (const doc of docs) {
    countSemanticState(stats, doc.data() as Record<string, unknown>);
  }

  console.log(`documents_in_scope: ${docs.length}`);
  console.log(`already_synced:     ${stats.synced}`);
  console.log(`pending:            ${stats.pending}`);
  console.log(`failed:             ${stats.failed}`);
  console.log(`skipped:            ${stats.skipped}`);
  console.log(`missing_status:     ${stats.missing}`);

  if (!commit || docs.length === 0) {
    console.log('');
    console.log(
      commit
        ? 'Nothing to process.'
        : 'Dry run complete. Re-run with --commit to sync semantic indexes.'
    );
    return;
  }

  await connectToMongoDB();
  const service = new UniversalFileSemanticService(firestore as Firestore);

  await runWithConcurrency(docs, async (doc, index) => {
    await service.syncByFileId(doc.id);
    stats.processed += 1;
    if ((index + 1) % 10 === 0 || index === docs.length - 1) {
      console.log(`processed: ${index + 1}/${docs.length}`);
    }
  });

  console.log('');
  console.log(`processed_total: ${stats.processed}`);
  console.log('backfill_complete: yes');
}

main()
  .catch((error) => {
    console.error(
      'backfill_universal_file_semantics_failed',
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectFromMongoDB().catch(() => undefined);
  });
