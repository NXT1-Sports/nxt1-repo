/**
 * @fileoverview B2C Billing Notion Dashboard Lifecycle Service
 * @module @nxt1/backend/services/marketing/lifecycle/b2c-billing-notion-dashboard
 *
 * Promotes personal-billing users to `Closed Lost` and `Churned` using the
 * same scheduled-wallet pattern as the B2B lifecycle jobs.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { ensureMongoDBConnected } from '../../../config/database.config.js';
import type { RuntimeEnvironment } from '../../../config/runtime-environment.js';
import type { PaymentLogDocument } from '../../../models/billing/payment-log.model.js';
import { PaymentLogModel } from '../../../models/billing/payment-log.model.js';
import { COLLECTIONS } from '../../../modules/billing/config.js';
import type { UserV2Document } from '../../../routes/auth/shared.js';
import { recordB2CUsersClosedLostEntry, recordB2CUsersChurnedEntry } from './b2c-users.service.js';

const DEFAULT_CLOSED_LOST_DECISION_DAYS = 45;
const DEFAULT_CLOSED_LOST_INACTIVITY_DAYS = 21;
const DEFAULT_CHURN_GRACE_DAYS = 30;

export interface RunB2CClosedLostNotionDashboardSyncInput {
  readonly db: Firestore;
  readonly environment: RuntimeEnvironment;
  readonly now?: Date;
  readonly limit?: number;
  readonly decisionWindowDays?: number;
  readonly inactivityDays?: number;
}

export interface RunB2CChurnedNotionDashboardSyncInput {
  readonly db: Firestore;
  readonly environment: RuntimeEnvironment;
  readonly now?: Date;
  readonly limit?: number;
  readonly graceDays?: number;
}

export interface B2CNotionDashboardProcessingResult {
  readonly userId: string;
  readonly outcome: 'created' | 'skipped' | 'failed';
  readonly reason?: string;
  readonly pageId?: string;
  readonly pageUrl?: string;
}

export interface RunB2CNotionDashboardSyncResult {
  readonly processedCount: number;
  readonly createdCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
  readonly results: B2CNotionDashboardProcessingResult[];
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

function compactText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
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

async function hasSuccessfulPersonalPayment(userId: string): Promise<boolean> {
  await ensureMongoDBConnected();

  const paid = await PaymentLogModel.findOne({
    userId,
    status: 'PAID',
    amountPaid: { $gt: 0 },
    $or: [{ organizationId: { $exists: false } }, { organizationId: null }, { organizationId: '' }],
  })
    .sort({ createdAt: -1 })
    .lean<PaymentLogDocument>()
    .exec();

  return Boolean(paid);
}

async function getLatestPersonalPaymentAt(userId: string): Promise<Date | null> {
  await ensureMongoDBConnected();

  const payment = await PaymentLogModel.findOne({
    userId,
    status: 'PAID',
    amountPaid: { $gt: 0 },
    $or: [{ organizationId: { $exists: false } }, { organizationId: null }, { organizationId: '' }],
  })
    .sort({ createdAt: -1 })
    .lean<PaymentLogDocument>()
    .exec();

  return payment?.createdAt instanceof Date ? payment.createdAt : null;
}

async function resolveUserContext(
  db: Firestore,
  userId: string
): Promise<{
  readonly user: UserV2Document;
  readonly email: string;
} | null> {
  const userSnap = await db.collection('Users').doc(userId).get();
  if (!userSnap.exists) return null;

  const user = userSnap.data() as UserV2Document;
  const email = compactText(user.email);
  if (!email) return null;

  return { user, email };
}

function resolveClosedLostActivity(
  user: UserV2Document
): { anchorAt: Date; lastActivityAt: Date } | null {
  const anchorAt =
    toDate(user.lifecycle?.b2cUsers?.accountStarted?.createdAt) ??
    toDate(user.onboardingCompletedAt) ??
    toDate(user.lastLoginAt) ??
    toDate((user as unknown as Record<string, unknown>)['createdAt']) ??
    toDate((user as unknown as Record<string, unknown>)['updatedAt']);

  if (!anchorAt) return null;

  const lastActivityAt =
    toDate(user.lastLoginAt) ??
    toDate((user as unknown as Record<string, unknown>)['updatedAt']) ??
    anchorAt;

  return { anchorAt, lastActivityAt };
}

function resolveWalletOwnerId(wallet: Record<string, unknown>): string | null {
  return compactText(wallet['ownerId'] as string | undefined) ?? null;
}

function isSupportedPersonalProvider(wallet: Record<string, unknown>): boolean {
  const provider = wallet['paymentProvider'];
  return provider === 'stripe' || provider === 'iap';
}

export async function runB2CClosedLostNotionDashboardSync(
  input: RunB2CClosedLostNotionDashboardSyncInput
): Promise<RunB2CNotionDashboardSyncResult> {
  const decisionWindowDays = resolveDays(
    input.decisionWindowDays ?? process.env['NOTION_B2C_CLOSED_LOST_DECISION_DAYS'],
    DEFAULT_CLOSED_LOST_DECISION_DAYS
  );
  const inactivityDays = resolveDays(
    input.inactivityDays ?? process.env['NOTION_B2C_CLOSED_LOST_INACTIVITY_DAYS'],
    DEFAULT_CLOSED_LOST_INACTIVITY_DAYS
  );
  const limit = input.limit && input.limit > 0 ? Math.min(Math.floor(input.limit), 500) : 250;
  const now = input.now ?? new Date();

  const snapshot = await input.db
    .collection(COLLECTIONS.WALLETS)
    .where('ownerType', '==', 'individual')
    .limit(limit)
    .get();

  const results: B2CNotionDashboardProcessingResult[] = [];

  for (const doc of snapshot.docs) {
    const wallet = doc.data() as Record<string, unknown>;
    const userId = resolveWalletOwnerId(wallet);
    if (!userId) continue;

    const balanceCents = typeof wallet['balanceCents'] === 'number' ? wallet['balanceCents'] : 0;
    if (balanceCents > 0) {
      results.push({ userId, outcome: 'skipped', reason: 'balance-not-zero' });
      continue;
    }

    if (!isSupportedPersonalProvider(wallet)) {
      results.push({ userId, outcome: 'skipped', reason: 'unsupported-provider' });
      continue;
    }

    if (await hasSuccessfulPersonalPayment(userId)) {
      results.push({ userId, outcome: 'skipped', reason: 'has-paid-history' });
      continue;
    }

    const userContext = await resolveUserContext(input.db, userId);
    if (!userContext) {
      results.push({ userId, outcome: 'skipped', reason: 'missing-existing-row' });
      continue;
    }

    const activity = resolveClosedLostActivity(userContext.user);
    if (!activity) {
      results.push({ userId, outcome: 'skipped', reason: 'missing-usage-signal' });
      continue;
    }

    const eligibleAt = addDays(activity.anchorAt, decisionWindowDays);
    if (eligibleAt > now) {
      results.push({ userId, outcome: 'skipped', reason: 'not-yet-eligible' });
      continue;
    }

    const inactiveAt = addDays(activity.lastActivityAt, inactivityDays);
    if (inactiveAt > now) {
      results.push({ userId, outcome: 'skipped', reason: 'not-inactive' });
      continue;
    }

    const result = await recordB2CUsersClosedLostEntry({
      db: input.db,
      userId,
      environment: input.environment,
      anchorAt: activity.anchorAt,
      lastActivityAt: activity.lastActivityAt,
      decisionWindowDays,
      inactivityDays,
      reasonCode: 'no-paid-conversion-after-personal-onboarding',
      balanceCents,
    });

    if (result.status === 'created') {
      results.push({ userId, outcome: 'created', pageId: result.pageId, pageUrl: result.pageUrl });
      continue;
    }

    results.push({
      userId,
      outcome: result.status,
      reason: 'reason' in result ? result.reason : undefined,
    });
  }

  return {
    processedCount: snapshot.docs.length,
    createdCount: results.filter((item) => item.outcome === 'created').length,
    skippedCount: results.filter((item) => item.outcome === 'skipped').length,
    failedCount: results.filter((item) => item.outcome === 'failed').length,
    results,
  };
}

export async function runB2CChurnedNotionDashboardSync(
  input: RunB2CChurnedNotionDashboardSyncInput
): Promise<RunB2CNotionDashboardSyncResult> {
  const graceDays = resolveDays(
    input.graceDays ?? process.env['NOTION_B2C_CHURNED_GRACE_DAYS'],
    DEFAULT_CHURN_GRACE_DAYS
  );
  const limit = input.limit && input.limit > 0 ? Math.min(Math.floor(input.limit), 500) : 250;
  const now = input.now ?? new Date();

  const snapshot = await input.db
    .collection(COLLECTIONS.WALLETS)
    .where('ownerType', '==', 'individual')
    .limit(limit)
    .get();

  const results: B2CNotionDashboardProcessingResult[] = [];

  for (const doc of snapshot.docs) {
    const wallet = doc.data() as Record<string, unknown>;
    const userId = resolveWalletOwnerId(wallet);
    if (!userId) continue;

    const balanceCents = typeof wallet['balanceCents'] === 'number' ? wallet['balanceCents'] : 0;
    if (balanceCents > 0) {
      results.push({ userId, outcome: 'skipped', reason: 'balance-not-zero' });
      continue;
    }

    if (!isSupportedPersonalProvider(wallet)) {
      results.push({ userId, outcome: 'skipped', reason: 'unsupported-provider' });
      continue;
    }

    const lastPaidAt = await getLatestPersonalPaymentAt(userId);
    if (!lastPaidAt) {
      results.push({ userId, outcome: 'skipped', reason: 'no-paid-history' });
      continue;
    }

    const eligibleAt = addDays(lastPaidAt, graceDays);
    if (eligibleAt > now) {
      results.push({ userId, outcome: 'skipped', reason: 'not-yet-eligible' });
      continue;
    }

    const userContext = await resolveUserContext(input.db, userId);
    if (!userContext) {
      results.push({ userId, outcome: 'skipped', reason: 'missing-existing-row' });
      continue;
    }

    const zeroBalanceSinceAt = lastPaidAt;
    const result = await recordB2CUsersChurnedEntry({
      db: input.db,
      userId,
      environment: input.environment,
      lastPaidAt,
      zeroBalanceSinceAt,
      graceDays,
      balanceCents,
    });

    if (result.status === 'created') {
      results.push({ userId, outcome: 'created', pageId: result.pageId, pageUrl: result.pageUrl });
      continue;
    }

    results.push({
      userId,
      outcome: result.status,
      reason: 'reason' in result ? result.reason : undefined,
    });
  }

  return {
    processedCount: snapshot.docs.length,
    createdCount: results.filter((item) => item.outcome === 'created').length,
    skippedCount: results.filter((item) => item.outcome === 'skipped').length,
    failedCount: results.filter((item) => item.outcome === 'failed').length,
    results,
  };
}
