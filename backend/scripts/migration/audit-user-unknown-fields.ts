#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Audit User Unknown Fields
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Scans User documents in Firestore and reports fields that are NOT part of
 * the current TypeScript User model. These are legacy/orphaned fields from
 * old data migrations that should be cleaned up.
 *
 * Output: sorted table of unknown fields + how many docs have them + sample values
 *
 * Usage:
 *   npx tsx backend/scripts/migration/audit-user-unknown-fields.ts
 *   npx tsx backend/scripts/migration/audit-user-unknown-fields.ts --target=production
 *   npx tsx backend/scripts/migration/audit-user-unknown-fields.ts --target=staging --sample=50
 *   npx tsx backend/scripts/migration/audit-user-unknown-fields.ts --target=staging --delete
 *
 * Flags:
 *   --target=       staging (default) | production
 *   --sample=N      Only scan first N docs (default: all docs)
 *   --delete        After reporting, DELETE all unknown fields (live run!)
 *   --concurrency=N Parallel writes when --delete (default: 20)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ─── CLI Args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const target = args.find((a) => a.startsWith('--target='))?.split('=')[1] ?? 'staging';
const sampleSize = Number(args.find((a) => a.startsWith('--sample='))?.split('=')[1] ?? '0');
const doDelete = args.includes('--delete');
const CONCURRENCY = Number(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? '20');
const PAGE_SIZE = 300;

// ─── Firebase Init ────────────────────────────────────────────────────────────

function initApp() {
  const appName = `audit-${target}`;
  try {
    return getApp(appName);
  } catch {
    /* not yet initialised */
  }

  const isProd = target === 'production';
  const projectId = isProd
    ? (process.env['PRODUCTION_FIREBASE_PROJECT_ID'] ?? process.env['FIREBASE_PROJECT_ID'])
    : process.env['STAGING_FIREBASE_PROJECT_ID'];
  const clientEmail = isProd
    ? (process.env['PRODUCTION_FIREBASE_CLIENT_EMAIL'] ?? process.env['FIREBASE_CLIENT_EMAIL'])
    : process.env['STAGING_FIREBASE_CLIENT_EMAIL'];
  const privateKey = (
    isProd
      ? (process.env['PRODUCTION_FIREBASE_PRIVATE_KEY'] ?? process.env['FIREBASE_PRIVATE_KEY'])
      : process.env['STAGING_FIREBASE_PRIVATE_KEY']
  )?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(`Missing Firebase credentials for target="${target}"`);
  }

  return initializeApp(
    { credential: cert({ projectId, clientEmail, privateKey }), projectId },
    appName
  );
}

// ─── Allowlists (derived from TypeScript interfaces) ──────────────────────────

/**
 * All valid top-level keys on a User document.
 * Derived from packages/core/src/models/user/user.model.ts → User interface
 */
const ALLOWED_USER_FIELDS = new Set([
  // Core identity
  'id',
  'email',
  'emailVerified',
  'firstName',
  'lastName',
  'displayName',
  'username',
  'aboutMe',
  'profileImgs',
  'unicode',
  'gender',
  // Verification
  'verificationStatus',
  // Measurables (2026)
  'measurables',
  // Class / graduation
  'classOf',
  'academics',
  // Role & status
  'role',
  'status',
  // Sports
  'sports',
  'activeSportIndex',
  // Location & contact
  'location',
  'contact',
  'preferredContactMethod',
  // Team history
  'teamHistory',
  // Awards
  'awards',
  // Connected sources / emails
  'connectedSources',
  'connectedEmails',
  // Profile code
  'profileCode',
  // Role-specific data
  'coach',
  'director',
  'recruiter',
  'parent',
  // Onboarding
  'onboardingCompleted',
  // Preferences
  'preferences',
  // Analytics
  '_counters',
  // Timestamps
  'createdAt',
  'updatedAt',
  'lastLoginAt',
  // Schema version
  '_schemaVersion',
  // Team code (legacy but still used by coaches)
  'teamCode',
]);

/**
 * All valid keys inside sports[i] (SportProfile interface).
 * Derived from packages/core/src/models/user/user-sport.model.ts → SportProfile
 */
const ALLOWED_SPORT_FIELDS = new Set([
  'sport',
  'order',
  'aboutMe',
  'positions',
  'jerseyNumber',
  'yearsExperience',
  'level',
  'side',
  'verifiedMetrics',
  'featuredMetrics',
  'featuredStats',
  'upcomingEvents',
  'archetype',
  'traits',
  'coach',
  'recruiting',
  'seasonRecord',
  'primaryVideo',
  'createdAt',
  'updatedAt',
]);

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FieldStats {
  count: number;
  samples: unknown[];
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const app = initApp();
  const db = getFirestore(app);

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  Audit User Unknown Fields`);
  console.log(`  Target  : ${target.toUpperCase()}`);
  console.log(`  Mode    : ${doDelete ? '⚠️  DELETE unknown fields (LIVE)' : 'REPORT only (dry)'}`);
  if (sampleSize > 0) console.log(`  Sample  : first ${sampleSize} docs`);
  console.log(`${'═'.repeat(70)}\n`);

  if (doDelete && target === 'production') {
    console.log('⚠️  WARNING: You are about to DELETE fields from PRODUCTION!');
    console.log('   Waiting 5 seconds... Press Ctrl+C to abort.\n');
    await new Promise((r) => setTimeout(r, 5000));
  }

  // ── Scan all Users ──────────────────────────────────────────────────────────
  const unknownTopLevel = new Map<string, FieldStats>();
  const unknownSportFields = new Map<string, FieldStats>();

  let totalDocs = 0;
  let docsWithUnknownFields = 0;
  let lastDoc: FirebaseFirestore.DocumentSnapshot | undefined;

  outer: while (true) {
    let q = db.collection('Users').orderBy('__name__').limit(PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      totalDocs++;
      if (sampleSize > 0 && totalDocs > sampleSize) break outer;

      const data = doc.data() as Record<string, unknown>;
      let hasUnknown = false;

      // Check top-level fields
      for (const key of Object.keys(data)) {
        if (!ALLOWED_USER_FIELDS.has(key)) {
          hasUnknown = true;
          const stats = unknownTopLevel.get(key) ?? { count: 0, samples: [] };
          stats.count++;
          if (stats.samples.length < 3) {
            const val = data[key];
            stats.samples.push(typeof val === 'object' ? '[object]' : val);
          }
          unknownTopLevel.set(key, stats);
        }
      }

      // Check sports[] fields
      const sports = data['sports'];
      if (Array.isArray(sports)) {
        for (const sport of sports as Record<string, unknown>[]) {
          if (!sport || typeof sport !== 'object') continue;
          for (const key of Object.keys(sport)) {
            if (!ALLOWED_SPORT_FIELDS.has(key)) {
              hasUnknown = true;
              const fqKey = `sports[].${key}`;
              const stats = unknownSportFields.get(fqKey) ?? { count: 0, samples: [] };
              stats.count++;
              if (stats.samples.length < 3) {
                const val = (sport as Record<string, unknown>)[key];
                stats.samples.push(typeof val === 'object' ? '[object]' : val);
              }
              unknownSportFields.set(fqKey, stats);
            }
          }
        }
      }

      if (hasUnknown) docsWithUnknownFields++;
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    process.stdout.write(`\r  Scanned: ${totalDocs} docs...`);

    if (snap.docs.length < PAGE_SIZE) break;
  }

  process.stdout.write('\n');

  // ── Report ──────────────────────────────────────────────────────────────────
  const allUnknown = [
    ...Array.from(unknownTopLevel.entries()).map(([k, v]) => ({
      location: 'top-level',
      key: k,
      ...v,
    })),
    ...Array.from(unknownSportFields.entries()).map(([k, v]) => ({
      location: 'sports[]',
      key: k,
      ...v,
    })),
  ].sort((a, b) => b.count - a.count);

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  Scanned: ${totalDocs} docs`);
  console.log(`  Docs with unknown fields: ${docsWithUnknownFields}`);
  console.log(`  Unknown field count: ${allUnknown.length}`);
  console.log(`${'─'.repeat(70)}\n`);

  if (allUnknown.length === 0) {
    console.log('  ✅ All User documents are clean — no unknown fields found!\n');
    return;
  }

  // Print table
  const COL1 = 40,
    COL2 = 8;
  console.log(`  ${'FIELD'.padEnd(COL1)} ${'COUNT'.padEnd(COL2)} SAMPLE`);
  console.log(`  ${'─'.repeat(COL1)} ${'─'.repeat(COL2)} ${'─'.repeat(20)}`);

  for (const { key, count, samples } of allUnknown) {
    const sampleStr = samples
      .map((s) => (typeof s === 'string' ? `"${s.slice(0, 30)}"` : String(s)))
      .join(', ');
    console.log(`  ${key.padEnd(COL1)} ${String(count).padEnd(COL2)} ${sampleStr}`);
  }

  console.log();

  // ── Delete (if flag set) ────────────────────────────────────────────────────
  if (!doDelete) {
    console.log(`  ℹ️  To delete these fields, re-run with --delete flag.\n`);
    return;
  }

  console.log(`\n  Deleting unknown fields from ${totalDocs} docs...\n`);

  // Build delete update object for each doc
  const topLevelKeysToDelete = Array.from(unknownTopLevel.keys());
  const sportFieldKeysToDelete = Array.from(unknownSportFields.keys()).map((k) =>
    k.replace('sports[].', '')
  );

  let cursor: FirebaseFirestore.DocumentSnapshot | undefined;
  let updated = 0;
  let skipped = 0;
  totalDocs = 0;

  const runBatch = async (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => {
    const promises = docs.map(async (doc) => {
      const data = doc.data() as Record<string, unknown>;
      const update: Record<string, unknown> = {};
      let dirty = false;

      // Delete unknown top-level fields
      for (const key of topLevelKeysToDelete) {
        if (key in data) {
          update[key] = FieldValue.delete();
          dirty = true;
        }
      }

      // Delete unknown sport fields
      if (sportFieldKeysToDelete.length > 0) {
        const sports = data['sports'];
        if (Array.isArray(sports)) {
          const cleanedSports = (sports as Record<string, unknown>[]).map((sport) => {
            if (!sport || typeof sport !== 'object') return sport;
            const cleaned = { ...sport };
            for (const key of sportFieldKeysToDelete) {
              delete cleaned[key];
            }
            return cleaned;
          });

          const sportsChanged = JSON.stringify(sports) !== JSON.stringify(cleanedSports);
          if (sportsChanged) {
            update['sports'] = cleanedSports;
            dirty = true;
          }
        }
      }

      if (!dirty) {
        skipped++;
        return;
      }

      await doc.ref.update(update);
      updated++;
    });

    await Promise.all(promises);
  };

  cursor = undefined;

  while (true) {
    let q = db.collection('Users').orderBy('__name__').limit(PAGE_SIZE);
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();
    if (snap.empty) break;

    // Process in concurrent batches
    for (let i = 0; i < snap.docs.length; i += CONCURRENCY) {
      const chunk = snap.docs.slice(i, i + CONCURRENCY);
      await runBatch(chunk);
      totalDocs += chunk.length;
      process.stdout.write(
        `\r  Processed: ${totalDocs} | Updated: ${updated} | Skipped: ${skipped}`
      );
    }

    cursor = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < PAGE_SIZE) break;
  }

  process.stdout.write('\n');
  console.log(`\n  ✅ Done! Updated: ${updated} | Skipped (already clean): ${skipped}\n`);
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message ?? err);
  process.exit(1);
});
