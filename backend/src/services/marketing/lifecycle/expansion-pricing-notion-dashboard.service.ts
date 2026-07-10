/**
 * @fileoverview Expansion / Pricing Notion Dashboard Lifecycle Service
 * @module @nxt1/backend/services/marketing/lifecycle/expansion-pricing-notion-dashboard
 *
 * Promotes the matching B2B Partners row to `Expansion / Pricing` once an
 * organization that has already closed won buys additional credits.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { ensureMongoDBConnected } from '../../../config/database.config.js';
import type { UserV2Document } from '../../../routes/auth/shared.js';
import { PaymentLogModel } from '../../../models/billing/payment-log.model.js';
import { logger } from '../../../utils/logger.js';
import {
  getNotionSignupDashboardConfig,
  getNotionSignupDashboardDisabledReason,
  type NotionProperties,
  updateNotionSignupDashboardPage,
} from '../integrations/notion/notion-client.service.js';
import {
  queryExistingB2BPartnerPage,
  resolveB2BPartnerLookupContextFromOrganization,
} from './b2b-partner-lookup.service.js';

const EXPANSION_PRICING_NOTION_ENVIRONMENT = 'production';
const CENTS_PER_DOLLAR = 100;
const REPEAT_ORG_PURCHASE_SOURCES = new Set([
  'stripe_checkout',
  'invoice_payment',
  'direct_charge',
]);

export type ExpansionPricingNotionDashboardStatus =
  | 'queued'
  | 'processing'
  | 'created'
  | 'failed'
  | 'skipped';

export interface ExpansionPricingNotionDashboardStateRecord {
  readonly status?: ExpansionPricingNotionDashboardStatus;
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

export interface RecordExpansionPricingNotionDashboardInput {
  readonly db: Firestore;
  readonly organizationId: string;
  readonly amountCents: number;
  readonly source:
    | 'stripe_checkout'
    | 'invoice_payment'
    | 'manual_credit'
    | 'direct_charge'
    | 'auto_topup';
  readonly initiatedByUserId?: string;
}

export type RecordExpansionPricingNotionDashboardResult =
  | { readonly status: 'created'; readonly pageId?: string; readonly pageUrl?: string }
  | {
      readonly status: 'skipped';
      readonly reason:
        | 'not-repeat-purchase'
        | 'missing-closed-won'
        | 'already-created'
        | 'missing-email'
        | 'missing-existing-row'
        | 'disabled'
        | 'missing-token'
        | 'missing-database-id';
    }
  | { readonly status: 'failed'; readonly reason: 'notion-update-failed' | 'state-update-failed' };

type RecordExpansionPricingSkipReason = Extract<
  RecordExpansionPricingNotionDashboardResult,
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

function getClosedWonState(user: UserV2Document): { readonly status?: string } | null {
  return user.lifecycle?.sales?.closedWon ?? null;
}

function getExpansionPricingState(
  user: UserV2Document
): ExpansionPricingNotionDashboardStateRecord | null {
  const raw = user.lifecycle?.sales?.expansionPricing;
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
    logger.warn('[ExpansionPricingNotionDashboard] Failed to resolve lifetime deal value', {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

function fallbackLifetimeDealValue(amountCents: number): number {
  return roundToCents(amountCents / CENTS_PER_DOLLAR);
}

function buildExpansionPricingPromotionProperties(
  lifetimeDealValue: number | undefined
): NotionProperties {
  const properties: NotionProperties = {
    Stage: { status: { name: 'Expansion / Pricing' } },
    'Next Action': {
      rich_text: [
        {
          type: 'text',
          text: {
            content: 'Review the expanded package and align pricing for the larger commitment.',
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

async function updateExpansionPricingState(
  db: Firestore,
  userId: string,
  patch: Partial<ExpansionPricingNotionDashboardStateRecord>
): Promise<void> {
  await db
    .collection('Users')
    .doc(userId)
    .set(
      {
        lifecycle: {
          sales: {
            expansionPricing: patch,
          },
        },
      },
      { merge: true }
    );
}

async function reserveExpansionPricingSignal(
  input: RecordExpansionPricingNotionDashboardInput
): Promise<
  | {
      readonly status: 'queued';
      readonly state: ExpansionPricingNotionDashboardStateRecord;
      readonly stateUserId: string;
      readonly email?: string;
      readonly displayName?: string;
      readonly organizationName?: string;
      readonly teamName?: string;
    }
  | {
      readonly status: 'skipped';
      readonly reason: RecordExpansionPricingSkipReason;
    }
  | { readonly status: 'failed'; readonly reason: 'state-update-failed' }
> {
  if (!REPEAT_ORG_PURCHASE_SOURCES.has(input.source)) {
    return { status: 'skipped', reason: 'not-repeat-purchase' };
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
    const closedWon = getClosedWonState(user);
    const state = getExpansionPricingState(user);

    if (
      state?.status === 'created' ||
      state?.status === 'processing' ||
      state?.status === 'queued'
    ) {
      return { status: 'skipped', reason: 'already-created' };
    }

    if (closedWon?.status !== 'created') {
      return { status: 'skipped', reason: 'missing-closed-won' };
    }

    const nextState: ExpansionPricingNotionDashboardStateRecord = {
      status: 'queued',
      environment: EXPANSION_PRICING_NOTION_ENVIRONMENT,
      queuedAt: new Date(),
      organizationId: input.organizationId,
      amountCents: input.amountCents,
      source: input.source,
      initiatedByUserId: input.initiatedByUserId,
    };

    await userSnap.ref.set(
      {
        lifecycle: {
          sales: {
            expansionPricing: nextState,
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
    logger.error('[ExpansionPricingNotionDashboard] Failed to reserve expansion signal', {
      organizationId: input.organizationId,
      source: input.source,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'failed', reason: 'state-update-failed' };
  }
}

export async function recordExpansionPricingNotionDashboardEntry(
  input: RecordExpansionPricingNotionDashboardInput
): Promise<RecordExpansionPricingNotionDashboardResult> {
  const reservation = await reserveExpansionPricingSignal(input);
  if (reservation.status !== 'queued') {
    return reservation;
  }

  const config = getNotionSignupDashboardConfig(EXPANSION_PRICING_NOTION_ENVIRONMENT);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);
  if (disabledReason) {
    await updateExpansionPricingState(input.db, reservation.stateUserId, {
      status: 'failed',
      environment: EXPANSION_PRICING_NOTION_ENVIRONMENT,
      lastError: `Notion expansion pricing sync is ${disabledReason}`,
    }).catch((error: unknown) => {
      logger.warn('[ExpansionPricingNotionDashboard] Failed to persist disabled state', {
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
    await updateExpansionPricingState(input.db, reservation.stateUserId, {
      status: 'failed',
      environment: EXPANSION_PRICING_NOTION_ENVIRONMENT,
      lastError: 'No B2B Partners row exists for the Expansion / Pricing sync',
    }).catch((error: unknown) => {
      logger.warn('[ExpansionPricingNotionDashboard] Failed to persist missing-row state', {
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
      properties: buildExpansionPricingPromotionProperties(
        (await resolveLifetimeDealValueDollars(input.organizationId)) ??
          fallbackLifetimeDealValue(input.amountCents)
      ),
    });

    await updateExpansionPricingState(input.db, reservation.stateUserId, {
      status: 'created',
      environment: EXPANSION_PRICING_NOTION_ENVIRONMENT,
      createdAt: new Date(),
      pageId: updated.id,
      pageUrl: updated.url,
      organizationId: input.organizationId,
      amountCents: input.amountCents,
      source: input.source,
      initiatedByUserId: input.initiatedByUserId,
    }).catch((error: unknown) => {
      logger.warn('[ExpansionPricingNotionDashboard] Failed to persist created state', {
        organizationId: input.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    logger.info(
      '[ExpansionPricingNotionDashboard] Promoted B2B Partners row to Expansion / Pricing',
      {
        organizationId: input.organizationId,
        amountCents: input.amountCents,
        source: input.source,
        pageId: updated.id,
        pageUrl: updated.url,
      }
    );

    return { status: 'created', pageId: updated.id, pageUrl: updated.url };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateExpansionPricingState(input.db, reservation.stateUserId, {
      status: 'failed',
      environment: EXPANSION_PRICING_NOTION_ENVIRONMENT,
      lastError: message,
    }).catch((stateError: unknown) => {
      logger.warn('[ExpansionPricingNotionDashboard] Failed to persist failure state', {
        organizationId: input.organizationId,
        error: stateError instanceof Error ? stateError.message : String(stateError),
      });
    });

    logger.error('[ExpansionPricingNotionDashboard] Notion sync failed', {
      organizationId: input.organizationId,
      amountCents: input.amountCents,
      source: input.source,
      error: message,
    });

    return { status: 'failed', reason: 'notion-update-failed' };
  }
}
