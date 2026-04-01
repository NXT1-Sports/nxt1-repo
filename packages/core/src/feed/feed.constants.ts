/**
 * @fileoverview Feed Constants
 * @module @nxt1/core/feed
 * @version 1.0.0
 *
 * Constants for Home Feed feature.
 * 100% portable - NO platform dependencies.
 */

import type { FeedPostType, FeedPostTagType } from './feed.types';

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Feed API endpoint paths.
 */
export const FEED_API_ENDPOINTS = {
  /** Main feed endpoint */
  FEED: '/feed',
  /** Single post endpoint */
  POST: '/feed/posts/:id',
  /** Post actions (like, etc) */
  POST_LIKE: '/feed/posts/:id/like',
  POST_SHARE: '/feed/posts/:id/share',
  POST_REPORT: '/feed/posts/:id/report',
  /** User-specific feeds */
  USER_FEED: '/feed/users/:uid',
  TEAM_FEED: '/feed/teams/:teamCode',
} as const;

// ============================================
// PAGINATION DEFAULTS
// ============================================

/**
 * Default pagination configuration.
 */
export const FEED_PAGINATION_DEFAULTS = {
  /** Initial page */
  INITIAL_PAGE: 1,
  /** Items per page */
  LIMIT: 20,
  /** Maximum items per request */
  MAX_LIMIT: 50,
  /** Prefetch threshold (load more when X items from bottom) */
  PREFETCH_THRESHOLD: 5,
} as const;

// ============================================
// POST TYPE CONFIGURATION
// ============================================

/**
 * Icons for each post type.
 */
export const FEED_POST_TYPE_ICONS: Record<FeedPostType, string> = {
  text: 'documentText',
  image: 'image',
  video: 'videocam',
  highlight: 'playCircle',
  offer: 'school',
  commitment: 'trophy',
  article: 'newspaper',
  milestone: 'ribbon',
  repost: 'repeat',
  stats: 'barChart',
  metrics: 'trendingUp',
  award: 'ribbon',
  camp: 'barbell',
  visit: 'school',
  schedule: 'calendar',
  graphic: 'image',
  game: 'football',
  playoffs: 'trophy',
  news: 'newspaper',
} as const;

/**
 * Labels for each post type.
 */
export const FEED_POST_TYPE_LABELS: Record<FeedPostType, string> = {
  text: 'Post',
  image: 'Photo',
  video: 'Video',
  highlight: 'Highlight',
  offer: 'Offer',
  commitment: 'Commitment',
  article: 'Article',
  milestone: 'Milestone',
  repost: 'Repost',
  stats: 'Stats',
  metrics: 'Metrics',
  award: 'Award',
  camp: 'Camp',
  visit: 'College Visit',
  schedule: 'Schedule',
  graphic: 'Graphic',
  game: 'Game',
  playoffs: 'Playoffs',
  news: 'News',
} as const;

/**
 * Optional per-type color overrides for badges.
 * Intentionally empty so badges remain fully theme-token driven.
 */
export const FEED_POST_TYPE_COLORS: Partial<Record<FeedPostType, string>> = {} as const;

// ============================================
// TAG/CHIP CONFIGURATION
// ============================================

/**
 * Icons for post tag types (attached profile data chips).
 * These map tag categories to design-token icon names.
 */
export const FEED_TAG_TYPE_ICONS: Record<FeedPostTagType, string> = {
  offers: 'school',
  stat: 'barChart',
  stats: 'barChart',
  metric: 'trendingUp',
  metrics: 'trendingUp',
  award: 'ribbon',
  commit: 'trophy',
  schedule: 'calendar',
  visit: 'school',
  camps: 'barbell',
  'video-tag': 'videocam',
  'content-tag': 'newspaper',
  highlight: 'play',
  custom: 'sparkles',
} as const;

/**
 * Maximum number of visible tags before showing "+N more".
 */
export const FEED_MAX_VISIBLE_TAGS = 3;

// ============================================
// ENGAGEMENT CONFIGURATION
// ============================================

/**
 * Engagement action types.
 */
export type FeedEngagementAction = 'like' | 'comment' | 'share' | 'bookmark' | 'report';

/**
 * Icons for engagement actions.
 */
export const FEED_ENGAGEMENT_ICONS: Record<
  FeedEngagementAction,
  { outline: string; filled: string }
> = {
  like: { outline: 'heart', filled: 'heartFilled' },
  comment: { outline: 'chatBubble', filled: 'chatBubble' },
  share: { outline: 'share', filled: 'share' },
  bookmark: { outline: 'bookmark', filled: 'bookmarkFilled' },
  report: { outline: 'flag', filled: 'flagFilled' },
} as const;

// ============================================
// UI CONFIGURATION
// ============================================

/**
 * Feed UI configuration.
 */
export const FEED_UI_CONFIG = {
  /** Number of skeleton items to show during loading */
  SKELETON_COUNT: 5,
  /** Maximum content preview length (characters) */
  CONTENT_PREVIEW_LENGTH: 280,
  /** Maximum media items to show in grid */
  MAX_MEDIA_PREVIEW: 4,
  /** Animation delay between items (ms) */
  ITEM_ANIMATION_DELAY: 50,
  /** Debounce time for scroll events (ms) */
  SCROLL_DEBOUNCE: 150,
  /** Time to show "new posts" banner before auto-hiding (ms) */
  NEW_POSTS_BANNER_TIMEOUT: 5000,
  /** Pull-to-refresh threshold (px) */
  PULL_TO_REFRESH_THRESHOLD: 80,
} as const;

// ============================================
// CACHE CONFIGURATION
// ============================================

/**
 * Feed cache keys.
 */
export const FEED_CACHE_KEYS = {
  /** Feed data cache prefix */
  FEED: 'feed:',
  /** Single post cache prefix */
  POST: 'feed:post:',
  /** Comments cache prefix */
  COMMENTS: 'feed:comments:',
  /** User engagement state */
  USER_ENGAGEMENT: 'feed:engagement:',
} as const;

/**
 * Feed cache TTLs (in milliseconds).
 */
export const FEED_CACHE_TTLS = {
  /** Main feed cache (short, data changes frequently) */
  FEED: 60_000, // 1 minute
  /** Single post cache */
  POST: 300_000, // 5 minutes
  /** Comments cache */
  COMMENTS: 120_000, // 2 minutes
  /** User engagement state */
  USER_ENGAGEMENT: 60_000, // 1 minute
} as const;
