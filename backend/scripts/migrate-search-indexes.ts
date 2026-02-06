#!/usr/bin/env tsx
/**
 * @fileoverview Search Index Migration Script
 * @module @nxt1/backend/scripts/migrate-search-indexes
 *
 * Script to add searchIndex field to existing documents in Firestore.
 * Run this once to enable search functionality for existing data.
 *
 * Usage:
 *   npm run migrate:search-indexes
 *   npm run migrate:search-indexes -- --collection=Users
 *   npm run migrate:search-indexes -- --dry-run
 */

import { db } from '../src/utils/firebase.js';
import {
  buildAthleteSearchIndex,
  buildCollegeSearchIndex,
  buildTeamSearchIndex,
  buildVideoSearchIndex,
  buildCampSearchIndex,
  buildEventSearchIndex,
  buildScoutReportSearchIndex,
  buildLeaderboardSearchIndex,
  batchUpdateSearchIndexes,
} from '../src/utils/search-index.js';

// ============================================
// CONFIGURATION
// ============================================

interface MigrationConfig {
  collection: string;
  buildFn: (data: FirebaseFirestore.DocumentData) => string[];
  filter?: (data: FirebaseFirestore.DocumentData) => boolean;
}

const MIGRATIONS: MigrationConfig[] = [
  {
    collection: 'Users',
    buildFn: (data) => buildAthleteSearchIndex(data),
    filter: (data) => data['accountType'] === 'athlete', // Only index athletes
  },
  {
    collection: 'Colleges',
    buildFn: (data) => buildCollegeSearchIndex(data),
  },
  {
    collection: 'Teams',
    buildFn: (data) => buildTeamSearchIndex(data),
  },
  {
    collection: 'Videos',
    buildFn: (data) => buildVideoSearchIndex(data),
  },
  {
    collection: 'Camps',
    buildFn: (data) => buildCampSearchIndex(data),
  },
  {
    collection: 'Events',
    buildFn: (data) => buildEventSearchIndex(data),
  },
  {
    collection: 'ScoutReports',
    buildFn: (data) => buildScoutReportSearchIndex(data),
  },
  {
    collection: 'Leaderboards',
    buildFn: (data) => buildLeaderboardSearchIndex(data),
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Parse command line arguments
 */
function parseArgs(): { collection?: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  const collection = args.find((arg) => arg.startsWith('--collection='))?.split('=')[1];
  const dryRun = args.includes('--dry-run');

  return { collection, dryRun };
}

/**
 * Dry run - count documents that need indexing
 */
async function dryRunMigration(config: MigrationConfig): Promise<number> {
  let count = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  const batchSize = 100;

  while (true) {
    let query = db.collection(config.collection).limit(batchSize);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    for (const doc of snapshot.docs) {
      const data = doc.data();

      // Apply filter if exists
      if (config.filter && !config.filter(data)) {
        continue;
      }

      // Check if searchIndex exists
      if (!data['searchIndex'] || !Array.isArray(data['searchIndex'])) {
        count++;
      }
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  return count;
}

/**
 * Run migration for a collection
 */
async function runMigration(config: MigrationConfig): Promise<{
  updated: number;
  errors: number;
}> {
  console.log(`\n🔄 Migrating ${config.collection}...`);

  let updated = 0;
  let errors = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  const batchSize = 100;

  while (true) {
    let query = db.collection(config.collection).limit(batchSize);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();

        // Apply filter if exists
        if (config.filter && !config.filter(data)) {
          continue;
        }

        // Check if already has searchIndex
        if (data['searchIndex'] && Array.isArray(data['searchIndex'])) {
          continue;
        }

        // Build search index
        const searchIndex = config.buildFn(data);

        batch.update(doc.ref, {
          searchIndex,
          searchIndexUpdatedAt: new Date().toISOString(),
        });

        batchCount++;
      } catch (error) {
        console.error(`❌ Error processing ${config.collection}/${doc.id}:`, error);
        errors++;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
      updated += batchCount;
      console.log(`  ✅ Updated ${updated} documents in ${config.collection}`);
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  return { updated, errors };
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main(): Promise<void> {
  console.log('🚀 Search Index Migration Tool\n');

  const { collection, dryRun } = parseArgs();

  // Filter migrations based on collection argument
  let migrationsToRun = MIGRATIONS;
  if (collection) {
    migrationsToRun = MIGRATIONS.filter((m) => m.collection === collection);
    if (migrationsToRun.length === 0) {
      console.error(`❌ Unknown collection: ${collection}`);
      console.log('\nAvailable collections:');
      MIGRATIONS.forEach((m) => console.log(`  - ${m.collection}`));
      process.exit(1);
    }
  }

  // Dry run mode
  if (dryRun) {
    console.log('📊 DRY RUN MODE - No changes will be made\n');

    for (const config of migrationsToRun) {
      console.log(`Checking ${config.collection}...`);
      const count = await dryRunMigration(config);
      console.log(`  Documents needing index: ${count}\n`);
    }

    console.log('✅ Dry run complete\n');
    console.log('To apply changes, run without --dry-run flag');
    return;
  }

  // Confirmation
  console.log('Collections to migrate:');
  migrationsToRun.forEach((m) => console.log(`  - ${m.collection}`));
  console.log('\n⚠️  This will update documents in Firestore\n');

  // Run migrations
  const startTime = Date.now();
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const config of migrationsToRun) {
    const result = await runMigration(config);
    totalUpdated += result.updated;
    totalErrors += result.errors;
    console.log(`  ✅ ${config.collection}: ${result.updated} updated, ${result.errors} errors`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Migration Complete!');
  console.log('='.repeat(60));
  console.log(`Total documents updated: ${totalUpdated}`);
  console.log(`Total errors: ${totalErrors}`);
  console.log(`Duration: ${duration}s`);
  console.log('\nSearch indexes have been added to all documents.');
  console.log('The search API should now work correctly! 🎉\n');
}

// Run the script
main().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
