/**
 * @fileoverview Portable analytics event ontology for Agent X event sourcing
 * @module @nxt1/core/models/platform/analytics-event
 *
 * Pure TypeScript only — no framework or runtime dependencies.
 */

export const ANALYTICS_DOMAINS = [
  'recruiting',
  'nil',
  'performance',
  'engagement',
  'communication',
  'system',
  'custom',
] as const;

export type AnalyticsDomain = (typeof ANALYTICS_DOMAINS)[number];

export const ANALYTICS_SUBJECT_TYPES = ['user', 'team', 'organization'] as const;

export type AnalyticsSubjectType = (typeof ANALYTICS_SUBJECT_TYPES)[number];

export const ANALYTICS_EVENT_TYPES = {
  recruiting: [
    'activity_recorded',
    'offer_recorded',
    'visit_recorded',
    'coach_contact_recorded',
    'commitment_recorded',
  ],
  nil: ['deal_recorded', 'campaign_recorded', 'payment_recorded'],
  performance: ['metric_recorded', 'workout_recorded', 'milestone_recorded', 'recovery_recorded'],
  engagement: ['profile_viewed', 'content_viewed', 'search_appeared', 'link_clicked'],
  communication: [
    'email_sent',
    'email_delivered',
    'email_opened',
    'email_replied',
    'link_clicked',
    'message_sent',
    'follow_up_scheduled',
  ],
  system: ['agent_task_completed', 'tool_write_completed', 'sync_completed'],
  custom: ['custom_recorded'],
} as const satisfies Record<AnalyticsDomain, readonly string[]>;

export type AnalyticsEventType =
  (typeof ANALYTICS_EVENT_TYPES)[keyof typeof ANALYTICS_EVENT_TYPES][number];

export const ANALYTICS_SUMMARY_TIMEFRAMES = ['24h', '7d', '30d', '90d', 'all'] as const;

export type AnalyticsSummaryTimeframe = (typeof ANALYTICS_SUMMARY_TIMEFRAMES)[number];

export type AnalyticsRuntimeEnvironment = 'staging' | 'production';

export interface AnalyticsEventRecord {
  readonly id?: string;
  readonly environment?: AnalyticsRuntimeEnvironment;
  readonly subjectId: string;
  readonly subjectType: AnalyticsSubjectType;
  readonly domain: AnalyticsDomain;
  readonly eventType: AnalyticsEventType;
  readonly occurredAt: string;
  readonly source: 'agent' | 'user' | 'system';
  readonly actorUserId?: string | null;
  readonly sessionId?: string | null;
  readonly threadId?: string | null;
  readonly value?: number | string | boolean | null;
  readonly tags?: readonly string[];
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AnalyticsRollupRecord {
  readonly id?: string;
  readonly environment?: AnalyticsRuntimeEnvironment;
  readonly subjectId: string;
  readonly subjectType: AnalyticsSubjectType;
  readonly domain: AnalyticsDomain;
  readonly timeframe: AnalyticsSummaryTimeframe;
  readonly totalCount: number;
  readonly numericValueTotal: number;
  readonly countsByEventType: Readonly<Record<string, number>>;
  readonly lastEventAt?: string | null;
  readonly lastAggregatedAt: string;
}

export function isAnalyticsDomain(value: unknown): value is AnalyticsDomain {
  return typeof value === 'string' && ANALYTICS_DOMAINS.includes(value as AnalyticsDomain);
}

export function isAnalyticsSubjectType(value: unknown): value is AnalyticsSubjectType {
  return (
    typeof value === 'string' && ANALYTICS_SUBJECT_TYPES.includes(value as AnalyticsSubjectType)
  );
}

export function getAnalyticsEventTypesForDomain(
  domain: AnalyticsDomain
): readonly AnalyticsEventType[] {
  return ANALYTICS_EVENT_TYPES[domain] as readonly AnalyticsEventType[];
}

export function isAnalyticsEventTypeForDomain(
  domain: AnalyticsDomain,
  eventType: unknown
): eventType is AnalyticsEventType {
  return (
    typeof eventType === 'string' &&
    getAnalyticsEventTypesForDomain(domain).includes(eventType as AnalyticsEventType)
  );
}

export function getDefaultAnalyticsEventType(domain: AnalyticsDomain): AnalyticsEventType {
  switch (domain) {
    case 'recruiting':
      return 'activity_recorded';
    case 'nil':
      return 'deal_recorded';
    case 'performance':
      return 'metric_recorded';
    case 'engagement':
      return 'profile_viewed';
    case 'communication':
      return 'email_sent';
    case 'system':
      return 'tool_write_completed';
    case 'custom':
    default:
      return 'custom_recorded';
  }
}
