/**
 * @fileoverview Posts Constants
 * @module @nxt1/core/constants/posts
 *
 * Shared constants for posts/feed feature across all platforms.
 * 100% portable - no framework dependencies.
 */

// ============================================
// COLLECTION NAMES
// ============================================

/**
 * Firestore collection names for posts
 */
export const POSTS_COLLECTIONS = {
  POSTS: 'Posts',
  POST_LIKES: 'PostLikes',
  POST_BOOKMARKS: 'PostBookmarks',
  POST_SHARES: 'PostShares',
  POST_REPORTS: 'PostReports',
  POST_VIEWS: 'PostViews',
} as const;

// ============================================
// VISIBILITY ENUM
// ============================================

/**
 * Post visibility levels (uppercase for backend/database)
 */
export enum PostVisibility {
  PUBLIC = 'PUBLIC',
  TEAM = 'TEAM',
  PRIVATE = 'PRIVATE',
}

/**
 * Post visibility type (lowercase for frontend)
 */
export type PostVisibilityType = 'public' | 'team' | 'private';

/**
 * Convert PostVisibility enum to lowercase type
 */
export function toPostVisibilityType(visibility: PostVisibility): PostVisibilityType {
  return visibility.toLowerCase() as PostVisibilityType;
}

/**
 * Convert lowercase type to PostVisibility enum
 */
export function toPostVisibilityEnum(visibility: PostVisibilityType | string): PostVisibility {
  return PostVisibility[visibility.toUpperCase() as keyof typeof PostVisibility];
}

// ============================================
// CONTENT LIMITS
// ============================================

export const POST_LIMITS = {
  CONTENT_MIN: 1,
  CONTENT_MAX: 5000,
  MEDIA_MAX: 10,
  HASHTAGS_MAX: 30,
  MENTIONS_MAX: 20,
  POLL_OPTIONS_MIN: 2,
  POLL_OPTIONS_MAX: 6,
  POLL_DURATION_MIN_HOURS: 1,
  POLL_DURATION_MAX_HOURS: 168, // 7 days
} as const;

// ============================================
// CACHE CONFIGS
// ============================================

export const POSTS_CACHE_TTL = {
  FEED: 60, // 1 minute
  POST: 300, // 5 minutes
  USER_POSTS: 120, // 2 minutes
} as const;

export const POSTS_CACHE_PREFIX = 'posts:';

// ============================================
// PAGINATION
// ============================================

export const POSTS_PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 50,
} as const;
