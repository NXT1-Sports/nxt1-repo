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
import type { NewsBoardItem } from './news-board.types';

function buildGoogleFaviconUrl(sourceUrl: string): string | undefined {
  try {
    const hostname = new URL(sourceUrl).hostname;
    if (!hostname) return undefined;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return undefined;
  }
}

export function resolveNewsFaviconUrl(
  article: Pick<NewsArticle, 'sourceUrl' | 'faviconUrl'>
): string | undefined {
  const explicitFavicon = article.faviconUrl?.trim();
  if (explicitFavicon) return explicitFavicon;
  return buildGoogleFaviconUrl(article.sourceUrl);
}

// ============================================
// NewsArticle → NewsBoardItem
// ============================================

/**
 * Map a single `NewsArticle` to the display-adapter `NewsBoardItem`.
 */
function mapArticleToBoardItem(article: NewsArticle): NewsBoardItem {
  return {
    id: article.id,
    title: article.title,
    excerpt: article.excerpt,
    imageUrl: article.imageUrl,
    sourceName: article.source,
    faviconUrl: resolveNewsFaviconUrl(article),
    category: 'news',
    publishedAt: article.publishedAt,
    viewCount: article.viewCount,
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
