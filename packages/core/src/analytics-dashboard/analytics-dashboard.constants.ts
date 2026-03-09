/**
 * @fileoverview Analytics Dashboard Constants
 * @module @nxt1/core/analytics-dashboard
 * @version 1.0.0
 *
 * Configuration constants for Analytics Dashboard feature.
 * 100% portable - no platform dependencies.
 *
 * Uses design tokens from @nxt1/design-tokens for theme awareness.
 */

import type {
  AnalyticsTab,
  AnalyticsTabId,
  AnalyticsPeriod,
  InsightCategory,
  InsightPriority,
  MetricCardVariant,
} from './analytics-dashboard.types';
import type { TrendDirection } from '../constants/user-analytics.constants';

// ============================================
// TAB CONFIGURATION
// ============================================

/**
 * Available analytics tabs with display configuration.
 * Order determines display order in tab bar.
 */
export const ANALYTICS_TABS: readonly AnalyticsTab[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: 'grid-outline',
  },
  {
    id: 'engagement',
    label: 'Engagement',
    icon: 'trending-up-outline',
  },
  {
    id: 'content',
    label: 'Content',
    icon: 'videocam-outline',
  },
  {
    id: 'recruiting',
    label: 'Recruiting',
    icon: 'school-outline',
    athleteOnly: true,
  },
  {
    id: 'roster',
    label: 'Roster',
    icon: 'people-outline',
    coachOnly: true,
  },
  {
    id: 'insights',
    label: 'Insights',
    icon: 'bulb-outline',
  },
] as const;

/**
 * Default selected tab.
 */
export const ANALYTICS_DEFAULT_TAB: AnalyticsTabId = 'overview';

/**
 * Get tabs for a specific user role.
 */
export function getTabsForRole(role: 'athlete' | 'coach'): readonly AnalyticsTab[] {
  return ANALYTICS_TABS.filter((tab) => {
    if (role === 'athlete' && tab.coachOnly) return false;
    if (role === 'coach' && tab.athleteOnly) return false;
    return true;
  });
}

// ============================================
// TIME PERIOD CONFIGURATION
// ============================================

/**
 * Available time periods for analytics.
 */
export const ANALYTICS_PERIODS: readonly {
  id: AnalyticsPeriod;
  label: string;
  shortLabel: string;
}[] = [
  { id: 'day', label: 'Today', shortLabel: '1D' },
  { id: 'week', label: 'Last 7 Days', shortLabel: '7D' },
  { id: 'month', label: 'Last 30 Days', shortLabel: '30D' },
  { id: 'quarter', label: 'Last 90 Days', shortLabel: '90D' },
  { id: 'year', label: 'Last Year', shortLabel: '1Y' },
  { id: 'all-time', label: 'All Time', shortLabel: 'All' },
] as const;

/**
 * Default selected period.
 */
export const ANALYTICS_DEFAULT_PERIOD: AnalyticsPeriod = 'week';

/**
 * Period labels for display.
 */
export const ANALYTICS_PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  day: 'Today',
  week: 'Last 7 Days',
  month: 'Last 30 Days',
  quarter: 'Last 90 Days',
  year: 'Last Year',
  'all-time': 'All Time',
} as const;

// ============================================
// TREND CONFIGURATION
// ============================================

/**
 * Icons for trend directions.
 */
export const TREND_ICONS: Record<TrendDirection, string> = {
  up: 'trending-up',
  down: 'trending-down',
  stable: 'remove-outline',
} as const;

/**
 * Colors for trend directions (CSS variables).
 * Uses semantic design tokens.
 */
export const TREND_COLORS: Record<TrendDirection, string> = {
  up: 'var(--nxt1-color-success, #22c55e)',
  down: 'var(--nxt1-color-error, #ef4444)',
  stable: 'var(--nxt1-color-text-secondary, #a1a1aa)',
} as const;

/**
 * Threshold for trend stability (no change if within this percentage).
 */
export const TREND_STABILITY_THRESHOLD = 1; // 1%

// ============================================
// METRIC CARD CONFIGURATION
// ============================================

/**
 * Metric card icons by type.
 */
export const METRIC_ICONS = {
  profileViews: 'eye-outline',
  videoViews: 'videocam-outline',
  followers: 'people-outline',
  engagement: 'heart-outline',
  collegeCoaches: 'school-outline',
  emails: 'mail-outline',
  offers: 'trophy-outline',
  visits: 'location-outline',
  camps: 'fitness-outline',
  commitments: 'checkmark-circle-outline',
  teamPage: 'business-outline',
  activeAthletes: 'flash-outline',
  profileScore: 'star-outline',
} as const;

/**
 * Colors for metric card variants.
 */
export const METRIC_CARD_COLORS: Record<
  MetricCardVariant,
  { bg: string; text: string; icon: string }
> = {
  default: {
    bg: 'var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02))',
    text: 'var(--nxt1-color-text-primary, #ffffff)',
    icon: 'var(--nxt1-color-text-secondary, #a1a1aa)',
  },
  highlight: {
    bg: 'var(--nxt1-color-primary-alpha-10, rgba(204, 255, 0, 0.1))',
    text: 'var(--nxt1-color-primary, #ccff00)',
    icon: 'var(--nxt1-color-primary, #ccff00)',
  },
  accent: {
    bg: 'var(--nxt1-color-info-alpha-10, rgba(59, 130, 246, 0.1))',
    text: 'var(--nxt1-color-info, #3b82f6)',
    icon: 'var(--nxt1-color-info, #3b82f6)',
  },
  success: {
    bg: 'var(--nxt1-color-success-alpha-10, rgba(34, 197, 94, 0.1))',
    text: 'var(--nxt1-color-success, #22c55e)',
    icon: 'var(--nxt1-color-success, #22c55e)',
  },
  warning: {
    bg: 'var(--nxt1-color-warning-alpha-10, rgba(245, 158, 11, 0.1))',
    text: 'var(--nxt1-color-warning, #f59e0b)',
    icon: 'var(--nxt1-color-warning, #f59e0b)',
  },
} as const;

// ============================================
// INSIGHT CONFIGURATION
// ============================================

/**
 * Icons for insight categories.
 */
export const INSIGHT_CATEGORY_ICONS: Record<InsightCategory, string> = {
  engagement: 'trending-up-outline',
  content: 'videocam-outline',
  recruiting: 'school-outline',
  optimization: 'settings-outline',
  trend: 'analytics-outline',
  milestone: 'ribbon-outline',
} as const;

/**
 * Colors for insight categories.
 */
export const INSIGHT_CATEGORY_COLORS: Record<InsightCategory, string> = {
  engagement: 'var(--nxt1-color-info)',
  content: 'var(--nxt1-color-primary)',
  recruiting: 'var(--nxt1-color-success)',
  optimization: 'var(--nxt1-color-warning)',
  trend: 'var(--nxt1-color-info)',
  milestone: 'var(--nxt1-color-primary)',
} as const;

/**
 * Colors for insight priorities.
 */
export const INSIGHT_PRIORITY_COLORS: Record<InsightPriority, string> = {
  high: 'var(--nxt1-color-error)',
  medium: 'var(--nxt1-color-warning)',
  low: 'var(--nxt1-color-text-secondary)',
} as const;

// ============================================
// CHART CONFIGURATION
// ============================================

/**
 * Default chart colors (using design tokens).
 */
export const CHART_COLORS = {
  primary: 'var(--nxt1-color-primary, #ccff00)',
  secondary: 'var(--nxt1-color-info, #3b82f6)',
  tertiary: 'var(--nxt1-color-success, #22c55e)',
  quaternary: 'var(--nxt1-color-warning, #f59e0b)',
  grid: 'var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1))',
  text: 'var(--nxt1-color-text-secondary, #a1a1aa)',
} as const;

/**
 * Day of week labels.
 */
export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Hour labels (12-hour format).
 */
export const HOUR_LABELS = [
  '12AM',
  '1AM',
  '2AM',
  '3AM',
  '4AM',
  '5AM',
  '6AM',
  '7AM',
  '8AM',
  '9AM',
  '10AM',
  '11AM',
  '12PM',
  '1PM',
  '2PM',
  '3PM',
  '4PM',
  '5PM',
  '6PM',
  '7PM',
  '8PM',
  '9PM',
  '10PM',
  '11PM',
] as const;

// ============================================
// CACHE CONFIGURATION
// ============================================

/**
 * Cache keys for analytics data.
 */
export const ANALYTICS_CACHE_KEYS = {
  /** Report cache key prefix */
  REPORT_PREFIX: 'analytics:report:',
  /** Overview cache key prefix */
  OVERVIEW_PREFIX: 'analytics:overview:',
  /** Engagement cache key prefix */
  ENGAGEMENT_PREFIX: 'analytics:engagement:',
  /** Content cache key prefix */
  CONTENT_PREFIX: 'analytics:content:',
  /** Roster cache key prefix */
  ROSTER_PREFIX: 'analytics:roster:',
  /** Insights cache key */
  INSIGHTS_PREFIX: 'analytics:insights:',
} as const;

/**
 * Cache TTL values (in milliseconds).
 */
export const ANALYTICS_CACHE_TTL = {
  /** Report: 5 minutes */
  REPORT: 5 * 60 * 1000,
  /** Overview: 2 minutes (frequently accessed) */
  OVERVIEW: 2 * 60 * 1000,
  /** Engagement: 5 minutes */
  ENGAGEMENT: 5 * 60 * 1000,
  /** Content: 5 minutes */
  CONTENT: 5 * 60 * 1000,
  /** Roster: 3 minutes */
  ROSTER: 3 * 60 * 1000,
  /** Insights: 10 minutes (AI generated, expensive) */
  INSIGHTS: 10 * 60 * 1000,
} as const;

// ============================================
// PAGINATION CONFIGURATION
// ============================================

/**
 * Default pagination for lists.
 */
export const ANALYTICS_PAGINATION_DEFAULTS = {
  /** Default page size */
  pageSize: 10,
  /** Maximum page size */
  maxPageSize: 50,
  /** Roster default page size */
  rosterPageSize: 20,
} as const;

// ============================================
// EMPTY STATE CONFIGURATION
// ============================================

/**
 * Empty state messages per tab.
 */
export const ANALYTICS_EMPTY_STATES: Record<
  AnalyticsTabId,
  { title: string; message: string; icon: string; ctaLabel?: string; ctaRoute?: string }
> = {
  overview: {
    title: 'No analytics yet',
    message: 'Complete your profile and share your content to start tracking your progress.',
    icon: 'analytics-outline',
    ctaLabel: 'Complete Profile',
    ctaRoute: '/edit-profile',
  },
  engagement: {
    title: 'No engagement data',
    message: 'Share your profile to start seeing who views your content.',
    icon: 'trending-up-outline',
    ctaLabel: 'Share Profile',
  },
  content: {
    title: 'No content yet',
    message: 'Upload highlights and create graphics to track their performance.',
    icon: 'videocam-outline',
    ctaLabel: 'Upload Highlight',
    ctaRoute: '/post/create',
  },
  recruiting: {
    title: 'Start your recruiting journey',
    message: 'Add college interests and send campaigns to track your recruiting progress.',
    icon: 'school-outline',
    ctaLabel: 'Add College Interests',
    ctaRoute: '/recruiting',
  },
  roster: {
    title: 'No athletes on roster',
    message: 'Add athletes to your team to see their combined analytics.',
    icon: 'people-outline',
    ctaLabel: 'Invite Athletes',
  },
  insights: {
    title: 'Insights coming soon',
    message: "We'll provide personalized insights once we have enough data.",
    icon: 'bulb-outline',
  },
} as const;

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Analytics API endpoint paths.
 */
export const ANALYTICS_API_ENDPOINTS = {
  /** Get full analytics report */
  REPORT: '/analytics/report',
  /** Get overview metrics */
  OVERVIEW: '/analytics/overview',
  /** Get engagement breakdown */
  ENGAGEMENT: '/analytics/engagement',
  /** Get content performance */
  CONTENT: '/analytics/content',
  /** Get recruiting metrics (athlete) */
  RECRUITING: '/analytics/recruiting',
  /** Get roster analytics (coach) */
  ROSTER: '/analytics/roster',
  /** Get AI insights */
  INSIGHTS: '/analytics/insights',
  /** Export report */
  EXPORT: '/analytics/export',
} as const;

// ============================================
// UI CONFIGURATION
// ============================================

/**
 * UI configuration values.
 */
export const ANALYTICS_UI_CONFIG = {
  /** Number of metric cards in overview row */
  overviewCardsPerRow: 3,
  /** Number of top content items to show */
  topContentCount: 5,
  /** Number of top athletes to show in roster */
  topAthletesCount: 10,
  /** Number of insights to show initially */
  insightsPreviewCount: 3,
  /** Minimum data points for charts */
  minChartDataPoints: 2,
  /** Animation duration (ms) */
  animationDuration: 300,
  /** Skeleton card count */
  skeletonCardCount: 6,
} as const;
