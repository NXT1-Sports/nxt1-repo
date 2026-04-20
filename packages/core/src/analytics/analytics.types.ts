/**
 * @fileoverview Analytics Types
 * @module @nxt1/core/analytics
 *
 * Pure TypeScript types for the analytics feature.
 * Used by both the backend service and frontend display.
 */

// ============================================
// PERIOD & DATE RANGE
// ============================================

/** Time period for filtering analytics data. */
export type AnalyticsPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all-time';

/** Resolved date range from an AnalyticsPeriod. */
export interface AnalyticsDateRange {
  readonly start: string;
  readonly end: string;
  readonly label: string;
}

// ============================================
// METRIC CARD
// ============================================

/** A single overview metric card (profile views, video views, etc.). */
export interface MetricCard {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly displayValue: string;
  readonly icon?: string;
  readonly suffix?: string;
  readonly variant?: 'default' | 'success' | 'warning' | 'highlight';
}

// ============================================
// ENGAGEMENT DATA
// ============================================

/** Traffic source breakdown for profile views. */
export interface ViewsBySource {
  readonly source: string;
  readonly label: string;
  readonly views: number;
  readonly percentage: number;
}

/** Geographic distribution of viewers. */
export interface GeoDistribution {
  readonly region: string;
  readonly count: number;
  readonly percentage: number;
}

/** Engagement breakdown by time period (day of week, hour, etc.). */
export interface EngagementByTime {
  readonly period: number;
  readonly label: string;
  readonly count: number;
  readonly intensity: number;
}

/** Viewer breakdown by user role. */
export interface AnalyticsViewerBreakdown {
  readonly type: string;
  readonly label: string;
  readonly count: number;
  readonly percentage: number;
}

// ============================================
// CHART DATA
// ============================================

/** A single dataset within a chart. */
export interface ChartDataset {
  readonly id: string;
  readonly label: string;
  readonly data: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  readonly color?: string;
}

/** Chart configuration for rendering time-series or categorical data. */
export interface ChartConfig {
  readonly type: 'area' | 'bar' | 'line' | 'pie';
  readonly title: string;
  readonly datasets: readonly ChartDataset[];
  readonly showLegend?: boolean;
  readonly showGrid?: boolean;
}

// ============================================
// CONTENT ANALYTICS
// ============================================

/** Analytics for a single video. */
export interface VideoAnalytics {
  readonly id: string;
  readonly title: string;
  readonly thumbnailUrl?: string;
  readonly views: number;
  readonly avgWatchDuration: number;
  readonly completionRate: number;
  readonly totalWatchTime: number;
  readonly shares: number;
  readonly createdAt: string;
}

/** Analytics for a single post. */
export interface PostAnalytics {
  readonly id: string;
  readonly type: 'text' | 'image' | 'video' | 'graphic';
  readonly previewUrl?: string;
  readonly impressions: number;
  readonly shares: number;
  readonly engagementRate: number;
  readonly createdAt: string;
}

// ============================================
// RECRUITING
// ============================================

/** A recruiting milestone in an athlete's journey. */
export interface RecruitingMilestone {
  readonly type: string;
  readonly label: string;
  readonly achieved: boolean;
  readonly achievedAt?: string;
}

// ============================================
// INSIGHTS & RECOMMENDATIONS
// ============================================

/** An AI-generated or rule-based analytics insight. */
export interface AnalyticsInsight {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly priority: 'high' | 'medium' | 'low';
  readonly icon?: string;
  readonly metricValue?: string | number;
  readonly action?: string;
  readonly actionRoute?: string;
}

/** An actionable recommendation for improving metrics. */
export interface AnalyticsRecommendation {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly impact?: string;
  readonly priority: 'high' | 'medium' | 'low';
  readonly category: string;
  readonly actionLabel?: string;
  readonly actionRoute?: string;
}
