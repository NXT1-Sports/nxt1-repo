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
 * - Vietnamese Unicode support
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

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
        phoneNumber: userData.phone || userData.phoneNumber || '+84-90-000-0000',
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
        phoneNumber: '+84-90-000-0000',
      });
      console.log(`    ⚠️  Fallback: User #${i + 1} (user not found)`);
    }
  }

  // Add a few fake members (optional)
  const fakeMembers: TeamMember[] = [
    {
      id: `fake_coach_1`,
      firstName: 'Trần',
      lastName: 'Minh Tuấn',
      name: 'Trần Minh Tuấn',
      joinTime: now,
      role: 'Coach',
      isVerify: true,
      email: 'coach.tuan@ronglua-hanoi.vn',
      phoneNumber: '+84-91-234-5678',
      title: 'Head Coach 🏀',
      profileImg: 'https://i.pravatar.cc/300?img=12', // Random avatar
    },
    {
      id: `fake_athlete_1`,
      firstName: 'Phạm',
      lastName: 'Văn Long',
      name: 'Phạm Văn Long',
      joinTime: now,
      role: 'Athlete',
      isVerify: true,
      email: 'long.pham@student.vn',
      phoneNumber: '+84-93-456-7890',
      position: ['Shooting Guard'],
      classOf: 2027,
      gpa: '3.8',
      jerseyNumber: '23',
      height: `6'3"`,
      weight: '180 lbs',
      profileImg: 'https://i.pravatar.cc/300?img=33',
    },
    {
      id: `fake_athlete_2`,
      firstName: 'Vũ',
      lastName: 'Minh Quân',
      name: 'Vũ Minh Quân',
      joinTime: now,
      role: 'Athlete',
      isVerify: true,
      email: 'quan.vu@student.vn',
      phoneNumber: '+84-95-678-9012',
      position: ['Center'],
      classOf: 2027,
      gpa: '3.5',
      jerseyNumber: '15',
      height: `6'8"`,
      weight: '210 lbs',
      profileImg: 'https://i.pravatar.cc/300?img=52',
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
    if (fake.classOf) userData.classOf = fake.classOf;
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

// ─── SEED ─────────────────────────────────────────────────────────────────────
async function runSeed(teamId: string | null): Promise<void> {
  console.log(`[seed-team] Seeding team on project="${projectId}"\n`);

  const unicode = await generateUniqueUnicode();
  const teamCode = await generateUniqueTeamCode();
  const teamName = 'Đội Bóng Rồng Lửa Hà Nội';
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
    state: 'Hà Nội',
    city: 'Thành phố Hà Nội',
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
    mascot: 'Rồng Lửa 🔥',
    unicode,
    slug,
    division: 'Division I',
    conference: 'Northern Conference',

    // ──────────────────────────────────────────────────────────
    // TEAM DESCRIPTION
    // ──────────────────────────────────────────────────────────
    description: `Đội Bóng Rồng Lửa Hà Nội là một trong những đội bóng rổ trẻ hàng đầu tại Việt Nam, được thành lập năm 2020 với sứ mệnh phát triển tài năng trẻ và đưa bóng rổ Việt Nam vươn tầm quốc tế.
    
Với đội hình trẻ trung, nhiệt huyết và được huấn luyện bài bản bởi đội ngũ HLV giàu kinh nghiệm, Rồng Lửa đã liên tục tạo dấu ấn tại các giải đấu trong nước. Đội bóng không chỉ tập trung vào thành tích mà còn chú trọng phát triển kỹ năng toàn diện, tinh thần đồng đội và đạo đức thể thao cho các vận động viên trẻ.

Thành tích nổi bật: Vô địch Northern Conference 2024-2025, Á quân National Youth Championship 2024, Top 3 Vietnam High School Basketball League 2023-2024.`,

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
        highlights: 'Vô địch Northern Conference, thành tích tốt nhất trong lịch sử đội.',
      },
      {
        season: '2023-2024',
        wins: 15,
        losses: 6,
        ties: 0,
        championships: [],
        highlights: 'Top 3 Vietnam High School Basketball League',
      },
      {
        season: '2022-2023',
        wins: 12,
        losses: 8,
        ties: 0,
        championships: [],
        highlights: 'Mùa giải đầu tiên tham gia Northern Conference',
      },
    ],

    seasonRecord: {
      wins: 18,
      losses: 3,
      ties: 0,
    },
    lastUpdatedStat: new Date().toISOString(),
    socialLinks: {
      website: 'https://ronglua-hanoi.vn',
      facebook: 'https://facebook.com/rongluahanoi',
      instagram: 'https://instagram.com/rongluahanoi',
      twitter: 'https://twitter.com/rongluahanoi',
      youtube: 'https://youtube.com/@rongluahanoi',
    },
    contactInfo: {
      email: 'contact@ronglua-hanoi.vn',
      phone: '+84-24-3943-1234',
      address: '123 Đường Láng, Quận Đống Đa, Hà Nội, Việt Nam',
      website: 'https://ronglua-hanoi.vn',
    },
    teamLinks: {
      newsPageUrl: 'https://ronglua-hanoi.vn/news',
      schedulePageUrl: 'https://ronglua-hanoi.vn/schedule',
      registrationUrl: 'https://ronglua-hanoi.vn/register',
    },
    sponsor: {
      name: 'VietSport 🇻🇳',
      logoImg: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200',
    },
    totalTraffic: 12543,
    analytic: {
      totalProfileView: 8921,
      totalTeamPageTraffic: 12543,
    },
  };

  const teamRef = db.collection(TEAMCODES_COL).doc(finalTeamId);
  await teamRef.set(teamData);

  console.log(`\n✅ Seed complete for team="${finalTeamId}" on project="${projectId}"`);
  console.log('   Seeded:');
  console.log(`     Team Name: ${teamName}`);
  console.log(`     Members: ${members.length}`);
  console.log(`       - Real users: ${REAL_USER_IDS.join(', ')}`);
  console.log(`       - Athletes: ${teamData.athleteMember}`);
  console.log(`       - Staff: ${teamData.panelMember}`);
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

  console.log(`\n✅ Deleted team="${teamId}"\n`);
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
