/**
 * @fileoverview News Type Definitions
 * @module @nxt1/core/news
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for Sports News feature.
 * 100% portable - works on web, mobile, and backend.
 *
 * Features:
 * - AI-generated news articles
 * - Category-based filtering
 * - Reading progress tracking with XP rewards
 * - Bookmarking/saving articles
 */

// ============================================
// CATEGORY TYPES
// ============================================

/**
 * News category identifiers.
 * Each category represents a content filter.
 */
export type NewsCategoryId =
  | 'for-you'
  | 'recruiting'
  | 'college'
  | 'pro'
  | 'highlights'
  | 'transfers'
  | 'commits'
  | 'saved';

/**
 * Configuration for a news category tab.
 */
export interface NewsCategory {
  /** Unique category identifier */
  readonly id: NewsCategoryId;
  /** Display label */
  readonly label: string;
  /** Ionicons icon name */
  readonly icon: string;
  /** Badge count (new/unread articles) */
  readonly badge?: number;
  /** Whether category is currently disabled */
  readonly disabled?: boolean;
  /** Category accent color (design token reference) */
  readonly color?: string;
}

// ============================================
// NEWS SOURCE TYPES
// ============================================

/**
 * AI agent or source attribution for articles.
 */
export interface NewsSource {
  /** Source unique ID (e.g., 'agent-x') */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Avatar/logo URL */
  readonly avatarUrl?: string;
  /** Source type */
  readonly type: 'ai-agent' | 'editorial' | 'syndicated' | 'user-generated';
  /** AI confidence score (0-100) for AI-generated content */
  readonly confidenceScore?: number;
  /** Verification status */
  readonly isVerified?: boolean;
}

// ============================================
// NEWS ARTICLE TYPES
// ============================================

/**
 * Sport context for an article.
 */
export interface ArticleSportContext {
  /** Sport name (e.g., 'football', 'basketball') */
  readonly sport: string;
  /** Team names involved */
  readonly teams?: string[];
  /** Player names mentioned */
  readonly players?: string[];
  /** College names mentioned */
  readonly colleges?: string[];
}

/**
 * Related content for article recommendations.
 */
export interface RelatedArticle {
  /** Article ID */
  readonly id: string;
  /** Headline */
  readonly title: string;
  /** Thumbnail URL */
  readonly thumbnailUrl?: string;
  /** Category */
  readonly category: NewsCategoryId;
}

/**
 * Main news article type.
 */
export interface NewsArticle {
  /** Unique article identifier */
  readonly id: string;
  /** Article headline */
  readonly title: string;
  /** Short excerpt/summary (2-3 sentences) */
  readonly excerpt: string;
  /** Full article content (HTML or markdown) */
  readonly content: string;
  /** Primary category */
  readonly category: NewsCategoryId;
  /** Secondary tags for cross-categorization */
  readonly tags?: string[];
  /** Article source/author */
  readonly source: NewsSource;
  /** Hero/featured image URL */
  readonly heroImageUrl?: string;
  /** Thumbnail image URL (for cards) */
  readonly thumbnailUrl?: string;
  /** Estimated reading time in minutes */
  readonly readingTimeMinutes: number;
  /** Publication timestamp (ISO string) */
  readonly publishedAt: string;
  /** Last update timestamp (ISO string) */
  readonly updatedAt?: string;
  /** Whether user has bookmarked this article */
  readonly isBookmarked: boolean;
  /** Whether user has read this article */
  readonly isRead: boolean;
  /** User's reading progress (0-100) */
  readonly readingProgress?: number;
  /** XP reward for completing this article */
  readonly xpReward: number;
  /** View count */
  readonly viewCount: number;
  /** Share count */
  readonly shareCount?: number;
  /** Like count */
  readonly likeCount?: number;
  /** Sport-specific context */
  readonly sportContext?: ArticleSportContext;
  /** Related articles for recommendations */
  readonly relatedArticles?: RelatedArticle[];
  /** SEO slug for URL */
  readonly slug?: string;
  /** Whether article is featured/trending */
  readonly isFeatured?: boolean;
  /** Whether article is breaking news */
  readonly isBreaking?: boolean;
  /**
   * Ownership type — distinguishes user news from team news.
   * - `'user'` — generated for an individual athlete/user (`userId` is set)
   * - `'team'` — generated for a team (`teamId` is set)
   * Absent on legacy documents; treat as `'user'`.
   */
  readonly type?: 'user' | 'team';
  /**
   * Team ID — present when `type === 'team'`.
   * Mirrors the top-level `TeamCodes` document ID.
   */
  readonly teamId?: string;
}

// ============================================
// READING PROGRESS & GAMIFICATION
// ============================================

/**
 * User's reading progress for gamification.
 */
export interface ReadingProgress {
  /** Article ID */
  readonly articleId: string;
  /** Progress percentage (0-100) */
  readonly progress: number;
  /** Scroll depth reached */
  readonly scrollDepth: number;
  /** Time spent reading (seconds) */
  readonly timeSpentSeconds: number;
  /** Whether article was completed */
  readonly isCompleted: boolean;
  /** XP earned from this article */
  readonly xpEarned: number;
  /** Timestamp of last read */
  readonly lastReadAt: string;
}

/**
 * XP reward event types.
 */
export type XpRewardType =
  | 'article-open'
  | 'article-half'
  | 'article-complete'
  | 'article-share'
  | 'daily-streak'
  | 'milestone';

/**
 * XP reward event.
 */
export interface XpRewardEvent {
  /** Reward type */
  readonly type: XpRewardType;
  /** XP amount earned */
  readonly amount: number;
  /** Associated article ID (if applicable) */
  readonly articleId?: string;
  /** Timestamp */
  readonly timestamp: string;
  /** Whether reward was already claimed */
  readonly isClaimed: boolean;
}

/**
 * User's reading statistics.
 */
export interface ReadingStats {
  /** Total articles read */
  readonly totalArticlesRead: number;
  /** Total XP earned from news */
  readonly totalXpEarned: number;
  /** Current reading streak (consecutive days) */
  readonly currentStreak: number;
  /** Longest streak achieved */
  readonly longestStreak: number;
  /** Total time spent reading (minutes) */
  readonly totalReadingTimeMinutes: number;
  /** Articles read per category */
  readonly articlesPerCategory: Record<NewsCategoryId, number>;
  /** Last read date (ISO string) */
  readonly lastReadDate?: string;
}

// ============================================
// FILTER & PAGINATION
// ============================================

/**
 * Sort options for news feed.
 */
export type NewsSortBy = 'latest' | 'trending' | 'most-read' | 'relevance';

/**
 * Date range filter options.
 */
export type NewsDateRange = 'today' | 'this-week' | 'this-month' | 'all-time';

/**
 * News filter options.
 */
export interface NewsFilter {
  /** Categories to include */
  readonly categories?: NewsCategoryId[];
  /** Tags to include */
  readonly tags?: string[];
  /** Sports to include */
  readonly sports?: string[];
  /** Sort order */
  readonly sortBy?: NewsSortBy;
  /** Date range */
  readonly dateRange?: NewsDateRange;
  /** Show only bookmarked articles */
  readonly bookmarkedOnly?: boolean;
  /** Show only unread articles */
  readonly unreadOnly?: boolean;
  /** Search query */
  readonly query?: string;
  /** Pagination: page number (1-indexed) */
  readonly page?: number;
  /** Pagination: items per page */
  readonly limit?: number;
}

/**
 * Pagination info for news responses.
 */
export interface NewsPagination {
  /** Current page (1-indexed) */
  readonly page: number;
  /** Items per page */
  readonly limit: number;
  /** Total number of items */
  readonly total: number;
  /** Total number of pages */
  readonly totalPages: number;
  /** Whether there are more items */
  readonly hasMore: boolean;
}

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * News feed API response.
 */
export interface NewsFeedResponse {
  /** Success indicator */
  readonly success: boolean;
  /** Feed items */
  readonly data?: NewsArticle[];
  /** Pagination info */
  readonly pagination?: NewsPagination;
  /** Error message (if failed) */
  readonly error?: string;
}

/**
 * Single article API response.
 */
export interface NewsArticleResponse {
  /** Success indicator */
  readonly success: boolean;
  /** Article data */
  readonly data?: NewsArticle;
  /** Error message (if failed) */
  readonly error?: string;
}

/**
 * Bookmark action response.
 */
export interface NewsBookmarkResponse {
  /** Success indicator */
  readonly success: boolean;
  /** Updated bookmark state */
  readonly isBookmarked?: boolean;
  /** Error message (if failed) */
  readonly error?: string;
}

/**
 * Reading progress update response.
 */
export interface NewsProgressResponse {
  /** Success indicator */
  readonly success: boolean;
  /** Updated reading progress */
  readonly data?: ReadingProgress;
  /** XP earned from this update */
  readonly xpEarned?: number;
  /** Error message (if failed) */
  readonly error?: string;
}

// ============================================
// UI STATE TYPES
// ============================================

/**
 * News feed UI state.
 */
export interface NewsState {
  /** Current articles in feed */
  readonly articles: NewsArticle[];
  /** Active category filter */
  readonly activeCategory: NewsCategoryId;
  /** Current filters applied */
  readonly filters: NewsFilter;
  /** Badge counts per category */
  readonly badges: Record<NewsCategoryId, number>;
  /** Loading state */
  readonly isLoading: boolean;
  /** Loading more (infinite scroll) */
  readonly isLoadingMore: boolean;
  /** Refreshing state */
  readonly isRefreshing: boolean;
  /** Error message */
  readonly error: string | null;
  /** Pagination info */
  readonly pagination: NewsPagination | null;
  /** Currently viewed article (detail view) */
  readonly selectedArticle: NewsArticle | null;
  /** Reading statistics */
  readonly readingStats: ReadingStats | null;
}

// ============================================
// ARTICLE DETAIL STATE
// ============================================

/**
 * Article detail view state.
 */
export interface ArticleDetailState {
  /** Article being viewed */
  readonly article: NewsArticle | null;
  /** Loading state */
  readonly isLoading: boolean;
  /** Error message */
  readonly error: string | null;
  /** Current reading progress (0-100) */
  readonly readingProgress: number;
  /** Whether article is completed */
  readonly isCompleted: boolean;
  /** XP earned so far */
  readonly xpEarned: number;
  /** Related articles loaded */
  readonly relatedArticles: NewsArticle[];
}

// ============================================
// EVENT TYPES
// ============================================

/**
 * Article interaction event.
 */
export interface ArticleInteractionEvent {
  /** Article ID */
  readonly articleId: string;
  /** Interaction type */
  readonly type: 'view' | 'bookmark' | 'share' | 'like' | 'complete';
  /** Timestamp */
  readonly timestamp: string;
}

/**
 * Category change event.
 */
export interface CategoryChangeEvent {
  /** Previous category */
  readonly previous: NewsCategoryId;
  /** New category */
  readonly current: NewsCategoryId;
}

/**
 * Filter change event.
 */
export interface FilterChangeEvent {
  /** Updated filters */
  readonly filters: NewsFilter;
  /** Filter property that changed */
  readonly changedProperty: keyof NewsFilter;
}
