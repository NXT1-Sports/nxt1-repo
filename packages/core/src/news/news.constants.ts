/**
 * @fileoverview News Constants
 * @module @nxt1/core/news
 * @version 1.0.0
 *
 * Configuration constants for Sports News feature.
 * 100% portable - no platform dependencies.
 */

import type { NewsCategory, NewsCategoryId, NewsSortBy, NewsDateRange } from './news.types';

// ============================================
// CATEGORY CONFIGURATION
// ============================================

/**
 * Available news categories with display configuration.
 * Order determines display order in tab bar.
 */
export const NEWS_CATEGORIES: readonly NewsCategory[] = [
  {
    id: 'for-you',
    label: 'For You',
    icon: 'sparkles-outline',
    color: 'var(--nxt1-color-primary)',
  },
  {
    id: 'recruiting',
    label: 'Discovery',
    icon: 'people-outline',
    color: 'var(--nxt1-color-feedback-info)',
  },
  {
    id: 'college',
    label: 'College',
    icon: 'school-outline',
    color: 'var(--nxt1-color-feedback-success)',
  },
  {
    id: 'pro',
    label: 'Pro',
    icon: 'trophy-outline',
    color: 'var(--nxt1-color-secondary)',
  },
  {
    id: 'highlights',
    label: 'Highlights',
    icon: 'videocam-outline',
    color: 'var(--nxt1-color-accent)',
  },
  {
    id: 'transfers',
    label: 'Transfers',
    icon: 'swap-horizontal-outline',
    color: 'var(--nxt1-color-feedback-warning)',
  },
  {
    id: 'commits',
    label: 'Commits',
    icon: 'checkmark-circle-outline',
    color: 'var(--nxt1-color-feedback-error)',
  },
  {
    id: 'saved',
    label: 'Saved',
    icon: 'bookmark-outline',
    color: 'var(--nxt1-color-text-secondary)',
  },
] as const;

/**
 * Default selected category.
 * 'for-you' provides personalized experience on first load.
 */
export const NEWS_DEFAULT_CATEGORY: NewsCategoryId = 'for-you';

// ============================================
// CATEGORY COLORS (CSS Classes)
// ============================================

/**
 * Color mapping for news categories.
 * Uses semantic design tokens from @nxt1/design-tokens.
 */
export const NEWS_CATEGORY_COLORS: Record<NewsCategoryId, string> = {
  'for-you': 'bg-primary text-on-primary',
  recruiting: 'bg-info text-on-info',
  college: 'bg-success text-on-success',
  pro: 'bg-secondary text-on-secondary',
  highlights: 'bg-accent text-on-accent',
  transfers: 'bg-warning text-on-warning',
  commits: 'bg-error text-on-error',
  saved: 'bg-surface-300 text-secondary',
} as const;

/**
 * Category background colors (CSS variables).
 */
export const NEWS_CATEGORY_BG_COLORS: Record<NewsCategoryId, string> = {
  'for-you': 'var(--nxt1-color-primary)',
  recruiting: 'var(--nxt1-color-feedback-info)',
  college: 'var(--nxt1-color-feedback-success)',
  pro: 'var(--nxt1-color-secondary)',
  highlights: 'var(--nxt1-color-accent)',
  transfers: 'var(--nxt1-color-feedback-warning)',
  commits: 'var(--nxt1-color-feedback-error)',
  saved: 'var(--nxt1-color-surface-300)',
} as const;

// ============================================
// SORT & FILTER OPTIONS
// ============================================

/**
 * Sort options for news feed.
 */
export const NEWS_SORT_OPTIONS: readonly { id: NewsSortBy; label: string }[] = [
  { id: 'latest', label: 'Latest' },
  { id: 'trending', label: 'Trending' },
  { id: 'most-read', label: 'Most Read' },
  { id: 'relevance', label: 'Relevance' },
] as const;

/**
 * Date range filter options.
 */
export const NEWS_DATE_RANGES: readonly { id: NewsDateRange; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'this-week', label: 'This Week' },
  { id: 'this-month', label: 'This Month' },
  { id: 'all-time', label: 'All Time' },
] as const;

// ============================================
// PAGINATION DEFAULTS
// ============================================

/**
 * Default pagination settings.
 */
export const NEWS_PAGINATION_DEFAULTS = {
  /** Items per page */
  LIMIT: 20,
  /** Maximum items per request */
  MAX_LIMIT: 50,
  /** Initial page */
  INITIAL_PAGE: 1,
} as const;

// ============================================
// UI CONFIGURATION
// ============================================

/**
 * UI-related configuration.
 */
export const NEWS_UI_CONFIG = {
  /** Number of skeleton cards to show while loading */
  SKELETON_COUNT: 6,
  /** Debounce time for search input (ms) */
  SEARCH_DEBOUNCE_MS: 300,
  /** Auto-refresh interval (ms) - 5 minutes */
  AUTO_REFRESH_INTERVAL_MS: 5 * 60 * 1000,
  /** Max characters for excerpt */
  EXCERPT_MAX_LENGTH: 150,
  /** Max lines for title clamp */
  TITLE_MAX_LINES: 2,
  /** Max lines for excerpt clamp */
  EXCERPT_MAX_LINES: 3,
  /** Hero image aspect ratio */
  HERO_ASPECT_RATIO: '16/9',
  /** Thumbnail aspect ratio */
  THUMBNAIL_ASPECT_RATIO: '16/9',
} as const;

// ============================================
// EMPTY STATE MESSAGES
// ============================================

/**
 * Empty state configuration per category.
 */
export const NEWS_EMPTY_STATES: Record<
  NewsCategoryId,
  { icon: string; title: string; message: string; ctaLabel?: string }
> = {
  'for-you': {
    icon: 'newspaper-outline',
    title: 'No local sports news yet',
    message: 'State, sport, and recruiting news will show up here.',
  },
  recruiting: {
    icon: 'people-outline',
    title: 'No recruiting news',
    message: 'Check back later for the latest recruiting updates and rankings.',
  },
  college: {
    icon: 'school-outline',
    title: 'No college news',
    message: 'College sports news will appear here when available.',
  },
  pro: {
    icon: 'trophy-outline',
    title: 'No pro news',
    message: 'Professional sports news will appear here when available.',
  },
  highlights: {
    icon: 'videocam-outline',
    title: 'No highlights yet',
    message: 'Video highlights and top plays will appear here.',
  },
  transfers: {
    icon: 'swap-horizontal-outline',
    title: 'No transfer news',
    message: 'Transfer portal updates will appear here when available.',
  },
  commits: {
    icon: 'checkmark-circle-outline',
    title: 'No commit news',
    message: 'Commitment announcements will appear here when available.',
  },
  saved: {
    icon: 'bookmark-outline',
    title: 'Saved — Coming Soon',
    message: 'Save your favorite articles for quick access. This feature is coming soon.',
  },
} as const;

// ============================================
// CACHE CONFIGURATION
// ============================================

/**
 * Time-to-live for articles in Firestore (days).
 * Articles are auto-deleted by Firestore TTL policy after this period.
 * Backend queries also filter by expiresAt as a safety net.
 */
export const ARTICLE_TTL_DAYS = 14;

/**
 * Cache keys for news data.
 */
export const NEWS_CACHE_KEYS = {
  FEED_PREFIX: 'news:feed:',
  ARTICLE_PREFIX: 'news:article:',
} as const;

/**
 * Cache TTL values (milliseconds).
 */
export const NEWS_CACHE_TTL = {
  /** Feed cache: 5 minutes */
  FEED: 5 * 60 * 1000,
  /** Article cache: 15 minutes */
  ARTICLE: 15 * 60 * 1000,
} as const;

// ============================================
// API ENDPOINTS
// ============================================

/**
 * API endpoints for news feature.
 */
export const NEWS_API_ENDPOINTS = {
  /** Get news feed */
  FEED: '/pulse',
  /** Get single article */
  ARTICLE: '/pulse/:id',
  /** Generate news (AI endpoint) */
  GENERATE: '/pulse/generate',
  /** Get trending articles */
  TRENDING: '/pulse/trending',
  /** Search articles */
  SEARCH: '/pulse/search',
} as const;

// ============================================
// ANIMATION TIMING
// ============================================

/**
 * Animation timing configuration.
 */
export const NEWS_ANIMATION_CONFIG = {
  /** Card slide-up animation duration (ms) */
  CARD_SLIDE_DURATION: 300,
  /** Fade transition duration (ms) */
  FADE_DURATION: 200,
  /** Skeleton shimmer cycle duration (ms) */
  SKELETON_SHIMMER_DURATION: 1500,
} as const;
