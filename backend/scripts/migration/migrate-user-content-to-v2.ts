#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Phase 3 — User Content Migration (nxt-1-de054 → V3 Sub-collections)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Migrates user-associated content: Recruiting Activity, Roster Entries,
 * Posts, and Player/Game Stats from the legacy project into normalized V3
 * collections on the target project.
 *
 * Usage:
 *   npx tsx scripts/migration/migrate-user-content-to-v2.ts --dry-run --limit=50
 *   npx tsx scripts/migration/migrate-user-content-to-v2.ts --target=staging
 *   npx tsx scripts/migration/migrate-user-content-to-v2.ts --target=staging --collection=recruiting
 *   npx tsx scripts/migration/migrate-user-content-to-v2.ts --target=staging --collection=posts
 *
 * Flags:
 *   --dry-run          Transform & log but write nothing
 *   --limit=N          Process at most N legacy user docs
 *   --target=          staging (default) | production
 *   --verbose          Print per-doc detail
 *   --collection=      recruiting | roster | posts | stats (run one collection
 *                       only; omit to run all)
 *   --legacy-sa=       Override path to legacy service account JSON
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  initLegacyApp,
  initTargetApp,
  isDryRun,
  isVerbose,
  getLimit,
  getArg,
  PAGE_SIZE,
  COLLECTIONS,
  BatchWriter,
  ProgressReporter,
  printBanner,
  printSummary,
  writeReport,
  formatNum,
  toISOString,
  cleanString,
  cleanEmail,
  parseNum,
  parseInt_,
  migrationMeta,
  safeJsonParse,
} from './migration-utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LegacyUser {
  [key: string]: unknown;
}

type CollectionName = 'recruiting' | 'roster' | 'posts' | 'stats';

interface ContentStats {
  usersProcessed: number;
  recruiting: { created: number; errors: number };
  roster: { created: number; errors: number };
  posts: { created: number; errors: number };
  stats: { created: number; errors: number };
}

// ─── Recruiting Activity Migration ───────────────────────────────────────────

/**
 * Migrate legacy offer / visit / camp / interest / commitment data
 * into the V3 `recruiting` sub-collection per user.
 *
 * Legacy stores offers as a JSON string, visits/camps/interests as arrays.
 */
async function migrateRecruitingActivity(
  uid: string,
  d: LegacyUser,
  targetDb: FirebaseFirestore.Firestore,
  writer: BatchWriter,
  stats: ContentStats['recruiting']
): Promise<void> {
  const activities: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  // ── Offers (JSON string or array)
  const offersRaw = d['offers'];
  let offers: unknown[] = [];
  if (typeof offersRaw === 'string' && offersRaw.trim()) {
    const parsed = safeJsonParse<unknown[]>(offersRaw);
    if (parsed && Array.isArray(parsed)) offers = parsed;
  } else if (Array.isArray(offersRaw)) {
    offers = offersRaw;
  }

  for (const offer of offers) {
    if (!offer || typeof offer !== 'object') continue;
    const o = offer as Record<string, unknown>;
    activities.push({
      category: 'offer',
      collegeName: cleanString(o['name'] ?? o['collegeName'] ?? o['school']) || 'Unknown',
      collegeLogoUrl: cleanString(o['logoUrl'] ?? o['logo']) || undefined,
      division: cleanString(o['division']) || undefined,
      sport: cleanString(d['primarySport'])?.toLowerCase() || undefined,
      date: toISOString(o['date'] ?? o['offeredAt']) || now,
      scholarshipType: cleanString(o['scholarshipType'] ?? o['type']) || undefined,
      coachName: cleanString(o['coachName']) || undefined,
      coachTitle: cleanString(o['coachTitle']) || undefined,
      notes: cleanString(o['notes']) || undefined,
      source: 'legacy-import',
      verified: false,
      createdAt: toISOString(o['date'] ?? o['offeredAt']) || now,
      updatedAt: now,
      ...migrationMeta(uid, `${COLLECTIONS.LEGACY_USERS}/${uid}/offers`),
    });
  }

  // ── College Visits
  const visits = Array.isArray(d['collegeVisits'])
    ? (d['collegeVisits'] as Record<string, unknown>[])
    : [];
  for (const v of visits) {
    if (!v || typeof v !== 'object') continue;
    activities.push({
      category: 'visit',
      collegeName: cleanString(v['name'] ?? v['collegeName'] ?? v['school']) || 'Unknown',
      collegeLogoUrl: cleanString(v['logoUrl'] ?? v['logo']) || undefined,
      division: cleanString(v['division']) || undefined,
      sport: cleanString(d['primarySport'])?.toLowerCase() || undefined,
      date: toISOString(v['date'] ?? v['visitDate']) || now,
      visitType: cleanString(v['visitType'] ?? v['type']) || 'campus',
      notes: cleanString(v['notes']) || undefined,
      source: 'legacy-import',
      verified: false,
      createdAt: toISOString(v['date']) || now,
      updatedAt: now,
      ...migrationMeta(uid, `${COLLECTIONS.LEGACY_USERS}/${uid}/visits`),
    });
  }

  // ── College Camps
  const camps = Array.isArray(d['collegeCamps'])
    ? (d['collegeCamps'] as Record<string, unknown>[])
    : [];
  for (const c of camps) {
    if (!c || typeof c !== 'object') continue;
    activities.push({
      category: 'camp',
      collegeName: cleanString(c['name'] ?? c['collegeName'] ?? c['school']) || 'Unknown',
      collegeLogoUrl: cleanString(c['logoUrl'] ?? c['logo']) || undefined,
      division: cleanString(c['division']) || undefined,
      sport: cleanString(d['primarySport'])?.toLowerCase() || undefined,
      date: toISOString(c['date'] ?? c['campDate']) || now,
      notes: cleanString(c['notes']) || undefined,
      source: 'legacy-import',
      verified: false,
      createdAt: toISOString(c['date']) || now,
      updatedAt: now,
      ...migrationMeta(uid, `${COLLECTIONS.LEGACY_USERS}/${uid}/camps`),
    });
  }

  // ── College Interests
  const interests = Array.isArray(d['collegeInterests'])
    ? (d['collegeInterests'] as Record<string, unknown>[])
    : [];
  for (const i of interests) {
    if (!i || typeof i !== 'object') continue;
    activities.push({
      category: 'interest',
      collegeName: cleanString(i['name'] ?? i['collegeName'] ?? i['school']) || 'Unknown',
      collegeLogoUrl: cleanString(i['logoUrl'] ?? i['logo']) || undefined,
      division: cleanString(i['division']) || undefined,
      sport: cleanString(d['primarySport'])?.toLowerCase() || undefined,
      date: toISOString(i['date'] ?? i['createdAt']) || now,
      coachName: cleanString(i['coachName']) || undefined,
      notes: cleanString(i['notes']) || undefined,
      source: 'legacy-import',
      verified: false,
      createdAt: toISOString(i['date']) || now,
      updatedAt: now,
      ...migrationMeta(uid, `${COLLECTIONS.LEGACY_USERS}/${uid}/interests`),
    });
  }

  // ── Commitment (single if isCommitted)
  if (d['isCommitted'] === true) {
    const committedBy = d['committmentBy'] as Record<string, unknown> | undefined;
    activities.push({
      category: 'commitment',
      collegeName:
        cleanString(committedBy?.['name']) || cleanString(d['committedTo'] as string) || 'Unknown',
      collegeLogoUrl: cleanString(committedBy?.['logoUrl']) || undefined,
      sport: cleanString(d['primarySport'])?.toLowerCase() || undefined,
      commitmentStatus: 'committed',
      date: toISOString(committedBy?.['date'] ?? d['committedAt']) || now,
      source: 'legacy-import',
      verified: false,
      createdAt: toISOString(committedBy?.['date'] ?? d['committedAt']) || now,
      updatedAt: now,
      ...migrationMeta(uid, `${COLLECTIONS.LEGACY_USERS}/${uid}/commitment`),
    });
  }

  // Write all activities as docs in users/{uid}/recruiting/
  for (let idx = 0; idx < activities.length; idx++) {
    const activity = activities[idx];
    // Deterministic ID: {category}_{index}
    const docId = `${activity['category']}_${idx}`;
    activity['id'] = docId;
    const ref = targetDb
      .collection(COLLECTIONS.USERS)
      .doc(uid)
      .collection(COLLECTIONS.RECRUITING)
      .doc(docId);

    try {
      writer.set(ref, activity);
      stats.created++;
    } catch (err) {
      stats.errors++;
      if (isVerbose) {
        console.error(`    ❌ recruiting ${uid}/${docId}: ${err}`);
      }
    }
  }
}

// ─── Roster Entry Migration ──────────────────────────────────────────────────

/**
 * Create a RosterEntry for the user based on their teamCode linkage.
 * Phase 5 already created teams/organizations; this creates the user's
 * entry in rosterEntries with a deterministic ID.
 */
async function migrateRosterEntry(
  uid: string,
  d: LegacyUser,
  targetDb: FirebaseFirestore.Firestore,
  writer: BatchWriter,
  stats: ContentStats['roster']
): Promise<void> {
  const teamCode = cleanString(d['teamCode']);
  if (!teamCode) return; // No team association

  const now = new Date().toISOString();
  const role = cleanString(d['athleteOrParentOrCoach']) || cleanString(d['role']) || 'athlete';
  const sport = cleanString(d['primarySport'])?.toLowerCase();

  // Determine roster role from legacy role
  let rosterRole: string;
  switch (role.toLowerCase()) {
    case 'coach':
    case 'panel':
      rosterRole = 'coach';
      break;
    case 'parent':
      rosterRole = 'parent';
      break;
    default:
      rosterRole = 'athlete';
  }

  // Deterministic ID: {userId}_{teamCode}
  const docId = `${uid}_${teamCode}`;
  const teamDocId = `team_${teamCode}`;

  const entry: Record<string, unknown> = {
    id: docId,
    userId: uid,
    teamId: teamDocId,
    role: rosterRole,
    sport: sport || undefined,
    jerseyNumber: cleanString(d['jerseyNumber']) || undefined,
    position: Array.isArray(d['primarySportPositions'])
      ? (d['primarySportPositions'] as string[])[0]
      : typeof d['primarySportPositions'] === 'string'
        ? d['primarySportPositions']
        : undefined,
    status: 'active',
    joinedAt: toISOString(d['createdAt']) || now,
    createdAt: now,
    updatedAt: now,
    ...migrationMeta(uid, `${COLLECTIONS.LEGACY_USERS}/${uid}/teamCode`),
  };

  // Strip undefined
  for (const key of Object.keys(entry)) {
    if (entry[key] === undefined) delete entry[key];
  }

  const ref = targetDb.collection(COLLECTIONS.ROSTER_ENTRIES).doc(docId);
  try {
    writer.set(ref, entry);
    stats.created++;
  } catch (err) {
    stats.errors++;
    if (isVerbose) {
      console.error(`    ❌ roster ${docId}: ${err}`);
    }
  }
}

// ─── Posts Migration ─────────────────────────────────────────────────────────

/**
 * Migrate user posts from legacy Posts sub-collection (or top-level `posts` array)
 * into the V3 `posts` collection.
 */
async function migrateUserPosts(
  uid: string,
  d: LegacyUser,
  legacyDb: FirebaseFirestore.Firestore,
  targetDb: FirebaseFirestore.Firestore,
  writer: BatchWriter,
  stats: ContentStats['posts']
): Promise<void> {
  const now = new Date().toISOString();

  // Try sub-collection first (preferred)
  const postsSnap = await legacyDb
    .collection(COLLECTIONS.LEGACY_USERS)
    .doc(uid)
    .collection('Posts')
    .orderBy('createdAt', 'desc')
    .limit(500) // Safety cap
    .get();

  const posts: FirebaseFirestore.QueryDocumentSnapshot[] = postsSnap.docs;

  // Fallback: inline posts[] array on user doc
  const inlinePosts = Array.isArray(d['posts']) ? (d['posts'] as Record<string, unknown>[]) : [];

  if (posts.length === 0 && inlinePosts.length === 0) return;

  // Process sub-collection posts
  for (const postDoc of posts) {
    const p = postDoc.data();
    const postId = postDoc.id;

    const v3Post: Record<string, unknown> = {
      id: postId,
      authorId: uid,
      authorName:
        cleanString(p['authorName']) ||
        [cleanString(d['firstName']), cleanString(d['lastName'])].filter(Boolean).join(' '),
      authorProfileImg:
        cleanString(p['authorProfileImg']) || cleanString(d['profileImg']) || undefined,
      content: cleanString(p['content'] ?? p['text'] ?? p['body']) || '',
      type: cleanString(p['type']) || 'text',
      mediaUrls: Array.isArray(p['mediaUrls']) ? p['mediaUrls'] : [],
      thumbnailUrl: cleanString(p['thumbnailUrl']) || undefined,
      sport:
        cleanString(p['sport'])?.toLowerCase() ||
        cleanString(d['primarySport'])?.toLowerCase() ||
        undefined,
      likes: typeof p['likes'] === 'number' ? p['likes'] : 0,
      comments: typeof p['comments'] === 'number' ? p['comments'] : 0,
      shares: typeof p['shares'] === 'number' ? p['shares'] : 0,
      visibility: cleanString(p['visibility']) || 'public',
      pinned: p['pinned'] === true,
      createdAt: toISOString(p['createdAt']) || now,
      updatedAt: toISOString(p['updatedAt']) || now,
      ...migrationMeta(uid, `${COLLECTIONS.LEGACY_USERS}/${uid}/Posts`),
    };

    // Strip undefined
    for (const key of Object.keys(v3Post)) {
      if (v3Post[key] === undefined) delete v3Post[key];
    }

    const ref = targetDb.collection(COLLECTIONS.POSTS).doc(postId);
    try {
      writer.set(ref, v3Post);
      stats.created++;
    } catch (err) {
      stats.errors++;
    }
  }

  // Process inline posts (if any — some legacy docs embed posts directly)
  for (let i = 0; i < inlinePosts.length; i++) {
    const p = inlinePosts[i];
    if (!p || typeof p !== 'object') continue;

    const postId = cleanString(p['id'] as string) || `${uid}_inline_${i}`;

    const v3Post: Record<string, unknown> = {
      id: postId,
      authorId: uid,
      content: cleanString(p['content'] ?? p['text'] ?? p['body']) || '',
      type: cleanString(p['type']) || 'text',
      mediaUrls: Array.isArray(p['mediaUrls']) ? p['mediaUrls'] : [],
      likes: typeof p['likes'] === 'number' ? p['likes'] : 0,
      comments: typeof p['comments'] === 'number' ? p['comments'] : 0,
      shares: typeof p['shares'] === 'number' ? p['shares'] : 0,
      visibility: 'public',
      createdAt: toISOString(p['createdAt']) || now,
      updatedAt: toISOString(p['updatedAt']) || now,
      ...migrationMeta(uid, `${COLLECTIONS.LEGACY_USERS}/${uid}/posts_inline`),
    };

    for (const key of Object.keys(v3Post)) {
      if (v3Post[key] === undefined) delete v3Post[key];
    }

    const ref = targetDb.collection(COLLECTIONS.POSTS).doc(postId);
    try {
      writer.set(ref, v3Post);
      stats.created++;
    } catch (err) {
      stats.errors++;
    }
  }
}

// ─── Stats Migration ─────────────────────────────────────────────────────────

/**
 * Migrate player stats and game stats from legacy sub-collections or
 * inline fields into V3 playerStats / gameStats collections.
 */
async function migrateUserStats(
  uid: string,
  d: LegacyUser,
  legacyDb: FirebaseFirestore.Firestore,
  targetDb: FirebaseFirestore.Firestore,
  writer: BatchWriter,
  stats: ContentStats['stats']
): Promise<void> {
  const now = new Date().toISOString();
  const sport = cleanString(d['primarySport'])?.toLowerCase();

  // ── Player Stats (from sub-collection)
  try {
    const playerStatsSnap = await legacyDb
      .collection(COLLECTIONS.LEGACY_USERS)
      .doc(uid)
      .collection('PlayerStats')
      .limit(200)
      .get();

    for (const doc of playerStatsSnap.docs) {
      const ps = doc.data();
      const docId = `${uid}_${doc.id}`;

      const v3Stats: Record<string, unknown> = {
        id: docId,
        userId: uid,
        sport: cleanString(ps['sport'])?.toLowerCase() || sport || undefined,
        season: cleanString(ps['season']) || undefined,
        category: cleanString(ps['category']) || undefined,
        stats: ps['stats'] && typeof ps['stats'] === 'object' ? ps['stats'] : {},
        source: 'legacy-import',
        createdAt: toISOString(ps['createdAt']) || now,
        updatedAt: now,
        ...migrationMeta(uid, `${COLLECTIONS.LEGACY_USERS}/${uid}/PlayerStats`),
      };

      for (const key of Object.keys(v3Stats)) {
        if (v3Stats[key] === undefined) delete v3Stats[key];
      }

      const ref = targetDb.collection(COLLECTIONS.PLAYER_STATS).doc(docId);
      writer.set(ref, v3Stats);
      stats.created++;
    }
  } catch (err) {
    if (isVerbose) {
      console.error(`    ❌ player stats ${uid}: ${err}`);
    }
    stats.errors++;
  }

  // ── Game Stats (from sub-collection)
  try {
    const gameStatsSnap = await legacyDb
      .collection(COLLECTIONS.LEGACY_USERS)
      .doc(uid)
      .collection('GameStats')
      .limit(500)
      .get();

    for (const doc of gameStatsSnap.docs) {
      const gs = doc.data();
      const docId = `${uid}_${doc.id}`;

      const v3GameStats: Record<string, unknown> = {
        id: docId,
        userId: uid,
        sport: cleanString(gs['sport'])?.toLowerCase() || sport || undefined,
        season: cleanString(gs['season']) || undefined,
        gameDate: toISOString(gs['gameDate'] ?? gs['date']) || undefined,
        opponent: cleanString(gs['opponent']) || undefined,
        result: cleanString(gs['result']) || undefined,
        stats: gs['stats'] && typeof gs['stats'] === 'object' ? gs['stats'] : {},
        highlights: Array.isArray(gs['highlights']) ? gs['highlights'] : [],
        source: 'legacy-import',
        createdAt: toISOString(gs['createdAt']) || now,
        updatedAt: now,
        ...migrationMeta(uid, `${COLLECTIONS.LEGACY_USERS}/${uid}/GameStats`),
      };

      for (const key of Object.keys(v3GameStats)) {
        if (v3GameStats[key] === undefined) delete v3GameStats[key];
      }

      const ref = targetDb.collection(COLLECTIONS.GAME_STATS).doc(docId);
      writer.set(ref, v3GameStats);
      stats.created++;
    }
  } catch (err) {
    if (isVerbose) {
      console.error(`    ❌ game stats ${uid}: ${err}`);
    }
    stats.errors++;
  }

  // ── Inline stats from user doc (primarySportStats, primarySportGameStats)
  const inlinePlayerStats = d['primarySportStats'];
  if (inlinePlayerStats && typeof inlinePlayerStats === 'object') {
    const docId = `${uid}_inline_primary`;
    const v3Stats: Record<string, unknown> = {
      id: docId,
      userId: uid,
      sport: sport || undefined,
      stats: inlinePlayerStats,
      source: 'legacy-import-inline',
      createdAt: toISOString(d['createdAt']) || now,
      updatedAt: now,
      ...migrationMeta(uid, `${COLLECTIONS.LEGACY_USERS}/${uid}/primarySportStats`),
    };

    for (const key of Object.keys(v3Stats)) {
      if (v3Stats[key] === undefined) delete v3Stats[key];
    }

    const ref = targetDb.collection(COLLECTIONS.PLAYER_STATS).doc(docId);
    writer.set(ref, v3Stats);
    stats.created++;
  }

  const inlineGameStats = d['primarySportGameStats'];
  if (inlineGameStats && typeof inlineGameStats === 'object') {
    const docId = `${uid}_inline_game_primary`;
    const v3GameStats: Record<string, unknown> = {
      id: docId,
      userId: uid,
      sport: sport || undefined,
      stats: inlineGameStats,
      source: 'legacy-import-inline',
      createdAt: toISOString(d['createdAt']) || now,
      updatedAt: now,
      ...migrationMeta(uid, `${COLLECTIONS.LEGACY_USERS}/${uid}/primarySportGameStats`),
    };

    for (const key of Object.keys(v3GameStats)) {
      if (v3GameStats[key] === undefined) delete v3GameStats[key];
    }

    const ref = targetDb.collection(COLLECTIONS.GAME_STATS).doc(docId);
    writer.set(ref, v3GameStats);
    stats.created++;
  }
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  printBanner('Phase 3 — User Content Migration');

  const { db: legacyDb } = initLegacyApp();
  const { db: targetDb } = initTargetApp();

  const limit = getLimit();
  const collectionFilter = getArg('collection') as CollectionName | undefined;

  if (collectionFilter) {
    const valid: CollectionName[] = ['recruiting', 'roster', 'posts', 'stats'];
    if (!valid.includes(collectionFilter)) {
      console.error(`  ❌ Invalid --collection=${collectionFilter}. Valid: ${valid.join(', ')}`);
      process.exit(1);
    }
    console.log(`  Filtering to collection: ${collectionFilter}\n`);
  }

  const shouldRun = (name: CollectionName): boolean =>
    !collectionFilter || collectionFilter === name;

  const stats: ContentStats = {
    usersProcessed: 0,
    recruiting: { created: 0, errors: 0 },
    roster: { created: 0, errors: 0 },
    posts: { created: 0, errors: 0 },
    stats: { created: 0, errors: 0 },
  };

  const errorLog: Array<{ uid: string; collection: string; error: string }> = [];

  const writer = new BatchWriter(targetDb, isDryRun);
  const progress = new ProgressReporter('Users (content)');

  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let processed = 0;

  console.log('  Starting content migration…\n');

  while (true) {
    let query: FirebaseFirestore.Query = legacyDb
      .collection(COLLECTIONS.LEGACY_USERS)
      .orderBy('createdAt', 'asc')
      .limit(PAGE_SIZE);

    if (cursor) query = query.startAfter(cursor);

    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      if (limit > 0 && processed >= limit) break;

      processed++;
      stats.usersProcessed++;
      const uid = doc.id;
      const data = doc.data() as LegacyUser;

      try {
        // Recruiting Activity
        if (shouldRun('recruiting')) {
          await migrateRecruitingActivity(uid, data, targetDb, writer, stats.recruiting);
        }

        // Roster Entries
        if (shouldRun('roster')) {
          await migrateRosterEntry(uid, data, targetDb, writer, stats.roster);
        }

        // Posts
        if (shouldRun('posts')) {
          await migrateUserPosts(uid, data, legacyDb, targetDb, writer, stats.posts);
        }

        // Player & Game Stats
        if (shouldRun('stats')) {
          await migrateUserStats(uid, data, legacyDb, targetDb, writer, stats.stats);
        }

        await writer.flushIfNeeded();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errorLog.push({ uid, collection: 'user', error: msg });
        console.error(`    ❌ ${uid}: ${msg}`);
      }

      progress.tick(processed);
    }

    cursor = snap.docs[snap.docs.length - 1];
    if (limit > 0 && processed >= limit) break;
  }

  await writer.flush();
  progress.done(processed);

  // ─── Report ─────────────────────────────────────────────────────────
  const { writes, errors: writeErrors } = writer.stats;

  const summaryEntries: [string, number][] = [
    ['Users processed', stats.usersProcessed],
    ['Writes committed', writes],
    ['Write errors', writeErrors],
  ];

  if (shouldRun('recruiting')) {
    summaryEntries.push(
      ['Recruiting created', stats.recruiting.created],
      ['Recruiting errors', stats.recruiting.errors]
    );
  }
  if (shouldRun('roster')) {
    summaryEntries.push(
      ['Roster entries created', stats.roster.created],
      ['Roster errors', stats.roster.errors]
    );
  }
  if (shouldRun('posts')) {
    summaryEntries.push(
      ['Posts created', stats.posts.created],
      ['Posts errors', stats.posts.errors]
    );
  }
  if (shouldRun('stats')) {
    summaryEntries.push(
      ['Stats docs created', stats.stats.created],
      ['Stats errors', stats.stats.errors]
    );
  }

  printSummary('Content Migration Results', summaryEntries);

  writeReport(
    `content-migration-${collectionFilter || 'all'}-${new Date().toISOString().slice(0, 10)}.json`,
    {
      timestamp: new Date().toISOString(),
      dryRun: isDryRun,
      collectionFilter: collectionFilter || 'all',
      stats,
      errors: errorLog,
    }
  );

  const totalErrors =
    stats.recruiting.errors +
    stats.roster.errors +
    stats.posts.errors +
    stats.stats.errors +
    writeErrors;

  if (totalErrors > 0) {
    console.log(`\n  ⚠ ${totalErrors} error(s) — check report for details.`);
  }

  console.log('\n  Done.\n');
  process.exit(totalErrors > 0 ? 1 : 0);
}

// ─── Firestore import ─────────────────────────────────────────────────────────
import FirebaseFirestore from 'firebase-admin/firestore';

main().catch((err) => {
  console.error('\n  FATAL:', err);
  process.exit(2);
});
