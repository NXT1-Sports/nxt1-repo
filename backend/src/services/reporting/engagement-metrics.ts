import type { Firestore } from 'firebase-admin/firestore';
import { AgentMessageModel } from '../../models/agent/agent-message.model.js';
import { PaymentLogModel } from '../../models/billing/payment-log.model.js';
import { logger } from '../../utils/logger.js';

export type ReportingSegment = 'b2b' | 'b2c';

export interface SegmentCounts {
  readonly b2b: number;
  readonly b2c: number;
  readonly total: number;
}

type SegmentClassifier = (user: Record<string, unknown>) => ReportingSegment;

function getPath(record: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = record;

  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
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

function getAccountStartDate(record: Record<string, unknown>): Date | undefined {
  return (
    getLifecycleDate(record, 'lifecycle.signup.notionDashboard.createdAt') ??
    toDate(record['createdAt'])
  );
}

function getEarliestLifecycleDate(
  record: Record<string, unknown>,
  paths: readonly string[]
): Date | undefined {
  let earliest: Date | undefined;

  for (const path of paths) {
    const value = getLifecycleDate(record, path);
    if (!value) continue;
    if (!earliest || value.getTime() < earliest.getTime()) earliest = value;
  }

  return earliest;
}

function normalizeDistinctStringIds(values: readonly unknown[]): string[] {
  return [...new Set(values)]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function intersectUserIds(left: readonly string[], right: ReadonlySet<string>): string[] {
  return left.filter((userId) => right.has(userId));
}

export function isEligibleForEngagementPeriod(
  user: Record<string, unknown>,
  periodStart: Date,
  periodEndExclusive: Date
): boolean {
  const accountStartDate = getAccountStartDate(user);
  if (!accountStartDate || accountStartDate.getTime() >= periodEndExclusive.getTime()) return false;

  const closedLostAt = getEarliestLifecycleDate(user, [
    'lifecycle.sales.closedLost.createdAt',
    'lifecycle.b2cUsers.closedLost.createdAt',
  ]);
  if (closedLostAt && closedLostAt.getTime() < periodStart.getTime()) return false;

  const churnedAt = getEarliestLifecycleDate(user, [
    'lifecycle.sales.churned.createdAt',
    'lifecycle.b2cUsers.churned.createdAt',
  ]);
  if (churnedAt && churnedAt.getTime() < periodStart.getTime()) return false;

  return true;
}

async function summarizeUserIdsBySegment(
  db: Firestore,
  userIds: readonly string[],
  classifySegment: SegmentClassifier,
  logPrefix: string,
  rangeContext: Record<string, string>
): Promise<SegmentCounts> {
  try {
    const normalizedUserIds = normalizeDistinctStringIds(userIds);
    let b2b = 0;
    let b2c = 0;

    for (let index = 0; index < normalizedUserIds.length; index += 300) {
      const batchUserIds = normalizedUserIds.slice(index, index + 300);
      if (batchUserIds.length === 0) continue;

      const userRefs = batchUserIds.map((userId) => db.collection('Users').doc(userId));
      const userSnapshots = await db.getAll(...userRefs);

      for (const userSnapshot of userSnapshots) {
        if (!userSnapshot.exists) continue;

        const segment = classifySegment(userSnapshot.data() as Record<string, unknown>);
        if (segment === 'b2b') b2b += 1;
        else b2c += 1;
      }
    }

    return { b2b, b2c, total: b2b + b2c };
  } catch (err) {
    logger.error(`${logPrefix} Failed to summarize user ids by segment`, {
      error: err instanceof Error ? err.message : String(err),
      ...rangeContext,
    });
    return { b2b: 0, b2c: 0, total: 0 };
  }
}

async function fetchDistinctEngagedUserIds(
  periodStart: Date,
  periodEndExclusive: Date
): Promise<string[]> {
  const engagedUserIds = await AgentMessageModel.distinct('userId', {
    role: 'user',
    createdAt: {
      $gte: periodStart.toISOString(),
      $lt: periodEndExclusive.toISOString(),
    },
    userId: { $exists: true, $ne: null },
  });

  return normalizeDistinctStringIds(engagedUserIds);
}

async function fetchDistinctPayingUserIds(periodEnd: Date): Promise<string[]> {
  const thirtyDaysAgo = new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
  const payingUserIds = await PaymentLogModel.distinct('userId', {
    createdAt: { $gte: thirtyDaysAgo, $lte: periodEnd },
    status: 'PAID',
    userId: { $exists: true, $ne: null },
  });

  return normalizeDistinctStringIds(payingUserIds);
}

export async function countEngagedUsers(
  db: Firestore,
  periodStart: Date,
  periodEndExclusive: Date,
  classifySegment: SegmentClassifier,
  logPrefix: string
): Promise<SegmentCounts> {
  try {
    const engagedUserIds = await fetchDistinctEngagedUserIds(periodStart, periodEndExclusive);
    return summarizeUserIdsBySegment(db, engagedUserIds, classifySegment, logPrefix, {
      periodStart: periodStart.toISOString(),
      periodEndExclusive: periodEndExclusive.toISOString(),
    });
  } catch (err) {
    logger.error(`${logPrefix} Failed to count engaged users`, {
      error: err instanceof Error ? err.message : String(err),
      periodStart: periodStart.toISOString(),
      periodEndExclusive: periodEndExclusive.toISOString(),
    });
    return { b2b: 0, b2c: 0, total: 0 };
  }
}

export async function countPayingAccounts(
  db: Firestore,
  periodEnd: Date,
  classifySegment: SegmentClassifier,
  logPrefix: string
): Promise<SegmentCounts> {
  try {
    const payingUserIds = await fetchDistinctPayingUserIds(periodEnd);
    return summarizeUserIdsBySegment(db, payingUserIds, classifySegment, logPrefix, {
      periodEnd: periodEnd.toISOString(),
    });
  } catch (err) {
    logger.error(`${logPrefix} Failed to count paying accounts`, {
      error: err instanceof Error ? err.message : String(err),
      periodEnd: periodEnd.toISOString(),
    });
    return { b2b: 0, b2c: 0, total: 0 };
  }
}

export async function countPayingEngagedUsers(
  db: Firestore,
  periodStart: Date,
  periodEndExclusive: Date,
  payingPeriodEnd: Date,
  classifySegment: SegmentClassifier,
  logPrefix: string
): Promise<SegmentCounts> {
  try {
    const [engagedUserIds, payingUserIds] = await Promise.all([
      fetchDistinctEngagedUserIds(periodStart, periodEndExclusive),
      fetchDistinctPayingUserIds(payingPeriodEnd),
    ]);

    const payingUserSet = new Set(payingUserIds);
    const payingEngagedUserIds = intersectUserIds(engagedUserIds, payingUserSet);

    return summarizeUserIdsBySegment(db, payingEngagedUserIds, classifySegment, logPrefix, {
      periodStart: periodStart.toISOString(),
      periodEndExclusive: periodEndExclusive.toISOString(),
      payingPeriodEnd: payingPeriodEnd.toISOString(),
    });
  } catch (err) {
    logger.error(`${logPrefix} Failed to count paying engaged users`, {
      error: err instanceof Error ? err.message : String(err),
      periodStart: periodStart.toISOString(),
      periodEndExclusive: periodEndExclusive.toISOString(),
      payingPeriodEnd: payingPeriodEnd.toISOString(),
    });
    return { b2b: 0, b2c: 0, total: 0 };
  }
}

export async function countEngagementEligibleAccounts(
  db: Firestore,
  periodStart: Date,
  periodEndExclusive: Date,
  classifySegment: SegmentClassifier,
  logPrefix: string
): Promise<SegmentCounts> {
  try {
    const snapshot = await db.collection('Users').get();

    let b2b = 0;
    let b2c = 0;

    for (const doc of snapshot.docs) {
      const user = doc.data() as Record<string, unknown>;
      if (!isEligibleForEngagementPeriod(user, periodStart, periodEndExclusive)) continue;

      const segment = classifySegment(user);
      if (segment === 'b2b') b2b += 1;
      else b2c += 1;
    }

    return { b2b, b2c, total: b2b + b2c };
  } catch (err) {
    logger.error(`${logPrefix} Failed to count engagement-eligible accounts`, {
      error: err instanceof Error ? err.message : String(err),
      periodStart: periodStart.toISOString(),
      periodEndExclusive: periodEndExclusive.toISOString(),
    });
    return { b2b: 0, b2c: 0, total: 0 };
  }
}
