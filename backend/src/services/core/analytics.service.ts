/**
 * @fileoverview Analytics Service
 * @module @nxt1/backend/services/analytics
 *
 * Provides analytics utilities and tracking helpers.
 * The full report builders (buildAthleteReport, buildCoachReport) have been
 * removed — Agent X gathers analytics autonomously via tools during recaps.
 *
 * Remaining exports:
 * - getPeriodDateRange        — date math for periods
 * - getSummaryTimeframeForPeriod — maps period to Mongo timeframe
 * - buildViewsBySourceFromSurfaceCounts — surface counts → ViewsBySource[]
 * - buildViewerBreakdownFromRoleCounts  — role counts → AnalyticsViewerBreakdown[]
 * - recordProfileView         — write a profile_viewed event to Mongo
 */

import { type Firestore } from 'firebase-admin/firestore';
import { getAnalyticsLoggerService } from './analytics-logger.service.js';
import { logger } from '../../utils/logger.js';
import type {
  AnalyticsPeriod,
  AnalyticsDateRange,
  ViewsBySource,
  AnalyticsViewerBreakdown,
} from '@nxt1/core';
import type { AnalyticsSummaryTimeframe } from '@nxt1/core/models';

// ============================================
// HELPERS
// ============================================

/**
 * Compute the date range for a given analytics period.
 */
export function getPeriodDateRange(period: AnalyticsPeriod): AnalyticsDateRange {
  const now = new Date();
  let start: Date;

  switch (period) {
    case 'day':
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'quarter':
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'year':
      start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    case 'all-time':
    default:
      start = new Date('2020-01-01');
      break;
  }

  return {
    start: start.toISOString(),
    end: now.toISOString(),
    label: getPeriodLabel(period),
  };
}

function getPeriodLabel(period: AnalyticsPeriod): string {
  const labels: Record<AnalyticsPeriod, string> = {
    day: 'Today',
    week: 'Last 7 Days',
    month: 'Last 30 Days',
    quarter: 'Last 90 Days',
    year: 'Last Year',
    'all-time': 'All Time',
  };
  return labels[period] ?? period;
}

const SOURCE_LABELS: Record<string, string> = {
  direct: 'Direct',
  email: 'Email',
  profile: 'Profile',
  post: 'Post',
  message: 'Message',
  page: 'Page',
};

export function getSummaryTimeframeForPeriod(period: AnalyticsPeriod): AnalyticsSummaryTimeframe {
  switch (period) {
    case 'day':
      return '24h';
    case 'week':
      return '7d';
    case 'month':
      return '30d';
    case 'quarter':
      return '90d';
    case 'year':
    case 'all-time':
    default:
      return 'all';
  }
}

export function buildViewsBySourceFromSurfaceCounts(
  counts: Readonly<Record<string, number>>
): readonly ViewsBySource[] {
  const entries = Object.entries(counts)
    .map(([source, rawValue]) => [source, Number(rawValue) || 0] as const)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);

  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  if (total === 0) {
    return ['direct', 'email', 'profile', 'post'].map((source) => ({
      source,
      label: SOURCE_LABELS[source] ?? source,
      views: 0,
      percentage: 0,
    }));
  }

  return entries.map(([source, value]) => ({
    source,
    label: SOURCE_LABELS[source] ?? source,
    views: value,
    percentage: Math.round((value / total) * 1000) / 10,
  }));
}

export function buildViewerBreakdownFromRoleCounts(
  counts: Readonly<Record<string, number>>
): readonly AnalyticsViewerBreakdown[] {
  const roleOrder = ['coach', 'director', 'athlete', 'parent', 'other'];
  const roleLabels: Record<string, string> = {
    coach: 'Coaches',
    director: 'Directors',
    athlete: 'Athletes',
    parent: 'Parents',
    other: 'Other',
    anonymous: 'Anonymous',
  };

  const normalizedCounts = roleOrder.map((role) => ({
    role,
    count: Number(counts[role] ?? 0),
  }));
  const total = normalizedCounts.reduce((sum, row) => sum + row.count, 0);

  return normalizedCounts.map((row) => ({
    type: row.role,
    label: roleLabels[row.role] ?? row.role,
    count: row.count,
    percentage: total > 0 ? Math.round((row.count / total) * 1000) / 10 : 0,
  }));
}
// ============================================
// PROFILE VIEW TRACKING
// ============================================

/**
 * Record a profile view event.
 * Mongo analytics is the sole write path here; no Firestore analytics docs or
 * activity items are mutated by this tracker.
 */
export async function recordProfileView(
  _db: Firestore,
  viewedUserId: string,
  viewerUserId: string | null,
  viewerRole?: string
): Promise<void> {
  try {
    await getAnalyticsLoggerService().safeTrack({
      subjectId: viewedUserId,
      subjectType: 'user',
      domain: 'engagement',
      eventType: 'profile_viewed',
      source: viewerUserId ? 'user' : 'system',
      actorUserId: viewerUserId,
      tags: viewerRole ? [viewerRole] : [],
      payload: {
        viewerUserId,
        viewerRole,
      },
      metadata: {
        trackedBy: 'recordProfileView',
        persistence: 'mongo-only',
      },
    });
  } catch (err) {
    logger.warn('Failed to record profile view', { viewedUserId, viewerUserId, error: err });
  }
}
