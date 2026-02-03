/**
 * @fileoverview News API Factory - Pure TypeScript
 * @module @nxt1/core/news
 * @version 1.0.0
 *
 * Pure functions for news API calls.
 * 100% portable - NO platform dependencies.
 * Enterprise error handling with NxtApiError factories.
 *
 * Uses HttpAdapter pattern for cross-platform compatibility.
 */

import type { HttpAdapter } from '../api/http-adapter';
import type {
  NewsFeedResponse,
  NewsArticleResponse,
  NewsBookmarkResponse,
  NewsProgressResponse,
  NewsFilter,
  ReadingProgress,
  ReadingStats,
} from './news.types';
import { NEWS_API_ENDPOINTS, NEWS_PAGINATION_DEFAULTS } from './news.constants';
import { createApiError, isNxtApiError } from '../errors';

// ============================================
// API FACTORY TYPE
// ============================================

export type NewsApi = ReturnType<typeof createNewsApi>;

// ============================================
// NEWS API FACTORY
// ============================================

/**
 * Create News API instance.
 *
 * @param http - Platform-specific HTTP adapter
 * @param baseUrl - Base URL for API endpoints
 * @returns News API methods
 *
 * @example
 * ```typescript
 * // Web (Angular)
 * const api = createNewsApi(angularHttpAdapter, environment.apiUrl);
 *
 * // Mobile (Capacitor)
 * const api = createNewsApi(capacitorHttpAdapter, API_URL);
 *
 * // Usage
 * const feed = await api.getFeed({ category: 'recruiting', limit: 20 });
 * await api.toggleBookmark('article-123');
 * ```
 */
export function createNewsApi(http: HttpAdapter, baseUrl: string) {
  const buildUrl = (
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string => {
    const url = `${baseUrl}${path}`;
    if (!params) return url;

    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });

    const queryString = searchParams.toString();
    return queryString ? `${url}?${queryString}` : url;
  };

  const replaceParams = (path: string, params: Record<string, string>): string => {
    let result = path;
    Object.entries(params).forEach(([key, value]) => {
      result = result.replace(`:${key}`, value);
    });
    return result;
  };

  return {
    /**
     * Get news feed with optional filters.
     *
     * @param filter - Filter and pagination options
     * @returns Paginated news feed
     * @throws NxtApiError on failure
     */
    async getFeed(filter?: NewsFilter): Promise<NewsFeedResponse> {
      try {
        const url = buildUrl(NEWS_API_ENDPOINTS.FEED, {
          categories: filter?.categories?.join(','),
          tags: filter?.tags?.join(','),
          sports: filter?.sports?.join(','),
          sortBy: filter?.sortBy,
          dateRange: filter?.dateRange,
          bookmarkedOnly: filter?.bookmarkedOnly,
          unreadOnly: filter?.unreadOnly,
          query: filter?.query,
          page: filter?.page ?? NEWS_PAGINATION_DEFAULTS.INITIAL_PAGE,
          limit: filter?.limit ?? NEWS_PAGINATION_DEFAULTS.LIMIT,
        });

        const response = await http.get<NewsFeedResponse>(url);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to fetch news feed',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error fetching news feed',
        });
      }
    },

    /**
     * Get single article by ID.
     *
     * @param articleId - Article unique identifier
     * @returns Article details
     * @throws NxtApiError on failure
     */
    async getArticle(articleId: string): Promise<NewsArticleResponse> {
      try {
        const path = replaceParams(NEWS_API_ENDPOINTS.ARTICLE, { id: articleId });
        const url = `${baseUrl}${path}`;

        const response = await http.get<NewsArticleResponse>(url);

        if (!response.success) {
          throw createApiError('RES_NOT_FOUND', {
            message: response.error ?? `Article ${articleId} not found`,
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error fetching article',
        });
      }
    },

    /**
     * Toggle bookmark status for an article.
     *
     * @param articleId - Article to bookmark/unbookmark
     * @returns Updated bookmark status
     * @throws NxtApiError on failure
     */
    async toggleBookmark(articleId: string): Promise<NewsBookmarkResponse> {
      try {
        const path = replaceParams(NEWS_API_ENDPOINTS.BOOKMARK, { id: articleId });
        const url = `${baseUrl}${path}`;

        const response = await http.post<NewsBookmarkResponse>(url, {});

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to toggle bookmark',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error toggling bookmark',
        });
      }
    },

    /**
     * Update reading progress for an article.
     *
     * @param articleId - Article being read
     * @param progress - Reading progress data
     * @returns Updated progress with any XP earned
     * @throws NxtApiError on failure
     */
    async updateProgress(
      articleId: string,
      progress: Partial<ReadingProgress>
    ): Promise<NewsProgressResponse> {
      try {
        const path = replaceParams(NEWS_API_ENDPOINTS.PROGRESS, { id: articleId });
        const url = `${baseUrl}${path}`;

        const response = await http.post<NewsProgressResponse>(url, progress);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to update reading progress',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error updating progress',
        });
      }
    },

    /**
     * Get user's reading statistics.
     *
     * @returns User reading stats
     * @throws NxtApiError on failure
     */
    async getReadingStats(): Promise<{ success: boolean; data?: ReadingStats; error?: string }> {
      try {
        const url = `${baseUrl}${NEWS_API_ENDPOINTS.STATS}`;

        const response = await http.get<{ success: boolean; data?: ReadingStats; error?: string }>(
          url
        );

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to fetch reading stats',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error fetching stats',
        });
      }
    },

    /**
     * Get trending articles.
     *
     * @param limit - Number of articles to fetch
     * @returns Trending articles
     * @throws NxtApiError on failure
     */
    async getTrending(limit: number = 10): Promise<NewsFeedResponse> {
      try {
        const url = buildUrl(NEWS_API_ENDPOINTS.TRENDING, { limit });

        const response = await http.get<NewsFeedResponse>(url);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to fetch trending articles',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error fetching trending',
        });
      }
    },

    /**
     * Search articles by query.
     *
     * @param query - Search query
     * @param filter - Additional filters
     * @returns Search results
     * @throws NxtApiError on failure
     */
    async search(query: string, filter?: NewsFilter): Promise<NewsFeedResponse> {
      try {
        const url = buildUrl(NEWS_API_ENDPOINTS.SEARCH, {
          query,
          categories: filter?.categories?.join(','),
          sortBy: filter?.sortBy,
          page: filter?.page ?? NEWS_PAGINATION_DEFAULTS.INITIAL_PAGE,
          limit: filter?.limit ?? NEWS_PAGINATION_DEFAULTS.LIMIT,
        });

        const response = await http.get<NewsFeedResponse>(url);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to search articles',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error searching articles',
        });
      }
    },

    /**
     * Mark article as read.
     *
     * @param articleId - Article to mark as read
     * @returns Success response
     * @throws NxtApiError on failure
     */
    async markAsRead(
      articleId: string
    ): Promise<{ success: boolean; xpEarned?: number; error?: string }> {
      try {
        const path = replaceParams(NEWS_API_ENDPOINTS.PROGRESS, { id: articleId });
        const url = `${baseUrl}${path}`;

        const response = await http.post<{ success: boolean; xpEarned?: number; error?: string }>(
          url,
          {
            isCompleted: true,
            progress: 100,
          }
        );

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to mark article as read',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error marking as read',
        });
      }
    },
  } as const;
}
