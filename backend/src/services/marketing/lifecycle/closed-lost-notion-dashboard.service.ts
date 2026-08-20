/**
 * @fileoverview Closed Lost Notion Dashboard Lifecycle Service
 * @module @nxt1/backend/services/marketing/lifecycle/closed-lost-notion-dashboard
 *
 * Promotes the matching B2B Partners row to `Closed Lost` for pre-revenue
 * opportunities that did not convert after the configured decision + inactivity
 * windows.
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

const DEFAULT_CLOSED_LOST_DECISION_DAYS = 45;
const DEFAULT_CLOSED_LOST_INACTIVITY_DAYS = 21;
const CLOSED_LOST_NOTION_ENVIRONMENT = 'production';

export type ClosedLostNotionDashboardStatus =
  'queued' | 'processing' | 'created' | 'failed' | 'skipped';

export interface ClosedLostNotionDashboardStateRecord {
  readonly status?: ClosedLostNotionDashboardStatus;
  readonly environment?: 'production' | 'staging';
  readonly queuedAt?: Date;
  readonly processingStartedAt?: Date;
  readonly createdAt?: Date;
  readonly pageId?: string;
  readonly pageUrl?: string;
  readonly lastError?: string;
  readonly organizationId?: string;
  readonly anchorAt?: Date;
  readonly lastActivityAt?: Date;
  readonly eligibleAt?: Date;
  readonly decisionWindowDays?: number;
  readonly inactivityDays?: number;
  readonly reasonCode?: string;
  readonly balanceCents?: number;
}

export interface RecordClosedLostNotionDashboardInput {
  readonly db: Firestore;
  readonly organizationId: string;
  readonly userId: string;
  readonly email: string;
  readonly anchorAt: Date;
  readonly lastActivityAt: Date;
  readonly balanceCents: number;
  readonly decisionWindowDays?: number;
  readonly inactivityDays?: number;
  readonly reasonCode?: string;
}

export type RecordClosedLostNotionDashboardResult =
  | { readonly status: 'created'; readonly pageId?: string; readonly pageUrl?: string }
  | {
      readonly status: 'skipped';
      readonly reason:
        | 'not-yet-eligible'
        | 'not-inactive'
        | 'already-created'
        | 'missing-email'
        | 'missing-existing-row'
        | 'disabled'
        | 'missing-token'
        | 'missing-database-id';
    }
  | { readonly status: 'failed'; readonly reason: 'notion-update-failed' | 'state-update-failed' };

type RecordClosedLostSkipReason = Extract<
  RecordClosedLostNotionDashboardResult,
  { readonly status: 'skipped' }
>['reason'];

export interface RunClosedLostNotionDashboardSyncInput {
  readonly db: Firestore;
  readonly now?: Date;
  readonly limit?: number;
  readonly decisionWindowDays?: number;
  readonly inactivityDays?: number;
}

export interface ClosedLostNotionDashboardProcessingResult {
  readonly organizationId: string;
  readonly userId?: string;
  readonly outcome: 'created' | 'skipped' | 'failed';
  readonly reason?: string;
  readonly pageId?: string;
  readonly pageUrl?: string;
}

export interface RunClosedLostNotionDashboardSyncResult {
  readonly processedCount: number;
  readonly createdCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
  readonly results: ClosedLostNotionDashboardProcessingResult[];
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

function resolveDays(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    return Math.min(Math.floor(value), 365);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.min(parsed, 365);
    }
  }

  return fallback;
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

function getClosedLostState(user: UserV2Document): ClosedLostNotionDashboardStateRecord | null {
  const raw = user.lifecycle?.sales?.closedLost;
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
    anchorAt: toDate(raw.anchorAt) ?? undefined,
    lastActivityAt: toDate(raw.lastActivityAt) ?? undefined,
    eligibleAt: toDate(raw.eligibleAt) ?? undefined,
    decisionWindowDays: raw.decisionWindowDays,
    inactivityDays: raw.inactivityDays,
    reasonCode: raw.reasonCode,
    balanceCents: raw.balanceCents,
  };
}

function buildClosedLostPromotionProperties(): NotionProperties {
  return {
    Stage: { status: { name: 'Closed Lost' } },
    'Next Action': {
      rich_text: [
        {
          type: 'text',
          text: {
            content:
              'Run quarterly nurture with role-specific proof and reactivation offer when budget resets.',
          },
        },
      ],
    },
  };
}

function extractLifecycleAnchor(
  user: UserV2Document
): { anchorAt: Date; lastActivityAt: Date } | null {
  const trialDepletedAt = toDate(user.lifecycle?.usage?.trialCreditsFinished?.depletedAt);
  const usageCreatedAt = toDate(user.lifecycle?.usage?.notionDashboard?.createdAt);

  const anchorAt = trialDepletedAt ?? usageCreatedAt;
  if (!anchorAt) {
    return null;
  }

  const lastActivityAt =
    usageCreatedAt && usageCreatedAt.getTime() > anchorAt.getTime() ? usageCreatedAt : anchorAt;

  return { anchorAt, lastActivityAt };
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

async function hasAnySuccessfulOrgPayment(organizationId: string): Promise<boolean> {
  await ensureMongoDBConnected();

  const paid = await PaymentLogModel.findOne({
    organizationId,
    status: 'PAID',
    amountPaid: { $gt: 0 },
  })
    .sort({ createdAt: -1 })
    .lean<PaymentLogDocument>()
    .exec();

  return Boolean(paid);
}

async function updateClosedLostState(
  db: Firestore,
  userId: string,
  patch: Partial<ClosedLostNotionDashboardStateRecord>
): Promise<void> {
  await db
    .collection('Users')
    .doc(userId)
    .set(
      {
        lifecycle: {
          sales: {
            closedLost: patch,
          },
        },
      },
      { merge: true }
    );
}

async function reserveClosedLostSignal(input: RecordClosedLostNotionDashboardInput): Promise<
  | {
      readonly status: 'queued';
      readonly state: ClosedLostNotionDashboardStateRecord;
      readonly email: string;
    }
  | { readonly status: 'skipped'; readonly reason: RecordClosedLostSkipReason }
  | { readonly status: 'failed'; readonly reason: 'state-update-failed' }
> {
  const decisionWindowDays = resolveDays(
    input.decisionWindowDays,
    DEFAULT_CLOSED_LOST_DECISION_DAYS
  );
  const inactivityDays = resolveDays(input.inactivityDays, DEFAULT_CLOSED_LOST_INACTIVITY_DAYS);

  const eligibleAt = addDays(input.anchorAt, decisionWindowDays);
  if (eligibleAt > new Date()) {
    return { status: 'skipped', reason: 'not-yet-eligible' };
  }

  const inactiveAt = addDays(input.lastActivityAt, inactivityDays);
  if (inactiveAt > new Date()) {
    return { status: 'skipped', reason: 'not-inactive' };
  }

  const userRef = input.db.collection('Users').doc(input.userId);

  try {
    const result = await input.db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        return { status: 'skipped', reason: 'missing-existing-row' } as const;
      }

      const user = userSnap.data() as UserV2Document;
      const state = getClosedLostState(user);
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

      const nextState: ClosedLostNotionDashboardStateRecord = {
        status: 'queued',
        environment: CLOSED_LOST_NOTION_ENVIRONMENT,
        queuedAt: new Date(),
        organizationId: input.organizationId,
        anchorAt: input.anchorAt,
        lastActivityAt: input.lastActivityAt,
        eligibleAt,
        decisionWindowDays,
        inactivityDays,
        reasonCode: input.reasonCode,
        balanceCents: input.balanceCents,
      };

      transaction.set(
        userRef,
        {
          lifecycle: {
            sales: {
              closedLost: nextState,
            },
          },
        },
        { merge: true }
      );

      return { status: 'queued', state: nextState, email } as const;
    });

    return result;
  } catch (error) {
    logger.error('[ClosedLostNotionDashboard] Failed to reserve closed lost signal', {
      organizationId: input.organizationId,
      userId: input.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'failed', reason: 'state-update-failed' };
  }
}

export async function recordClosedLostNotionDashboardEntry(
  input: RecordClosedLostNotionDashboardInput
): Promise<RecordClosedLostNotionDashboardResult> {
  const reservation = await reserveClosedLostSignal(input);
  if (reservation.status !== 'queued') {
    return reservation;
  }

  const config = getNotionSignupDashboardConfig(CLOSED_LOST_NOTION_ENVIRONMENT);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);
  if (disabledReason) {
    await updateClosedLostState(input.db, input.userId, {
      status: 'failed',
      environment: CLOSED_LOST_NOTION_ENVIRONMENT,
      lastError: `Notion closed lost sync is ${disabledReason}`,
    }).catch((error: unknown) => {
      logger.warn('[ClosedLostNotionDashboard] Failed to persist disabled state', {
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
    await updateClosedLostState(input.db, input.userId, {
      status: 'failed',
      environment: CLOSED_LOST_NOTION_ENVIRONMENT,
      lastError: 'Missing B2B lookup keys for Closed Lost Notion sync',
    }).catch((error: unknown) => {
      logger.warn('[ClosedLostNotionDashboard] Failed to persist missing-lookup state', {
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
    await updateClosedLostState(input.db, input.userId, {
      status: 'failed',
      environment: CLOSED_LOST_NOTION_ENVIRONMENT,
      lastError: 'No B2B Partners row exists for the Closed Lost sync',
    }).catch((error: unknown) => {
      logger.warn('[ClosedLostNotionDashboard] Failed to persist missing-row state', {
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
      properties: buildClosedLostPromotionProperties(),
    });

    await assertNotionPageStatus({
      config,
      pageId: updated.id,
      expectedStatus: 'Closed Lost',
    });

    await updateClosedLostState(input.db, input.userId, {
      status: 'created',
      environment: CLOSED_LOST_NOTION_ENVIRONMENT,
      createdAt: new Date(),
      pageId: updated.id,
      pageUrl: updated.url,
      organizationId: input.organizationId,
      anchorAt: input.anchorAt,
      lastActivityAt: input.lastActivityAt,
      eligibleAt: addDays(
        input.anchorAt,
        resolveDays(input.decisionWindowDays, DEFAULT_CLOSED_LOST_DECISION_DAYS)
      ),
      decisionWindowDays: resolveDays(input.decisionWindowDays, DEFAULT_CLOSED_LOST_DECISION_DAYS),
      inactivityDays: resolveDays(input.inactivityDays, DEFAULT_CLOSED_LOST_INACTIVITY_DAYS),
      reasonCode: input.reasonCode,
      balanceCents: input.balanceCents,
    }).catch((error: unknown) => {
      logger.warn('[ClosedLostNotionDashboard] Failed to persist created state', {
        organizationId: input.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    logger.info('[ClosedLostNotionDashboard] Promoted B2B Partners row to Closed Lost', {
      organizationId: input.organizationId,
      userId: input.userId,
      pageId: updated.id,
      pageUrl: updated.url,
      reasonCode: input.reasonCode,
    });

    return { status: 'created', pageId: updated.id, pageUrl: updated.url };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateClosedLostState(input.db, input.userId, {
      status: 'failed',
      environment: CLOSED_LOST_NOTION_ENVIRONMENT,
      lastError: message,
    }).catch((stateError: unknown) => {
      logger.warn('[ClosedLostNotionDashboard] Failed to persist failure state', {
        organizationId: input.organizationId,
        error: stateError instanceof Error ? stateError.message : String(stateError),
      });
    });

    logger.error('[ClosedLostNotionDashboard] Notion sync failed', {
      organizationId: input.organizationId,
      userId: input.userId,
      error: message,
    });

    return { status: 'failed', reason: 'notion-update-failed' };
  }
}

export async function runClosedLostNotionDashboardSync(
  input: RunClosedLostNotionDashboardSyncInput
): Promise<RunClosedLostNotionDashboardSyncResult> {
  const decisionWindowDays = resolveDays(
    input.decisionWindowDays ?? process.env['NOTION_CLOSED_LOST_DECISION_DAYS'],
    DEFAULT_CLOSED_LOST_DECISION_DAYS
  );
  const inactivityDays = resolveDays(
    input.inactivityDays ?? process.env['NOTION_CLOSED_LOST_INACTIVITY_DAYS'],
    DEFAULT_CLOSED_LOST_INACTIVITY_DAYS
  );
  const limit = input.limit && input.limit > 0 ? Math.min(Math.floor(input.limit), 500) : 250;
  const now = input.now ?? new Date();

  const snapshot = await input.db
    .collection(COLLECTIONS.WALLETS)
    .where('ownerType', '==', 'organization')
    .limit(limit)
    .get();

  const results: ClosedLostNotionDashboardProcessingResult[] = [];

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

    const paidHistory = await hasAnySuccessfulOrgPayment(organizationId);
    if (paidHistory) {
      results.push({ organizationId, outcome: 'skipped', reason: 'has-paid-history' });
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
    const closedLostState = getClosedLostState(user);
    if (
      closedLostState?.status === 'created' ||
      closedLostState?.status === 'queued' ||
      closedLostState?.status === 'processing'
    ) {
      results.push({
        organizationId,
        userId: orgAndEmail.userId,
        outcome: 'skipped',
        reason: 'already-created',
      });
      continue;
    }

    if (user.lifecycle?.sales?.closedWon?.status === 'created') {
      results.push({
        organizationId,
        userId: orgAndEmail.userId,
        outcome: 'skipped',
        reason: 'closed-won',
      });
      continue;
    }

    const activity = extractLifecycleAnchor(user);
    if (!activity) {
      results.push({
        organizationId,
        userId: orgAndEmail.userId,
        outcome: 'skipped',
        reason: 'missing-usage-signal',
      });
      continue;
    }

    const eligibleAt = addDays(activity.anchorAt, decisionWindowDays);
    if (eligibleAt > now) {
      results.push({
        organizationId,
        userId: orgAndEmail.userId,
        outcome: 'skipped',
        reason: 'not-yet-eligible',
      });
      continue;
    }

    const inactiveAt = addDays(activity.lastActivityAt, inactivityDays);
    if (inactiveAt > now) {
      results.push({
        organizationId,
        userId: orgAndEmail.userId,
        outcome: 'skipped',
        reason: 'not-inactive',
      });
      continue;
    }

    const result = await recordClosedLostNotionDashboardEntry({
      db: input.db,
      organizationId,
      userId: orgAndEmail.userId,
      email: orgAndEmail.email,
      anchorAt: activity.anchorAt,
      lastActivityAt: activity.lastActivityAt,
      balanceCents,
      decisionWindowDays,
      inactivityDays,
      reasonCode: 'no-paid-conversion-after-trial-window',
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
