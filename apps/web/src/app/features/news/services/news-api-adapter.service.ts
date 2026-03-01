/**
 * @fileoverview News API Adapter - Web Platform Implementation
 * @module @nxt1/web/features/news
 * @version 1.0.0
 *
 * Implements INewsApiAdapter for the web platform by wrapping the shared
 * NewsApiService. Provided via NEWS_API_ADAPTER token in news.routes.ts.
 */

import { Injectable, inject } from '@angular/core';
import { type NewsArticle, type NewsCategoryId, type NewsPagination } from '@nxt1/core';
import { NewsApiService, type INewsApiAdapter } from '@nxt1/ui/news';

@Injectable()
export class NewsApiAdapterService implements INewsApiAdapter {
  private readonly api = inject(NewsApiService);

  async getFeed(
    category: NewsCategoryId,
    page: number,
    limit: number
  ): Promise<{ data: NewsArticle[]; pagination: NewsPagination }> {
    const isForYou = category === 'for-you';
    const isSaved = category === 'saved';

    const response = await this.api.getFeed({
      categories: isForYou || isSaved ? undefined : [category],
      bookmarkedOnly: isSaved ? true : undefined,
      page,
      limit,
    });

    const data = (response.data ?? []) as NewsArticle[];
    const pagination: NewsPagination = response.pagination ?? {
      page,
      limit,
      total: data.length,
      totalPages: 1,
      hasMore: false,
    };

    return { data, pagination };
  }

  async toggleBookmark(articleId: string): Promise<void> {
    await this.api.toggleBookmark(articleId);
  }

  async getRelatedArticles(_articleId: string, _limit = 3): Promise<NewsArticle[]> {
    // Backend does not yet expose a /related endpoint; return empty array.
    // Wire up when the endpoint is available.
    return [];
  }
}
