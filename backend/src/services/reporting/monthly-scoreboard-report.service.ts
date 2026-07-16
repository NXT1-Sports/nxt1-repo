/**
 * @fileoverview Monthly Scoreboard Report Orchestrator Service
 * @module @nxt1/backend/services/reporting/monthly-scoreboard-report
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { RuntimeEnvironment } from '../../config/runtime-environment.js';
import { PaymentLogModel } from '../../models/billing/payment-log.model.js';
import { UsageEventModel } from '../../models/analytics/usage-event.model.js';
import { logger } from '../../utils/logger.js';
import { getNotionMonthlyScoreboardConfig } from '../marketing/integrations/notion/notion-client.service.js';
import {
  type MonthlyScoreboardMetrics,
  upsertMonthlyScoreboardRow,
  formatMonthKey,
} from '../marketing/integrations/notion/monthly-scoreboard-entry.service.js';
import { calculateMedianTimeToFirstUsageHours } from './time-to-first-usage.service.js';
import {
  normalizeReferralDetail,
  normalizeReferralSource,
  type CanonicalReferralSource,
} from '../../routes/auth/referral-source.utils.js';
import { fetchGa4MonthlySiteVisitors } from './ga4-site-visitors.service.js';
import {
  countEngagedUsers,
  countEngagementEligibleAccounts,
  countPayingAccounts,
  countPayingEngagedUsers,
} from './engagement-metrics.js';
import { resolveUsageEventCostCents } from './usage-event-costs.js';

export interface GenerateMonthlyScoreboardReportInput {
  readonly db: Firestore;
  readonly monthStart: Date;
  readonly environment?: RuntimeEnvironment;
  readonly notionEnvironment?: 'production' | 'staging';
  readonly pushToNotion?: boolean;
}

export interface GenerateMonthlyScoreboardReportResult {
  readonly monthStart: Date;
  readonly metrics: MonthlyScoreboardMetrics;
  readonly notionResult?: {
    readonly status: string;
    readonly pageId?: string;
    readonly reason?: string;
  };
}

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

interface TopReferralSummary {
  readonly sourcesSummary?: string;
  readonly detailsSummary?: string;
  readonly sourceCounts: Readonly<Record<string, number>>;
  readonly detailCounts: Readonly<Record<string, number>>;
  readonly usersWithReferralSource: number;
}

interface MonthlyUsageStartCohortRecord {
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

function getMonthEnd(monthStart: Date): Date {
  const nextMonthStart = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1)
  );
  return new Date(nextMonthStart.getTime() - 1);
}

function getNextMonthStart(monthStart: Date): Date {
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
}

function getPriorMonthStart(monthStart: Date): Date {
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1));
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

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return undefined;
}

function getLifecycleDate(record: Record<string, unknown>, path: string): Date | undefined {
  return toDate(getPath(record, path));
}

export function summarizeMonthlyUsageStartCohort(
  records: readonly MonthlyUsageStartCohortRecord[],
  monthEnd: Date
): SegmentCounts {
  let b2b = 0;
  let b2c = 0;

  const uniqueRecords = new Map<string, MonthlyUsageStartCohortRecord>();

  for (const record of records) {
    const existing = uniqueRecords.get(record.userId);
    if (existing?.segment === 'b2b' || record.segment === existing?.segment) continue;
    uniqueRecords.set(record.userId, record);
  }

  for (const record of uniqueRecords.values()) {
    if (!record.signupAt || !record.usageStartedAt) continue;
    if (record.usageStartedAt.getTime() < record.signupAt.getTime()) continue;
    if (record.usageStartedAt.getTime() > monthEnd.getTime()) continue;

    if (record.segment === 'b2b') b2b += 1;
    else b2c += 1;
  }

  return { b2b, b2c, total: b2b + b2c };
}

function calculateRatePercent(numerator: number, denominator: number): number {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : 0;
}

function displayReferralSource(source: CanonicalReferralSource): string {
  switch (source) {
    case 'social':
      return 'Social Media';
    case 'friend':
      return 'Friend or Teammate';
    case 'search':
      return 'Search Engine';
    case 'advertisement':
      return 'Advertisement';
    case 'team-code':
      return 'Team Invite Code';
    case 'club':
      return 'Club or Team';
    case 'other':
      return 'Other';
  }
}

function formatTopCounts(
  counts: Map<string, number>,
  total: number,
  limit = 5,
  minCount = 1
): string | undefined {
  if (counts.size === 0 || total <= 0) return undefined;

  const entries = [...counts.entries()]
    .filter((entry) => entry[1] >= minCount)
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    })
    .slice(0, limit)
    .map(([label, count]) => {
      const percent = Math.round((count / total) * 100);
      return `${label} (${count}, ${percent}%)`;
    });

  return entries.length > 0 ? entries.join(' | ') : undefined;
}

function mapFromCounts(counts: Map<string, number>): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries(counts.entries()));
}

async function computeTopReferrals(
  db: Firestore,
  monthStart: Date,
  monthEnd: Date
): Promise<TopReferralSummary> {
  try {
    const snapshot = await db
      .collection('Users')
      .where('onboardingCompletedAt', '>=', monthStart)
      .where('onboardingCompletedAt', '<=', monthEnd)
      .select('referralSource', 'referralDetails', 'referralClubName', 'referralOtherSpecify')
      .get();

    const sourceCounts = new Map<string, number>();
    const detailCounts = new Map<string, number>();

    for (const doc of snapshot.docs) {
      const data = doc.data() as Record<string, unknown>;
      const source = normalizeReferralSource(data['referralSource']);
      if (!source) continue;

      const sourceLabel = displayReferralSource(source);
      sourceCounts.set(sourceLabel, (sourceCounts.get(sourceLabel) ?? 0) + 1);

      const rawDetails = normalizeReferralDetail(data['referralDetails']);
      const rawClub = normalizeReferralDetail(data['referralClubName']);
      const rawOther = normalizeReferralDetail(data['referralOtherSpecify']);

      const detailValue =
        (sourceLabel === 'Club or Team' ? rawClub : null) ??
        (sourceLabel === 'Other' ? rawOther : null) ??
        rawDetails;

      if (detailValue) {
        detailCounts.set(detailValue, (detailCounts.get(detailValue) ?? 0) + 1);
      }
    }

    const totalWithSource = [...sourceCounts.values()].reduce((sum, count) => sum + count, 0);
    const totalWithDetails = [...detailCounts.values()].reduce((sum, count) => sum + count, 0);
    const detailsSummaryWithThreshold = formatTopCounts(detailCounts, totalWithDetails, 5, 2);

    return {
      sourcesSummary: formatTopCounts(sourceCounts, totalWithSource),
      detailsSummary:
        detailsSummaryWithThreshold ?? formatTopCounts(detailCounts, totalWithDetails),
      sourceCounts: mapFromCounts(sourceCounts),
      detailCounts: mapFromCounts(detailCounts),
      usersWithReferralSource: totalWithSource,
    };
  } catch (err) {
    logger.error('[MonthlyScoreboardReport] Failed to compute top referral summaries', {
      error: err instanceof Error ? err.message : String(err),
      monthStart: monthStart.toISOString(),
      monthEnd: monthEnd.toISOString(),
    });
    return {
      sourceCounts: Object.freeze({}),
      detailCounts: Object.freeze({}),
      usersWithReferralSource: 0,
    };
  }
}

async function persistMonthlyScoreboardSnapshot(
  db: Firestore,
  monthStart: Date,
  metrics: MonthlyScoreboardMetrics,
  topReferrals: TopReferralSummary
): Promise<void> {
  try {
    const monthKey = formatMonthKey(monthStart);
    const snapshotDocId = `${monthKey}`;

    await db
      .collection('ReportingMonthlyScoreboardSnapshots')
      .doc(snapshotDocId)
      .set(
        {
          monthKey,
          monthStart: monthStart.toISOString(),
          generatedAt: new Date().toISOString(),
          metrics,
          referralSummary: {
            usersWithReferralSource: topReferrals.usersWithReferralSource,
            topSources: topReferrals.sourcesSummary ?? null,
            topDetails: topReferrals.detailsSummary ?? null,
            sourceCounts: topReferrals.sourceCounts,
            detailCounts: topReferrals.detailCounts,
          },
        },
        { merge: true }
      );
  } catch (error) {
    logger.error('[MonthlyScoreboardReport] Failed to persist monthly snapshot', {
      error: error instanceof Error ? error.message : String(error),
      monthStart: monthStart.toISOString(),
    });
  }
}

async function countAccountsByPath(
  db: Firestore,
  fieldPath: string,
  monthStart: Date,
  monthEnd: Date
): Promise<number> {
  try {
    const query = db
      .collection('Users')
      .where(fieldPath, '>=', monthStart)
      .where(fieldPath, '<=', monthEnd);

    const snapshot = await query.count().get();
    return snapshot.data().count;
  } catch (err) {
    logger.error('[MonthlyScoreboardReport] Failed to count lifecycle state', {
      error: err instanceof Error ? err.message : String(err),
      fieldPath,
      monthStart: monthStart.toISOString(),
      monthEnd: monthEnd.toISOString(),
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
  monthStart: Date,
  monthEnd: Date
): Promise<SegmentCounts> {
  try {
    const matches: SegmentedLifecycleMatch[] = [];

    for (const fieldPath of fieldPaths) {
      const snapshot = await db
        .collection('Users')
        .where(fieldPath, '>=', monthStart)
        .where(fieldPath, '<=', monthEnd)
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
    logger.error('[MonthlyScoreboardReport] Failed to count segmented lifecycle state', {
      error: err instanceof Error ? err.message : String(err),
      fieldPaths,
      monthStart: monthStart.toISOString(),
      monthEnd: monthEnd.toISOString(),
    });
    return { b2b: 0, b2c: 0, total: 0 };
  }
}

async function countSegmentedFromField(
  db: Firestore,
  fieldPath: string,
  monthStart: Date,
  monthEnd: Date
): Promise<SegmentCounts> {
  return countSegmentedFromFields(db, [fieldPath], monthStart, monthEnd);
}

async function countSegmentedAccountStarted(
  db: Firestore,
  monthStart: Date,
  monthEnd: Date
): Promise<SegmentCounts> {
  try {
    const [b2bSnapshot, b2cSnapshot] = await Promise.all([
      db
        .collection('Users')
        .where('lifecycle.signup.notionDashboard.createdAt', '>=', monthStart)
        .where('lifecycle.signup.notionDashboard.createdAt', '<=', monthEnd)
        .get(),
      db
        .collection('Users')
        .where('lifecycle.b2cUsers.accountStarted.createdAt', '>=', monthStart)
        .where('lifecycle.b2cUsers.accountStarted.createdAt', '<=', monthEnd)
        .get(),
    ]);

    const matches: ExplicitSegmentedLifecycleMatch[] = [
      ...b2bSnapshot.docs.map((doc) => ({
        userId: doc.id,
        user: doc.data() as Record<string, unknown>,
        segment: 'b2b' as const,
      })),
      ...b2cSnapshot.docs.map((doc) => ({
        userId: doc.id,
        user: doc.data() as Record<string, unknown>,
        segment: 'b2c' as const,
      })),
    ];

    return summarizeExplicitSegmentedMatches(matches);
  } catch (err) {
    logger.error('[MonthlyScoreboardReport] Failed to count account started', {
      error: err instanceof Error ? err.message : String(err),
      monthStart: monthStart.toISOString(),
      monthEnd: monthEnd.toISOString(),
    });
    return { b2b: 0, b2c: 0, total: 0 };
  }
}

async function countMonthlyAccountStartedCohortUsageStarted(
  db: Firestore,
  monthStart: Date,
  monthEnd: Date
): Promise<SegmentCounts> {
  try {
    const [b2bSnapshot, b2cSnapshot] = await Promise.all([
      db
        .collection('Users')
        .where('lifecycle.signup.notionDashboard.createdAt', '>=', monthStart)
        .where('lifecycle.signup.notionDashboard.createdAt', '<=', monthEnd)
        .get(),
      db
        .collection('Users')
        .where('lifecycle.b2cUsers.accountStarted.createdAt', '>=', monthStart)
        .where('lifecycle.b2cUsers.accountStarted.createdAt', '<=', monthEnd)
        .get(),
    ]);

    const records = [
      ...b2bSnapshot.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          userId: doc.id,
          signupAt: getLifecycleDate(data, 'lifecycle.signup.notionDashboard.createdAt'),
          usageStartedAt: getLifecycleDate(data, 'lifecycle.usage.notionDashboard.createdAt'),
          segment: 'b2b' as const,
        } satisfies MonthlyUsageStartCohortRecord;
      }),
      ...b2cSnapshot.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          userId: doc.id,
          signupAt: getLifecycleDate(data, 'lifecycle.b2cUsers.accountStarted.createdAt'),
          usageStartedAt: getLifecycleDate(data, 'lifecycle.usage.notionDashboard.createdAt'),
          segment: 'b2c' as const,
        } satisfies MonthlyUsageStartCohortRecord;
      }),
    ];

    return summarizeMonthlyUsageStartCohort(records, monthEnd);
  } catch (err) {
    logger.error(
      '[MonthlyScoreboardReport] Failed to count monthly account-started cohort usage started',
      {
        error: err instanceof Error ? err.message : String(err),
        monthStart: monthStart.toISOString(),
        monthEnd: monthEnd.toISOString(),
      }
    );
    return { b2b: 0, b2c: 0, total: 0 };
  }
}

async function countSegmentedOnboardingCompleted(
  db: Firestore,
  monthStart: Date,
  monthEnd: Date
): Promise<SegmentCounts> {
  try {
    const snapshot = await db
      .collection('Users')
      .where('onboardingCompletedAt', '>=', monthStart)
      .where('onboardingCompletedAt', '<=', monthEnd)
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
    logger.error('[MonthlyScoreboardReport] Failed to count onboarding completed', {
      error: err instanceof Error ? err.message : String(err),
      monthStart: monthStart.toISOString(),
      monthEnd: monthEnd.toISOString(),
    });
    return { b2b: 0, b2c: 0, total: 0 };
  }
}

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

function calculateMoMRevenueGrowthPercent(
  currentRevenue: number,
  previousRevenue: number
): number | undefined {
  if (previousRevenue <= 0) return undefined;
  return Number((((currentRevenue - previousRevenue) / previousRevenue) * 100).toFixed(1));
}

export async function generateMonthlyScoreboardReport(
  input: GenerateMonthlyScoreboardReportInput
): Promise<GenerateMonthlyScoreboardReportResult> {
  const monthStart = new Date(
    Date.UTC(input.monthStart.getUTCFullYear(), input.monthStart.getUTCMonth(), 1)
  );
  const monthEnd = getMonthEnd(monthStart);
  const nextMonthStart = getNextMonthStart(monthStart);
  const previousMonthStart = getPriorMonthStart(monthStart);
  const previousMonthEndExclusive = monthStart;

  const environment = input.environment ?? 'production';
  const notionEnv = (input.notionEnvironment ?? environment) as 'production' | 'staging';

  logger.info('[MonthlyScoreboardReport] Computing metrics', {
    monthStart: monthStart.toISOString(),
    monthEnd: monthEnd.toISOString(),
    environment,
  });

  const newAccountsStarted = await countSegmentedAccountStarted(input.db, monthStart, monthEnd);

  const usageStarted = await countSegmentedFromField(
    input.db,
    'lifecycle.usage.notionDashboard.createdAt',
    monthStart,
    monthEnd
  );

  const b2bClosedWon = await countAccountsByPath(
    input.db,
    'lifecycle.sales.closedWon.createdAt',
    monthStart,
    monthEnd
  );
  const b2cClosedWon = await countAccountsByPath(
    input.db,
    'lifecycle.b2cUsers.closedWon.createdAt',
    monthStart,
    monthEnd
  );

  const closedLost = await countSegmentedFromFields(
    input.db,
    ['lifecycle.sales.closedLost.createdAt', 'lifecycle.b2cUsers.closedLost.createdAt'],
    monthStart,
    monthEnd
  );

  const b2bExpansion = await countAccountsByPath(
    input.db,
    'lifecycle.sales.expansionPricing.createdAt',
    monthStart,
    monthEnd
  );
  const b2cExpansion = await countAccountsByPath(
    input.db,
    'lifecycle.b2cUsers.expansionPricing.createdAt',
    monthStart,
    monthEnd
  );

  const churned = await countSegmentedFromFields(
    input.db,
    ['lifecycle.sales.churned.createdAt', 'lifecycle.b2cUsers.churned.createdAt'],
    monthStart,
    monthEnd
  );

  const onboardingCompleted = await countSegmentedOnboardingCompleted(
    input.db,
    monthStart,
    monthEnd
  );

  const b2bClosedLost = closedLost.b2b;
  const b2cClosedLost = closedLost.b2c;
  const b2bChurned = churned.b2b;
  const b2cChurned = churned.b2c;
  const closedWonTotal = b2bClosedWon + b2cClosedWon;
  const closedLostTotal = closedLost.total;
  const expansionTotal = b2bExpansion + b2cExpansion;
  const churnedTotal = churned.total;

  const active = await countPayingAccounts(
    input.db,
    monthEnd,
    classifySegment,
    '[MonthlyScoreboardReport]'
  );
  const currentFinancials = await fetchSplitFinancials(monthStart, nextMonthStart);
  const previousFinancials = await fetchSplitFinancials(
    previousMonthStart,
    previousMonthEndExclusive
  );
  const timeToFirstUsage = await calculateMedianTimeToFirstUsageHours(
    input.db,
    monthStart,
    monthEnd,
    classifySegment
  );
  const topReferrals = await computeTopReferrals(input.db, monthStart, monthEnd);
  const totalSiteVisitors = await fetchGa4MonthlySiteVisitors(monthStart, monthEnd);

  const visitorToSignupConversionPercent =
    typeof totalSiteVisitors === 'number' && totalSiteVisitors > 0
      ? Number(((newAccountsStarted.total / totalSiteVisitors) * 100).toFixed(2))
      : undefined;
  const usageStartedCohort = await countMonthlyAccountStartedCohortUsageStarted(
    input.db,
    monthStart,
    monthEnd
  );
  const [engagedUsers, engagementEligibleAccounts, payingEngagedUsers] = await Promise.all([
    countEngagedUsers(
      input.db,
      monthStart,
      nextMonthStart,
      classifySegment,
      '[MonthlyScoreboardReport]'
    ),
    countEngagementEligibleAccounts(
      input.db,
      monthStart,
      nextMonthStart,
      classifySegment,
      '[MonthlyScoreboardReport]'
    ),
    countPayingEngagedUsers(
      input.db,
      monthStart,
      nextMonthStart,
      monthEnd,
      classifySegment,
      '[MonthlyScoreboardReport]'
    ),
  ]);
  const usageStartRatePercent = calculateRatePercent(
    usageStartedCohort.total,
    newAccountsStarted.total
  );
  const b2bUsageStartRatePercent = calculateRatePercent(
    usageStartedCohort.b2b,
    newAccountsStarted.b2b
  );
  const b2cUsageStartRatePercent = calculateRatePercent(
    usageStartedCohort.b2c,
    newAccountsStarted.b2c
  );

  const metrics: MonthlyScoreboardMetrics = {
    monthStart,
    activePayingAccountsActual: active.total,
    b2bActivePayingAccountsActual: active.b2b,
    b2cActivePayingAccountsActual: active.b2c,
    b2bNewAccountsStartedActual: newAccountsStarted.b2b,
    b2cNewAccountsStartedActual: newAccountsStarted.b2c,
    engagedUsersActual: engagedUsers.total,
    engagementEligibleAccountsActual: engagementEligibleAccounts.total,
    payingEngagedUsersActual: payingEngagedUsers.total,
    b2bEngagedUsersActual: engagedUsers.b2b,
    b2bEngagementEligibleAccountsActual: engagementEligibleAccounts.b2b,
    b2bPayingEngagedUsersActual: payingEngagedUsers.b2b,
    b2cEngagedUsersActual: engagedUsers.b2c,
    b2cEngagementEligibleAccountsActual: engagementEligibleAccounts.b2c,
    b2cPayingEngagedUsersActual: payingEngagedUsers.b2c,
    usageStartedAccountsActual: usageStarted.total,
    b2bUsageStartedAccountsActual: usageStarted.b2b,
    b2cUsageStartedAccountsActual: usageStarted.b2c,
    usageRevenueActual: currentFinancials.revenue.total,
    b2bUsageRevenueActual: currentFinancials.revenue.b2b,
    b2cUsageRevenueActual: currentFinancials.revenue.b2c,
    reconciledCostActual: currentFinancials.cost.total,
    grossMarginPercentActual: currentFinancials.marginPercent.total,
    b2bReconciledCostActual: currentFinancials.cost.b2b,
    b2cReconciledCostActual: currentFinancials.cost.b2c,
    b2bGrossMarginPercentActual: currentFinancials.marginPercent.b2b,
    b2cGrossMarginPercentActual: currentFinancials.marginPercent.b2c,
    momRevenueGrowthPercent: calculateMoMRevenueGrowthPercent(
      currentFinancials.revenue.total,
      previousFinancials.revenue.total
    ),
    newAccountsStartedActual: newAccountsStarted.total,
    usageStartRatePercent,
    b2bUsageStartRatePercent,
    b2cUsageStartRatePercent,
    closedWonAccountsActual: closedWonTotal,
    b2bClosedWonAccountsActual: b2bClosedWon,
    b2cClosedWonAccountsActual: b2cClosedWon,
    closedLostAccountsActual: closedLostTotal,
    b2bClosedLostAccountsActual: b2bClosedLost,
    b2cClosedLostAccountsActual: b2cClosedLost,
    expansionAccountsActual: expansionTotal,
    b2bExpansionAccountsActual: b2bExpansion,
    b2cExpansionAccountsActual: b2cExpansion,
    churnedAccountsActual: churnedTotal,
    b2bChurnedAccountsActual: b2bChurned,
    b2cChurnedAccountsActual: b2cChurned,
    onboardingCompletedAccountsActual: onboardingCompleted.total,
    b2bOnboardingCompletedAccountsActual: onboardingCompleted.b2b,
    b2cOnboardingCompletedAccountsActual: onboardingCompleted.b2c,
    timeToFirstUsageHoursActual: timeToFirstUsage.total,
    b2bTimeToFirstUsageHoursActual: timeToFirstUsage.b2b,
    b2cTimeToFirstUsageHoursActual: timeToFirstUsage.b2c,
    topReferralSourcesActual: topReferrals.sourcesSummary,
    topReferralDetailsActual: topReferrals.detailsSummary,
    totalSiteVisitorsActual: totalSiteVisitors,
    visitorToSignupConversionPercent,
  };

  await persistMonthlyScoreboardSnapshot(input.db, monthStart, metrics, topReferrals);

  let notionResult: GenerateMonthlyScoreboardReportResult['notionResult'];

  if (input.pushToNotion !== false) {
    try {
      const notionConfig = getNotionMonthlyScoreboardConfig(notionEnv);
      const upsertResult = await upsertMonthlyScoreboardRow({
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

      logger.info('[MonthlyScoreboardReport] Notion upsert result', {
        monthStart: monthStart.toISOString(),
        notionResult,
      });
    } catch (notionError) {
      logger.error('[MonthlyScoreboardReport] Failed to upsert to Notion', {
        error: notionError instanceof Error ? notionError.message : String(notionError),
      });
      notionResult = {
        status: 'failed',
        reason: notionError instanceof Error ? notionError.message : 'unknown',
      };
    }
  }

  return {
    monthStart,
    metrics,
    notionResult,
  };
}

export function getPreviousMonthStart(now: Date = new Date()): Date {
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return new Date(
    Date.UTC(currentMonthStart.getUTCFullYear(), currentMonthStart.getUTCMonth() - 1, 1)
  );
}
