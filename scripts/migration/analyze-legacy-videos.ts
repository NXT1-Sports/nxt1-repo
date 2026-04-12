/**
 * @fileoverview Analyze Legacy Videos Collection
 *
 * Generates a report on the legacy `Videos` collection to support the
 * migration to `Posts` (type: 'highlight'). Counts documents, checks for
 * missing fields, identifies duplicates, and generates summary statistics.
 *
 * Usage:
 *   npx tsx scripts/migration/analyze-legacy-videos.ts
 *   npx tsx scripts/migration/analyze-legacy-videos.ts --limit=500
 *   npx tsx scripts/migration/analyze-legacy-videos.ts --dry-run
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

const batchLimit = parseInt(getArg('limit') ?? '0', 10) || 0; // 0 = all
const isDryRun = args.includes('--dry-run');

// ─── Firebase Init ────────────────────────────────────────────────────────────
const serviceAccountPath =
  process.env['GOOGLE_APPLICATION_CREDENTIALS'] ||
  resolve(__dirname, '../../assets/nxt-1-staging-v2-ae4fac811aa4.json');

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8')) as ServiceAccount;
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── Types ────────────────────────────────────────────────────────────────────
interface VideoReport {
  totalDocuments: number;
  uniqueUsers: number;
  uniqueSports: Set<string>;
  providers: Record<string, number>;
  missingFields: {
    userId: number;
    sportId: number;
    ownerType: number;
    url: number;
    platform: number;
    type: number;
  };
  duplicateUrls: number;
  alreadyInPosts: number;
  readyToMigrate: number;
  sampleMissing: Array<{ id: string; missing: string[] }>;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Legacy Videos → Posts Migration Analysis      ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const report: VideoReport = {
    totalDocuments: 0,
    uniqueUsers: 0,
    uniqueSports: new Set<string>(),
    providers: {},
    missingFields: {
      userId: 0,
      sportId: 0,
      ownerType: 0,
      url: 0,
      platform: 0,
      type: 0,
    },
    duplicateUrls: 0,
    alreadyInPosts: 0,
    readyToMigrate: 0,
    sampleMissing: [],
  };

  const userSet = new Set<string>();
  const urlSet = new Set<string>();

  // Paginate through Videos collection
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let processed = 0;
  const PAGE_SIZE = 500;

  console.log('Scanning Videos collection...\n');

  while (true) {
    let query = db
      .collection('Videos')
      .orderBy('createdAt', 'desc')
      .limit(PAGE_SIZE) as FirebaseFirestore.Query;

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      processed++;
      report.totalDocuments++;
      const data = doc.data();

      // Track unique users and sports
      const userId = data['userId'] as string | undefined;
      if (userId) userSet.add(userId);
      const sportId = data['sportId'] as string | undefined;
      if (sportId) report.uniqueSports.add(sportId);

      // Provider distribution
      const provider = (data['platform'] ?? data['provider'] ?? 'unknown') as string;
      report.providers[provider] = (report.providers[provider] ?? 0) + 1;

      // Missing fields analysis
      const missing: string[] = [];
      if (!userId) {
        report.missingFields.userId++;
        missing.push('userId');
      }
      if (!sportId) {
        report.missingFields.sportId++;
        missing.push('sportId');
      }
      if (!data['ownerType']) {
        report.missingFields.ownerType++;
        missing.push('ownerType');
      }
      const url = (data['url'] ?? data['src']) as string | undefined;
      if (!url) {
        report.missingFields.url++;
        missing.push('url');
      }
      if (!data['platform'] && !data['provider']) {
        report.missingFields.platform++;
        missing.push('platform');
      }
      if (!data['type']) {
        report.missingFields.type++;
        missing.push('type');
      }

      // Duplicate URL check
      if (url) {
        const normalizedUrl = url.trim().toLowerCase();
        if (urlSet.has(normalizedUrl)) {
          report.duplicateUrls++;
        }
        urlSet.add(normalizedUrl);
      }

      // Sample missing docs (cap at 10)
      if (missing.length > 0 && report.sampleMissing.length < 10) {
        report.sampleMissing.push({ id: doc.id, missing });
      }

      // Can this be migrated?
      if (userId && url) {
        report.readyToMigrate++;
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    process.stdout.write(`\r  Processed: ${processed} documents`);

    if (batchLimit > 0 && processed >= batchLimit) break;
  }

  report.uniqueUsers = userSet.size;

  // Check how many already exist in Posts as highlights
  console.log('\n\nChecking existing Posts highlights...');
  const postsSnap = await db.collection('Posts').where('type', '==', 'highlight').limit(1).get();
  report.alreadyInPosts = postsSnap.size > 0 ? -1 : 0; // -1 means "exists, need full count"

  if (report.alreadyInPosts === -1) {
    let postCount = 0;
    let lastPostDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

    while (true) {
      let pq = db
        .collection('Posts')
        .where('type', '==', 'highlight')
        .limit(PAGE_SIZE) as FirebaseFirestore.Query;
      if (lastPostDoc) pq = pq.startAfter(lastPostDoc);
      const psnap = await pq.get();
      if (psnap.empty) break;
      postCount += psnap.size;
      lastPostDoc = psnap.docs[psnap.docs.length - 1];
    }
    report.alreadyInPosts = postCount;
  }

  // ─── Print Report ─────────────────────────────────────────────────────────
  console.log('\n\n══════════════════════════════════════════════════');
  console.log('  LEGACY VIDEOS ANALYSIS REPORT');
  console.log('══════════════════════════════════════════════════\n');

  console.log(`  Total Documents:     ${report.totalDocuments}`);
  console.log(`  Unique Users:        ${report.uniqueUsers}`);
  console.log(
    `  Unique Sports:       ${report.uniqueSports.size} (${[...report.uniqueSports].join(', ')})`
  );
  console.log(`  Ready to Migrate:    ${report.readyToMigrate}`);
  console.log(`  Duplicate URLs:      ${report.duplicateUrls}`);
  console.log(`  Already in Posts:    ${report.alreadyInPosts}`);

  console.log('\n  Provider Distribution:');
  for (const [provider, count] of Object.entries(report.providers).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${provider.padEnd(15)} ${count}`);
  }

  console.log('\n  Missing Fields:');
  for (const [field, count] of Object.entries(report.missingFields)) {
    if (count > 0) {
      console.log(`    ${field.padEnd(15)} ${count} missing`);
    }
  }
  if (Object.values(report.missingFields).every((c) => c === 0)) {
    console.log('    ✅ All required fields present');
  }

  if (report.sampleMissing.length > 0) {
    console.log('\n  Sample Docs with Missing Fields:');
    for (const s of report.sampleMissing) {
      console.log(`    ${s.id}: [${s.missing.join(', ')}]`);
    }
  }

  const migrationGap = report.totalDocuments - report.alreadyInPosts;
  console.log('\n──────────────────────────────────────────────────');
  console.log(`  Migration Gap: ${migrationGap} documents need migration`);
  console.log(`  Estimated Batches: ${Math.ceil(migrationGap / 500)} (500 docs/batch)`);
  console.log('──────────────────────────────────────────────────\n');

  if (isDryRun) {
    console.log('  [DRY RUN] No changes made.\n');
  }
}

main().catch((err) => {
  console.error('\n❌ Analysis failed:', err);
  process.exit(1);
});
