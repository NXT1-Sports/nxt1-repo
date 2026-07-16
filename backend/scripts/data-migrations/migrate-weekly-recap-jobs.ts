/**
 * @fileoverview Weekly Recap Job Migration Script
 * @module @nxt1/backend/scripts
 *
 * Backfills legacy weekly recap jobs persisted in `AgentJobs` into the dedicated
 * `AgentWeeklyRecapJobs` collection and normalizes their dispatch rows to
 * terminal `completed` / `failed` states.
 *
 * Usage:
 *   npx tsx scripts/data-migrations/migrate-weekly-recap-jobs.ts
 *   npx tsx scripts/data-migrations/migrate-weekly-recap-jobs.ts --commit
 *   npx tsx scripts/data-migrations/migrate-weekly-recap-jobs.ts --commit --week 2026-W23
 *   npx tsx scripts/data-migrations/migrate-weekly-recap-jobs.ts --commit --delete-legacy
 *   npx tsx scripts/data-migrations/migrate-weekly-recap-jobs.ts --staging
 */

import { FieldValue, type DocumentData, type Timestamp } from 'firebase-admin/firestore';
import { db } from '../../src/utils/firebase.js';
import { stagingDb } from '../../src/utils/firebase-staging.js';

const LEGACY_COLLECTION = 'AgentJobs';
const TARGET_COLLECTION = 'AgentWeeklyRecapJobs';
const DISPATCH_COLLECTION = 'AgentWeeklyRecapDispatches';
const EVENTS_SUBCOLLECTION = 'events';
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const WRITE_BATCH_LIMIT = 300;
const MIGRATION_VERSION = 1;

const args = process.argv.slice(2);
const dryRun = !args.includes('--commit');
const deleteLegacy = args.includes('--delete-legacy');
const environment = args.includes('--staging') ? 'staging' : 'production';
const firestore = environment === 'staging' ? stagingDb : db;

function getArg(name: string): string | null {
  const flagIndex = args.indexOf(`--${name}`);
  if (flagIndex >= 0) {
    return args[flagIndex + 1] ?? null;
  }

  const prefixed = `--${name}=`;
  const matched = args.find((arg) => arg.startsWith(prefixed));
  return matched ? matched.slice(prefixed.length) : null;
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asTimestamp(value: unknown): Timestamp | null {
  if (value && typeof value === 'object' && 'toDate' in value) {
    return value as Timestamp;
  }
  return null;
}

function getWeekKey(data: DocumentData): string | null {
  return cleanString(data?.['replayPayload']?.['triggerEvent']?.['eventData']?.['weekKey']) ?? null;
}

function getScheduledAt(data: DocumentData): string | null {
  return (
    cleanString(data?.['replayPayload']?.['triggerEvent']?.['eventData']?.['scheduledAt']) ??
    cleanString(data?.['replayPayload']?.['context']?.['scheduledAt']) ??
    null
  );
}

function getTerminalDispatchStatus(status: string): 'completed' | 'failed' | null {
  if (status === 'completed') return 'completed';
  if (status === 'failed' || status === 'cancelled') return 'failed';
  return null;
}

function buildTargetDocument(data: DocumentData): DocumentData {
  return {
    ...data,
    migration: {
      sourceCollection: LEGACY_COLLECTION,
      script: 'migrate-weekly-recap-jobs',
      version: MIGRATION_VERSION,
      migratedAt: FieldValue.serverTimestamp(),
    },
  };
}

function buildDispatchPatch(params: {
  readonly data: DocumentData;
  readonly operationId: string;
  readonly userId: string;
  readonly weekKey: string;
  readonly dispatchStatus: 'completed' | 'failed';
  readonly dispatchExists: boolean;
}): DocumentData {
  const { data, operationId, userId, weekKey, dispatchStatus, dispatchExists } = params;
  const completedAt =
    asTimestamp(data['completedAt']) ??
    asTimestamp(data['updatedAt']) ??
    asTimestamp(data['createdAt']);

  return {
    ...(dispatchExists
      ? {}
      : {
          createdAt: asTimestamp(data['createdAt']) ?? FieldValue.serverTimestamp(),
        }),
    userId,
    triggerType: 'weekly_recap',
    weekKey,
    operationId,
    ...(getScheduledAt(data) ? { scheduledAt: getScheduledAt(data) } : {}),
    status: dispatchStatus,
    updatedAt: FieldValue.serverTimestamp(),
    ...(dispatchStatus === 'completed'
      ? {
          completedAt: completedAt ?? FieldValue.serverTimestamp(),
          failedAt: null,
          error: null,
        }
      : {
          failedAt: completedAt ?? FieldValue.serverTimestamp(),
          completedAt: null,
          error: cleanString(data['error']) ?? `Legacy weekly recap job ${String(data['status'])}`,
        }),
  };
}

async function main(): Promise<void> {
  const weekFilter = getArg('week');
  const limit = parseInt(getArg('limit') ?? '0', 10) || 0;

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Weekly Recap Job Migration');
  console.log(`  Environment: ${environment}`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN (no writes)' : 'COMMIT MODE'}`);
  console.log(`  Delete legacy docs: ${deleteLegacy ? 'yes' : 'no'}`);
  if (weekFilter) console.log(`  Week filter: ${weekFilter}`);
  if (limit > 0) console.log(`  Limit: ${limit}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  let query: FirebaseFirestore.Query = firestore
    .collection(LEGACY_COLLECTION)
    .where('replayPayload.triggerEvent.type', '==', 'weekly_recap');

  if (weekFilter) {
    query = query.where('replayPayload.triggerEvent.eventData.weekKey', '==', weekFilter);
  }

  const snapshot = await query.get();
  const allDocs = limit > 0 ? snapshot.docs.slice(0, limit) : snapshot.docs;
  const terminalDocs = allDocs.filter((doc) =>
    TERMINAL_STATUSES.has(String(doc.get('status') ?? ''))
  );

  console.log(`Scanned ${allDocs.length} weekly recap legacy job(s)`);
  console.log(`Eligible terminal jobs: ${terminalDocs.length}`);
  console.log(`Skipped non-terminal jobs: ${allDocs.length - terminalDocs.length}`);

  let batch = firestore.batch();
  let batchOps = 0;
  let copied = 0;
  let alreadyPresent = 0;
  let dispatchUpdated = 0;
  let deletedLegacy = 0;
  let eventDocsCopied = 0;
  let legacyEventDocsDeleted = 0;
  let skippedMissingMetadata = 0;

  const commitBatch = async (): Promise<void> => {
    if (dryRun || batchOps === 0) return;
    await batch.commit();
    batch = firestore.batch();
    batchOps = 0;
  };

  for (const doc of terminalDocs) {
    const data = doc.data();
    const operationId = doc.id;
    const userId = cleanString(data['userId']);
    const weekKey = getWeekKey(data);
    const status = cleanString(data['status']);
    const dispatchStatus = status ? getTerminalDispatchStatus(status) : null;

    if (!userId || !weekKey || !dispatchStatus) {
      skippedMissingMetadata += 1;
      console.log(`Skipping ${operationId}: missing migration metadata`);
      continue;
    }

    const targetRef = firestore.collection(TARGET_COLLECTION).doc(operationId);
    const dispatchRef = firestore.collection(DISPATCH_COLLECTION).doc(`${weekKey}_${userId}`);
    const [targetExisting, dispatchExisting] = await Promise.all([
      targetRef.get(),
      dispatchRef.get(),
    ]);

    if (targetExisting.exists) {
      alreadyPresent += 1;
    } else {
      copied += 1;
      if (!dryRun) {
        batch.set(targetRef, buildTargetDocument(data));
        batchOps += 1;
      }
    }

    dispatchUpdated += 1;
    if (!dryRun) {
      batch.set(
        dispatchRef,
        buildDispatchPatch({
          data,
          operationId,
          userId,
          weekKey,
          dispatchStatus,
          dispatchExists: dispatchExisting.exists,
        }),
        { merge: true }
      );
      batchOps += 1;
    }

    const [legacyEventsSnapshot, targetEventsSnapshot] = await Promise.all([
      doc.ref.collection(EVENTS_SUBCOLLECTION).get(),
      targetRef.collection(EVENTS_SUBCOLLECTION).get(),
    ]);
    const targetEventIds = new Set(targetEventsSnapshot.docs.map((eventDoc) => eventDoc.id));
    const missingLegacyEvents = legacyEventsSnapshot.docs.filter(
      (eventDoc) => !targetEventIds.has(eventDoc.id)
    );

    eventDocsCopied += missingLegacyEvents.length;
    if (!dryRun) {
      for (const eventDoc of missingLegacyEvents) {
        batch.set(targetRef.collection(EVENTS_SUBCOLLECTION).doc(eventDoc.id), eventDoc.data());
        batchOps += 1;

        if (batchOps >= WRITE_BATCH_LIMIT) {
          await commitBatch();
        }
      }
    }

    if (deleteLegacy) {
      deletedLegacy += 1;
      legacyEventDocsDeleted += legacyEventsSnapshot.size;
      if (!dryRun) {
        for (const legacyEventDoc of legacyEventsSnapshot.docs) {
          batch.delete(legacyEventDoc.ref);
          batchOps += 1;

          if (batchOps >= WRITE_BATCH_LIMIT) {
            await commitBatch();
          }
        }
        batch.delete(doc.ref);
        batchOps += 1;
      }
    }

    if (batchOps >= WRITE_BATCH_LIMIT) {
      await commitBatch();
    }
  }

  await commitBatch();

  console.log('');
  console.log('───────────────────────────────────────────────────');
  console.log(`Copied to ${TARGET_COLLECTION}: ${copied}`);
  console.log(`Already present in ${TARGET_COLLECTION}: ${alreadyPresent}`);
  console.log(`Dispatch rows normalized: ${dispatchUpdated}`);
  console.log(`Event docs copied: ${eventDocsCopied}`);
  console.log(
    `Legacy docs ${deleteLegacy ? 'queued for deletion' : 'left in place'}: ${deletedLegacy}`
  );
  console.log(
    `Legacy event docs ${deleteLegacy ? 'queued for deletion' : 'left in place'}: ${legacyEventDocsDeleted}`
  );
  console.log(`Skipped missing metadata: ${skippedMissingMetadata}`);
  console.log('───────────────────────────────────────────────────');
  console.log('');

  if (dryRun) {
    console.log('Dry run complete. Re-run with --commit to apply the migration.');
  } else {
    console.log('Migration complete.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
