/**
 * @fileoverview News API Adapter - Mobile Platform Implementation
 * @module @nxt1/mobile/core/services
 * @version 1.0.0
 *
 * Implements INewsApiAdapter for the mobile platform by wrapping the shared
 * NewsApiService. Provided via NEWS_API_ADAPTER token in app.config.ts.
 */

import { Injectable, inject } from '@angular/core';
import { type NewsArticle, type NewsCategoryId, type NewsPagination } from '@nxt1/core';
import { NewsApiService, type INewsApiAdapter } from '@nxt1/ui';

@Injectable({ providedIn: 'root' })
export class PulseApiAdapterService implements INewsApiAdapter {
  private readonly api = inject(NewsApiService);

  async getFeed(
    category: NewsCategoryId,
    page: number,
    limit: number
  ): Promise<{ data: NewsArticle[]; pagination: NewsPagination }> {
    const response = await this.api.getFeed({ page, limit });

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
}
