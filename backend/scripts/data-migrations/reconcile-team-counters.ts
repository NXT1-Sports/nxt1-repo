/**
 * @fileoverview Team Counter Reconciliation Script
 * @module @nxt1/backend/scripts
 *
 * One-time migration to fix `athleteMember` and `panelMember` counters on
 * all Team documents.  These counters drifted because the old user-deletion
 * Cloud Function never decremented them when a user was removed.
 *
 * For each Team the script:
 *   1. Counts ALL RosterEntries with role = 'athlete'  → athleteMember
 *   2. Counts ALL RosterEntries with role ≠ 'athlete'  → panelMember
 *   3. Compares with the stored counters on the Team doc
 *   4. Writes corrections (unless --dry-run)
 *
 * NOTE: Counters are incremented on RosterEntry creation regardless of status
 * (pending, active, inactive, removed, left). Status changes never adjust
 * counters. Therefore, the correct reconciliation target is ALL entries.
 *
 * Usage:
 *   npx tsx scripts/reconcile-team-counters.ts              # dry-run (default)
 *   npx tsx scripts/reconcile-team-counters.ts --commit     # apply fixes
 *   npx tsx scripts/reconcile-team-counters.ts --team <id>  # single team
 */

import admin from 'firebase-admin';
import { db } from '../src/utils/firebase.js';

// ── CLI flags ────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = !args.includes('--commit');
const singleTeamId = args.includes('--team') ? args[args.indexOf('--team') + 1] : null;

// ── Constants ────────────────────────────────────────────────
const BATCH_SIZE = 500;

interface CounterDiff {
  teamId: string;
  oldAthlete: number;
  oldPanel: number;
  newAthlete: number;
  newPanel: number;
}

// ── Main ─────────────────────────────────────────────────────
async function reconcile(): Promise<void> {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Team Counter Reconciliation');
  console.log(`  Mode: ${dryRun ? 'DRY RUN (no writes)' : '⚠️  COMMIT MODE'}`);
  if (singleTeamId) console.log(`  Scope: single team ${singleTeamId}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  // Step 1: Load all teams (or a single team)
  let teamDocs: admin.firestore.QueryDocumentSnapshot[];
  if (singleTeamId) {
    const doc = await db.collection('Teams').doc(singleTeamId).get();
    if (!doc.exists) {
      console.error(`Team ${singleTeamId} not found`);
      process.exit(1);
    }
    teamDocs = [doc as unknown as admin.firestore.QueryDocumentSnapshot];
  } else {
    const snap = await db.collection('Teams').get();
    teamDocs = snap.docs;
  }

  console.log(`Found ${teamDocs.length} team(s) to check\n`);

  const diffs: CounterDiff[] = [];
  let teamsChecked = 0;

  for (const teamDoc of teamDocs) {
    teamsChecked++;
    const teamId = teamDoc.id;
    const data = teamDoc.data();

    const oldAthlete: number =
      typeof data['athleteMember'] === 'number' ? data['athleteMember'] : 0;
    const oldPanel: number = typeof data['panelMember'] === 'number' ? data['panelMember'] : 0;

    // Count ALL roster entries grouped by role (counters are incremented on
    // creation regardless of status — status changes never adjust counters)
    const rosterSnap = await db.collection('RosterEntries').where('teamId', '==', teamId).get();

    let newAthlete = 0;
    let newPanel = 0;

    for (const entry of rosterSnap.docs) {
      const role = entry.data()['role'];
      if (role === 'athlete') {
        newAthlete++;
      } else {
        newPanel++;
      }
    }

    if (oldAthlete !== newAthlete || oldPanel !== newPanel) {
      diffs.push({ teamId, oldAthlete, oldPanel, newAthlete, newPanel });
    }

    // Progress log every 50 teams
    if (teamsChecked % 50 === 0) {
      console.log(`  ... checked ${teamsChecked}/${teamDocs.length} teams`);
    }
  }

  // Step 2: Report
  console.log('');
  console.log('───────────────────────────────────────────────────');
  console.log(`  Checked: ${teamsChecked} teams`);
  console.log(`  Drifted: ${diffs.length} teams`);
  console.log('───────────────────────────────────────────────────');

  if (diffs.length === 0) {
    console.log('\n✅ All team counters are accurate. Nothing to fix.\n');
    return;
  }

  console.log('\nDrifted teams:\n');
  for (const d of diffs) {
    console.log(
      `  ${d.teamId}  athlete: ${d.oldAthlete} → ${d.newAthlete}  panel: ${d.oldPanel} → ${d.newPanel}`
    );
  }

  if (dryRun) {
    console.log(`\n🔍 DRY RUN — no changes written.`);
    console.log(`   Re-run with --commit to apply fixes.\n`);
    return;
  }

  // Step 3: Apply fixes in batches
  console.log(`\n⚡ Applying ${diffs.length} corrections...\n`);
  let batch = db.batch();
  let batchOps = 0;
  let committed = 0;

  for (const d of diffs) {
    const ref = db.collection('Teams').doc(d.teamId);
    batch.update(ref, {
      athleteMember: d.newAthlete,
      panelMember: d.newPanel,
    });
    batchOps++;

    if (batchOps >= BATCH_SIZE) {
      await batch.commit();
      committed += batchOps;
      console.log(`  Committed ${committed}/${diffs.length}`);
      batch = db.batch();
      batchOps = 0;
    }
  }

  if (batchOps > 0) {
    await batch.commit();
    committed += batchOps;
  }

  console.log(`\n✅ Done. Updated ${committed} team(s).\n`);
}

// ── Run ──────────────────────────────────────────────────────
reconcile()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
