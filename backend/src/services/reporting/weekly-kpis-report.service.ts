/**
 * @fileoverview Weekly KPIs Report Orchestrator Service
 * @module @nxt1/backend/services/reporting/weekly-kpis-report
 *
 * Orchestrates weekly KPI computation by pulling metrics from finance, lifecycle,
 * and usage data sources, then pushing to Notion via the Weekly KPIs entry service.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { RuntimeEnvironment } from '../../config/runtime-environment.js';
import { UsageEventModel } from '../../models/analytics/usage-event.model.js';
import { PaymentLogModel } from '../../models/billing/payment-log.model.js';
import { logger } from '../../utils/logger.js';
import { getNotionWeeklyKpisConfig } from '../marketing/integrations/notion/notion-client.service.js';
import {
  upsertWeeklyKpisRow,
  type WeeklyKpisMetrics,
} from '../marketing/integrations/notion/weekly-kpis-entry.service.js';
import { fetchGa4WeeklySiteVisitors } from './ga4-site-visitors.service.js';
import {
  countEngagedUsers,
  countEngagementEligibleAccounts,
  countPayingAccounts,
  countPayingEngagedUsers,
} from './engagement-metrics.js';
import { coerceDate } from './account-start-date.js';
import { fetchReportingAccountStartedUsers } from './reporting-account-start-users.js';
import { calculateMedianTimeToFirstUsageHours } from './time-to-first-usage.service.js';
import { resolveUsageEventCostCents } from './usage-event-costs.js';

type Segment = 'b2b' | 'b2c';

interface SegmentCounts {
  readonly b2b: number;
  readonly b2c: number;
  readonly total: number;
}

interface SplitFinancials {
  readonly revenue: SegmentCounts;
  readonly cost: SegmentCounts;
  readonly marginPercent: SegmentCounts;
}

interface WeeklyUsageStartCohortRecord {
  readonly userId: string;
  readonly signupAt?: Date;
  readonly usageStartedAt?: Date;
  readonly segment: Segment;
}

interface SegmentedLifecycleMatch {
  readonly userId: string;
  readonly user: Record<string, unknown>;
}

interface ExplicitSegmentedLifecycleMatch extends SegmentedLifecycleMatch {
  readonly segment: Segment;
}

const USAGE_STARTED_CREATED_AT_FIELDS = [
  'lifecycle.usage.notionDashboard.createdAt',
  'lifecycle.b2cUsers.usageStarted.createdAt',
] as const;

export interface GenerateWeeklyKpisReportInput {
  readonly db: Firestore;
  readonly weekStart: Date;
  readonly environment?: RuntimeEnvironment;
  readonly notionEnvironment?: 'production' | 'staging';
  readonly pushToNotion?: boolean;
}

export interface GenerateWeeklyKpisReportResult {
  readonly weekStart: Date;
  readonly metrics: WeeklyKpisMetrics;
  readonly notionResult?: {
    readonly status: string;
    readonly pageId?: string;
    readonly reason?: string;
  };
}

/**
 * Get week end (Sunday 23:59:59 UTC) from week start (Monday 00:00:00 UTC).
 */
function getWeekEnd(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function getPath(record: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = record;

  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function hasCreatedLifecycle(record: Record<string, unknown>, path: string): boolean {
  const state = getPath(record, path);
  if (!state || typeof state !== 'object') return false;

  const rawState = state as Record<string, unknown>;
  const status = rawState['status'];
  if (status === 'inactive') return false;
  if (status === 'created') return true;

  return Boolean(rawState['createdAt']) || Boolean(rawState['pageId']);
}

function classifySegment(user: Record<string, unknown>): Segment {
  const b2bSignals =
    hasCreatedLifecycle(user, 'lifecycle.usage.notionDashboard') ||
    hasCreatedLifecycle(user, 'lifecycle.sales.closedWon') ||
    hasCreatedLifecycle(user, 'lifecycle.sales.expansionPricing') ||
    hasCreatedLifecycle(user, 'lifecycle.sales.closedLost') ||
    hasCreatedLifecycle(user, 'lifecycle.sales.churned') ||
    hasCreatedLifecycle(user, 'lifecycle.b2cUsers.organizationMode');

  return b2bSignals ? 'b2b' : 'b2c';
}

function hasOrganizationId(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function getLifecycleDate(record: Record<string, unknown>, path: string): Date | undefined {
  return coerceDate(getPath(record, path));
}

function getUsageStartedDate(record: Record<string, unknown>): Date | undefined {
  for (const fieldPath of USAGE_STARTED_CREATED_AT_FIELDS) {
    const startedAt = getLifecycleDate(record, fieldPath);
    if (startedAt) return startedAt;
  }

  return undefined;
}

export function summarizeWeeklyUsageStartCohort(
  records: readonly WeeklyUsageStartCohortRecord[],
  weekEnd: Date
): SegmentCounts {
  let b2b = 0;
  let b2c = 0;

  const uniqueRecords = new Map<string, WeeklyUsageStartCohortRecord>();

  for (const record of records) {
    const existing = uniqueRecords.get(record.userId);
    if (existing?.segment === 'b2b' || record.segment === existing?.segment) continue;
    uniqueRecords.set(record.userId, record);
  }

  for (const record of uniqueRecords.values()) {
    if (!record.signupAt || !record.usageStartedAt) continue;
    if (record.usageStartedAt.getTime() < record.signupAt.getTime()) continue;
    if (record.usageStartedAt.getTime() > weekEnd.getTime()) continue;

    if (record.segment === 'b2b') b2b += 1;
    else b2c += 1;
  }

  return { b2b, b2c, total: b2b + b2c };
}

function calculateRatePercent(numerator: number, denominator: number): number {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : 0;
}

/**
 * Count User documents with a specific lifecycle state transition in the given week.
 *
 * Queries the User collection for lifecycle state timestamps:
 * - 'signup' → lifecycle.signup.notionDashboard.createdAt
 * - 'usage_started' → lifecycle.usage.notionDashboard.createdAt
 * - 'closed_won' → lifecycle.sales.closedWon.createdAt
 * - 'churned' → lifecycle.sales.churned.createdAt
 */
async function countAccountsByPath(
  db: Firestore,
  fieldPath: string,
  weekStart: Date,
  weekEnd: Date
): Promise<number> {
  try {
    const query = db
      .collection('Users')
      .where(fieldPath, '>=', weekStart)
      .where(fieldPath, '<=', weekEnd);

    const snapshot = await query.count().get();
    return snapshot.data().count;
  } catch (err) {
    logger.error('[WeeklyKpisReport] Failed to count lifecycle state', {
      error: err instanceof Error ? err.message : String(err),
      fieldPath,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
    });
    return 0;
  }
}

export function summarizeUniqueSegmentedMatches(
  matches: readonly SegmentedLifecycleMatch[]
): SegmentCounts {
  const uniqueUsers = new Map<string, Record<string, unknown>>();

  for (const match of matches) {
    uniqueUsers.set(match.userId, match.user);
  }

  let b2b = 0;
  let b2c = 0;

  for (const user of uniqueUsers.values()) {
    const segment = classifySegment(user);
    if (segment === 'b2b') b2b += 1;
    else b2c += 1;
  }

  return { b2b, b2c, total: b2b + b2c };
}

export function summarizeExplicitSegmentedMatches(
  matches: readonly ExplicitSegmentedLifecycleMatch[]
): SegmentCounts {
  const uniqueUsers = new Map<string, Segment>();

  for (const match of matches) {
    const existing = uniqueUsers.get(match.userId);
    if (existing === 'b2b' || match.segment === existing) {
      continue;
    }

    uniqueUsers.set(match.userId, match.segment);
  }

  let b2b = 0;
  let b2c = 0;

  for (const segment of uniqueUsers.values()) {
    if (segment === 'b2b') b2b += 1;
    else b2c += 1;
  }

  return { b2b, b2c, total: b2b + b2c };
}

async function countSegmentedFromFields(
  db: Firestore,
  fieldPaths: readonly string[],
  weekStart: Date,
  weekEnd: Date
): Promise<SegmentCounts> {
  try {
    const matches: SegmentedLifecycleMatch[] = [];

    for (const fieldPath of fieldPaths) {
      const snapshot = await db
        .collection('Users')
        .where(fieldPath, '>=', weekStart)
        .where(fieldPath, '<=', weekEnd)
        .get();

      for (const doc of snapshot.docs) {
        matches.push({
          userId: doc.id,
          user: doc.data() as Record<string, unknown>,
        });
      }
    }

    return summarizeUniqueSegmentedMatches(matches);
  } catch (err) {
    logger.error('[WeeklyKpisReport] Failed to count segmented lifecycle state', {
      error: err instanceof Error ? err.message : String(err),
      fieldPaths,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
    });
    return { b2b: 0, b2c: 0, total: 0 };
  }
}

async function countSegmentedAccountStarted(
  db: Firestore,
  weekStart: Date,
  weekEnd: Date
): Promise<SegmentCounts> {
  try {
    const users = await fetchReportingAccountStartedUsers(db, weekStart, weekEnd);
    let b2b = 0;
    let b2c = 0;

    for (const { user } of users) {
      const segment = classifySegment(user);
      if (segment === 'b2b') b2b += 1;
      else b2c += 1;
    }

    return { b2b, b2c, total: b2b + b2c };
  } catch (err) {
    logger.error('[WeeklyKpisReport] Failed to count account started', {
      error: err instanceof Error ? err.message : String(err),
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
    });
    return { b2b: 0, b2c: 0, total: 0 };
  }
}

async function countWeeklyAccountStartedCohortUsageStarted(
  db: Firestore,
  weekStart: Date,
  weekEnd: Date
): Promise<SegmentCounts> {
  try {
    const users = await fetchReportingAccountStartedUsers(db, weekStart, weekEnd);

    const records = users.map(({ userId, user, accountStartAt }) => ({
      userId,
      signupAt: accountStartAt,
      usageStartedAt: getUsageStartedDate(user),
      segment: classifySegment(user),
    })) satisfies WeeklyUsageStartCohortRecord[];

    return summarizeWeeklyUsageStartCohort(records, weekEnd);
  } catch (err) {
    logger.error('[WeeklyKpisReport] Failed to count weekly account-started cohort usage started', {
      error: err instanceof Error ? err.message : String(err),
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
    });
    return { b2b: 0, b2c: 0, total: 0 };
  }
}

async function countSegmentedOnboardingCompleted(
  db: Firestore,
  weekStart: Date,
  weekEnd: Date
): Promise<SegmentCounts> {
  try {
    const snapshot = await db
      .collection('Users')
      .where('onboardingCompletedAt', '>=', weekStart)
      .where('onboardingCompletedAt', '<=', weekEnd)
      .get();

    let b2b = 0;
    let b2c = 0;

    for (const doc of snapshot.docs) {
      const segment = classifySegment(doc.data() as Record<string, unknown>);
      if (segment === 'b2b') b2b += 1;
      else b2c += 1;
    }

    return { b2b, b2c, total: b2b + b2c };
  } catch (err) {
    logger.error('[WeeklyKpisReport] Failed to count onboarding completed', {
      error: err instanceof Error ? err.message : String(err),
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
    });
    return { b2b: 0, b2c: 0, total: 0 };
  }
}

/**
 * Fetch financials for the week from the precomputed financial insights report,
 * or compute fresh if not available.
 */
async function fetchSplitFinancials(start: Date, endExclusive: Date): Promise<SplitFinancials> {
  const usageEvents = await UsageEventModel.find({
    createdAt: { $gte: start, $lt: endExclusive },
  })
    .select({
      metadata: 1,
      billedOwnerType: 1,
      organizationId: 1,
      unitCostSnapshot: 1,
      quantity: 1,
    })
    .lean<
      Array<{
        metadata?: Record<string, unknown>;
        billedOwnerType?: string;
        organizationId?: string | null;
        unitCostSnapshot?: number;
        quantity?: number;
      }>
    >()
    .exec();

  const costTotals = usageEvents.reduce(
    (sum: { b2b: number; b2c: number }, event) => {
      const segment: Segment =
        event.billedOwnerType === 'organization' || hasOrganizationId(event.organizationId)
          ? 'b2b'
          : 'b2c';

      const cents = resolveUsageEventCostCents(event);

      if (segment === 'b2b') sum.b2b += cents;
      else sum.b2c += cents;

      return sum;
    },
    { b2b: 0, b2c: 0 }
  );

  const paymentLogs = await PaymentLogModel.find({
    createdAt: { $gte: start, $lt: endExclusive },
    status: { $in: ['PAID', 'REFUNDED'] },
  })
    .select({ amountPaid: 1, amountRefunded: 1, organizationId: 1 })
    .lean<Array<{ amountPaid?: number; amountRefunded?: number; organizationId?: string | null }>>()
    .exec();

  const revenueTotals = paymentLogs.reduce(
    (sum: { b2b: number; b2c: number }, log) => {
      const segment: Segment = hasOrganizationId(log.organizationId) ? 'b2b' : 'b2c';
      const paid = typeof log.amountPaid === 'number' ? Math.round(log.amountPaid * 100) : 0;
      const refunded =
        typeof log.amountRefunded === 'number' ? Math.round(log.amountRefunded * 100) : 0;
      const cents = paid - refunded;

      if (segment === 'b2b') sum.b2b += cents;
      else sum.b2c += cents;

      return sum;
    },
    { b2b: 0, b2c: 0 }
  );

  const marginB2BCents = revenueTotals.b2b - costTotals.b2b;
  const marginB2CCents = revenueTotals.b2c - costTotals.b2c;
  const revenueTotalCents = revenueTotals.b2b + revenueTotals.b2c;
  const marginTotalCents = marginB2BCents + marginB2CCents;

  const asPercent = (marginCents: number, revenueCents: number): number =>
    revenueCents > 0 ? Number(((marginCents / revenueCents) * 100).toFixed(1)) : 0;

  return {
    revenue: {
      b2b: revenueTotals.b2b / 100,
      b2c: revenueTotals.b2c / 100,
      total: revenueTotalCents / 100,
    },
    cost: {
      b2b: costTotals.b2b / 100,
      b2c: costTotals.b2c / 100,
      total: (costTotals.b2b + costTotals.b2c) / 100,
    },
    marginPercent: {
      b2b: asPercent(marginB2BCents, revenueTotals.b2b),
      b2c: asPercent(marginB2CCents, revenueTotals.b2c),
      total: asPercent(marginTotalCents, revenueTotalCents),
    },
  };
}

/**
 * Generate one week's worth of KPI metrics.
 */
export async function generateWeeklyKpisReport(
  input: GenerateWeeklyKpisReportInput
): Promise<GenerateWeeklyKpisReportResult> {
  const weekEnd = getWeekEnd(input.weekStart);
  const weekEndExclusive = new Date(weekEnd.getTime() + 1);
  const environment = input.environment ?? 'production';
  const notionEnv = (input.notionEnvironment ?? environment) as 'production' | 'staging';

  logger.info('[WeeklyKpisReport] Computing metrics', {
    weekStart: input.weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    environment,
  });

  try {
    // Fetch account state transitions for the week
    // These query the User collection's lifecycle state timestamps

    const newAccountsStarted = await countSegmentedAccountStarted(
      input.db,
      input.weekStart,
      weekEnd
    );

    const usageStarted = await countSegmentedFromFields(
      input.db,
      USAGE_STARTED_CREATED_AT_FIELDS,
      input.weekStart,
      weekEnd
    );

    const b2bClosedWon = await countAccountsByPath(
      input.db,
      'lifecycle.sales.closedWon.createdAt',
      input.weekStart,
      weekEnd
    );

    const b2cClosedWon = await countAccountsByPath(
      input.db,
      'lifecycle.b2cUsers.closedWon.createdAt',
      input.weekStart,
      weekEnd
    );

    const closedLost = await countSegmentedFromFields(
      input.db,
      ['lifecycle.sales.closedLost.createdAt', 'lifecycle.b2cUsers.closedLost.createdAt'],
      input.weekStart,
      weekEnd
    );

    const b2bExpansion = await countAccountsByPath(
      input.db,
      'lifecycle.sales.expansionPricing.createdAt',
      input.weekStart,
      weekEnd
    );

    const b2cExpansion = await countAccountsByPath(
      input.db,
      'lifecycle.b2cUsers.expansionPricing.createdAt',
      input.weekStart,
      weekEnd
    );

    const churned = await countSegmentedFromFields(
      input.db,
      ['lifecycle.sales.churned.createdAt', 'lifecycle.b2cUsers.churned.createdAt'],
      input.weekStart,
      weekEnd
    );

    const onboardingCompleted = await countSegmentedOnboardingCompleted(
      input.db,
      input.weekStart,
      weekEnd
    );

    const active = await countPayingAccounts(
      input.db,
      weekEnd,
      classifySegment,
      '[WeeklyKpisReport]'
    );

    const financials = await fetchSplitFinancials(input.weekStart, weekEndExclusive);

    const timeToFirstUsage = await calculateMedianTimeToFirstUsageHours(
      input.db,
      input.weekStart,
      weekEnd,
      classifySegment
    );
    const totalSiteVisitors = await fetchGa4WeeklySiteVisitors(input.weekStart, weekEnd);

    const b2bClosedLost = closedLost.b2b;
    const b2cClosedLost = closedLost.b2c;
    const b2bChurned = churned.b2b;
    const b2cChurned = churned.b2c;
    const closedWon = b2bClosedWon + b2cClosedWon;
    const closedLostTotal = closedLost.total;
    const expansion = b2bExpansion + b2cExpansion;
    const churnedTotal = churned.total;

    const usageStartedCohort = await countWeeklyAccountStartedCohortUsageStarted(
      input.db,
      input.weekStart,
      weekEnd
    );
    const [engagedUsers, engagementEligibleAccounts, payingEngagedUsers] = await Promise.all([
      countEngagedUsers(
        input.db,
        input.weekStart,
        weekEndExclusive,
        classifySegment,
        '[WeeklyKpisReport]'
      ),
      countEngagementEligibleAccounts(
        input.db,
        input.weekStart,
        weekEndExclusive,
        classifySegment,
        '[WeeklyKpisReport]'
      ),
      countPayingEngagedUsers(
        input.db,
        input.weekStart,
        weekEndExclusive,
        weekEnd,
        classifySegment,
        '[WeeklyKpisReport]'
      ),
    ]);

    const usageStartRate = calculateRatePercent(usageStartedCohort.total, newAccountsStarted.total);
    const b2bUsageStartRate = calculateRatePercent(usageStartedCohort.b2b, newAccountsStarted.b2b);
    const b2cUsageStartRate = calculateRatePercent(usageStartedCohort.b2c, newAccountsStarted.b2c);
    const metrics: WeeklyKpisMetrics = {
      weekStart: input.weekStart,
      newAccountsStartedActual: newAccountsStarted.total,
      usageStartedAccountsActual: usageStarted.total,
      engagedUsersActual: engagedUsers.total,
      engagementEligibleAccountsActual: engagementEligibleAccounts.total,
      payingEngagedUsersActual: payingEngagedUsers.total,
      closedWonAccountsActual: closedWon,
      closedLostAccountsActual: closedLostTotal,
      expansionAccountsActual: expansion,
      churnedAccountsActual: churnedTotal,
      onboardingCompletedAccountsActual: onboardingCompleted.total,
      activeAccountsActual: active.total,
      reconciledCostActual: financials.cost.total,
      usageRevenueActual: financials.revenue.total,
      grossMarginPercentActual: financials.marginPercent.total,
      totalSiteVisitorsActual: totalSiteVisitors,
      usageStartRatePercent: usageStartRate,
      timeToFirstUsageHoursActual: timeToFirstUsage.total,
      b2bNewAccountsStartedActual: newAccountsStarted.b2b,
      b2bUsageStartedAccountsActual: usageStarted.b2b,
      b2bEngagedUsersActual: engagedUsers.b2b,
      b2bEngagementEligibleAccountsActual: engagementEligibleAccounts.b2b,
      b2bPayingEngagedUsersActual: payingEngagedUsers.b2b,
      b2bUsageStartRatePercent: b2bUsageStartRate,
      b2bClosedWonAccountsActual: b2bClosedWon,
      b2bClosedLostAccountsActual: b2bClosedLost,
      b2bExpansionAccountsActual: b2bExpansion,
      b2bChurnedAccountsActual: b2bChurned,
      b2bOnboardingCompletedAccountsActual: onboardingCompleted.b2b,
      b2bActiveAccountsActual: active.b2b,
      b2bReconciledCostActual: financials.cost.b2b,
      b2bUsageRevenueActual: financials.revenue.b2b,
      b2bGrossMarginPercentActual: financials.marginPercent.b2b,
      b2bTimeToFirstUsageHoursActual: timeToFirstUsage.b2b,
      b2cNewAccountsStartedActual: newAccountsStarted.b2c,
      b2cUsageStartedAccountsActual: usageStarted.b2c,
      b2cEngagedUsersActual: engagedUsers.b2c,
      b2cEngagementEligibleAccountsActual: engagementEligibleAccounts.b2c,
      b2cPayingEngagedUsersActual: payingEngagedUsers.b2c,
      b2cUsageStartRatePercent: b2cUsageStartRate,
      b2cClosedWonAccountsActual: b2cClosedWon,
      b2cClosedLostAccountsActual: b2cClosedLost,
      b2cExpansionAccountsActual: b2cExpansion,
      b2cChurnedAccountsActual: b2cChurned,
      b2cOnboardingCompletedAccountsActual: onboardingCompleted.b2c,
      b2cActiveAccountsActual: active.b2c,
      b2cReconciledCostActual: financials.cost.b2c,
      b2cUsageRevenueActual: financials.revenue.b2c,
      b2cGrossMarginPercentActual: financials.marginPercent.b2c,
      b2cTimeToFirstUsageHoursActual: timeToFirstUsage.b2c,
    };

    logger.info('[WeeklyKpisReport] Metrics computed', {
      weekStart: input.weekStart.toISOString(),
      metrics: JSON.stringify(metrics, null, 2),
    });

    // Optionally push to Notion
    let notionResult: GenerateWeeklyKpisReportResult['notionResult'];

    if (input.pushToNotion !== false) {
      try {
        const notionConfig = getNotionWeeklyKpisConfig(notionEnv);
        const upsertResult = await upsertWeeklyKpisRow({
          config: notionConfig,
          metrics,
        });

        notionResult = {
          status: upsertResult.status,
          pageId:
            upsertResult.status !== 'failed' && upsertResult.status !== 'skipped'
              ? upsertResult.pageId
              : undefined,
          reason:
            upsertResult.status === 'skipped'
              ? upsertResult.reason
              : upsertResult.status === 'failed'
                ? upsertResult.error
                : undefined,
        };

        logger.info('[WeeklyKpisReport] Notion upsert result', {
          weekStart: input.weekStart.toISOString(),
          notionResult,
        });
      } catch (notionError) {
        logger.error('[WeeklyKpisReport] Failed to upsert to Notion', {
          error: notionError instanceof Error ? notionError.message : String(notionError),
        });
        notionResult = {
          status: 'failed',
          reason: notionError instanceof Error ? notionError.message : 'unknown',
        };
      }
    }

    return {
      weekStart: input.weekStart,
      metrics,
      notionResult,
    };
  } catch (error) {
    logger.error('[WeeklyKpisReport] Failed to generate report', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Helper to compute the previous week's start date (Monday 00:00:00 UTC).
 */
export function getPreviousWeekStart(now: Date = new Date()): Date {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = today.getUTCDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const lastMonday = new Date(today);
  lastMonday.setUTCDate(lastMonday.getUTCDate() - (daysToMonday + 7));
  return lastMonday;
}
