/**
 * @fileoverview Universal Team Documents Backfill Script
 * @module @nxt1/backend/scripts
 *
 * Backfills staging TeamCallsheets and TeamPracticeScripts into UniversalFiles.
 * This is intentionally staging-only during rollout.
 *
 * Usage:
 *   npx tsx scripts/data-migrations/backfill-universal-team-documents.ts --staging
 *   npx tsx scripts/data-migrations/backfill-universal-team-documents.ts --staging --commit
 *   npx tsx scripts/data-migrations/backfill-universal-team-documents.ts --staging --team <teamId>
 */

import { stagingDb } from '../../src/utils/firebase-staging.js';
import {
  upsertUniversalFileFromCallsheet,
  upsertUniversalFileFromPracticeScript,
} from '../../src/services/team/universal-files-sync.service.js';

const TEAM_CALLSHEETS_COLLECTION = 'TeamCallsheets' as const;
const TEAM_PRACTICE_SCRIPTS_COLLECTION = 'TeamPracticeScripts' as const;
const UNIVERSAL_FILES_COLLECTION = 'UniversalFiles' as const;

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const isStaging = args.includes('--staging');
const teamId = args.includes('--team') ? args[args.indexOf('--team') + 1] : null;

interface CollectionStats {
  readonly label: string;
  total: number;
  missingUniversal: number;
  archived: number;
  written: number;
}

async function countMissingUniversal(ids: readonly string[]): Promise<number> {
  let missing = 0;

  for (const id of ids) {
    const universalDoc = await stagingDb.collection(UNIVERSAL_FILES_COLLECTION).doc(id).get();
    if (!universalDoc.exists) {
      missing += 1;
    }
  }

  return missing;
}

async function backfillCallsheets(): Promise<CollectionStats> {
  let query = stagingDb.collection(TEAM_CALLSHEETS_COLLECTION);
  if (teamId) {
    query = query.where('teamId', '==', teamId);
  }

  const snapshot = await query.get();
  const stats: CollectionStats = {
    label: 'callsheets',
    total: snapshot.size,
    missingUniversal: await countMissingUniversal(snapshot.docs.map((doc) => doc.id)),
    archived: snapshot.docs.filter((doc) => doc.data()?.['archived'] === true).length,
    written: 0,
  };

  if (!commit) {
    return stats;
  }

  for (const doc of snapshot.docs) {
    await upsertUniversalFileFromCallsheet({
      db: stagingDb,
      callsheet: doc.data() as Parameters<typeof upsertUniversalFileFromCallsheet>[0]['callsheet'],
    });
    stats.written += 1;
  }

  return stats;
}

async function backfillPracticeScripts(): Promise<CollectionStats> {
  let query = stagingDb.collection(TEAM_PRACTICE_SCRIPTS_COLLECTION);
  if (teamId) {
    query = query.where('teamId', '==', teamId);
  }

  const snapshot = await query.get();
  const stats: CollectionStats = {
    label: 'practice scripts',
    total: snapshot.size,
    missingUniversal: await countMissingUniversal(snapshot.docs.map((doc) => doc.id)),
    archived: snapshot.docs.filter((doc) => doc.data()?.['archived'] === true).length,
    written: 0,
  };

  if (!commit) {
    return stats;
  }

  for (const doc of snapshot.docs) {
    await upsertUniversalFileFromPracticeScript({
      db: stagingDb,
      script: doc.data() as Parameters<typeof upsertUniversalFileFromPracticeScript>[0]['script'],
    });
    stats.written += 1;
  }

  return stats;
}

function printStats(stats: CollectionStats): void {
  console.log(`  ${stats.label}:`);
  console.log(`    total:            ${stats.total}`);
  console.log(`    missingUniversal: ${stats.missingUniversal}`);
  console.log(`    archived:         ${stats.archived}`);
  console.log(`    written:          ${stats.written}`);
}

async function main(): Promise<void> {
  if (!isStaging) {
    throw new Error('This migration is staging-only. Re-run with --staging.');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Universal Team Documents Backfill');
  console.log('  Environment: staging');
  console.log(`  Mode: ${commit ? 'COMMIT MODE' : 'DRY RUN (no writes)'}`);
  if (teamId) {
    console.log(`  Scope: team ${teamId}`);
  }
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  const [callsheets, practiceScripts] = await Promise.all([
    backfillCallsheets(),
    backfillPracticeScripts(),
  ]);

  console.log('Results:');
  printStats(callsheets);
  printStats(practiceScripts);
  console.log('');

  if (!commit) {
    console.log('Dry run complete. Re-run with --commit to write UniversalFiles in staging.');
    return;
  }

  console.log('Backfill complete.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal backfill error:', error);
    process.exit(1);
  });
