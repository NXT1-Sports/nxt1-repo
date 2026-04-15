#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Cleanup User Legacy Fields
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Removes legacy/duplicated fields from User documents in Firestore:
 *
 *   DELETED fields:
 *     - bannerImg                      (removed from model)
 *     - athlete                        (nested duplicate — academics already at top level)
 *     - teamCode                       (legacy join code, not part of new model)
 *
 *   UPDATED sports[] items (per-item field removal):
 *     - sports[i].profileImg           (removed from SportProfile)
 *     - sports[i].team                 (deprecated — use RosterEntries)
 *     - sports[i].clubTeam             (deprecated — use RosterEntries)
 *     - sports[i].metrics              (deprecated — use verifiedMetrics)
 *
 *   PROMOTED (before deletion):
 *     - If athlete.academics exists AND user.academics is empty → copy up
 *
 *   FIXED:
 *     - connectedSources[i].profileUrl: missing https:// prefix → prepended
 *
 * Usage:
 *   npx tsx backend/scripts/migration/cleanup-user-legacy-fields.ts --dry-run
 *   npx tsx backend/scripts/migration/cleanup-user-legacy-fields.ts --dry-run --uid=i1GWzZbhfaTPeErWgVAcYHSkHFg2
 *   npx tsx backend/scripts/migration/cleanup-user-legacy-fields.ts --target=staging --uid=i1GWzZbhfaTPeErWgVAcYHSkHFg2
 *   npx tsx backend/scripts/migration/cleanup-user-legacy-fields.ts --target=staging
 *   npx tsx backend/scripts/migration/cleanup-user-legacy-fields.ts --target=production
 *
 * Flags:
 *   --dry-run        Log actions only — do NOT write to Firestore
 *   --target=        staging (default) | production
 *   --uid=           Run on a single user only (for testing)
 *   --concurrency=N  Parallel writes (default: 10)
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
const isDryRun = args.includes('--dry-run');
const target = args.find((a) => a.startsWith('--target='))?.split('=')[1] ?? 'staging';
const singleUid = args.find((a) => a.startsWith('--uid='))?.split('=')[1];
const CONCURRENCY = Number(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? '10');
const PAGE_SIZE = 200;

// ─── Firebase Init ────────────────────────────────────────────────────────────

function initApp() {
  const appName = `cleanup-${target}`;
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

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, appName);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  processed: number;
  updated: number;
  skipped: number;
  fieldCounts: Record<string, number>;
}

// ─── Fix & Build Firestore Update ────────────────────────────────────────────

function buildUpdate(
  docId: string,
  data: Record<string, unknown>
): { updates: Record<string, unknown>; log: string[] } | null {
  const updates: Record<string, unknown> = {};
  const log: string[] = [];

  // ── 1. Promote athlete.academics to top-level (before deleting athlete) ──
  const athleteData = data['athlete'] as Record<string, unknown> | undefined;
  if (athleteData && !data['academics'] && athleteData['academics']) {
    updates['academics'] = athleteData['academics'];
    log.push(`  + PROMOTE athlete.academics → user.academics`);
  }

  // ── 2. Delete top-level legacy fields ─────────────────────────────────────
  for (const field of ['bannerImg', 'athlete', 'teamCode']) {
    if (Object.prototype.hasOwnProperty.call(data, field) && data[field] !== undefined) {
      updates[field] = FieldValue.delete();
      log.push(`  - DELETE ${field}`);
    }
  }

  // ── 3. Clean sports[] array ───────────────────────────────────────────────
  const sports = data['sports'];
  if (Array.isArray(sports) && sports.length > 0) {
    const SPORT_LEGACY = ['profileImg', 'team', 'clubTeam', 'metrics'];
    let sportsDirty = false;
    const cleanedSports = sports.map((s: Record<string, unknown>, idx: number) => {
      const cleaned = { ...s };
      for (const f of SPORT_LEGACY) {
        if (Object.prototype.hasOwnProperty.call(cleaned, f) && cleaned[f] !== undefined) {
          delete cleaned[f];
          log.push(`  - DELETE sports[${idx}].${f}`);
          sportsDirty = true;
        }
      }
      return cleaned;
    });
    if (sportsDirty) {
      updates['sports'] = cleanedSports;
    }
  }

  // ── 4. Fix connectedSources URLs ──────────────────────────────────────────
  const sources = data['connectedSources'];
  if (Array.isArray(sources) && sources.length > 0) {
    let sourcesDirty = false;
    const fixedSources = sources.map((s: Record<string, unknown>, idx: number) => {
      const url = s['profileUrl'];
      const platform = (s['platform'] as string | undefined)?.toLowerCase() ?? '';

      if (typeof url !== 'string' || url.length === 0 || url.startsWith('http')) {
        return s; // already fine
      }

      // Strip leading @ for handles
      const handle = url.replace(/^@/, '');
      let fixed: string | null = null;

      // Social platforms: username → full URL
      if (platform === 'twitter' || platform === 'x') {
        fixed = `https://twitter.com/${handle}`;
      } else if (platform === 'instagram') {
        fixed = `https://www.instagram.com/${handle}/`;
      } else if (platform === 'tiktok') {
        fixed = `https://www.tiktok.com/@${handle}`;
      } else if (url.includes('.')) {
        // Other platforms (hudl, youtube, maxpreps, etc.): only prepend if looks like a domain
        fixed = `https://${url}`;
      }
      // If url is a plain username with no dot and no known platform pattern → skip

      if (fixed) {
        log.push(`  ~ FIX connectedSources[${idx}] (${platform}): "${url}" → "${fixed}"`);
        sourcesDirty = true;
        return { ...s, profileUrl: fixed };
      }
      return s;
    });
    if (sourcesDirty) {
      updates['connectedSources'] = fixedSources;
    }
  }

  if (Object.keys(updates).length === 0) return null;

  // Always set updatedAt so we can track cleanup pass
  updates['updatedAt'] = new Date().toISOString();

  return { updates, log };
}

// ─── Process Single User ──────────────────────────────────────────────────────

async function processDoc(
  db: FirebaseFirestore.Firestore,
  snap: FirebaseFirestore.DocumentSnapshot,
  stats: Stats
): Promise<void> {
  stats.processed++;
  const data = snap.data() as Record<string, unknown>;
  const email = data['email'] as string | undefined;
  const result = buildUpdate(snap.id, data);

  if (!result) {
    stats.skipped++;
    return;
  }

  const { updates, log } = result;

  console.log(`\n[${isDryRun ? 'DRY' : 'LIVE'}] ${snap.id} (${email ?? 'no email'})`);
  for (const line of log) console.log(line);

  // Tally field-level stats
  for (const line of log) {
    const match = line.match(/(?:DELETE|PROMOTE|FIX) (.+?)(?:\[|:| →|$)/);
    if (match) {
      const key = match[1].trim();
      stats.fieldCounts[key] = (stats.fieldCounts[key] ?? 0) + 1;
    }
  }

  if (!isDryRun) {
    await snap.ref.update(updates);
    stats.updated++;
  } else {
    stats.updated++; // count as "would update" in dry-run
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  Cleanup User Legacy Fields');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Target  : ${target}`);
  console.log(`  Dry run : ${isDryRun}`);
  if (singleUid) console.log(`  UID     : ${singleUid}`);
  console.log('');

  const app = initApp();
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });

  const stats: Stats = { processed: 0, updated: 0, skipped: 0, fieldCounts: {} };

  // ── Single UID mode ────────────────────────────────────────────────────────
  if (singleUid) {
    const snap = await db.collection('Users').doc(singleUid).get();
    if (!snap.exists) {
      console.error(`ERROR: User ${singleUid} not found.`);
      process.exit(1);
    }
    await processDoc(db, snap, stats);
    printSummary(stats);
    return;
  }

  // ── Full collection (paginated, concurrent) ────────────────────────────────
  let cursor: FirebaseFirestore.DocumentSnapshot | undefined;
  let page = 0;

  while (true) {
    let q = db
      .collection('Users')
      .orderBy('createdAt', 'asc')
      .limit(PAGE_SIZE) as FirebaseFirestore.Query;
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();
    if (snap.empty) break;
    page++;

    // Process in parallel batches of CONCURRENCY
    for (let i = 0; i < snap.docs.length; i += CONCURRENCY) {
      const batch = snap.docs.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map((doc) => processDoc(db, doc, stats)));
      process.stdout.write(
        `\r  Page ${page} — processed ${stats.processed}, updated ${stats.updated}, skipped ${stats.skipped}  `
      );
    }

    cursor = snap.docs[snap.docs.length - 1];
  }

  process.stdout.write('\n');
  printSummary(stats);
}

function printSummary(stats: Stats) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  ${isDryRun ? 'DRY RUN COMPLETE' : 'CLEANUP COMPLETE'}`);
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Processed : ${stats.processed}`);
  console.log(`  Updated   : ${stats.updated}${isDryRun ? ' (would update)' : ''}`);
  console.log(`  Skipped   : ${stats.skipped} (already clean)`);
  if (Object.keys(stats.fieldCounts).length > 0) {
    console.log('\n  Field-level counts:');
    for (const [field, count] of Object.entries(stats.fieldCounts).sort()) {
      console.log(`    ${field.padEnd(35)} ${count}`);
    }
  }
  console.log('');
}

main().catch((err) => {
  console.error('\n[FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});
