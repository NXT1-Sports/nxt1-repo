/**
 * @fileoverview Standalone seed script — runs directly against Firebase Admin SDK.
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/seed-user.ts                         # lists users, seeds the first one
 *   npx tsx scripts/seed-user.ts --userId=<uid>          # seeds a specific user
 *   npx tsx scripts/seed-user.ts --userId=<uid> --env=staging  # seed staging project
 *   npx tsx scripts/seed-user.ts --userId=<uid> --delete  # wipe seed data
 *
 * Requires: backend/.env to have FIREBASE_* credentials (and STAGING_FIREBASE_* for --env=staging)
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// ─── Parse CLI args ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name: string) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') ?? null;
const hasFlag = (name: string) => args.includes(`--${name}`);

const targetUserId = getArg('userId');
const useStaging = getArg('env') === 'staging';
const doDelete = hasFlag('delete');

// ─── Firebase init ────────────────────────────────────────────────────────────
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
  console.error('[seed-user] Missing Firebase credentials in .env');
  process.exit(1);
}

const appName = `seed-script-${Date.now()}`;
const app =
  getApps().find((a) => a.name === appName) ??
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, appName);
const db = getFirestore(app);
const auth = getAuth(app);

// ─── Import factories (same ones used by seed.routes.ts) ─────────────────────
// We import from compiled JS (dist/) or directly with tsx at source level
import {
  buildScheduleEvents,
  buildRecruitingActivities,
  buildVerifiedStats,
  buildVerifiedMetrics,
  buildBasketballStats,
  buildBasketballMetrics,
  buildBasketballScheduleEvents,
  buildBasketballRecruitingActivities,
  buildPosts,
  buildNewsArticles,
  buildFollows,
  buildRankings,
  buildScoutReports,
  buildVideos,
  buildDenormalizedSportUpdates,
  buildUserProfileFields,
  buildFootballGameLog,
  buildBasketballGameLog,
} from '../src/utils/seed-factories.js';

import type { SportProfile } from '@nxt1/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const USERS_COL = 'Users';
const PLAYER_STATS_COL = 'PlayerStats'; // top-level: PlayerStats/{userId}_{sportId}_{season}
const POSTS_COL = 'Posts'; // top-level: Posts/{postId}
const NEWS_COL = 'News'; // top-level: News/{articleId}
const SCOUT_COL = 'ScoutReports'; // top-level: ScoutReports/{reportId}
const RANKINGS_COL = 'Rankings'; // top-level: Rankings/{rankingId}
const VIDEOS_COL = 'Videos'; // top-level: Videos/{videoId}
const OFFERS_COL = 'Offers'; // top-level: Offers/{offerId}
const INTERACTIONS_COL = 'Interactions'; // top-level: Interactions/{interactionId}
const FOLLOWS_COL = 'Follows'; // top-level: Follows/{followerId}_{followingId}
type BatchOp = (batch: FirebaseFirestore.WriteBatch) => void;

// Helper to remove undefined values (Firestore rejects them)
function removeUndefined<T extends Record<string, unknown>>(obj: T): T {
  const clean = {} as T;
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key as keyof T] = value as T[keyof T];
    }
  }
  return clean;
}

async function commitBatches(ops: BatchOp[]): Promise<void> {
  const CHUNK = 499;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch();
    ops.slice(i, i + CHUNK).forEach((op) => op(batch));
    await batch.commit();
    console.log(
      `  ✓ Committed batch ${Math.floor(i / CHUNK) + 1} (${Math.min(i + CHUNK, ops.length) - i} ops)`
    );
  }
}

// ─── List users and pick one ──────────────────────────────────────────────────
async function resolveUserId(): Promise<string> {
  if (targetUserId) return targetUserId;

  console.log('\n[seed-user] No --userId supplied. Listing first 10 users from Firebase Auth...\n');
  const listResult = await auth.listUsers(10);
  if (listResult.users.length === 0) {
    console.error(
      '[seed-user] No users found in Firebase Auth. Create a user first or provide --userId=<uid>'
    );
    process.exit(1);
  }

  listResult.users.forEach((u, i) => {
    const display = u.displayName ?? u.email ?? '(no name/email)';
    console.log(`  [${i}] ${u.uid}  ${display}`);
  });

  // Auto-pick the first user and print a hint
  const first = listResult.users[0]!;
  console.log(`\n  → Auto-selecting first user: ${first.uid}`);
  console.log(`     Re-run with --userId=${first.uid} to target a specific user.\n`);
  return first.uid;
}

// ─── SEED ─────────────────────────────────────────────────────────────────────
async function runSeed(userId: string): Promise<void> {
  console.log(`\n[seed-user] Seeding userId="${userId}" on project="${projectId}"\n`);

  const userRef = db.collection(USERS_COL).doc(userId);
  const userDoc = await userRef.get();
  if (!userDoc.exists) {
    console.error(
      `[seed-user] User document not found in Firestore collection "${USERS_COL}" for uid="${userId}"`
    );
    console.error(
      `  (The user might exist in Auth but not yet have a Firestore profile document.)`
    );
    process.exit(1);
  }

  const userData = userDoc.data() as {
    sports?: SportProfile[];
    username?: string;
    unicode?: string;
  };

  const now = new Date().toISOString();

  // ── Build all factory data ───────────────────────────────────────────────
  const scheduleEvents = buildScheduleEvents(userId);
  const recruitingActivities = buildRecruitingActivities(userId);
  const verifiedStats = buildVerifiedStats(userId);
  const verifiedMetrics = buildVerifiedMetrics(userId);
  const bbStats = buildBasketballStats(userId);
  const bbMetrics = buildBasketballMetrics(userId);
  const bbScheduleEvents = buildBasketballScheduleEvents(userId);
  const bbRecruitingActivities = buildBasketballRecruitingActivities(userId);
  const posts = buildPosts(userId);
  const newsArticles = buildNewsArticles(userId);
  const follows = buildFollows(userId);
  const rankings = buildRankings(userId);
  const scoutReports = buildScoutReports(userId);
  const videos = buildVideos(userId);

  const { featuredStats, featuredMetrics } = buildDenormalizedSportUpdates(
    verifiedStats,
    verifiedMetrics,
    scheduleEvents
  );
  const { featuredStats: bbFeaturedStats, featuredMetrics: bbFeaturedMetrics } =
    buildDenormalizedSportUpdates(bbStats, bbMetrics, bbScheduleEvents);

  // ── Profile fields (Overview tab) ────────────────────────────────────────
  const profileFields = buildUserProfileFields(userId);

  // ── Sport merging (by name, not by index) ───────────────────────────────
  const sports: SportProfile[] = userData.sports ?? [];
  const findSport = (name: string) =>
    sports.find((s) => s.sport.toLowerCase() === name.toLowerCase());

  const footballSport: SportProfile = findSport('football') ?? {
    sport: 'football',
    order: sports.length === 0 ? 0 : sports.length,
  };
  const basketballSport: SportProfile = findSport('basketball') ?? {
    sport: 'basketball',
    order: (footballSport.order ?? 0) + 1,
    positions: ['Point Guard'],
  };

  const mergedFootball: SportProfile = {
    ...footballSport,
    // verifiedStats moved to PlayerStats collection
    verifiedMetrics,
    upcomingEvents: scheduleEvents, // ← denormalized for fast profile load
    // recruitingActivities moved to Offers/Interactions collections
    featuredStats, // ← Agent X curated top stats for instant profile load
    featuredMetrics,
    coach: profileFields.coachContact,
    verifiedGameLog: buildFootballGameLog(userId),
  } as SportProfile;

  const mergedBasketball: SportProfile = {
    ...basketballSport,
    // verifiedStats moved to PlayerStats collection
    verifiedMetrics: bbMetrics,
    upcomingEvents: bbScheduleEvents, // ← denormalized for fast profile load
    // recruitingActivities moved to Offers/Interactions collections
    featuredStats: bbFeaturedStats, // ← Agent X curated top stats
    featuredMetrics: bbFeaturedMetrics,
    verifiedGameLog: buildBasketballGameLog(userId),
  } as SportProfile;

  const updatedSports: SportProfile[] = sports
    .map((s) => {
      const name = s.sport.toLowerCase();
      if (name === 'football') return mergedFootball;
      if (name === 'basketball') return mergedBasketball;
      return s;
    })
    .concat(
      findSport('football') ? [] : [mergedFootball],
      findSport('basketball') ? [] : [mergedBasketball]
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // ── Collect batch ops ────────────────────────────────────────────────────
  const ops: BatchOp[] = [];

  // Schedule events — denormalized only (no collection writes)
  // upcomingEvents already embedded in SportProfile above

  // Recruiting — top-level Offers and Interactions collections
  [...recruitingActivities, ...bbRecruitingActivities].forEach((activity) => {
    const sportId = activity.sport === 'football' ? 'football' : 'basketball';
    // Determine if it's an offer or interaction based on category
    if (activity.category === 'offer') {
      const offerDoc = {
        ...activity,
        userId,
        sportId,
        createdAt: now,
        updatedAt: now,
      };
      ops.push((b) => b.set(db.collection(OFFERS_COL).doc(activity.id), offerDoc));
    } else {
      const interactionDoc = {
        ...activity,
        userId,
        sportId,
        createdAt: now,
        updatedAt: now,
      };
      ops.push((b) => b.set(db.collection(INTERACTIONS_COL).doc(activity.id), interactionDoc));
    }
  });

  // Player stats — top-level PlayerStats/{userId}_{sportId}_{season} collection
  // One document per season per sport with ALL stats aggregated in stats[] array.
  const season = '2025-2026';

  // Football stats
  const footballStatsDocId = `${userId}_football_${season}`;
  const footballStatsDoc = {
    id: footballStatsDocId,
    userId,
    sportId: 'football',
    season,
    position: 'QB',
    stats: verifiedStats.map((s) =>
      removeUndefined({
        field: s.field,
        label: s.label,
        value: s.value,
        unit: s.unit,
        category: s.category,
        verified: s.verified,
        verifiedBy: s.verifiedBy,
        dateRecorded: s.dateRecorded,
      })
    ),
    source: 'maxpreps' as const,
    verified: true,
    createdAt: now,
    updatedAt: now,
  };
  ops.push((b) => b.set(db.collection(PLAYER_STATS_COL).doc(footballStatsDocId), footballStatsDoc));

  // Basketball stats
  const basketballStatsDocId = `${userId}_basketball_${season}`;
  const basketballStatsDoc = {
    id: basketballStatsDocId,
    userId,
    sportId: 'basketball',
    season,
    position: 'Point Guard',
    stats: bbStats.map((s) =>
      removeUndefined({
        field: s.field,
        label: s.label,
        value: s.value,
        unit: s.unit,
        category: s.category,
        verified: s.verified,
        verifiedBy: s.verifiedBy,
        dateRecorded: s.dateRecorded,
      })
    ),
    source: 'manual' as const,
    verified: false,
    createdAt: now,
    updatedAt: now,
  };
  ops.push((b) =>
    b.set(db.collection(PLAYER_STATS_COL).doc(basketballStatsDocId), basketballStatsDoc)
  );

  // Timeline posts — top-level Posts/{postId}
  posts.forEach((post, i) => {
    const docId = `seed_${userId}_post_${i}`;
    const createdAtIso = (post.createdAt as unknown as { toDate(): Date }).toDate().toISOString();
    const doc: Record<string, unknown> = {
      id: docId,
      userId: post.userId,
      sport: post.sport,
      sportId: post.sportId,
      content: post.content,
      type: post.type,
      isPinned: post.isPinned,
      images: post.images,
      hashtags: post.hashtags,
      createdAt: createdAtIso,
      updatedAt: createdAtIso,
      stats: post.stats,
    };
    if (post.title !== undefined) doc['title'] = post.title;
    if (post.mediaUrl !== undefined) doc['mediaUrl'] = post.mediaUrl;
    if (post.thumbnailUrl !== undefined) doc['thumbnailUrl'] = post.thumbnailUrl;
    if (post.duration !== undefined) doc['duration'] = post.duration;
    ops.push((b) => b.set(db.collection(POSTS_COL).doc(docId), doc));
  });

  // News articles — top-level News/{articleId}
  newsArticles.forEach((a) =>
    ops.push((b) => b.set(db.collection(NEWS_COL).doc((a as { id: string }).id), a))
  );

  // Follows — top-level Follows/{followerId}_{followingId}
  follows.forEach((follow) => {
    const followDocId = `${follow.followerId}_${follow.followingId}`;
    const followDoc = {
      id: followDocId,
      followerId: follow.followerId,
      followingId: follow.followingId,
      createdAt: follow.createdAt,
      updatedAt: now,
    };
    ops.push((b) => b.set(db.collection(FOLLOWS_COL).doc(followDocId), followDoc));
  });

  // Rankings — top-level Rankings/{rankingId}
  rankings.forEach((r) => ops.push((b) => b.set(db.collection(RANKINGS_COL).doc(r.id), r)));
  // Scout reports — top-level ScoutReports/{reportId}
  scoutReports.forEach((r) =>
    ops.push((b) => b.set(db.collection(SCOUT_COL).doc((r as { id: string }).id), r))
  );

  // Videos — top-level Videos/{videoId}
  videos.forEach((video) => {
    const videoDoc = {
      ...(video as Record<string, unknown>),
      userId,
      createdAt: now,
      updatedAt: now,
    };
    ops.push((b) => b.set(db.collection(VIDEOS_COL).doc((video as { id: string }).id), videoDoc));
  });

  // User doc update
  const followersCount = follows.filter((f) => f.followingId === userId).length;
  const followingCount = follows.filter((f) => f.followerId === userId).length;
  // Only write basicProfile fields if the user hasn't set them yet
  const existingFirstName = (userData as Record<string, unknown>)['firstName'] as
    | string
    | undefined;
  const basicProfileUpdate = !existingFirstName
    ? {
        firstName: profileFields.basicProfile.firstName,
        lastName: profileFields.basicProfile.lastName,
        displayName: profileFields.basicProfile.displayName,
        classOf: profileFields.basicProfile.classOf,
        location: profileFields.basicProfile.location,
        height: profileFields.basicProfile.height,
        weight: profileFields.basicProfile.weight,
        verificationStatus: profileFields.basicProfile.verificationStatus,
      }
    : {};

  ops.push((b) =>
    b.update(userRef, {
      ...basicProfileUpdate,
      sports: updatedSports,
      '_counters.followersCount': followersCount,
      '_counters.followingCount': followingCount,
      '_counters.postsCount': posts.length,
      // Overview tab fields
      teamHistory: profileFields.teamHistory,
      awards: profileFields.awards,
      contact: profileFields.contact,
      'athlete.academics.gpa': profileFields.academics.gpa,
      'athlete.academics.satScore': profileFields.academics.satScore,
      'athlete.academics.actScore': profileFields.academics.actScore,
      'athlete.academics.intendedMajor': profileFields.academics.intendedMajor,
      updatedAt: now,
    })
  );

  await commitBatches(ops);

  console.log(`\n✅ Seed complete for userId="${userId}" on project="${projectId}"`);
  console.log('   Seeded:');
  console.log(
    `     Football  — stats:${verifiedStats.length}  metrics:${verifiedMetrics.length}  schedule:${scheduleEvents.length}  recruiting:${recruitingActivities.length}`
  );
  console.log(
    `     Basketball— stats:${bbStats.length}  metrics:${bbMetrics.length}  schedule:${bbScheduleEvents.length}  recruiting:${bbRecruitingActivities.length}`
  );
  console.log(
    `     posts:${posts.length}  news:${newsArticles.length}  videos:${videos.length}  follows:${follows.length}  rankings:${rankings.length}  scoutReports:${scoutReports.length}`
  );
  console.log(
    `     teamHistory:${profileFields.teamHistory.length}  awards:${profileFields.awards.length}  contact:✓  academics:✓  coach:✓`
  );
  console.log(`\n   To DELETE this seed data later:`);
  console.log(`   npx tsx scripts/seed-user.ts --userId=${userId} --delete`);
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
async function runDelete(userId: string): Promise<void> {
  console.log(
    `\n[seed-user] Deleting seed data for userId="${userId}" on project="${projectId}"\n`
  );

  const userRef = db.collection(USERS_COL).doc(userId);
  const ops: BatchOp[] = [];

  async function collectByPrefix(col: FirebaseFirestore.CollectionReference, prefix: string) {
    const snap = await col
      .where('id', '>=', prefix)
      .where('id', '<', prefix + '\uffff')
      .get();
    snap.docs.forEach((d) => ops.push((b) => b.delete(d.ref)));
    return snap.size;
  }

  const prefix = `seed_${userId}`;

  // Delete PlayerStats documents (aggregated stats by season)
  const season = '2025-2026';
  const playerStatsIds = [`${userId}_football_${season}`, `${userId}_basketball_${season}`];
  for (const docId of playerStatsIds) {
    const ref = db.collection(PLAYER_STATS_COL).doc(docId);
    ops.push((b) => b.delete(ref));
  }

  // Top-level collections — query by userId and seed prefix
  async function collectTopLevel(colName: string): Promise<number> {
    const snap = await db.collection(colName).where('userId', '==', userId).get();
    const seedDocs = snap.docs.filter((d) => d.id.startsWith(prefix));
    seedDocs.forEach((d) => ops.push((b) => b.delete(d.ref)));
    return seedDocs.length;
  }

  const topLevelCounts = await Promise.all([
    collectTopLevel(POSTS_COL),
    collectTopLevel(NEWS_COL),
    collectTopLevel(SCOUT_COL),
    collectTopLevel(RANKINGS_COL),
    collectTopLevel(VIDEOS_COL),
    collectTopLevel(OFFERS_COL),
    collectTopLevel(INTERACTIONS_COL),
  ]);

  // Follows — delete where followerId or followingId matches userId
  const followerSnap = await db.collection(FOLLOWS_COL).where('followerId', '==', userId).get();
  followerSnap.docs.forEach((d) => ops.push((b) => b.delete(d.ref)));
  const followingSnap = await db.collection(FOLLOWS_COL).where('followingId', '==', userId).get();
  followingSnap.docs.forEach((d) => ops.push((b) => b.delete(d.ref)));
  const followsCount = followerSnap.size + followingSnap.size;

  const totalDeleted = topLevelCounts.reduce((a, b) => a + b, 0) + 2 + followsCount; // +2 for PlayerStats

  // Strip embedded fields from User doc sports array + clean profile fields
  const userDoc = await userRef.get();
  if (userDoc.exists) {
    const uData = userDoc.data() as { sports?: Record<string, unknown>[] };
    const sportFieldsToRemove = [
      'verifiedStats',
      'verifiedMetrics',
      'recruitingActivities',
      'featuredStats',
      'featuredMetrics',
      'upcomingEvents',
      'upcomingEventsPreview',
      'coach',
    ];
    const cleanedSports = (uData?.sports ?? []).map((sp) => {
      const clean = { ...sp };
      sportFieldsToRemove.forEach((f) => delete clean[f]);
      return clean;
    });
    ops.push((b) =>
      b.update(userRef, {
        sports: cleanedSports,
        teamHistory: [],
        awards: [],
        contact: {},
        'athlete.academics': {},
      })
    );
  }

  await commitBatches(ops);
  console.log(`\n✅ Deleted ${totalDeleted} docs + cleared User doc sports fields.`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const userId = await resolveUserId();
    if (doDelete) {
      await runDelete(userId);
    } else {
      await runSeed(userId);
    }
    process.exit(0);
  } catch (err) {
    console.error('[seed-user] ERROR:', err);
    process.exit(1);
  }
})();
