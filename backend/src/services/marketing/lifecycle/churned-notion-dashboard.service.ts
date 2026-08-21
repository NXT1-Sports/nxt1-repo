/**
 * @fileoverview Churned Notion Dashboard Lifecycle Service
 * @module @nxt1/backend/services/marketing/lifecycle/churned-notion-dashboard
 *
 * Promotes the matching B2B Partners row to `Churned` when an organization
 * has zero credits and no successful payment activity for the configured grace
 * period.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { ensureMongoDBConnected } from '../../../config/database.config.js';
import type { UserV2Document } from '../../../routes/auth/shared.js';
import { logger } from '../../../utils/logger.js';
import { COLLECTIONS } from '../../../modules/billing/config.js';
import type { PaymentLogDocument } from '../../../models/billing/payment-log.model.js';
import { PaymentLogModel } from '../../../models/billing/payment-log.model.js';
import {
  assertNotionPageStatus,
  getNotionSignupDashboardConfig,
  getNotionSignupDashboardDisabledReason,
  type NotionProperties,
  updateNotionSignupDashboardPage,
} from '../integrations/notion/notion-client.service.js';
import {
  buildB2BPartnerLookupContext,
  queryExistingB2BPartnerPage,
  resolveB2BOrganizationNameHints,
} from './b2b-partner-lookup.service.js';

const DEFAULT_CHURN_GRACE_DAYS = 30;
const CHURNED_NOTION_ENVIRONMENT = 'production';

export type ChurnedNotionDashboardStatus =
  | 'queued'
  | 'processing'
  | 'created'
  | 'failed'
  | 'skipped';

export interface ChurnedNotionDashboardStateRecord {
  readonly status?: ChurnedNotionDashboardStatus;
  readonly environment?: 'production' | 'staging';
  readonly queuedAt?: Date;
  readonly processingStartedAt?: Date;
  readonly createdAt?: Date;
  readonly pageId?: string;
  readonly pageUrl?: string;
  readonly lastError?: string;
  readonly organizationId?: string;
  readonly lastPaidAt?: Date;
  readonly zeroBalanceSinceAt?: Date;
  readonly eligibleAt?: Date;
  readonly graceDays?: number;
  readonly balanceCents?: number;
  readonly initiatedByUserId?: string;
}

export interface RecordChurnedNotionDashboardInput {
  readonly db: Firestore;
  readonly organizationId: string;
  readonly userId: string;
  readonly email: string;
  readonly lastPaidAt: Date;
  readonly zeroBalanceSinceAt: Date;
  readonly balanceCents: number;
  readonly graceDays?: number;
}

export type RecordChurnedNotionDashboardResult =
  | { readonly status: 'created'; readonly pageId?: string; readonly pageUrl?: string }
  | {
      readonly status: 'skipped';
      readonly reason:
        | 'not-yet-eligible'
        | 'no-paid-history'
        | 'already-created'
        | 'missing-email'
        | 'missing-existing-row'
        | 'disabled'
        | 'missing-token'
        | 'missing-database-id';
    }
  | { readonly status: 'failed'; readonly reason: 'notion-update-failed' | 'state-update-failed' };

type RecordChurnedSkipReason = Extract<
  RecordChurnedNotionDashboardResult,
  { readonly status: 'skipped' }
>['reason'];

export interface RunChurnedNotionDashboardSyncInput {
  readonly db: Firestore;
  readonly now?: Date;
  readonly limit?: number;
  readonly graceDays?: number;
}

export interface ChurnedNotionDashboardProcessingResult {
  readonly organizationId: string;
  readonly userId?: string;
  readonly outcome: 'created' | 'skipped' | 'failed';
  readonly reason?: string;
  readonly pageId?: string;
  readonly pageUrl?: string;
}

export interface RunChurnedNotionDashboardSyncResult {
  readonly processedCount: number;
  readonly createdCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
  readonly results: ChurnedNotionDashboardProcessingResult[];
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

function resolveGraceDays(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    return Math.min(Math.floor(value), 365);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.min(parsed, 365);
    }
  }

  return DEFAULT_CHURN_GRACE_DAYS;
}

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
    const seconds =
      typeof candidate.seconds === 'number'
        ? candidate.seconds
        : typeof candidate._seconds === 'number'
          ? candidate._seconds
          : null;
    return seconds === null ? null : new Date(seconds * 1000);
  }

  return null;
}

function compactText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function getChurnedState(user: UserV2Document): ChurnedNotionDashboardStateRecord | null {
  const raw = user.lifecycle?.sales?.churned;
  if (!raw) return null;

  return {
    status: raw.status,
    environment: raw.environment,
    queuedAt: toDate(raw.queuedAt) ?? undefined,
    processingStartedAt: toDate(raw.processingStartedAt) ?? undefined,
    createdAt: toDate(raw.createdAt) ?? undefined,
    pageId: raw.pageId,
    pageUrl: raw.pageUrl,
    lastError: raw.lastError,
    organizationId: raw.organizationId,
    lastPaidAt: toDate(raw.lastPaidAt) ?? undefined,
    zeroBalanceSinceAt: toDate(raw.zeroBalanceSinceAt) ?? undefined,
    eligibleAt: toDate(raw.eligibleAt) ?? undefined,
    graceDays: raw.graceDays,
    balanceCents: raw.balanceCents,
    initiatedByUserId: raw.initiatedByUserId,
  };
}

function buildChurnedPromotionProperties(): NotionProperties {
  return {
    Stage: { status: { name: 'Churned' } },
    'Next Action': {
      rich_text: [
        {
          type: 'text',
          text: {
            content: 'Run a win-back review and capture why the account stopped buying credits.',
          },
        },
      ],
    },
  };
}

async function resolveBillingOwnerAndEmail(
  db: Firestore,
  organizationId: string
): Promise<{ readonly userId: string; readonly email: string } | null> {
  const orgSnap = await db.collection('Organizations').doc(organizationId).get();
  if (!orgSnap.exists) return null;

  const org = orgSnap.data() as Record<string, unknown> | undefined;
  const userId = compactText(
    (org?.['billingOwnerUid'] as string | undefined) ?? (org?.['ownerId'] as string | undefined)
  );
  if (!userId) return null;

  const orgEmail = compactText(
    (org?.['billingEmail'] as string | undefined) ?? (org?.['email'] as string | undefined)
  );
  if (orgEmail) {
    return { userId, email: orgEmail };
  }

  const userSnap = await db.collection('Users').doc(userId).get();
  if (!userSnap.exists) return null;

  const user = userSnap.data() as UserV2Document | undefined;
  const email = compactText(user?.email);
  return email ? { userId, email } : null;
}

async function getLatestOrgPaymentAt(organizationId: string): Promise<Date | null> {
  await ensureMongoDBConnected();

  const payment = await PaymentLogModel.findOne({
    organizationId,
    status: 'PAID',
    amountPaid: { $gt: 0 },
    type: { $in: ['org_wallet_topup', 'org_invoice_topup'] },
  })
    .sort({ createdAt: -1 })
    .lean<PaymentLogDocument>()
    .exec();

  if (payment?.createdAt instanceof Date) {
    return payment.createdAt;
  }

  return null;
}

async function updateChurnedState(
  db: Firestore,
  userId: string,
  patch: Partial<ChurnedNotionDashboardStateRecord>
): Promise<void> {
  await db
    .collection('Users')
    .doc(userId)
    .set(
      {
        lifecycle: {
          sales: {
            churned: patch,
          },
        },
      },
      { merge: true }
    );
}

async function reserveChurnedSignal(input: RecordChurnedNotionDashboardInput): Promise<
  | {
      readonly status: 'queued';
      readonly state: ChurnedNotionDashboardStateRecord;
      readonly email: string;
    }
  | { readonly status: 'skipped'; readonly reason: RecordChurnedSkipReason }
  | { readonly status: 'failed'; readonly reason: 'state-update-failed' }
> {
  const graceDays = resolveGraceDays(input.graceDays);
  const eligibleAt = addDays(input.lastPaidAt, graceDays);
  if (eligibleAt > new Date()) {
    return { status: 'skipped', reason: 'not-yet-eligible' };
  }

  const userRef = input.db.collection('Users').doc(input.userId);

  try {
    const result = await input.db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        return { status: 'skipped', reason: 'missing-existing-row' } as const;
      }

      const user = userSnap.data() as UserV2Document;
      const state = getChurnedState(user);
      const email = compactText(user.email);

      if (!email) {
        return { status: 'skipped', reason: 'missing-email' } as const;
      }

      if (
        state?.status === 'created' ||
        state?.status === 'processing' ||
        state?.status === 'queued'
      ) {
        return { status: 'skipped', reason: 'already-created' } as const;
      }

      const nextState: ChurnedNotionDashboardStateRecord = {
        status: 'queued',
        environment: CHURNED_NOTION_ENVIRONMENT,
        queuedAt: new Date(),
        organizationId: input.organizationId,
        lastPaidAt: input.lastPaidAt,
        zeroBalanceSinceAt: input.zeroBalanceSinceAt,
        eligibleAt,
        graceDays,
        balanceCents: input.balanceCents,
      };

      transaction.set(
        userRef,
        {
          lifecycle: {
            sales: {
              churned: nextState,
            },
          },
        },
        { merge: true }
      );

      return { status: 'queued', state: nextState, email } as const;
    });

    return result;
  } catch (error) {
    logger.error('[ChurnedNotionDashboard] Failed to reserve churn signal', {
      organizationId: input.organizationId,
      userId: input.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'failed', reason: 'state-update-failed' };
  }
}

export async function recordChurnedNotionDashboardEntry(
  input: RecordChurnedNotionDashboardInput
): Promise<RecordChurnedNotionDashboardResult> {
  const reservation = await reserveChurnedSignal(input);
  if (reservation.status !== 'queued') {
    return reservation;
  }

  const config = getNotionSignupDashboardConfig(CHURNED_NOTION_ENVIRONMENT);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);
  if (disabledReason) {
    await updateChurnedState(input.db, input.userId, {
      status: 'failed',
      environment: CHURNED_NOTION_ENVIRONMENT,
      lastError: `Notion churn sync is ${disabledReason}`,
    }).catch((error: unknown) => {
      logger.warn('[ChurnedNotionDashboard] Failed to persist disabled state', {
        organizationId: input.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return { status: 'skipped', reason: disabledReason };
  }

  const userSnap = await input.db.collection('Users').doc(input.userId).get();
  const user = userSnap.exists
    ? ((userSnap.data() as UserV2Document | undefined) ?? undefined)
    : undefined;
  const organizationHints = await resolveB2BOrganizationNameHints(input.db, input.organizationId);
  const lookupContext = buildB2BPartnerLookupContext({
    user,
    email: reservation.email,
    organizationName: organizationHints.organizationName,
    teamName: organizationHints.teamName,
  });

  if (!lookupContext) {
    await updateChurnedState(input.db, input.userId, {
      status: 'failed',
      environment: CHURNED_NOTION_ENVIRONMENT,
      lastError: 'Missing B2B lookup keys for Churned Notion sync',
    }).catch((error: unknown) => {
      logger.warn('[ChurnedNotionDashboard] Failed to persist missing-lookup state', {
        organizationId: input.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return { status: 'skipped', reason: 'missing-email' };
  }

  const existing = await queryExistingB2BPartnerPage({
    config,
    context: lookupContext,
  });

  if (!existing) {
    await updateChurnedState(input.db, input.userId, {
      status: 'failed',
      environment: CHURNED_NOTION_ENVIRONMENT,
      lastError: 'No B2B Partners row exists for the Churned sync',
    }).catch((error: unknown) => {
      logger.warn('[ChurnedNotionDashboard] Failed to persist missing-row state', {
        organizationId: input.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return { status: 'skipped', reason: 'missing-existing-row' };
  }

  try {
    const updated = await updateNotionSignupDashboardPage({
      config,
      pageId: existing.id,
      properties: buildChurnedPromotionProperties(),
    });

    await assertNotionPageStatus({
      config,
      pageId: updated.id,
      expectedStatus: 'Churned',
    });

    await updateChurnedState(input.db, input.userId, {
      status: 'created',
      environment: CHURNED_NOTION_ENVIRONMENT,
      createdAt: new Date(),
      pageId: updated.id,
      pageUrl: updated.url,
      organizationId: input.organizationId,
      lastPaidAt: input.lastPaidAt,
      zeroBalanceSinceAt: input.zeroBalanceSinceAt,
      eligibleAt: addDays(input.lastPaidAt, input.graceDays ?? DEFAULT_CHURN_GRACE_DAYS),
      graceDays: input.graceDays ?? DEFAULT_CHURN_GRACE_DAYS,
      balanceCents: input.balanceCents,
    }).catch((error: unknown) => {
      logger.warn('[ChurnedNotionDashboard] Failed to persist created state', {
        organizationId: input.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    logger.info('[ChurnedNotionDashboard] Promoted B2B Partners row to Churned', {
      organizationId: input.organizationId,
      userId: input.userId,
      pageId: updated.id,
      pageUrl: updated.url,
      lastPaidAt: input.lastPaidAt.toISOString(),
      zeroBalanceSinceAt: input.zeroBalanceSinceAt.toISOString(),
    });

    return { status: 'created', pageId: updated.id, pageUrl: updated.url };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateChurnedState(input.db, input.userId, {
      status: 'failed',
      environment: CHURNED_NOTION_ENVIRONMENT,
      lastError: message,
    }).catch((stateError: unknown) => {
      logger.warn('[ChurnedNotionDashboard] Failed to persist failure state', {
        organizationId: input.organizationId,
        error: stateError instanceof Error ? stateError.message : String(stateError),
      });
    });

    logger.error('[ChurnedNotionDashboard] Notion sync failed', {
      organizationId: input.organizationId,
      userId: input.userId,
      error: message,
    });

    return { status: 'failed', reason: 'notion-update-failed' };
  }
}

export async function runChurnedNotionDashboardSync(
  input: RunChurnedNotionDashboardSyncInput
): Promise<RunChurnedNotionDashboardSyncResult> {
  const graceDays = resolveGraceDays(input.graceDays ?? process.env['NOTION_CHURNED_GRACE_DAYS']);
  const limit = input.limit && input.limit > 0 ? Math.min(Math.floor(input.limit), 500) : 250;
  const now = input.now ?? new Date();

  const snapshot = await input.db
    .collection(COLLECTIONS.WALLETS)
    .where('ownerType', '==', 'organization')
    .limit(limit)
    .get();

  const results: ChurnedNotionDashboardProcessingResult[] = [];

  for (const doc of snapshot.docs) {
    const wallet = doc.data() as Record<string, unknown>;
    const organizationId = compactText(wallet['ownerId'] as string | undefined);
    if (!organizationId) {
      continue;
    }

    const balanceCents = typeof wallet['balanceCents'] === 'number' ? wallet['balanceCents'] : 0;
    if (balanceCents > 0) {
      results.push({ organizationId, outcome: 'skipped', reason: 'balance-not-zero' });
      continue;
    }

    const paymentProvider = wallet['paymentProvider'];
    if (paymentProvider !== 'stripe') {
      results.push({ organizationId, outcome: 'skipped', reason: 'unsupported-provider' });
      continue;
    }

    const orgAndEmail = await resolveBillingOwnerAndEmail(input.db, organizationId);
    if (!orgAndEmail) {
      results.push({ organizationId, outcome: 'skipped', reason: 'missing-existing-row' });
      continue;
    }

    const userSnap = await input.db.collection('Users').doc(orgAndEmail.userId).get();
    if (!userSnap.exists) {
      results.push({
        organizationId,
        userId: orgAndEmail.userId,
        outcome: 'skipped',
        reason: 'missing-existing-row',
      });
      continue;
    }

    const user = userSnap.data() as UserV2Document;
    const churnState = getChurnedState(user);
    if (
      churnState?.status === 'created' ||
      churnState?.status === 'queued' ||
      churnState?.status === 'processing'
    ) {
      results.push({
        organizationId,
        userId: orgAndEmail.userId,
        outcome: 'skipped',
        reason: 'already-created',
      });
      continue;
    }

    const trialDepletedAt = toDate(user.lifecycle?.usage?.trialCreditsFinished?.depletedAt) ?? null;
    const lastPaidAt = await getLatestOrgPaymentAt(organizationId);
    if (!lastPaidAt) {
      results.push({
        organizationId,
        userId: orgAndEmail.userId,
        outcome: 'skipped',
        reason: 'no-paid-history',
      });
      continue;
    }

    const zeroBalanceSinceAt = trialDepletedAt ?? lastPaidAt;
    const eligibleAt = addDays(lastPaidAt, graceDays);
    if (eligibleAt > now) {
      results.push({
        organizationId,
        userId: orgAndEmail.userId,
        outcome: 'skipped',
        reason: 'not-yet-eligible',
      });
      continue;
    }

    const result = await recordChurnedNotionDashboardEntry({
      db: input.db,
      organizationId,
      userId: orgAndEmail.userId,
      email: orgAndEmail.email,
      lastPaidAt,
      zeroBalanceSinceAt,
      balanceCents,
      graceDays,
    });

    if (result.status === 'created') {
      results.push({
        organizationId,
        userId: orgAndEmail.userId,
        outcome: 'created',
        pageId: result.pageId,
        pageUrl: result.pageUrl,
      });
    } else {
      results.push({
        organizationId,
        userId: orgAndEmail.userId,
        outcome: result.status,
        reason: 'reason' in result ? result.reason : undefined,
      });
    }
  }

  return {
    processedCount: snapshot.docs.length,
    createdCount: results.filter((item) => item.outcome === 'created').length,
    skippedCount: results.filter((item) => item.outcome === 'skipped').length,
    failedCount: results.filter((item) => item.outcome === 'failed').length,
    results,
  };
}
