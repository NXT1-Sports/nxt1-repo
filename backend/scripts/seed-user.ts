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
const POSTS_COL = 'Posts'; // top-level: Posts/{postId}
const NEWS_COL = 'News'; // top-level: News/{articleId}
const SCOUT_COL = 'ScoutReports'; // top-level: ScoutReports/{reportId}
const RANKINGS_COL = 'Rankings'; // top-level: Rankings/{rankingId}
type BatchOp = (batch: FirebaseFirestore.WriteBatch) => void;

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
    accountType: 'athlete',
  };
  const basketballSport: SportProfile = findSport('basketball') ?? {
    sport: 'basketball',
    order: (footballSport.order ?? 0) + 1,
    accountType: 'athlete',
    positions: ['Point Guard'],
  };

  const mergedFootball: SportProfile = {
    ...footballSport,
    verifiedStats,
    verifiedMetrics,
    upcomingEvents: scheduleEvents,
    recruitingActivities,
    featuredStats,
    featuredMetrics,
    coach: profileFields.coachContact,
    verifiedGameLog: buildFootballGameLog(userId),
  } as SportProfile;

  const mergedBasketball: SportProfile = {
    ...basketballSport,
    verifiedStats: bbStats,
    verifiedMetrics: bbMetrics,
    upcomingEvents: bbScheduleEvents,
    recruitingActivities: bbRecruitingActivities,
    featuredStats: bbFeaturedStats,
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

  const scheduleCol = userRef.collection('schedule');
  const recruitingCol = userRef.collection('recruiting');
  const videosCol = userRef.collection('videos');

  // Schedule
  [...scheduleEvents, ...bbScheduleEvents].forEach((e) =>
    ops.push((b) => b.set(scheduleCol.doc(e.id), { ...e, updatedAt: now }))
  );
  // Recruiting
  [...recruitingActivities, ...bbRecruitingActivities].forEach((a) =>
    ops.push((b) => b.set(recruitingCol.doc(a.id), a))
  );
  // NOTE: verifiedStats & verifiedMetrics are embedded directly in User.sports[]
  // — no separate sub-collections needed. See mergedFootball / mergedBasketball above.

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

  // Follows
  follows.forEach((follow) => {
    if (follow.followingId === userId) {
      ops.push((b) =>
        b.set(userRef.collection('followers').doc(follow.followerId), {
          userId: follow.followerId,
          followedAt: follow.createdAt,
        })
      );
    }
    if (follow.followerId === userId) {
      ops.push((b) =>
        b.set(userRef.collection('following').doc(follow.followingId), {
          userId: follow.followingId,
          followedAt: follow.createdAt,
        })
      );
    }
  });

  // Rankings — top-level Rankings/{rankingId}
  rankings.forEach((r) => ops.push((b) => b.set(db.collection(RANKINGS_COL).doc(r.id), r)));
  // Scout reports — top-level ScoutReports/{reportId}
  scoutReports.forEach((r) =>
    ops.push((b) => b.set(db.collection(SCOUT_COL).doc((r as { id: string }).id), r))
  );
  // Videos
  videos.forEach((v) => ops.push((b) => b.set(videosCol.doc((v as { id: string }).id), v)));

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
    `     Football  — schedule:${scheduleEvents.length}  recruiting:${recruitingActivities.length}  stats:${verifiedStats.length}  metrics:${verifiedMetrics.length}`
  );
  console.log(
    `     Basketball— schedule:${bbScheduleEvents.length}  recruiting:${bbRecruitingActivities.length}  stats:${bbStats.length}  metrics:${bbMetrics.length}`
  );
  console.log(
    `     posts:${posts.length}  news:${newsArticles.length}  follows:${follows.length}  rankings:${rankings.length}  scoutReports:${scoutReports.length}  videos:${videos.length}`
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
  async function collectAll(col: FirebaseFirestore.CollectionReference) {
    const snap = await col.limit(500).get();
    snap.docs.forEach((d) => ops.push((b) => b.delete(d.ref)));
    return snap.size;
  }

  const prefix = `seed_${userId}`;
  const counts = await Promise.all([
    collectByPrefix(userRef.collection('schedule'), prefix),
    collectByPrefix(userRef.collection('recruiting'), prefix),
    collectByPrefix(userRef.collection('videos'), prefix),
    // Legacy cleanup — sub-collections from prior seed versions
    collectByPrefix(userRef.collection('timeline'), prefix),
    collectByPrefix(userRef.collection('news'), prefix),
    collectByPrefix(userRef.collection('rankings'), prefix),
    collectByPrefix(userRef.collection('scoutReports'), prefix),
    collectByPrefix(userRef.collection('sports').doc('football').collection('stats'), prefix),
    collectByPrefix(userRef.collection('sports').doc('basketball').collection('stats'), prefix),
    collectByPrefix(userRef.collection('sports').doc('football').collection('metrics'), prefix),
    collectByPrefix(userRef.collection('sports').doc('basketball').collection('metrics'), prefix),
    collectAll(userRef.collection('followers')),
    collectAll(userRef.collection('following')),
  ]);

  // Top-level collections — Posts, News, ScoutReports, Rankings
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
  ]);
  const totalDeleted =
    counts.reduce((a, b) => a + b, 0) + topLevelCounts.reduce((a, b) => a + b, 0);

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
