/**
 * @fileoverview Analytics Dashboard Type Definitions
 * @module @nxt1/core/analytics-dashboard
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for Analytics Dashboard feature.
 * 100% portable - works on web, mobile, and backend.
 *
 * Supports both Athlete and Team/Coach analytics views.
 */

// ============================================
// TIME PERIOD TYPES
// ============================================

/**
 * Available time periods for analytics data.
 */
export type AnalyticsPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all-time';

/**
 * Date range configuration.
 */
export interface AnalyticsDateRange {
  /** Start date ISO string */
  readonly start: string;
  /** End date ISO string */
  readonly end: string;
  /** Display label */
  readonly label: string;
}

// ============================================
// TAB TYPES
// ============================================

/**
 * Analytics tab identifiers.
 * Different tabs for different analytics views.
 */
export type AnalyticsTabId =
  | 'overview'
  | 'engagement'
  | 'content'
  | 'recruiting'
  | 'roster'
  | 'insights';

/**
 * Configuration for an analytics tab.
 */
export interface AnalyticsTab {
  /** Unique tab identifier */
  readonly id: AnalyticsTabId;
  /** Display label */
  readonly label: string;
  /** Ionicons icon name */
  readonly icon: string;
  /** Whether tab is for athletes only */
  readonly athleteOnly?: boolean;
  /** Whether tab is for coaches only */
  readonly coachOnly?: boolean;
  /** Whether tab is currently disabled */
  readonly disabled?: boolean;
}

// ============================================
// TREND & CHANGE TYPES
// ============================================

// Import TrendDirection from constants to avoid duplicate export
import type { TrendDirection } from '../constants/user-analytics.constants';

/**
 * Re-export TrendDirection for convenience (originally from user-analytics.constants).
 */
export type { TrendDirection };

/**
 * Trend data for a metric.
 */
export interface MetricTrend {
  /** Percentage change from previous period */
  readonly percentChange: number;
  /** Direction of change */
  readonly direction: TrendDirection;
  /** Previous period value */
  readonly previousValue: number;
  /** Current period value */
  readonly currentValue: number;
}

// ============================================
// METRIC CARD TYPES
// ============================================

/**
 * Metric card size variants.
 */
export type MetricCardSize = 'small' | 'medium' | 'large';

/**
 * Metric card style variants.
 */
export type MetricCardVariant = 'default' | 'highlight' | 'accent' | 'success' | 'warning';

/**
 * Single metric card data.
 */
export interface MetricCard {
  /** Unique identifier */
  readonly id: string;
  /** Display label */
  readonly label: string;
  /** Primary value */
  readonly value: number | string;
  /** Formatted display value */
  readonly displayValue: string;
  /** Value suffix (%, views, etc.) */
  readonly suffix?: string;
  /** Icon name */
  readonly icon: string;
  /** Icon color (CSS variable) */
  readonly iconColor?: string;
  /** Trend data */
  readonly trend?: MetricTrend;
  /** Card size */
  readonly size?: MetricCardSize;
  /** Card variant */
  readonly variant?: MetricCardVariant;
  /** Tooltip/description */
  readonly description?: string;
  /** Deep link route */
  readonly route?: string;
}

// ============================================
// CHART DATA TYPES
// ============================================

/**
 * Chart type variants.
 */
export type ChartType = 'line' | 'bar' | 'area' | 'donut' | 'sparkline';

/**
 * Single data point for charts.
 */
export interface ChartDataPoint {
  /** X-axis label */
  readonly label: string;
  /** Y-axis value */
  readonly value: number;
  /** Optional color override */
  readonly color?: string;
  /** Optional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Dataset for charts.
 */
export interface ChartDataset {
  /** Dataset identifier */
  readonly id: string;
  /** Display label */
  readonly label: string;
  /** Data points */
  readonly data: readonly ChartDataPoint[];
  /** Line/bar color */
  readonly color?: string;
  /** Fill color (for area charts) */
  readonly fillColor?: string;
}

/**
 * Complete chart configuration.
 */
export interface ChartConfig {
  /** Chart type */
  readonly type: ChartType;
  /** Chart title */
  readonly title: string;
  /** Datasets */
  readonly datasets: readonly ChartDataset[];
  /** Show legend */
  readonly showLegend?: boolean;
  /** Show grid lines */
  readonly showGrid?: boolean;
  /** Y-axis label */
  readonly yAxisLabel?: string;
  /** X-axis label */
  readonly xAxisLabel?: string;
}

// ============================================
// ENGAGEMENT ANALYTICS TYPES
// ============================================

/**
 * Profile views breakdown by source.
 */
export interface ViewsBySource {
  /** Source identifier */
  readonly source: 'direct' | 'search' | 'social' | 'email' | 'referral' | 'other';
  /** Source display label */
  readonly label: string;
  /** View count */
  readonly views: number;
  /** Percentage of total */
  readonly percentage: number;
}

/**
 * Geographic distribution data.
 */
export interface GeoDistribution {
  /** Location (state/country) */
  readonly location: string;
  /** Location code (e.g., 'TX', 'US') */
  readonly code: string;
  /** View count from this location */
  readonly views: number;
  /** Percentage of total */
  readonly percentage: number;
}

/**
 * Time-based engagement pattern.
 */
export interface EngagementByTime {
  /** Hour of day (0-23) or day of week (0-6) */
  readonly period: number;
  /** Display label */
  readonly label: string;
  /** Engagement count */
  readonly count: number;
  /** Relative intensity (0-1) */
  readonly intensity: number;
}

/**
 * Viewer type breakdown (who is viewing profile/content).
 * Named AnalyticsViewerBreakdown to avoid conflict with existing ViewerType alias.
 */
export interface AnalyticsViewerBreakdown {
  /** Viewer category */
  readonly type: 'college-coach' | 'athlete' | 'fan' | 'parent' | 'scout' | 'other';
  /** Display label */
  readonly label: string;
  /** Count */
  readonly count: number;
  /** Percentage of total */
  readonly percentage: number;
  /** Trend vs previous period */
  readonly trend?: MetricTrend;
}

// ============================================
// CONTENT ANALYTICS TYPES
// ============================================

/**
 * Video/mixtape performance data.
 */
export interface VideoAnalytics {
  /** Video ID */
  readonly id: string;
  /** Video title/name */
  readonly title: string;
  /** Thumbnail URL */
  readonly thumbnailUrl?: string;
  /** Total views */
  readonly views: number;
  /** Average watch duration (seconds) */
  readonly avgWatchDuration: number;
  /** Watch completion rate (0-1) */
  readonly completionRate: number;
  /** Total watch time (seconds) */
  readonly totalWatchTime: number;
  /** Shares count */
  readonly shares: number;
  /** Created date */
  readonly createdAt: string;
  /** Trend data */
  readonly trend?: MetricTrend;
}

/**
 * Post/content performance data.
 */
export interface PostAnalytics {
  /** Post ID */
  readonly id: string;
  /** Post type */
  readonly type: 'graphic' | 'video' | 'text' | 'poll';
  /** Preview image URL */
  readonly previewUrl?: string;
  /** Views/impressions */
  readonly impressions: number;
  /** Likes/reactions */
  readonly likes: number;
  /** Comments */
  readonly comments: number;
  /** Shares/reposts */
  readonly shares: number;
  /** Engagement rate (interactions/impressions) */
  readonly engagementRate: number;
  /** Created date */
  readonly createdAt: string;
}

/**
 * Graphics/profile card performance.
 */
export interface GraphicAnalytics {
  /** Graphic ID */
  readonly id: string;
  /** Graphic name */
  readonly name: string;
  /** Preview URL */
  readonly previewUrl?: string;
  /** Download count */
  readonly downloads: number;
  /** Share count */
  readonly shares: number;
  /** Created date */
  readonly createdAt: string;
}

// ============================================
// RECRUITING ANALYTICS TYPES (ATHLETE)
// ============================================

/**
 * College interest tracking.
 */
export interface CollegeInterestAnalytics {
  /** College ID */
  readonly collegeId: string;
  /** College name */
  readonly collegeName: string;
  /** College logo URL */
  readonly logoUrl?: string;
  /** Division */
  readonly division: 'D1' | 'D2' | 'D3' | 'NAIA' | 'JUCO';
  /** Interest level */
  readonly interestLevel: 'high' | 'medium' | 'low';
  /** Profile views from this college */
  readonly profileViews: number;
  /** Last viewed date */
  readonly lastViewedAt?: string;
  /** Contacted via email */
  readonly contacted: boolean;
  /** Response received */
  readonly responded: boolean;
}

/**
 * Email campaign analytics.
 */
export interface EmailCampaignAnalytics {
  /** Campaign ID */
  readonly id: string;
  /** Campaign name */
  readonly name: string;
  /** Emails sent */
  readonly sent: number;
  /** Emails delivered */
  readonly delivered: number;
  /** Emails opened */
  readonly opened: number;
  /** Link clicks */
  readonly clicks: number;
  /** Responses received */
  readonly responses: number;
  /** Open rate (0-1) */
  readonly openRate: number;
  /** Click rate (0-1) */
  readonly clickRate: number;
  /** Response rate (0-1) */
  readonly responseRate: number;
  /** Sent date */
  readonly sentAt: string;
}

/**
 * Recruiting journey milestone.
 */
export interface RecruitingMilestone {
  /** Milestone type */
  readonly type:
    | 'profile-created'
    | 'first-view'
    | 'coach-view'
    | 'first-offer'
    | 'visit'
    | 'camp'
    | 'commitment';
  /** Display label */
  readonly label: string;
  /** Achieved status */
  readonly achieved: boolean;
  /** Achievement date (if achieved) */
  readonly achievedAt?: string;
  /** Associated data (college name, etc.) */
  readonly metadata?: Record<string, unknown>;
}

// ============================================
// ROSTER ANALYTICS TYPES (COACH)
// ============================================

/**
 * Individual athlete analytics for coach view.
 */
export interface AthleteRosterAnalytics {
  /** Athlete user ID */
  readonly athleteId: string;
  /** Athlete name */
  readonly name: string;
  /** Profile image URL */
  readonly profileImg?: string;
  /** Sport */
  readonly sport?: string;
  /** Position(s) */
  readonly position?: string;
  /** Graduation year */
  readonly classOf?: number;
  /** Profile views */
  readonly profileViews: number;
  /** Video views */
  readonly videoViews: number;
  /** Total engagement */
  readonly totalEngagement: number;
  /** Engagement share (% of team total) */
  readonly engagementShare: number;
  /** Trend data */
  readonly trend?: MetricTrend;
  /** Last activity date */
  readonly lastActivity?: string;
  /** Profile completeness (0-100) */
  readonly profileCompleteness: number;
  /** Content count (videos, posts, etc.) */
  readonly contentCount: number;
}

/**
 * Team-wide overview analytics.
 */
export interface TeamOverviewAnalytics {
  /** Total profile views across team */
  readonly totalProfileViews: number;
  /** Total video views across team */
  readonly totalVideoViews: number;
  /** Total engagement */
  readonly totalEngagement: number;
  /** Active athletes (with recent activity) */
  readonly activeAthletes: number;
  /** Total athletes on roster */
  readonly totalAthletes: number;
  /** Average engagement per athlete */
  readonly avgEngagementPerAthlete: number;
  /** Team page views */
  readonly teamPageViews: number;
  /** Overall trend */
  readonly trend?: MetricTrend;
}

/**
 * Top performer highlight.
 */
export interface TopPerformer {
  /** Athlete data */
  readonly athlete: AthleteRosterAnalytics;
  /** Key highlights/achievements */
  readonly highlights: readonly string[];
  /** Comparison to team average (multiplier) */
  readonly vsTeamAverage: number;
}

// ============================================
// INSIGHTS & RECOMMENDATIONS
// ============================================

/**
 * Insight category.
 */
export type InsightCategory =
  | 'engagement'
  | 'content'
  | 'recruiting'
  | 'optimization'
  | 'trend'
  | 'milestone';

/**
 * Insight priority level.
 */
export type InsightPriority = 'high' | 'medium' | 'low';

/**
 * AI-generated insight.
 */
export interface AnalyticsInsight {
  /** Unique identifier */
  readonly id: string;
  /** Insight title */
  readonly title: string;
  /** Detailed description */
  readonly description: string;
  /** Category */
  readonly category: InsightCategory;
  /** Priority */
  readonly priority: InsightPriority;
  /** Icon name */
  readonly icon: string;
  /** Associated metric value */
  readonly metricValue?: number | string;
  /** Action to take */
  readonly action?: string;
  /** Action route/deep link */
  readonly actionRoute?: string;
}

/**
 * Actionable recommendation.
 */
export interface AnalyticsRecommendation {
  /** Unique identifier */
  readonly id: string;
  /** Recommendation title */
  readonly title: string;
  /** Detailed explanation */
  readonly description: string;
  /** Expected impact */
  readonly impact: string;
  /** Priority level */
  readonly priority: InsightPriority;
  /** Category */
  readonly category: InsightCategory;
  /** Action label */
  readonly actionLabel?: string;
  /** Action route */
  readonly actionRoute?: string;
}

// ============================================
// COMPLETE ANALYTICS REPORT
// ============================================

/**
 * User role for analytics context.
 */
export type AnalyticsUserRole = 'athlete' | 'coach' | 'parent' | 'fan';

/**
 * Complete analytics report for athletes.
 */
export interface AthleteAnalyticsReport {
  /** User role */
  readonly role: 'athlete';
  /** Report generation timestamp */
  readonly generatedAt: string;
  /** Time period */
  readonly period: AnalyticsPeriod;
  /** Date range */
  readonly dateRange: AnalyticsDateRange;

  // Overview metrics
  readonly overview: {
    readonly profileViews: MetricCard;
    readonly videoViews: MetricCard;
    readonly followers: MetricCard;
    readonly engagementRate: MetricCard;
    readonly profileScore: MetricCard;
    readonly collegeCoachViews: MetricCard;
  };

  // Engagement breakdown
  readonly engagement: {
    readonly viewsBySource: readonly ViewsBySource[];
    readonly viewsByTime: readonly EngagementByTime[];
    readonly viewerTypes: readonly AnalyticsViewerBreakdown[];
    readonly geoDistribution: readonly GeoDistribution[];
    readonly viewsOverTime: ChartConfig;
  };

  // Content performance
  readonly content: {
    readonly videos: readonly VideoAnalytics[];
    readonly posts: readonly PostAnalytics[];
    readonly graphics: readonly GraphicAnalytics[];
    readonly topContent: MetricCard[];
  };

  // Recruiting metrics
  readonly recruiting: {
    readonly collegeInterests: readonly CollegeInterestAnalytics[];
    readonly emailCampaigns: readonly EmailCampaignAnalytics[];
    readonly milestones: readonly RecruitingMilestone[];
    readonly offersReceived: number;
    readonly campAttendance: number;
    readonly collegeVisits: number;
  };

  // AI insights & recommendations
  readonly insights: readonly AnalyticsInsight[];
  readonly recommendations: readonly AnalyticsRecommendation[];
}

/**
 * Complete analytics report for coaches/teams.
 */
export interface CoachAnalyticsReport {
  /** User role */
  readonly role: 'coach';
  /** Report generation timestamp */
  readonly generatedAt: string;
  /** Time period */
  readonly period: AnalyticsPeriod;
  /** Date range */
  readonly dateRange: AnalyticsDateRange;

  // Team overview
  readonly overview: TeamOverviewAnalytics;

  // Overview metric cards
  readonly overviewCards: {
    readonly totalViews: MetricCard;
    readonly teamPageViews: MetricCard;
    readonly activeAthletes: MetricCard;
    readonly avgEngagement: MetricCard;
    readonly totalOffers: MetricCard;
    readonly commitments: MetricCard;
  };

  // Top performer
  readonly topPerformer: TopPerformer | null;

  // Roster breakdown
  readonly roster: readonly AthleteRosterAnalytics[];

  // Time-based patterns
  readonly patterns: {
    readonly viewsByTime: readonly EngagementByTime[];
    readonly viewsByDay: readonly EngagementByTime[];
    readonly viewsOverTime: ChartConfig;
  };

  // AI insights & recommendations
  readonly insights: readonly AnalyticsInsight[];
  readonly recommendations: readonly AnalyticsRecommendation[];
}

/**
 * Union type for any analytics report.
 */
export type AnalyticsReport = AthleteAnalyticsReport | CoachAnalyticsReport;

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

/**
 * Analytics API request parameters.
 */
export interface AnalyticsRequest {
  /** User ID (or team code ID for coaches) */
  readonly userId: string;
  /** User role */
  readonly role: AnalyticsUserRole;
  /** Time period */
  readonly period: AnalyticsPeriod;
  /** Custom date range (overrides period) */
  readonly customRange?: AnalyticsDateRange;
  /** Include detailed breakdown */
  readonly includeDetails?: boolean;
  /** Include AI insights */
  readonly includeInsights?: boolean;
}

/**
 * Analytics API response.
 */
export interface AnalyticsApiResponse {
  /** Success status */
  readonly success: boolean;
  /** Analytics report data */
  readonly data?: AnalyticsReport;
  /** Error message */
  readonly error?: string;
  /** Cache info */
  readonly cache?: {
    readonly hit: boolean;
    readonly ttl: number;
    readonly timestamp: string;
  };
}

// ============================================
// UI STATE TYPES
// ============================================

/**
 * Analytics display state for UI.
 */
export interface AnalyticsDisplayState {
  /** Currently selected tab */
  readonly selectedTab: AnalyticsTabId;
  /** Currently selected period */
  readonly selectedPeriod: AnalyticsPeriod;
  /** Loading state */
  readonly isLoading: boolean;
  /** Refreshing state */
  readonly isRefreshing: boolean;
  /** Error message */
  readonly error: string | null;
  /** Last refresh timestamp */
  readonly lastRefresh: string | null;
  /** User role context */
  readonly userRole: AnalyticsUserRole;
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if report is for an athlete.
 */
export function isAthleteReport(report: AnalyticsReport): report is AthleteAnalyticsReport {
  return report.role === 'athlete';
}

/**
 * Check if report is for a coach.
 */
export function isCoachReport(report: AnalyticsReport): report is CoachAnalyticsReport {
  return report.role === 'coach';
}
