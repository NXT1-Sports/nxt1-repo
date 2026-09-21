import type { Firestore } from 'firebase-admin/firestore';
import { AgentMessageModel } from '../../models/agent/agent-message.model.js';
import { PaymentLogModel } from '../../models/billing/payment-log.model.js';
import { logger } from '../../utils/logger.js';
import { getReportingAccountStartDate } from './account-start-date.js';

export type ReportingSegment = 'b2b' | 'b2c';

export interface SegmentCounts {
  readonly b2b: number;
  readonly b2c: number;
  readonly total: number;
}

type SegmentClassifier = (user: Record<string, unknown>) => ReportingSegment;

interface EngagementIdentityRecord {
  readonly userId: string;
  readonly user: Record<string, unknown>;
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

export function getOrganizationId(user: Record<string, unknown>): string | undefined {
  const activeBillingTarget = user['activeBillingTarget'];
  const activeOrganizationId =
    activeBillingTarget && typeof activeBillingTarget === 'object'
      ? (activeBillingTarget as Record<string, unknown>)['organizationId']
      : undefined;

  if (typeof activeOrganizationId === 'string' && activeOrganizationId.trim().length > 0) {
    return activeOrganizationId.trim();
  }

  const organizationId = user['organizationId'];
  return typeof organizationId === 'string' && organizationId.trim().length > 0
    ? organizationId.trim()
    : undefined;
}

export function summarizeEngagementIdentityRecords(
  records: readonly EngagementIdentityRecord[],
  classifySegment: SegmentClassifier
): SegmentCounts {
  const b2bOrganizationIds = new Set<string>();
  const b2cUserIds = new Set<string>();

  for (const { userId, user } of records) {
    if (typeof user['_legacyId'] === 'string' && user['_legacyId'].trim().length > 0) continue;

    if (classifySegment(user) === 'b2b') {
      const organizationId = getOrganizationId(user);
      if (organizationId) b2bOrganizationIds.add(organizationId);
    } else {
      b2cUserIds.add(userId);
    }
  }

  return {
    b2b: b2bOrganizationIds.size,
    b2c: b2cUserIds.size,
    total: b2bOrganizationIds.size + b2cUserIds.size,
  };
}

function getEngagementEligibilityAccountStartDate(
  record: Record<string, unknown>
): Date | undefined {
  return (
    getLifecycleDate(record, 'lifecycle.b2cUsers.accountStarted.createdAt') ??
    getReportingAccountStartDate(record)
  );
}

export function isEligibleForEngagementPeriod(
  user: Record<string, unknown>,
  periodStart: Date,
  periodEndExclusive: Date
): boolean {
  if (typeof user['_legacyId'] === 'string' && user['_legacyId'].trim().length > 0) {
    return false;
  }

  const accountStartDate = getEngagementEligibilityAccountStartDate(user);
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
    const records: EngagementIdentityRecord[] = [];

    for (let index = 0; index < normalizedUserIds.length; index += 300) {
      const batchUserIds = normalizedUserIds.slice(index, index + 300);
      if (batchUserIds.length === 0) continue;

      const userRefs = batchUserIds.map((userId) => db.collection('Users').doc(userId));
      const userSnapshots = await db.getAll(...userRefs);

      for (const userSnapshot of userSnapshots) {
        if (!userSnapshot.exists) continue;
        records.push({
          userId: userSnapshot.id,
          user: userSnapshot.data() as Record<string, unknown>,
        });
      }
    }

    return summarizeEngagementIdentityRecords(records, classifySegment);
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

interface PayingIdentitySet {
  readonly individualUserIds: readonly string[];
  readonly organizationIds: readonly string[];
}

async function fetchPayingIdentities(periodEnd: Date): Promise<PayingIdentitySet> {
  const thirtyDaysAgo = new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
  const payments = await PaymentLogModel.find({
    createdAt: { $gte: thirtyDaysAgo, $lte: periodEnd },
    status: 'PAID',
    amountPaid: { $gt: 0 },
  })
    .select({ userId: 1, organizationId: 1 })
    .lean<Array<{ userId?: string; organizationId?: string }>>()
    .exec();

  return {
    individualUserIds: normalizeDistinctStringIds(
      payments.filter((payment) => !payment.organizationId).map((payment) => payment.userId)
    ),
    organizationIds: normalizeDistinctStringIds(payments.map((payment) => payment.organizationId)),
  };
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
    const payingIdentities = await fetchPayingIdentities(periodEnd);
    const personal = await summarizeUserIdsBySegment(
      db,
      payingIdentities.individualUserIds,
      classifySegment,
      logPrefix,
      { periodEnd: periodEnd.toISOString() }
    );
    return {
      b2b: payingIdentities.organizationIds.length,
      b2c: personal.b2c,
      total: payingIdentities.organizationIds.length + personal.b2c,
    };
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
    const [engagedUserIds, payingIdentities] = await Promise.all([
      fetchDistinctEngagedUserIds(periodStart, periodEndExclusive),
      fetchPayingIdentities(payingPeriodEnd),
    ]);

    const payingPersonalUserSet = new Set(payingIdentities.individualUserIds);
    const payingOrganizationSet = new Set(payingIdentities.organizationIds);
    const userRefs = engagedUserIds.map((userId) => db.collection('Users').doc(userId));
    const userSnapshots = await db.getAll(...userRefs);
    const payingEngagedB2BOrganizationIds = new Set<string>();
    const payingEngagedB2CUserIds = new Set<string>();

    for (const snapshot of userSnapshots) {
      if (!snapshot.exists) continue;

      const user = snapshot.data() as Record<string, unknown>;
      if (typeof user['_legacyId'] === 'string' && user['_legacyId'].trim().length > 0) {
        continue;
      }

      const segment = classifySegment(user);
      if (segment === 'b2c') {
        if (payingPersonalUserSet.has(snapshot.id)) payingEngagedB2CUserIds.add(snapshot.id);
        continue;
      }

      const organizationId = getOrganizationId(user);

      if (organizationId && payingOrganizationSet.has(organizationId)) {
        payingEngagedB2BOrganizationIds.add(organizationId);
      }
    }

    return {
      b2b: payingEngagedB2BOrganizationIds.size,
      b2c: payingEngagedB2CUserIds.size,
      total: payingEngagedB2BOrganizationIds.size + payingEngagedB2CUserIds.size,
    };
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
    const records: EngagementIdentityRecord[] = [];

    for (const doc of snapshot.docs) {
      const user = doc.data() as Record<string, unknown>;
      if (!isEligibleForEngagementPeriod(user, periodStart, periodEndExclusive)) continue;
      records.push({ userId: doc.id, user });
    }

    return summarizeEngagementIdentityRecords(records, classifySegment);
  } catch (err) {
    logger.error(`${logPrefix} Failed to count engagement-eligible accounts`, {
      error: err instanceof Error ? err.message : String(err),
      periodStart: periodStart.toISOString(),
      periodEndExclusive: periodEndExclusive.toISOString(),
    });
    return { b2b: 0, b2c: 0, total: 0 };
  }
}
