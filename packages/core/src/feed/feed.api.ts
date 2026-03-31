/**
 * @fileoverview Feed API Factory - Pure TypeScript
 * @module @nxt1/core/feed
 * @version 1.0.0
 *
 * Pure functions for feed API calls.
 * 100% portable - NO platform dependencies.
 * Enterprise error handling with NxtApiError factories.
 *
 * Uses HttpAdapter pattern for cross-platform compatibility.
 */

import type { HttpAdapter } from '../api/http-adapter';
import type { FeedResponse, FeedPostResponse, FeedActionResponse, FeedFilter } from './feed.types';
import { FEED_API_ENDPOINTS, FEED_PAGINATION_DEFAULTS } from './feed.constants';
import { createApiError, isNxtApiError } from '../errors';

// ============================================
// API FACTORY TYPE
// ============================================

export type FeedApi = ReturnType<typeof createFeedApi>;

// ============================================
// FEED API FACTORY
// ============================================

/**
 * Create Feed API instance.
 *
 * @param http - Platform-specific HTTP adapter
 * @param baseUrl - Base URL for API endpoints
 * @returns Feed API methods
 *
 * @example
 * ```typescript
 * // Web (Angular)
 * const api = createFeedApi(angularHttpAdapter, environment.apiUrl);
 *
 * // Mobile (Capacitor)
 * const api = createFeedApi(capacitorHttpAdapter, API_URL);
 *
 * // Usage
 * const feed = await api.getFeed({ type: 'for-you', limit: 20 });
 * await api.likePost('post-123');
 * ```
 */
export function createFeedApi(http: HttpAdapter, baseUrl: string) {
  /**
   * Build URL with query parameters.
   */
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

  /**
   * Replace path parameters.
   */
  const replaceParams = (path: string, params: Record<string, string>): string => {
    let result = path;
    Object.entries(params).forEach(([key, value]) => {
      result = result.replace(`:${key}`, value);
    });
    return result;
  };

  return {
    /**
     * Get main feed with optional filters.
     *
     * @param filter - Filter and pagination options
     * @param page - Page number (1-indexed)
     * @param limit - Items per page
     * @returns Paginated feed response
     * @throws NxtApiError on failure
     */
    async getFeed(
      filter?: FeedFilter,
      page: number = FEED_PAGINATION_DEFAULTS.INITIAL_PAGE,
      limit: number = FEED_PAGINATION_DEFAULTS.LIMIT
    ): Promise<FeedResponse> {
      try {
        const url = buildUrl(FEED_API_ENDPOINTS.FEED, {
          type: filter?.type,
          sport: filter?.sport,
          postTypes: filter?.postTypes?.join(','),
          authorRoles: filter?.authorRoles?.join(','),
          query: filter?.query,
          authorUid: filter?.authorUid,
          teamCode: filter?.teamCode,
          verifiedOnly: filter?.verifiedOnly,
          mediaOnly: filter?.mediaOnly,
          startDate: filter?.startDate,
          endDate: filter?.endDate,
          page,
          limit,
        });

        const response = await http.get<FeedResponse>(url);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to fetch feed',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error fetching feed',
        });
      }
    },

    /**
     * Get a user's feed.
     *
     * @param uid - User ID
     * @param page - Page number
     * @param limit - Items per page
     * @returns Paginated feed response
     */
    async getUserFeed(
      uid: string,
      page: number = FEED_PAGINATION_DEFAULTS.INITIAL_PAGE,
      limit: number = FEED_PAGINATION_DEFAULTS.LIMIT
    ): Promise<FeedResponse> {
      try {
        const path = replaceParams(FEED_API_ENDPOINTS.USER_FEED, { uid });
        const url = buildUrl(path, { page, limit });

        const response = await http.get<FeedResponse>(url);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to fetch user feed',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error fetching user feed',
        });
      }
    },

    /**
     * Get a team's feed.
     *
     * @param teamCode - Team code
     * @param page - Page number
     * @param limit - Items per page
     * @returns Paginated feed response
     */
    async getTeamFeed(
      teamCode: string,
      page: number = FEED_PAGINATION_DEFAULTS.INITIAL_PAGE,
      limit: number = FEED_PAGINATION_DEFAULTS.LIMIT
    ): Promise<FeedResponse> {
      try {
        const path = replaceParams(FEED_API_ENDPOINTS.TEAM_FEED, { teamCode });
        const url = buildUrl(path, { page, limit });

        const response = await http.get<FeedResponse>(url);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to fetch team feed',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error fetching team feed',
        });
      }
    },

    /**
     * Get single post by ID.
     *
     * @param postId - Post unique identifier
     * @returns Post details
     * @throws NxtApiError on failure
     */
    async getPost(postId: string): Promise<FeedPostResponse> {
      try {
        const path = replaceParams(FEED_API_ENDPOINTS.POST, { id: postId });
        const url = `${baseUrl}${path}`;

        const response = await http.get<FeedPostResponse>(url);

        if (!response.success) {
          throw createApiError('RES_NOT_FOUND', {
            message: response.error ?? `Post ${postId} not found`,
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error fetching post',
        });
      }
    },

    /**
     * Toggle like on a post.
     *
     * @param postId - Post ID to like/unlike
     * @returns Updated engagement state
     */
    async toggleLike(postId: string): Promise<FeedActionResponse> {
      try {
        const path = replaceParams(FEED_API_ENDPOINTS.POST_LIKE, { id: postId });
        const url = `${baseUrl}${path}`;

        const response = await http.post<FeedActionResponse>(url, {});

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to toggle like',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error toggling like',
        });
      }
    },

    /**
     * Share a post.
     *
     * @param postId - Post ID to share
     * @returns Updated engagement state
     */
    async sharePost(postId: string): Promise<FeedActionResponse> {
      try {
        const path = replaceParams(FEED_API_ENDPOINTS.POST_SHARE, { id: postId });
        const url = `${baseUrl}${path}`;

        const response = await http.post<FeedActionResponse>(url, {});

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to share post',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error sharing post',
        });
      }
    },

    /**
     * Get trending posts.
     *
     * @param limit - Number of posts
     * @returns Trending feed
     */
    async getTrending(limit: number = 10): Promise<FeedResponse> {
      try {
        const url = buildUrl(FEED_API_ENDPOINTS.TRENDING, { limit });

        const response = await http.get<FeedResponse>(url);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to fetch trending',
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
     * Report a post.
     *
     * @param postId - Post ID
     * @param reason - Report reason
     * @returns Action response
     */
    async reportPost(postId: string, reason: string): Promise<FeedActionResponse> {
      try {
        const path = replaceParams(FEED_API_ENDPOINTS.POST_REPORT, { id: postId });
        const url = `${baseUrl}${path}`;

        const response = await http.post<FeedActionResponse>(url, { reason });

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to report post',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error reporting post',
        });
      }
    },
  } as const;
}
