#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Phase 3 — Target Users Firestore Migration (Canary Test)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Migrates ONLY the 6 users in target-users.json from legacy Firestore (Users)
 * to staging V2 Firestore (users) with V3 schema transformation.
 *
 * This is a CANARY test migration before migrating all 4,843 users.
 *
 * Usage:
 *   npx tsx scripts/migration/migrate-target-users-data.ts --dry-run
 *   npx tsx scripts/migration/migrate-target-users-data.ts --apply
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

import {
  initLegacyApp,
  initTargetApp,
  isDryRun,
  isVerbose,
  hasFlag,
  COLLECTIONS,
  BatchWriter,
  printBanner,
  printSummary,
  writeReport,
} from './migration-utils.js';

// Import the transform function from the main migration script
// We'll define our own simplified version here for the 6 users

// ─── Load Target Users ────────────────────────────────────────────────────────

interface TargetUsersConfig {
  targetEmails: string[];
  migrationId: string;
  description: string;
}

interface UserMapping {
  email: string;
  uid: string;
  firestoreExists: boolean;
  authExists: boolean;
  firstName?: string;
  lastName?: string;
  role?: string;
}

function loadTargetUsers(): { emails: string[]; uids: Map<string, string> } {
  const configPath = resolve(__dirname, 'target-users.json');
  const mappingPath = resolve(__dirname, 'user-uid-mapping.json');

  const config: TargetUsersConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
  const mapping: { results: UserMapping[] } = JSON.parse(readFileSync(mappingPath, 'utf-8'));

  const emails = config.targetEmails;
  const uids = new Map<string, string>();

  for (const user of mapping.results) {
    if (emails.includes(user.email)) {
      uids.set(user.email, user.uid);
    }
  }

  return { emails, uids };
}

// ─── Simplified Transform (Import from migrate-users-to-v2.ts logic) ─────────

/**
 * For now, we'll just copy the data as-is with minimal transformation
 * to test the migration. Full schema transformation happens in migrate-users-to-v2.ts
 */
function transformLegacyUserSimple(
  docId: string,
  legacyData: Record<string, unknown>
): Record<string, unknown> {
  // Import core identity
  const email = String(legacyData['email'] || '')
    .trim()
    .toLowerCase();
  const firstName = String(legacyData['firstName'] || 'Unknown').trim();
  const lastName = String(legacyData['lastName'] || '').trim();
  const displayName =
    String(legacyData['displayName'] || '').trim() ||
    [firstName, lastName].filter(Boolean).join(' ');
  const unicode = String(legacyData['unicode'] || '').trim();
  const username =
    unicode || `${firstName.toLowerCase()}-${lastName.toLowerCase()}`.replace(/[^a-z0-9-]/g, '');

  // Profile images
  const profileImg = String(legacyData['profileImg'] || '').trim();
  const profileImgs: string[] = profileImg ? [profileImg] : [];

  // Role (simplified mapping)
  let role = String(legacyData['athleteOrParentOrCoach'] || 'athlete')
    .trim()
    .toLowerCase();
  if (role === 'parent') role = 'athlete'; // Parents stored as athletes
  if (role === '') role = 'athlete';

  // Migration metadata
  const now = new Date().toISOString();
  const createdAt = legacyData['createdAt']
    ? typeof legacyData['createdAt'] === 'object' &&
      legacyData['createdAt'] !== null &&
      'toDate' in legacyData['createdAt']
      ? (legacyData['createdAt'] as { toDate: () => Date }).toDate().toISOString()
      : String(legacyData['createdAt'])
    : now;

  // Build minimal V3 user
  const v3User: Record<string, unknown> = {
    // Core identity
    id: docId,
    email,
    emailVerified: true,
    firstName,
    lastName,
    displayName,
    username,
    unicode: unicode || null,
    aboutMe: String(legacyData['aboutMe'] || '').trim(),
    bannerImg: String(legacyData['bannerImg'] || '').trim() || null,
    profileImgs,
    gender: String(legacyData['gender'] || '').trim() || undefined,

    // Role
    role,
    status: 'active',

    // Copy legacy data as-is for now (we'll do full transformation later)
    _legacyData: legacyData,

    // Migration metadata
    _legacyId: docId,
    _migratedAt: now,
    _migratedFrom: `nxt-1-de054/${COLLECTIONS.LEGACY_USERS}`,
    _schemaVersion: 1, // Mark as V1 migration (we'll do V3 transformation later)

    // Timestamps
    createdAt,
    updatedAt: now,
    lastLoginAt:
      legacyData['lastLoginTime'] &&
      typeof legacyData['lastLoginTime'] === 'object' &&
      'toDate' in legacyData['lastLoginTime']
        ? (legacyData['lastLoginTime'] as { toDate: () => Date }).toDate().toISOString()
        : undefined,

    // Preferences (minimal)
    preferences: {
      notifications: {
        push: true,
        email: true,
        sms: false,
        marketing: true,
      },
      activityTracking: true,
      analyticsTracking: true,
      dismissedPrompts: [],
      defaultSportIndex: 0,
      theme: 'system',
      language: 'en',
    },

    // Counters
    _counters: {
      profileViews: Number(legacyData['profileViews']) || 0,
      videoViews: Number(legacyData['videoViews']) || 0,
      postsCount: 0,
      sharesCount: 0,
      highlightCount: 0,
      offerCount: 0,
      eventCount: 0,
    },
  };

  // Remove undefined values
  Object.keys(v3User).forEach((key) => {
    if (v3User[key] === undefined) delete v3User[key];
  });

  return v3User;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  printBanner('Phase 3 — Target Users Data Migration (Canary)');

  const { emails, uids } = loadTargetUsers();
  console.log(`  Target: ${emails.length} users`);
  console.log(`  Users: ${emails.join(', ')}\n`);

  const { db: legacyDb } = initLegacyApp();
  const { db: targetDb } = initTargetApp();

  const stats = {
    total: emails.length,
    migrated: 0,
    skipped: 0,
    errors: 0,
  };

  const errorLog: Array<{ email: string; uid: string; error: string }> = [];
  const writer = new BatchWriter(targetDb, isDryRun);

  for (const email of emails) {
    const uid = uids.get(email);
    if (!uid) {
      console.error(`  ❌ ${email} - UID not found in mapping`);
      stats.skipped++;
      continue;
    }

    try {
      console.log(`\n  Processing: ${email} (${uid})`);

      // Read from legacy Firestore
      const legacyDoc = await legacyDb.collection(COLLECTIONS.LEGACY_USERS).doc(uid).get();

      if (!legacyDoc.exists) {
        console.error(`    ❌ Legacy doc not found`);
        stats.skipped++;
        continue;
      }

      const legacyData = legacyDoc.data() as Record<string, unknown>;

      // Transform to V3
      const v3User = transformLegacyUserSimple(uid, legacyData);

      if (isVerbose) {
        console.log(`    ✓ Transformed:`);
        console.log(`      - Email: ${v3User['email']}`);
        console.log(`      - Name: ${v3User['firstName']} ${v3User['lastName']}`);
        console.log(`      - Role: ${v3User['role']}`);
        console.log(`      - Username: ${v3User['username']}`);
        console.log(`      - Profile Images: ${(v3User['profileImgs'] as string[]).length}`);
      }

      // Write to staging (preserve UID)
      const targetRef = targetDb.collection(COLLECTIONS.USERS).doc(uid);
      writer.set(targetRef, v3User);
      await writer.flushIfNeeded();

      stats.migrated++;
      console.log(`    ✅ Migrated to staging V2`);
    } catch (err) {
      stats.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errorLog.push({ email, uid: uid!, error: msg });
      console.error(`    ❌ Error: ${msg}`);
    }
  }

  // Flush remaining writes
  await writer.flush();

  // ─── Report ─────────────────────────────────────────────────────────
  const { writes, errors: writeErrors } = writer.stats;

  console.log('\n');
  printSummary('Migration Results', [
    ['Target Users', stats.total],
    ['Migrated', stats.migrated],
    ['Skipped', stats.skipped],
    ['Errors', stats.errors],
    ['Writes committed', writes],
    ['Write errors', writeErrors],
  ]);

  if (errorLog.length > 0) {
    console.log('\n  ⚠️  Errors:');
    for (const { email, uid, error } of errorLog) {
      console.log(`    - ${email} (${uid}): ${error}`);
    }
  }

  // Write JSON report
  writeReport(`target-users-data-migration-${new Date().toISOString().slice(0, 10)}.json`, {
    timestamp: new Date().toISOString(),
    dryRun: isDryRun,
    stats,
    errors: errorLog,
    users: emails,
  });

  console.log('\n  ✅ Target users data migration complete.\n');
  console.log('  Next steps:');
  console.log('    1. Login to staging app with migrated users');
  console.log('    2. Verify profile data displays correctly');
  console.log('    3. Check Firebase Console for user documents');
  console.log('    4. If OK, proceed to full migration with migrate-users-to-v2.ts\n');

  process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\n  FATAL:', err);
  process.exit(2);
});
