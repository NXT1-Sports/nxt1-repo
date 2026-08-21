/**
 * @fileoverview Signup Notion Dashboard Lifecycle Service
 * @module @nxt1/backend/services/marketing/lifecycle/signup-notion-dashboard
 */

import { FieldValue } from 'firebase-admin/firestore';
import type { RuntimeEnvironment } from '../../../config/runtime-environment.js';
import type { UserV2Document } from '../../../routes/auth/shared.js';
import { toAbsoluteAppUrl } from '../../../utils/app-url.js';
import { logger } from '../../../utils/logger.js';
import {
  getNotionSignupDashboardConfig,
  getNotionSignupDashboardDisabledReason,
  NotionIntegrationError,
} from '../integrations/notion/notion-client.service.js';
import {
  upsertSignupDashboardEntry,
  type SignupDashboardEntryInput,
} from '../integrations/notion/signup-dashboard-entry.service.js';

const DEFAULT_SYNC_LIMIT = 50;
const PROCESSING_LEASE_MS = 2 * 60 * 1000;
const BASE_RETRY_DELAY_MS = 5 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 24 * 60 * 60 * 1000;

export type SignupNotionDashboardStatus =
  | 'queued'
  | 'processing'
  | 'created'
  | 'failed'
  | 'dead_letter'
  | 'skipped';

export interface SignupNotionDashboardStateRecord {
  readonly status?: SignupNotionDashboardStatus;
  readonly idempotencyKey?: string;
  readonly environment?: RuntimeEnvironment;
  readonly queuedAt?: Date;
  readonly processingStartedAt?: Date;
  readonly leaseExpiresAt?: Date;
  readonly lastAttemptAt?: Date;
  readonly nextAttemptAt?: Date;
  readonly attemptCount?: number;
  readonly createdAt?: Date;
  readonly pageId?: string;
  readonly pageUrl?: string;
  readonly lastError?: string;
  readonly failedPermanentAt?: Date;
}

interface EnqueueSignupNotionDashboardEntryInput extends SignupDashboardEntryInput {
  readonly db: FirebaseFirestore.Firestore;
  readonly now?: Date;
}

export type EnqueueSignupNotionDashboardEntryResult =
  | { readonly status: 'queued' }
  | {
      readonly status: 'skipped';
      readonly reason:
        | 'disabled'
        | 'missing-token'
        | 'missing-database-id'
        | 'already-queued'
        | 'already-processing'
        | 'already-created'
        | 'dead-lettered'
        | 'not-eligible-role-or-organization';
    };

export interface SignupNotionDashboardProcessingResult {
  readonly userId: string;
  readonly outcome: 'created' | 'existing' | 'skipped' | 'failed' | 'dead_letter';
  readonly reason?: string;
  readonly pageId?: string;
  readonly pageUrl?: string;
}

export interface RunSignupNotionDashboardSyncResult {
  readonly processedCount: number;
  readonly createdCount: number;
  readonly existingCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
  readonly deadLetterCount: number;
  readonly results: SignupNotionDashboardProcessingResult[];
}

interface RunSignupNotionDashboardSyncInput {
  readonly db: FirebaseFirestore.Firestore;
  readonly environment: RuntimeEnvironment;
  readonly now?: Date;
  readonly limit?: number;
}

function addMilliseconds(base: Date, ms: number): Date {
  return new Date(base.getTime() + ms);
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

function normalizeState(value: unknown): SignupNotionDashboardStateRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  return {
    status:
      typeof raw['status'] === 'string'
        ? (raw['status'] as SignupNotionDashboardStatus)
        : undefined,
    idempotencyKey: typeof raw['idempotencyKey'] === 'string' ? raw['idempotencyKey'] : undefined,
    environment:
      raw['environment'] === 'production' || raw['environment'] === 'staging'
        ? raw['environment']
        : undefined,
    queuedAt: toDate(raw['queuedAt']) ?? undefined,
    processingStartedAt: toDate(raw['processingStartedAt']) ?? undefined,
    leaseExpiresAt: toDate(raw['leaseExpiresAt']) ?? undefined,
    lastAttemptAt: toDate(raw['lastAttemptAt']) ?? undefined,
    nextAttemptAt: toDate(raw['nextAttemptAt']) ?? undefined,
    attemptCount: typeof raw['attemptCount'] === 'number' ? raw['attemptCount'] : undefined,
    createdAt: toDate(raw['createdAt']) ?? undefined,
    pageId: typeof raw['pageId'] === 'string' ? raw['pageId'] : undefined,
    pageUrl: typeof raw['pageUrl'] === 'string' ? raw['pageUrl'] : undefined,
    lastError: typeof raw['lastError'] === 'string' ? raw['lastError'] : undefined,
    failedPermanentAt: toDate(raw['failedPermanentAt']) ?? undefined,
  };
}

function getSignupNotionDashboardState(
  user: UserV2Document
): SignupNotionDashboardStateRecord | null {
  return normalizeState(user.lifecycle?.signup?.notionDashboard);
}

function getFlatSignupNotionDashboardState(
  doc: FirebaseFirestore.DocumentSnapshot
): SignupNotionDashboardStateRecord | null {
  const status = doc.get('lifecycle.signup.notionDashboard.status') as string | undefined;
  if (!status) return null;

  return {
    status: status as SignupNotionDashboardStatus,
    idempotencyKey: doc.get('lifecycle.signup.notionDashboard.idempotencyKey') as
      | string
      | undefined,
    environment: doc.get('lifecycle.signup.notionDashboard.environment') as
      | RuntimeEnvironment
      | undefined,
    queuedAt: toDate(doc.get('lifecycle.signup.notionDashboard.queuedAt')) ?? undefined,
    processingStartedAt:
      toDate(doc.get('lifecycle.signup.notionDashboard.processingStartedAt')) ?? undefined,
    leaseExpiresAt: toDate(doc.get('lifecycle.signup.notionDashboard.leaseExpiresAt')) ?? undefined,
    lastAttemptAt: toDate(doc.get('lifecycle.signup.notionDashboard.lastAttemptAt')) ?? undefined,
    nextAttemptAt: toDate(doc.get('lifecycle.signup.notionDashboard.nextAttemptAt')) ?? undefined,
    attemptCount:
      typeof doc.get('lifecycle.signup.notionDashboard.attemptCount') === 'number'
        ? (doc.get('lifecycle.signup.notionDashboard.attemptCount') as number)
        : undefined,
    createdAt: toDate(doc.get('lifecycle.signup.notionDashboard.createdAt')) ?? undefined,
    pageId: doc.get('lifecycle.signup.notionDashboard.pageId') as string | undefined,
    pageUrl: doc.get('lifecycle.signup.notionDashboard.pageUrl') as string | undefined,
    lastError: doc.get('lifecycle.signup.notionDashboard.lastError') as string | undefined,
    failedPermanentAt:
      toDate(doc.get('lifecycle.signup.notionDashboard.failedPermanentAt')) ?? undefined,
  };
}

function shouldSkipEnqueue(
  state: SignupNotionDashboardStateRecord | null
): EnqueueSignupNotionDashboardEntryResult | null {
  if (!state?.status) return null;
  if (state.status === 'created' || state.pageId || state.createdAt) {
    return { status: 'skipped', reason: 'already-created' };
  }
  if (state.status === 'queued' || state.status === 'failed') {
    return { status: 'skipped', reason: 'already-queued' };
  }
  if (state.status === 'processing') {
    return { status: 'skipped', reason: 'already-processing' };
  }
  if (state.status === 'dead_letter') {
    return { status: 'skipped', reason: 'dead-lettered' };
  }
  return null;
}

function buildIdempotencyKey(environment: RuntimeEnvironment, userId: string): string {
  return `signup-notion-dashboard:${environment}:${userId}`;
}

function resolveDisplayName(user: UserV2Document): string | undefined {
  const explicit = (user as unknown as Record<string, unknown>)['displayName'];
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();

  const parts = [user.firstName?.trim(), user.lastName?.trim()].filter((part): part is string =>
    Boolean(part)
  );
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function resolvePrimarySport(user: UserV2Document): string | undefined {
  return getPrimarySportProfile(user)?.sport ?? user.sports?.[0]?.sport;
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

function resolveTeamName(user: UserV2Document): string | undefined {
  const activeSportTeamName = getPrimarySportProfile(user)?.team?.name?.trim();
  if (activeSportTeamName) return activeSportTeamName;

  const teamCodeName = user.teamCode?.teamName?.trim();
  if (teamCodeName) return teamCodeName;

  const coachOrganization = user.coach?.organization?.trim();
  if (coachOrganization) return coachOrganization;

  const legacyOrganization = user.organization?.trim();
  if (legacyOrganization) return legacyOrganization;

  return user.sports?.find((sport) => sport.team?.name)?.team?.name;
}

function resolveTeamType(user: UserV2Document): string | undefined {
  return (
    getPrimarySportProfile(user)?.team?.type?.trim() ||
    user.sports?.find((sport) => sport.team?.type)?.team?.type?.trim() ||
    undefined
  );
}

function resolveTeamId(user: UserV2Document): string | undefined {
  return (
    getPrimarySportProfile(user)?.team?.teamId?.trim() ||
    user.sports?.find((sport) => sport.team?.teamId)?.team?.teamId?.trim() ||
    user.teamCode?.teamId?.trim() ||
    undefined
  );
}

function resolveOrganizationId(user: UserV2Document): string | undefined {
  return (
    getPrimarySportProfile(user)?.team?.organizationId?.trim() ||
    user.sports?.find((sport) => sport.team?.organizationId)?.team?.organizationId?.trim() ||
    undefined
  );
}

function resolveOrganizationType(user: UserV2Document): string | undefined {
  return (
    getPrimarySportProfile(user)?.team?.type?.trim() ||
    user.sports?.find((sport) => sport.team?.type)?.team?.type?.trim() ||
    undefined
  );
}

function isCoachOrDirector(role: string | undefined): boolean {
  if (!role) return false;
  const normalized = role.trim().toLowerCase();
  return normalized === 'coach' || normalized === 'director';
}

function hasOrganizationContext(user: UserV2Document): boolean {
  if (resolveOrganizationId(user)) return true;
  if (resolveTeamName(user)) return true;

  const coachOrganization = user.coach?.organization?.trim();
  if (coachOrganization) return true;

  const legacyOrganization = user.organization?.trim();
  return Boolean(legacyOrganization);
}

function isEligibleForSignupNotionDashboardSync(user: UserV2Document | undefined): boolean {
  if (!user) return false;
  if (!isCoachOrDirector(user.role)) return false;
  return hasOrganizationContext(user);
}

function buildEntryInputFromUser(input: {
  readonly userId: string;
  readonly user: UserV2Document;
  readonly environment: RuntimeEnvironment;
}): SignupDashboardEntryInput | null {
  const role = input.user.role;
  if (!role) return null;

  return {
    userId: input.userId,
    environment: input.environment,
    role,
    firstName: input.user.firstName,
    lastName: input.user.lastName,
    displayName: resolveDisplayName(input.user),
    email: input.user.contact?.email ?? input.user.email,
    phone: input.user.contact?.phone,
    primarySport: resolvePrimarySport(input.user),
    teamName: resolveTeamName(input.user),
    teamType: resolveTeamType(input.user),
    teamId: resolveTeamId(input.user),
    organizationId: resolveOrganizationId(input.user),
    organizationType: resolveOrganizationType(input.user),
    city: input.user.location?.city ?? input.user.city,
    state: input.user.location?.state ?? input.user.state,
    referralId: input.user.referralId,
    referralSource: input.user.referralSource,
    referralDetails: input.user.referralDetails,
    referralClubName: input.user.referralClubName,
    referralOtherSpecify: input.user.referralOtherSpecify,
    teamCode: input.user.teamCode?.teamCode,
    teamCodeName: input.user.teamCode?.teamName,
    profileUrl: toAbsoluteAppUrl(`/profile/${input.userId}`, { environment: input.environment }),
    completedAt: toDate(input.user.onboardingCompletedAt) ?? new Date(),
  };
}

function getRetryDelayMs(attemptCount: number): number {
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** Math.max(attemptCount - 1, 0), MAX_RETRY_DELAY_MS);
}

function normalizeError(error: unknown): { readonly message: string; readonly retryable: boolean } {
  if (error instanceof NotionIntegrationError) {
    return { message: error.message, retryable: error.retryable };
  }

  return {
    message: error instanceof Error ? error.message : String(error),
    retryable: true,
  };
}

async function markFailure(input: {
  readonly db: FirebaseFirestore.Firestore;
  readonly userId: string;
  readonly now: Date;
  readonly error: unknown;
  readonly currentAttemptCount: number;
  readonly maxAttempts: number;
}): Promise<SignupNotionDashboardProcessingResult> {
  const normalized = normalizeError(input.error);
  const nextAttemptCount = input.currentAttemptCount + 1;
  const exhausted = !normalized.retryable || nextAttemptCount >= input.maxAttempts;
  const nextAttemptAt = addMilliseconds(input.now, getRetryDelayMs(nextAttemptCount));

  await input.db
    .collection('Users')
    .doc(input.userId)
    .update({
      'lifecycle.signup.notionDashboard.status': exhausted ? 'dead_letter' : 'failed',
      'lifecycle.signup.notionDashboard.attemptCount': nextAttemptCount,
      'lifecycle.signup.notionDashboard.lastAttemptAt': input.now,
      'lifecycle.signup.notionDashboard.nextAttemptAt': exhausted
        ? FieldValue.delete()
        : nextAttemptAt,
      'lifecycle.signup.notionDashboard.lastError': normalized.message.slice(0, 500),
      'lifecycle.signup.notionDashboard.processingStartedAt': FieldValue.delete(),
      'lifecycle.signup.notionDashboard.leaseExpiresAt': FieldValue.delete(),
      'lifecycle.signup.notionDashboard.failedPermanentAt': exhausted
        ? input.now
        : FieldValue.delete(),
    });

  return {
    userId: input.userId,
    outcome: exhausted ? 'dead_letter' : 'failed',
    reason: normalized.message,
  };
}

export async function enqueueSignupNotionDashboardEntry(
  input: EnqueueSignupNotionDashboardEntryInput
): Promise<EnqueueSignupNotionDashboardEntryResult> {
  const config = getNotionSignupDashboardConfig(input.environment);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);
  if (disabledReason) {
    return { status: 'skipped', reason: disabledReason };
  }

  const now = input.now ?? new Date();
  const userRef = input.db.collection('Users').doc(input.userId);

  return input.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const user = snapshot.data() as UserV2Document | undefined;

    if (!isEligibleForSignupNotionDashboardSync(user)) {
      await transaction.update(userRef, {
        'lifecycle.signup.notionDashboard.status': 'skipped',
        'lifecycle.signup.notionDashboard.environment': input.environment,
        'lifecycle.signup.notionDashboard.lastAttemptAt': now,
        'lifecycle.signup.notionDashboard.nextAttemptAt': FieldValue.delete(),
        'lifecycle.signup.notionDashboard.processingStartedAt': FieldValue.delete(),
        'lifecycle.signup.notionDashboard.leaseExpiresAt': FieldValue.delete(),
        'lifecycle.signup.notionDashboard.lastError':
          'Skipped: only coach/director users with organization context are eligible.',
      });

      return { status: 'skipped', reason: 'not-eligible-role-or-organization' };
    }

    const existingState = user ? getSignupNotionDashboardState(user) : null;
    const skipResult = shouldSkipEnqueue(existingState);
    if (skipResult) return skipResult;

    await transaction.update(userRef, {
      'lifecycle.signup.notionDashboard.status': 'queued',
      'lifecycle.signup.notionDashboard.environment': input.environment,
      'lifecycle.signup.notionDashboard.idempotencyKey': buildIdempotencyKey(
        input.environment,
        input.userId
      ),
      'lifecycle.signup.notionDashboard.queuedAt': now,
      'lifecycle.signup.notionDashboard.nextAttemptAt': now,
      'lifecycle.signup.notionDashboard.attemptCount': 0,
      'lifecycle.signup.notionDashboard.lastError': FieldValue.delete(),
      'lifecycle.signup.notionDashboard.failedPermanentAt': FieldValue.delete(),
    });

    return { status: 'queued' };
  });
}

async function claimSignupNotionDashboardUser(input: {
  readonly db: FirebaseFirestore.Firestore;
  readonly userId: string;
  readonly environment: RuntimeEnvironment;
  readonly now: Date;
}): Promise<
  | {
      readonly claimed: true;
      readonly user: UserV2Document;
      readonly state: SignupNotionDashboardStateRecord;
    }
  | { readonly claimed: false; readonly reason: string }
> {
  const userRef = input.db.collection('Users').doc(input.userId);

  return input.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const user = snapshot.data() as UserV2Document | undefined;
    if (!snapshot.exists || !user) {
      return { claimed: false, reason: 'user-not-found' };
    }

    const state =
      getSignupNotionDashboardState(user) ?? getFlatSignupNotionDashboardState(snapshot);
    if (!state?.status) {
      return { claimed: false, reason: 'missing-state' };
    }

    if (state.status === 'created') {
      return { claimed: false, reason: 'already-created' };
    }
    if (state.status === 'dead_letter') {
      return { claimed: false, reason: 'dead-lettered' };
    }

    if (state.environment && state.environment !== input.environment) {
      return { claimed: false, reason: 'environment-mismatch' };
    }

    const nextAttemptAt = state.nextAttemptAt;
    if (nextAttemptAt && nextAttemptAt.getTime() > input.now.getTime()) {
      return { claimed: false, reason: 'not-due' };
    }

    const leaseExpiresAt = state.leaseExpiresAt;
    if (
      state.status === 'processing' &&
      leaseExpiresAt &&
      leaseExpiresAt.getTime() > input.now.getTime()
    ) {
      return { claimed: false, reason: 'lease-active' };
    }

    await transaction.update(userRef, {
      'lifecycle.signup.notionDashboard.status': 'processing',
      'lifecycle.signup.notionDashboard.processingStartedAt': input.now,
      'lifecycle.signup.notionDashboard.leaseExpiresAt': addMilliseconds(
        input.now,
        PROCESSING_LEASE_MS
      ),
      'lifecycle.signup.notionDashboard.lastAttemptAt': input.now,
    });

    return { claimed: true, user, state };
  });
}

export async function processSignupNotionDashboardEntry(input: {
  readonly db: FirebaseFirestore.Firestore;
  readonly userId: string;
  readonly environment: RuntimeEnvironment;
  readonly now?: Date;
}): Promise<SignupNotionDashboardProcessingResult> {
  const now = input.now ?? new Date();
  const config = getNotionSignupDashboardConfig(input.environment);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);
  if (disabledReason) {
    return { userId: input.userId, outcome: 'skipped', reason: disabledReason };
  }

  const claim = await claimSignupNotionDashboardUser({
    db: input.db,
    userId: input.userId,
    environment: input.environment,
    now,
  });

  if (!claim.claimed) {
    return { userId: input.userId, outcome: 'skipped', reason: claim.reason };
  }

  if (!isEligibleForSignupNotionDashboardSync(claim.user)) {
    await input.db.collection('Users').doc(input.userId).update({
      'lifecycle.signup.notionDashboard.status': 'skipped',
      'lifecycle.signup.notionDashboard.lastAttemptAt': now,
      'lifecycle.signup.notionDashboard.nextAttemptAt': FieldValue.delete(),
      'lifecycle.signup.notionDashboard.processingStartedAt': FieldValue.delete(),
      'lifecycle.signup.notionDashboard.leaseExpiresAt': FieldValue.delete(),
      'lifecycle.signup.notionDashboard.lastError':
        'Skipped: only coach/director users with organization context are eligible.',
    });

    return {
      userId: input.userId,
      outcome: 'skipped',
      reason: 'not-eligible-role-or-organization',
    };
  }

  const entryInput = buildEntryInputFromUser({
    userId: input.userId,
    user: claim.user,
    environment: input.environment,
  });

  if (!entryInput) {
    return markFailure({
      db: input.db,
      userId: input.userId,
      now,
      error: new NotionIntegrationError(
        'User role is missing for Notion signup dashboard sync',
        false
      ),
      currentAttemptCount: claim.state.attemptCount ?? 0,
      maxAttempts: config.maxAttempts,
    });
  }

  try {
    const result = await upsertSignupDashboardEntry(entryInput);
    if (result.status === 'skipped') {
      return { userId: input.userId, outcome: 'skipped', reason: result.reason };
    }

    await input.db
      .collection('Users')
      .doc(input.userId)
      .update({
        'lifecycle.signup.notionDashboard.status': 'created',
        'lifecycle.signup.notionDashboard.createdAt': now,
        'lifecycle.signup.notionDashboard.pageId': result.pageId,
        'lifecycle.signup.notionDashboard.pageUrl': result.pageUrl ?? FieldValue.delete(),
        'lifecycle.signup.notionDashboard.lastAttemptAt': now,
        'lifecycle.signup.notionDashboard.nextAttemptAt': FieldValue.delete(),
        'lifecycle.signup.notionDashboard.processingStartedAt': FieldValue.delete(),
        'lifecycle.signup.notionDashboard.leaseExpiresAt': FieldValue.delete(),
        'lifecycle.signup.notionDashboard.lastError': FieldValue.delete(),
        'lifecycle.signup.notionDashboard.failedPermanentAt': FieldValue.delete(),
      });

    return {
      userId: input.userId,
      outcome: result.status,
      pageId: result.pageId,
      pageUrl: result.pageUrl,
    };
  } catch (error) {
    logger.error('[SignupNotionDashboard] Failed to sync user to Notion dashboard', {
      userId: input.userId,
      error: error instanceof Error ? error.message : String(error),
    });

    return markFailure({
      db: input.db,
      userId: input.userId,
      now,
      error,
      currentAttemptCount: claim.state.attemptCount ?? 0,
      maxAttempts: config.maxAttempts,
    });
  }
}

export async function runSignupNotionDashboardSync(
  input: RunSignupNotionDashboardSyncInput
): Promise<RunSignupNotionDashboardSyncResult> {
  const now = input.now ?? new Date();
  const config = getNotionSignupDashboardConfig(input.environment);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);
  if (disabledReason) {
    return {
      processedCount: 0,
      createdCount: 0,
      existingCount: 0,
      skippedCount: 1,
      failedCount: 0,
      deadLetterCount: 0,
      results: [{ userId: '*', outcome: 'skipped', reason: disabledReason }],
    };
  }

  const limit = input.limit ?? config.batchLimit ?? DEFAULT_SYNC_LIMIT;
  const snapshot = await input.db
    .collection('Users')
    .where('lifecycle.signup.notionDashboard.nextAttemptAt', '<=', now)
    .orderBy('lifecycle.signup.notionDashboard.nextAttemptAt', 'asc')
    .limit(limit)
    .get();

  const results: SignupNotionDashboardProcessingResult[] = [];

  for (const doc of snapshot.docs) {
    try {
      results.push(
        await processSignupNotionDashboardEntry({
          db: input.db,
          userId: doc.id,
          environment: input.environment,
          now,
        })
      );
    } catch (error) {
      logger.error('[SignupNotionDashboard] Failed processing queued user', {
        userId: doc.id,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push({
        userId: doc.id,
        outcome: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    processedCount: results.length,
    createdCount: results.filter((result) => result.outcome === 'created').length,
    existingCount: results.filter((result) => result.outcome === 'existing').length,
    skippedCount: results.filter((result) => result.outcome === 'skipped').length,
    failedCount: results.filter((result) => result.outcome === 'failed').length,
    deadLetterCount: results.filter((result) => result.outcome === 'dead_letter').length,
    results,
  };
}
