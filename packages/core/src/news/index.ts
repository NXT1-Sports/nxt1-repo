/**
 * @fileoverview News Module - Barrel Export
 * @module @nxt1/core/news
 * @version 1.0.0
 *
 * Pure TypeScript news module for Sports News feature.
 * 100% portable - works on web, mobile, and backend.
 */

// ============================================
// TYPES
// ============================================

export type {
  // Category types
  NewsCategoryId,
  NewsCategory,
  // Article types
  NewsArticle,
  // Filter types
  NewsSortBy,
  NewsDateRange,
  NewsFilter,
  NewsPagination,
  // API response types
  NewsFeedResponse,
  NewsArticleResponse,
  // State types
  NewsState,
  ArticleDetailState,
  // Event types
  ArticleInteractionEvent,
  CategoryChangeEvent,
  FilterChangeEvent,
} from './news.types';

// ============================================
// CONSTANTS
// ============================================

export {
  // Categories
  NEWS_CATEGORIES,
  NEWS_DEFAULT_CATEGORY,
  NEWS_CATEGORY_COLORS,
  NEWS_CATEGORY_BG_COLORS,
  // Sort & Filter
  NEWS_SORT_OPTIONS,
  NEWS_DATE_RANGES,
  // Pagination
  NEWS_PAGINATION_DEFAULTS,
  // UI Config
  NEWS_UI_CONFIG,
  // Empty states
  NEWS_EMPTY_STATES,
  // Cache
  NEWS_CACHE_KEYS,
  NEWS_CACHE_TTL,
  // TTL
  ARTICLE_TTL_DAYS,
  // API
  NEWS_API_ENDPOINTS,
  // Animations
  NEWS_ANIMATION_CONFIG,
} from './news.constants';

// ============================================
// API
// ============================================

export { createNewsApi, type NewsApi } from './news.api';

// ============================================
// VALIDATION
// ============================================

export {
  // Validation functions
  isValidCategory,
  validateCategory,
  validateArticle,
  validateFilter,
  // Utility functions
  sanitizeArticleContent,
  calculateReadingTime,
  truncateText,
  generateArticleSlug,
  // Types
  type ValidationResult,
} from './news.validation';

// ============================================
// NEWS BOARD (Shared Display Adapter)
// ============================================

export type { NewsBoardCategory, NewsBoardItem } from './news-board.types';

export { mapNewsArticlesToBoardItems } from './news-board.helpers';
