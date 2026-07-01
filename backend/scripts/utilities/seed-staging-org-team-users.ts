import type { App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { initTargetApp, getTarget } from '../migration/migration-utils.js';

type SeedRole = 'director' | 'coach' | 'athlete';

type SeedUser = {
  uid: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: SeedRole;
  displayName?: string;
  unicode?: string;
  classOf?: number;
  aboutMe?: string;
  profileImgs?: string[];
  height?: string;
  weight?: string;
  gpa?: number;
  jerseyNumber?: number;
  positions?: string[];
  location?: { city: string; state: string };
  connectedSources?: Array<{ platform: string; profileUrl: string; displayOrder?: number }>;
  measurables?: Array<{
    id: string;
    field: string;
    label: string;
    value: string | number;
    unit?: string;
    category?: string;
    source: string;
    verified: boolean;
    verifiedBy?: string;
    dateRecorded?: string;
  }>;
};

const ORG_ID = 'org_TImtZtIIJRl2bQuxm0Hn';
const TEAM_ID = 'team_seed_timtztii_main';
const TEAM_CODE = 'NXTSEED1';
const TEAM_SLUG = 'nxt1-seed-main';
const ORG_WALLET_ID = `org:${ORG_ID}`;
const BILLING_PREP_ID = `org:${ORG_ID}`;
const PERIOD_KEY = new Date().toISOString().slice(0, 7);
const PERIOD_LEDGER_ID = `${ORG_WALLET_ID}:${PERIOD_KEY}`;
const ORG_WALLET_BALANCE_CENTS = 50_000_000;
const ORG_MONTHLY_BUDGET_CENTS = 10_000_000;

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)).filter((item) => item !== undefined) as T;
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (nestedValue === undefined) continue;
      const cleaned = stripUndefined(nestedValue);
      if (cleaned !== undefined) result[key] = cleaned;
    }
    return result as T;
  }

  return value;
}

const NOW_ISO = new Date().toISOString();

const seedUsers: SeedUser[] = [
  {
    uid: 'seed_director_01',
    email: 'seed.director.01+nxt1@nxt1sports.com',
    password: 'Nxt1Seed!2026A',
    firstName: 'Derek',
    lastName: 'Director',
    role: 'director',
    displayName: 'Derek Director',
    unicode: 'NXTDIR01',
    aboutMe:
      'Program director who oversees scheduling, team structure, and staff operations for the seed org.',
    profileImgs: ['https://placehold.co/400x400/png?text=Derek'],
    location: { city: 'Los Angeles', state: 'CA' },
    connectedSources: [
      {
        platform: 'linkedin',
        profileUrl: 'https://www.linkedin.com/in/derek-director',
        displayOrder: 0,
      },
      { platform: 'twitter', profileUrl: 'https://x.com/nxt1seeddirector', displayOrder: 1 },
    ],
  },
  {
    uid: 'seed_director_02',
    email: 'seed.director.02+nxt1@nxt1sports.com',
    password: 'Nxt1Seed!2026B',
    firstName: 'Dana',
    lastName: 'Director',
    role: 'director',
    displayName: 'Dana Director',
    unicode: 'NXTDIR02',
    aboutMe: 'Assistant director handling approvals, team admin tasks, and billing oversight.',
    profileImgs: ['https://placehold.co/400x400/png?text=Dana'],
    location: { city: 'Los Angeles', state: 'CA' },
    connectedSources: [
      {
        platform: 'linkedin',
        profileUrl: 'https://www.linkedin.com/in/dana-director',
        displayOrder: 0,
      },
    ],
  },
  {
    uid: 'seed_coach_01',
    email: 'seed.coach.01+nxt1@nxt1sports.com',
    password: 'Nxt1Seed!2026C',
    firstName: 'Chris',
    lastName: 'Coach',
    role: 'coach',
    displayName: 'Chris Coach',
    unicode: 'NXTCOA01',
    aboutMe: 'Offensive coach focused on play design, film review, and recruiting communication.',
    profileImgs: ['https://placehold.co/400x400/png?text=Chris'],
    location: { city: 'Los Angeles', state: 'CA' },
    connectedSources: [
      { platform: 'hudl', profileUrl: 'https://hudl.com/profile/chris-coach', displayOrder: 0 },
      { platform: 'twitter', profileUrl: 'https://x.com/nxt1coachchris', displayOrder: 1 },
    ],
  },
  {
    uid: 'seed_coach_02',
    email: 'seed.coach.02+nxt1@nxt1sports.com',
    password: 'Nxt1Seed!2026D',
    firstName: 'Casey',
    lastName: 'Coach',
    role: 'coach',
    displayName: 'Casey Coach',
    unicode: 'NXTCOA02',
    aboutMe:
      'Defensive coach with an eye for athlete development, depth charts, and communication.',
    profileImgs: ['https://placehold.co/400x400/png?text=Casey'],
    location: { city: 'Los Angeles', state: 'CA' },
    connectedSources: [
      { platform: 'hudl', profileUrl: 'https://hudl.com/profile/casey-coach', displayOrder: 0 },
    ],
  },
  {
    uid: 'seed_athlete_01',
    email: 'seed.athlete.01+nxt1@nxt1sports.com',
    password: 'Nxt1Seed!2026E',
    firstName: 'Alex',
    lastName: 'Athlete',
    role: 'athlete',
    displayName: 'Alex Athlete',
    unicode: 'NXTATH01',
    classOf: 2027,
    aboutMe:
      'Dual-threat quarterback with quick processing, a live arm, and a clean recruiting profile.',
    profileImgs: ['https://placehold.co/400x400/png?text=Alex+1'],
    height: '6\'1"',
    weight: '198',
    gpa: 3.7,
    jerseyNumber: 1,
    positions: ['QB'],
    location: { city: 'Los Angeles', state: 'CA' },
    connectedSources: [
      { platform: 'hudl', profileUrl: 'https://hudl.com/profile/alex-athlete-01', displayOrder: 0 },
      {
        platform: 'maxpreps',
        profileUrl: 'https://www.maxpreps.com/athlete/alex-athlete-01',
        displayOrder: 1,
      },
      { platform: 'instagram', profileUrl: 'https://instagram.com/nxt1alex01', displayOrder: 2 },
    ],
    measurables: [
      {
        id: 'forty_01',
        field: '40_yard_dash',
        label: '40-Yard Dash',
        value: 4.62,
        unit: 's',
        category: 'speed',
        source: 'manual',
        verified: true,
        verifiedBy: 'Seed Combine Day',
        dateRecorded: NOW_ISO,
      },
      {
        id: 'bench_01',
        field: 'bench_press',
        label: 'Bench Press',
        value: 215,
        unit: 'lbs',
        category: 'strength',
        source: 'manual',
        verified: true,
        verifiedBy: 'Seed Combine Day',
        dateRecorded: NOW_ISO,
      },
      {
        id: 'vertical_01',
        field: 'vertical_jump',
        label: 'Vertical Jump',
        value: 34.5,
        unit: 'in',
        category: 'athleticism',
        source: 'manual',
        verified: true,
        verifiedBy: 'Seed Combine Day',
        dateRecorded: NOW_ISO,
      },
    ],
  },
  {
    uid: 'seed_athlete_02',
    email: 'seed.athlete.02+nxt1@nxt1sports.com',
    password: 'Nxt1Seed!2026F',
    firstName: 'Avery',
    lastName: 'Athlete',
    role: 'athlete',
    displayName: 'Avery Athlete',
    unicode: 'NXTATH02',
    classOf: 2027,
    aboutMe: 'Explosive receiver with strong route detail and reliable hands.',
    profileImgs: ['https://placehold.co/400x400/png?text=Avery+2'],
    height: '6\'0"',
    weight: '182',
    gpa: 3.9,
    jerseyNumber: 2,
    positions: ['WR'],
    location: { city: 'Los Angeles', state: 'CA' },
    connectedSources: [
      {
        platform: 'hudl',
        profileUrl: 'https://hudl.com/profile/avery-athlete-02',
        displayOrder: 0,
      },
      {
        platform: 'maxpreps',
        profileUrl: 'https://www.maxpreps.com/athlete/avery-athlete-02',
        displayOrder: 1,
      },
    ],
    measurables: [
      {
        id: 'forty_02',
        field: '40_yard_dash',
        label: '40-Yard Dash',
        value: 4.48,
        unit: 's',
        category: 'speed',
        source: 'manual',
        verified: true,
        verifiedBy: 'Seed Combine Day',
        dateRecorded: NOW_ISO,
      },
      {
        id: 'vertical_02',
        field: 'vertical_jump',
        label: 'Vertical Jump',
        value: 37.0,
        unit: 'in',
        category: 'athleticism',
        source: 'manual',
        verified: true,
        verifiedBy: 'Seed Combine Day',
        dateRecorded: NOW_ISO,
      },
    ],
  },
  {
    uid: 'seed_athlete_03',
    email: 'seed.athlete.03+nxt1@nxt1sports.com',
    password: 'Nxt1Seed!2026G',
    firstName: 'Jordan',
    lastName: 'Athlete',
    role: 'athlete',
    displayName: 'Jordan Athlete',
    unicode: 'NXTATH03',
    classOf: 2028,
    aboutMe: 'One-cut running back with burst, contact balance, and high upside.',
    profileImgs: ['https://placehold.co/400x400/png?text=Jordan+3'],
    height: '5\'11"',
    weight: '195',
    gpa: 3.5,
    jerseyNumber: 11,
    positions: ['RB'],
    location: { city: 'Los Angeles', state: 'CA' },
    connectedSources: [
      {
        platform: 'hudl',
        profileUrl: 'https://hudl.com/profile/jordan-athlete-03',
        displayOrder: 0,
      },
    ],
    measurables: [
      {
        id: 'forty_03',
        field: '40_yard_dash',
        label: '40-Yard Dash',
        value: 4.57,
        unit: 's',
        category: 'speed',
        source: 'manual',
        verified: true,
        verifiedBy: 'Seed Combine Day',
        dateRecorded: NOW_ISO,
      },
      {
        id: 'broad_03',
        field: 'broad_jump',
        label: 'Broad Jump',
        value: 9.8,
        unit: 'ft',
        category: 'athleticism',
        source: 'manual',
        verified: true,
        verifiedBy: 'Seed Combine Day',
        dateRecorded: NOW_ISO,
      },
    ],
  },
  {
    uid: 'seed_athlete_04',
    email: 'seed.athlete.04+nxt1@nxt1sports.com',
    password: 'Nxt1Seed!2026H',
    firstName: 'Taylor',
    lastName: 'Athlete',
    role: 'athlete',
    displayName: 'Taylor Athlete',
    unicode: 'NXTATH04',
    classOf: 2028,
    aboutMe: 'Long, physical defensive back who can play press or off coverage.',
    profileImgs: ['https://placehold.co/400x400/png?text=Taylor+4'],
    height: '6\'0"',
    weight: '175',
    gpa: 3.8,
    jerseyNumber: 21,
    positions: ['CB'],
    location: { city: 'Los Angeles', state: 'CA' },
    connectedSources: [
      {
        platform: 'hudl',
        profileUrl: 'https://hudl.com/profile/taylor-athlete-04',
        displayOrder: 0,
      },
      { platform: 'instagram', profileUrl: 'https://instagram.com/nxt1taylor04', displayOrder: 1 },
    ],
    measurables: [
      {
        id: 'forty_04',
        field: '40_yard_dash',
        label: '40-Yard Dash',
        value: 4.55,
        unit: 's',
        category: 'speed',
        source: 'manual',
        verified: true,
        verifiedBy: 'Seed Combine Day',
        dateRecorded: NOW_ISO,
      },
      {
        id: 'shuttle_04',
        field: 'pro_agility',
        label: 'Pro Agility',
        value: 4.1,
        unit: 's',
        category: 'agility',
        source: 'manual',
        verified: true,
        verifiedBy: 'Seed Combine Day',
        dateRecorded: NOW_ISO,
      },
    ],
  },
];

function orgAdmins(users: SeedUser[]) {
  return users
    .filter((u) => u.role === 'director' || u.role === 'coach')
    .map((u) => ({
      userId: u.uid,
      role: u.role,
      addedAt: NOW_ISO,
    }));
}

async function upsertAuthUser(app: App, uid: string, email: string, password: string) {
  const auth = getAuth(app);

  try {
    await auth.getUser(uid);
    await auth.updateUser(uid, { email, password, emailVerified: true, disabled: false });
    return;
  } catch {
    // no-op
  }

  await auth.createUser({
    uid,
    email,
    password,
    emailVerified: true,
    disabled: false,
  });
}

async function main() {
  if (getTarget() !== 'staging') {
    throw new Error('This script is staging-only. Run with --target=staging');
  }

  const { app, db } = initTargetApp();

  const directorOwner = seedUsers.find((u) => u.role === 'director');
  if (!directorOwner) {
    throw new Error('No director user defined');
  }

  await db
    .collection('Organizations')
    .doc(ORG_ID)
    .set(
      stripUndefined({
        name: 'NXT1 Seed Organization',
        type: 'organization',
        status: 'active',
        level: 'organization',
        logoUrl: 'https://placehold.co/512x512/png?text=NXT1+Seed',
        primaryColor: '#0f172a',
        secondaryColor: '#f97316',
        mascot: 'Falcons',
        location: {
          city: 'Los Angeles',
          state: 'CA',
          country: 'US',
        },
        ownerId: directorOwner.uid,
        admins: orgAdmins(seedUsers),
        teamCount: 1,
        isClaimed: true,
        source: 'admin',
        createdBy: 'seed-script',
        billingOwnerUid: directorOwner.uid,
        billing: {
          customerId: 'cus_seed_nxt1_org',
          email: 'billing@nxt1sports.com',
          hasPaymentMethod: true,
          nextBillingDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
        },
        trial: {
          isActive: true,
          startDate: NOW_ISO,
          endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString(),
        },
        settings: {
          publicTeamPages: true,
          requireAthleteApproval: true,
          customDomain: 'seed.nxt1sports.com',
        },
        updatedAt: NOW_ISO,
        createdAt: NOW_ISO,
      }),
      { merge: true }
    );

  await db
    .collection('Wallets')
    .doc(ORG_WALLET_ID)
    .set(
      stripUndefined({
        id: ORG_WALLET_ID,
        ownerId: ORG_ID,
        ownerType: 'organization',
        balanceCents: ORG_WALLET_BALANCE_CENTS,
        pendingHoldsCents: 0,
        creditsAlertBaselineCents: ORG_WALLET_BALANCE_CENTS,
        creditsNotified80: false,
        creditsNotified50: false,
        creditsNotified25: false,
        iapLowBalanceNotified: false,
        totalReferralRewardsCents: 0,
        schemaVersion: 1,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      }),
      { merge: true }
    );

  await db
    .collection('BillingPreferences')
    .doc(BILLING_PREP_ID)
    .set(
      stripUndefined({
        id: BILLING_PREP_ID,
        ownerId: ORG_ID,
        ownerType: 'organization',
        paymentProvider: 'stripe',
        billingOwnerUid: directorOwner.uid,
        budgetName: 'NXT1 Seed Org Budget',
        budgetAlertsEnabled: true,
        budgetInterval: 'monthly',
        hardStop: false,
        autoTopUpEnabled: false,
        autoTopUpThresholdCents: 0,
        autoTopUpAmountCents: 0,
        autoTopUpInProgress: false,
        schemaVersion: 1,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      }),
      { merge: true }
    );

  await db
    .collection('PeriodLedgers')
    .doc(PERIOD_LEDGER_ID)
    .set(
      stripUndefined({
        id: PERIOD_LEDGER_ID,
        ownerId: ORG_ID,
        ownerType: 'organization',
        periodKey: PERIOD_KEY,
        periodStart: `${PERIOD_KEY}-01`,
        periodEnd: `${PERIOD_KEY}-28`,
        monthlyBudget: ORG_MONTHLY_BUDGET_CENTS,
        currentPeriodSpend: 0,
        notified50: false,
        notified80: false,
        notified100: false,
        schemaVersion: 1,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      }),
      { merge: true }
    );

  await db
    .collection('Teams')
    .doc(TEAM_ID)
    .set(
      stripUndefined({
        id: TEAM_ID,
        teamCode: TEAM_CODE,
        teamName: 'NXT1 Seed Team',
        teamType: 'high-school',
        sport: 'Football',
        slug: TEAM_SLUG,
        organizationId: ORG_ID,
        ownerId: directorOwner.uid,
        status: 'active',
        isActive: true,
        athleteMember: seedUsers.filter((u) => u.role === 'athlete').length,
        panelMember: seedUsers.filter((u) => u.role !== 'athlete').length,
        memberIds: seedUsers.map((user) => user.uid),
        state: 'CA',
        city: 'Los Angeles',
        level: 'Varsity',
        division: 'Division 1',
        conference: 'NXT1 Seed Conference',
        unicode: '902718',
        description:
          'A fully wired seed program for testing Agent X, team pages, recruiting workflows, and admin flows.',
        logoUrl: 'https://placehold.co/512x512/png?text=NXT1+Team',
        teamLogoImg: 'https://placehold.co/512x512/png?text=NXT1+Team',
        primaryColor: '#0f172a',
        secondaryColor: '#f97316',
        mascot: 'Falcons',
        customUrl: 'nxt1-seed-team',
        teamLinks: {
          newsPageUrl: 'https://www.nxt1sports.com/teams/nxt1-seed-team/news',
          schedulePageUrl: 'https://www.nxt1sports.com/teams/nxt1-seed-team/schedule',
          registrationUrl: 'https://www.nxt1sports.com/teams/nxt1-seed-team/join',
        },
        contactInfo: {
          email: 'coaches@nxt1sports.com',
          phoneNumber: '(310) 555-0198',
          address: '1234 NXT1 Way, Los Angeles, CA 90001',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90001',
          fieldLocation: 'NXT1 Seed Stadium',
        },
        socialLinks: {
          twitter: 'https://x.com/nxt1seedteam',
          instagram: 'https://instagram.com/nxt1seedteam',
          youtube: 'https://youtube.com/@nxt1seedteam',
          hudl: 'https://hudl.com/team/nxt1seedteam',
          maxPreps: 'https://www.maxpreps.com/team/nxt1seed-team',
        },
        connectedSources: [
          {
            platform: 'hudl',
            profileUrl: 'https://hudl.com/team/nxt1seedteam',
            connected: true,
            syncStatus: 'success',
            scopeType: 'team',
            scopeId: TEAM_ID,
            displayOrder: 0,
          },
          {
            platform: 'maxpreps',
            profileUrl: 'https://www.maxpreps.com/team/nxt1-seed-team',
            connected: true,
            syncStatus: 'success',
            scopeType: 'team',
            scopeId: TEAM_ID,
            displayOrder: 1,
          },
          {
            platform: 'instagram',
            profileUrl: 'https://instagram.com/nxt1seedteam',
            connected: true,
            syncStatus: 'success',
            scopeType: 'team',
            scopeId: TEAM_ID,
            displayOrder: 2,
          },
        ],
        sponsor: {
          name: 'NXT1 Athletic Partners',
          logoImg: 'https://placehold.co/320x120/png?text=Sponsor',
        },
        galleryImages: [
          'https://placehold.co/1280x720/png?text=Game+1',
          'https://placehold.co/1280x720/png?text=Team+Huddle',
          'https://placehold.co/1280x720/png?text=Friday+Night',
        ],
        seasonRecord: {
          wins: 8,
          losses: 2,
          ties: 0,
        },
        seasonHistory: [
          {
            season: '2025',
            wins: 8,
            losses: 2,
            formatted: '8-2',
            highlights: 'District runner-up; strong recruiting visibility across the roster.',
            conference: 'NXT1 Seed Conference',
            division: 'Division 1',
          },
        ],
        recruitingActivities: [
          {
            id: 'recruiting-team-seed-01',
            title: 'Spring recruiting update',
            sportId: 'football',
            category: 'interest',
            source: 'manual',
            verified: true,
            createdAt: NOW_ISO,
          },
        ],
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      }),
      { merge: true }
    );

  for (const user of seedUsers) {
    await upsertAuthUser(app, user.uid, user.email, user.password);

    await db
      .collection('Users')
      .doc(user.uid)
      .set(
        stripUndefined({
          uid: user.uid,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: user.displayName ?? `${user.firstName} ${user.lastName}`,
          aboutMe: user.aboutMe,
          unicode: user.unicode,
          profileCode: user.unicode,
          profileImgs: user.profileImgs,
          location: user.location,
          role: user.role,
          status: 'active',
          isActive: true,
          organizationId: ORG_ID,
          teamId: TEAM_ID,
          teamCode: TEAM_CODE,
          primarySport: 'Football',
          sport: 'Football',
          ...(typeof user.classOf === 'number' ? { classOf: user.classOf } : {}),
          ...(typeof user.gpa === 'number' ? { gpa: user.gpa } : {}),
          ...(typeof user.height === 'string' ? { height: user.height } : {}),
          ...(typeof user.weight === 'string' ? { weight: user.weight } : {}),
          contact: {
            email: user.email,
            phone: user.role === 'athlete' ? '(310) 555-01' + user.uid.slice(-2) : undefined,
          },
          academics:
            user.role === 'athlete'
              ? {
                  gpa: user.gpa,
                  weightedGpa: user.gpa ? Number((user.gpa + 0.25).toFixed(2)) : undefined,
                  classRank: user.role === 'athlete' ? 12 : undefined,
                  graduationYear: user.classOf,
                }
              : undefined,
          measurables: user.measurables,
          connectedSources: user.connectedSources?.map((source) => ({
            ...source,
            connected: true,
            syncStatus: 'success' as const,
            lastSyncedAt: NOW_ISO,
          })),
          teamHistory: [
            {
              teamId: TEAM_ID,
              teamName: 'NXT1 Seed Team',
              organizationId: ORG_ID,
              sport: 'Football',
              startDate: NOW_ISO,
              status: 'active',
            },
          ],
          createdAt: NOW_ISO,
          updatedAt: NOW_ISO,
        }),
        { merge: true }
      );

    await db
      .collection('RosterEntries')
      .doc(`${user.uid}_${TEAM_ID}`)
      .set(
        stripUndefined({
          userId: user.uid,
          teamId: TEAM_ID,
          organizationId: ORG_ID,
          role: user.role,
          status: 'active',
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: user.displayName ?? `${user.firstName} ${user.lastName}`,
          unicode: user.unicode,
          profileCode: user.unicode,
          email: user.email,
          joinedAt: NOW_ISO,
          updatedAt: NOW_ISO,
          sport: 'Football',
          season: '2026',
          rating: user.role === 'athlete' ? 86 : 98,
          title:
            user.role === 'director'
              ? 'Program Director'
              : user.role === 'coach'
                ? 'Coach'
                : undefined,
          coachNotes:
            user.role === 'athlete'
              ? 'High-upside seed athlete for testing recruiting, profile, and film workflows.'
              : 'Seed staff account for program administration and testing.',
          ...(typeof user.jerseyNumber === 'number' ? { jerseyNumber: user.jerseyNumber } : {}),
          ...(Array.isArray(user.positions) ? { positions: user.positions } : {}),
          ...(typeof user.classOf === 'number' ? { classOf: user.classOf } : {}),
          ...(typeof user.gpa === 'number' ? { gpa: user.gpa } : {}),
          ...(typeof user.height === 'string' ? { height: user.height } : {}),
          ...(typeof user.weight === 'string' ? { weight: user.weight } : {}),
          ...(user.role === 'athlete'
            ? {
                stats: {
                  gamesPlayed: 0,
                  gamesStarted: 0,
                },
              }
            : {}),
        }),
        { merge: true }
      );
  }

  console.log('Seed complete.');
  console.log(`Organization: ${ORG_ID}`);
  console.log(`Team: ${TEAM_ID} (${TEAM_CODE})`);
  console.log('Users:');
  for (const user of seedUsers) {
    console.log(`- ${user.role}: ${user.email} | uid=${user.uid} | password=${user.password}`);
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
