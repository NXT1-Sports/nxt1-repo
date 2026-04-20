/**
 * @file normalize-user-documents.ts
 *
 * Firestore User document normalization script.
 *
 * Performs three categories of changes:
 *   1. REMOVE   — migration artifacts and redundant fields
 *   2. PROMOTE  — legacy nested data up to canonical top-level fields
 *   3. VALIDATE — warn about fields in DB that are absent from User model
 *
 * Run with:
 *   npx tsx backend/scripts/migration/normalize-user-documents.ts \
 *     --env staging [--dry-run] [--uid <single-uid>]
 *
 * Flags:
 *   --dry-run      Print what would change but make no writes (default: true for safety)
 *   --env          "staging" | "production" (default: staging)
 *   --uid          Process only a single user by UID
 *   --batch        Batch size for Firestore reads (default: 200)
 *   --continue-on-error  Skip users that throw rather than aborting
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { config as loadDotenv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend/.env (same as migration-utils.ts)
loadDotenv({ path: path.resolve(__dirname, '../../.env') });

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun = !args.includes('--no-dry-run');
const singleUid = (() => {
  const i = args.indexOf('--uid');
  return i !== -1 ? args[i + 1] : null;
})();
const batchSize = (() => {
  const i = args.indexOf('--batch');
  return i !== -1 ? parseInt(args[i + 1], 10) : 200;
})();
const env = (() => {
  const i = args.indexOf('--env');
  return i !== -1 ? args[i + 1] : 'staging';
})();
const continueOnError = args.includes('--continue-on-error');

// ─── Firebase init ────────────────────────────────────────────────────────────
function initFirebase(): void {
  const isProduction = env === 'production';

  const projectId = isProduction
    ? process.env['PRODUCTION_FIREBASE_PROJECT_ID']
    : process.env['STAGING_FIREBASE_PROJECT_ID'];
  const clientEmail = isProduction
    ? process.env['PRODUCTION_FIREBASE_CLIENT_EMAIL']
    : process.env['STAGING_FIREBASE_CLIENT_EMAIL'];
  const privateKey = (
    isProduction
      ? process.env['PRODUCTION_FIREBASE_PRIVATE_KEY']
      : process.env['STAGING_FIREBASE_PRIVATE_KEY']
  )?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    console.log(`  Firebase: env vars → ${projectId}`);
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    return;
  }

  // Fallback: SA file in backend/assets/
  const assetsDir = path.resolve(__dirname, '../../assets');
  const saFile = isProduction
    ? 'nxt-1-v2-firebase-adminsdk.json'
    : 'nxt-1-staging-v2-ae4fac811aa4.json';
  const saPath = path.join(assetsDir, saFile);

  if (!fs.existsSync(saPath)) {
    console.error(`❌  Firebase credentials not found.`);
    console.error(`    Tried env vars: ${isProduction ? 'PRODUCTION' : 'STAGING'}_FIREBASE_*`);
    console.error(`    Tried SA file:  ${saPath}`);
    console.error(`    Set credentials in backend/.env or place the SA JSON in backend/assets/`);
    process.exit(1);
  }

  console.log(`  Firebase: SA file → ${saPath}`);
  initializeApp({ credential: cert(saPath) });
}

initFirebase();
const db = getFirestore();

// ─── Constants ────────────────────────────────────────────────────────────────
const USERS_COLLECTION = 'Users';

/**
 * Fields that are present in legacy docs but are fully redundant.
 * `id` is the Firestore document ID — storing it on the document is redundant.
 * `bannerImg` was removed from the v3 schema entirely.
 * NOTE: _legacyId, _migratedFrom, _migratedAt are intentionally kept —
 * they are used to identify migrated users and audit migration state.
 */
const REDUNDANT_FIELDS = ['id', 'bannerImg'] as const;

/**
 * Fields that exist in the DB but are NOT present in the core `User` interface.
 * These are NOT removed (they may be intentional runtime fields), but are
 * reported as warnings so they can be added to the model.
 */
const MODEL_MISSING_FIELDS = [
  'profileCompleteness',
  'showedHearAbout',
  'referralCode',
  'referralSource',
  'referralDetails',
  'referralId',
  'onboardingCompletedAt',
  'welcomeGraphicQueued',
] as const;

// ─── Stats ────────────────────────────────────────────────────────────────────
const stats = {
  total: 0,
  skipped: 0,
  changed: 0,
  errors: 0,
  fieldRemovals: 0,
  fieldPromotions: 0,
  modelWarnings: new Map<string, number>(),
};

// ─── Per-document normalization ───────────────────────────────────────────────

/**
 * Computes the updates needed for a single user document.
 *
 * Returns:
 *   updates   — fields to set/merge (using FieldValue.delete() for removals)
 *   warnings  — field names that exist in DB but not in the User model
 */
function computeUpdates(
  uid: string,
  data: FirebaseFirestore.DocumentData
): {
  updates: Record<string, unknown>;
  warnings: string[];
} {
  const updates: Record<string, unknown> = {};
  const warnings: string[] = [];

  // ── 1. Remove redundant fields ─────────────────────────────────────────────
  for (const field of REDUNDANT_FIELDS) {
    if (field in data) {
      updates[field] = FieldValue.delete();
    }
  }

  // ── 2. Promote athlete.academics → user.academics (if needed) ──────────────
  // Legacy docs stored academics inside `athlete.academics`.
  // v3 moves it to the top level. If athlete.academics exists but top-level
  // academics does not, promote it; then delete the nested athlete object.
  const athleteData = data['athlete'] as Record<string, unknown> | undefined;
  if (athleteData && typeof athleteData === 'object') {
    const nestedAcademics = athleteData['academics'];
    if (nestedAcademics && !data['academics']) {
      // Promote to top level
      updates['academics'] = nestedAcademics;
      stats.fieldPromotions++;
    }
    // Remove the deprecated athlete wrapper (it only ever held .academics)
    updates['athlete'] = FieldValue.delete();
  }

  // ── 3. Remove numeric legacy username (non-human, non-slug values) ─────────
  // The legacy app stored numeric IDs as `username` (e.g., "20846078").
  // Modern users don't have this field. It's safe to remove numeric usernames.
  if ('username' in data) {
    const username = data['username'] as string;
    if (/^\d+$/.test(username)) {
      // Pure numeric — legacy system ID, not a human-chosen handle
      updates['username'] = FieldValue.delete();
    }
  }

  // ── 4. Warn about fields in DB that are missing from User model ────────────
  for (const field of MODEL_MISSING_FIELDS) {
    if (field in data) {
      warnings.push(field);
    }
  }

  return { updates, warnings };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function processUser(doc: FirebaseFirestore.DocumentSnapshot): Promise<void> {
  const uid = doc.id;
  const data = doc.data();

  if (!data) {
    console.warn(`  ⚠  [${uid}] Document has no data — skipping`);
    stats.skipped++;
    return;
  }

  const { updates, warnings } = computeUpdates(uid, data);

  // Accumulate model-missing-field warnings globally
  for (const w of warnings) {
    stats.modelWarnings.set(w, (stats.modelWarnings.get(w) ?? 0) + 1);
  }

  const removedFields = Object.entries(updates)
    .filter(([, v]) => v instanceof FieldValue)
    .map(([k]) => k);
  const setFields = Object.entries(updates)
    .filter(([, v]) => !(v instanceof FieldValue))
    .map(([k]) => k);

  if (Object.keys(updates).length === 0) {
    stats.skipped++;
    return;
  }

  stats.changed++;
  stats.fieldRemovals += removedFields.length;

  if (isDryRun) {
    console.log(`  [DRY] ${uid}`);
    if (removedFields.length) console.log(`       🗑  Remove: ${removedFields.join(', ')}`);
    if (setFields.length) console.log(`       ✏️  Set: ${setFields.join(', ')}`);
    if (warnings.length) console.log(`       ⚠  Model-missing: ${warnings.join(', ')}`);
  } else {
    await db.collection(USERS_COLLECTION).doc(uid).update(updates);
    console.log(
      `  ✅  ${uid} — removed [${removedFields.join(', ')}]${setFields.length ? `, set [${setFields.join(', ')}]` : ''}`
    );
  }
}

async function run(): Promise<void> {
  console.log(`\n🚀  User Document Normalization`);
  console.log(`   env:     ${env}`);
  console.log(`   dry-run: ${isDryRun}`);
  console.log(`   uid:     ${singleUid ?? '(all users)'}`);
  console.log(`   batch:   ${batchSize}\n`);

  if (singleUid) {
    // ── Single-user mode ──────────────────────────────────────────────────────
    const doc = await db.collection(USERS_COLLECTION).doc(singleUid).get();
    if (!doc.exists) {
      console.error(`❌  User ${singleUid} not found`);
      process.exit(1);
    }
    stats.total = 1;
    await processUser(doc);
  } else {
    // ── Full collection mode ──────────────────────────────────────────────────
    let lastDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    let hasMore = true;

    while (hasMore) {
      let query = db.collection(USERS_COLLECTION).orderBy('__name__').limit(batchSize);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();

      if (snapshot.empty) {
        // hasMore = false;
        break;
      }

      console.log(
        `  Processing batch of ${snapshot.docs.length} users (total so far: ${stats.total})...`
      );

      for (const doc of snapshot.docs) {
        stats.total++;
        try {
          await processUser(doc);
        } catch (err) {
          stats.errors++;
          console.error(`  ❌  [${doc.id}] Error:`, err);
          if (!continueOnError) {
            console.error('\nAborting due to error. Use --continue-on-error to skip errors.');
            printSummary();
            process.exit(1);
          }
        }
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1];

      if (snapshot.docs.length < batchSize) {
        hasMore = false;
      }
    }
  }

  printSummary();
}

function printSummary(): void {
  console.log('\n─────────────────────────────────────────');
  console.log('  SUMMARY');
  console.log('─────────────────────────────────────────');
  console.log(`  Total processed : ${stats.total}`);
  console.log(`  Changed         : ${stats.changed}`);
  console.log(`  Skipped (clean) : ${stats.skipped}`);
  console.log(`  Errors          : ${stats.errors}`);
  console.log(`  Fields removed  : ${stats.fieldRemovals}`);
  console.log(`  Fields promoted : ${stats.fieldPromotions}`);

  if (stats.modelWarnings.size > 0) {
    console.log('\n  ⚠  Fields present in DB but MISSING from User model:');
    for (const [field, count] of [...stats.modelWarnings.entries()].sort(([, a], [, b]) => b - a)) {
      console.log(`     ${field.padEnd(30)} — found in ${count} users`);
    }
    console.log(
      '\n  → Add these fields to User interface in packages/core/src/models/user/user.model.ts'
    );
  }

  if (isDryRun && stats.changed > 0) {
    console.log('\n  ℹ  DRY RUN — no writes made. Re-run with --no-dry-run to apply.');
  }
  console.log('─────────────────────────────────────────\n');
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
