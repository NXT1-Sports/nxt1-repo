/**
 * @fileoverview Team profile seed script (Production-ready version)
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/seed-team-profile-v2.ts                    # seeds team on production
 *   npx tsx scripts/seed-team-profile-v2.ts --env=staging      # seeds team on staging
 *   npx tsx scripts/seed-team-profile-v2.ts --delete --teamId=seed_team_123456
 *
 * Features:
 * - Uses REAL users: rGFVloZtNwhbiI6ohX1I8MDhJFG3, 6kjm7AJieFNWYkmTp2HOmYp4r8E3
 * - Embedded members[] array (NO subcollections)
 * - Matches production team-code.service.ts structure
 * - English-only seed data
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  buildTeamNewsArticles,
  buildTeamStatsCategories,
  buildTeamRecruitingActivities,
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

const targetTeamId = getArg('teamId');
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
  console.error('[seed-team] Missing Firebase credentials in .env');
  process.exit(1);
}

const appName = `seed-team-v2-${Date.now()}`;
const app =
  getApps().find((a) => a.name === appName) ??
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, appName);
const db = getFirestore(app);

// ─── Constants ────────────────────────────────────────────────────────────────
const TEAMCODES_COL = 'TeamCodes';
const USERS_COL = 'Users';
const POSTS_COL = 'Posts';
const TEAM_EVENTS_COL = 'TeamEvents';
const NEWS_COL = 'News';
const REAL_USER_IDS = ['rGFVloZtNwhbiI6ohX1I8MDhJFG3', '6kjm7AJieFNWYkmTp2HOmYp4r8E3'];

// ─── Types ────────────────────────────────────────────────────────────────────
interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  joinTime: string;
  role: 'Administrative' | 'Athlete' | 'Coach' | 'Media';
  isVerify: boolean;
  email: string;
  phoneNumber: string;
  position?: string[];
  classOf?: number;
  gpa?: string;
  title?: string;
  jerseyNumber?: string;
  height?: string;
  weight?: string;
  profileImg?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function generateUniqueUnicode(): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const randomNum = Math.floor(Math.random() * 1000000);
    const unicode = randomNum.toString().padStart(6, '0');

    try {
      const existing = await db
        .collection(TEAMCODES_COL)
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

async function generateUniqueTeamCode(): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    try {
      const existing = await db
        .collection(TEAMCODES_COL)
        .where('teamCode', '==', code)
        .limit(1)
        .get();

      if (existing.empty) {
        return code;
      }
    } catch (error: any) {
      if (error.code === 5 || error.details === '') {
        return code;
      }
      throw error;
    }

    attempts++;
  }

  return 'SEED' + Date.now().toString().slice(-4);
}

function buildTeamSlug(teamName: string, sportName: string, unicode: string): string {
  const namePart = teamName.replace(/\s+/g, '_');
  return `${namePart}-${sportName}-${unicode}`;
}

async function fetchUserData(userId: string): Promise<any> {
  try {
    const userDoc = await db.collection(USERS_COL).doc(userId).get();
    if (!userDoc.exists) {
      console.warn(`  ⚠️  User ${userId} not found in database`);
      return null;
    }
    return userDoc.data();
  } catch (error) {
    console.warn(`  ⚠️  Error fetching user ${userId}:`, error);
    return null;
  }
}

/**
 * Update user's sports array with basketball profile data
 */
async function updateUserSportProfile(
  userId: string,
  sportData: {
    jerseyNumber: string;
    height: string;
    weight: string;
    position: string[];
  }
): Promise<void> {
  try {
    const userDoc = await db.collection(USERS_COL).doc(userId).get();
    if (!userDoc.exists) {
      console.warn(`    ⚠️  Cannot update sports - user ${userId} not found`);
      return;
    }

    const userData = userDoc.data() as any;
    const existingSports = userData.sports || [];

    // Check if basketball profile already exists
    const basketballIndex = existingSports.findIndex((s: any) => s.sport === 'Basketball_mens');

    if (basketballIndex >= 0) {
      // Update existing basketball profile
      existingSports[basketballIndex] = {
        ...existingSports[basketballIndex],
        jerseyNumber: sportData.jerseyNumber,
        positions: sportData.position,
        metrics: {
          ...existingSports[basketballIndex].metrics,
          height: sportData.height,
          weight: sportData.weight,
        },
      };
    } else {
      // Add new basketball profile
      existingSports.push({
        sport: 'Basketball_mens',
        order: existingSports.length,
        jerseyNumber: sportData.jerseyNumber,
        positions: sportData.position,
        accountType: 'athlete',
        metrics: {
          height: sportData.height,
          weight: sportData.weight,
        },
      });
    }

    await db.collection(USERS_COL).doc(userId).update({
      sports: existingSports,
      updatedAt: Timestamp.now(),
    });

    console.log(`    ✓ Updated sports profile for user ${userId}`);
  } catch (error) {
    console.error(`    ⚠️  Error updating user ${userId}:`, error);
  }
}

async function buildMembers(): Promise<TeamMember[]> {
  const members: TeamMember[] = [];
  const now = new Date().toISOString();

  // Fetch real users
  console.log('  📥 Fetching real users from database...');
  for (let i = 0; i < REAL_USER_IDS.length; i++) {
    const userId = REAL_USER_IDS[i];
    const userData = await fetchUserData(userId);

    if (userData) {
      const member: TeamMember = {
        id: userId,
        firstName: userData.firstName || 'Unknown',
        lastName: userData.lastName || 'User',
        name: userData.name || `${userData.firstName || 'Unknown'} ${userData.lastName || 'User'}`,
        joinTime: now,
        role: i === 0 ? 'Administrative' : 'Athlete',
        isVerify: true,
        email: userData.email || `user${i}@example.com`,
        phoneNumber: userData.phone || userData.phoneNumber || '+1-310-000-0000',
        profileImg: userData.profilePhoto || userData.photoURL, // Get from User document
      };

      // Only add optional fields for athletes
      if (i > 0) {
        member.position = ['Point Guard'];
        member.classOf = 2027;

        // Update User's sports array with basketball data
        await updateUserSportProfile(userId, {
          jerseyNumber: (10 + i).toString(),
          height: `6'${i + 1}"`,
          weight: `${165 + i * 5} lbs`,
          position: ['Point Guard'],
        });
      }

      members.push(member);
      console.log(`    ✓ Loaded: ${userData.name || userId} (${i === 0 ? 'Admin' : 'Athlete'})`);
    } else {
      // Fallback if user not found
      members.push({
        id: userId,
        firstName: 'User',
        lastName: `#${i + 1}`,
        name: `User #${i + 1}`,
        joinTime: now,
        role: i === 0 ? 'Administrative' : 'Athlete',
        isVerify: false,
        email: `user${i}@example.com`,
        phoneNumber: '+1-310-000-0000',
      });
      console.log(`    ⚠️  Fallback: User #${i + 1} (user not found)`);
    }
  }

  // Add fake members — coaches, athletes, staff
  const fakeMembers: TeamMember[] = [
    // ── Coaches ──────────────────────────────────────────────
    {
      id: 'fake_coach_1',
      firstName: 'Marcus',
      lastName: 'Williams',
      name: 'Marcus Williams',
      joinTime: now,
      role: 'Coach',
      isVerify: true,
      email: 'coach.williams@riverside-phoenix.com',
      phoneNumber: '+1-310-234-5678',
      title: 'Head Coach',
      profileImg: 'https://i.pravatar.cc/300?img=12',
    },
    {
      id: 'fake_coach_2',
      firstName: 'Derek',
      lastName: 'Thompson',
      name: 'Derek Thompson',
      joinTime: now,
      role: 'Coach',
      isVerify: true,
      email: 'd.thompson@riverside-phoenix.com',
      phoneNumber: '+1-310-234-6789',
      title: 'Assistant Coach',
      profileImg: 'https://i.pravatar.cc/300?img=15',
    },
    // ── Staff ─────────────────────────────────────────────────
    {
      id: 'fake_media_1',
      firstName: 'Alexis',
      lastName: 'Carter',
      name: 'Alexis Carter',
      joinTime: now,
      role: 'Media',
      isVerify: true,
      email: 'media@riverside-phoenix.com',
      phoneNumber: '+1-310-234-7890',
      title: 'Media Manager',
      profileImg: 'https://i.pravatar.cc/300?img=47',
    },
    // ── Athletes — Class of 2026 ───────────────────────────────
    {
      id: 'fake_athlete_1',
      firstName: 'Tyler',
      lastName: 'Johnson',
      name: 'Tyler Johnson',
      joinTime: now,
      role: 'Athlete',
      isVerify: true,
      email: 'tyler.johnson@student.edu',
      phoneNumber: '+1-310-456-7890',
      position: ['Shooting Guard'],
      classOf: 2026,
      gpa: '3.8',
      jerseyNumber: '23',
      height: `6'3"`,
      weight: '185 lbs',
      profileImg: 'https://i.pravatar.cc/300?img=33',
    },
    {
      id: 'fake_athlete_2',
      firstName: 'Jordan',
      lastName: 'Davis',
      name: 'Jordan Davis',
      joinTime: now,
      role: 'Athlete',
      isVerify: true,
      email: 'jordan.davis@student.edu',
      phoneNumber: '+1-310-678-9012',
      position: ['Center'],
      classOf: 2026,
      gpa: '3.5',
      jerseyNumber: '15',
      height: `6'8"`,
      weight: '220 lbs',
      profileImg: 'https://i.pravatar.cc/300?img=52',
    },
    {
      id: 'fake_athlete_3',
      firstName: 'Cameron',
      lastName: 'Reed',
      name: 'Cameron Reed',
      joinTime: now,
      role: 'Athlete',
      isVerify: true,
      email: 'cam.reed@student.edu',
      phoneNumber: '+1-310-321-4567',
      position: ['Small Forward'],
      classOf: 2026,
      gpa: '3.6',
      jerseyNumber: '3',
      height: `6'5"`,
      weight: '195 lbs',
      profileImg: 'https://i.pravatar.cc/300?img=61',
    },
    // ── Athletes — Class of 2027 ───────────────────────────────
    {
      id: 'fake_athlete_4',
      firstName: 'Malik',
      lastName: 'Brown',
      name: 'Malik Brown',
      joinTime: now,
      role: 'Athlete',
      isVerify: true,
      email: 'malik.brown@student.edu',
      phoneNumber: '+1-310-555-2233',
      position: ['Point Guard'],
      classOf: 2027,
      gpa: '3.9',
      jerseyNumber: '5',
      height: `6'1"`,
      weight: '170 lbs',
      profileImg: 'https://i.pravatar.cc/300?img=68',
    },
    {
      id: 'fake_athlete_5',
      firstName: 'Darius',
      lastName: 'Mitchell',
      name: 'Darius Mitchell',
      joinTime: now,
      role: 'Athlete',
      isVerify: true,
      email: 'd.mitchell@student.edu',
      phoneNumber: '+1-310-555-3344',
      position: ['Power Forward'],
      classOf: 2027,
      gpa: '3.3',
      jerseyNumber: '32',
      height: `6'6"`,
      weight: '210 lbs',
      profileImg: 'https://i.pravatar.cc/300?img=57',
    },
    {
      id: 'fake_athlete_6',
      firstName: 'Ethan',
      lastName: 'Clarke',
      name: 'Ethan Clarke',
      joinTime: now,
      role: 'Athlete',
      isVerify: true,
      email: 'ethan.clarke@student.edu',
      phoneNumber: '+1-310-555-4455',
      position: ['Shooting Guard', 'Small Forward'],
      classOf: 2027,
      gpa: '3.7',
      jerseyNumber: '11',
      height: `6'4"`,
      weight: '188 lbs',
      profileImg: 'https://i.pravatar.cc/300?img=63',
    },
    // ── Athletes — Class of 2028 ───────────────────────────────
    {
      id: 'fake_athlete_7',
      firstName: 'Noah',
      lastName: 'Anderson',
      name: 'Noah Anderson',
      joinTime: now,
      role: 'Athlete',
      isVerify: true,
      email: 'noah.anderson@student.edu',
      phoneNumber: '+1-310-555-5566',
      position: ['Point Guard'],
      classOf: 2028,
      gpa: '3.4',
      jerseyNumber: '2',
      height: `5'11"`,
      weight: '160 lbs',
      profileImg: 'https://i.pravatar.cc/300?img=70',
    },
    {
      id: 'fake_athlete_8',
      firstName: 'Isaiah',
      lastName: 'Turner',
      name: 'Isaiah Turner',
      joinTime: now,
      role: 'Athlete',
      isVerify: true,
      email: 'isaiah.turner@student.edu',
      phoneNumber: '+1-310-555-6677',
      position: ['Center', 'Power Forward'],
      classOf: 2028,
      gpa: '3.2',
      jerseyNumber: '44',
      height: `6'7"`,
      weight: '215 lbs',
      profileImg: 'https://i.pravatar.cc/300?img=54',
    },
    {
      id: 'fake_athlete_9',
      firstName: 'Brandon',
      lastName: 'Hayes',
      name: 'Brandon Hayes',
      joinTime: now,
      role: 'Athlete',
      isVerify: true,
      email: 'b.hayes@student.edu',
      phoneNumber: '+1-310-555-7788',
      position: ['Small Forward'],
      classOf: 2028,
      gpa: '3.1',
      jerseyNumber: '21',
      height: `6'4"`,
      weight: '192 lbs',
      profileImg: 'https://i.pravatar.cc/300?img=66',
    },
  ];

  members.push(...fakeMembers);

  // ✅ CREATE FAKE USER DOCUMENTS IN FIRESTORE
  // So that getUsersByIds() can fetch them
  console.log('\n  📝 Creating fake user documents in Firestore...');
  for (const fake of fakeMembers) {
    const userData: Record<string, any> = {
      id: fake.id,
      firstName: fake.firstName,
      lastName: fake.lastName,
      name: fake.name,
      displayName: fake.name,
      email: fake.email,
      phone: fake.phoneNumber,
      phoneNumber: fake.phoneNumber,
      profileImg: fake.profileImg,
      profilePhoto: fake.profileImg,
      role: fake.role.toLowerCase(), // "Coach" → "coach", "Athlete" → "athlete"
      isVerify: fake.isVerify,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Add optional fields only if defined
    if (fake.title) userData.title = fake.title;
    if (fake.jerseyNumber) userData.jerseyNumber = fake.jerseyNumber;
    if (fake.height) userData.height = fake.height;
    if (fake.weight) userData.weight = fake.weight;
    if (fake.classOf) {
      userData.classOf = fake.classOf;
      userData.classYear = fake.classOf.toString(); // used by roster filter
    }
    if (fake.gpa) userData.gpa = fake.gpa;
    if (fake.position) userData.position = fake.position;

    await db.collection(USERS_COL).doc(fake.id).set(userData, { merge: true });
    console.log(`    ✓ Created User: ${fake.name} (${fake.id})`);
  }

  console.log(
    `  ✓ Built ${members.length} members (${REAL_USER_IDS.length} real + ${fakeMembers.length} fake)`
  );
  return members;
}

// ─── SEED TEAM POSTS ──────────────────────────────────────────────────────────
async function seedTeamPosts(teamId: string, authorId: string): Promise<void> {
  console.log(`\n  📝 Seeding team posts for team "${teamId}"...`);

  const now = new Date();
  const daysAgo = (n: number) => Timestamp.fromDate(new Date(now.getTime() - n * 86_400_000));

  const posts = [
    {
      userId: authorId,
      teamId,
      type: 'announcement',
      title: '🎉 Welcome to the 2024-2025 Season!',
      content:
        'Riverside Phoenix officially kicks off the 2024-2025 season with full determination and high expectations. ' +
        'We have put in the work all summer with intense training sessions and film study. ' +
        "Let's chase that Northern Conference championship together! 🏀🔥",
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
      title: '🏆 Northern Conference Champions 2024-2025!',
      content:
        'HISTORIC WIN! Riverside Phoenix defeated City Stars 87-72 to claim the Northern Conference championship ' +
        'for the very first time in program history. This is the proudest moment since we were founded in 2020. ' +
        'Thank you to every single fan who believed in us throughout this journey! 🏆🥇',
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
      title: 'Monday Morning Practice 💪',
      content:
        "No days off for those chasing greatness! This morning's session focused on " +
        'defensive schemes and fast-break execution. The squad is locked in right now. 🏀',
      visibility: 'public',
      images: [
        'https://images.unsplash.com/photo-1574623452334-1e0ac2b3ccb4?w=800',
        'https://images.unsplash.com/photo-1608245449230-4ac19066d2d0?w=800',
      ],
      isPinned: false,
      commentsDisabled: false,
      stats: { likes: 67, comments: 11, shares: 5, views: 842 },
      createdAt: daysAgo(8),
      updatedAt: daysAgo(8),
    },
    {
      userId: REAL_USER_IDS[1],
      teamId,
      type: 'text',
      title: null,
      content:
        "Getting ready for the rivalry game against Eastside Eagles next week! The whole team's energy is through the roof. " +
        'Who else is hyped for this one? 🦅 vs 🔥 #RiversidePhoenix #NorthernConference',
      visibility: 'public',
      images: [],
      isPinned: false,
      commentsDisabled: false,
      stats: { likes: 53, comments: 22, shares: 8, views: 620 },
      createdAt: daysAgo(5),
      updatedAt: daysAgo(5),
    },
    {
      userId: authorId,
      teamId,
      type: 'video',
      title: 'Highlights | 87-72 Win vs. City Stars',
      content:
        'The best moments from the Northern Conference championship game. ' +
        "Relive the team's incredible performance all over again! 🎥🔥",
      visibility: 'public',
      images: ['https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800'],
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      duration: 185,
      isPinned: false,
      commentsDisabled: false,
      stats: { likes: 218, comments: 41, shares: 67, views: 3104 },
      createdAt: daysAgo(11),
      updatedAt: daysAgo(11),
    },
    {
      userId: authorId,
      teamId,
      type: 'announcement',
      title: '📋 Weekly Practice Schedule',
      content:
        'Practice schedule for the week of March 8-14, 2026:\n' +
        '• Monday: 7:00-9:00 AM - Conditioning\n' +
        '• Tuesday: 6:00-8:00 PM - Offensive schemes\n' +
        '• Wednesday: Rest day\n' +
        '• Thursday: 6:00-8:30 PM - Scrimmage\n' +
        '• Friday: 7:00-8:30 AM - Shooting practice\n' +
        '• Saturday: 9:00 AM-12:00 PM - Full team session\n\n' +
        'All members please be on time. #RiversidePhoenix',
      visibility: 'public',
      images: [],
      isPinned: false,
      commentsDisabled: false,
      stats: { likes: 31, comments: 7, shares: 3, views: 415 },
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
    },
    {
      userId: REAL_USER_IDS[1],
      teamId,
      type: 'highlight',
      title: 'Top 5 Plays - February 🔥',
      content:
        'The 5 best plays from Riverside Phoenix in February 2026. ' +
        'Big shoutout to our media team for capturing these incredible moments! 🎬',
      visibility: 'public',
      images: ['https://images.unsplash.com/photo-1574623452334-1e0ac2b3ccb4?w=800'],
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      duration: 120,
      isPinned: false,
      commentsDisabled: false,
      stats: { likes: 154, comments: 29, shares: 45, views: 2670 },
      createdAt: daysAgo(18),
      updatedAt: daysAgo(18),
    },
  ];

  const batch = db.batch();
  const postIds: string[] = [];

  for (const post of posts) {
    const ref = db.collection(POSTS_COL).doc();
    postIds.push(ref.id);
    batch.set(ref, post);
  }

  await batch.commit();
  console.log(`    ✓ Seeded ${posts.length} posts (IDs: ${postIds.slice(0, 3).join(', ')}...)`);
}

// ─── SEED TEAM SCHEDULE ──────────────────────────────────────────────────────
async function seedTeamSchedule(teamId: string): Promise<void> {
  console.log(`\n  📅 Seeding team schedule for team "${teamId}"...`);

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
      location: 'Riverside Community Arena',
      isHome: true,
      status: 'final',
      result: { teamScore: 87, opponentScore: 72, outcome: 'win', overtime: false },
    },
    {
      teamId,
      type: 'game',
      opponent: 'Sherman Warriors',
      date: daysAgo(45),
      time: '19:00',
      location: 'Sherman City Gymnasium',
      isHome: false,
      status: 'final',
      result: { teamScore: 68, opponentScore: 74, outcome: 'loss', overtime: false },
    },
    {
      teamId,
      type: 'game',
      opponent: 'Northside Thunder',
      date: daysAgo(30),
      time: '18:30',
      location: 'Riverside Community Arena',
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
      result: { teamScore: 79, opponentScore: 77, outcome: 'win', overtime: true },
    },
    {
      teamId,
      type: 'scrimmage',
      opponent: 'City Stars (Scrimmage)',
      date: daysAgo(7),
      time: '09:00',
      location: 'Riverside Community Arena',
      isHome: true,
      status: 'final',
      result: { teamScore: 82, opponentScore: 78, outcome: 'win', overtime: false },
    },
    {
      teamId,
      type: 'game',
      opponent: 'Eastside Eagles',
      date: daysAhead(7),
      time: '18:30',
      location: 'Eastside Athletic Center',
      isHome: false,
      status: 'upcoming',
    },
    {
      teamId,
      type: 'game',
      opponent: 'Sherman Warriors',
      date: daysAhead(21),
      time: '18:00',
      location: 'Riverside Community Arena',
      isHome: true,
      status: 'upcoming',
    },
    {
      teamId,
      type: 'game',
      opponent: 'Northside Thunder',
      date: daysAhead(35),
      time: '19:00',
      location: 'Northside Fieldhouse',
      isHome: false,
      status: 'upcoming',
    },
  ];

  const batch = db.batch();
  const eventIds: string[] = [];
  for (const event of events) {
    const ref = db.collection(TEAM_EVENTS_COL).doc();
    eventIds.push(ref.id);
    batch.set(ref, event);
  }
  await batch.commit();
  console.log(
    `    ✓ Seeded ${events.length} schedule events (IDs: ${eventIds.slice(0, 3).join(', ')}...)`
  );
}

// ─── DELETE TEAM SCHEDULE ─────────────────────────────────────────────────────
async function deleteTeamSchedule(teamId: string): Promise<void> {
  const snap = await db.collection(TEAM_EVENTS_COL).where('teamId', '==', teamId).get();
  if (snap.empty) {
    console.log(`    ℹ️  No schedule events found for team ${teamId}`);
    return;
  }
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  console.log(`    ✓ Deleted ${snap.size} schedule events for team ${teamId}`);
}

// ─── SEED TEAM NEWS ────────────────────────────────────────────────────────────
async function seedTeamNews(teamId: string): Promise<void> {
  console.log(`\n  📰 Seeding team news articles for team "${teamId}"...`);
  const articles = buildTeamNewsArticles(teamId);
  const batch = db.batch();
  for (const article of articles) {
    const a = article as { id: string };
    batch.set(db.collection(NEWS_COL).doc(a.id), article);
  }
  await batch.commit();
  console.log(`    ✓ Seeded ${articles.length} news articles to News collection`);
}

// ─── DELETE TEAM NEWS ──────────────────────────────────────────────────────────
async function deleteTeamNews(teamId: string): Promise<void> {
  const snap = await db
    .collection(NEWS_COL)
    .where('teamId', '==', teamId)
    .where('type', '==', 'team')
    .get();
  if (snap.empty) {
    console.log(`    ℹ️  No news articles found for team ${teamId}`);
    return;
  }
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  console.log(`    ✓ Deleted ${snap.size} news articles for team ${teamId}`);
}

// ─── DELETE TEAM POSTS ─────────────────────────────────────────────────────────
async function deleteTeamPosts(teamId: string): Promise<void> {
  const snap = await db.collection(POSTS_COL).where('teamId', '==', teamId).get();
  if (snap.empty) {
    console.log(`    ℹ️  No posts found for team ${teamId}`);
    return;
  }
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  console.log(`    ✓ Deleted ${snap.size} posts for team ${teamId}`);
}

// ─── SEED ─────────────────────────────────────────────────────────────────────
async function runSeed(teamId: string | null): Promise<void> {
  console.log(`[seed-team] Seeding team on project="${projectId}"\n`);

  const unicode = await generateUniqueUnicode();
  const teamCode = await generateUniqueTeamCode();
  const teamName = 'Riverside Phoenix';
  const sportName = 'Basketball_mens';
  const slug = buildTeamSlug(teamName, sportName, unicode);

  const finalTeamId = teamId || `seed_team_${unicode}`;

  console.log(`  Team ID: ${finalTeamId}`);
  console.log(`  Unicode: ${unicode}`);
  console.log(`  Team Code: ${teamCode}`);
  console.log(`  Slug: ${slug}`);
  console.log(`  Route: /team/${slug}\n`);

  const members = await buildMembers();

  const teamData = {
    id: finalTeamId,
    teamCode,
    teamName,
    teamType: 'high-school',
    sportName,
    state: 'California',
    city: 'Los Angeles',
    athleteMember: members.filter((m) => m.role === 'Athlete').length,
    panelMember: members.filter((m) => m.role !== 'Athlete').length,
    // members field REMOVED — use memberIds + fetch from Users collection
    memberIds: members.map((m) => m.id),
    packageId: 'premium',
    isActive: true,
    createAt: Timestamp.fromDate(new Date('2025-01-15T10:00:00Z')),
    expireAt: Timestamp.fromDate(new Date('2026-12-31T23:59:59Z')),
    teamLogoImg: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=200',
    teamColor1: '#DC2626',
    teamColor2: '#F59E0B',
    mascot: 'Phoenix 🔥',
    unicode,
    slug,
    division: 'Division I',
    conference: 'Northern Conference',

    // ──────────────────────────────────────────────────────────
    // TEAM DESCRIPTION
    // ──────────────────────────────────────────────────────────
    description: `Riverside Phoenix is one of the premier youth basketball programs in Southern California, founded in 2020 with a mission to develop elite talent and build champions on and off the court.
    
With a young, passionate roster guided by an experienced coaching staff, the Phoenix has made a consistent impact in competitive circuits across the region. The program emphasizes holistic development — technical skills, team culture, and sportsmanship — for every athlete who puts on the jersey.

Notable achievements: Northern Conference Champions 2024-2025, National Youth Championship Runner-Up 2024, Top 3 State High School Basketball League 2023-2024.`,

    // ──────────────────────────────────────────────────────────
    // SEASON HISTORY
    // ──────────────────────────────────────────────────────────
    seasonHistory: [
      {
        season: '2024-2025',
        wins: 18,
        losses: 3,
        ties: 0,
        championships: ['Northern Conference Champion'],
        highlights:
          'Northern Conference Champions — best record and first title in program history.',
      },
      {
        season: '2023-2024',
        wins: 15,
        losses: 6,
        ties: 0,
        championships: [],
        highlights: 'Top 3 State High School Basketball Championship Tournament',
      },
      {
        season: '2022-2023',
        wins: 12,
        losses: 8,
        ties: 0,
        championships: [],
        highlights: 'First season competing in the Northern Conference',
      },
    ],

    seasonRecord: {
      wins: 18,
      losses: 3,
      ties: 0,
    },
    lastUpdatedStat: new Date().toISOString(),
    socialLinks: {
      website: 'https://riverside-phoenix.com',
      facebook: 'https://facebook.com/riversidephoenix',
      instagram: 'https://instagram.com/riversidephoenix',
      twitter: 'https://twitter.com/riversidephoenix',
      youtube: 'https://youtube.com/@riversidephoenix',
    },
    contactInfo: {
      email: 'contact@riverside-phoenix.com',
      phone: '+1-310-555-1234',
      address: '4500 Phoenix Drive, Los Angeles, CA 90001, USA',
      website: 'https://riverside-phoenix.com',
    },
    teamLinks: {
      newsPageUrl: 'https://riverside-phoenix.com/news',
      schedulePageUrl: 'https://riverside-phoenix.com/schedule',
      registrationUrl: 'https://riverside-phoenix.com/register',
    },
    sponsor: {
      name: 'ProSport Athletics',
      logoImg: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200',
    },
    totalTraffic: 12543,
    analytic: {
      totalProfileView: 8921,
      totalTeamPageTraffic: 12543,
    },
    statsCategories: buildTeamStatsCategories(finalTeamId),
    recruitingActivities: buildTeamRecruitingActivities(finalTeamId),
  };

  const teamRef = db.collection(TEAMCODES_COL).doc(finalTeamId);
  await teamRef.set(teamData);

  // Seed team posts
  await seedTeamPosts(finalTeamId, REAL_USER_IDS[0]);

  // Seed team schedule
  await seedTeamSchedule(finalTeamId);

  // Seed team news articles to News collection
  await seedTeamNews(finalTeamId);

  console.log(`\n✅ Seed complete for team="${finalTeamId}" on project="${projectId}"`);
  console.log('   Seeded:');
  console.log(`     Team Name: ${teamName}`);
  console.log(`     Members: ${members.length}`);
  console.log(`       - Real users: ${REAL_USER_IDS.join(', ')}`);
  console.log(`       - Athletes: ${teamData.athleteMember}`);
  console.log(`       - Staff: ${teamData.panelMember}`);
  console.log(`     News Articles: 3 (in News collection, type=team)`);
  console.log(`\n   Access team at:`);
  console.log(`   http://localhost:4200/team/${slug}`);
  console.log(`\n   To DELETE this seed data later:`);
  console.log(
    `   npx tsx scripts/seed-team-profile-v2.ts --teamId=${finalTeamId} --delete${useStaging ? ' --env=staging' : ''}`
  );
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
async function runDelete(teamId: string): Promise<void> {
  console.log(
    `\n[seed-team] Deleting seed data for teamId="${teamId}" on project="${projectId}"\n`
  );

  const teamRef = db.collection(TEAMCODES_COL).doc(teamId);
  await teamRef.delete();

  // Also delete all posts, schedule events and news articles for this team
  await deleteTeamPosts(teamId);
  await deleteTeamSchedule(teamId);
  await deleteTeamNews(teamId);

  console.log(`\n✅ Deleted team="${teamId}", its posts, schedule and news\n`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  try {
    if (doDelete) {
      if (!targetTeamId) {
        console.error('[seed-team] ERROR: --delete requires --teamId=<id>');
        process.exit(1);
      }
      await runDelete(targetTeamId);
    } else {
      await runSeed(targetTeamId);
    }
  } catch (error) {
    console.error('[seed-team] ERROR:', error);
    process.exit(1);
  }
}

main();
