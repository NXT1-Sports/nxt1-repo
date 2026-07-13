/**
 * @fileoverview Usage Started Notion Dashboard Lifecycle Service
 * @module @nxt1/backend/services/marketing/lifecycle/usage-started-notion-dashboard
 *
 * Tracks the first positive, user-facing settled wallet spend and promotes the
 * matching B2B Partners row to `Usage Started`.
 *
 * Background jobs are excluded by design: this service only runs from the
 * direct-debit billing path after the first positive settled wallet deduction.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { UserV2Document } from '../../../routes/auth/shared.js';
import { logger } from '../../../utils/logger.js';
import {
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

const FIRST_USAGE_STARTED_THRESHOLD_CENTS = 1;
const USAGE_STARTED_NOTION_ENVIRONMENT = 'production';

export type UsageStartedNotionDashboardStatus =
  | 'queued'
  | 'processing'
  | 'created'
  | 'failed'
  | 'skipped';

export interface UsageStartedNotionDashboardStateRecord {
  readonly status?: UsageStartedNotionDashboardStatus;
  readonly environment?: 'production' | 'staging';
  readonly queuedAt?: Date;
  readonly processingStartedAt?: Date;
  readonly createdAt?: Date;
  readonly pageId?: string;
  readonly pageUrl?: string;
  readonly lastError?: string;
  readonly qualifiedSpendCents?: number;
  readonly qualifiedUsageCount?: number;
  readonly thresholdCents?: number;
  readonly firstQualifiedOperationId?: string;
  readonly firstQualifiedFeature?: string;
}

export interface RecordUsageStartedNotionDashboardInput {
  readonly db: Firestore;
  readonly userId: string;
  readonly organizationId?: string;
  readonly operationId: string;
  readonly feature: string;
  readonly chargeAmountCents: number;
  readonly environment?: 'production' | 'staging';
}

export type RecordUsageStartedNotionDashboardResult =
  | { readonly status: 'created'; readonly pageId?: string; readonly pageUrl?: string }
  | {
      readonly status: 'skipped';
      readonly reason:
        | 'background-job'
        | 'below-threshold'
        | 'not-organization-billing'
        | 'already-created'
        | 'missing-email'
        | 'missing-existing-row'
        | 'disabled'
        | 'missing-token'
        | 'missing-database-id';
    }
  | { readonly status: 'failed'; readonly reason: 'notion-update-failed' | 'state-update-failed' };

type RecordUsageStartedSkipReason = Extract<
  RecordUsageStartedNotionDashboardResult,
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

function getUsageStartedState(user: UserV2Document): UsageStartedNotionDashboardStateRecord | null {
  const raw = user.lifecycle?.usage?.notionDashboard;
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
    qualifiedSpendCents: raw.qualifiedSpendCents,
    qualifiedUsageCount: raw.qualifiedUsageCount,
    thresholdCents: raw.thresholdCents,
    firstQualifiedOperationId: raw.firstQualifiedOperationId,
    firstQualifiedFeature: raw.firstQualifiedFeature,
  };
}

function buildUsageStartedPromotionProperties(): NotionProperties {
  return {
    Stage: { status: { name: 'Usage Started' } },
    'Next Action': {
      rich_text: [
        {
          type: 'text',
          text: {
            content: 'Review active usage and qualify the expansion opportunity.',
          },
        },
      ],
    },
  };
}

async function reserveUsageStartedSignal(input: RecordUsageStartedNotionDashboardInput): Promise<
  | {
      readonly status: 'queued';
      readonly state: UsageStartedNotionDashboardStateRecord;
      readonly user: UserV2Document;
    }
  | {
      readonly status: 'skipped';
      readonly reason: RecordUsageStartedSkipReason;
    }
  | { readonly status: 'failed'; readonly reason: 'state-update-failed' }
> {
  if (input.chargeAmountCents <= 0) {
    return { status: 'skipped', reason: 'below-threshold' };
  }

  const userRef = input.db.collection('Users').doc(input.userId);
  const effectiveThreshold = FIRST_USAGE_STARTED_THRESHOLD_CENTS;

  try {
    const result = await input.db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        return { status: 'skipped', reason: 'missing-existing-row' } as const;
      }

      const user = userSnap.data() as UserV2Document;
      const state = getUsageStartedState(user);

      if (
        state?.status === 'created' ||
        state?.status === 'processing' ||
        state?.status === 'queued'
      ) {
        return { status: 'skipped', reason: 'already-created' } as const;
      }

      const qualifiedSpendCents = (state?.qualifiedSpendCents ?? 0) + input.chargeAmountCents;
      const qualifiedUsageCount = (state?.qualifiedUsageCount ?? 0) + 1;

      if (qualifiedSpendCents < effectiveThreshold) {
        transaction.set(
          userRef,
          {
            lifecycle: {
              usage: {
                notionDashboard: {
                  status: state?.status ?? 'skipped',
                  environment: USAGE_STARTED_NOTION_ENVIRONMENT,
                  qualifiedSpendCents,
                  qualifiedUsageCount,
                  thresholdCents: effectiveThreshold,
                  firstQualifiedOperationId: state?.firstQualifiedOperationId ?? input.operationId,
                  firstQualifiedFeature: state?.firstQualifiedFeature ?? input.feature,
                },
              },
            },
          },
          { merge: true }
        );
        return { status: 'skipped', reason: 'below-threshold' } as const;
      }

      const nextState: UsageStartedNotionDashboardStateRecord = {
        status: 'queued',
        environment: USAGE_STARTED_NOTION_ENVIRONMENT,
        queuedAt: new Date(),
        qualifiedSpendCents,
        qualifiedUsageCount,
        thresholdCents: effectiveThreshold,
        firstQualifiedOperationId: state?.firstQualifiedOperationId ?? input.operationId,
        firstQualifiedFeature: state?.firstQualifiedFeature ?? input.feature,
      };

      transaction.set(
        userRef,
        {
          lifecycle: {
            usage: {
              notionDashboard: nextState,
            },
          },
        },
        { merge: true }
      );

      return { status: 'queued', state: nextState, user } as const;
    });

    return result;
  } catch (error) {
    logger.error('[UsageStartedNotionDashboard] Failed to reserve usage signal', {
      userId: input.userId,
      operationId: input.operationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'failed', reason: 'state-update-failed' };
  }
}

async function updateUsageStartedState(
  db: Firestore,
  userId: string,
  patch: Partial<UsageStartedNotionDashboardStateRecord>
): Promise<void> {
  await db
    .collection('Users')
    .doc(userId)
    .set(
      {
        lifecycle: {
          usage: {
            notionDashboard: patch,
          },
        },
      },
      { merge: true }
    );
}

export async function recordUsageStartedNotionDashboardEntry(
  input: RecordUsageStartedNotionDashboardInput
): Promise<RecordUsageStartedNotionDashboardResult> {
  if (!input.organizationId?.trim()) {
    return { status: 'skipped', reason: 'not-organization-billing' };
  }

  if (input.environment === 'staging') {
    return { status: 'skipped', reason: 'background-job' };
  }

  if (input.chargeAmountCents <= 0) {
    return { status: 'skipped', reason: 'below-threshold' };
  }

  const reservation = await reserveUsageStartedSignal(input);
  if (reservation.status !== 'queued') {
    return reservation;
  }

  const user = reservation.user;
  const organizationHints = input.organizationId
    ? await resolveB2BOrganizationNameHints(input.db, input.organizationId)
    : {};
  const lookupContext = buildB2BPartnerLookupContext({
    user,
    organizationName: organizationHints.organizationName,
    teamName: organizationHints.teamName,
  });

  if (!lookupContext) {
    await updateUsageStartedState(input.db, input.userId, {
      status: 'failed',
      environment: USAGE_STARTED_NOTION_ENVIRONMENT,
      lastError: 'Missing email address for Usage Started Notion sync',
    }).catch((error: unknown) => {
      logger.warn('[UsageStartedNotionDashboard] Failed to persist missing-email state', {
        userId: input.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return { status: 'skipped', reason: 'missing-email' };
  }

  const config = getNotionSignupDashboardConfig(USAGE_STARTED_NOTION_ENVIRONMENT);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);
  if (disabledReason) {
    await updateUsageStartedState(input.db, input.userId, {
      status: 'failed',
      environment: USAGE_STARTED_NOTION_ENVIRONMENT,
      lastError: `Notion usage dashboard sync is ${disabledReason}`,
    }).catch((error: unknown) => {
      logger.warn('[UsageStartedNotionDashboard] Failed to persist disabled state', {
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
    await updateUsageStartedState(input.db, input.userId, {
      status: 'failed',
      environment: USAGE_STARTED_NOTION_ENVIRONMENT,
      lastError: 'No B2B Partners row exists for the Usage Started sync',
    }).catch((error: unknown) => {
      logger.warn('[UsageStartedNotionDashboard] Failed to persist missing-row state', {
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
      properties: buildUsageStartedPromotionProperties(),
    });

    await updateUsageStartedState(input.db, input.userId, {
      status: 'created',
      environment: USAGE_STARTED_NOTION_ENVIRONMENT,
      createdAt: new Date(),
      pageId: updated.id,
      pageUrl: updated.url,
      qualifiedSpendCents: reservation.state.qualifiedSpendCents,
      qualifiedUsageCount: reservation.state.qualifiedUsageCount,
      thresholdCents: reservation.state.thresholdCents,
      firstQualifiedOperationId: reservation.state.firstQualifiedOperationId,
      firstQualifiedFeature: reservation.state.firstQualifiedFeature,
    }).catch((error: unknown) => {
      logger.warn('[UsageStartedNotionDashboard] Failed to persist created state', {
        userId: input.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    logger.info('[UsageStartedNotionDashboard] Promoted B2B Partners row to Usage Started', {
      userId: input.userId,
      operationId: input.operationId,
      pageId: updated.id,
      pageUrl: updated.url,
      thresholdCents: reservation.state.thresholdCents,
      qualifiedSpendCents: reservation.state.qualifiedSpendCents,
      qualifiedUsageCount: reservation.state.qualifiedUsageCount,
    });

    return { status: 'created', pageId: updated.id, pageUrl: updated.url };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateUsageStartedState(input.db, input.userId, {
      status: 'failed',
      environment: USAGE_STARTED_NOTION_ENVIRONMENT,
      lastError: message,
    }).catch((stateError: unknown) => {
      logger.warn('[UsageStartedNotionDashboard] Failed to persist failure state', {
        userId: input.userId,
        error: stateError instanceof Error ? stateError.message : String(stateError),
      });
    });

    logger.error('[UsageStartedNotionDashboard] Notion sync failed', {
      userId: input.userId,
      operationId: input.operationId,
      error: message,
    });

    return { status: 'failed', reason: 'notion-update-failed' };
  }
}
