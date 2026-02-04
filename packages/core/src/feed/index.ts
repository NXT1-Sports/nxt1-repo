/**
 * @fileoverview Feed Module Barrel Export
 * @module @nxt1/core/feed
 *
 * Feed-related pure TypeScript code.
 * 100% portable - NO platform dependencies.
 *
 * @version 1.0.0
 */

// ============================================
// FEED TYPES
// ============================================
export {
  // Post types
  type FeedPostType,
  type FeedPostVisibility,
  type FeedAuthorRole,
  type FeedVerificationStatus,
  // Author types
  type FeedAuthor,
  // Media types
  type FeedMedia,
  type FeedOfferData,
  type FeedCommitmentData,
  type FeedMilestoneData,
  // Engagement types
  type FeedEngagement,
  type FeedUserEngagement,
  // Main post type
  type FeedPost,
  // Filter types
  type FeedFilterType,
  type FeedFilter,
  type FeedPagination,
  // Response types
  type FeedResponse,
  type FeedPostResponse,
  type FeedActionResponse,
  // Comment types
  type FeedCommentAuthor,
  type FeedComment,
  type FeedCommentsResponse,
} from './feed.types';

// ============================================
// FEED CONSTANTS
// ============================================
export {
  // API endpoints
  FEED_API_ENDPOINTS,
  // Pagination
  FEED_PAGINATION_DEFAULTS,
  // Filters
  type FeedFilterOption,
  FEED_FILTER_OPTIONS,
  FEED_DEFAULT_FILTER,
  // Post types
  FEED_POST_TYPE_ICONS,
  FEED_POST_TYPE_LABELS,
  FEED_POST_TYPE_COLORS,
  // Engagement
  type FeedEngagementAction,
  FEED_ENGAGEMENT_ICONS,
  // Empty states
  FEED_EMPTY_STATES,
  // UI config
  FEED_UI_CONFIG,
  // Cache
  FEED_CACHE_KEYS,
  FEED_CACHE_TTLS,
} from './feed.constants';

// ============================================
// FEED API
// ============================================
export { createFeedApi, type FeedApi } from './feed.api';
