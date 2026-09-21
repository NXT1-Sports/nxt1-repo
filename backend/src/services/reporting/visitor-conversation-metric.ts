import { AgentMessageModel } from '../../models/agent/agent-message.model.js';
import { logger } from '../../utils/logger.js';
import {
  fetchGa4SiteVisitorReport,
  type Ga4SiteVisitorReport,
} from './ga4-site-visitors.service.js';

export interface VisitorConversationMetric {
  readonly totalVisitors?: number;
  readonly conversingVisitors?: number;
  readonly ratePercent?: number;
}

export function calculateVisitorToConversationRate(
  conversingVisitors: number,
  totalVisitors: number
): number | undefined {
  if (totalVisitors <= 0) return undefined;
  return Number(((conversingVisitors / totalVisitors) * 100).toFixed(2));
}

/**
 * Visitor-to-conversation rate: distinct users who sent Agent X a message
 * during the period, as a fraction of total GA4 site visitors for the same
 * period.
 *
 * Note: this is not a strict same-visitor cohort join. The GA4 Data API does
 * not expose raw User-ID values as a queryable dimension (Google withholds it
 * for privacy even when the User-ID feature is enabled), so a GA4 visitor
 * cannot be correlated 1:1 with a backend user record. `conversingVisitors`
 * is therefore the backend-owned count of distinct conversing users, treated
 * as a proxy numerator against the GA4 traffic denominator.
 */
export async function calculateVisitorConversationMetric(
  startDate: Date,
  endDateExclusive: Date,
  periodLabel: 'week' | 'month',
  fetchVisitorReport: (
    start: Date,
    end: Date,
    label: 'week' | 'month'
  ) => Promise<Ga4SiteVisitorReport | undefined> = fetchGa4SiteVisitorReport
): Promise<VisitorConversationMetric> {
  try {
    const visitorReport = await fetchVisitorReport(
      startDate,
      new Date(endDateExclusive.getTime() - 1),
      periodLabel
    );
    if (!visitorReport) return {};

    const messageUserIds = await AgentMessageModel.distinct('userId', {
      role: 'user',
      createdAt: {
        $gte: startDate.toISOString(),
        $lt: endDateExclusive.toISOString(),
      },
      userId: { $exists: true, $ne: null },
    });
    const conversingVisitors = new Set(
      messageUserIds
        .filter((userId): userId is string => typeof userId === 'string')
        .map((userId) => userId.trim())
        .filter((userId) => userId.length > 0)
    ).size;

    return {
      totalVisitors: visitorReport.totalUsers,
      conversingVisitors,
      ratePercent: calculateVisitorToConversationRate(conversingVisitors, visitorReport.totalUsers),
    };
  } catch (error) {
    logger.warn('[VisitorConversationMetric] Failed to compute cohort metric', {
      error: error instanceof Error ? error.message : String(error),
      periodLabel,
      startDate: startDate.toISOString(),
      endDateExclusive: endDateExclusive.toISOString(),
    });
    return {};
  }
}
