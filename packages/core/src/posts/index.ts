/**
 * @fileoverview Feed Module Barrel Export
 * @module @nxt1/core/posts
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
  // Author types
  type FeedAuthor,
  // Media types
  type FeedMedia,
  type FeedVideoProcessingStatus,
  type FeedOfferData,
  type FeedCommitmentData,
  type FeedMilestoneData,
  // Activity data types (unified timeline)
  type FeedVisitData,
  type FeedCampData,
  type FeedStatUpdateData,
  type FeedStatLine,
  type FeedMetricsData,
  type FeedMetricLine,
  type FeedAwardData,
  type FeedNewsData,
  type FeedScheduleData,
  type FeedExternalSource,
  type FeedAcademicData,
  // Engagement types
  type FeedEngagement,
  // Tag/chip types
  type FeedPostTagType,
  type FeedPostTag,
  // Main post type
  type FeedPost,
  // Filter types
  type FeedFilter,
  type FeedPagination,
  // Response types
  type FeedResponse,
  type FeedPostResponse,
  type FeedActionResponse,
  // Extended types
  type FeedPostWithMetadata,
  // Query types
  type GetFeedQuery,
  type FeedCursor,
  // Polymorphic feed item types (2026 standard)
  type FeedItemType,
  type FeedItemBase,
  type FeedItemPost,
  type FeedItemEvent,
  type FeedItemSchedule,
  type FeedItemStat,
  type FeedItemMetric,
  type FeedItemOffer,
  type FeedItemCommitment,
  type FeedItemVisit,
  type FeedItemCamp,
  type FeedItemAward,
  type FeedItemNews,
  type FeedItemScoutReport,
  type FeedItemAcademic,
  type FeedItemSharedReference,
  type FeedItem,
  // Type guards
  isFeedItemPost,
  isFeedItemEvent,
  isFeedItemSchedule,
  isFeedItemStat,
  isFeedItemSharedReference,
  // Polymorphic response types
  type FeedItemResponse,
  type FeedPointer,
} from './feed.types';

// ============================================
// FEED CONSTANTS
// ============================================
export {
  // API endpoints
  FEED_API_ENDPOINTS,
  // Pagination
  FEED_PAGINATION_DEFAULTS,
  // Post types
  FEED_POST_TYPE_ICONS,
  FEED_POST_TYPE_LABELS,
  FEED_POST_TYPE_COLORS,
  // Tag/chip config
  FEED_TAG_TYPE_ICONS,
  FEED_MAX_VISIBLE_TAGS,
  // Engagement
  type FeedEngagementAction,
  FEED_ENGAGEMENT_ICONS,
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

// ============================================
// FEED MAPPERS
// ============================================
export {
  profileUserToFeedAuthor,
  profilePostToFeedPost,
  profilePostsToFeedPosts,
  profileOfferToFeedPost,
  profileEventToFeedPost,
  buildUnifiedActivityFeed,
  teamToFeedAuthor,
  teamPostToFeedPost,
  teamPostsToFeedPosts,
  // Polymorphic mappers (2026 standard)
  feedPostToFeedItem,
  eventDocToFeedItemEvent,
  scheduleDocToFeedItemSchedule,
  statDocToFeedItemStat,
  recruitingDocToFeedItemVariant,
  metricGroupToFeedItemMetric,
  rankingDocToFeedItemAward,
  videoDocToFeedItemPost,
  profileOfferToFeedItemOffer,
  profileEventToFeedItemVariant,
  buildPolymorphicActivityFeed,
  // Team timeline mappers (2026)
  newsArticleToFeedItemNews,
  teamStatDocToFeedItemStat,
} from './feed.mappers';
