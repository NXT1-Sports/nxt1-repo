/**
 * @fileoverview Feed Constants
 * @module @nxt1/core/feed
 * @version 1.0.0
 *
 * Constants for Home Feed feature.
 * 100% portable - NO platform dependencies.
 */

import type { FeedFilterType, FeedPostType, FeedPostTagType } from './feed.types';

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Feed API endpoint paths.
 */
export const FEED_API_ENDPOINTS = {
  /** Main feed endpoint */
  FEED: '/api/v1/feed',
  /** Single post endpoint */
  POST: '/api/v1/feed/posts/:id',
  /** Post actions (like, bookmark, etc) */
  POST_LIKE: '/api/v1/feed/posts/:id/like',
  POST_BOOKMARK: '/api/v1/feed/posts/:id/bookmark',
  POST_SHARE: '/api/v1/feed/posts/:id/share',
  POST_REPORT: '/api/v1/feed/posts/:id/report',
  /** Comments */
  COMMENTS: '/api/v1/feed/posts/:id/comments',
  COMMENT: '/api/v1/feed/posts/:postId/comments/:commentId',
  COMMENT_LIKE: '/api/v1/feed/posts/:postId/comments/:commentId/like',
  /** Trending/discover */
  TRENDING: '/api/v1/feed/trending',
  DISCOVER: '/api/v1/feed/discover',
  /** User-specific feeds */
  USER_FEED: '/api/v1/feed/users/:uid',
  TEAM_FEED: '/api/v1/feed/teams/:teamCode',
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
// FEED FILTER OPTIONS
// ============================================

/**
 * Feed filter tab configuration.
 */
export interface FeedFilterOption {
  /** Filter type identifier */
  readonly id: FeedFilterType;
  /** Display label */
  readonly label: string;
  /** Ionicons icon name */
  readonly icon: string;
  /** Whether requires authentication */
  readonly requiresAuth: boolean;
  /** Description for empty state */
  readonly description: string;
}

/**
 * Available feed filter options.
 */
export const FEED_FILTER_OPTIONS: readonly FeedFilterOption[] = [
  {
    id: 'for-you',
    label: 'For You',
    icon: 'sparkles',
    requiresAuth: false,
    description: 'Personalized content based on your interests',
  },
  {
    id: 'following',
    label: 'Following',
    icon: 'users',
    requiresAuth: true,
    description: 'Posts from athletes and teams you follow',
  },
  {
    id: 'sports',
    label: 'Sports',
    icon: 'football',
    requiresAuth: false,
    description: 'Filter by your favorite sports',
  },
  {
    id: 'offers',
    label: 'Offers',
    icon: 'school',
    requiresAuth: false,
    description: 'Latest college offers and commitments',
  },
  {
    id: 'highlights',
    label: 'Highlights',
    icon: 'playCircle',
    requiresAuth: false,
    description: 'Top video highlights and clips',
  },
  {
    id: 'trending',
    label: 'Trending',
    icon: 'trendingUp',
    requiresAuth: false,
    description: "What's popular right now",
  },
] as const;

/**
 * Default feed filter.
 */
export const FEED_DEFAULT_FILTER: FeedFilterType = 'for-you';

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
// EMPTY STATE CONFIGURATION
// ============================================

/**
 * Empty state messages per filter type.
 */
export const FEED_EMPTY_STATES: Record<
  FeedFilterType,
  { title: string; message: string; cta?: string }
> = {
  'for-you': {
    title: 'Your feed is empty',
    message: 'Follow athletes, coaches, and teams to see their posts here.',
    cta: 'Discover Athletes',
  },
  following: {
    title: 'No posts from people you follow',
    message: "When the people you follow share updates, you'll see them here.",
    cta: 'Find People to Follow',
  },
  sports: {
    title: 'No posts in this sport',
    message: "There aren't any recent posts for this sport yet.",
  },
  offers: {
    title: 'No offers yet',
    message: 'College offers and commitments will appear here.',
  },
  highlights: {
    title: 'No highlights yet',
    message: 'Video highlights from athletes will appear here.',
    cta: 'Upload a Highlight',
  },
  trending: {
    title: 'Nothing trending',
    message: 'Popular posts from the community will appear here.',
    cta: 'Explore',
  },
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
