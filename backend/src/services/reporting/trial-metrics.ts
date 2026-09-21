/**
 * @fileoverview Trial Credit Lifecycle Reporting Metrics
 * @module @nxt1/backend/services/reporting/trial-metrics
 *
 * Computes weekly/monthly trial-credit funnel metrics (started, converted,
 * expired, conversion rate, time-to-conversion) from `Wallets/*` trial
 * metadata, segmented by wallet owner type.
 *
 * Segmentation rules:
 * - Organization wallets (`Wallets/org:{organizationId}`) always count as
 *   'organization'.
 * - Individual wallets count as 'personal' UNLESS the owning user's active
 *   billing target is routed to an organization/team (`activeBillingTarget`
 *   has `ownerType: 'organization'` or an `organizationId`/`teamId`). Those
 *   personal wallets exist alongside an org-billed wallet but are not an
 *   independent personal trial signal, so they are excluded entirely rather
 *   than counted as personal or double-counted as organization.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { logger } from '../../utils/logger.js';
import { COLLECTIONS } from '../../modules/billing/config.js';
import { coerceDate } from './account-start-date.js';

export interface TrialSegmentCounts {
  readonly personal: number;
  readonly organization: number;
  readonly total: number;
}

export interface TrialLifecycleMetrics {
  readonly started: TrialSegmentCounts;
  readonly converted: TrialSegmentCounts;
  readonly expired: TrialSegmentCounts;
  readonly conversionRatePercent: TrialSegmentCounts;
  readonly avgDaysToConversion: TrialSegmentCounts;
}

type TrialSegment = 'personal' | 'organization';
type TrialWalletOwnerType = 'individual' | 'organization';
type TrialStatus = 'active' | 'expired' | 'converted';

interface WalletTrialRecord {
  readonly ownerId: string;
  readonly ownerType: TrialWalletOwnerType;
  readonly status: TrialStatus;
  readonly startedAt?: Date;
  readonly expiresAt?: Date;
  readonly convertedAt?: Date;
}

function emptySegmentCounts(): { personal: number; organization: number; total: number } {
  return { personal: 0, organization: 0, total: 0 };
}

function calculateRatePercent(numerator: number, denominator: number): number {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : 0;
}

function isInRange(date: Date | undefined, start: Date, end: Date): boolean {
  if (!date) return false;
  const time = date.getTime();
  return time >= start.getTime() && time <= end.getTime();
}

/**
 * Batch-resolve which individual wallet owners are billing-routed to an
 * organization/team, so their personal wallet trial can be excluded.
 */
async function fetchOrganizationAffiliatedUserIds(
  db: Firestore,
  userIds: readonly string[]
): Promise<Set<string>> {
  const affiliated = new Set<string>();
  const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
  const chunkSize = 300;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;

    try {
      const refs = chunk.map((id) => db.collection('Users').doc(id));
      const snapshots = await db.getAll(...refs);

      for (const snapshot of snapshots) {
        const data = snapshot.data() as
          | {
              activeBillingTarget?: {
                ownerType?: string;
                organizationId?: string;
                teamId?: string;
              };
            }
          | undefined;
        const target = data?.activeBillingTarget;
        const isAffiliated = Boolean(
          target && (target.ownerType === 'organization' || target.organizationId || target.teamId)
        );

        if (isAffiliated) affiliated.add(snapshot.id);
      }
    } catch (err) {
      logger.error('[TrialMetrics] Failed to resolve organization affiliation for wallets', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return affiliated;
}

/**
 * Compute trial credit funnel metrics for the given reporting window.
 *
 * Scans all wallets carrying trial metadata (bounded by total user + org
 * count, consistent with existing full-collection reporting scans). Personal
 * (individual) wallets whose owning user is billing-routed to an
 * organization are excluded so organization trial activity is never
 * double-represented or misattributed to the personal cohort.
 */
export async function computeTrialLifecycleMetrics(
  db: Firestore,
  periodStart: Date,
  periodEnd: Date
): Promise<TrialLifecycleMetrics> {
  const empty: TrialLifecycleMetrics = {
    started: emptySegmentCounts(),
    converted: emptySegmentCounts(),
    expired: emptySegmentCounts(),
    conversionRatePercent: emptySegmentCounts(),
    avgDaysToConversion: emptySegmentCounts(),
  };

  try {
    const snapshot = await db
      .collection(COLLECTIONS.WALLETS)
      .where('trial.status', 'in', ['active', 'expired', 'converted'])
      .get();

    const records: WalletTrialRecord[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data() as {
        ownerId?: string;
        ownerType?: string;
        trial?: {
          status?: string;
          startedAt?: string;
          expiresAt?: string;
          convertedAt?: string | null;
        };
      };
      const trial = data.trial;
      if (!trial?.status || !data.ownerId) continue;
      if (data.ownerType !== 'individual' && data.ownerType !== 'organization') continue;

      records.push({
        ownerId: data.ownerId,
        ownerType: data.ownerType,
        status: trial.status as TrialStatus,
        startedAt: coerceDate(trial.startedAt),
        expiresAt: coerceDate(trial.expiresAt),
        convertedAt: trial.convertedAt ? coerceDate(trial.convertedAt) : undefined,
      });
    }

    const individualOwnerIds = records
      .filter((record) => record.ownerType === 'individual')
      .map((record) => record.ownerId);
    const orgAffiliatedUserIds = await fetchOrganizationAffiliatedUserIds(db, individualOwnerIds);

    const started = emptySegmentCounts();
    const converted = emptySegmentCounts();
    const expired = emptySegmentCounts();
    const conversionDaysSum = { personal: 0, organization: 0, total: 0 };
    const conversionDaysCount = { personal: 0, organization: 0, total: 0 };

    for (const record of records) {
      let segment: TrialSegment;

      if (record.ownerType === 'organization') {
        segment = 'organization';
      } else if (orgAffiliatedUserIds.has(record.ownerId)) {
        // Org-affiliated personal wallet — mirrors the org's own trial, not an
        // independent personal signal, so it is excluded entirely.
        continue;
      } else {
        segment = 'personal';
      }

      if (isInRange(record.startedAt, periodStart, periodEnd)) {
        started[segment] += 1;
        started.total += 1;
      }

      if (record.status === 'converted' && isInRange(record.convertedAt, periodStart, periodEnd)) {
        converted[segment] += 1;
        converted.total += 1;

        if (record.startedAt && record.convertedAt) {
          const days = (record.convertedAt.getTime() - record.startedAt.getTime()) / 86_400_000;
          conversionDaysSum[segment] += days;
          conversionDaysSum.total += days;
          conversionDaysCount[segment] += 1;
          conversionDaysCount.total += 1;
        }
      }

      // No dedicated `expiredAt` timestamp is stored on the trial; `expiresAt`
      // is the deterministic 30-day grant deadline and is used as the expiry
      // event date for wallets whose status has since flipped to 'expired'.
      if (record.status === 'expired' && isInRange(record.expiresAt, periodStart, periodEnd)) {
        expired[segment] += 1;
        expired.total += 1;
      }
    }

    const conversionRatePercent = {
      personal: calculateRatePercent(converted.personal, converted.personal + expired.personal),
      organization: calculateRatePercent(
        converted.organization,
        converted.organization + expired.organization
      ),
      total: calculateRatePercent(converted.total, converted.total + expired.total),
    };

    const avgDaysToConversion = {
      personal:
        conversionDaysCount.personal > 0
          ? Number((conversionDaysSum.personal / conversionDaysCount.personal).toFixed(1))
          : 0,
      organization:
        conversionDaysCount.organization > 0
          ? Number((conversionDaysSum.organization / conversionDaysCount.organization).toFixed(1))
          : 0,
      total:
        conversionDaysCount.total > 0
          ? Number((conversionDaysSum.total / conversionDaysCount.total).toFixed(1))
          : 0,
    };

    return { started, converted, expired, conversionRatePercent, avgDaysToConversion };
  } catch (err) {
    logger.error('[TrialMetrics] Failed to compute trial lifecycle metrics', {
      error: err instanceof Error ? err.message : String(err),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });
    return empty;
  }
}
