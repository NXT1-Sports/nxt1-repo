/**
 * @fileoverview User Analytics Constants
 * @module @nxt1/core/constants
 *
 * Constants for the USER ANALYTICS system - stored engagement data
 * (profile views, video views, traffic sources, viewer breakdowns).
 * These constants are used by user-analytics.model.ts types.
 *
 * For APP ANALYTICS (event tracking sent to Mixpanel/Firebase),
 * see: models/app-analytics.model.ts
 *
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

// ============================================
// EVENT TYPES
// ============================================

export const ANALYTICS_EVENT_TYPES = {
  // View events
  PROFILE_VIEW: 'profile_view',
  VIDEO_VIEW: 'video_view',
  POST_VIEW: 'post_view',
  CARD_VIEW: 'card_view',

  // Engagement events
  FOLLOW: 'follow',
  UNFOLLOW: 'unfollow',
  SHARE: 'share',
  REACTION: 'reaction',
  COMMENT: 'comment',
  REPOST: 'repost',

  // Content events
  VIDEO_PLAY: 'video_play',
  VIDEO_COMPLETE: 'video_complete',
  CARD_DOWNLOAD: 'card_download',
  CARD_SHARE: 'card_share',

  // Campaign events
  EMAIL_SENT: 'email_sent',
  EMAIL_OPEN: 'email_open',
  EMAIL_CLICK: 'email_click',
  EMAIL_REPLY: 'email_reply',

  // AI events
  AI_TASK_START: 'ai_task_start',
  AI_TASK_COMPLETE: 'ai_task_complete',

  // Session events
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
} as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[keyof typeof ANALYTICS_EVENT_TYPES];

// ============================================
// TRAFFIC SOURCES
// ============================================

export const TRAFFIC_SOURCES = {
  DIRECT: 'direct',
  SEARCH: 'search',
  CAMPAIGN: 'campaign',
  SOCIAL: 'social',
  REFERRAL: 'referral',
  QR_CODE: 'qr_code',
  TEAM_PAGE: 'team_page',
  RANKINGS: 'rankings',
  UNKNOWN: 'unknown',
} as const;

export type TrafficSource = (typeof TRAFFIC_SOURCES)[keyof typeof TRAFFIC_SOURCES];

// ============================================
// AGGREGATION PERIODS
// ============================================

export const AGGREGATION_PERIODS = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly',
  LIFETIME: 'lifetime',
} as const;

export type AggregationPeriod = (typeof AGGREGATION_PERIODS)[keyof typeof AGGREGATION_PERIODS];

// ============================================
// TREND DIRECTIONS
// ============================================

export const TREND_DIRECTIONS = {
  UP: 'up',
  DOWN: 'down',
  STABLE: 'stable',
} as const;

export type TrendDirection = (typeof TREND_DIRECTIONS)[keyof typeof TREND_DIRECTIONS];

// ============================================
// VIEWER TYPES
// ============================================

export const VIEWER_TYPES = {
  RECRUITER: 'recruiter',
  HIGH_SCHOOL_COACH: 'high_school_coach',
  COACH: 'coach',
  ATHLETE: 'athlete',
  PARENT: 'parent',
  DIRECTOR: 'director',
  ANONYMOUS: 'anonymous',
  /** @deprecated Use RECRUITER instead */
  COLLEGE_COACH: 'recruiter',
  /** @deprecated Use RECRUITER instead */
  SCOUT: 'recruiter',
  /** @deprecated Removed */
  FAN: 'athlete',
} as const;

export type ViewerType = (typeof VIEWER_TYPES)[keyof typeof VIEWER_TYPES];

// ============================================
// DEVICE TYPES
// ============================================

export const DEVICE_TYPES = {
  MOBILE: 'mobile',
  TABLET: 'tablet',
  DESKTOP: 'desktop',
  UNKNOWN: 'unknown',
} as const;

export type DeviceType = (typeof DEVICE_TYPES)[keyof typeof DEVICE_TYPES];

// ============================================
// SYNC STATUS
// ============================================

export const SYNC_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type SyncStatus = (typeof SYNC_STATUS)[keyof typeof SYNC_STATUS];

// ============================================
// THRESHOLDS & LIMITS
// ============================================

export const ANALYTICS_THRESHOLDS = {
  /** Maximum events per daily document before splitting */
  MAX_EVENTS_PER_DAY: 10000,

  /** Days to retain raw event data */
  RAW_EVENT_RETENTION_DAYS: 90,

  /** Days to retain daily aggregates */
  DAILY_AGGREGATE_RETENTION_DAYS: 365,

  /** Minimum views to calculate meaningful trends */
  MIN_VIEWS_FOR_TREND: 10,

  /** Sync interval in minutes */
  COUNTER_SYNC_INTERVAL_MINUTES: 15,

  /** Batch size for aggregation jobs */
  AGGREGATION_BATCH_SIZE: 500,
} as const;

// ============================================
// AI USAGE LIMITS
// ============================================

export const AI_USAGE_LIMITS = {
  free: {
    dailyTasks: 5,
    monthlyTasks: 50,
  },
  starter: {
    dailyTasks: 20,
    monthlyTasks: 300,
  },
  pro: {
    dailyTasks: 100,
    monthlyTasks: 2000,
  },
  elite: {
    dailyTasks: -1, // Unlimited
    monthlyTasks: -1,
  },
  team: {
    dailyTasks: 50,
    monthlyTasks: 1000,
  },
} as const;

export type AIUsageLimits = typeof AI_USAGE_LIMITS;
