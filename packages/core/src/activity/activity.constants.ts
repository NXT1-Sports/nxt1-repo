/**
 * @fileoverview Activity Constants
 * @module @nxt1/core/activity
 * @version 1.0.0
 *
 * Configuration constants for Activity/Notifications feature.
 * 100% portable - no platform dependencies.
 */

import type { ActivityTab, ActivityTabId, ActivityType, ActivityPriority } from './activity.types';

// ============================================
// TAB CONFIGURATION
// ============================================

/**
 * Available activity tabs with display configuration.
 * Order determines display order in tab bar.
 * 'All' tab shows combined feed from all categories.
 */
export const ACTIVITY_TABS: readonly ActivityTab[] = [
  {
    id: 'alerts',
    label: 'Alerts',
    icon: 'heart-outline',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: 'bar-chart-outline',
  },
] as const;

/**
 * Default selected tab.
 * 'all' provides the best overview experience on first load.
 */
export const ACTIVITY_DEFAULT_TAB: ActivityTabId = 'alerts';

// ============================================
// ACTIVITY TYPE CONFIGURATION
// ============================================

/**
 * Icon mapping for activity types.
 */
export const ACTIVITY_TYPE_ICONS: Record<ActivityType, string> = {
  follow: 'person-add-outline',
  like: 'heart-outline',
  comment: 'chatbubble-outline',
  mention: 'at-outline',
  message: 'mail-outline',
  offer: 'trophy-outline',
  deal: 'pricetag-outline',
  announcement: 'megaphone-outline',
  milestone: 'ribbon-outline',
  reminder: 'alarm-outline',
  system: 'information-circle-outline',
  update: 'sparkles-outline',
  agent_task: 'sparkles-outline',
} as const;

/**
 * Color mapping for activity types (CSS variable names).
 * Uses semantic design tokens from @nxt1/design-tokens.
 */
export const ACTIVITY_TYPE_COLORS: Record<ActivityType, string> = {
  follow: 'var(--nxt1-color-info)',
  like: 'var(--nxt1-color-error)',
  comment: 'var(--nxt1-color-primary)',
  mention: 'var(--nxt1-color-warning)',
  message: 'var(--nxt1-color-primary)',
  offer: 'var(--nxt1-color-success)',
  deal: 'var(--nxt1-color-warning)',
  announcement: 'var(--nxt1-color-info)',
  milestone: 'var(--nxt1-color-success)',
  reminder: 'var(--nxt1-color-warning)',
  system: 'var(--nxt1-color-text-secondary)',
  update: 'var(--nxt1-color-primary)',
  agent_task: 'var(--nxt1-color-success)',
} as const;

/**
 * Priority weight for sorting.
 */
export const ACTIVITY_PRIORITY_WEIGHTS: Record<ActivityPriority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
} as const;

// ============================================
// PAGINATION DEFAULTS
// ============================================

/**
 * Default pagination configuration.
 */
export const ACTIVITY_PAGINATION_DEFAULTS = {
  /** Default page size */
  pageSize: 20,
  /** Maximum page size */
  maxPageSize: 50,
  /** Minimum page size */
  minPageSize: 10,
} as const;

// ============================================
// CACHE CONFIGURATION
// ============================================

/**
 * Cache keys for activity data.
 */
export const ACTIVITY_CACHE_KEYS = {
  /** Feed cache key prefix */
  FEED_PREFIX: 'activity:feed:',
  /** Badges cache key */
  BADGES: 'activity:badges',
  /** Summary cache key */
  SUMMARY: 'activity:summary',
} as const;

/**
 * Cache TTL values (in milliseconds).
 */
export const ACTIVITY_CACHE_TTL = {
  /** Feed items: 1 minute (frequently changing) */
  FEED: 60_000,
  /** Badge counts: 30 seconds (needs to be fresh) */
  BADGES: 30_000,
  /** Summary: 1 minute */
  SUMMARY: 60_000,
} as const;

// ============================================
// EMPTY STATE CONFIGURATION
// ============================================

/**
 * Empty state messages per tab.
 */
export const ACTIVITY_EMPTY_STATES: Record<
  ActivityTabId,
  { title: string; message: string; icon: string; ctaLabel?: string }
> = {
  alerts: {
    title: 'No alerts yet',
    message: 'Social activity and system updates will appear here.',
    icon: 'heart-outline',
  },
  analytics: {
    title: 'No analytics yet',
    message: 'Your recruiting stats and Agent X performance will appear here.',
    icon: 'bar-chart-outline',
  },
  agent: {
    title: 'No agent activity yet',
    message: 'Updates related to your agents will appear here.',
    icon: 'sparkles-outline',
  },
  inbox: {
    title: 'Your inbox is empty',
    message: 'Connect your email to see messages and updates here.',
    icon: 'mail-outline',
    ctaLabel: 'Connect Email',
  },
  all: {
    title: 'No activity yet',
    message: 'Your recent activity and notifications will appear here.',
    icon: 'notifications-outline',
  },
} as const;

// ============================================
// API CONFIGURATION
// ============================================

/**
 * Activity API endpoints (relative paths).
 */
export const ACTIVITY_API_ENDPOINTS = {
  /** Get activity feed */
  FEED: '/activity/feed',
  /** Get single activity item */
  ITEM: '/activity',
  /** Mark items as read */
  MARK_READ: '/activity/read',
  /** Mark all as read for tab */
  MARK_ALL_READ: '/activity/read-all',
  /** Get badge counts */
  BADGES: '/activity/badges',
  /** Get summary */
  SUMMARY: '/activity/summary',
  /** Archive items */
  ARCHIVE: '/activity/archive',
} as const;

// ============================================
// INBOX EMAIL PROVIDERS
// ============================================

/**
 * Email provider options shown in the Inbox tab empty state.
 * Users can connect these accounts to sync emails into the inbox.
 */
export interface InboxEmailProvider {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
}

export const INBOX_EMAIL_PROVIDERS: readonly InboxEmailProvider[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    icon: 'google',
    description: 'Connect your Google account',
  },
  {
    id: 'microsoft',
    name: 'Outlook',
    icon: 'microsoft',
    description: 'Connect your Microsoft account',
  },
  {
    id: 'yahoo',
    name: 'Yahoo',
    icon: 'mail',
    description: 'Connect your Yahoo account',
  },
] as const;

// ============================================
// UI CONFIGURATION
// ============================================

/**
 * UI timing configuration.
 */
export const ACTIVITY_UI_CONFIG = {
  /** Skeleton count while loading */
  skeletonCount: 8,
  /** Refresh timeout in ms */
  refreshTimeout: 10_000,
  /** Pull-to-refresh threshold in px */
  pullToRefreshThreshold: 80,
  /** Time format for recent items (within 24h) */
  recentTimeFormat: 'relative',
  /** Time format for older items */
  olderTimeFormat: 'MMM d',
  /** Animation duration for item transitions */
  animationDuration: 200,
} as const;
