/**
 * @fileoverview Backfill B2C users whose personal trial credits are already depleted.
 *
 * Scans individual wallet documents, finds unpaid personal users at zero-or-less balance,
 * derives their latest personal usage context, and syncs the B2C Users Notion stage to
 * `Trial Credits Finished`.
 *
 * Usage:
 *   cd backend && npx tsx scripts/sync-b2c-trial-credits-finished-notion.ts [--dry-run] [--env=production|staging]
 */

import 'dotenv/config';
import { execSync } from 'node:child_process';

if (!process.env['NOTION_API_TOKEN']) {
  process.env['NOTION_API_TOKEN'] = 'ntn_b38264946492oyCJBDyZyII01etd90y3sByx28xZPJ2buq';
}
if (!process.env['PRODUCTION_NOTION_B2C_USERS_DATABASE_ID']) {
  process.env['PRODUCTION_NOTION_B2C_USERS_DATABASE_ID'] = '9bbfe296a14a4a0a8eac2c45cb796b4b';
}
if (!process.env['NOTION_SIGNUP_DASHBOARD_ENABLED']) {
  process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] = 'true';
}

if (!process.env['FIREBASE_PRIVATE_KEY'] || !process.env['FIREBASE_CLIENT_EMAIL']) {
  try {
    const clientEmail = execSync(
      'gcloud secrets versions access latest --secret=FIREBASE_CLIENT_EMAIL --project=nxt-1-v2',
      { encoding: 'utf8' }
    ).trim();
    const privateKey = execSync(
      'gcloud secrets versions access latest --secret=FIREBASE_PRIVATE_KEY --project=nxt-1-v2',
      { encoding: 'utf8' }
    ).trim();
    if (clientEmail && privateKey) {
      process.env['FIREBASE_PROJECT_ID'] = 'nxt-1-v2';
      process.env['FIREBASE_CLIENT_EMAIL'] = clientEmail;
      process.env['FIREBASE_PRIVATE_KEY'] = privateKey;
    }
  } catch {
    // Best effort loading from gcloud Secret Manager.
  }
}

interface SyncCliArgs {
  readonly isDryRun: boolean;
  readonly environment: 'production' | 'staging';
  readonly limit?: number;
}

interface TrialUsageContext {
  readonly operationId?: string;
  readonly feature?: string;
  readonly unitCostSnapshot?: number;
}

function report(message: string, details?: Record<string, unknown>): void {
  console.info(message);
  if (details) {
    console.info(JSON.stringify(details, null, 2));
  }
}

function incrementReason(
  counts: Map<string, number>,
  reason: string,
  sampleUserIds: Map<string, string[]>,
  userId?: string
): void {
  counts.set(reason, (counts.get(reason) ?? 0) + 1);
  if (!userId) return;

  const current = sampleUserIds.get(reason) ?? [];
  if (current.length < 5) {
    current.push(userId);
    sampleUserIds.set(reason, current);
  }
}

function parseCliArgs(): SyncCliArgs {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const envArg = args.find((arg) => arg.startsWith('--env='));
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const parsedLimit = limitArg ? Number.parseInt(limitArg.split('=')[1] ?? '', 10) : NaN;

  return {
    isDryRun,
    environment: envArg?.split('=')[1] === 'staging' ? 'staging' : 'production',
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
  };
}

function compactText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function hasCreatedLifecycleState(user: Record<string, unknown>, key: string): boolean {
  const lifecycle = user['lifecycle'] as Record<string, unknown> | undefined;
  const b2cUsers = lifecycle?.['b2cUsers'] as Record<string, unknown> | undefined;
  const raw = b2cUsers?.[key] as Record<string, unknown> | undefined;
  if (!raw) return false;

  const status = raw['status'];
  if (status === 'inactive') return false;
  if (status === 'created') return true;

  return Boolean(raw['pageId']) || Boolean(raw['createdAt']);
}

function resolveLifecycleUsageContext(user: Record<string, unknown>): TrialUsageContext {
  const lifecycle = user['lifecycle'] as Record<string, unknown> | undefined;
  const b2cUsers = lifecycle?.['b2cUsers'] as Record<string, unknown> | undefined;
  const trial = b2cUsers?.['trialCreditsFinished'] as Record<string, unknown> | undefined;
  const usageStarted = b2cUsers?.['usageStarted'] as Record<string, unknown> | undefined;
  const organizationMode = b2cUsers?.['organizationMode'] as Record<string, unknown> | undefined;

  const candidates = [trial, usageStarted, organizationMode].filter(
    (value): value is Record<string, unknown> => Boolean(value)
  );

  for (const candidate of candidates) {
    const operationId = compactText(candidate['operationId']);
    const feature = compactText(candidate['feature']);
    const amountCents =
      typeof candidate['amountCents'] === 'number' ? candidate['amountCents'] : undefined;
    const balanceCents =
      typeof candidate['balanceCents'] === 'number' ? candidate['balanceCents'] : undefined;
    if (operationId && feature) {
      return {
        operationId,
        feature,
        unitCostSnapshot: amountCents ?? balanceCents,
      };
    }
  }

  return {};
}

function resolveWalletOwnerId(docId: string, wallet: Record<string, unknown>): string | undefined {
  return compactText(wallet['ownerId']) ?? (docId.startsWith('org:') ? undefined : docId);
}

function isSupportedPersonalProvider(wallet: Record<string, unknown>): boolean {
  return wallet['paymentProvider'] === 'stripe' || wallet['paymentProvider'] === 'iap';
}

function resolveBaselineCents(balanceCents: number, unitCostSnapshot?: number): number {
  const priorEstimate =
    balanceCents + (typeof unitCostSnapshot === 'number' ? unitCostSnapshot : 0);
  return Math.max(1, Math.ceil(priorEstimate));
}

async function syncB2CTrialCreditsFinishedToNotion(): Promise<void> {
  const { ensureMongoDBConnected } = await import('../src/config/database.config.js');
  const { runWithMongoEnvironmentScope } =
    await import('../src/middleware/mongo/mongo-scope.context.js');
  const { UsageEventModel } = await import('../src/models/analytics/usage-event.model.js');
  const { PaymentLogModel } = await import('../src/models/billing/payment-log.model.js');
  const { COLLECTIONS } = await import('../src/modules/billing/config.js');
  const { db } = await import('../src/utils/firebase.js');
  const { logger } = await import('../src/utils/logger.js');
  const { recordB2CUsersTrialCreditsFinishedEntry } =
    await import('../src/services/marketing/lifecycle/b2c-users.service.js');

  const { isDryRun, environment, limit } = parseCliArgs();
  process.env['NODE_ENV'] = environment === 'production' ? 'production' : 'development';
  await ensureMongoDBConnected();

  report('[SyncB2CTrialCreditsFinished] Starting B2C Trial Credits Finished backfill', {
    isDryRun,
    environment,
    limit: limit ?? null,
  });
  logger.info('[SyncB2CTrialCreditsFinished] Starting B2C Trial Credits Finished backfill', {
    isDryRun,
    environment,
    limit: limit ?? null,
  });

  let walletQuery = db.collection(COLLECTIONS.WALLETS).where('ownerType', '==', 'individual');
  if (limit) {
    walletQuery = walletQuery.limit(limit);
  }

  const snapshot = await walletQuery.get();

  report(
    `[SyncB2CTrialCreditsFinished] Found ${snapshot.docs.length} personal wallet rows to inspect.`
  );
  logger.info(
    `[SyncB2CTrialCreditsFinished] Found ${snapshot.docs.length} personal wallet rows to inspect.`
  );

  let candidateCount = 0;
  let successCount = 0;
  let existingCount = 0;
  let skipCount = 0;
  let failCount = 0;
  const skipReasons = new Map<string, number>();
  const skipReasonSamples = new Map<string, string[]>();

  await runWithMongoEnvironmentScope(environment, async () => {
    for (const doc of snapshot.docs) {
      const wallet = doc.data() as Record<string, unknown>;
      const userId = resolveWalletOwnerId(doc.id, wallet);
      if (!userId) {
        skipCount++;
        incrementReason(skipReasons, 'missing-owner-id', skipReasonSamples);
        continue;
      }

      const balanceCents = typeof wallet['balanceCents'] === 'number' ? wallet['balanceCents'] : 0;
      if (balanceCents > 0) {
        skipCount++;
        incrementReason(skipReasons, 'positive-balance', skipReasonSamples, userId);
        continue;
      }

      if (!isSupportedPersonalProvider(wallet)) {
        skipCount++;
        incrementReason(skipReasons, 'unsupported-provider', skipReasonSamples, userId);
        continue;
      }

      const userSnap = await db.collection('Users').doc(userId).get();
      if (!userSnap.exists) {
        skipCount++;
        incrementReason(skipReasons, 'missing-user', skipReasonSamples, userId);
        logger.info(`[SyncB2CTrialCreditsFinished] Skipped ${userId}`, {
          reason: 'missing-user',
        });
        continue;
      }

      const user = userSnap.data() as Record<string, unknown>;
      if (
        hasCreatedLifecycleState(user, 'closedLost') ||
        hasCreatedLifecycleState(user, 'churned') ||
        hasCreatedLifecycleState(user, 'closedWon') ||
        hasCreatedLifecycleState(user, 'expansionPricing')
      ) {
        skipCount++;
        incrementReason(skipReasons, 'already-later-lifecycle-state', skipReasonSamples, userId);
        continue;
      }

      const hasPaidHistory = Boolean(
        await PaymentLogModel.findOne({
          userId,
          status: 'PAID',
          amountPaid: { $gt: 0 },
          $or: [
            { organizationId: { $exists: false } },
            { organizationId: null },
            { organizationId: '' },
          ],
        })
          .select({ _id: 1 })
          .lean()
          .exec()
      );

      if (hasPaidHistory) {
        skipCount++;
        incrementReason(skipReasons, 'paid-history', skipReasonSamples, userId);
        continue;
      }

      const latestPersonalUsage = await UsageEventModel.findOne({
        billedOwnerType: 'individual',
        billedOwnerId: userId,
      })
        .sort({ createdAt: -1 })
        .select({ feature: 1, unitCostSnapshot: 1, metadata: 1 })
        .lean<{
          feature?: string;
          unitCostSnapshot?: number;
          metadata?: Record<string, unknown>;
        }>()
        .exec();

      const lifecycleUsage = resolveLifecycleUsageContext(user);
      const operationId =
        compactText(latestPersonalUsage?.metadata?.['operationId']) ?? lifecycleUsage.operationId;
      const feature = compactText(latestPersonalUsage?.feature) ?? lifecycleUsage.feature;
      const unitCostSnapshot =
        typeof latestPersonalUsage?.unitCostSnapshot === 'number'
          ? latestPersonalUsage.unitCostSnapshot
          : lifecycleUsage.unitCostSnapshot;

      if (!operationId || !feature) {
        skipCount++;
        incrementReason(skipReasons, 'missing-usage-context', skipReasonSamples, userId);
        logger.info(`[SyncB2CTrialCreditsFinished] Skipped ${userId}`, {
          reason: 'missing-usage-context',
          balanceCents,
        });
        continue;
      }

      candidateCount++;
      const baselineCents = resolveBaselineCents(balanceCents, unitCostSnapshot);
      const email =
        compactText(user['email']) ??
        compactText((user['contact'] as Record<string, unknown> | undefined)?.['email']) ??
        'N/A';

      if (isDryRun) {
        report(`[DRY RUN] Would sync Trial Credits Finished for ${userId} (${email})`, {
          balanceCents,
          baselineCents,
          feature,
          operationId,
        });
        logger.info(`[DRY RUN] Would sync Trial Credits Finished for ${userId} (${email})`, {
          balanceCents,
          baselineCents,
          feature,
          operationId,
        });
        continue;
      }

      try {
        const result = await recordB2CUsersTrialCreditsFinishedEntry({
          db,
          userId,
          operationId,
          feature,
          baselineCents,
          newBalanceCents: balanceCents,
          environment,
        });

        if (result.status === 'created') {
          successCount++;
        } else if (result.status === 'existing') {
          existingCount++;
        } else if (result.status === 'skipped') {
          skipCount++;
          incrementReason(
            skipReasons,
            `lifecycle-helper:${'reason' in result ? result.reason : 'unknown'}`,
            skipReasonSamples,
            userId
          );
        } else {
          failCount++;
        }

        logger.info(`[SyncB2CTrialCreditsFinished] Processed ${userId} (${email})`, {
          status: result.status,
          reason: 'reason' in result ? result.reason : undefined,
          pageId: 'pageId' in result ? result.pageId : undefined,
          pageUrl: 'pageUrl' in result ? result.pageUrl : undefined,
        });
      } catch (error) {
        failCount++;
        logger.error(`[SyncB2CTrialCreditsFinished] Exception processing ${userId} (${email})`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });

  report('[SyncB2CTrialCreditsFinished] Finished B2C Trial Credits Finished backfill', {
    totalWalletRows: snapshot.docs.length,
    candidateCount,
    successCount,
    existingCount,
    skipCount,
    failCount,
    skipReasons: Object.fromEntries(skipReasons),
    skipReasonSamples: Object.fromEntries(skipReasonSamples),
    isDryRun,
  });
  logger.info('[SyncB2CTrialCreditsFinished] Finished B2C Trial Credits Finished backfill', {
    totalWalletRows: snapshot.docs.length,
    candidateCount,
    successCount,
    existingCount,
    skipCount,
    failCount,
    skipReasons: Object.fromEntries(skipReasons),
    isDryRun,
  });
}

syncB2CTrialCreditsFinishedToNotion()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[SyncB2CTrialCreditsFinished] Fatal error', error);
    process.exit(1);
  });
