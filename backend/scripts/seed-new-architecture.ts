/**
 * @fileoverview Seed New Team Architecture (v3.0)
 * @module @nxt1/backend/scripts/seed-new-architecture
 *
 * Creates seed data for new relational team structure:
 * - Organizations collection
 * - Teams collection
 * - RosterEntries collection
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/seed-new-architecture.ts                    # seed on production
 *   npx tsx scripts/seed-new-architecture.ts --env=staging      # seed on staging
 *   npx tsx scripts/seed-new-architecture.ts --delete --orgId=org_stmary
 *
 * Features:
 * - Uses REAL users from staging/production
 * - Relational structure (no embedded arrays)
 * - Multi-team support (users can join multiple teams)
 * - Organization-based team grouping
 *
 * @version 3.0.0
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  buildTeamStatsCategories,
  buildTeamRecruitingActivities,
  buildTeamNewsArticles,
} from '../src/utils/seed-factories.js';

// ─── CLI Args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name: string) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') ?? null;
const hasFlag = (name: string) => args.includes(`--${name}`);

const targetOrgId = getArg('orgId');
const useStaging = getArg('env') === 'staging';
const doDelete = hasFlag('delete');

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
  console.error('[seed-new-arch] Missing Firebase credentials in .env');
  process.exit(1);
}

const appName = `seed-new-arch-${Date.now()}`;
const app =
  getApps().find((a) => a.name === appName) ??
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, appName);
const db = getFirestore(app);

console.log(`\n🔥 Connected to Firebase: ${projectId}\n`);

// ─── Collections ──────────────────────────────────────────────────────────────
const ORGS_COL = 'Organizations';
const TEAMS_COL = 'Teams';
const ROSTER_COL = 'RosterEntries';
const USERS_COL = 'Users';
const POSTS_COL = 'Posts';
const EVENTS_COL = 'Events'; // All events: games, camps, visits (ownerType: 'user' | 'team')
const NEWS_COL = 'News';
const VIDEOS_COL = 'Videos'; // Top-level (ownerType: 'user' | 'team')
const RECRUITING_COL = 'Recruiting'; // Top-level (ownerType: 'user' | 'team')

// Real user IDs
const REAL_USER_IDS = ['05naPoH3KWZftqsdZr7IVwxLHqo2', '6kjm7AJieFNWYkmTp2HOmYp4r8E3'];

// ─── Seed Data Templates ──────────────────────────────────────────────────────
interface SeedOrg {
  id: string;
  name: string;
  code: string;
  type: 'school' | 'club' | 'aau';
  city: string;
  state: string;
  logoUrl?: string;
  teams: Array<{
    id: string;
    name: string;
    code: string;
    type: 'football' | 'basketball' | 'baseball';
    season: string;
    members: Array<{
      userId: string;
      role: 'OWNER' | 'ATHLETE' | 'COACH' | 'MEDIA';
      jerseyNumber?: number;
      position?: string;
    }>;
  }>;
}

const SEED_DATA: SeedOrg[] = [
  {
    id: 'org_seed_stmary',
    name: "St. Mary's High School",
    code: 'STMARY',
    type: 'school',
    city: 'Phoenix',
    state: 'AZ',
    logoUrl: 'https://via.placeholder.com/150/FF0000/FFFFFF?text=SM',
    teams: [
      {
        id: 'team_seed_stmary_fb_v',
        name: "St. Mary's Knights Varsity Football",
        code: 'STMARY-FB-V',
        type: 'football',
        season: '2025-26',
        members: [
          { userId: REAL_USER_IDS[0], role: 'OWNER', jerseyNumber: 1, position: 'QB' },
          { userId: REAL_USER_IDS[1], role: 'ATHLETE', jerseyNumber: 12, position: 'WR' },
        ],
      },
      {
        id: 'team_seed_stmary_fb_jv',
        name: "St. Mary's Knights JV Football",
        code: 'STMARY-FB-JV',
        type: 'football',
        season: '2025-26',
        members: [{ userId: REAL_USER_IDS[1], role: 'ATHLETE', jerseyNumber: 7, position: 'QB' }],
      },
    ],
  },
  {
    id: 'org_seed_elite11',
    name: 'Elite 11 Quarterback Academy',
    code: 'ELITE11',
    type: 'aau',
    city: 'Los Angeles',
    state: 'CA',
    logoUrl: 'https://via.placeholder.com/150/0000FF/FFFFFF?text=E11',
    teams: [
      {
        id: 'team_seed_elite11_camp',
        name: 'Elite 11 Summer Camp 2026',
        code: 'ELITE11-CAMP-2026',
        type: 'football',
        season: '2026',
        members: [{ userId: REAL_USER_IDS[0], role: 'ATHLETE', jerseyNumber: 1, position: 'QB' }],
      },
    ],
  },
  {
    id: 'org_seed_phxthunder',
    name: 'Phoenix Thunder AAU Basketball',
    code: 'PHXTHUNDER',
    type: 'club',
    city: 'Phoenix',
    state: 'AZ',
    logoUrl: 'https://via.placeholder.com/150/FFD700/000000?text=PHX',
    teams: [
      {
        id: 'team_seed_phxthunder_17u',
        name: 'Phoenix Thunder 17U',
        code: 'PHXTHUNDER-17U',
        type: 'basketball',
        season: '2025-26',
        members: [
          { userId: REAL_USER_IDS[0], role: 'ATHLETE', jerseyNumber: 23, position: 'PG' },
          { userId: REAL_USER_IDS[1], role: 'ATHLETE', jerseyNumber: 3, position: 'SG' },
        ],
      },
    ],
  },
];

// ─── Helper Functions ─────────────────────────────────────────────────────────
async function generateUniqueUnicode(): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const randomNum = Math.floor(Math.random() * 1000000);
    const unicode = randomNum.toString().padStart(6, '0');

    try {
      const existing = await db
        .collection(TEAMS_COL)
        .where('unicode', '==', unicode)
        .limit(1)
        .get();

      if (existing.empty) {
        return unicode;
      }
    } catch (error: any) {
      if (error.code === 5 || error.details === '') {
        return unicode;
      }
      throw error;
    }

    attempts++;
  }

  return Date.now().toString().slice(-6);
}

function buildTeamSlug(teamName: string, sportName: string, unicode: string): string {
  const namePart = teamName.replace(/\s+/g, '_');
  return `${namePart}-${sportName}-${unicode}`;
}

// ─── DELETE Functions ─────────────────────────────────────────────────────────
async function deleteOrganization(orgId: string): Promise<void> {
  console.log(`\n🗑️  Deleting organization: ${orgId}`);

  // 1. Get all teams for this org
  const teamsSnap = await db.collection(TEAMS_COL).where('organizationId', '==', orgId).get();
  const teamIds = teamsSnap.docs.map((d) => d.id);

  console.log(`  Found ${teamIds.length} teams to delete`);

  // 2. Delete all roster entries for these teams
  for (const teamId of teamIds) {
    const entriesSnap = await db.collection(ROSTER_COL).where('teamId', '==', teamId).get();
    console.log(`  Deleting ${entriesSnap.size} roster entries for team ${teamId}`);
    const batch = db.batch();
    entriesSnap.docs.forEach((doc) => batch.delete(doc.ref));
    if (entriesSnap.size > 0) await batch.commit();

    // Delete Posts
    const postsSnap = await db.collection(POSTS_COL).where('teamId', '==', teamId).get();
    if (!postsSnap.empty) {
      const postsBatch = db.batch();
      postsSnap.docs.forEach((doc) => postsBatch.delete(doc.ref));
      await postsBatch.commit();
      console.log(`  Deleted ${postsSnap.size} posts for team ${teamId}`);
    }

    // Delete Events (games, camps, visits)
    const eventsSnap = await db.collection(EVENTS_COL).where('teamId', '==', teamId).get();
    if (!eventsSnap.empty) {
      const eventsBatch = db.batch();
      eventsSnap.docs.forEach((doc) => eventsBatch.delete(doc.ref));
      await eventsBatch.commit();
      console.log(`  Deleted ${eventsSnap.size} team events for team ${teamId}`);
    }

    // Delete News
    const newsSnap = await db.collection(NEWS_COL).where('teamId', '==', teamId).get();
    if (!newsSnap.empty) {
      const newsBatch = db.batch();
      newsSnap.docs.forEach((doc) => newsBatch.delete(doc.ref));
      await newsBatch.commit();
      console.log(`  Deleted ${newsSnap.size} news articles for team ${teamId}`);
    }
  }

  // 3. Delete all teams
  if (teamIds.length > 0) {
    const batch = db.batch();
    teamsSnap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    console.log(`  Deleted ${teamIds.length} teams`);
  }

  // 4. Delete organization
  await db.collection(ORGS_COL).doc(orgId).delete();
  console.log(`  ✓ Deleted organization ${orgId}`);
}

// ─── CREATE Functions ─────────────────────────────────────────────────────────
async function seedOrganization(org: SeedOrg): Promise<void> {
  console.log(`\n📋 Seeding ${org.name} (${org.id})...`);

  // 1. Create Organization
  const orgData = {
    id: org.id,
    name: org.name,
    code: org.code,
    type: org.type,
    status: 'active',
    location: {
      city: org.city,
      state: org.state,
      country: 'USA',
    },
    admins: REAL_USER_IDS,
    branding: {
      logoUrl: org.logoUrl || '',
      primaryColor: '#1a73e8',
      secondaryColor: '#ffffff',
    },
    billing: {
      plan: 'pro',
      status: 'active',
      seats: 50,
    },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await db.collection(ORGS_COL).doc(org.id).set(orgData);
  console.log(`  ✓ Created organization`);

  // 2. Create Teams
  for (const team of org.teams) {
    // Generate unicode and slug for team URL routing
    const unicode = await generateUniqueUnicode();
    const sportName =
      team.type === 'football'
        ? 'Football'
        : team.type === 'basketball'
          ? 'Basketball'
          : 'Baseball';
    const slug = buildTeamSlug(team.name, sportName, unicode);

    const teamData = {
      id: team.id,
      teamName: team.name,
      name: team.name,
      code: team.code,
      teamCode: team.code,
      organizationId: org.id,
      type: team.type,
      sportName,
      teamType: org.type === 'school' ? 'high_school' : 'aau',
      season: team.season,
      status: 'active',
      isActive: true,
      isPublic: true,
      requireApproval: false,
      packageId: 'premium',

      // URL routing
      unicode,
      slug,
      customUrl: `/team/${slug}`,

      // Location from org
      city: org.city,
      state: org.state,

      // Division & Conference
      division: 'Division I',
      conference: team.type === 'basketball' ? 'Western Conference' : 'Pacific Conference',

      // Team profile data
      statsCategories: buildTeamStatsCategories(team.id),
      recruitingActivities: buildTeamRecruitingActivities(team.id),

      // Season record
      seasonRecord: {
        wins: 12,
        losses: 3,
        ties: 0,
      },

      // Season history
      seasonHistory: [
        {
          season: team.season,
          wins: 12,
          losses: 3,
          ties: 0,
          championships: [],
          highlights: `${team.season} season - Strong performance with 12 wins`,
        },
      ],

      lastUpdatedStat: new Date().toISOString(),

      // Branding
      teamLogoImg: org.logoUrl,
      teamColor1: '#1a73e8',
      teamColor2: '#ffffff',
      mascot: org.name.includes('Knights')
        ? 'Knights'
        : org.name.includes('Thunder')
          ? 'Thunder'
          : 'Eagles',
      description: `${team.name} is a competitive ${sportName} program committed to excellence on and off the field. We focus on developing athletes with strong fundamentals, teamwork, and leadership skills.`,

      // Social links
      socialLinks: {
        website: `https://${team.code.toLowerCase()}.team`,
        instagram: `https://instagram.com/${team.code.toLowerCase()}`,
        twitter: `https://twitter.com/${team.code.toLowerCase()}`,
        facebook: `https://facebook.com/${team.code.toLowerCase()}`,
      },

      // Contact info
      contactInfo: {
        email: `contact@${team.code.toLowerCase()}.team`,
        phone: '+1-555-000-0000',
        address: `${org.city}, ${org.state}, USA`,
      },

      // Team links
      teamLinks: {
        schedulePageUrl: `/team/${slug}/schedule`,
        newsPageUrl: `/team/${slug}/news`,
        rosterPageUrl: `/team/${slug}/roster`,
      },

      // Sponsor
      sponsor: {
        name: 'Nike Basketball',
        logoImg: 'https://via.placeholder.com/150/000000/FFFFFF?text=Nike',
      },

      // Analytics (will be updated by RosterEntries)
      athleteMember: 0,
      panelMember: 0,
      totalTraffic: 0,
      analytic: {
        totalProfileView: 0,
        totalTeamPageTraffic: 0,
      },

      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await db.collection(TEAMS_COL).doc(team.id).set(teamData);
    console.log(`  ✓ Created team: ${team.name}`);
    console.log(`    URL: /team/${slug}`);

    // 3. Create RosterEntries for each member
    let athleteCount = 0;
    let coachCount = 0;

    for (const member of team.members) {
      const entryId = `roster_${team.id}_${member.userId}`;
      const entryData = {
        id: entryId,
        userId: member.userId,
        teamId: team.id,
        organizationId: org.id,
        role: member.role.toLowerCase(),
        status: 'active',
        jerseyNumber: member.jerseyNumber,
        position: member.position,
        joinedAt: Timestamp.now(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await db.collection(ROSTER_COL).doc(entryId).set(entryData);
      console.log(`    ✓ Added ${member.userId.slice(0, 8)}... as ${member.role}`);

      // Count members
      if (member.role === 'ATHLETE' || member.role === 'OWNER') {
        athleteCount++;
      } else if (member.role === 'COACH') {
        coachCount++;
      }
    }

    // 4. Update team member counts
    await db.collection(TEAMS_COL).doc(team.id).update({
      athleteMember: athleteCount,
      panelMember: coachCount,
    });
    console.log(`    ✓ Updated team counts: ${athleteCount} athletes, ${coachCount} coaches`);

    // 5. Seed team Posts
    await seedTeamPosts(team.id, team.members[0].userId);

    // 6. Seed team events (games, camps, etc.)
    await seedTeamSchedule(team.id);

    // 7. Seed team News
    await seedTeamNews(team.id);
  }

  console.log(`  ✅ Seeded ${org.name} with ${org.teams.length} teams\n`);
}

// ─── Seed Team Posts ──────────────────────────────────────────────────────────
async function seedTeamPosts(teamId: string, authorId: string): Promise<void> {
  const now = new Date();
  const daysAgo = (n: number) => Timestamp.fromDate(new Date(now.getTime() - n * 86_400_000));

  const posts = [
    {
      userId: authorId,
      teamId,
      type: 'announcement',
      title: '🎉 Welcome to the 2025-2026 Season!',
      content:
        'Excited to kick off the new season with high energy and determination! ' +
        'We have put in the work all summer with intense training sessions. ' +
        "Let's chase that championship together! 🏀🔥",
      visibility: 'public',
      images: [],
      isPinned: true,
      commentsDisabled: false,
      stats: { likes: 142, comments: 28, shares: 19, views: 1530 },
      createdAt: daysAgo(45),
      updatedAt: daysAgo(45),
    },
    {
      userId: authorId,
      teamId,
      type: 'news',
      title: '🏆 Conference Champions!',
      content:
        'HISTORIC WIN! We defeated our rivals to claim the conference championship! ' +
        'This is one of our proudest moments in program history. ' +
        'Thank you to every single fan who believed in us! 🏆🥇',
      visibility: 'public',
      images: ['https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800'],
      isPinned: false,
      commentsDisabled: false,
      stats: { likes: 389, comments: 74, shares: 112, views: 5820 },
      createdAt: daysAgo(12),
      updatedAt: daysAgo(12),
    },
    {
      userId: authorId,
      teamId,
      type: 'image',
      title: 'Practice Session 💪',
      content:
        "No days off! Today's session focused on defense and execution. The squad is locked in! 🏀",
      visibility: 'public',
      images: [
        'https://images.unsplash.com/photo-1608245449230-4ac19066d2d0?w=800',
        'https://images.unsplash.com/photo-1519861531473-9200262188bf?w=800',
      ],
      isPinned: false,
      commentsDisabled: false,
      stats: { likes: 215, comments: 41, shares: 8, views: 2730 },
      createdAt: daysAgo(7),
      updatedAt: daysAgo(7),
    },
    {
      userId: authorId,
      teamId,
      type: 'video',
      title: '🎥 Game Highlights vs Rivals',
      content: 'Check out the best plays from our victory last night! What a game! 🔥',
      visibility: 'public',
      images: [],
      mediaUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      thumbnailUrl: 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=800',
      isPinned: false,
      commentsDisabled: false,
      stats: { likes: 567, comments: 89, shares: 145, views: 8940 },
      createdAt: daysAgo(3),
      updatedAt: daysAgo(3),
    },
  ];

  const batch = db.batch();
  posts.forEach((post, i) => {
    const docId = `seed_${teamId}_post_${i}`;
    batch.set(db.collection(POSTS_COL).doc(docId), post);
  });
  await batch.commit();
  console.log(`    ✓ Seeded ${posts.length} posts`);
}

// ─── Seed Team Schedule (games, practices) ───────────────────────────────────
async function seedTeamSchedule(teamId: string): Promise<void> {
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
  const daysAhead = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

  const events = [
    {
      teamId,
      type: 'game',
      opponent: 'Eastside Eagles',
      opponentLogoUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=100',
      date: daysAgo(60),
      time: '18:00',
      location: 'Home Arena',
      isHome: true,
      status: 'final',
      result: { teamScore: 87, opponentScore: 72, outcome: 'win', overtime: false },
    },
    {
      teamId,
      type: 'game',
      opponent: 'Northside Thunder',
      date: daysAgo(30),
      time: '18:30',
      location: 'Home Arena',
      isHome: true,
      status: 'final',
      result: { teamScore: 91, opponentScore: 65, outcome: 'win', overtime: false },
    },
    {
      teamId,
      type: 'game',
      opponent: 'Southeast Dragons',
      date: daysAgo(14),
      time: '18:00',
      location: 'Southeast Sports Center',
      isHome: false,
      status: 'final',
      result: { teamScore: 74, opponentScore: 78, outcome: 'loss', overtime: false },
    },
    {
      teamId,
      type: 'game',
      opponent: 'Central Wildcats',
      date: daysAhead(7),
      time: '19:00',
      location: 'Home Arena',
      isHome: true,
      status: 'scheduled',
    },
    {
      teamId,
      type: 'game',
      opponent: 'Westside Titans',
      date: daysAhead(14),
      time: '18:30',
      location: 'Westside Gymnasium',
      isHome: false,
      status: 'scheduled',
    },
    {
      teamId,
      type: 'practice',
      title: 'Team Practice',
      date: daysAhead(2),
      time: '16:00',
      location: 'Practice Facility',
      isHome: true,
      status: 'scheduled',
      notes: 'Full squad practice - offense and defense drills',
    },
  ];

  const batch = db.batch();
  events.forEach((event, i) => {
    const docId = `seed_${teamId}_event_${i}`;
    batch.set(db.collection(EVENTS_COL).doc(docId), event);
  });
  await batch.commit();
  console.log(`    ✓ Seeded ${events.length} team events`);
}

// ─── Seed Team News ───────────────────────────────────────────────────────────
async function seedTeamNews(teamId: string): Promise<void> {
  const articles = buildTeamNewsArticles(teamId);
  const batch = db.batch();
  for (const article of articles) {
    const a = article as { id: string };
    batch.set(db.collection(NEWS_COL).doc(a.id), article);
  }
  await batch.commit();
  console.log(`    ✓ Seeded ${articles.length} news articles`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('========================================');
  console.log('SEED NEW TEAM ARCHITECTURE (v3.0)');
  console.log('========================================');
  console.log(`Environment: ${useStaging ? 'STAGING' : 'PRODUCTION'}`);
  console.log(`Project: ${projectId}`);
  console.log('========================================\n');

  try {
    if (doDelete) {
      // Delete mode
      if (targetOrgId) {
        await deleteOrganization(targetOrgId);
      } else {
        console.log('🗑️  Deleting all seed organizations...\n');
        for (const org of SEED_DATA) {
          await deleteOrganization(org.id);
        }
      }
      console.log('\n✅ Deletion complete!\n');
    } else {
      // Seed mode
      if (targetOrgId) {
        const org = SEED_DATA.find((o) => o.id === targetOrgId);
        if (!org) {
          console.error(`❌ Organization ${targetOrgId} not found in seed data`);
          process.exit(1);
        }
        await seedOrganization(org);
      } else {
        for (const org of SEED_DATA) {
          await seedOrganization(org);
        }
      }

      // Summary
      const totalTeams = SEED_DATA.reduce((acc, org) => acc + org.teams.length, 0);
      const totalMembers = SEED_DATA.reduce(
        (acc, org) => acc + org.teams.reduce((sum, t) => sum + t.members.length, 0),
        0
      );

      console.log('========================================');
      console.log('SUMMARY');
      console.log('========================================');
      console.log(`Organizations: ${SEED_DATA.length}`);
      console.log(`Teams: ${totalTeams}`);
      console.log(`RosterEntries: ${totalMembers}`);
      console.log(`Real Users: ${REAL_USER_IDS.join(', ')}`);
      console.log('========================================');

      console.log('\n✅ Seed complete!\n');
      console.log('📚 Try these queries:\n');
      console.log('1. Get all teams for user1:');
      console.log(
        `   db.collection("${ROSTER_COL}").where("userId", "==", "${REAL_USER_IDS[0]}").get()`
      );
      console.log('\n2. Get team roster:');
      console.log(
        `   db.collection("${ROSTER_COL}").where("teamId", "==", "team_seed_stmary_fb_v").get()`
      );
      console.log('\n3. Get organization with teams:');
      console.log(
        `   db.collection("${TEAMS_COL}").where("organizationId", "==", "org_seed_stmary").get()`
      );
      console.log();
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();

main();
