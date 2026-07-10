/**
 * @fileoverview B2B Member Count Notion Dashboard Sync Service
 * @module @nxt1/backend/services/marketing/lifecycle/b2b-member-count-notion-dashboard
 *
 * Reconciles each organization's current member total from Teams counters
 * (`athleteMember` + `panelMember`) into the B2B Partners Notion row.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { ensureMongoDBConnected } from '../../../config/database.config.js';
import type { UserV2Document } from '../../../routes/auth/shared.js';
import { PaymentLogModel } from '../../../models/billing/payment-log.model.js';
import { logger } from '../../../utils/logger.js';
import {
  getNotionB2CUsersConfig,
  getNotionSignupDashboardConfig,
  getNotionSignupDashboardDisabledReason,
  getNotionSignupDashboardPage,
  queryNotionDatabaseByEmail,
  updateNotionSignupDashboardPage,
} from '../integrations/notion/notion-client.service.js';

const MEMBER_COUNT_NOTION_ENVIRONMENT = 'production';
const MEMBER_COUNT_PROPERTY_CANDIDATES = [
  '# Athletes',
  '# Members',
  'Members',
  'Athletes',
] as const;
const MEMBER_RELATION_PROPERTY_CANDIDATES = ['Members'] as const;
const USAGE_REVENUE_PROPERTY_CANDIDATES = [
  'Usage Revenue ($/mo)',
  'Usage Revenue',
  'Usage Revenue ($)',
] as const;
const LIFETIME_DEAL_VALUE_PROPERTY_CANDIDATES = [
  'Lifetime Deal Value',
  'Lifetime Deal Value ($)',
  'Lifetime Value',
] as const;
const REVENUE_WINDOW_DAYS = 30;
const CENTS_PER_DOLLAR = 100;
const REVENUE_ELIGIBLE_STATUSES = new Set(['created', 'processing', 'queued']);
const REVENUE_PAYMENT_TYPES = ['wallet_topup', 'org_wallet_topup', 'org_invoice_topup'];

type MemberCountPropertyName = (typeof MEMBER_COUNT_PROPERTY_CANDIDATES)[number];
type MemberRelationPropertyName = (typeof MEMBER_RELATION_PROPERTY_CANDIDATES)[number];
type UsageRevenuePropertyName = (typeof USAGE_REVENUE_PROPERTY_CANDIDATES)[number];
type LifetimeDealValuePropertyName = (typeof LIFETIME_DEAL_VALUE_PROPERTY_CANDIDATES)[number];

interface OrganizationEmailContext {
  readonly organizationId: string;
  readonly userId: string;
  readonly email: string;
}

interface TeamMemberCounts {
  readonly athleteMembers: number;
  readonly panelMembers: number;
  readonly totalMembers: number;
}

export interface RunB2BMemberCountNotionDashboardSyncInput {
  readonly db: Firestore;
  readonly limit?: number;
}

export interface B2BMemberCountNotionDashboardProcessingResult {
  readonly organizationId: string;
  readonly userId?: string;
  readonly outcome: 'updated' | 'skipped' | 'failed';
  readonly reason?:
    | 'missing-email'
    | 'missing-existing-row'
    | 'missing-sync-properties'
    | 'disabled'
    | 'missing-token'
    | 'missing-database-id';
  readonly pageId?: string;
  readonly pageUrl?: string;
  readonly memberCount?: number;
  readonly relatedMemberCount?: number;
  readonly usageRevenueMonthly?: number;
  readonly lifetimeDealValue?: number;
}

export interface RunB2BMemberCountNotionDashboardSyncResult {
  readonly processedCount: number;
  readonly updatedCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
  readonly results: B2BMemberCountNotionDashboardProcessingResult[];
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 500;
  }

  const normalized = Math.floor(limit);
  if (normalized <= 0) {
    return 500;
  }

  return Math.min(normalized, 500);
}

function compactText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizeCounter(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return 0;
}

function resolveMemberCountPropertyName(
  properties: Record<string, { readonly type?: string } | undefined> | undefined
): MemberCountPropertyName | null {
  if (!properties) return null;

  for (const candidate of MEMBER_COUNT_PROPERTY_CANDIDATES) {
    const property = properties[candidate];
    if (property?.type === 'number') {
      return candidate;
    }
  }

  return null;
}

function resolveUsageRevenuePropertyName(
  properties: Record<string, { readonly type?: string } | undefined> | undefined
): UsageRevenuePropertyName | null {
  if (!properties) return null;

  for (const candidate of USAGE_REVENUE_PROPERTY_CANDIDATES) {
    const property = properties[candidate];
    if (property?.type === 'number') {
      return candidate;
    }
  }

  return null;
}

function resolveMemberRelationPropertyName(
  properties: Record<string, { readonly type?: string } | undefined> | undefined
): MemberRelationPropertyName | null {
  if (!properties) return null;

  for (const candidate of MEMBER_RELATION_PROPERTY_CANDIDATES) {
    const property = properties[candidate];
    if (property?.type === 'relation') {
      return candidate;
    }
  }

  return null;
}

function resolveLifetimeDealValuePropertyName(
  properties: Record<string, { readonly type?: string } | undefined> | undefined
): LifetimeDealValuePropertyName | null {
  if (!properties) return null;

  for (const candidate of LIFETIME_DEAL_VALUE_PROPERTY_CANDIDATES) {
    const property = properties[candidate];
    if (property?.type === 'number') {
      return candidate;
    }
  }

  return null;
}

async function resolveOrganizationEmailContext(
  db: Firestore,
  organizationId: string
): Promise<OrganizationEmailContext | null> {
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
    return { organizationId, userId, email: orgEmail };
  }

  const userSnap = await db.collection('Users').doc(userId).get();
  if (!userSnap.exists) return null;

  const user = userSnap.data() as UserV2Document | undefined;
  const email = compactText(user?.email);
  return email ? { organizationId, userId, email } : null;
}

async function resolveOrganizationMemberCounts(
  db: Firestore,
  organizationId: string
): Promise<TeamMemberCounts> {
  const teamSnapshot = await db
    .collection('Teams')
    .where('organizationId', '==', organizationId)
    .select('athleteMember', 'panelMember')
    .get();

  let athleteMembers = 0;
  let panelMembers = 0;

  for (const doc of teamSnapshot.docs) {
    const team = doc.data() as Record<string, unknown>;
    athleteMembers += normalizeCounter(team['athleteMember']);
    panelMembers += normalizeCounter(team['panelMember']);
  }

  return {
    athleteMembers,
    panelMembers,
    totalMembers: athleteMembers + panelMembers,
  };
}

async function resolveOrganizationMemberUserIds(
  db: Firestore,
  organizationId: string,
  fallbackUserId?: string
): Promise<string[]> {
  const rosterSnapshot = await db
    .collection('RosterEntries')
    .where('organizationId', '==', organizationId)
    .where('status', '==', 'active')
    .get();

  const userIds = new Set<string>();
  for (const doc of rosterSnapshot.docs) {
    const userId = compactText(doc.data()?.['userId'] as string | undefined);
    if (userId) userIds.add(userId);
  }

  if (fallbackUserId) {
    userIds.add(fallbackUserId);
  }

  return [...userIds];
}

async function resolveOrganizationMemberRelationIds(input: {
  readonly db: Firestore;
  readonly organizationId: string;
  readonly fallbackUserId?: string;
}): Promise<string[]> {
  const b2cConfig = getNotionB2CUsersConfig(MEMBER_COUNT_NOTION_ENVIRONMENT);
  const b2cDisabledReason = getNotionSignupDashboardDisabledReason(b2cConfig);
  if (b2cDisabledReason) {
    return [];
  }

  const userIds = await resolveOrganizationMemberUserIds(
    input.db,
    input.organizationId,
    input.fallbackUserId
  );
  if (userIds.length === 0) {
    return [];
  }

  const userSnapshots = await Promise.all(
    userIds.map((userId) => input.db.collection('Users').doc(userId).get())
  );

  const emails = Array.from(
    new Set(
      userSnapshots
        .map((snapshot) => {
          if (!snapshot.exists) return undefined;
          const user = snapshot.data() as UserV2Document | undefined;
          return compactText(user?.contact?.email ?? user?.email);
        })
        .filter((email): email is string => Boolean(email))
    )
  );

  const memberPages = await Promise.all(
    emails.map((email) =>
      queryNotionDatabaseByEmail({
        config: b2cConfig,
        property: 'Email',
        email,
      })
    )
  );

  return Array.from(
    new Set(memberPages.map((page) => page?.id).filter((id): id is string => Boolean(id)))
  );
}

function isRevenueEligibleUser(user: UserV2Document): boolean {
  const closedWon = user.lifecycle?.sales?.closedWon?.status;
  const expansionPricing = user.lifecycle?.sales?.expansionPricing?.status;

  return (
    (typeof closedWon === 'string' && REVENUE_ELIGIBLE_STATUSES.has(closedWon)) ||
    (typeof expansionPricing === 'string' && REVENUE_ELIGIBLE_STATUSES.has(expansionPricing))
  );
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

async function resolveLifetimeDealValueDollars(organizationId: string): Promise<number> {
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
}

async function resolveMonthlyUsageRevenueDollars(
  organizationId: string,
  now: Date
): Promise<number> {
  await ensureMongoDBConnected();

  const from = new Date(now.getTime() - REVENUE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const payments = await PaymentLogModel.find({
    organizationId,
    status: 'PAID',
    amountPaid: { $gt: 0 },
    type: { $in: REVENUE_PAYMENT_TYPES },
    createdAt: { $gte: from, $lte: now },
  })
    .select({ amountPaid: 1 })
    .lean<Array<{ amountPaid?: number }>>()
    .exec();

  const totalCents = payments.reduce((sum, payment) => {
    const amount = typeof payment.amountPaid === 'number' ? payment.amountPaid : 0;
    return sum + amount;
  }, 0);

  return roundToCents(totalCents / 100);
}

export async function runB2BMemberCountNotionDashboardSync(
  input: RunB2BMemberCountNotionDashboardSyncInput
): Promise<RunB2BMemberCountNotionDashboardSyncResult> {
  const config = getNotionSignupDashboardConfig(MEMBER_COUNT_NOTION_ENVIRONMENT);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);
  if (disabledReason) {
    logger.info('[B2BMemberCountNotionDashboard] Sync skipped: Notion integration disabled', {
      reason: disabledReason,
    });
    return {
      processedCount: 0,
      updatedCount: 0,
      skippedCount: 1,
      failedCount: 0,
      results: [
        {
          organizationId: 'n/a',
          outcome: 'skipped',
          reason: disabledReason,
        },
      ],
    };
  }

  const organizationCollection = input.db.collection('Organizations');
  const organizations =
    typeof input.limit === 'number' && Number.isFinite(input.limit)
      ? await organizationCollection.limit(normalizeLimit(input.limit)).get()
      : await organizationCollection.get();

  const results: B2BMemberCountNotionDashboardProcessingResult[] = [];
  const now = new Date();

  for (const orgDoc of organizations.docs) {
    const organizationId = orgDoc.id;

    try {
      const context = await resolveOrganizationEmailContext(input.db, organizationId);
      if (!context) {
        results.push({
          organizationId,
          outcome: 'skipped',
          reason: 'missing-email',
        });
        continue;
      }

      const existing = await queryNotionDatabaseByEmail({
        config,
        property: 'Email',
        email: context.email,
      });

      if (!existing) {
        results.push({
          organizationId,
          userId: context.userId,
          outcome: 'skipped',
          reason: 'missing-existing-row',
        });
        continue;
      }

      const page = await getNotionSignupDashboardPage({
        config,
        pageId: existing.id,
      });

      const memberPropertyName = resolveMemberCountPropertyName(page.properties);
      const memberRelationPropertyName = resolveMemberRelationPropertyName(page.properties);
      const revenuePropertyName = resolveUsageRevenuePropertyName(page.properties);
      const lifetimeDealValuePropertyName = resolveLifetimeDealValuePropertyName(page.properties);

      const userSnap = await input.db.collection('Users').doc(context.userId).get();
      const user = userSnap.exists ? (userSnap.data() as UserV2Document) : null;
      const shouldSyncRevenue = Boolean(user && isRevenueEligibleUser(user) && revenuePropertyName);
      const shouldSyncLifetimeDealValue = Boolean(lifetimeDealValuePropertyName);

      if (
        !memberPropertyName &&
        !memberRelationPropertyName &&
        !shouldSyncRevenue &&
        !shouldSyncLifetimeDealValue
      ) {
        results.push({
          organizationId,
          userId: context.userId,
          outcome: 'skipped',
          reason: 'missing-sync-properties',
          pageId: existing.id,
          pageUrl: existing.url,
        });
        continue;
      }

      const counts = await resolveOrganizationMemberCounts(input.db, organizationId);
      const properties: Record<
        string,
        { readonly number: number } | { readonly relation: readonly { readonly id: string }[] }
      > = {};
      if (memberPropertyName) {
        properties[memberPropertyName] = { number: counts.totalMembers };
      }

      let relatedMemberCount: number | undefined;
      if (memberRelationPropertyName) {
        const relationIds = await resolveOrganizationMemberRelationIds({
          db: input.db,
          organizationId,
          fallbackUserId: context.userId,
        });
        properties[memberRelationPropertyName] = {
          relation: relationIds.map((id) => ({ id })),
        };
        relatedMemberCount = relationIds.length;
      }

      let usageRevenueMonthly: number | undefined;
      if (shouldSyncRevenue) {
        usageRevenueMonthly = await resolveMonthlyUsageRevenueDollars(organizationId, now);
        properties[revenuePropertyName!] = { number: usageRevenueMonthly };
      }

      let lifetimeDealValue: number | undefined;
      if (shouldSyncLifetimeDealValue) {
        lifetimeDealValue = await resolveLifetimeDealValueDollars(organizationId);
        properties[lifetimeDealValuePropertyName!] = { number: lifetimeDealValue };
      }

      const updated = await updateNotionSignupDashboardPage({
        config,
        pageId: existing.id,
        properties,
      });

      results.push({
        organizationId,
        userId: context.userId,
        outcome: 'updated',
        pageId: updated.id,
        pageUrl: updated.url,
        memberCount: counts.totalMembers,
        relatedMemberCount,
        usageRevenueMonthly,
        lifetimeDealValue,
      });
    } catch (error) {
      logger.error('[B2BMemberCountNotionDashboard] Failed to sync member count', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push({
        organizationId,
        outcome: 'failed',
      });
    }
  }

  const updatedCount = results.filter((item) => item.outcome === 'updated').length;
  const skippedCount = results.filter((item) => item.outcome === 'skipped').length;
  const failedCount = results.filter((item) => item.outcome === 'failed').length;

  return {
    processedCount: results.length,
    updatedCount,
    skippedCount,
    failedCount,
    results,
  };
}
