/**
 * @fileoverview Trial Credits Finished Notion Dashboard Lifecycle Service
 * @module @nxt1/backend/services/marketing/lifecycle/trial-credits-finished-notion-dashboard
 *
 * Promotes the matching B2B Partners row to `Trial Credits finished` once a
 * prepaid / trial wallet is fully depleted.
 *
 * This is a production-only lifecycle signal. It runs when settled credits
 * reach zero and is intentionally separate from low-balance warnings.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { UserRole } from '@nxt1/core';
import type { UserV2Document } from '../../../routes/auth/shared.js';
import { logger } from '../../../utils/logger.js';
import {
  assertNotionPageStatus,
  getNotionSignupDashboardConfig,
  getNotionSignupDashboardDisabledReason,
  type NotionProperties,
  updateNotionSignupDashboardPage,
} from '../integrations/notion/notion-client.service.js';
import { sendTrialCreditsFinishedEmail } from '../email/campaigns/trial-credits-finished/trial-credits-finished-email.service.js';
import {
  buildB2BPartnerLookupContext,
  queryExistingB2BPartnerPage,
  resolveB2BOrganizationNameHints,
} from './b2b-partner-lookup.service.js';

const TRIAL_CREDITS_FINISHED_NOTION_ENVIRONMENT = 'production';

export type TrialCreditsFinishedNotionDashboardStatus =
  | 'queued'
  | 'processing'
  | 'created'
  | 'failed'
  | 'skipped';

export interface TrialCreditsFinishedNotionDashboardStateRecord {
  readonly status?: TrialCreditsFinishedNotionDashboardStatus;
  readonly environment?: 'production' | 'staging';
  readonly queuedAt?: Date;
  readonly processingStartedAt?: Date;
  readonly createdAt?: Date;
  readonly pageId?: string;
  readonly pageUrl?: string;
  readonly lastError?: string;
  readonly baselineCents?: number;
  readonly depletedAt?: Date;
  readonly zeroBalanceOperationId?: string;
  readonly zeroBalanceFeature?: string;
}

export interface RecordTrialCreditsFinishedNotionDashboardInput {
  readonly db: Firestore;
  readonly userId: string;
  readonly organizationId?: string;
  readonly operationId: string;
  readonly feature: string;
  readonly baselineCents: number;
  readonly newBalanceCents: number;
}

export type RecordTrialCreditsFinishedNotionDashboardResult =
  | { readonly status: 'created'; readonly pageId?: string; readonly pageUrl?: string }
  | {
      readonly status: 'skipped';
      readonly reason:
        | 'not-depleted'
        | 'not-organization-billing'
        | 'already-created'
        | 'missing-email'
        | 'missing-existing-row'
        | 'disabled'
        | 'missing-token'
        | 'missing-database-id';
    }
  | { readonly status: 'failed'; readonly reason: 'notion-update-failed' | 'state-update-failed' };

type RecordTrialCreditsFinishedSkipReason = Extract<
  RecordTrialCreditsFinishedNotionDashboardResult,
  { readonly status: 'skipped' }
>['reason'];

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

function getTrialState(
  user: UserV2Document
): TrialCreditsFinishedNotionDashboardStateRecord | null {
  const raw = user.lifecycle?.usage?.trialCreditsFinished;
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
    baselineCents: raw.baselineCents,
    depletedAt: toDate(raw.depletedAt) ?? undefined,
    zeroBalanceOperationId: raw.zeroBalanceOperationId,
    zeroBalanceFeature: raw.zeroBalanceFeature,
  };
}

function buildTrialCreditsFinishedPromotionProperties(): NotionProperties {
  return {
    Stage: { status: { name: 'Trial Credits finished' } },
    'Next Action': {
      rich_text: [
        {
          type: 'text',
          text: {
            content: 'Review usage conversion and upgrade the account to a paid plan.',
          },
        },
      ],
    },
  };
}

async function reserveTrialCreditsFinishedSignal(
  input: RecordTrialCreditsFinishedNotionDashboardInput
): Promise<
  | {
      readonly status: 'queued';
      readonly state: TrialCreditsFinishedNotionDashboardStateRecord;
      readonly user: UserV2Document;
    }
  | {
      readonly status: 'skipped';
      readonly reason: RecordTrialCreditsFinishedSkipReason;
    }
  | { readonly status: 'failed'; readonly reason: 'state-update-failed' }
> {
  if (!Number.isFinite(input.baselineCents) || input.baselineCents <= 0) {
    return { status: 'skipped', reason: 'not-depleted' };
  }
  if (input.newBalanceCents > 0) {
    return { status: 'skipped', reason: 'not-depleted' };
  }

  const userRef = input.db.collection('Users').doc(input.userId);

  try {
    const result = await input.db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        return { status: 'skipped', reason: 'missing-existing-row' } as const;
      }

      const user = userSnap.data() as UserV2Document;
      const state = getTrialState(user);

      if (
        state?.status === 'created' ||
        state?.status === 'processing' ||
        state?.status === 'queued'
      ) {
        return { status: 'skipped', reason: 'already-created' } as const;
      }

      const nextState: TrialCreditsFinishedNotionDashboardStateRecord = {
        status: 'queued',
        environment: TRIAL_CREDITS_FINISHED_NOTION_ENVIRONMENT,
        queuedAt: new Date(),
        baselineCents: input.baselineCents,
        depletedAt: new Date(),
        zeroBalanceOperationId: input.operationId,
        zeroBalanceFeature: input.feature,
      };

      transaction.set(
        userRef,
        {
          lifecycle: {
            drip: {
              trialCreditsFinished: true,
              trialCreditsFinishedAt: new Date().toISOString(),
            },
            usage: {
              trialCreditsFinished: nextState,
            },
          },
        },
        { merge: true }
      );

      return { status: 'queued', state: nextState, user } as const;
    });

    return result;
  } catch (error) {
    logger.error('[TrialCreditsFinishedNotionDashboard] Failed to reserve depletion signal', {
      userId: input.userId,
      operationId: input.operationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'failed', reason: 'state-update-failed' };
  }
}

async function updateTrialCreditsFinishedState(
  db: Firestore,
  userId: string,
  patch: Partial<TrialCreditsFinishedNotionDashboardStateRecord>
): Promise<void> {
  await db
    .collection('Users')
    .doc(userId)
    .set(
      {
        lifecycle: {
          usage: {
            trialCreditsFinished: patch,
          },
        },
      },
      { merge: true }
    );
}

export async function recordTrialCreditsFinishedNotionDashboardEntry(
  input: RecordTrialCreditsFinishedNotionDashboardInput
): Promise<RecordTrialCreditsFinishedNotionDashboardResult> {
  if (!input.organizationId?.trim()) {
    return { status: 'skipped', reason: 'not-organization-billing' };
  }

  if (input.newBalanceCents > 0) {
    return { status: 'skipped', reason: 'not-depleted' };
  }

  const reservation = await reserveTrialCreditsFinishedSignal(input);
  if (reservation.status !== 'queued') {
    return reservation;
  }

  const user = reservation.user;
  const organizationHints = input.organizationId
    ? await resolveB2BOrganizationNameHints(input.db, input.organizationId)
    : {};

  // Trigger outbound Trial Credits Finished email (enforces Org-Covered Athlete Guard internally)
  if (user.email) {
    const prefs = user.preferences as Record<string, unknown> | undefined;
    const marketingEnabled =
      typeof prefs?.['marketingEmailsEnabled'] === 'boolean'
        ? Boolean(prefs['marketingEmailsEnabled'])
        : true;
    const sports = (user as unknown as Record<string, unknown>)['sports'];
    const primarySport =
      Array.isArray(sports) && sports.length > 0 ? String(sports[0]?.sport ?? '') : undefined;
    const orgId =
      input.organizationId ||
      ((user as unknown as Record<string, unknown>)['organization'] as string | undefined);

    await sendTrialCreditsFinishedEmail({
      userId: input.userId,
      email: user.email,
      firstName: user.firstName,
      role: (user.role ?? 'athlete') as UserRole,
      environment: 'production',
      primarySport,
      organizationName: organizationHints.organizationName,
      paymentState: user.lifecycle?.signup?.drip?.paymentState,
      organizationId: orgId,
      marketingEnabled,
    }).catch((err: unknown) => {
      logger.warn(
        '[TrialCreditsFinishedNotionDashboard] Failed to send trial credits finished email',
        {
          userId: input.userId,
          error: err instanceof Error ? err.message : String(err),
        }
      );
    });
  }
  const lookupContext = buildB2BPartnerLookupContext({
    user,
    organizationName: organizationHints.organizationName,
    teamName: organizationHints.teamName,
  });

  if (!lookupContext) {
    await updateTrialCreditsFinishedState(input.db, input.userId, {
      status: 'failed',
      environment: TRIAL_CREDITS_FINISHED_NOTION_ENVIRONMENT,
      lastError: 'Missing email address for Trial Credits finished Notion sync',
    }).catch((error: unknown) => {
      logger.warn('[TrialCreditsFinishedNotionDashboard] Failed to persist missing-email state', {
        userId: input.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return { status: 'skipped', reason: 'missing-email' };
  }

  const config = getNotionSignupDashboardConfig(TRIAL_CREDITS_FINISHED_NOTION_ENVIRONMENT);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);
  if (disabledReason) {
    await updateTrialCreditsFinishedState(input.db, input.userId, {
      status: 'failed',
      environment: TRIAL_CREDITS_FINISHED_NOTION_ENVIRONMENT,
      lastError: `Notion trial credits sync is ${disabledReason}`,
    }).catch((error: unknown) => {
      logger.warn('[TrialCreditsFinishedNotionDashboard] Failed to persist disabled state', {
        userId: input.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return {
      status: 'skipped',
      reason: disabledReason,
    };
  }

  const existing = await queryExistingB2BPartnerPage({
    config,
    context: lookupContext,
  });

  if (!existing) {
    await updateTrialCreditsFinishedState(input.db, input.userId, {
      status: 'failed',
      environment: TRIAL_CREDITS_FINISHED_NOTION_ENVIRONMENT,
      lastError: 'No B2B Partners row exists for the Trial Credits finished sync',
    }).catch((error: unknown) => {
      logger.warn('[TrialCreditsFinishedNotionDashboard] Failed to persist missing-row state', {
        userId: input.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return { status: 'skipped', reason: 'missing-existing-row' };
  }

  try {
    const updated = await updateNotionSignupDashboardPage({
      config,
      pageId: existing.id,
      properties: buildTrialCreditsFinishedPromotionProperties(),
    });

    await assertNotionPageStatus({
      config,
      pageId: updated.id,
      expectedStatus: 'Trial Credits finished',
    });

    await updateTrialCreditsFinishedState(input.db, input.userId, {
      status: 'created',
      environment: TRIAL_CREDITS_FINISHED_NOTION_ENVIRONMENT,
      createdAt: new Date(),
      pageId: updated.id,
      pageUrl: updated.url,
      baselineCents: reservation.state.baselineCents,
      depletedAt: reservation.state.depletedAt,
      zeroBalanceOperationId: reservation.state.zeroBalanceOperationId,
      zeroBalanceFeature: reservation.state.zeroBalanceFeature,
    }).catch((error: unknown) => {
      logger.warn('[TrialCreditsFinishedNotionDashboard] Failed to persist created state', {
        userId: input.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    logger.info(
      '[TrialCreditsFinishedNotionDashboard] Promoted B2B Partners row to Trial Credits finished',
      {
        userId: input.userId,
        operationId: input.operationId,
        pageId: updated.id,
        pageUrl: updated.url,
        baselineCents: reservation.state.baselineCents,
      }
    );

    return { status: 'created', pageId: updated.id, pageUrl: updated.url };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateTrialCreditsFinishedState(input.db, input.userId, {
      status: 'failed',
      environment: TRIAL_CREDITS_FINISHED_NOTION_ENVIRONMENT,
      lastError: message,
    }).catch((stateError: unknown) => {
      logger.warn('[TrialCreditsFinishedNotionDashboard] Failed to persist failure state', {
        userId: input.userId,
        error: stateError instanceof Error ? stateError.message : String(stateError),
      });
    });

    logger.error('[TrialCreditsFinishedNotionDashboard] Notion sync failed', {
      userId: input.userId,
      operationId: input.operationId,
      error: message,
    });

    return { status: 'failed', reason: 'notion-update-failed' };
  }
}
