/**
 * @fileoverview Closed Won Notion Dashboard Lifecycle Service
 * @module @nxt1/backend/services/marketing/lifecycle/closed-won-notion-dashboard
 *
 * Promotes the matching B2B Partners row to `Closed Won` once an organization
 * successfully pays for credits.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { ensureMongoDBConnected } from '../../../config/database.config.js';
import type { UserV2Document } from '../../../routes/auth/shared.js';
import { PaymentLogModel } from '../../../models/billing/payment-log.model.js';
import { logger } from '../../../utils/logger.js';
import {
  assertNotionPageStatus,
  getNotionSignupDashboardConfig,
  getNotionSignupDashboardDisabledReason,
  type NotionProperties,
  updateNotionSignupDashboardPage,
} from '../integrations/notion/notion-client.service.js';
import { isTeamRole } from '@nxt1/core';
import {
  sendB2BClosedWonAdminEmail,
  sendB2BClosedWonStaffEmail,
  sendB2BClosedWonAthleteBroadcastEmail,
} from '../email/campaigns/closed-won/closed-won-email.service.js';
import {
  queryExistingB2BPartnerPage,
  resolveB2BPartnerLookupContextFromOrganization,
} from './b2b-partner-lookup.service.js';
import {
  SIGNUP_DRIP_CAMPAIGN_KEY,
  SIGNUP_DRIP_DAY14_POST_PURCHASE_STEP_KEY,
  getSignupDripRoleTrack,
} from './signup-drip.service.js';

const CLOSED_WON_NOTION_ENVIRONMENT = 'production';
const CENTS_PER_DOLLAR = 100;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const PAID_ORG_TOPUP_SOURCES = new Set([
  'stripe_checkout',
  'invoice_payment',
  'direct_charge',
  'auto_topup',
]);

export type ClosedWonNotionDashboardStatus =
  'queued' | 'processing' | 'created' | 'failed' | 'skipped';

export interface ClosedWonNotionDashboardStateRecord {
  readonly status?: ClosedWonNotionDashboardStatus;
  readonly environment?: 'production' | 'staging';
  readonly queuedAt?: Date;
  readonly processingStartedAt?: Date;
  readonly createdAt?: Date;
  readonly pageId?: string;
  readonly pageUrl?: string;
  readonly lastError?: string;
  readonly organizationId?: string;
  readonly amountCents?: number;
  readonly source?: string;
  readonly initiatedByUserId?: string;
}

export interface RecordClosedWonNotionDashboardInput {
  readonly db: Firestore;
  readonly organizationId: string;
  readonly amountCents: number;
  readonly source:
    'stripe_checkout' | 'invoice_payment' | 'manual_credit' | 'direct_charge' | 'auto_topup';
  readonly initiatedByUserId?: string;
}

export type RecordClosedWonNotionDashboardResult =
  | { readonly status: 'created'; readonly pageId?: string; readonly pageUrl?: string }
  | {
      readonly status: 'skipped';
      readonly reason:
        | 'not-paid-source'
        | 'already-created'
        | 'missing-email'
        | 'missing-existing-row'
        | 'disabled'
        | 'missing-token'
        | 'missing-database-id';
    }
  | { readonly status: 'failed'; readonly reason: 'notion-update-failed' | 'state-update-failed' };

type RecordClosedWonSkipReason = Extract<
  RecordClosedWonNotionDashboardResult,
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

function getClosedWonState(user: UserV2Document): ClosedWonNotionDashboardStateRecord | null {
  const raw = user.lifecycle?.sales?.closedWon;
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
    amountCents: raw.amountCents,
    source: raw.source,
    initiatedByUserId: raw.initiatedByUserId,
  };
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

async function resolveLifetimeDealValueDollars(
  organizationId: string
): Promise<number | undefined> {
  try {
    await ensureMongoDBConnected();

    const payments = await PaymentLogModel.find({
      organizationId,
      status: 'PAID',
      amountPaid: { $gt: 0 },
    })
      .select({ amountPaid: 1 })
      .lean<Array<{ amountPaid?: number }>>()
      .exec();

    const totalCents = payments.reduce((sum, payment) => {
      const amount = typeof payment.amountPaid === 'number' ? payment.amountPaid : 0;
      return sum + amount;
    }, 0);

    return roundToCents(totalCents / CENTS_PER_DOLLAR);
  } catch (error) {
    logger.warn('[ClosedWonNotionDashboard] Failed to resolve lifetime deal value', {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

function buildClosedWonPromotionProperties(
  lifetimeDealValue: number | undefined
): NotionProperties {
  const properties: NotionProperties = {
    Stage: { status: { name: 'Closed Won' } },
    'Next Action': {
      rich_text: [
        {
          type: 'text',
          text: {
            content: 'Welcome the account and expand usage with the team.',
          },
        },
      ],
    },
  };

  if (typeof lifetimeDealValue === 'number') {
    properties['Lifetime Deal Value'] = { number: lifetimeDealValue };
  }

  return properties;
}

function fallbackLifetimeDealValue(amountCents: number): number {
  return roundToCents(amountCents / CENTS_PER_DOLLAR);
}

function buildClosedWonPropertiesWithFallback(
  lifetimeDealValue: number | undefined,
  amountCents: number
): NotionProperties {
  return buildClosedWonPromotionProperties(
    typeof lifetimeDealValue === 'number'
      ? lifetimeDealValue
      : fallbackLifetimeDealValue(amountCents)
  );
}

async function updateClosedWonState(
  db: Firestore,
  userId: string,
  patch: Partial<ClosedWonNotionDashboardStateRecord>
): Promise<void> {
  await db
    .collection('Users')
    .doc(userId)
    .set(
      {
        lifecycle: {
          sales: {
            closedWon: patch,
          },
        },
      },
      { merge: true }
    );
}

async function reserveClosedWonSignal(input: RecordClosedWonNotionDashboardInput): Promise<
  | {
      readonly status: 'queued';
      readonly state: ClosedWonNotionDashboardStateRecord;
      readonly stateUserId: string;
      readonly email?: string;
      readonly displayName?: string;
      readonly organizationName?: string;
      readonly teamName?: string;
    }
  | { readonly status: 'skipped'; readonly reason: RecordClosedWonSkipReason }
  | { readonly status: 'failed'; readonly reason: 'state-update-failed' }
> {
  if (!PAID_ORG_TOPUP_SOURCES.has(input.source)) {
    return { status: 'skipped', reason: 'not-paid-source' };
  }

  try {
    const context = await resolveB2BPartnerLookupContextFromOrganization({
      db: input.db,
      organizationId: input.organizationId,
      initiatedByUserId: input.initiatedByUserId,
    });
    if (!context) {
      return { status: 'skipped', reason: 'missing-existing-row' };
    }

    const userSnap = await input.db.collection('Users').doc(context.stateUserId).get();
    if (!userSnap.exists) {
      return { status: 'skipped', reason: 'missing-existing-row' };
    }

    const user = userSnap.data() as UserV2Document;
    const state = getClosedWonState(user);

    if (
      state?.status === 'created' ||
      state?.status === 'processing' ||
      state?.status === 'queued'
    ) {
      return { status: 'skipped', reason: 'already-created' };
    }

    const nextState: ClosedWonNotionDashboardStateRecord = {
      status: 'queued',
      environment: CLOSED_WON_NOTION_ENVIRONMENT,
      queuedAt: new Date(),
      organizationId: input.organizationId,
      amountCents: input.amountCents,
      source: input.source,
      initiatedByUserId: input.initiatedByUserId,
    };

    const signupDrip = user.lifecycle?.signup?.drip as Record<string, unknown> | undefined;
    const purchaseAt = new Date();
    const firstPurchaseAt =
      (signupDrip?.['firstPurchaseAt'] as string | undefined) ?? purchaseAt.toISOString();
    const firstPurchaseDate = new Date(firstPurchaseAt);
    const postPurchaseDay14At = new Date(firstPurchaseDate.getTime() + FOURTEEN_DAYS_MS);
    await userSnap.ref.set(
      {
        lifecycle: {
          signup: {
            drip: {
              campaignKey:
                (signupDrip?.['campaignKey'] as string | undefined) ?? SIGNUP_DRIP_CAMPAIGN_KEY,
              enrolledAt: signupDrip?.['enrolledAt'] ?? purchaseAt,
              roleTrack: getSignupDripRoleTrack(user.role ?? 'coach'),
              paymentState: 'paid',
              firstPurchaseAt,
              currentStepKey: SIGNUP_DRIP_DAY14_POST_PURCHASE_STEP_KEY,
              nextEligibleAt: postPurchaseDay14At,
              completedAt: null,
              pausedAt: null,
              suppressionReason: null,
            },
          },
          sales: {
            closedWon: nextState,
          },
        },
      },
      { merge: true }
    );

    return {
      status: 'queued',
      state: nextState,
      stateUserId: context.stateUserId,
      email: context.email,
      displayName: context.displayName,
      organizationName: context.organizationName,
      teamName: context.teamName,
    };
  } catch (error) {
    logger.error('[ClosedWonNotionDashboard] Failed to reserve closed won signal', {
      organizationId: input.organizationId,
      source: input.source,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'failed', reason: 'state-update-failed' };
  }
}

export async function recordClosedWonNotionDashboardEntry(
  input: RecordClosedWonNotionDashboardInput
): Promise<RecordClosedWonNotionDashboardResult> {
  const reservation = await reserveClosedWonSignal(input);
  if (reservation.status !== 'queued') {
    return reservation;
  }

  // 1. Send B2B Admin payment confirmation email
  if (reservation.email) {
    await sendB2BClosedWonAdminEmail({
      userId: reservation.stateUserId,
      email: reservation.email,
      firstName: reservation.displayName,
      organizationName: reservation.organizationName,
      amountFormatted: input.amountCents
        ? `$${(input.amountCents / CENTS_PER_DOLLAR).toFixed(2)}`
        : null,
      environment: 'production',
    }).catch((err: unknown) => {
      logger.warn('[ClosedWonNotionDashboard] Failed to send B2B Admin email', {
        userId: reservation.stateUserId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  // 2. Broadcast to organization staff & athletes
  try {
    const orgMembersSnap = await input.db
      .collection('Users')
      .where('organizationId', '==', input.organizationId)
      .get();

    for (const doc of orgMembersSnap.docs) {
      if (doc.id === reservation.stateUserId) continue; // Skip admin (already emailed)
      const u = doc.data() as UserV2Document;
      if (!u.email) continue;

      // Update org member payment state to org-covered
      await doc.ref
        .set(
          {
            lifecycle: {
              signup: {
                drip: {
                  paymentState: 'org-covered',
                },
              },
            },
          },
          { merge: true }
        )
        .catch(() => undefined);

      const memberPrefs = u.preferences as Record<string, unknown> | undefined;
      const marketingEnabled =
        typeof memberPrefs?.['marketingEmailsEnabled'] === 'boolean'
          ? Boolean(memberPrefs['marketingEmailsEnabled'])
          : true;

      if (isTeamRole(u.role)) {
        await sendB2BClosedWonStaffEmail({
          userId: doc.id,
          email: u.email,
          firstName: u.firstName,
          organizationName: reservation.organizationName,
          environment: 'production',
          marketingEnabled,
        }).catch((err: unknown) => {
          logger.warn('[ClosedWonNotionDashboard] Failed to send B2B Staff email', {
            userId: doc.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      } else if (u.role === 'athlete') {
        await sendB2BClosedWonAthleteBroadcastEmail({
          userId: doc.id,
          email: u.email,
          firstName: u.firstName,
          organizationName: reservation.organizationName,
          environment: 'production',
          marketingEnabled,
        }).catch((err: unknown) => {
          logger.warn('[ClosedWonNotionDashboard] Failed to send B2B Athlete Broadcast email', {
            userId: doc.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }
  } catch (broadcastErr) {
    logger.warn('[ClosedWonNotionDashboard] Error broadcasting closed won email to org members', {
      organizationId: input.organizationId,
      error: broadcastErr instanceof Error ? broadcastErr.message : String(broadcastErr),
    });
  }

  const config = getNotionSignupDashboardConfig(CLOSED_WON_NOTION_ENVIRONMENT);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);
  if (disabledReason) {
    await updateClosedWonState(input.db, reservation.stateUserId, {
      status: 'failed',
      environment: CLOSED_WON_NOTION_ENVIRONMENT,
      lastError: `Notion closed won sync is ${disabledReason}`,
    }).catch((error: unknown) => {
      logger.warn('[ClosedWonNotionDashboard] Failed to persist disabled state', {
        organizationId: input.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return { status: 'skipped', reason: disabledReason };
  }

  const existing = await queryExistingB2BPartnerPage({
    config,
    context: reservation,
  });

  if (!existing) {
    await updateClosedWonState(input.db, reservation.stateUserId, {
      status: 'failed',
      environment: CLOSED_WON_NOTION_ENVIRONMENT,
      lastError: 'No B2B Partners row exists for the Closed Won sync',
    }).catch((error: unknown) => {
      logger.warn('[ClosedWonNotionDashboard] Failed to persist missing-row state', {
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
      properties: buildClosedWonPropertiesWithFallback(
        await resolveLifetimeDealValueDollars(input.organizationId),
        input.amountCents
      ),
    });

    await assertNotionPageStatus({
      config,
      pageId: updated.id,
      expectedStatus: 'Closed Won',
    });

    await updateClosedWonState(input.db, reservation.stateUserId, {
      status: 'created',
      environment: CLOSED_WON_NOTION_ENVIRONMENT,
      createdAt: new Date(),
      pageId: updated.id,
      pageUrl: updated.url,
      organizationId: input.organizationId,
      amountCents: input.amountCents,
      source: input.source,
      initiatedByUserId: input.initiatedByUserId,
    }).catch((error: unknown) => {
      logger.warn('[ClosedWonNotionDashboard] Failed to persist created state', {
        organizationId: input.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    logger.info('[ClosedWonNotionDashboard] Promoted B2B Partners row to Closed Won', {
      organizationId: input.organizationId,
      amountCents: input.amountCents,
      source: input.source,
      pageId: updated.id,
      pageUrl: updated.url,
    });

    return { status: 'created', pageId: updated.id, pageUrl: updated.url };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateClosedWonState(input.db, reservation.stateUserId, {
      status: 'failed',
      environment: CLOSED_WON_NOTION_ENVIRONMENT,
      lastError: message,
    }).catch((stateError: unknown) => {
      logger.warn('[ClosedWonNotionDashboard] Failed to persist failure state', {
        organizationId: input.organizationId,
        error: stateError instanceof Error ? stateError.message : String(stateError),
      });
    });

    logger.error('[ClosedWonNotionDashboard] Notion sync failed', {
      organizationId: input.organizationId,
      amountCents: input.amountCents,
      source: input.source,
      error: message,
    });

    return { status: 'failed', reason: 'notion-update-failed' };
  }
}
