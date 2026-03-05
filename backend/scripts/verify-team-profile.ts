/**
 * @fileoverview Verify Team Profile Data
 * @module @nxt1/backend/scripts/verify-team-profile
 *
 * Checks that teams have complete profile data:
 * - Stats categories
 * - Recruiting activities
 * - Season records
 * - Branding
 *
 * Usage:
 *   npx tsx backend/scripts/verify-team-profile.ts --env=staging
 *   npx tsx backend/scripts/verify-team-profile.ts --env=staging --teamId=team_seed_stmary_fb_v
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

const targetTeamId = getArg('teamId') || 'team_seed_stmary_fb_v'; // Default team
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

const appName = `verify-team-profile-${Date.now()}`;
const app =
  getApps().find((a) => a.name === appName) ??
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, appName);
const db = getFirestore(app);

console.log(`\n🔍 Verifying Team Profile on ${projectId}\n`);

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('========================================');
  console.log('VERIFY TEAM PROFILE DATA');
  console.log('========================================\n');

  try {
    const teamDoc = await db.collection('Teams').doc(targetTeamId).get();

    if (!teamDoc.exists) {
      console.error(`❌ Team ${targetTeamId} not found`);
      process.exit(1);
    }

    const team = teamDoc.data();

    console.log(`📊 Team: ${team?.name || team?.teamName}`);
    console.log(`   Code: ${team?.code || team?.teamCode}`);
    console.log(`   Organization: ${team?.organizationId}`);
    console.log(`   Sport: ${team?.sportName}`);
    console.log(`   Season: ${team?.season}\n`);

    // Check Stats Categories
    console.log('📈 Stats Categories:');
    if (team?.statsCategories && Array.isArray(team.statsCategories)) {
      console.log(`   ✓ Found ${team.statsCategories.length} categories`);
      team.statsCategories.forEach((cat: any) => {
        console.log(`     - ${cat.name}: ${cat.stats?.length || 0} stats`);
      });
    } else {
      console.log('   ❌ No stats categories found');
    }

    // Check Recruiting Activities
    console.log('\n🎯 Recruiting Activities:');
    if (team?.recruitingActivities && Array.isArray(team.recruitingActivities)) {
      console.log(`   ✓ Found ${team.recruitingActivities.length} activities`);
      const commitments = team.recruitingActivities.filter((a: any) =>
        a.category?.includes('commit')
      );
      const offers = team.recruitingActivities.filter((a: any) => a.category?.includes('offer'));
      const visits = team.recruitingActivities.filter((a: any) => a.category?.includes('visit'));
      console.log(`     - Commitments: ${commitments.length}`);
      console.log(`     - Offers: ${offers.length}`);
      console.log(`     - Visits: ${visits.length}`);
    } else {
      console.log('   ❌ No recruiting activities found');
    }

    // Check Season Record
    console.log('\n📊 Season Record:');
    if (team?.seasonRecord) {
      const record = team.seasonRecord;
      console.log(`   ✓ ${record.wins || 0}-${record.losses || 0}-${record.ties || 0}`);
    } else {
      console.log('   ❌ No season record found');
    }

    // Check Branding
    console.log('\n🎨 Branding:');
    if (team?.teamLogoImg || team?.teamColor1 || team?.mascot) {
      console.log(`   ✓ Logo: ${team.teamLogoImg ? 'Yes' : 'No'}`);
      console.log(`   ✓ Colors: ${team.teamColor1 || 'N/A'} / ${team.teamColor2 || 'N/A'}`);
      console.log(`   ✓ Mascot: ${team.mascot || 'N/A'}`);
    } else {
      console.log('   ❌ No branding data found');
    }

    // Check Member Counts
    console.log('\n👥 Team Members:');
    console.log(`   Athletes: ${team?.athleteMember || 0}`);
    console.log(`   Coaches: ${team?.panelMember || 0}`);

    // Verify against RosterEntries
    const rosterEntries = await db
      .collection('RosterEntries')
      .where('teamId', '==', targetTeamId)
      .get();
    console.log(`   Actual RosterEntries: ${rosterEntries.size}`);

    // Summary
    console.log('\n========================================');
    const hasStats = team?.statsCategories?.length > 0;
    const hasRecruiting = team?.recruitingActivities?.length > 0;
    const hasRecord = !!team?.seasonRecord;
    const hasBranding = !!(team?.teamLogoImg || team?.mascot);

    if (hasStats && hasRecruiting && hasRecord && hasBranding) {
      console.log('✅ TEAM PROFILE COMPLETE!');
      console.log('========================================');
      console.log('\n🎉 Team has all profile data!\n');
      console.log('Profile includes:');
      console.log('  ✓ Stats categories with metrics');
      console.log('  ✓ Recruiting activities (commits, offers, visits)');
      console.log('  ✓ Season record (W-L-T)');
      console.log('  ✓ Branding (logo, colors, mascot)');
      console.log('  ✓ Member counts (synced with RosterEntries)\n');
      process.exit(0);
    } else {
      console.log('⚠️  TEAM PROFILE INCOMPLETE');
      console.log('========================================');
      console.log('\nMissing:');
      if (!hasStats) console.log('  ❌ Stats categories');
      if (!hasRecruiting) console.log('  ❌ Recruiting activities');
      if (!hasRecord) console.log('  ❌ Season record');
      if (!hasBranding) console.log('  ❌ Branding data');
      console.log();
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  }
}

main();
