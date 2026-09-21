/**
 * @fileoverview Direct standalone script to backfill/refresh all B2C Users Activity (Last Active + Engagement) in Notion.
 *
 * Runs directly against production Firestore & Notion without going through tsx-unfriendly intermediate barrel files.
 */

import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import type { NotionProperties } from '../src/services/marketing/integrations/notion/notion-client.service.js';

const __filename = fileURLToPath(import.meta.url);
const backendRoot = resolve(__filename, '../..');
loadDotenv({ path: resolve(backendRoot, '.env') });
loadDotenv({ path: resolve(backendRoot, '.env.local'), override: true });

const environment = 'production';

// Dynamic imports of minimal modules
const { db } = await import('../src/utils/firebase.js');
const {
  getNotionB2CUsersConfig,
  getNotionSignupDashboardDisabledReason,
  updateNotionSignupDashboardPage,
} = await import('../src/services/marketing/integrations/notion/notion-client.service.js');
const { normalizeIsoDate } =
  await import('../src/services/marketing/integrations/notion/notion-property-helpers.js');
const { resolveEngagement } =
  await import('../src/services/marketing/integrations/notion/b2c-users-entry.service.js');

console.log(`\n🚀 Starting B2C Users Activity Refresh Backfill (${environment})...\n`);

const config = getNotionB2CUsersConfig(environment);
const disabledReason = getNotionSignupDashboardDisabledReason(config);
if (disabledReason) {
  console.error('❌ Notion B2C integration is disabled:', disabledReason);
  process.exit(1);
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number.parseInt(limitArg.split('=')[1] ?? '', 10) : undefined;
const batchSizeArg = args.find((a) => a.startsWith('--batch-size='));
const batchSize = batchSizeArg ? Number.parseInt(batchSizeArg.split('=')[1] ?? '', 10) : 100;

console.log(
  `Configuration: force=${force}, dryRun=${dryRun}, limit=${limit ?? 'ALL'}, batchSize=${batchSize}`
);

const TERMINAL_STAGES = new Set(['closedLost', 'churned']);

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object') {
    const candidate = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof candidate.toDate === 'function') return candidate.toDate();
    const sec = candidate.seconds ?? candidate._seconds;
    if (typeof sec === 'number') return new Date(sec * 1000);
  }
  return null;
}

function resolveLastActiveAt(user: Record<string, unknown>): Date | null {
  const candidates = [
    toDate(user['lastLoginAt']),
    toDate(user['agentXLastActiveAt']),
    toDate(user['updatedAt']),
    toDate(user['onboardingCompletedAt']),
  ].filter((v): v is Date => Boolean(v));

  return candidates.reduce<Date | null>(
    (latest, candidate) => (!latest || candidate.getTime() > latest.getTime() ? candidate : latest),
    null
  );
}

function resolveKnownB2CPage(
  user: Record<string, unknown>
): { stateKey: string; pageId: string } | null {
  const b2c =
    user['lifecycle'] && typeof user['lifecycle'] === 'object'
      ? ((user['lifecycle'] as Record<string, unknown>)['b2cUsers'] as
          | Record<string, unknown>
          | undefined)
      : undefined;
  if (!b2c) return null;

  const priorityKeys = [
    'churned',
    'closedLost',
    'organizationMode',
    'expansionPricing',
    'closedWon',
    'trialCreditsFinished',
    'usageStarted',
    'accountStarted',
  ];

  for (const k of priorityKeys) {
    const st = b2c[k] as Record<string, unknown> | undefined;
    if (st && (st['status'] === 'created' || st['pageId']) && st['status'] !== 'inactive') {
      const pageId = typeof st['pageId'] === 'string' ? st['pageId'] : undefined;
      if (pageId) return { stateKey: k, pageId };
    }
  }
  return null;
}

let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
let hasMore = true;
let processed = 0;
let updated = 0;
let skipped = 0;
let failed = 0;
const skipReasons: Record<string, number> = {};

function recordSkip(reason: string) {
  skipped++;
  skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
}

while (hasMore) {
  const fetchLimit = limit ? Math.min(batchSize, limit - processed) : batchSize;
  if (fetchLimit <= 0) break;

  let query: FirebaseFirestore.Query = db
    .collection('Wallets')
    .where('ownerType', '==', 'individual')
    .limit(fetchLimit);

  if (lastDoc) {
    query = query.startAfter(lastDoc);
  }

  const snapshot = await query.get();
  if (snapshot.empty) break;

  lastDoc = snapshot.docs[snapshot.docs.length - 1];

  for (const doc of snapshot.docs) {
    processed++;
    const userId = doc.data()['ownerId'] as string | undefined;
    if (!userId) {
      recordSkip('missing-owner-id');
      continue;
    }

    try {
      const userSnap = await db.collection('Users').doc(userId).get();
      if (!userSnap.exists) {
        recordSkip('missing-user-doc');
        continue;
      }

      const user = userSnap.data() as Record<string, unknown>;
      const pageInfo = resolveKnownB2CPage(user);
      if (!pageInfo) {
        recordSkip('missing-notion-page');
        continue;
      }

      if (TERMINAL_STAGES.has(pageInfo.stateKey)) {
        recordSkip('terminal-stage');
        continue;
      }

      const lastActiveAt = resolveLastActiveAt(user);
      const engagement = resolveEngagement(lastActiveAt);
      const normalizedLastActiveAt = lastActiveAt ? lastActiveAt.toISOString() : null;

      const activitySync = (user['lifecycle'] as Record<string, unknown> | undefined)?.['b2cUsers']
        ? (((user['lifecycle'] as Record<string, unknown>)['b2cUsers'] as Record<string, unknown>)[
            'activitySync'
          ] as Record<string, unknown> | undefined)
        : undefined;

      const isAlreadyCurrent =
        !force &&
        activitySync &&
        activitySync['lastActiveAt'] === normalizedLastActiveAt &&
        activitySync['engagement'] === engagement;

      if (isAlreadyCurrent) {
        recordSkip('already-current');
        continue;
      }

      const displayName =
        user['displayName'] ||
        `${user['firstName'] ?? ''} ${user['lastName'] ?? ''}`.trim() ||
        userId;
      console.log(
        `[Update] ${displayName} (${pageInfo.pageId}): LastActive=${normalizedLastActiveAt ?? 'none'}, Engagement=${engagement}`
      );

      if (dryRun) {
        updated++;
        continue;
      }

      const properties: Record<string, unknown> = {
        Engagement: { select: { name: engagement } },
      };
      const iso = normalizeIsoDate(lastActiveAt);
      if (iso) {
        properties['Last Active'] = { date: { start: iso } };
      }

      await updateNotionSignupDashboardPage({
        config,
        pageId: pageInfo.pageId,
        properties: properties as NotionProperties,
      });

      await db
        .collection('Users')
        .doc(userId)
        .set(
          {
            lifecycle: {
              b2cUsers: {
                activitySync: {
                  lastActiveAt: normalizedLastActiveAt,
                  engagement,
                  refreshedAt: new Date().toISOString(),
                },
              },
            },
          },
          { merge: true }
        );

      updated++;

      // Small throttle to stay well under Notion's 3 requests/sec rate limit
      await new Promise((resolve) => setTimeout(resolve, 350));
    } catch (err) {
      console.error(`[Error] User ${userId}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  if (snapshot.docs.length < fetchLimit) {
    hasMore = false;
  }
}

console.log('\n========================================');
console.log(`🎉 B2C Users Activity Refresh Finished`);
console.log(`   Total Processed: ${processed}`);
console.log(`   Updated:         ${updated}`);
console.log(`   Skipped:         ${skipped}`);
console.log(`   Failed:          ${failed}`);
console.log('   Skip breakdown: ', skipReasons);
console.log('========================================\n');
