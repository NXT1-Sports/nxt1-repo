/**
 * @fileoverview Activity Badge Backfill Script
 * @module @nxt1/backend/scripts
 *
 * Rebuilds the Users/{uid}/stats/activity_badges projection from the canonical
 * Users/{uid}/activity subcollection.
 *
 * Usage:
 *   npx tsx scripts/backfill-activity-badges.ts              # dry-run (default)
 *   npx tsx scripts/backfill-activity-badges.ts --commit     # apply writes
 *   npx tsx scripts/backfill-activity-badges.ts --staging    # target staging Firestore
 *   npx tsx scripts/backfill-activity-badges.ts --user <uid> # scope to one user
 */

import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../src/utils/firebase.js';
import { stagingDb } from '../src/utils/firebase-staging.js';

const ACTIVITY_COLLECTION = 'activity';
const ACTIVITY_STATS_COLLECTION = 'stats';
const ACTIVITY_BADGES_DOC_ID = 'activity_badges';
const ACTIVITY_BADGE_SCHEMA_VERSION = 1;
const WRITE_BATCH_LIMIT = 400;

const args = process.argv.slice(2);
const dryRun = !args.includes('--commit');
const environment = args.includes('--staging') ? 'staging' : 'production';
const singleUserId = args.includes('--user') ? args[args.indexOf('--user') + 1] : null;

const firestore = environment === 'staging' ? stagingDb : db;

interface BadgeState {
  readonly alerts: number;
  readonly totalUnread: number;
}

function getUserActivityCollection(uid: string) {
  return firestore.collection('Users').doc(uid).collection(ACTIVITY_COLLECTION);
}

function getUserBadgeDoc(uid: string) {
  return firestore
    .collection('Users')
    .doc(uid)
    .collection(ACTIVITY_STATS_COLLECTION)
    .doc(ACTIVITY_BADGES_DOC_ID);
}

async function countUnreadBadgesForUser(uid: string): Promise<BadgeState> {
  const alertsSnapshot = await getUserActivityCollection(uid)
    .where('isArchived', '==', false)
    .where('tab', '==', 'alerts')
    .where('isRead', '==', false)
    .count()
    .get();

  const alerts = alertsSnapshot.data().count;
  return {
    alerts,
    totalUnread: alerts,
  };
}

async function loadTargetUserIds(): Promise<readonly string[]> {
  if (singleUserId) {
    const snapshot = await firestore.collection('Users').doc(singleUserId).get();
    if (!snapshot.exists) {
      throw new Error(`User ${singleUserId} not found`);
    }
    return [singleUserId];
  }

  const snapshot = await firestore.collection('Users').get();
  return snapshot.docs.map((doc) => doc.id);
}

async function main(): Promise<void> {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Activity Badge Backfill');
  console.log(`  Environment: ${environment}`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN (no writes)' : 'COMMIT MODE'}`);
  if (singleUserId) {
    console.log(`  Scope: user ${singleUserId}`);
  }
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  const userIds = await loadTargetUserIds();
  console.log(`Found ${userIds.length} user(s) to inspect`);

  let batch = firestore.batch();
  let batchOps = 0;
  let processed = 0;
  let changed = 0;
  let zeroCount = 0;

  for (const uid of userIds) {
    processed += 1;

    const [computed, existingSnapshot] = await Promise.all([
      countUnreadBadgesForUser(uid),
      getUserBadgeDoc(uid).get(),
    ]);

    const existingData = existingSnapshot.data() as
      | { badges?: { alerts?: number }; totalUnread?: number }
      | undefined;

    const existingAlerts = Number(existingData?.badges?.alerts ?? 0) || 0;
    const existingTotalUnread = Number(existingData?.totalUnread ?? existingAlerts) || 0;

    if (
      existingSnapshot.exists &&
      existingAlerts === computed.alerts &&
      existingTotalUnread === computed.totalUnread
    ) {
      if (computed.totalUnread === 0) {
        zeroCount += 1;
      }
      continue;
    }

    changed += 1;
    if (computed.totalUnread === 0) {
      zeroCount += 1;
    }

    console.log(
      `[${processed}/${userIds.length}] ${uid} alerts ${existingAlerts} -> ${computed.alerts}`
    );

    if (!dryRun) {
      batch.set(
        getUserBadgeDoc(uid),
        {
          schemaVersion: ACTIVITY_BADGE_SCHEMA_VERSION,
          badges: {
            alerts: computed.alerts,
          },
          totalUnread: computed.totalUnread,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      batchOps += 1;

      if (batchOps >= WRITE_BATCH_LIMIT) {
        await batch.commit();
        batch = firestore.batch();
        batchOps = 0;
      }
    }
  }

  if (!dryRun && batchOps > 0) {
    await batch.commit();
  }

  console.log('');
  console.log('───────────────────────────────────────────────────');
  console.log(`Processed: ${processed}`);
  console.log(`Changed:   ${changed}`);
  console.log(`Zero-unread snapshots touched: ${zeroCount}`);
  console.log('───────────────────────────────────────────────────');
  console.log('');

  if (dryRun) {
    console.log('Dry run complete. Re-run with --commit to write badge projections.');
  } else {
    console.log('Backfill complete.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
