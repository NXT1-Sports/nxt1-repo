/**
 * @fileoverview Explore API Factory
 * @module @nxt1/core/explore
 * @version 1.0.0
 *
 * Pure TypeScript API factory for Explore/Search feature.
 * Uses HttpAdapter pattern for platform-agnostic HTTP calls.
 * Enterprise error handling with NxtApiError factories.
 *
 * @example
 * ```typescript
 * // Angular adapter
 * const api = createExploreApi(httpAdapter, '/api/v1');
 * const results = await api.search({ query: 'basketball', tab: 'athletes' });
 * ```
 */

import type { HttpAdapter } from '../api';
import type {
  ExploreSearchQuery,
  ExploreSearchResponse,
  ExploreItem,
  ExploreTabCounts,
  ExploreCollegeItem,
  ExploreVideoItem,
  ExploreAthleteItem,
  ExploreTeamItem,
} from './explore.types';
import { EXPLORE_API_ENDPOINTS, EXPLORE_PAGINATION_DEFAULTS } from './explore.constants';

/**
 * Generic API response wrapper.
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Create an Explore API instance.
 *
 * @param http - HTTP adapter for making requests
 * @param baseUrl - Base URL for API endpoints
 * @returns Explore API methods
 */
export function createExploreApi(http: HttpAdapter, baseUrl: string) {
  /**
   * Build query string from parameters.
   */
  function buildQueryString(params: Record<string, unknown>): string {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    });
    return searchParams.toString();
  }

  return {
    /**
     * Search for items across categories.
     */
    async search<T extends ExploreItem = ExploreItem>(
      query: ExploreSearchQuery
    ): Promise<ExploreSearchResponse<T>> {
      const queryString = buildQueryString({
        q: query.query,
        tab: query.tab,
        sortBy: query.sortBy,
        page: query.page ?? 1,
        limit: query.limit ?? EXPLORE_PAGINATION_DEFAULTS.pageSize,
        ...query.filters,
      });

      const url = `${baseUrl}${EXPLORE_API_ENDPOINTS.search}?${queryString}`;
      const response = await http.get<ApiResponse<ExploreSearchResponse<T>>>(url);

      if (!response.success || !response.data) {
        return {
          success: false,
          items: [],
          pagination: {
            page: 1,
            limit: EXPLORE_PAGINATION_DEFAULTS.pageSize,
            total: 0,
            totalPages: 0,
            hasMore: false,
          },
          error: response.error ?? 'Failed to search',
        };
      }

      return response.data;
    },

    /**
     * Get search suggestions for autocomplete.
     */
    async getSuggestions(query: string, limit = 8): Promise<string[]> {
      if (!query || query.length < 2) return [];

      const url = `${baseUrl}${EXPLORE_API_ENDPOINTS.suggestions}?q=${encodeURIComponent(query)}&limit=${limit}`;
      const response = await http.get<ApiResponse<{ suggestions: string[] }>>(url);

      return response.success && response.data ? response.data.suggestions : [];
    },

    /**
     * Get trending searches.
     */
    async getTrendingSearches(limit = 10): Promise<string[]> {
      const url = `${baseUrl}${EXPLORE_API_ENDPOINTS.trending}?limit=${limit}`;
      const response = await http.get<ApiResponse<{ trending: string[] }>>(url);

      return response.success && response.data ? response.data.trending : [];
    },

    /**
     * Get counts for all tabs based on query.
     */
    async getTabCounts(query: string): Promise<ExploreTabCounts> {
      const url = `${baseUrl}${EXPLORE_API_ENDPOINTS.counts}?q=${encodeURIComponent(query)}`;
      const response = await http.get<ApiResponse<ExploreTabCounts>>(url);

      return response.success && response.data
        ? response.data
        : { colleges: 0, videos: 0, athletes: 0, teams: 0 };
    },

    /**
     * Get college details.
     */
    async getCollege(id: string): Promise<ExploreCollegeItem | null> {
      const url = `${baseUrl}${EXPLORE_API_ENDPOINTS.collegeDetail}/${id}`;
      const response = await http.get<ApiResponse<ExploreCollegeItem>>(url);

      return response.success && response.data ? response.data : null;
    },

    /**
     * Get video details.
     */
    async getVideo(id: string): Promise<ExploreVideoItem | null> {
      const url = `${baseUrl}${EXPLORE_API_ENDPOINTS.videoDetail}/${id}`;
      const response = await http.get<ApiResponse<ExploreVideoItem>>(url);

      return response.success && response.data ? response.data : null;
    },

    /**
     * Get athlete details.
     */
    async getAthlete(id: string): Promise<ExploreAthleteItem | null> {
      const url = `${baseUrl}${EXPLORE_API_ENDPOINTS.athleteDetail}/${id}`;
      const response = await http.get<ApiResponse<ExploreAthleteItem>>(url);

      return response.success && response.data ? response.data : null;
    },

    /**
     * Get team details.
     */
    async getTeam(id: string): Promise<ExploreTeamItem | null> {
      const url = `${baseUrl}${EXPLORE_API_ENDPOINTS.teamDetail}/${id}`;
      const response = await http.get<ApiResponse<ExploreTeamItem>>(url);

      return response.success && response.data ? response.data : null;
    },
  } as const;
}

/**
 * Explore API type.
 */
export type ExploreApi = ReturnType<typeof createExploreApi>;
