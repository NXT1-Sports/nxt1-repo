/**
 * @fileoverview Migrate Legacy Metrics Subcollection → Root PlayerMetrics
 *
 * Reads from Users/{uid}/sports/{sportId}/metrics/{fieldId} subcollections
 * and writes to root `PlayerMetrics` collection with deterministic composite
 * doc IDs: `{userId}_{sportId}_{field}`.
 *
 * Idempotent — uses `set({ merge: true })` so re-running is safe.
 *
 * Usage:
 *   npx tsx scripts/migration/migrate-metrics-to-root.ts --dry-run
 *   npx tsx scripts/migration/migrate-metrics-to-root.ts --limit=50
 *   npx tsx scripts/migration/migrate-metrics-to-root.ts              # Full migration
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

const userLimit = parseInt(getArg('limit') ?? '0', 10) || 0;
const isDryRun = args.includes('--dry-run');

// ─── Firebase Init ────────────────────────────────────────────────────────────
const serviceAccountPath =
  process.env['GOOGLE_APPLICATION_CREDENTIALS'] ||
  resolve(__dirname, '../../assets/nxt-1-staging-v2-ae4fac811aa4.json');

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8')) as ServiceAccount;
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const PLAYER_METRICS_COLLECTION = 'PlayerMetrics';

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Migrate Metrics Subcol → Root PlayerMetrics   ║');
  console.log('╚══════════════════════════════════════════════════╝');
  if (isDryRun) console.log('  [DRY RUN MODE — no writes]');
  console.log();

  let usersScanned = 0;
  let usersWithMetrics = 0;
  let totalMigrated = 0;
  const totalSkipped = 0;
  let errors = 0;
  const PAGE_SIZE = 200;
  const BATCH_SIZE = 500;

  let lastUserDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  while (true) {
    let query = db.collection('Users').limit(PAGE_SIZE) as FirebaseFirestore.Query;
    if (lastUserDoc) query = query.startAfter(lastUserDoc);

    const snap = await query.get();
    if (snap.empty) break;

    for (const userDoc of snap.docs) {
      usersScanned++;
      const userId = userDoc.id;

      const sportsSnap = await db
        .collection('Users')
        .doc(userId)
        .collection('sports')
        .limit(20)
        .get();

      if (sportsSnap.empty) continue;

      for (const sportDoc of sportsSnap.docs) {
        const sportId = sportDoc.id;
        const metricsSnap = await db
          .collection('Users')
          .doc(userId)
          .collection('sports')
          .doc(sportId)
          .collection('metrics')
          .limit(100)
          .get();

        if (metricsSnap.empty) continue;
        usersWithMetrics++;

        const batch = db.batch();
        let batchCount = 0;

        for (const metricDoc of metricsSnap.docs) {
          const data = metricDoc.data();
          const field = (data['field'] ?? metricDoc.id) as string;
          const fieldKey = field.trim().toLowerCase();
          const docId = `${userId}_${sportId}_${fieldKey}`;

          const record: Record<string, unknown> = {
            ...data,
            id: docId,
            userId,
            sportId,
            field: fieldKey,
            // Ensure data lineage
            provider: data['provider'] ?? data['source'] ?? 'legacy_migration',
            extractedAt: data['extractedAt'] ?? data['dateRecorded'] ?? new Date().toISOString(),
            // Migration metadata
            _migratedFrom: `Users/${userId}/sports/${sportId}/metrics/${metricDoc.id}`,
            _migratedAt: new Date().toISOString(),
          };

          if (!isDryRun) {
            batch.set(db.collection(PLAYER_METRICS_COLLECTION).doc(docId), record, { merge: true });
            batchCount++;
          }

          totalMigrated++;

          // Flush batch at BATCH_SIZE
          if (batchCount >= BATCH_SIZE) {
            try {
              await batch.commit();
            } catch (err) {
              console.error(`\n  ❌ Batch commit failed for ${userId}/${sportId}:`, err);
              errors += batchCount;
              totalMigrated -= batchCount;
            }
            batchCount = 0;
          }
        }

        // Flush remaining
        if (!isDryRun && batchCount > 0) {
          try {
            await batch.commit();
          } catch (err) {
            console.error(`\n  ❌ Batch commit failed for ${userId}/${sportId}:`, err);
            errors += batchCount;
            totalMigrated -= batchCount;
          }
        }
      }

      process.stdout.write(
        `\r  Users: ${usersScanned} | With metrics: ${usersWithMetrics} | Migrated: ${totalMigrated}`
      );
    }

    lastUserDoc = snap.docs[snap.docs.length - 1];
    if (userLimit > 0 && usersScanned >= userLimit) break;
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n\n══════════════════════════════════════════════════');
  console.log('  METRICS MIGRATION SUMMARY');
  console.log('══════════════════════════════════════════════════\n');
  console.log(`  Users Scanned:       ${usersScanned}`);
  console.log(`  Users With Metrics:  ${usersWithMetrics}`);
  console.log(`  Metrics Migrated:    ${totalMigrated}`);
  console.log(`  Errors:              ${errors}`);

  if (isDryRun) {
    console.log('\n  [DRY RUN] No documents were written.\n');
  } else {
    console.log(
      `\n  ✅ Migration complete. ${totalMigrated} metrics written to ${PLAYER_METRICS_COLLECTION}.\n`
    );
  }
}

main().catch((err) => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
