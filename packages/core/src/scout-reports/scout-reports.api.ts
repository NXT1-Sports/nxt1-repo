/**
 * @fileoverview Scout Reports API Factory - Pure TypeScript
 * @module @nxt1/core/scout-reports
 * @version 1.0.0
 *
 * Pure functions for scout reports API calls.
 * 100% portable - NO platform dependencies.
 * Enterprise error handling with NxtApiError factories.
 *
 * Uses HttpAdapter pattern for cross-platform compatibility.
 */

import type { HttpAdapter } from '../api/http-adapter';
import type {
  ScoutReportFilter,
  ScoutReportListResponse,
  ScoutReportDetailResponse,
  ScoutReportViewResponse,
  ScoutReportSummary,
  ScoutReportCategoryId,
} from './scout-reports.types';
import { SCOUT_REPORT_API_ENDPOINTS } from './scout-reports.constants';
import { createApiError, isNxtApiError } from '../errors';

// ============================================
// API FACTORY TYPE
// ============================================

export type ScoutReportsApi = ReturnType<typeof createScoutReportsApi>;

// ============================================
// SCOUT REPORTS API FACTORY
// ============================================

/**
 * Create Scout Reports API instance.
 *
 * @param http - Platform-specific HTTP adapter
 * @param baseUrl - Base URL for API endpoints
 * @returns Scout Reports API methods
 *
 * @example
 * ```typescript
 * // Web (Angular)
 * const api = createScoutReportsApi(angularHttpAdapter, environment.apiUrl);
 *
 * // Mobile (Capacitor)
 * const api = createScoutReportsApi(capacitorHttpAdapter, API_URL);
 *
 * // Usage
 * const reports = await api.getReports({ category: 'trending', limit: 20 });
 * await api.bookmarkReport('report-123');
 * ```
 */
export function createScoutReportsApi(http: HttpAdapter, baseUrl: string) {
  /**
   * Build URL with query parameters.
   */
  const buildUrl = (
    path: string,
    params?: Record<string, string | number | boolean | string[] | number[] | undefined>
  ): string => {
    const url = `${baseUrl}${path}`;
    if (!params) return url;

    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          searchParams.append(key, value.join(','));
        } else {
          searchParams.append(key, String(value));
        }
      }
    });

    const queryString = searchParams.toString();
    return queryString ? `${url}?${queryString}` : url;
  };

  return {
    /**
     * Get list of scout reports with optional filters.
     *
     * @param filter - Filter and pagination options
     * @returns Paginated list of scout reports
     * @throws NxtApiError on failure
     */
    async getReports(
      filter?: ScoutReportFilter & { page?: number; limit?: number }
    ): Promise<ScoutReportListResponse> {
      try {
        const url = buildUrl(SCOUT_REPORT_API_ENDPOINTS.LIST, {
          category: filter?.category,
          sports: filter?.sports,
          positions: filter?.positions,
          gradYears: filter?.gradYears,
          minRating: filter?.minRating,
          verifiedOnly: filter?.verifiedOnly,
          states: filter?.states,
          q: filter?.searchQuery,
          sortBy: filter?.sortBy,
          sortOrder: filter?.sortOrder,
          page: filter?.page,
          limit: filter?.limit,
        });

        const response = await http.get<ScoutReportListResponse>(url);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to fetch scout reports',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Failed to fetch scout reports',
        });
      }
    },

    /**
     * Get reports by category with pagination.
     *
     * @param category - Category ID
     * @param page - Page number (1-indexed)
     * @param limit - Items per page
     * @returns Paginated list of scout reports
     */
    async getReportsByCategory(
      category: ScoutReportCategoryId,
      page = 1,
      limit = 20
    ): Promise<ScoutReportListResponse> {
      return this.getReports({ category, page, limit });
    },

    /**
     * Get a single scout report by ID.
     *
     * @param id - Scout report ID
     * @returns Scout report or null if not found
     */
    async getReport(id: string): Promise<ScoutReportDetailResponse> {
      try {
        const url = `${baseUrl}${SCOUT_REPORT_API_ENDPOINTS.DETAIL}/${id}`;
        const response = await http.get<ScoutReportDetailResponse>(url);

        if (!response.success) {
          return { success: false, error: response.error ?? 'Report not found' };
        }

        return response;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch report',
        };
      }
    },

    /**
     * Search scout reports by query.
     *
     * @param query - Search query
     * @param filter - Additional filters
     * @returns Matching scout reports
     */
    async searchReports(
      query: string,
      filter?: Partial<ScoutReportFilter>
    ): Promise<ScoutReportListResponse> {
      try {
        const url = buildUrl(SCOUT_REPORT_API_ENDPOINTS.SEARCH, {
          q: query,
          sports: filter?.sports,
          positions: filter?.positions,
          gradYears: filter?.gradYears,
          minRating: filter?.minRating,
        });

        const response = await http.get<ScoutReportListResponse>(url);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Search failed',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Search failed',
        });
      }
    },

    /**
     * Track view of a scout report.
     * Awards XP to user if first view.
     *
     * @param reportId - Report ID being viewed
     * @returns View response with XP earned
     */
    async trackView(reportId: string): Promise<ScoutReportViewResponse> {
      try {
        const url = `${baseUrl}${SCOUT_REPORT_API_ENDPOINTS.VIEW}`;
        const response = await http.post<ScoutReportViewResponse>(url, { reportId });

        if (!response.success) {
          // View tracking failures are non-critical
          return { success: false, error: response.error };
        }

        return response;
      } catch {
        // View tracking failures are non-critical, don't throw
        return { success: false, error: 'Failed to track view' };
      }
    },

    /**
     * Get summary statistics for scout reports.
     *
     * @returns Summary statistics
     */
    async getSummary(): Promise<{ success: boolean; data?: ScoutReportSummary; error?: string }> {
      try {
        const url = `${baseUrl}${SCOUT_REPORT_API_ENDPOINTS.SUMMARY}`;
        const response = await http.get<{
          success: boolean;
          data?: ScoutReportSummary;
          error?: string;
        }>(url);

        if (!response.success) {
          return { success: false, error: response.error ?? 'Failed to fetch summary' };
        }

        return response;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch summary',
        };
      }
    },
  } as const;
}
