/**
 * @fileoverview Analytics Dashboard Module - Barrel Export
 * @module @nxt1/core/analytics-dashboard
 * @version 1.0.0
 *
 * Pure TypeScript analytics dashboard module.
 * 100% portable - works on web, mobile, and backend.
 */

// ============================================
// TYPES
// ============================================

export type {
  // Time periods
  AnalyticsPeriod,
  AnalyticsDateRange,
  // Tabs
  AnalyticsTabId,
  AnalyticsTab,
  // Trends (TrendDirection comes from user-analytics.constants via re-export)
  MetricTrend,
  // Metric cards
  MetricCardSize,
  MetricCardVariant,
  MetricCard,
  // Charts
  ChartType,
  ChartDataPoint,
  ChartDataset,
  ChartConfig,
  // Engagement
  ViewsBySource,
  GeoDistribution,
  EngagementByTime,
  AnalyticsViewerBreakdown,
  // Content
  VideoAnalytics,
  PostAnalytics,
  GraphicAnalytics,
  // Recruiting (athlete)
  CollegeInterestAnalytics,
  EmailCampaignAnalytics,
  RecruitingMilestone,
  // Roster (coach)
  AthleteRosterAnalytics,
  TeamOverviewAnalytics,
  TopPerformer,
  // Insights
  InsightCategory,
  InsightPriority,
  AnalyticsInsight,
  AnalyticsRecommendation,
  // Reports
  AnalyticsUserRole,
  AthleteAnalyticsReport,
  CoachAnalyticsReport,
  AnalyticsReport,
  // API
  AnalyticsRequest,
  AnalyticsApiResponse,
  // UI State
  AnalyticsDisplayState,
} from './analytics-dashboard.types';

// ============================================
// TYPE GUARDS
// ============================================

export { isAthleteReport, isCoachReport } from './analytics-dashboard.types';

// ============================================
// CONSTANTS
// ============================================

export {
  // Tabs
  ANALYTICS_TABS,
  ANALYTICS_DEFAULT_TAB,
  getTabsForRole,
  // Periods
  ANALYTICS_PERIODS,
  ANALYTICS_DEFAULT_PERIOD,
  ANALYTICS_PERIOD_LABELS,
  // Trends
  TREND_ICONS,
  TREND_COLORS,
  TREND_STABILITY_THRESHOLD,
  // Metrics
  METRIC_ICONS,
  METRIC_CARD_COLORS,
  // Insights
  INSIGHT_CATEGORY_ICONS,
  INSIGHT_CATEGORY_COLORS,
  INSIGHT_PRIORITY_COLORS,
  // Charts
  CHART_COLORS,
  DAY_LABELS,
  HOUR_LABELS,
  // Cache
  ANALYTICS_CACHE_KEYS,
  ANALYTICS_CACHE_TTL,
  // Pagination
  ANALYTICS_PAGINATION_DEFAULTS,
  // Empty states
  ANALYTICS_EMPTY_STATES,
  // API
  ANALYTICS_API_ENDPOINTS,
  // UI
  ANALYTICS_UI_CONFIG,
} from './analytics-dashboard.constants';

// ============================================
// API
// ============================================

export {
  createAnalyticsDashboardApi,
  type AnalyticsDashboardApi,
  type OverviewResponse,
  type EngagementResponse,
  type ContentResponse,
  type RosterResponse,
  type InsightsResponse,
} from './analytics-dashboard.api';
