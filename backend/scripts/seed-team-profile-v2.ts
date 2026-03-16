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
  buildRecruitingActivities,
  buildBasketballRecruitingActivities,
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
const ORGANIZATIONS_COL = 'Organizations';
const TEAMS_COL = 'Teams';
const USERS_COL = 'Users';
const POSTS_COL = 'Posts';
const EVENTS_COL = 'Events'; // All events: games, camps, visits (ownerType: 'user' | 'team')
const NEWS_COL = 'News';
const VIDEOS_COL = 'Videos'; // Top-level (ownerType: 'user' | 'team')
const RECRUITING_COL = 'Recruiting'; // Top-level (ownerType: 'user' | 'team')
const ROSTER_ENTRIES_COL = 'RosterEntries';
const FOLLOWS_COL = 'Follows'; // Top-level (not subcollections!)
const REAL_USER_IDS = ['6kjm7AJieFNWYkmTp2HOmYp4r8E3', '05naPoH3KWZftqsdZr7IVwxLHqo2'];

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
  profileImgs?: string[];
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
      const existing = await db.collection(TEAMS_COL).where('teamCode', '==', code).limit(1).get();

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

/**
 * Build team slug from team name only (no unicode)
 * Format: lowercase-team-name-with-dashes
 * Example: riverside-phoenix
 */
function buildTeamSlug(teamName: string): string {
  const slug = teamName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes
  return slug;
}

/**
 * Remove undefined fields from an object (Firestore doesn't allow undefined)
 */
function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
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
        profileImgs: userData.profileImgs || [],
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
      profileImgs: ['https://i.pravatar.cc/300?img=12'],
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
      profileImgs: ['https://i.pravatar.cc/300?img=15'],
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
      profileImgs: ['https://i.pravatar.cc/300?img=47'],
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
      profileImgs: ['https://i.pravatar.cc/300?img=33'],
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
      profileImgs: ['https://i.pravatar.cc/300?img=52'],
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
      profileImgs: ['https://i.pravatar.cc/300?img=61'],
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
      profileImgs: ['https://i.pravatar.cc/300?img=68'],
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
      profileImgs: ['https://i.pravatar.cc/300?img=57'],
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
      profileImgs: ['https://i.pravatar.cc/300?img=63'],
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
      profileImgs: ['https://i.pravatar.cc/300?img=70'],
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
      profileImgs: ['https://i.pravatar.cc/300?img=54'],
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
      profileImgs: ['https://i.pravatar.cc/300?img=66'],
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
      profileImgs: fake.profileImgs,
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
      ownerType: 'team', // ⭐ Type field to distinguish team vs user posts
      sportId: 'Basketball_mens',
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
      ownerType: 'team',
      sportId: 'Basketball_mens',
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
      ownerType: 'team',
      teamId,
      sportId: 'Basketball_mens',
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
      ownerType: 'team',
      teamId,
      sportId: 'Basketball_mens',
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
      ownerType: 'team',
      userId: authorId,
      teamId,
      sportId: 'Basketball_mens',
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
      ownerType: 'team',
      userId: authorId,
      teamId,
      sportId: 'Basketball_mens',
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
      ownerType: 'team',

      userId: REAL_USER_IDS[1],
      teamId,
      sportId: 'Basketball_mens',
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
      ownerType: 'team', // ⭐ Type field to distinguish team vs user events
      sport: 'Basketball_mens',
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
      ownerType: 'team',
      sport: 'Basketball_mens',
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
      ownerType: 'team',
      teamId,
      sport: 'Basketball_mens',
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
      ownerType: 'team',
      teamId,
      sport: 'Basketball_mens',
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
      ownerType: 'team',
      teamId,
      sport: 'Basketball_mens',
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
      ownerType: 'team',
      teamId,
      sport: 'Basketball_mens',
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
      ownerType: 'team',
      sport: 'Basketball_mens',
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
      ownerType: 'team',
      sport: 'Basketball_mens',
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
    const ref = db.collection(EVENTS_COL).doc();
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
  const snap = await db.collection(EVENTS_COL).where('teamId', '==', teamId).get();
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

// ─── SEED USER RECRUITING ──────────────────────────────────────────────────────
/**
 * Seed Recruiting collection with user recruiting activities for both sports
 * This allows sport filtering when switching between football/basketball profiles
 */
async function seedUserRecruiting(userId: string): Promise<void> {
  console.log(`\n  💼 Seeding user recruiting activities for user "${userId}"...`);

  // Get football recruiting activities
  const footballActivities = buildRecruitingActivities(userId);

  // Get basketball recruiting activities
  const basketballActivities = buildBasketballRecruitingActivities(userId);

  // Combine all activities
  const allActivities = [...footballActivities, ...basketballActivities];

  const batch = db.batch();
  const activityIds: string[] = [];

  for (const activity of allActivities) {
    const activityData = {
      ...activity,
      userId,
      ownerType: 'user', // ⭐ Type field to distinguish user vs team recruiting
    };

    // Use the id from the factory as the document ID
    const ref = db.collection(RECRUITING_COL).doc(activityData.id);
    activityIds.push(ref.id);
    batch.set(ref, activityData);
  }

  await batch.commit();
  console.log(
    `    ✓ Seeded ${allActivities.length} recruiting activities (${footballActivities.length} football + ${basketballActivities.length} basketball)`
  );
}

// ─── DELETE USER RECRUITING ────────────────────────────────────────────────────
async function deleteUserRecruiting(userId: string): Promise<void> {
  const snap = await db.collection(RECRUITING_COL).where('userId', '==', userId).get();
  if (snap.empty) {
    console.log(`    ℹ️  No recruiting activities found for user ${userId}`);
    return;
  }
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  console.log(`    ✓ Deleted ${snap.size} recruiting activities for user ${userId}`);
}

// ─── SEED USER POSTS ───────────────────────────────────────────────────────────
/**
 * Seed user timeline posts with sport filtering support
 */
async function seedUserPosts(userId: string, sport: string): Promise<void> {
  console.log(`\n  📝 Seeding user posts for user "${userId}" (${sport})...`);

  const posts = [
    {
      userId,
      ownerType: 'user',
      sport: sport.toLowerCase(),
      sportId: sport,
      type: 'text',
      content:
        'Great practice today! Working on my defensive skills and footwork. Ready for the next game! 🏀💪',
      visibility: 'public',
      images: [],
      mentions: [],
      hashtags: ['basketball', 'training', 'defense'],
      isPinned: false,
      commentsDisabled: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      stats: { likes: 24, comments: 5, shares: 2, views: 150 },
    },
    {
      userId,
      ownerType: 'user',
      sport: sport.toLowerCase(),
      sportId: sport,
      type: 'image',
      content: 'Game highlights from last night! Team came through with the W! 🏆',
      visibility: 'public',
      images: ['https://placehold.co/800x600/1a1a1a/00FF00?text=Game+Highlights'],
      mentions: [],
      hashtags: ['gameday', 'victory', 'teamwork'],
      isPinned: true,
      commentsDisabled: false,
      createdAt: Timestamp.fromDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)),
      updatedAt: Timestamp.fromDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)),
      stats: { likes: 89, comments: 15, shares: 8, views: 450 },
    },
    {
      userId,
      ownerType: 'user',
      sport: sport.toLowerCase(),
      sportId: sport,
      type: 'video',
      content: 'Check out this crossover move from practice! 🔥',
      visibility: 'public',
      images: [],
      mediaUrl: 'https://placehold.co/800x600/1a1a1a/00FF00?text=Crossover+Move',
      thumbnailUrl: 'https://placehold.co/800x600/1a1a1a/00FF00?text=Thumbnail',
      duration: 15,
      mentions: [],
      hashtags: ['skills', 'crossover', 'basketball'],
      isPinned: false,
      commentsDisabled: false,
      createdAt: Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)),
      updatedAt: Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)),
      stats: { likes: 156, comments: 28, shares: 15, views: 890 },
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
  console.log(
    `    ✓ Seeded ${posts.length} user posts (IDs: ${postIds.slice(0, 3).join(', ')}...)`
  );
}

// ─── SEED USER EVENTS ──────────────────────────────────────────────────────────
/**
 * Seed user schedule events (camps, visits, showcases) with sport filtering
 */
async function seedUserEvents(userId: string, sport: string): Promise<void> {
  console.log(`\n  📅 Seeding user events for user "${userId}" (${sport})...`);

  const daysAhead = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

  const events = [
    {
      userId,
      ownerType: 'user',
      sport: sport.toLowerCase(),
      eventType: 'camp',
      title: 'Elite Basketball Skills Camp',
      description: 'Three-day intensive skills development camp with college coaches',
      location: 'Los Angeles, CA',
      date: daysAhead(10),
      endDate: daysAhead(12),
      isAllDay: true,
      url: 'https://eliteskillscamp.com',
      logoUrl: 'https://placehold.co/200x200/1a1a1a/00FF00?text=Camp',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      userId,
      ownerType: 'user',
      sport: sport.toLowerCase(),
      eventType: 'visit',
      title: 'UCLA Campus Visit',
      description: 'Official recruiting visit to UCLA Basketball program',
      location: 'Westwood, CA',
      date: daysAhead(25),
      isAllDay: false,
      url: 'https://uclabruins.com',
      logoUrl: 'https://placehold.co/200x200/1a1a1a/00FF00?text=UCLA',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      userId,
      ownerType: 'user',
      sport: sport.toLowerCase(),
      eventType: 'showcase',
      title: 'West Coast Basketball Showcase',
      description: 'Elite showcase featuring top recruits from California',
      location: 'San Diego, CA',
      date: daysAhead(45),
      endDate: daysAhead(46),
      isAllDay: true,
      url: 'https://westcoastshowcase.com',
      graphicUrl: 'https://placehold.co/800x600/1a1a1a/00FF00?text=Showcase',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const batch = db.batch();
  const eventIds: string[] = [];
  for (const event of events) {
    const ref = db.collection(EVENTS_COL).doc();
    eventIds.push(ref.id);
    batch.set(ref, event);
  }
  await batch.commit();
  console.log(
    `    ✓ Seeded ${events.length} user events (IDs: ${eventIds.slice(0, 3).join(', ')}...)`
  );
}

// ─── SEED USER NEWS ────────────────────────────────────────────────────────────
/**
 * Seed user news articles with sport filtering
 */
async function seedUserNews(userId: string, sport: string): Promise<void> {
  console.log(`\n  📰 Seeding user news for user "${userId}" (${sport})...`);

  const articles = [
    {
      userId,
      ownerType: 'user',
      sport: sport.toLowerCase(),
      sportId: sport,
      type: 'user',
      title: 'Top Recruit Named to All-State First Team',
      excerpt: 'Stellar season performance earns recognition from coaches association',
      content: 'After an outstanding season averaging 22 points and 8 assists per game...',
      author: 'Sports Insider',
      source: 'High School Sports Today',
      sourceUrl: 'https://hssportstoday.com',
      imageUrl: 'https://placehold.co/800x600/1a1a1a/00FF00?text=All-State+Award',
      publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      visibility: 'public',
      tags: ['awards', 'all-state', 'recognition'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      userId,
      ownerType: 'user',
      sport: sport.toLowerCase(),
      sportId: sport,
      type: 'user',
      title: 'Rising Star Attracts Interest from Top Programs',
      excerpt: 'Multiple Division I schools showing interest in standout guard',
      content:
        'College coaches from across the nation are taking notice of this talented player...',
      author: 'Recruiting Analyst',
      source: '247 Sports',
      sourceUrl: 'https://247sports.com',
      imageUrl: 'https://placehold.co/800x600/1a1a1a/00FF00?text=Recruiting+News',
      publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      visibility: 'public',
      tags: ['recruiting', 'division-i', 'offers'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const batch = db.batch();
  const newsIds: string[] = [];
  for (const article of articles) {
    const ref = db.collection(NEWS_COL).doc();
    newsIds.push(ref.id);
    batch.set(ref, article);
  }
  await batch.commit();
  console.log(
    `    ✓ Seeded ${articles.length} user news articles (IDs: ${newsIds.slice(0, 2).join(', ')}...)`
  );
}

// ─── SEED USER VIDEOS ──────────────────────────────────────────────────────────
/**
 * Seed user highlight videos with sport filtering
 */
async function seedUserVideos(userId: string, sport: string): Promise<void> {
  console.log(`\n  🎥 Seeding user videos for user "${userId}" (${sport})...`);

  const videos = [
    {
      userId,
      ownerType: 'user',
      sport: sport.toLowerCase(),
      sportId: sport,
      title: 'Season Highlights 2024-2025',
      description: 'Best plays from this season including game winners, dunks, and assists',
      videoUrl: 'https://placehold.co/800x600/1a1a1a/00FF00?text=Season+Highlights',
      thumbnailUrl: 'https://placehold.co/800x600/1a1a1a/00FF00?text=Thumbnail+1',
      duration: 185, // seconds
      visibility: 'public',
      category: 'highlights',
      tags: ['season', 'highlights', 'basketball'],
      views: 1250,
      likes: 98,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      userId,
      ownerType: 'user',
      sport: sport.toLowerCase(),
      sportId: sport,
      title: 'Training Session - Ball Handling Drills',
      description: 'Advanced ball handling and dribbling workout routine',
      videoUrl: 'https://placehold.co/800x600/1a1a1a/00FF00?text=Training+Session',
      thumbnailUrl: 'https://placehold.co/800x600/1a1a1a/00FF00?text=Thumbnail+2',
      duration: 120,
      visibility: 'public',
      category: 'training',
      tags: ['training', 'drills', 'skills'],
      views: 680,
      likes: 54,
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      userId,
      ownerType: 'user',
      sport: sport.toLowerCase(),
      sportId: sport,
      title: 'Championship Game - Full Highlights',
      description: 'Complete highlights from the state championship game',
      videoUrl: 'https://placehold.co/800x600/1a1a1a/00FF00?text=Championship',
      thumbnailUrl: 'https://placehold.co/800x600/1a1a1a/00FF00?text=Thumbnail+3',
      duration: 240,
      visibility: 'public',
      category: 'game',
      tags: ['championship', 'game', 'playoffs'],
      views: 2150,
      likes: 187,
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  const batch = db.batch();
  const videoIds: string[] = [];
  for (const video of videos) {
    const ref = db.collection(VIDEOS_COL).doc();
    videoIds.push(ref.id);
    batch.set(ref, video);
  }
  await batch.commit();
  console.log(
    `    ✓ Seeded ${videos.length} user videos (IDs: ${videoIds.slice(0, 3).join(', ')}...)`
  );
}

// ─── DELETE USER CONTENT ───────────────────────────────────────────────────────
async function deleteUserPosts(userId: string): Promise<void> {
  const snap = await db
    .collection(POSTS_COL)
    .where('userId', '==', userId)
    .where('ownerType', '==', 'user')
    .get();
  if (!snap.empty) {
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    console.log(`    ✓ Deleted ${snap.size} user posts`);
  }
}

async function deleteUserEvents(userId: string): Promise<void> {
  const snap = await db
    .collection(EVENTS_COL)
    .where('userId', '==', userId)
    .where('ownerType', '==', 'user')
    .get();
  if (!snap.empty) {
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    console.log(`    ✓ Deleted ${snap.size} user events`);
  }
}

async function deleteUserNews(userId: string): Promise<void> {
  const snap = await db
    .collection(NEWS_COL)
    .where('userId', '==', userId)
    .where('ownerType', '==', 'user')
    .get();
  if (!snap.empty) {
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    console.log(`    ✓ Deleted ${snap.size} user news articles`);
  }
}

async function deleteUserVideos(userId: string): Promise<void> {
  const snap = await db
    .collection(VIDEOS_COL)
    .where('userId', '==', userId)
    .where('ownerType', '==', 'user')
    .get();
  if (!snap.empty) {
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    console.log(`    ✓ Deleted ${snap.size} user videos`);
  }
}

// ─── SEED USER AWARDS & TEAM HISTORY ────────────────────────────────────────────
/**
 * Add awards and team history to user document with sport filtering
 */
async function seedUserAwardsAndHistory(userId: string, sport: string): Promise<void> {
  console.log(`\n  🏆 Seeding user awards and team history for user "${userId}" (${sport})...`);

  const currentYear = new Date().getFullYear();
  const sportLower = sport.toLowerCase();

  const awards = [
    {
      title: 'All-State First Team',
      category: 'Athletic',
      sport: sportLower,
      season: `${currentYear - 1}-${currentYear}`,
      issuer: 'California Coaches Association',
      date: new Date(currentYear, 2, 15).toISOString(), // March 15
    },
    {
      title: 'Team MVP',
      category: 'Athletic',
      sport: sportLower,
      season: `${currentYear - 1}-${currentYear}`,
      issuer: 'Riverside Phoenix High School',
      date: new Date(currentYear, 1, 28).toISOString(), // Feb 28
    },
    {
      title: 'Scholar Athlete Award',
      category: 'Academic',
      // No sport - applies to all sports
      season: `${currentYear - 1}`,
      issuer: 'National Honor Society',
      date: new Date(currentYear, 4, 1).toISOString(), // May 1
    },
  ];

  const teamHistory = [
    {
      name: 'Riverside Phoenix High School',
      type: 'high-school',
      logoUrl: 'https://placehold.co/200x200/1a1a1a/00FF00?text=RPX',
      sport: sportLower,
      location: { city: 'Los Angeles', state: 'California' },
      record: { wins: 18, losses: 4, ties: 0 },
      startDate: new Date(currentYear - 3, 8, 1).toISOString(), // Freshman year
      isCurrent: true,
    },
    {
      name: 'SoCal Elite AAU',
      type: 'aau',
      logoUrl: 'https://placehold.co/200x200/1a1a1a/00FF00?text=AAU',
      sport: sportLower,
      location: { city: 'Los Angeles', state: 'California' },
      record: { wins: 24, losses: 6, ties: 0 },
      startDate: new Date(currentYear - 2, 5, 1).toISOString(),
      endDate: new Date(currentYear - 1, 7, 31).toISOString(),
      isCurrent: false,
    },
  ];

  // Update user document with awards and teamHistory
  await db.collection(USERS_COL).doc(userId).update({
    awards,
    teamHistory,
    updatedAt: new Date().toISOString(),
  });

  console.log(`    ✓ Added ${awards.length} awards and ${teamHistory.length} team history entries`);
}

/**
 * Clear awards and team history from user document
 */
async function clearUserAwardsAndHistory(userId: string): Promise<void> {
  await db.collection(USERS_COL).doc(userId).update({
    awards: [],
    teamHistory: [],
    updatedAt: new Date().toISOString(),
  });
  console.log(`    ✓ Cleared user awards and team history`);
}

// ─── SEED ORGANIZATION ─────────────────────────────────────────────────────────
/**
 * Seed Organizations collection - the top-level entity that owns teams
 * Organizations can have multiple teams (e.g., school with basketball, football, baseball teams)
 */
async function seedOrganization(orgId: string, orgName: string): Promise<void> {
  console.log(`\n  🏢 Seeding organization "${orgName}" (${orgId})...`);

  const orgData = {
    id: orgId,
    name: orgName,
    code: 'RPX', // Riverside Phoenix code
    type: 'school', // 'school' | 'club' | 'aau'
    status: 'active',
    location: {
      city: 'Los Angeles',
      state: 'California',
      country: 'USA',
    },
    admins: REAL_USER_IDS.slice(0, 1), // First real user is admin
    branding: {
      logoUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=200',
      primaryColor: '#DC2626',
      secondaryColor: '#F59E0B',
    },
    billing: {
      plan: 'pro',
      status: 'active',
      seats: 50,
    },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await db.collection(ORGANIZATIONS_COL).doc(orgId).set(orgData);
  console.log(`    ✓ Created organization`);
}

// ─── DELETE ORGANIZATION ───────────────────────────────────────────────────────
async function deleteOrganization(orgId: string): Promise<void> {
  const orgDoc = await db.collection(ORGANIZATIONS_COL).doc(orgId).get();
  if (!orgDoc.exists) {
    console.log(`    ℹ️  Organization ${orgId} not found`);
    return;
  }

  await db.collection(ORGANIZATIONS_COL).doc(orgId).delete();
  console.log(`    ✓ Deleted organization ${orgId}`);
}

// ─── SEED ROSTER ENTRIES ──────────────────────────────────────────────────────
/**
 * Seed RosterEntries collection - the junction table connecting Users to Teams
 * This is CRITICAL for proper user-team relationships with sport-specific data
 */
async function seedRosterEntries(
  teamId: string,
  members: TeamMember[],
  sportName: string
): Promise<void> {
  console.log(`\n  👥 Seeding RosterEntries for team "${teamId}"...`);

  const batch = db.batch();
  const entryIds: string[] = [];
  const now = Timestamp.now();

  for (const member of members) {
    const ref = db.collection(ROSTER_ENTRIES_COL).doc();
    entryIds.push(ref.id);

    // Determine role based on member.role
    let rosterRole: string;
    if (member.role === 'Administrative') {
      rosterRole = 'owner';
    } else if (member.role === 'Coach') {
      rosterRole = member.title?.toLowerCase().includes('head') ? 'head-coach' : 'assistant-coach';
    } else if (member.role === 'Media') {
      rosterRole = 'media';
    } else {
      // Athlete
      rosterRole = 'athlete';
    }

    // ⭐ RosterEntries is a JUNCTION TABLE - keep it minimal!
    // Only store relationship data + team-specific fields
    // User data should be fetched from Users collection via userId
    const rosterEntry = {
      id: ref.id,
      userId: member.id,
      teamId,
      organizationId: 'org_seed_default', // Default org for seed data
      role: rosterRole,
      status: 'active',

      // Team-specific data (valid to store here)
      jerseyNumber: member.jerseyNumber || undefined,
      positions: member.position || [],
      primaryPosition: member.position?.[0] || undefined,

      // Season context
      season: '2024-2025',
      classOfWhenJoined: member.classOf || undefined,

      // Stats (placeholder - actual stats should be computed from games)
      stats:
        member.role === 'Athlete'
          ? {
              gamesPlayed: Math.floor(Math.random() * 15) + 5,
              gamesStarted: Math.floor(Math.random() * 10) + 3,
              points: Math.floor(Math.random() * 200) + 50,
              assists: Math.floor(Math.random() * 80) + 20,
              rebounds: Math.floor(Math.random() * 120) + 40,
            }
          : undefined,

      // Relationship metadata
      joinedAt: now,
      updatedAt: now,
      invitedBy: REAL_USER_IDS[0],
      approvedBy: REAL_USER_IDS[0],
      approvedAt: now,

      // ⚠️ MINIMAL cached user data for UI performance (roster list display)
      // Only cache what's needed for list rendering without joining Users table
      // Full user data should be fetched from Users collection when needed
      displayName: `${member.firstName} ${member.lastName}`,
      profileImg: member.profileImgs?.[0] || undefined,
    };

    // Remove undefined fields (Firestore doesn't allow them)
    const cleanEntry = removeUndefined(rosterEntry);
    batch.set(ref, cleanEntry);
  }

  await batch.commit();
  console.log(
    `    ✓ Seeded ${members.length} roster entries (IDs: ${entryIds.slice(0, 3).join(', ')}...)`
  );
}

// ─── DELETE ROSTER ENTRIES ────────────────────────────────────────────────────
async function deleteRosterEntries(teamId: string): Promise<void> {
  const snap = await db.collection(ROSTER_ENTRIES_COL).where('teamId', '==', teamId).get();
  if (snap.empty) {
    console.log(`    ℹ️  No roster entries found for team ${teamId}`);
    return;
  }
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  console.log(`    ✓ Deleted ${snap.size} roster entries for team ${teamId}`);
}

// ─── SEED FOLLOWERS/FOLLOWING ─────────────────────────────────────────────────
/**
 * Seed follower/following relationships between team members
 * Uses TOP-LEVEL Follows collection (not subcollections!)
 *
 * Architecture:
 * - Collection: Follows (top-level)
 * - Document ID: {followerId}_{followingId}
 * - Fields: followerId, followingId, followerType, followingType, createdAt
 * - Query "who follows X": where('followingId', '==', X)
 * - Query "who X follows": where('followerId', '==', X)
 */
async function seedFollowerRelationships(members: TeamMember[]): Promise<void> {
  console.log(`\n  💫 Seeding follower/following relationships (top-level Follows collection)...`);

  const athletes = members.filter((m) => m.role === 'Athlete');
  const staff = members.filter((m) => m.role !== 'Athlete');
  let followCount = 0;
  const batch = db.batch();

  // Each athlete follows:
  // 1. All coaches/staff (for updates)
  // 2. 3-5 random teammates (for social connection)
  for (const athlete of athletes) {
    // Follow all staff members
    for (const staffMember of staff) {
      const docId = `${athlete.id}_${staffMember.id}`;
      const followRef = db.collection(FOLLOWS_COL).doc(docId);

      batch.set(followRef, {
        id: docId,
        followerId: athlete.id,
        followingId: staffMember.id,
        followerType: 'user',
        followingType: 'user',
        source: 'team_member',
        createdAt: Timestamp.now(),
      });

      followCount++;
    }

    // Follow 3-5 random teammates
    const numTeammatesToFollow = Math.floor(Math.random() * 3) + 3;
    const shuffledAthletes = [...athletes]
      .filter((a) => a.id !== athlete.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, numTeammatesToFollow);

    for (const teammate of shuffledAthletes) {
      const docId = `${athlete.id}_${teammate.id}`;
      const followRef = db.collection(FOLLOWS_COL).doc(docId);

      batch.set(followRef, {
        id: docId,
        followerId: athlete.id,
        followingId: teammate.id,
        followerType: 'user',
        followingType: 'user',
        source: 'team_member',
        createdAt: Timestamp.now(),
      });

      followCount++;
    }
  }

  await batch.commit();
  console.log(`    ✓ Seeded ${followCount} follow relationships (top-level Follows collection)`);
}

// ─── DELETE FOLLOWER RELATIONSHIPS ────────────────────────────────────────────
async function deleteFollowerRelationships(members: TeamMember[]): Promise<void> {
  console.log(
    `\n  🗑️  Deleting follower/following relationships (top-level Follows collection)...`
  );
  let deleteCount = 0;

  // Query Follows collection where followerId OR followingId matches team members
  const memberIds = members.map((m) => m.id);

  for (const memberId of memberIds) {
    // Delete where this user is the follower
    const followingSnap = await db
      .collection(FOLLOWS_COL)
      .where('followerId', '==', memberId)
      .where('source', '==', 'team_member')
      .get();

    if (!followingSnap.empty) {
      const batch = db.batch();
      followingSnap.docs.forEach((doc) => {
        batch.delete(doc.ref);
        deleteCount++;
      });
      await batch.commit();
    }

    // Delete where this user is being followed
    const followersSnap = await db
      .collection(FOLLOWS_COL)
      .where('followingId', '==', memberId)
      .where('source', '==', 'team_member')
      .get();

    if (!followersSnap.empty) {
      const batch = db.batch();
      followersSnap.docs.forEach((doc) => {
        batch.delete(doc.ref);
        deleteCount++;
      });
      await batch.commit();
    }
  }

  console.log(`    ✓ Deleted ${deleteCount} follow relationships (top-level Follows collection)`);
}

// ─── SEED ─────────────────────────────────────────────────────────────────────
async function runSeed(teamId: string | null): Promise<void> {
  console.log(`[seed-team] Seeding team on project="${projectId}"\n`);

  const unicode = await generateUniqueUnicode();
  const teamCode = await generateUniqueTeamCode();
  const teamName = 'Riverside Phoenix';
  const sportName = 'Basketball_mens';
  const slug = buildTeamSlug(teamName);

  const finalTeamId = teamId || `seed_team_${unicode}`;

  console.log(`  Team ID: ${finalTeamId}`);
  console.log(`  Unicode: ${unicode}`);
  console.log(`  Team Code: ${teamCode}`);
  console.log(`  Slug: ${slug}`);
  console.log(`  Route: /team/${slug}\n`);

  const members = await buildMembers();

  const orgId = 'org_riverside_phoenix';
  const orgName = 'Riverside Phoenix High School';

  // ⭐ Seed Organization first (Teams belong to Organizations)
  await seedOrganization(orgId, orgName);

  const teamData = {
    id: finalTeamId,
    organizationId: orgId, // ⭐ Link team to organization
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

  const teamRef = db.collection(TEAMS_COL).doc(finalTeamId);
  await teamRef.set(teamData);

  // Seed RosterEntries (CRITICAL: junction table for user-team relationships)
  await seedRosterEntries(finalTeamId, members, sportName);

  // Seed follower/following relationships between team members
  await seedFollowerRelationships(members);

  // Seed team posts
  await seedTeamPosts(finalTeamId, REAL_USER_IDS[0]);

  // Seed team schedule
  await seedTeamSchedule(finalTeamId);

  // Seed team news articles to News collection
  await seedTeamNews(finalTeamId);

  // Seed user content for first real user (6kjm7AJieFNWYkmTp2HOmYp4r8E3)
  const mainUserId = REAL_USER_IDS[0]; // 6kjm7AJieFNWYkmTp2HOmYp4r8E3
  const mainUserSport = 'Basketball_mens'; // Match team sport
  await seedUserPosts(mainUserId, mainUserSport);
  await seedUserEvents(mainUserId, mainUserSport);
  await seedUserNews(mainUserId, mainUserSport);
  await seedUserVideos(mainUserId, mainUserSport);
  await seedUserAwardsAndHistory(mainUserId, mainUserSport);
  console.log(`     Organization: ${orgName} (${orgId})`);
  console.log(`     Team Name: ${teamName}`);
  console.log(`     Slug: ${slug} (team name only, no unicode)`);
  console.log(`     Members: ${members.length}`);
  console.log(`       - Real users: ${REAL_USER_IDS.join(', ')}`);
  console.log(`       - Athletes: ${teamData.athleteMember}`);
  console.log(`       - Staff: ${teamData.panelMember}`);
  console.log(`     RosterEntries: ${members.length} (junction table - minimal user data cached)`);
  console.log(`     Followers/Following: ~${members.length * 5} relationships`);
  console.log(`     Posts: 7 (team)`);
  console.log(`     Schedule Events: 8 (team)`);
  console.log(`     News Articles: 3 (team, in News collection)`);
  console.log(`     User Content for ${REAL_USER_IDS[0]}:`);
  console.log(`       - Posts: 3 (Basketball_mens)`);
  console.log(`       - Events: 3 (camps, visits, showcases)`);
  console.log(`       - News: 2 (Basketball_mens)`);
  console.log(`       - Videos: 3 (highlights, training, games)`);
  console.log(`       - Awards: 3 (2 Basketball, 1 General)`);
  console.log(`       - Team History: 2 (Basketball teams)`);
  console.log(
    `     User Recruiting: ~12 activities for ${REAL_USER_IDS[1]} (football + basketball)`
  );
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

  // Fetch team to get member IDs for cleanup
  const teamDoc = await db.collection(TEAMS_COL).doc(teamId).get();
  const teamData = teamDoc.data();
  const memberIds = teamData?.memberIds || [];
  const organizationId = teamData?.organizationId || null;

  // Recreate TeamMember objects for follower cleanup
  const members: TeamMember[] = memberIds.map((id: string) => ({
    id,
    firstName: '',
    lastName: '',
    name: '',
    joinTime: '',
    role: 'Athlete' as const,
    isVerify: false,
    email: '',
    phoneNumber: '',
  }));

  // Delete follower/following relationships first
  if (members.length > 0) {
    await deleteFollowerRelationships(members);
  }

  // Delete roster entries
  await deleteRosterEntries(teamId);

  // Delete team document
  const teamRef = db.collection(TEAMS_COL).doc(teamId);
  await teamRef.delete();

  // Delete all posts, schedule events and news articles for this team
  await deleteTeamPosts(teamId);
  await deleteTeamSchedule(teamId);
  await deleteTeamNews(teamId);

  // Delete user content for first real user
  const mainUserId = REAL_USER_IDS[0]; // 6kjm7AJieFNWYkmTp2HOmYp4r8E3
  await deleteUserPosts(mainUserId);
  await deleteUserEvents(mainUserId);
  await deleteUserNews(mainUserId);
  await deleteUserVideos(mainUserId);
  await clearUserAwardsAndHistory(mainUserId);

  // Delete user recruiting activities for second real user
  await deleteUserRecruiting(REAL_USER_IDS[1]); // 05naPoH3KWZftqsdZr7IVwxLHqo2

  // Delete organization (if exists)
  if (organizationId) {
    await deleteOrganization(organizationId);
  }

  console.log(
    `\n✅ Deleted team="${teamId}", organization, all relationships, posts, schedule, news, user content, and user recruiting\n`
  );
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
