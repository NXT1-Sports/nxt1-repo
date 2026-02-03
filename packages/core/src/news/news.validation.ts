/**
 * @fileoverview News Validation Functions
 * @module @nxt1/core/news
 * @version 1.0.0
 *
 * Pure validation functions for news data.
 * 100% portable - no platform dependencies.
 */

import type {
  NewsArticle,
  NewsCategory,
  NewsCategoryId,
  NewsFilter,
  ReadingProgress,
} from './news.types';
import { NEWS_CATEGORIES, NEWS_PAGINATION_DEFAULTS } from './news.constants';

// ============================================
// VALIDATION RESULT TYPE
// ============================================

export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
}

// ============================================
// CATEGORY VALIDATION
// ============================================

/**
 * Valid category IDs for quick lookup.
 */
const VALID_CATEGORY_IDS: ReadonlySet<NewsCategoryId> = new Set(NEWS_CATEGORIES.map((c) => c.id));

/**
 * Check if a category ID is valid.
 *
 * @param categoryId - Category to validate
 * @returns Whether category is valid
 */
export function isValidCategory(categoryId: string): categoryId is NewsCategoryId {
  return VALID_CATEGORY_IDS.has(categoryId as NewsCategoryId);
}

/**
 * Validate a news category.
 *
 * @param category - Category to validate
 * @returns Validation result
 */
export function validateCategory(category: Partial<NewsCategory>): ValidationResult {
  const errors: string[] = [];

  if (!category.id) {
    errors.push('Category ID is required');
  } else if (!isValidCategory(category.id)) {
    errors.push(`Invalid category ID: ${category.id}`);
  }

  if (!category.label || category.label.trim().length === 0) {
    errors.push('Category label is required');
  }

  if (!category.icon || category.icon.trim().length === 0) {
    errors.push('Category icon is required');
  }

  if (category.badge !== undefined && (category.badge < 0 || !Number.isInteger(category.badge))) {
    errors.push('Category badge must be a non-negative integer');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================
// ARTICLE VALIDATION
// ============================================

/**
 * Validate a news article.
 *
 * @param article - Article to validate
 * @returns Validation result
 */
export function validateArticle(article: Partial<NewsArticle>): ValidationResult {
  const errors: string[] = [];

  // Required fields
  if (!article.id || article.id.trim().length === 0) {
    errors.push('Article ID is required');
  }

  if (!article.title || article.title.trim().length === 0) {
    errors.push('Article title is required');
  } else if (article.title.length > 200) {
    errors.push('Article title must be 200 characters or less');
  }

  if (!article.excerpt || article.excerpt.trim().length === 0) {
    errors.push('Article excerpt is required');
  } else if (article.excerpt.length > 500) {
    errors.push('Article excerpt must be 500 characters or less');
  }

  if (!article.content || article.content.trim().length === 0) {
    errors.push('Article content is required');
  }

  if (!article.category) {
    errors.push('Article category is required');
  } else if (!isValidCategory(article.category)) {
    errors.push(`Invalid article category: ${article.category}`);
  }

  // Source validation
  if (!article.source) {
    errors.push('Article source is required');
  } else {
    if (!article.source.id || article.source.id.trim().length === 0) {
      errors.push('Source ID is required');
    }
    if (!article.source.name || article.source.name.trim().length === 0) {
      errors.push('Source name is required');
    }
  }

  // Reading time validation
  if (article.readingTimeMinutes !== undefined) {
    if (article.readingTimeMinutes < 0) {
      errors.push('Reading time must be non-negative');
    }
    if (article.readingTimeMinutes > 120) {
      errors.push('Reading time seems unrealistic (>120 minutes)');
    }
  }

  // XP reward validation
  if (article.xpReward !== undefined) {
    if (article.xpReward < 0) {
      errors.push('XP reward must be non-negative');
    }
    if (article.xpReward > 1000) {
      errors.push('XP reward seems unrealistic (>1000)');
    }
  }

  // Timestamp validation
  if (article.publishedAt) {
    const publishDate = new Date(article.publishedAt);
    if (isNaN(publishDate.getTime())) {
      errors.push('Invalid publish date format');
    }
  }

  // View count validation
  if (article.viewCount !== undefined && article.viewCount < 0) {
    errors.push('View count must be non-negative');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================
// FILTER VALIDATION
// ============================================

/**
 * Validate news filter options.
 *
 * @param filter - Filter to validate
 * @returns Validation result
 */
export function validateFilter(filter: Partial<NewsFilter>): ValidationResult {
  const errors: string[] = [];

  // Categories validation
  if (filter.categories) {
    for (const category of filter.categories) {
      if (!isValidCategory(category)) {
        errors.push(`Invalid category in filter: ${category}`);
      }
    }
  }

  // Pagination validation
  if (filter.page !== undefined) {
    if (filter.page < 1 || !Number.isInteger(filter.page)) {
      errors.push('Page must be a positive integer');
    }
  }

  if (filter.limit !== undefined) {
    if (filter.limit < 1 || !Number.isInteger(filter.limit)) {
      errors.push('Limit must be a positive integer');
    }
    if (filter.limit > NEWS_PAGINATION_DEFAULTS.MAX_LIMIT) {
      errors.push(`Limit cannot exceed ${NEWS_PAGINATION_DEFAULTS.MAX_LIMIT}`);
    }
  }

  // Sort validation
  const validSortOptions = ['latest', 'trending', 'most-read', 'relevance'];
  if (filter.sortBy && !validSortOptions.includes(filter.sortBy)) {
    errors.push(`Invalid sort option: ${filter.sortBy}`);
  }

  // Date range validation
  const validDateRanges = ['today', 'this-week', 'this-month', 'all-time'];
  if (filter.dateRange && !validDateRanges.includes(filter.dateRange)) {
    errors.push(`Invalid date range: ${filter.dateRange}`);
  }

  // Search query validation
  if (filter.query !== undefined && filter.query.length > 200) {
    errors.push('Search query must be 200 characters or less');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================
// READING PROGRESS VALIDATION
// ============================================

/**
 * Validate reading progress data.
 *
 * @param progress - Progress to validate
 * @returns Validation result
 */
export function validateReadingProgress(progress: Partial<ReadingProgress>): ValidationResult {
  const errors: string[] = [];

  if (!progress.articleId || progress.articleId.trim().length === 0) {
    errors.push('Article ID is required');
  }

  if (progress.progress !== undefined) {
    if (progress.progress < 0 || progress.progress > 100) {
      errors.push('Progress must be between 0 and 100');
    }
  }

  if (progress.scrollDepth !== undefined) {
    if (progress.scrollDepth < 0 || progress.scrollDepth > 100) {
      errors.push('Scroll depth must be between 0 and 100');
    }
  }

  if (progress.timeSpentSeconds !== undefined && progress.timeSpentSeconds < 0) {
    errors.push('Time spent must be non-negative');
  }

  if (progress.xpEarned !== undefined && progress.xpEarned < 0) {
    errors.push('XP earned must be non-negative');
  }

  if (progress.lastReadAt) {
    const readDate = new Date(progress.lastReadAt);
    if (isNaN(readDate.getTime())) {
      errors.push('Invalid last read date format');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Sanitize article content (strip dangerous HTML).
 *
 * @param content - Raw content
 * @returns Sanitized content
 */
export function sanitizeArticleContent(content: string): string {
  // Basic HTML tag stripping for security
  // In production, use a proper sanitizer library
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '');
}

/**
 * Calculate estimated reading time from content.
 *
 * @param content - Article content
 * @param wordsPerMinute - Reading speed (default: 200)
 * @returns Estimated reading time in minutes
 */
export function calculateReadingTime(content: string, wordsPerMinute: number = 200): number {
  // Strip HTML tags
  const textOnly = content.replace(/<[^>]*>/g, '');
  // Count words
  const wordCount = textOnly.split(/\s+/).filter((word) => word.length > 0).length;
  // Calculate reading time
  return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
}

/**
 * Truncate text to a maximum length with ellipsis.
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3).trim() + '...';
}

/**
 * Generate a URL-safe slug from article title.
 *
 * @param title - Article title
 * @returns URL-safe slug
 */
export function generateArticleSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
}
