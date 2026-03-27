/**
 * @fileoverview News Type Definitions
 * @module @nxt1/core/news
 * @version 2.0.0
 *
 * Pure TypeScript type definitions for Sports News (Pulse) feature.
 * 100% portable — works on web, mobile, and backend.
 *
 * Features:
 * - AI-generated news articles with real publisher attribution
 * - Sport / state based filtering
 * - Category-based feed tabs
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
// NEWS ARTICLE TYPES
// ============================================

/**
 * Main news article type.
 * Lean model: real articles sourced by AI from the live internet.
 */
export interface NewsArticle {
  /** Unique article identifier */
  readonly id: string;
  /** SEO-friendly URL slug */
  readonly slug: string;
  /** Article headline */
  readonly title: string;
  /** Short excerpt/summary (1-2 sentences for feed cards) */
  readonly excerpt: string;
  /** Full article content — AI-generated summary (HTML or markdown) */
  readonly content: string;
  /** Original publisher name (e.g., 'ESPN', 'Rivals') */
  readonly source: string;
  /** Direct URL to the original article */
  readonly sourceUrl: string;
  /** Publisher favicon/logo URL */
  readonly faviconUrl?: string;
  /** Hero/featured image URL (from source og:image) */
  readonly imageUrl?: string;
  /** Target sport for feed bucketing (e.g., 'basketball_mens') */
  readonly sport: string;
  /** Target state for feed bucketing (e.g., 'Texas') */
  readonly state: string;
  /** Original author name (if available) */
  readonly author?: string;
  /** Publication timestamp (ISO string) */
  readonly publishedAt: string;
  /** Document creation timestamp (ISO string) */
  readonly createdAt: string;
  /** TTL expiration timestamp — used by Firestore TTL policy for auto-deletion */
  readonly expiresAt?: string;
  /** View count */
  readonly viewCount?: number;
  /**
   * Ownership type — distinguishes user news from team news.
   * - `'user'` — generated for an individual athlete/user
   * - `'team'` — generated for a team
   * Absent on legacy documents; treat as `'user'`.
   */
  readonly type?: 'user' | 'team';
  /**
   * Team ID — present when `type === 'team'`.
   */
  readonly teamId?: string;
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
  /** Sport to filter by */
  readonly sport?: string;
  /** State to filter by */
  readonly state?: string;
  /** Sort order */
  readonly sortBy?: NewsSortBy;
  /** Date range */
  readonly dateRange?: NewsDateRange;
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
  readonly type: 'view' | 'share';
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
