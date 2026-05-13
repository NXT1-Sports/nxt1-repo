/**
 * @fileoverview Export NXT1 Legacy Users from nxt-1-v2 Firebase
 *
 * Fetches all user profiles from Firestore, cross-references with Firebase Auth,
 * filters out test/demo/duplicate users, filters athletes to classOf 2027/2028/2029,
 * tags qualifying users with `nxt1-legacy-users` (Firestore field + Auth custom claim),
 * and exports a CSV.
 *
 * Usage:
 *   node backend/scripts/utilities/export-legacy-users.mjs              # dry-run
 *   node backend/scripts/utilities/export-legacy-users.mjs --commit     # apply tags
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load .env ────────────────────────────────────────────────────────────────
const envPath = resolve(__dirname, '../../.env');
const envContent = readFileSync(envPath, 'utf8');
envContent.split('\n').forEach((line) => {
  const match = line.match(/^([A-Z_0-9]+)='?(.+?)'?$/);
  if (match) process.env[match[1]] = match[2].replace(/\\n/g, '\n');
});

// ─── Firebase Admin SDK ────────────────────────────────────────────────────────
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY,
    }),
  });
}

const db = admin.firestore();
const auth = admin.auth();

// ─── Config ────────────────────────────────────────────────────────────────────
const ARGS = process.argv.slice(2);
const DRY_RUN = !ARGS.includes('--commit');
const OUTPUT_PATH = resolve(__dirname, '../../../backend/logs/nxt1-legacy-users.csv');
const ATHLETE_GRAD_YEARS = new Set([2027, 2028, 2029]);
const BATCH_SIZE = 400;

/** Email patterns that identify test / internal / demo accounts */
const TEST_EMAIL_PATTERNS = [
  /@nxt1sports\.com$/i,
  /^(test|demo|sample|dummy|fake|placeholder|dev|admin|bot|qa|staging|noreply|no-reply)/i,
  /\+test/i,
  /\+demo/i,
  /test@/i,
  /demo@/i,
  /example\.(com|org|net)$/i,
];

/** Display names that indicate incomplete / bot profiles */
const TEST_DISPLAY_NAMES = new Set([
  'Unknown', 'Test User', 'Demo User', 'Test Athlete', 'Demo Athlete', '',
]);

function isTestEmail(email) {
  if (!email) return true;
  return TEST_EMAIL_PATTERNS.some((p) => p.test(email));
}

function isTestUser(profile) {
  if (isTestEmail(profile.email)) return true;
  if (TEST_DISPLAY_NAMES.has(profile.displayName?.trim())) return true;
  return false;
}

function shouldIncludeUser(profile) {
  if (!profile.email) return false;
  if (!profile.onboardingCompleted) return false;
  if (profile.role === 'athlete') {
    const gradYear = profile.classOf;
    if (!ATHLETE_GRAD_YEARS.has(gradYear)) return false;
  }
  return !isTestUser(profile);
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(fields) {
  return fields.map(escapeCsv).join(',');
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🏈  NXT1 Legacy User Export`);
  console.log(`   Project : nxt-1-v2`);
  console.log(`   Mode    : ${DRY_RUN ? 'DRY RUN (no writes)' : 'COMMIT (will tag users)'}`);
  console.log(`   Filters : athletes → classOf 2027/2028/2029 only\n`);

  // ── 1. Fetch all Firestore user profiles ────────────────────────────────────
  console.log('📥  Fetching all user profiles from Firestore...');
  const profileMap = new Map(); // uid → profile
  let cursor = null;
  let page = 0;

  while (true) {
    let query = db.collection('Users').orderBy('__name__').limit(500);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (snap.empty) break;

    snap.docs.forEach((doc) => {
      profileMap.set(doc.id, { uid: doc.id, ...doc.data() });
    });

    cursor = snap.docs[snap.docs.length - 1];
    page++;
    process.stdout.write(`   Page ${page}: ${profileMap.size} profiles fetched\r`);

    if (snap.size < 500) break;
  }
  console.log(`\n   ✅  Total Firestore profiles: ${profileMap.size}`);

  // ── 2. Apply filters ─────────────────────────────────────────────────────────
  console.log('\n🔍  Applying filters...');

  const seenEmails = new Map(); // email → uid (for duplicate detection)
  const filtered = [];
  const excluded = { test: 0, duplicate: 0, wrongGradYear: 0, incompleteOnboarding: 0, noEmail: 0 };

  for (const [uid, profile] of profileMap) {
    const email = profile.email?.toLowerCase().trim();

    if (!email) { excluded.noEmail++; continue; }

    if (!profile.onboardingCompleted) { excluded.incompleteOnboarding++; continue; }

    if (isTestUser(profile)) { excluded.test++; continue; }

    // Duplicate check: keep the first occurrence (oldest by Firestore order)
    if (seenEmails.has(email)) { excluded.duplicate++; continue; }
    seenEmails.set(email, uid);

    if (profile.role === 'athlete') {
      const gradYear = profile.classOf;
      if (!ATHLETE_GRAD_YEARS.has(gradYear)) { excluded.wrongGradYear++; continue; }
    }

    filtered.push(profile);
  }

  console.log(`   ✅  Users passing filter: ${filtered.length}`);
  console.log(`   ❌  Excluded — test/demo:       ${excluded.test}`);
  console.log(`   ❌  Excluded — duplicate email: ${excluded.duplicate}`);
  console.log(`   ❌  Excluded — incomplete:      ${excluded.incompleteOnboarding}`);
  console.log(`   ❌  Excluded — no email:        ${excluded.noEmail}`);
  console.log(`   ❌  Excluded — wrong grad year (athletes): ${excluded.wrongGradYear}`);

  // ── 3. Role breakdown ─────────────────────────────────────────────────────────
  const roleCounts = {};
  const gradYearCounts = {};
  for (const p of filtered) {
    roleCounts[p.role] = (roleCounts[p.role] ?? 0) + 1;
    if (p.role === 'athlete' && p.classOf) {
      gradYearCounts[p.classOf] = (gradYearCounts[p.classOf] ?? 0) + 1;
    }
  }
  console.log('\n📊  Breakdown by role:', roleCounts);
  console.log('🎓  Athletes by classOf:', gradYearCounts);

  // ── 4. Tag users ─────────────────────────────────────────────────────────────
  if (!DRY_RUN) {
    console.log('\n🏷️   Tagging users as nxt1-legacy-users...');
    const uids = filtered.map((p) => p.uid);

    // 4a. Firestore: add tag to each user doc
    const firestoreBatches = [];
    for (let i = 0; i < uids.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const uid of uids.slice(i, i + BATCH_SIZE)) {
        const ref = db.collection('Users').doc(uid);
        batch.update(ref, {
          tags: admin.firestore.FieldValue.arrayUnion('nxt1-legacy-users'),
          nxt1LegacyUser: true,
          legacyTaggedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      firestoreBatches.push(batch);
    }
    let firestoreDone = 0;
    for (const batch of firestoreBatches) {
      await batch.commit();
      firestoreDone += BATCH_SIZE;
      process.stdout.write(`   Firestore: ${Math.min(firestoreDone, uids.length)}/${uids.length} tagged\r`);
    }
    console.log(`\n   ✅  Firestore tags applied`);

    // 4b. Firebase Auth custom claims
    let authDone = 0;
    for (const uid of uids) {
      try {
        const user = await auth.getUser(uid);
        const existing = user.customClaims ?? {};
        await auth.setCustomUserClaims(uid, {
          ...existing,
          nxt1LegacyUser: true,
        });
      } catch {
        // User may have been deleted from auth — skip
      }
      authDone++;
      if (authDone % 100 === 0) {
        process.stdout.write(`   Auth claims: ${authDone}/${uids.length}\r`);
      }
    }
    console.log(`\n   ✅  Auth custom claims set`);
  } else {
    console.log('\n⏭️   DRY RUN — skipping Firestore/Auth writes.');
    console.log('    Run with --commit to apply tags.');
  }

  // ── 5. Build CSV ──────────────────────────────────────────────────────────────
  console.log('\n📄  Generating CSV...');

  const headers = [
    'uid', 'email', 'displayName', 'firstName', 'lastName',
    'role', 'classOf', 'sport', 'position', 'state',
    'onboardingCompleted', 'emailVerified', 'createdAt', 'lastSignedInAt',
    'tags',
  ];

  const rows = [toCsvRow(headers)];

  for (const profile of filtered) {
    const sport = profile.sports?.[0]?.name ?? profile.teamHistory?.[0]?.sport ?? '';
    const position = profile.sports?.[0]?.positions?.[0] ?? '';
    const state = profile.location?.state ?? profile.contact?.state ?? '';

    rows.push(toCsvRow([
      profile.uid,
      profile.email ?? '',
      profile.displayName ?? '',
      profile.firstName ?? '',
      profile.lastName ?? '',
      profile.role ?? '',
      profile.classOf ?? '',
      sport,
      position,
      state,
      profile.onboardingCompleted ? 'true' : 'false',
      '', // emailVerified from auth (not in profile doc)
      profile.createdAt ?? '',
      '', // lastSignedInAt from auth
      'nxt1-legacy-users',
    ]));
  }

  writeFileSync(OUTPUT_PATH, rows.join('\n'), 'utf8');

  console.log(`\n✅  CSV written to: ${OUTPUT_PATH}`);
  console.log(`   Total rows (excl. header): ${rows.length - 1}`);
  console.log(`\n🏁  Done.`);

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌  Fatal error:', err);
  process.exit(1);
});
