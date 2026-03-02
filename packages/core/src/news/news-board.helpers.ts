/**
 * @fileoverview News Board Helpers — Pure Mappers
 * @module @nxt1/core/news
 * @version 1.0.0
 *
 * Pure functions that convert domain types (`NewsArticle`)
 * into the display-adapter `NewsBoardItem` shape consumed by the
 * shared NewsBoardComponent.
 *
 * 100% portable — NO platform dependencies.
 */

import type { NewsArticle } from './news.types';
import type { NewsBoardCategory, NewsBoardItem } from './news-board.types';

// ============================================
// NewsArticle → NewsBoardItem
// ============================================

/**
 * Derive the normalised board category from a `NewsSource.type`.
 *
 * | Source type          | Board category    |
 * |----------------------|-------------------|
 * | `'editorial'`        | `'announcement'`  |
 * | `'ai-agent'`         | `'announcement'`  |
 * | `'syndicated'`       | `'media-mention'` |
 * | `'user-generated'`   | `'news'`          |
 */
function resolveCategory(sourceType: string): NewsBoardCategory {
  if (sourceType === 'editorial' || sourceType === 'ai-agent') return 'announcement';
  if (sourceType === 'syndicated') return 'media-mention';
  return 'news';
}

/**
 * Map a single `NewsArticle` to the display-adapter `NewsBoardItem`.
 */
function mapArticleToBoardItem(article: NewsArticle): NewsBoardItem {
  return {
    id: article.id,
    title: article.title,
    excerpt: article.excerpt,
    imageUrl: article.thumbnailUrl ?? article.heroImageUrl,
    sourceName: article.source.name,
    sourceAvatarUrl: article.source.avatarUrl,
    category: resolveCategory(article.source.type),
    publishedAt: article.publishedAt,
    readingTimeMinutes: article.readingTimeMinutes,
    likeCount: article.likeCount,
    commentCount: undefined,
    ctaLabel: 'Read Article',
  };
}

/**
 * Map an array of `NewsArticle[]` to `NewsBoardItem[]`.
 *
 * @example
 * ```typescript
 * import { mapNewsArticlesToBoardItems } from '@nxt1/core';
 *
 * const items = mapNewsArticlesToBoardItems(MOCK_NEWS_ARTICLES);
 * ```
 */
export function mapNewsArticlesToBoardItems(
  articles: readonly NewsArticle[]
): readonly NewsBoardItem[] {
  return articles.map(mapArticleToBoardItem);
}
