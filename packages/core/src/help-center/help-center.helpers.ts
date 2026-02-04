/**
 * @fileoverview Help Center Helpers - Pure TypeScript
 * @module @nxt1/core/help-center
 * @version 1.0.0
 *
 * Pure utility functions for Help Center feature.
 * 100% portable - no platform dependencies.
 */

import type {
  HelpArticle,
  HelpCategory,
  HelpCategoryId,
  HelpUserType,
  ChatMessage,
} from './help-center.types';
import { HELP_CATEGORIES, HELP_CONTENT_TYPES } from './help-center.constants';

// ============================================
// CATEGORY HELPERS
// ============================================

/**
 * Get category by ID.
 */
export function getCategoryById(id: HelpCategoryId): HelpCategory | undefined {
  return HELP_CATEGORIES.find((cat) => cat.id === id);
}

/**
 * Get categories for specific user type.
 */
export function getCategoriesForUser(userType: HelpUserType): HelpCategory[] {
  return HELP_CATEGORIES.filter(
    (cat) =>
      !cat.targetUsers || cat.targetUsers.includes('all') || cat.targetUsers.includes(userType)
  );
}

/**
 * Sort categories by order.
 */
export function sortCategories(categories: HelpCategory[]): HelpCategory[] {
  return [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// ============================================
// ARTICLE HELPERS
// ============================================

/**
 * Check if article is new (published within last 7 days).
 */
export function isArticleNew(article: HelpArticle, daysThreshold = 7): boolean {
  const publishedDate = new Date(article.publishedAt);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays <= daysThreshold;
}

/**
 * Check if article was recently updated.
 */
export function isArticleUpdated(article: HelpArticle, daysThreshold = 14): boolean {
  const updatedDate = new Date(article.updatedAt);
  const publishedDate = new Date(article.publishedAt);
  const now = new Date();

  // Only show "updated" if updated after publish
  if (updatedDate.getTime() <= publishedDate.getTime()) return false;

  const diffDays = Math.floor((now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays <= daysThreshold;
}

/**
 * Format video duration from seconds to readable string.
 */
export function formatVideoDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Format reading time.
 */
export function formatReadingTime(minutes: number): string {
  if (minutes < 1) {
    return '< 1 min read';
  }
  return `${minutes} min read`;
}

/**
 * Get content type configuration.
 */
export function getContentTypeConfig(type: keyof typeof HELP_CONTENT_TYPES) {
  return HELP_CONTENT_TYPES[type];
}

/**
 * Calculate article helpfulness percentage.
 */
export function calculateHelpfulnessPercent(article: HelpArticle): number | null {
  const total = article.helpfulCount + article.notHelpfulCount;
  if (total === 0) return null;
  return Math.round((article.helpfulCount / total) * 100);
}

/**
 * Filter articles by user type.
 */
export function filterArticlesByUserType(
  articles: HelpArticle[],
  userType: HelpUserType
): HelpArticle[] {
  return articles.filter(
    (article) => article.targetUsers.includes('all') || article.targetUsers.includes(userType)
  );
}

/**
 * Sort articles by various criteria.
 */
export function sortArticles(
  articles: HelpArticle[],
  sortBy: 'date' | 'popularity' | 'relevance' = 'date',
  order: 'asc' | 'desc' = 'desc'
): HelpArticle[] {
  const sorted = [...articles].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'date':
        comparison = new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
        break;
      case 'popularity':
        comparison = a.viewCount - b.viewCount;
        break;
      case 'relevance':
        // For relevance, featured articles first, then by views
        if (a.isFeatured && !b.isFeatured) comparison = -1;
        else if (!a.isFeatured && b.isFeatured) comparison = 1;
        else comparison = a.viewCount - b.viewCount;
        break;
    }

    return order === 'desc' ? -comparison : comparison;
  });

  return sorted;
}

// ============================================
// SEARCH HELPERS
// ============================================

/**
 * Highlight search matches in text.
 */
export function highlightSearchMatches(text: string, query: string): string {
  if (!query.trim()) return text;

  const words = query.trim().split(/\s+/);
  let result = text;

  words.forEach((word) => {
    const regex = new RegExp(`(${escapeRegex(word)})`, 'gi');
    result = result.replace(regex, '<mark>$1</mark>');
  });

  return result;
}

/**
 * Escape special regex characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate excerpt from content with search query context.
 */
export function generateSearchExcerpt(content: string, query: string, maxLength = 200): string {
  // Remove HTML tags
  const plainText = content.replace(/<[^>]*>/g, '');

  if (!query.trim()) {
    return plainText.substring(0, maxLength) + (plainText.length > maxLength ? '...' : '');
  }

  // Find first occurrence of query
  const lowerContent = plainText.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerContent.indexOf(lowerQuery);

  if (index === -1) {
    return plainText.substring(0, maxLength) + (plainText.length > maxLength ? '...' : '');
  }

  // Extract context around the match
  const start = Math.max(0, index - 50);
  const end = Math.min(plainText.length, index + query.length + 150);

  let excerpt = plainText.substring(start, end);

  if (start > 0) excerpt = '...' + excerpt;
  if (end < plainText.length) excerpt = excerpt + '...';

  return highlightSearchMatches(excerpt, query);
}

/**
 * Calculate search relevance score (simple implementation).
 */
export function calculateSearchScore(article: HelpArticle, query: string): number {
  if (!query.trim()) return 0;

  const queryLower = query.toLowerCase();
  const words = queryLower.split(/\s+/);
  let score = 0;

  // Title matches (highest weight)
  const titleLower = article.title.toLowerCase();
  words.forEach((word) => {
    if (titleLower.includes(word)) score += 30;
    if (titleLower.startsWith(word)) score += 20;
  });
  if (titleLower === queryLower) score += 50;

  // Excerpt matches
  const excerptLower = article.excerpt.toLowerCase();
  words.forEach((word) => {
    if (excerptLower.includes(word)) score += 10;
  });

  // Tag matches
  article.tags.forEach((tag) => {
    const tagLower = tag.toLowerCase();
    words.forEach((word) => {
      if (tagLower === word) score += 25;
      else if (tagLower.includes(word)) score += 10;
    });
  });

  // Boost for featured articles
  if (article.isFeatured) score += 15;

  // Boost for popular articles (normalized)
  score += Math.min(article.viewCount / 100, 10);

  return Math.min(score, 100);
}

// ============================================
// CHAT HELPERS
// ============================================

/**
 * Generate unique chat message ID.
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate unique chat session ID.
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create user chat message.
 */
export function createUserMessage(content: string): ChatMessage {
  return {
    id: generateMessageId(),
    role: 'user',
    content,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create assistant chat message.
 */
export function createAssistantMessage(
  content: string,
  attachments?: ChatMessage['attachments']
): ChatMessage {
  return {
    id: generateMessageId(),
    role: 'assistant',
    content,
    timestamp: new Date().toISOString(),
    attachments,
  };
}

/**
 * Create streaming placeholder message.
 */
export function createStreamingMessage(): ChatMessage {
  return {
    id: generateMessageId(),
    role: 'assistant',
    content: '',
    timestamp: new Date().toISOString(),
    isStreaming: true,
  };
}

/**
 * Extract session title from first user message.
 */
export function extractSessionTitle(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((m) => m.role === 'user');
  if (!firstUserMessage) return 'New Conversation';

  const content = firstUserMessage.content;
  // Take first 50 characters, cut at word boundary
  if (content.length <= 50) return content;

  const truncated = content.substring(0, 50);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 20 ? truncated.substring(0, lastSpace) : truncated) + '...';
}

// ============================================
// URL/SLUG HELPERS
// ============================================

/**
 * Generate URL-friendly slug from title.
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Build article URL path.
 */
export function buildArticlePath(article: HelpArticle): string {
  return `/help-center/article/${article.slug}`;
}

/**
 * Build category URL path.
 */
export function buildCategoryPath(categoryId: HelpCategoryId): string {
  return `/help-center/category/${categoryId}`;
}

/**
 * Build search URL with query.
 */
export function buildSearchPath(query: string): string {
  return `/help-center/search?q=${encodeURIComponent(query)}`;
}

// ============================================
// DATE HELPERS
// ============================================

/**
 * Format relative time (e.g., "2 days ago").
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;

  return date.toLocaleDateString();
}

/**
 * Format date for display.
 */
export function formatArticleDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
