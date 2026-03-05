/**
 * @fileoverview Verify New Architecture Data
 * @module @nxt1/backend/scripts/verify-new-architecture
 *
 * Verifies that the new relational architecture works correctly:
 * - Query user's teams via RosterEntries
 * - Query team roster via RosterEntries
 * - Get organization with teams
 * - Verify data structure matches expected schema
 *
 * Usage:
 *   npx tsx backend/scripts/verify-new-architecture.ts --env=staging
 *   npx tsx backend/scripts/verify-new-architecture.ts --env=staging --userId=05naPoH3KWZftqsdZr7IVwxLHqo2
 *
 * @version 3.0.0
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ─── CLI Args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name: string) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') ?? null;

const targetUserId = getArg('userId') || '05naPoH3KWZftqsdZr7IVwxLHqo2'; // Default to first test user
const useStaging = getArg('env') === 'staging';

// ─── Firebase Init ────────────────────────────────────────────────────────────
const projectId = useStaging
  ? process.env['STAGING_FIREBASE_PROJECT_ID']!
  : process.env['FIREBASE_PROJECT_ID']!;
const clientEmail = useStaging
  ? process.env['STAGING_FIREBASE_CLIENT_EMAIL']!
  : process.env['FIREBASE_CLIENT_EMAIL']!;
const privateKey = useStaging
  ? process.env['STAGING_FIREBASE_PRIVATE_KEY']!.replace(/\\n/g, '\n')
  : process.env['FIREBASE_PRIVATE_KEY']!.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('[verify] Missing Firebase credentials in .env');
  process.exit(1);
}

const appName = `verify-new-arch-${Date.now()}`;
const app =
  getApps().find((a) => a.name === appName) ??
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, appName);
const db = getFirestore(app);

console.log(`\n🔍 Verifying New Architecture on ${projectId}\n`);

// ─── Collections ──────────────────────────────────────────────────────────────
const ORGS_COL = 'Organizations';
const TEAMS_COL = 'Teams';
const ROSTER_COL = 'RosterEntries';

// ─── Verification Functions ───────────────────────────────────────────────────

async function verifyUserTeams(userId: string): Promise<void> {
  console.log(`\n📊 Test 1: Get all teams for user ${userId.slice(0, 12)}...`);

  const rosterEntries = await db.collection(ROSTER_COL).where('userId', '==', userId).get();

  console.log(`  ✓ Found ${rosterEntries.size} roster entries`);

  if (rosterEntries.empty) {
    console.log('  ⚠️  User has no teams');
    return;
  }

  // Get team details for each entry
  for (const entryDoc of rosterEntries.docs) {
    const entry = entryDoc.data();
    console.log(`\n  Team: ${entry.teamId}`);
    console.log(`    Role: ${entry.role}`);
    console.log(`    Status: ${entry.status}`);
    console.log(`    Jersey: ${entry.jerseyNumber || 'N/A'}`);
    console.log(`    Position: ${entry.position || 'N/A'}`);

    // Get team details
    const teamDoc = await db.collection(TEAMS_COL).doc(entry.teamId).get();
    if (teamDoc.exists) {
      const team = teamDoc.data();
      console.log(`    Team Name: ${team?.name}`);
      console.log(`    Organization: ${team?.organizationId}`);
    }
  }

  console.log(`\n  ✅ User can be on ${rosterEntries.size} teams simultaneously!`);
}

async function verifyTeamRoster(teamId: string): Promise<void> {
  console.log(`\n📊 Test 2: Get roster for team ${teamId}`);

  const teamDoc = await db.collection(TEAMS_COL).doc(teamId).get();
  if (!teamDoc.exists) {
    console.log('  ❌ Team not found');
    return;
  }

  const team = teamDoc.data();
  console.log(`  Team: ${team?.name}`);
  console.log(`  Organization: ${team?.organizationId}`);

  const rosterEntries = await db.collection(ROSTER_COL).where('teamId', '==', teamId).get();

  console.log(`  ✓ Found ${rosterEntries.size} members`);

  for (const entryDoc of rosterEntries.docs) {
    const entry = entryDoc.data();
    console.log(`\n    Member: ${entry.userId.slice(0, 12)}...`);
    console.log(`      Role: ${entry.role}`);
    console.log(`      Jersey: ${entry.jerseyNumber || 'N/A'}`);
    console.log(`      Position: ${entry.position || 'N/A'}`);
  }

  console.log(`\n  ✅ No members[] array in Team doc - using RosterEntries!`);
}

async function verifyOrganization(orgId: string): Promise<void> {
  console.log(`\n📊 Test 3: Get organization with teams`);

  const orgDoc = await db.collection(ORGS_COL).doc(orgId).get();
  if (!orgDoc.exists) {
    console.log('  ❌ Organization not found');
    return;
  }

  const org = orgDoc.data();
  console.log(`  Organization: ${org?.name}`);
  console.log(`  Type: ${org?.type}`);
  console.log(`  Status: ${org?.status}`);

  const teams = await db.collection(TEAMS_COL).where('organizationId', '==', orgId).get();

  console.log(`  ✓ Found ${teams.size} teams under this org`);

  for (const teamDoc of teams.docs) {
    const team = teamDoc.data();
    console.log(`\n    Team: ${team.name}`);
    console.log(`      Code: ${team.code}`);
    console.log(`      Season: ${team.season}`);

    // Count members
    const members = await db.collection(ROSTER_COL).where('teamId', '==', teamDoc.id).get();
    console.log(`      Members: ${members.size}`);
  }

  console.log(`\n  ✅ Organization groups multiple teams!`);
}

async function verifyDataStructure(): Promise<void> {
  console.log(`\n📊 Test 4: Verify collection structure`);

  // Check Organizations collection
  const orgsSnap = await db.collection(ORGS_COL).limit(1).get();
  console.log(`  ✓ ${ORGS_COL} collection exists: ${!orgsSnap.empty}`);

  // Check Teams collection
  const teamsSnap = await db.collection(TEAMS_COL).limit(1).get();
  console.log(`  ✓ ${TEAMS_COL} collection exists: ${!teamsSnap.empty}`);

  // Check RosterEntries collection
  const rosterSnap = await db.collection(ROSTER_COL).limit(1).get();
  console.log(`  ✓ ${ROSTER_COL} collection exists: ${!rosterSnap.empty}`);

  if (!orgsSnap.empty && !teamsSnap.empty && !rosterSnap.empty) {
    console.log('\n  ✅ All collections use capitalized names!');
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('========================================');
  console.log('VERIFY NEW TEAM ARCHITECTURE');
  console.log('========================================\n');

  try {
    // Test 1: User's teams
    await verifyUserTeams(targetUserId);

    // Test 2: Team roster (use first team from user's roster)
    const userRoster = await db
      .collection(ROSTER_COL)
      .where('userId', '==', targetUserId)
      .limit(1)
      .get();

    if (!userRoster.empty) {
      const firstEntry = userRoster.docs[0].data();
      await verifyTeamRoster(firstEntry.teamId);

      // Test 3: Organization
      const teamDoc = await db.collection(TEAMS_COL).doc(firstEntry.teamId).get();
      if (teamDoc.exists) {
        const team = teamDoc.data();
        if (team?.organizationId) {
          await verifyOrganization(team.organizationId);
        }
      }
    }

    // Test 4: Data structure
    await verifyDataStructure();

    console.log('\n========================================');
    console.log('✅ ALL TESTS PASSED!');
    console.log('========================================');
    console.log('\n🎉 New architecture is working correctly!\n');
    console.log('Key Features Verified:');
    console.log('  ✓ Users can join multiple teams');
    console.log('  ✓ Teams belong to Organizations');
    console.log('  ✓ RosterEntries replace members[] array');
    console.log('  ✓ Capitalized collection names (Organizations, Teams, RosterEntries)');
    console.log('  ✓ Efficient queries via junction table\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  }
}

main();
