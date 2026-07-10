#!/usr/bin/env tsx
/**
 * @fileoverview Usage Event Settled Cost Backfill
 * @module @nxt1/backend/scripts
 *
 * Backfills settled-style metadata onto historical usage events that only have
 * Helicone verified cost recorded. This supports the OpenRouter-direct cutover
 * without mutating records that already have authoritative settlement data.
 *
 * Backfilled fields:
 * - metadata.chargeBreakdown
 * - metadata.alreadySettled
 * - metadata.settlementPath
 * - metadata.openRouterDirectCostBackfillAt
 *
 * Usage:
 *   npx tsx scripts/data-migrations/backfill-usage-event-settled-costs.ts
 *   npx tsx scripts/data-migrations/backfill-usage-event-settled-costs.ts --limit=100
 *   npx tsx scripts/data-migrations/backfill-usage-event-settled-costs.ts --commit
 */

import 'dotenv/config';
import mongoose, { type FilterQuery } from 'mongoose';
import {
  UsageEventModel,
  type UsageEventDocument,
} from '../../src/models/analytics/usage-event.model.js';
import {
  getMongoDatabaseName,
  getRuntimeEnvironment,
} from '../../src/config/runtime-environment.js';
import { resolveUsageEventCostCents } from '../../src/services/reporting/usage-event-costs.js';

interface ScriptArgs {
  readonly dryRun: boolean;
  readonly sampleLimit: number;
  readonly limit: number;
}

interface CandidateSample {
  readonly _id: mongoose.Types.ObjectId;
  readonly feature?: string;
  readonly unitCostSnapshot?: number;
  readonly quantity?: number;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt?: Date;
}

function parseArgs(): ScriptArgs {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--commit');

  const sampleArg = args.find((arg) => arg.startsWith('--sample='));
  const parsedSample = sampleArg ? Number.parseInt(sampleArg.slice('--sample='.length), 10) : 5;
  const sampleLimit =
    Number.isFinite(parsedSample) && parsedSample > 0 ? Math.min(parsedSample, 25) : 5;

  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const parsedLimit = limitArg ? Number.parseInt(limitArg.slice('--limit='.length), 10) : 0;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 0;

  return { dryRun, sampleLimit, limit };
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

function getCandidateQuery(): FilterQuery<UsageEventDocument> {
  return {
    'metadata.heliconeVerifiedCostCents': { $type: 'number' },
    'metadata.chargeBreakdown.0': { $exists: false },
  };
}

async function countCandidates(collection: ReturnType<mongoose.Connection['collection']>): Promise<{
  readonly total: number;
  readonly candidateCount: number;
  readonly alreadySettledCount: number;
}> {
  const total = await collection.countDocuments({});
  const candidateCount = await collection.countDocuments(getCandidateQuery());
  const alreadySettledCount = await collection.countDocuments({
    'metadata.chargeBreakdown.0': { $exists: true },
  });

  return { total, candidateCount, alreadySettledCount };
}

function printHeader(environment: string, dbName: string, dryRun: boolean, limit: number): void {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Usage Event Settled Cost Backfill');
  console.log(`  Environment: ${environment}`);
  console.log(`  Database: ${dbName}`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN (no writes)' : 'COMMIT MODE'}`);
  console.log(`  Limit: ${limit > 0 ? limit : 'all matching events'}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');
}

function formatSummary(stats: {
  readonly total: number;
  readonly candidateCount: number;
  readonly alreadySettledCount: number;
}): string {
  return [
    `  total usage events:       ${stats.total}`,
    `  already settled events:   ${stats.alreadySettledCount}`,
    `  backfill candidates:      ${stats.candidateCount}`,
  ].join('\n');
}

function formatSample(sample: CandidateSample): Record<string, unknown> {
  const heliconeVerifiedCostCents = sample.metadata?.['heliconeVerifiedCostCents'];
  return {
    _id: String(sample._id),
    feature: sample.feature,
    createdAt: sample.createdAt,
    unitCostSnapshot: sample.unitCostSnapshot,
    quantity: sample.quantity,
    heliconeVerifiedCostCents,
    resolvedReportableCostCents: resolveUsageEventCostCents({
      metadata: sample.metadata,
      unitCostSnapshot: sample.unitCostSnapshot,
      quantity: sample.quantity,
    }),
  };
}

async function main(): Promise<void> {
  const { dryRun, sampleLimit, limit } = parseArgs();
  const environment = getRuntimeEnvironment();
  const mongoUri = resolveMongoUri();
  const dbName = getMongoDatabaseName(mongoUri);

  printHeader(environment, dbName, dryRun, limit);

  await mongoose.connect(mongoUri, { dbName });

  try {
    const collectionName = UsageEventModel.collection.collectionName;
    const collection = mongoose.connection.collection(collectionName);
    const candidateQuery = getCandidateQuery();

    const before = await countCandidates(collection);
    console.log('Pre-backfill snapshot:');
    console.log(formatSummary(before));
    console.log('');

    if (before.candidateCount === 0) {
      console.log('No historical Helicone-only usage events require backfill.');
      return;
    }

    const candidateCursor = collection
      .find<CandidateSample>(candidateQuery, {
        projection: {
          _id: 1,
          feature: 1,
          unitCostSnapshot: 1,
          quantity: 1,
          metadata: 1,
          createdAt: 1,
        },
      })
      .sort({ createdAt: 1 });

    if (limit > 0) {
      candidateCursor.limit(limit);
    }

    const candidates = await candidateCursor.toArray();
    const candidateIds = candidates.map((candidate) => candidate._id);

    console.log(`Selected candidates for this run: ${candidateIds.length}`);
    console.log('');

    const samples = candidates.slice(0, sampleLimit);
    console.log(`Sample candidate documents (max ${samples.length}):`);
    for (const sample of samples) {
      console.log(JSON.stringify(formatSample(sample), null, 2));
    }
    console.log('');

    if (dryRun) {
      console.log('Dry run complete. Re-run with --commit to apply settled cost backfill.');
      return;
    }

    const backfillTimestamp = new Date();
    const updateResult = await collection.updateMany({ _id: { $in: candidateIds } }, [
      {
        $set: {
          metadata: {
            $mergeObjects: [
              { $ifNull: ['$metadata', {}] },
              {
                alreadySettled: true,
                settlementPath: 'historical_helicone_backfill',
                openRouterDirectCostBackfillAt: backfillTimestamp.toISOString(),
                chargeBreakdown: [
                  {
                    source: 'historical_helicone_backfill',
                    chargeAmountCents: {
                      $round: [{ $ifNull: ['$metadata.heliconeVerifiedCostCents', 0] }, 0],
                    },
                  },
                ],
              },
            ],
          },
          updatedAt: backfillTimestamp,
        },
      },
    ]);

    const after = await countCandidates(collection);

    console.log('Backfill write result:');
    console.log(`  matched:  ${updateResult.matchedCount}`);
    console.log(`  modified: ${updateResult.modifiedCount}`);
    console.log('');

    console.log('Post-backfill snapshot:');
    console.log(formatSummary(after));
    console.log('');

    if (after.candidateCount >= before.candidateCount && updateResult.modifiedCount > 0) {
      throw new Error('Backfill did not reduce the candidate count. Inspect migrated documents.');
    }

    console.log(
      'Backfill complete. Historical usage events now expose settled-style cost metadata.'
    );
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
