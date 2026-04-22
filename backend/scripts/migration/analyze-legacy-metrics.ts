/**
 * @fileoverview Analyze Legacy Metrics Subcollection
 *
 * Scans Users/{uid}/sports/{sportId}/metrics subcollections to generate a
 * migration report for the transition to root-level `PlayerMetrics` collection.
 * Counts total metrics, unique users/sports, identifies missing fields, and
 * estimates migration scope.
 *
 * Usage:
 *   npx tsx scripts/migration/analyze-legacy-metrics.ts
 *   npx tsx scripts/migration/analyze-legacy-metrics.ts --limit=100
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { readFileSync } from 'node:fs';
import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ─── CLI Args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name: string) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') ?? null;

const userLimit = parseInt(getArg('limit') ?? '0', 10) || 0; // 0 = all

// ─── Firebase Init ────────────────────────────────────────────────────────────
const serviceAccountPath =
  process.env['GOOGLE_APPLICATION_CREDENTIALS'] ||
  resolve(__dirname, '../../assets/nxt-1-staging-v2-ae4fac811aa4.json');

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8')) as ServiceAccount;
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── Types ────────────────────────────────────────────────────────────────────
interface MetricsReport {
  usersScanned: number;
  usersWithSportsSubcol: number;
  usersWithMetrics: number;
  totalMetricDocs: number;
  uniqueSports: Set<string>;
  fieldDistribution: Record<string, number>;
  categoriesFound: Record<string, number>;
  sourcesFound: Record<string, number>;
  missingSource: number;
  missingValue: number;
  alreadyInPlayerMetrics: number;
  readyToMigrate: number;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Legacy Metrics Subcol → PlayerMetrics Report  ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const report: MetricsReport = {
    usersScanned: 0,
    usersWithSportsSubcol: 0,
    usersWithMetrics: 0,
    totalMetricDocs: 0,
    uniqueSports: new Set<string>(),
    fieldDistribution: {},
    categoriesFound: {},
    sourcesFound: {},
    missingSource: 0,
    missingValue: 0,
    alreadyInPlayerMetrics: 0,
    readyToMigrate: 0,
  };

  // Step 1: Paginate through Users
  console.log('Step 1: Scanning Users for sports/metrics subcollections...\n');
  let lastUserDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  const PAGE_SIZE = 200;

  while (true) {
    let query = db.collection('Users').limit(PAGE_SIZE) as FirebaseFirestore.Query;
    if (lastUserDoc) query = query.startAfter(lastUserDoc);

    const snap = await query.get();
    if (snap.empty) break;

    for (const userDoc of snap.docs) {
      report.usersScanned++;
      const userId = userDoc.id;

      // Check if user has a sports subcollection
      const sportsSnap = await db
        .collection('Users')
        .doc(userId)
        .collection('sports')
        .limit(20)
        .get();

      if (sportsSnap.empty) continue;
      report.usersWithSportsSubcol++;

      // For each sport, check for metrics subcollection
      for (const sportDoc of sportsSnap.docs) {
        const sportId = sportDoc.id;
        report.uniqueSports.add(sportId);

        const metricsSnap = await db
          .collection('Users')
          .doc(userId)
          .collection('sports')
          .doc(sportId)
          .collection('metrics')
          .limit(100)
          .get();

        if (metricsSnap.empty) continue;
        report.usersWithMetrics++;

        for (const metricDoc of metricsSnap.docs) {
          report.totalMetricDocs++;
          const data = metricDoc.data();

          // Field distribution
          const field = (data['field'] ?? metricDoc.id) as string;
          report.fieldDistribution[field] = (report.fieldDistribution[field] ?? 0) + 1;

          // Category distribution
          const category = data['category'] as string | undefined;
          if (category) {
            report.categoriesFound[category] = (report.categoriesFound[category] ?? 0) + 1;
          }

          // Source distribution
          const source = (data['source'] ?? data['provider']) as string | undefined;
          if (source) {
            report.sourcesFound[source] = (report.sourcesFound[source] ?? 0) + 1;
          } else {
            report.missingSource++;
          }

          // Value check
          if (data['value'] === undefined || data['value'] === null) {
            report.missingValue++;
          }

          // Can migrate?
          if (data['value'] !== undefined && data['value'] !== null) {
            report.readyToMigrate++;
          }
        }
      }

      process.stdout.write(`\r  Users scanned: ${report.usersScanned}`);
    }

    lastUserDoc = snap.docs[snap.docs.length - 1];
    if (userLimit > 0 && report.usersScanned >= userLimit) break;
  }

  // Step 2: Check existing PlayerMetrics collection
  console.log('\n\nStep 2: Checking existing PlayerMetrics collection...');
  let pmCount = 0;
  let lastPmDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  while (true) {
    let pmq = db.collection('PlayerMetrics').limit(PAGE_SIZE) as FirebaseFirestore.Query;
    if (lastPmDoc) pmq = pmq.startAfter(lastPmDoc);
    const pmSnap = await pmq.get();
    if (pmSnap.empty) break;
    pmCount += pmSnap.size;
    lastPmDoc = pmSnap.docs[pmSnap.docs.length - 1];
  }
  report.alreadyInPlayerMetrics = pmCount;

  // ─── Print Report ─────────────────────────────────────────────────────────
  console.log('\n\n══════════════════════════════════════════════════');
  console.log('  LEGACY METRICS SUBCOLLECTION ANALYSIS REPORT');
  console.log('══════════════════════════════════════════════════\n');

  console.log(`  Users Scanned:           ${report.usersScanned}`);
  console.log(`  Users w/ Sports Subcol:  ${report.usersWithSportsSubcol}`);
  console.log(`  Users w/ Metrics:        ${report.usersWithMetrics}`);
  console.log(`  Total Metric Docs:       ${report.totalMetricDocs}`);
  console.log(
    `  Unique Sports:           ${report.uniqueSports.size} (${[...report.uniqueSports].join(', ')})`
  );
  console.log(`  Ready to Migrate:        ${report.readyToMigrate}`);
  console.log(`  Already in PlayerMetrics:${report.alreadyInPlayerMetrics}`);

  console.log('\n  Field Distribution (top 20):');
  const sortedFields = Object.entries(report.fieldDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  for (const [field, count] of sortedFields) {
    console.log(`    ${field.padEnd(25)} ${count}`);
  }

  if (Object.keys(report.categoriesFound).length > 0) {
    console.log('\n  Category Distribution:');
    for (const [cat, count] of Object.entries(report.categoriesFound).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${cat.padEnd(20)} ${count}`);
    }
  }

  console.log('\n  Source/Provider Distribution:');
  for (const [src, count] of Object.entries(report.sourcesFound).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${src.padEnd(20)} ${count}`);
  }
  if (report.missingSource > 0) {
    console.log(`    ${'(no source)'.padEnd(20)} ${report.missingSource}`);
  }

  console.log('\n  Data Quality:');
  console.log(`    Missing source:   ${report.missingSource}`);
  console.log(`    Missing value:    ${report.missingValue}`);

  const migrationGap = report.totalMetricDocs - report.alreadyInPlayerMetrics;
  console.log('\n──────────────────────────────────────────────────');
  console.log(`  Migration Gap: ${migrationGap} metric docs need migration`);
  console.log(`  Estimated Batches: ${Math.ceil(migrationGap / 500)} (500 docs/batch)`);
  console.log('──────────────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('\n❌ Analysis failed:', err);
  process.exit(1);
});
