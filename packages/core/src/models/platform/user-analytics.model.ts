/**
 * @fileoverview User Analytics Model
 * @module @nxt1/core/models
 *
 * Type-safe analytics data structures for user engagement tracking.
 * Profile views, video views, followers, watch time, etc.
 * 100% portable - no framework dependencies.
 *
 * NOTE: This model is for lightweight operational engagement snapshots.
 * Historical analytics, reporting, and intelligence now live in Mongo-backed
 * analytics event and rollup collections.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import type {
  AnalyticsEventType,
  TrafficSource,
  AggregationPeriod,
  TrendDirection,
  ViewerType,
  DeviceType,
  SyncStatus,
} from '../../constants/user-analytics.constants';

// ============================================
// STAGE 1: RAW EVENTS
// ============================================

export interface AnalyticsEventBase {
  id: string;
  type: AnalyticsEventType;
  timestamp: Date | string;
  targetUserId: string;
}

export interface ViewEvent extends AnalyticsEventBase {
  type: 'profile_view' | 'video_view' | 'post_view' | 'card_view';
  viewerId: string | null;
  source: TrafficSource;
  sourceId?: string;
  contentId?: string;
  sessionId?: string;
  device?: DeviceType;
  geo?: {
    country?: string;
    region?: string;
    city?: string;
  };
  viewerType?: ViewerType;
  metadata?: {
    watchDuration?: number;
    completionPercent?: number;
    referrer?: string;
    utm?: {
      source?: string;
      medium?: string;
      campaign?: string;
      term?: string;
      content?: string;
    };
  };
}

export interface EngagementEvent extends AnalyticsEventBase {
  type: 'share' | 'reaction' | 'repost';
  actorId: string;
  contentId?: string;
  reactionType?: string;
  sharePlatform?: string;
}

export interface CommunicationEvent extends AnalyticsEventBase {
  type: 'email_sent' | 'email_open' | 'email_click' | 'email_reply';
  communicationType?: 'email';
  messageId?: string;
  threadId?: string;
  recipientHash?: string;
  recipientId?: string;
  collegeId?: string;
  clickedUrl?: string;
}

/** @deprecated Use CommunicationEvent. Kept for backward compatibility. */
export type CampaignEvent = CommunicationEvent;

export interface AIUsageEvent extends AnalyticsEventBase {
  type: 'ai_task_start' | 'ai_task_complete';
  taskType: string;
  tokensUsed?: number;
  durationMs?: number;
  success?: boolean;
  error?: string;
}

export interface SessionEvent extends AnalyticsEventBase {
  type: 'session_start' | 'session_end';
  sessionId: string;
  device: DeviceType;
  durationSeconds?: number;
  pagesViewed?: number;
}

export type AnalyticsEvent =
  | ViewEvent
  | EngagementEvent
  | CampaignEvent
  | AIUsageEvent
  | SessionEvent;

// ============================================
// STAGE 1: DAILY AGGREGATES
// ============================================

export interface SourceBreakdown {
  direct: number;
  search: number;
  campaign: number;
  social: number;
  referral: number;
  qr_code: number;
  team_page: number;
  rankings: number;
  unknown: number;
}

export interface ViewerBreakdown {
  recruiter: number;
  high_school_coach: number;
  coach: number;
  athlete: number;
  parent: number;
  director: number;
  anonymous: number;
}

export interface GeoBreakdown {
  countries: Record<string, number>;
  regions: Record<string, number>;
}

export interface DailyContentPerformance {
  contentId: string;
  type: 'video' | 'post' | 'card';
  views: number;
  watchTimeSeconds?: number;
  shares: number;
}

export interface DailyAnalyticsDoc {
  date: string;
  userId: string;
  updatedAt: Date | string;
  profileViews: number;
  uniqueProfileViewers: number;
  videoViews: number;
  videoWatchTimeSeconds: number;
  postViews: number;
  cardViews: number;
  shares: number;
  emailsSent: number;
  emailOpens: number;
  emailClicks: number;
  emailReplies: number;
  aiTasksCompleted: number;
  aiTokensUsed: number;
  sessions: number;
  totalSessionTimeSeconds: number;
  avgSessionDurationSeconds: number;
  profileViewsBySource: SourceBreakdown;
  viewersByType: ViewerBreakdown;
  geoBreakdown: GeoBreakdown;
  topContent: DailyContentPerformance[];
  viewsByHour: number[];
}

// ============================================
// STAGE 2: AGGREGATED ANALYTICS
// ============================================

export interface TrendData {
  current: number;
  previous: number;
  percentChange: number;
  direction: TrendDirection;
}

export interface PeriodAnalytics {
  period: AggregationPeriod;
  startDate: Date | string;
  endDate: Date | string;
  profileViews: number;
  uniqueProfileViewers: number;
  videoViews: number;
  videoWatchTimeSeconds: number;
  postViews: number;
  cardViews: number;
  shares: number;
  emailsSent: number;
  emailOpens: number;
  emailClicks: number;
  emailOpenRate: number;
  emailClickRate: number;
  profileViewsTrend: TrendData;
  videoViewsTrend: TrendData;
  engagementTrend: TrendData;
}

export interface AIUsageAnalytics {
  dailyTaskCount: number;
  lastResetDate: string;
  monthlyTaskCount: number;
  monthlyResetMonth: string;
  totalTasksCompleted: number;
  totalTokensUsed: number;
  tasksByType: Record<string, number>;
}

export interface LifetimeAnalytics {
  totalProfileViews: number;
  totalUniqueVisitors: number;
  totalVideoViews: number;
  totalWatchTimeHours: number;
  totalShares: number;
  totalReactions: number;
  totalEmailsSent: number;
  peakDailyViews: number;
  peakDailyViewsDate: string;
  firstActivity: Date | string;
}

// ============================================
// USER ANALYTICS DOC
// ============================================

export interface UserAnalyticsDoc {
  userId: string;
  updatedAt: Date | string;
  lifetime: LifetimeAnalytics;
  weekly: PeriodAnalytics;
  monthly: PeriodAnalytics;
  aiUsage: AIUsageAnalytics;
  recentDays: DailyAnalyticsDoc[];
}

// ============================================
// USER COUNTERS (synced to user doc)
// ============================================

export interface UserCounters {
  profileViews: number;
  videoViews: number;
  postsCount: number;
  sharesCount: number;
  _lastSyncedAt?: Date | string;
}

// ============================================
// JOB TRACKING
// ============================================

export interface AggregationJob {
  id: string;
  userId: string;
  type: 'daily' | 'weekly' | 'monthly';
  status: SyncStatus;
  startedAt: Date | string;
  completedAt?: Date | string;
  error?: string;
}

export interface CounterSyncJob {
  id: string;
  userId: string;
  status: SyncStatus;
  lastSyncedAt: Date | string;
  nextSyncAt: Date | string;
  counters: UserCounters;
}

// ============================================
// QUERY TYPES
// ============================================

export interface AnalyticsDateRange {
  start: Date | string;
  end: Date | string;
}

export interface AnalyticsQueryOptions {
  userId: string;
  dateRange?: AnalyticsDateRange;
  period?: AggregationPeriod;
  includeEvents?: boolean;
  limit?: number;
}

export interface AnalyticsQueryResult<T> {
  data: T;
  fromCache?: boolean;
  queriedAt: Date | string;
}

// ============================================
// REAL-TIME & TEAM
// ============================================

export interface RealTimeAnalytics {
  activeViewers: number;
  viewsLast5Min: number;
  viewsLast15Min: number;
  viewsLast60Min: number;
}

export interface TeamAnalytics {
  teamCode: string;
  totalMembers: number;
  activeMembers: number;
  totalProfileViews: number;
  totalVideoViews: number;
  topPerformers: Array<{
    userId: string;
    name: string;
    profileViews: number;
    videoViews: number;
  }>;
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

export function createEmptySourceBreakdown(): SourceBreakdown {
  return {
    direct: 0,
    search: 0,
    campaign: 0,
    social: 0,
    referral: 0,
    qr_code: 0,
    team_page: 0,
    rankings: 0,
    unknown: 0,
  };
}

export function createEmptyViewerBreakdown(): ViewerBreakdown {
  return {
    recruiter: 0,
    high_school_coach: 0,
    coach: 0,
    athlete: 0,
    parent: 0,
    director: 0,
    anonymous: 0,
  };
}

export function createEmptyDailyAnalytics(userId: string, date: string): DailyAnalyticsDoc {
  return {
    date,
    userId,
    updatedAt: new Date().toISOString(),
    profileViews: 0,
    uniqueProfileViewers: 0,
    videoViews: 0,
    videoWatchTimeSeconds: 0,
    postViews: 0,
    cardViews: 0,
    shares: 0,
    emailsSent: 0,
    emailOpens: 0,
    emailClicks: 0,
    emailReplies: 0,
    aiTasksCompleted: 0,
    aiTokensUsed: 0,
    sessions: 0,
    totalSessionTimeSeconds: 0,
    avgSessionDurationSeconds: 0,
    profileViewsBySource: createEmptySourceBreakdown(),
    viewersByType: createEmptyViewerBreakdown(),
    geoBreakdown: { countries: {}, regions: {} },
    topContent: [],
    viewsByHour: new Array(24).fill(0),
  };
}

export function createEmptyUserCounters(): UserCounters {
  return {
    profileViews: 0,
    videoViews: 0,
    postsCount: 0,
    sharesCount: 0,
  };
}

export function createEmptyAIUsage(): AIUsageAnalytics {
  const now = new Date();
  return {
    dailyTaskCount: 0,
    lastResetDate: now.toISOString().split('T')[0],
    monthlyTaskCount: 0,
    monthlyResetMonth: now.toISOString().slice(0, 7),
    totalTasksCompleted: 0,
    totalTokensUsed: 0,
    tasksByType: {},
  };
}

// ============================================
// TYPE GUARDS
// ============================================

export function isViewEvent(event: AnalyticsEvent): event is ViewEvent {
  return ['profile_view', 'video_view', 'post_view', 'card_view'].includes(event.type);
}

export function isEngagementEvent(event: AnalyticsEvent): event is EngagementEvent {
  return ['share', 'reaction', 'comment', 'repost'].includes(event.type);
}

export function isCommunicationEvent(event: AnalyticsEvent): event is CommunicationEvent {
  return ['email_sent', 'email_open', 'email_click', 'email_reply'].includes(event.type);
}

/** @deprecated Use isCommunicationEvent. Kept for backward compatibility. */
export const isCampaignEvent = isCommunicationEvent;

// ============================================
// UTILITY TYPES
// ============================================

export type DailyAnalyticsUpdate = Partial<Omit<DailyAnalyticsDoc, 'date' | 'userId'>>;

export interface AnalyticsDocRefs {
  userDoc: string;
  dailyDoc: string;
  eventsCollection: string;
}
