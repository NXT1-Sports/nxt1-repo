#!/usr/bin/env tsx
/**
 * @fileoverview Agent Message Interaction Backfill
 * @module @nxt1/backend/scripts
 *
 * Backfills AgentMessage documents created before Phase 1 message-action fields
 * were introduced. This script is idempotent and safe to run multiple times.
 *
 * Fields backfilled:
 * - editHistory: []
 * - actions: []
 * - deletedAt: null
 * - deletedBy: null
 *
 * Usage:
 *   npx tsx scripts/backfill-agent-message-interactions.ts             # dry-run
 *   npx tsx scripts/backfill-agent-message-interactions.ts --commit    # apply writes
 *   npx tsx scripts/backfill-agent-message-interactions.ts --sample=10 # dry-run sample size
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { AgentMessageModel } from '../src/models/agent/agent-message.model.js';
import { getMongoDatabaseName, getRuntimeEnvironment } from '../src/config/runtime-environment.js';

interface BackfillStats {
  readonly _id: null;
  readonly total: number;
  readonly needsMigration: number;
  readonly missingEditHistory: number;
  readonly missingActions: number;
  readonly missingDeletedAt: number;
  readonly missingDeletedBy: number;
}

function parseArgs(): { readonly dryRun: boolean; readonly sampleLimit: number } {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--commit');

  const sampleArg = args.find((arg) => arg.startsWith('--sample='));
  const parsedSample = sampleArg ? Number.parseInt(sampleArg.slice('--sample='.length), 10) : 5;
  const sampleLimit =
    Number.isFinite(parsedSample) && parsedSample > 0 ? Math.min(parsedSample, 25) : 5;

  return { dryRun, sampleLimit };
}

function resolveMongoUri(): string {
  const uri =
    process.env['MONGO'] ??
    process.env['MONGO_URI'] ??
    process.env['MONGODB_URI'] ??
    process.env['MONGODB_URL'];

  if (!uri || uri.trim().length === 0) {
    throw new Error('Missing Mongo URI. Set MONGO (or MONGO_URI / MONGODB_URI / MONGODB_URL).');
  }

  return uri;
}

function notArrayExpr(fieldName: string): Record<string, unknown> {
  return { $not: [{ $isArray: `$${fieldName}` }] };
}

function missingFieldExpr(fieldName: string): Record<string, unknown> {
  return { $eq: [{ $type: `$${fieldName}` }, 'missing'] };
}

async function collectStats(
  collection: ReturnType<mongoose.Connection['collection']>
): Promise<BackfillStats> {
  const needsMigrationExpr = {
    $or: [
      notArrayExpr('editHistory'),
      notArrayExpr('actions'),
      missingFieldExpr('deletedAt'),
      missingFieldExpr('deletedBy'),
    ],
  };

  const results = await collection
    .aggregate<BackfillStats>([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          needsMigration: { $sum: { $cond: [needsMigrationExpr, 1, 0] } },
          missingEditHistory: { $sum: { $cond: [notArrayExpr('editHistory'), 1, 0] } },
          missingActions: { $sum: { $cond: [notArrayExpr('actions'), 1, 0] } },
          missingDeletedAt: { $sum: { $cond: [missingFieldExpr('deletedAt'), 1, 0] } },
          missingDeletedBy: { $sum: { $cond: [missingFieldExpr('deletedBy'), 1, 0] } },
        },
      },
    ])
    .toArray();

  return (
    results[0] ?? {
      _id: null,
      total: 0,
      needsMigration: 0,
      missingEditHistory: 0,
      missingActions: 0,
      missingDeletedAt: 0,
      missingDeletedBy: 0,
    }
  );
}

function formatStats(stats: BackfillStats): string {
  return [
    `  total messages:         ${stats.total}`,
    `  needing migration:      ${stats.needsMigration}`,
    `  missing editHistory:    ${stats.missingEditHistory}`,
    `  missing actions:        ${stats.missingActions}`,
    `  missing deletedAt:      ${stats.missingDeletedAt}`,
    `  missing deletedBy:      ${stats.missingDeletedBy}`,
  ].join('\n');
}

async function main(): Promise<void> {
  const { dryRun, sampleLimit } = parseArgs();
  const environment = getRuntimeEnvironment();
  const mongoUri = resolveMongoUri();
  const dbName = getMongoDatabaseName(mongoUri);

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Agent Message Interaction Backfill');
  console.log(`  Environment: ${environment}`);
  console.log(`  Database: ${dbName}`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN (no writes)' : 'COMMIT MODE'}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  await mongoose.connect(mongoUri, { dbName });

  try {
    const collectionName = AgentMessageModel.collection.collectionName;
    const collection = mongoose.connection.collection(collectionName);

    const needsMigrationExpr = {
      $or: [
        notArrayExpr('editHistory'),
        notArrayExpr('actions'),
        missingFieldExpr('deletedAt'),
        missingFieldExpr('deletedBy'),
      ],
    };

    const before = await collectStats(collection);
    console.log('Pre-backfill snapshot:');
    console.log(formatStats(before));
    console.log('');

    if (before.needsMigration === 0) {
      console.log('No documents require backfill.');
      return;
    }

    if (dryRun) {
      const samples = await collection
        .find(
          { $expr: needsMigrationExpr },
          {
            projection: {
              _id: 1,
              threadId: 1,
              userId: 1,
              role: 1,
              editHistory: 1,
              actions: 1,
              deletedAt: 1,
              deletedBy: 1,
              createdAt: 1,
            },
          }
        )
        .sort({ createdAt: -1 })
        .limit(sampleLimit)
        .toArray();

      console.log(`Sample documents needing migration (max ${sampleLimit}):`);
      for (const sample of samples) {
        console.log(
          JSON.stringify(
            {
              _id: String(sample._id),
              threadId: sample.threadId,
              role: sample.role,
              hasEditHistoryArray: Array.isArray(sample.editHistory),
              hasActionsArray: Array.isArray(sample.actions),
              hasDeletedAtField: Object.prototype.hasOwnProperty.call(sample, 'deletedAt'),
              hasDeletedByField: Object.prototype.hasOwnProperty.call(sample, 'deletedBy'),
              createdAt: sample.createdAt,
            },
            null,
            2
          )
        );
      }

      console.log('');
      console.log('Dry run complete. Re-run with --commit to apply backfill writes.');
      return;
    }

    const backfillResult = await collection.updateMany({ $expr: needsMigrationExpr }, [
      {
        $set: {
          editHistory: {
            $cond: [{ $isArray: '$editHistory' }, '$editHistory', []],
          },
          actions: {
            $cond: [{ $isArray: '$actions' }, '$actions', []],
          },
          deletedAt: { $ifNull: ['$deletedAt', null] },
          deletedBy: { $ifNull: ['$deletedBy', null] },
        },
      },
    ]);

    // Ensure new interaction indexes exist even when autoIndex is disabled in runtime.
    await AgentMessageModel.createIndexes();

    const after = await collectStats(collection);

    console.log('Backfill write result:');
    console.log(`  matched:  ${backfillResult.matchedCount}`);
    console.log(`  modified: ${backfillResult.modifiedCount}`);
    console.log('');

    console.log('Post-backfill snapshot:');
    console.log(formatStats(after));
    console.log('');

    if (after.needsMigration !== 0) {
      throw new Error(
        `Backfill incomplete: ${after.needsMigration} message(s) still missing required fields.`
      );
    }

    console.log('Backfill complete. Phase 1 message interaction schema is fully backfilled.');
  } finally {
    await mongoose.disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal backfill error:', error);
    process.exit(1);
  });
