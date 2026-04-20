#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Firestore Collection Rename — nxt-1-staging-v2
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Renames Firestore collections by copying all documents (preserving IDs and
 * all data) to the new collection name, then optionally deleting the old one.
 *
 * Rename map:
 *   agentJobs                 → AgentJobs
 *   billingContexts           → BillingContexts
 *   iap_processed_transactions → IapProcessedTransactions
 *   notifications             → Notifications
 *   paymentLogs               → PaymentLogs
 *   pricingConfig             → PricingConfig
 *   recurring_tasks           → RecurringTasks
 *   referralRewards           → ReferralRewards
 *   stripeCustomers           → StripeCustomers
 *   usageEvents               → UsageEvents
 *   user_analytics            → UserAnalytics
 *   walletHolds               → WalletHolds
 *
 * Usage:
 *   npx tsx scripts/migration/rename-firestore-collections.ts --dry-run
 *   npx tsx scripts/migration/rename-firestore-collections.ts --target=staging
 *   npx tsx scripts/migration/rename-firestore-collections.ts --target=staging --delete-source
 *   npx tsx scripts/migration/rename-firestore-collections.ts --target=staging --delete-source --verbose
 *
 * Flags:
 *   --dry-run        Count docs and log operations without writing or deleting
 *   --delete-source  After a successful copy, delete documents from the old collection
 *   --verbose        Print per-document detail
 *   --limit=N        Process at most N documents per collection (for testing)
 *   --only=name      Only process the collection with this old name (e.g. --only=agentJobs)
 *   --target=        staging (default) | production
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  initTargetApp,
  isDryRun,
  isVerbose,
  hasFlag,
  getLimit,
  getArg,
  BatchWriter,
  ProgressReporter,
  printBanner,
  printSummary,
  formatNum,
} from './migration-utils.js';

// ─── Rename Map ───────────────────────────────────────────────────────────────

const RENAME_MAP: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'agentApprovalRequests', to: 'AgentApprovalRequests' },
  { from: 'agentJobs', to: 'AgentJobs' },
  { from: 'billingContexts', to: 'BillingContexts' },
  { from: 'iap_processed_transactions', to: 'IapProcessedTransactions' },
  { from: 'notifications', to: 'Notifications' },
  { from: 'paymentLogs', to: 'PaymentLogs' },
  { from: 'pricingConfig', to: 'PricingConfig' },
  { from: 'recurring_tasks', to: 'RecurringTasks' },
  { from: 'referralRewards', to: 'ReferralRewards' },
  { from: 'stripeCustomers', to: 'StripeCustomers' },
  { from: 'usageEvents', to: 'UsageEvents' },
  { from: 'user_analytics', to: 'UserAnalytics' },
  { from: 'walletHolds', to: 'WalletHolds' },
];

const PAGE_SIZE = 200;
const DELETE_SOURCE = hasFlag('delete-source');
const ONLY_COLLECTION = getArg('only');

// ─── Per-collection stats ─────────────────────────────────────────────────────

interface CollectionStats {
  from: string;
  to: string;
  sourceDocs: number;
  copied: number;
  copyErrors: number;
  deleted: number;
  deleteErrors: number;
  skipped: boolean; // source didn't exist
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  printBanner('Firestore Collection Rename');

  const { db } = initTargetApp();

  const limit = getLimit();
  const pairs = ONLY_COLLECTION
    ? RENAME_MAP.filter((p) => p.from === ONLY_COLLECTION)
    : [...RENAME_MAP];

  if (ONLY_COLLECTION && pairs.length === 0) {
    console.error(`\n  ❌ No rename entry found for --only=${ONLY_COLLECTION}`);
    console.error(`     Valid names: ${RENAME_MAP.map((p) => p.from).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n  Mode       : ${isDryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log(
    `  Delete src : ${DELETE_SOURCE ? 'YES — old docs will be deleted after copy' : 'NO'}`
  );
  console.log(`  Limit/coll : ${limit > 0 ? limit : 'none'}`);
  console.log(`  Collections: ${pairs.length}\n`);

  if (!isDryRun && DELETE_SOURCE) {
    console.log(
      '  ⚠️  --delete-source is set. Old collection documents will be DELETED after copy.'
    );
    console.log('  Press Ctrl+C within 5 seconds to abort...\n');
    await new Promise((r) => setTimeout(r, 5000));
  }

  const allStats: CollectionStats[] = [];

  for (const { from, to } of pairs) {
    const stats: CollectionStats = {
      from,
      to,
      sourceDocs: 0,
      copied: 0,
      copyErrors: 0,
      deleted: 0,
      deleteErrors: 0,
      skipped: false,
    };

    console.log(`\n  ── ${from}  →  ${to} ──`);

    // ── 1. Count source documents ──────────────────────────────────────────
    const sourceRef = db.collection(from);
    const countSnap = await sourceRef.count().get();
    const totalDocs = countSnap.data().count;
    stats.sourceDocs = totalDocs;

    if (totalDocs === 0) {
      console.log(`     (empty or does not exist — skipping)`);
      stats.skipped = true;
      allStats.push(stats);
      continue;
    }

    console.log(`     Source docs: ${formatNum(totalDocs)}`);

    // ── 2. Copy documents to new collection ───────────────────────────────
    const copyProgress = new ProgressReporter(`Copy → ${to}`);
    const writer = new BatchWriter(db, isDryRun);
    let processed = 0;
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    copyLoop: while (true) {
      let query = sourceRef.orderBy('__name__').limit(PAGE_SIZE);
      if (lastDoc) query = query.startAfter(lastDoc);

      const page = await query.get();
      if (page.empty) break;

      for (const doc of page.docs) {
        if (limit > 0 && processed >= limit) break copyLoop;

        const data = doc.data() as Record<string, unknown>;
        const destRef = db.collection(to).doc(doc.id);

        if (isVerbose) {
          console.log(`\n     [copy] ${from}/${doc.id}  →  ${to}/${doc.id}`);
        }

        try {
          writer.setStrict(destRef, data);
          stats.copied++;
        } catch (err) {
          stats.copyErrors++;
          console.error(`\n     ❌ copy error ${doc.id}:`, err);
        }

        processed++;
        copyProgress.tick(processed, limit > 0 ? Math.min(limit, totalDocs) : totalDocs);

        await writer.flushIfNeeded();
      }

      lastDoc = page.docs[page.docs.length - 1] ?? null;
      if (page.docs.length < PAGE_SIZE) break;
    }

    await writer.flush();
    copyProgress.done(stats.copied);
    console.log(`     Copied: ${formatNum(stats.copied)}  Errors: ${stats.copyErrors}`);

    // ── 3. Optionally delete source documents ─────────────────────────────
    if (!DELETE_SOURCE || isDryRun) {
      if (isDryRun && DELETE_SOURCE) {
        console.log(`     [dry-run] would delete ${formatNum(processed)} source docs`);
      }
      allStats.push(stats);
      continue;
    }

    if (stats.copyErrors > 0) {
      console.warn(`     ⚠️  Skipping delete — ${stats.copyErrors} copy errors detected`);
      allStats.push(stats);
      continue;
    }

    console.log(`     Deleting source collection "${from}"...`);
    const deleteProgress = new ProgressReporter(`Delete ${from}`);
    let delBatch = db.batch();
    let delBatchCount = 0;
    let delProcessed = 0;
    let delLastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    const flushDelBatch = async (): Promise<void> => {
      if (delBatchCount === 0) return;
      try {
        await delBatch.commit();
      } catch (err) {
        stats.deleteErrors += delBatchCount;
        console.error(`\n     ❌ delete batch commit error:`, err);
      }
      delBatch = db.batch();
      delBatchCount = 0;
    };

    deleteLoop: while (true) {
      let delQuery = sourceRef.limit(PAGE_SIZE);
      if (delLastDoc) delQuery = delQuery.startAfter(delLastDoc);

      const delPage = await delQuery.get();
      if (delPage.empty) break;

      for (const doc of delPage.docs) {
        if (limit > 0 && delProcessed >= limit) break deleteLoop;

        if (isVerbose) {
          console.log(`\n     [delete] ${from}/${doc.id}`);
        }

        delBatch.delete(doc.ref);
        delBatchCount++;
        stats.deleted++;
        delProcessed++;
        deleteProgress.tick(delProcessed);

        if (delBatchCount >= 500) {
          await flushDelBatch();
        }
      }

      delLastDoc = delPage.docs[delPage.docs.length - 1] ?? null;
      if (delPage.docs.length < PAGE_SIZE) break;
    }

    await flushDelBatch();
    deleteProgress.done(stats.deleted);
    console.log(`     Deleted: ${formatNum(stats.deleted)}  Errors: ${stats.deleteErrors}`);

    allStats.push(stats);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalCopied = allStats.reduce((s, r) => s + r.copied, 0);
  const totalErrors = allStats.reduce((s, r) => s + r.copyErrors + r.deleteErrors, 0);
  const totalDeleted = allStats.reduce((s, r) => s + r.deleted, 0);
  const skipped = allStats.filter((r) => r.skipped).length;

  printSummary('Run Complete', [
    ['Collections processed', allStats.filter((r) => !r.skipped).length],
    ['Collections skipped (empty)', skipped],
    ['Documents copied', totalCopied],
    ['Documents deleted', totalDeleted],
    ['Errors', totalErrors],
    ['Mode', isDryRun ? 'DRY RUN' : 'LIVE'],
  ]);

  console.log('\n  Per-collection results:');
  console.log(
    `  ${'From'.padEnd(30)} ${'To'.padEnd(28)} ${'Source'.padStart(7)} ${'Copied'.padStart(7)} ${'Deleted'.padStart(8)}`
  );
  console.log('  ' + '─'.repeat(85));
  for (const s of allStats) {
    const row = s.skipped
      ? `  ${s.from.padEnd(30)} ${s.to.padEnd(28)} ${'—'.padStart(7)} ${'skip'.padStart(7)} ${'—'.padStart(8)}`
      : `  ${s.from.padEnd(30)} ${s.to.padEnd(28)} ${formatNum(s.sourceDocs).padStart(7)} ${formatNum(s.copied).padStart(7)} ${formatNum(s.deleted).padStart(8)}`;
    console.log(row);
  }

  console.log('');

  if (totalErrors > 0) {
    console.error(`\n  ❌ Completed with ${totalErrors} error(s). Review logs above.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n  ❌ Fatal error:', err);
  process.exit(1);
});
