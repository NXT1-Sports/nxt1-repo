/**
 * @fileoverview B2C Users Lifecycle Service
 * @module @nxt1/backend/services/marketing/lifecycle/b2c-users
 */

import type { Firestore } from 'firebase-admin/firestore';
import { ensureMongoDBConnected } from '../../../config/database.config.js';
import type { RuntimeEnvironment } from '../../../config/runtime-environment.js';
import { PaymentLogModel } from '../../../models/billing/payment-log.model.js';
import type { UserV2Document } from '../../../routes/auth/shared.js';
import { logger } from '../../../utils/logger.js';
import {
  upsertB2CUsersEntry,
  type B2CUsersStage,
  type UpsertB2CUsersEntryResult,
} from '../integrations/notion/b2c-users-entry.service.js';

type B2CUsersStateStatus = 'created' | 'failed' | 'skipped' | 'inactive';
type B2CUsersStateKey =
  | 'accountStarted'
  | 'usageStarted'
  | 'closedWon'
  | 'expansionPricing'
  | 'organizationMode'
  | 'closedLost'
  | 'churned';
type B2CUsersSkipReason =
  | 'not-eligible-role'
  | 'missing-user'
  | 'already-created'
  | 'below-threshold'
  | 'disabled'
  | 'missing-token'
  | 'missing-database-id'
  | 'missing-email';
type B2CUsersFailedReason = 'notion-update-failed' | 'state-update-failed';
type B2CUsersLifecycleResult =
  | {
      readonly status: 'created' | 'existing';
      readonly pageId?: string;
      readonly pageUrl?: string;
    }
  | { readonly status: 'skipped'; readonly reason: B2CUsersSkipReason }
  | { readonly status: 'failed'; readonly reason: B2CUsersFailedReason };

interface B2CUsersSignalStateRecord {
  readonly status?: B2CUsersStateStatus;
  readonly environment?: RuntimeEnvironment;
  readonly createdAt?: Date;
  readonly pageId?: string;
  readonly pageUrl?: string;
  readonly lastError?: string;
  readonly anchorAt?: Date;
  readonly lastActivityAt?: Date;
  readonly eligibleAt?: Date;
  readonly decisionWindowDays?: number;
  readonly inactivityDays?: number;
  readonly graceDays?: number;
  readonly reasonCode?: string;
  readonly lastPaidAt?: Date;
  readonly zeroBalanceSinceAt?: Date;
  readonly balanceCents?: number;
  readonly amountCents?: number;
  readonly feature?: string;
  readonly operationId?: string;
  readonly source?: string;
  readonly organizationId?: string;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const PAID_B2C_SOURCES = new Set(['stripe_checkout', 'iap_topup']);

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

function getB2CUsersState(
  user: UserV2Document,
  key: B2CUsersStateKey
): B2CUsersSignalStateRecord | null {
  const raw = user.lifecycle?.b2cUsers?.[key];
  if (!raw) return null;

  const rawState = raw as Record<string, unknown>;

  return {
    status: raw.status,
    environment: raw.environment,
    createdAt: toDate(raw.createdAt) ?? undefined,
    pageId: typeof rawState['pageId'] === 'string' ? rawState['pageId'] : undefined,
    pageUrl: typeof rawState['pageUrl'] === 'string' ? rawState['pageUrl'] : undefined,
    lastError: typeof rawState['lastError'] === 'string' ? rawState['lastError'] : undefined,
    amountCents: typeof rawState['amountCents'] === 'number' ? rawState['amountCents'] : undefined,
    feature: typeof rawState['feature'] === 'string' ? rawState['feature'] : undefined,
    operationId: typeof rawState['operationId'] === 'string' ? rawState['operationId'] : undefined,
    source: typeof rawState['source'] === 'string' ? rawState['source'] : undefined,
    organizationId:
      typeof rawState['organizationId'] === 'string' ? rawState['organizationId'] : undefined,
  };
}

async function updateB2CUsersState(
  db: Firestore,
  userId: string,
  key: B2CUsersStateKey,
  patch: B2CUsersSignalStateRecord
): Promise<void> {
  await db
    .collection('Users')
    .doc(userId)
    .set(
      {
        lifecycle: {
          b2cUsers: {
            [key]: patch,
          },
        },
      },
      { merge: true }
    );
}

function hasStateCreated(user: UserV2Document, key: B2CUsersStateKey): boolean {
  const state = getB2CUsersState(user, key);
  if (!state) return false;
  if (state.status === 'inactive') return false;
  if (state.status) return state.status === 'created';
  return Boolean(state.pageId) || Boolean(state.createdAt);
}

async function deactivateOrganizationModeIfNeeded(input: {
  readonly db: Firestore;
  readonly userId: string;
  readonly user: UserV2Document;
  readonly environment: RuntimeEnvironment;
  readonly reason: string;
}): Promise<UserV2Document> {
  const organizationMode = getB2CUsersState(input.user, 'organizationMode');
  if (!organizationMode || !hasStateCreated(input.user, 'organizationMode')) {
    return input.user;
  }

  const nextState: B2CUsersSignalStateRecord = {
    ...organizationMode,
    status: 'inactive',
    environment: input.environment,
    lastError: input.reason,
  };

  await updateB2CUsersState(input.db, input.userId, 'organizationMode', nextState);

  return {
    ...input.user,
    lifecycle: {
      ...(input.user.lifecycle ?? {}),
      b2cUsers: {
        ...(input.user.lifecycle?.b2cUsers ?? {}),
        organizationMode: nextState,
      },
    },
  } as UserV2Document;
}

function resolveDisplayName(user: UserV2Document): string | undefined {
  const raw = user as unknown as Record<string, unknown>;
  const explicit =
    typeof raw['displayName'] === 'string' ? compactText(raw['displayName']) : undefined;
  if (explicit) return explicit;

  const parts = [compactText(user.firstName), compactText(user.lastName)].filter(
    (part): part is string => Boolean(part)
  );
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function getPrimarySportProfile(
  user: UserV2Document
): NonNullable<UserV2Document['sports']>[number] | undefined {
  if (!Array.isArray(user.sports) || user.sports.length === 0) return undefined;
  const activeIndex =
    typeof user.activeSportIndex === 'number' && user.activeSportIndex >= 0
      ? user.activeSportIndex
      : 0;
  return user.sports[activeIndex] ?? user.sports[0];
}

function resolvePrimarySport(user: UserV2Document): string | undefined {
  return getPrimarySportProfile(user)?.sport ?? user.sports?.[0]?.sport;
}

function resolveState(user: UserV2Document): string | undefined {
  return compactText(user.location?.state);
}

function resolveAccountStartedCreatedAt(user: UserV2Document): Date {
  const existingStateCreatedAt = getB2CUsersState(user, 'accountStarted')?.createdAt;
  if (existingStateCreatedAt) {
    return existingStateCreatedAt;
  }

  const raw = user as unknown as Record<string, unknown>;
  return (
    toDate(raw['lifecycle.b2cUsers.accountStarted.createdAt']) ??
    toDate(raw['createdAt']) ??
    toDate(raw['updatedAt']) ??
    new Date()
  );
}

function resolveSignUpDate(user: UserV2Document): Date | null {
  return (
    toDate(user.onboardingCompletedAt) ??
    toDate((user as unknown as Record<string, unknown>)['createdAt']) ??
    toDate((user as unknown as Record<string, unknown>)['updatedAt'])
  );
}

function resolveLastActiveAt(user: UserV2Document): Date | null {
  return (
    toDate(user.lastLoginAt) ??
    toDate((user as unknown as Record<string, unknown>)['updatedAt']) ??
    toDate(user.onboardingCompletedAt)
  );
}

async function resolveMonetizationMetrics(userId: string): Promise<{
  readonly ltvDollars: number;
  readonly usageRevenueMonthlyDollars: number;
}> {
  try {
    await ensureMongoDBConnected();

    const monthlyWindowStart = new Date(Date.now() - THIRTY_DAYS_MS);
    const payments = await PaymentLogModel.find({
      userId,
      status: 'PAID',
      $or: [
        { organizationId: { $exists: false } },
        { organizationId: null },
        { organizationId: '' },
      ],
    })
      .select({ amountPaid: 1, amountRefunded: 1, createdAt: 1 })
      .lean<Array<{ amountPaid?: number; amountRefunded?: number; createdAt?: Date }>>()
      .exec();

    const totals = payments.reduce(
      (acc, payment) => {
        const amountPaid = typeof payment.amountPaid === 'number' ? payment.amountPaid : 0;
        const refunded = typeof payment.amountRefunded === 'number' ? payment.amountRefunded : 0;
        const net = Math.max(0, amountPaid - refunded);
        acc.totalCents += net;
        if (payment.createdAt instanceof Date && payment.createdAt >= monthlyWindowStart) {
          acc.monthlyCents += net;
        }
        return acc;
      },
      { totalCents: 0, monthlyCents: 0 }
    );

    return {
      ltvDollars: Math.round(totals.totalCents) / 100,
      usageRevenueMonthlyDollars: Math.round(totals.monthlyCents) / 100,
    };
  } catch (error) {
    logger.warn('[B2CUsers] Falling back to zero monetization metrics', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      ltvDollars: 0,
      usageRevenueMonthlyDollars: 0,
    };
  }
}

async function loadEligibleUser(
  db: Firestore,
  userId: string
): Promise<{ readonly user: UserV2Document } | { readonly reason: B2CUsersSkipReason }> {
  const userSnap = await db.collection('Users').doc(userId).get();
  if (!userSnap.exists) {
    return { reason: 'missing-user' };
  }

  const user = userSnap.data() as UserV2Document;
  return { user };
}

async function syncB2CUsersStage(input: {
  readonly db: Firestore;
  readonly userId: string;
  readonly user: UserV2Document;
  readonly stateKey: B2CUsersStateKey;
  readonly stage: B2CUsersStage;
  readonly environment: RuntimeEnvironment;
  readonly amountCents?: number;
  readonly feature?: string;
  readonly operationId?: string;
  readonly source?: string;
  readonly organizationId?: string;
  readonly notes?: string;
  readonly lastActiveAt?: Date | null;
  readonly anchorAt?: Date | null;
  readonly lastActivityAt?: Date | null;
  readonly eligibleAt?: Date | null;
  readonly decisionWindowDays?: number;
  readonly inactivityDays?: number;
  readonly graceDays?: number;
  readonly reasonCode?: string;
  readonly lastPaidAt?: Date | null;
  readonly zeroBalanceSinceAt?: Date | null;
  readonly balanceCents?: number;
}): Promise<B2CUsersLifecycleResult> {
  let notionResult: UpsertB2CUsersEntryResult;

  try {
    const metrics = await resolveMonetizationMetrics(input.userId);
    notionResult = await upsertB2CUsersEntry({
      userId: input.userId,
      environment: input.environment,
      firstName: input.user.firstName,
      lastName: input.user.lastName,
      displayName: resolveDisplayName(input.user),
      email: input.user.email,
      primarySport: resolvePrimarySport(input.user),
      state: resolveState(input.user),
      referralId: input.user.referralId,
      referralSource: input.user.referralSource,
      referralDetails: input.user.referralDetails,
      referralClubName: input.user.referralClubName,
      referralOtherSpecify: input.user.referralOtherSpecify,
      signUpDate: resolveSignUpDate(input.user),
      lastActiveAt: input.lastActiveAt ?? resolveLastActiveAt(input.user) ?? new Date(),
      stage: input.stage,
      ltvDollars: metrics.ltvDollars,
      usageRevenueMonthlyDollars: metrics.usageRevenueMonthlyDollars,
      organizationId: input.organizationId,
      notes: input.notes,
    });
  } catch (error) {
    logger.error('[B2CUsers] Failed to upsert Notion page', {
      userId: input.userId,
      stage: input.stage,
      error: error instanceof Error ? error.message : String(error),
    });
    await updateB2CUsersState(input.db, input.userId, input.stateKey, {
      status: 'failed',
      environment: input.environment,
      lastError: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      amountCents: input.amountCents,
      feature: input.feature,
      operationId: input.operationId,
      source: input.source,
      organizationId: input.organizationId,
      anchorAt: input.anchorAt ?? undefined,
      lastActivityAt: input.lastActivityAt ?? undefined,
      eligibleAt: input.eligibleAt ?? undefined,
      decisionWindowDays: input.decisionWindowDays,
      inactivityDays: input.inactivityDays,
      graceDays: input.graceDays,
      reasonCode: input.reasonCode,
      lastPaidAt: input.lastPaidAt ?? undefined,
      zeroBalanceSinceAt: input.zeroBalanceSinceAt ?? undefined,
      balanceCents: input.balanceCents,
    }).catch(() => undefined);
    return { status: 'failed', reason: 'notion-update-failed' };
  }

  if (notionResult.status === 'skipped') {
    return { status: 'skipped', reason: notionResult.reason };
  }

  try {
    await updateB2CUsersState(input.db, input.userId, input.stateKey, {
      status: 'created',
      environment: input.environment,
      createdAt: new Date(),
      pageId: notionResult.pageId,
      pageUrl: notionResult.pageUrl,
      amountCents: input.amountCents,
      feature: input.feature,
      operationId: input.operationId,
      source: input.source,
      organizationId: input.organizationId,
      anchorAt: input.anchorAt ?? undefined,
      lastActivityAt: input.lastActivityAt ?? undefined,
      eligibleAt: input.eligibleAt ?? undefined,
      decisionWindowDays: input.decisionWindowDays,
      inactivityDays: input.inactivityDays,
      graceDays: input.graceDays,
      reasonCode: input.reasonCode,
      lastPaidAt: input.lastPaidAt ?? undefined,
      zeroBalanceSinceAt: input.zeroBalanceSinceAt ?? undefined,
      balanceCents: input.balanceCents,
    });
  } catch (error) {
    logger.error('[B2CUsers] Failed to persist lifecycle state', {
      userId: input.userId,
      stage: input.stage,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'failed', reason: 'state-update-failed' };
  }

  return {
    status: notionResult.status,
    pageId: notionResult.pageId,
    pageUrl: notionResult.pageUrl,
  };
}

export async function recordB2CUsersAccountStartedEntry(input: {
  readonly db: Firestore;
  readonly userId: string;
  readonly environment: RuntimeEnvironment;
}): Promise<B2CUsersLifecycleResult> {
  const loaded = await loadEligibleUser(input.db, input.userId);
  if ('reason' in loaded) return { status: 'skipped', reason: loaded.reason };
  if (hasStateCreated(loaded.user, 'accountStarted')) {
    return { status: 'skipped', reason: 'already-created' };
  }

  return syncB2CUsersStage({
    db: input.db,
    userId: input.userId,
    user: loaded.user,
    stateKey: 'accountStarted',
    stage: 'Account Started',
    environment: input.environment,
  });
}

export async function reupsertB2CUsersAccountStartedEntry(input: {
  readonly db: Firestore;
  readonly userId: string;
  readonly environment: RuntimeEnvironment;
}): Promise<B2CUsersLifecycleResult> {
  const loaded = await loadEligibleUser(input.db, input.userId);
  if ('reason' in loaded) return { status: 'skipped', reason: loaded.reason };

  const existingState = getB2CUsersState(loaded.user, 'accountStarted');

  let notionResult: UpsertB2CUsersEntryResult;

  try {
    const metrics = await resolveMonetizationMetrics(input.userId);
    notionResult = await upsertB2CUsersEntry({
      userId: input.userId,
      environment: input.environment,
      firstName: loaded.user.firstName,
      lastName: loaded.user.lastName,
      displayName: resolveDisplayName(loaded.user),
      email: loaded.user.email,
      primarySport: resolvePrimarySport(loaded.user),
      state: resolveState(loaded.user),
      referralId: loaded.user.referralId,
      referralSource: loaded.user.referralSource,
      referralDetails: loaded.user.referralDetails,
      referralClubName: loaded.user.referralClubName,
      referralOtherSpecify: loaded.user.referralOtherSpecify,
      signUpDate: resolveSignUpDate(loaded.user),
      lastActiveAt: resolveLastActiveAt(loaded.user) ?? new Date(),
      stage: 'Onboarding Completed',
      ltvDollars: metrics.ltvDollars,
      usageRevenueMonthlyDollars: metrics.usageRevenueMonthlyDollars,
    });
  } catch (error) {
    logger.error('[B2CUsers] Failed to re-upsert Account Started Notion page', {
      userId: input.userId,
      error: error instanceof Error ? error.message : String(error),
    });

    await updateB2CUsersState(input.db, input.userId, 'accountStarted', {
      ...existingState,
      status: existingState?.status ?? 'failed',
      environment: input.environment,
      createdAt: existingState?.createdAt,
      lastError: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    }).catch(() => undefined);

    return { status: 'failed', reason: 'notion-update-failed' };
  }

  if (notionResult.status === 'skipped') {
    return { status: 'skipped', reason: notionResult.reason };
  }

  try {
    await updateB2CUsersState(input.db, input.userId, 'accountStarted', {
      ...existingState,
      status: 'created',
      environment: input.environment,
      createdAt: resolveAccountStartedCreatedAt(loaded.user),
      pageId: notionResult.pageId ?? existingState?.pageId,
      pageUrl: notionResult.pageUrl ?? existingState?.pageUrl,
      lastError: undefined,
    });
  } catch (error) {
    logger.error('[B2CUsers] Failed to persist Account Started re-upsert state', {
      userId: input.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'failed', reason: 'state-update-failed' };
  }

  return {
    status: notionResult.status,
    pageId: notionResult.pageId,
    pageUrl: notionResult.pageUrl,
  };
}

export async function recordB2CUsersUsageStartedEntry(input: {
  readonly db: Firestore;
  readonly userId: string;
  readonly operationId: string;
  readonly feature: string;
  readonly chargeAmountCents: number;
  readonly environment: RuntimeEnvironment;
}): Promise<B2CUsersLifecycleResult> {
  if (input.chargeAmountCents <= 0) {
    return { status: 'skipped', reason: 'below-threshold' };
  }

  const loaded = await loadEligibleUser(input.db, input.userId);
  if ('reason' in loaded) return { status: 'skipped', reason: loaded.reason };
  const user = await deactivateOrganizationModeIfNeeded({
    db: input.db,
    userId: input.userId,
    user: loaded.user,
    environment: input.environment,
    reason: 'Returned to personal billing activity after organization-billed usage.',
  });
  if (
    hasStateCreated(user, 'usageStarted') ||
    hasStateCreated(user, 'closedWon') ||
    hasStateCreated(user, 'expansionPricing') ||
    hasStateCreated(user, 'organizationMode')
  ) {
    return { status: 'skipped', reason: 'already-created' };
  }

  return syncB2CUsersStage({
    db: input.db,
    userId: input.userId,
    user,
    stateKey: 'usageStarted',
    stage: 'Usage Started',
    environment: input.environment,
    amountCents: input.chargeAmountCents,
    feature: input.feature,
    operationId: input.operationId,
  });
}

export async function recordB2CUsersClosedWonEntry(input: {
  readonly db: Firestore;
  readonly userId: string;
  readonly amountCents: number;
  readonly source: 'stripe_checkout' | 'iap_topup';
  readonly environment: RuntimeEnvironment;
}): Promise<B2CUsersLifecycleResult> {
  if (input.amountCents <= 0 || !PAID_B2C_SOURCES.has(input.source)) {
    return { status: 'skipped', reason: 'below-threshold' };
  }

  const loaded = await loadEligibleUser(input.db, input.userId);
  if ('reason' in loaded) return { status: 'skipped', reason: loaded.reason };
  const user = await deactivateOrganizationModeIfNeeded({
    db: input.db,
    userId: input.userId,
    user: loaded.user,
    environment: input.environment,
    reason: 'Returned to personal billing purchase after organization-billed usage.',
  });
  if (
    hasStateCreated(user, 'closedWon') ||
    hasStateCreated(user, 'expansionPricing') ||
    hasStateCreated(user, 'organizationMode')
  ) {
    return { status: 'skipped', reason: 'already-created' };
  }

  return syncB2CUsersStage({
    db: input.db,
    userId: input.userId,
    user,
    stateKey: 'closedWon',
    stage: 'Closed Won',
    environment: input.environment,
    amountCents: input.amountCents,
    source: input.source,
  });
}

export async function recordB2CUsersExpansionPricingEntry(input: {
  readonly db: Firestore;
  readonly userId: string;
  readonly amountCents: number;
  readonly source: 'stripe_checkout' | 'iap_topup';
  readonly environment: RuntimeEnvironment;
}): Promise<B2CUsersLifecycleResult> {
  if (input.amountCents <= 0 || !PAID_B2C_SOURCES.has(input.source)) {
    return { status: 'skipped', reason: 'below-threshold' };
  }

  const loaded = await loadEligibleUser(input.db, input.userId);
  if ('reason' in loaded) return { status: 'skipped', reason: loaded.reason };
  const user = await deactivateOrganizationModeIfNeeded({
    db: input.db,
    userId: input.userId,
    user: loaded.user,
    environment: input.environment,
    reason: 'Returned to personal billing expansion after organization-billed usage.',
  });
  if (!hasStateCreated(user, 'closedWon') || hasStateCreated(user, 'expansionPricing')) {
    return { status: 'skipped', reason: 'already-created' };
  }

  return syncB2CUsersStage({
    db: input.db,
    userId: input.userId,
    user,
    stateKey: 'expansionPricing',
    stage: 'Expansion / Pricing',
    environment: input.environment,
    amountCents: input.amountCents,
    source: input.source,
  });
}

export async function recordB2CUsersOrganizationModeEntry(input: {
  readonly db: Firestore;
  readonly userId: string;
  readonly organizationId: string;
  readonly environment: RuntimeEnvironment;
}): Promise<B2CUsersLifecycleResult> {
  const loaded = await loadEligibleUser(input.db, input.userId);
  if ('reason' in loaded) return { status: 'skipped', reason: loaded.reason };
  if (hasStateCreated(loaded.user, 'organizationMode')) {
    return { status: 'skipped', reason: 'already-created' };
  }

  return syncB2CUsersStage({
    db: input.db,
    userId: input.userId,
    user: loaded.user,
    stateKey: 'organizationMode',
    stage: 'Organization Mode',
    environment: input.environment,
    organizationId: input.organizationId,
    notes: 'User entered an active organization-billed workflow.',
  });
}

export async function recordB2CUsersClosedLostEntry(input: {
  readonly db: Firestore;
  readonly userId: string;
  readonly environment: RuntimeEnvironment;
  readonly anchorAt: Date;
  readonly lastActivityAt: Date;
  readonly decisionWindowDays: number;
  readonly inactivityDays: number;
  readonly reasonCode: string;
  readonly balanceCents: number;
}): Promise<B2CUsersLifecycleResult> {
  const loaded = await loadEligibleUser(input.db, input.userId);
  if ('reason' in loaded) return { status: 'skipped', reason: loaded.reason };
  if (
    hasStateCreated(loaded.user, 'closedLost') ||
    hasStateCreated(loaded.user, 'closedWon') ||
    hasStateCreated(loaded.user, 'expansionPricing') ||
    hasStateCreated(loaded.user, 'organizationMode')
  ) {
    return { status: 'skipped', reason: 'already-created' };
  }

  return syncB2CUsersStage({
    db: input.db,
    userId: input.userId,
    user: loaded.user,
    stateKey: 'closedLost',
    stage: 'Closed Lost',
    environment: input.environment,
    lastActiveAt: input.lastActivityAt,
    anchorAt: input.anchorAt,
    lastActivityAt: input.lastActivityAt,
    eligibleAt: new Date(input.anchorAt.getTime() + input.decisionWindowDays * 24 * 60 * 60 * 1000),
    decisionWindowDays: input.decisionWindowDays,
    inactivityDays: input.inactivityDays,
    reasonCode: input.reasonCode,
    balanceCents: input.balanceCents,
    notes: `Closed Lost auto-sync (${input.reasonCode}).`,
  });
}

export async function recordB2CUsersChurnedEntry(input: {
  readonly db: Firestore;
  readonly userId: string;
  readonly environment: RuntimeEnvironment;
  readonly lastPaidAt: Date;
  readonly zeroBalanceSinceAt: Date;
  readonly graceDays: number;
  readonly balanceCents: number;
}): Promise<B2CUsersLifecycleResult> {
  const loaded = await loadEligibleUser(input.db, input.userId);
  if ('reason' in loaded) return { status: 'skipped', reason: loaded.reason };
  if (hasStateCreated(loaded.user, 'churned')) {
    return { status: 'skipped', reason: 'already-created' };
  }

  return syncB2CUsersStage({
    db: input.db,
    userId: input.userId,
    user: loaded.user,
    stateKey: 'churned',
    stage: 'Churned',
    environment: input.environment,
    lastActiveAt: input.lastPaidAt,
    lastPaidAt: input.lastPaidAt,
    zeroBalanceSinceAt: input.zeroBalanceSinceAt,
    eligibleAt: new Date(input.lastPaidAt.getTime() + input.graceDays * 24 * 60 * 60 * 1000),
    graceDays: input.graceDays,
    balanceCents: input.balanceCents,
    notes: 'Churned auto-sync.',
  });
}
