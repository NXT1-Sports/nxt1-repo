/**
 * @fileoverview Analytics Dashboard API Factory
 * @module @nxt1/core/analytics-dashboard
 * @version 1.0.0
 *
 * Pure TypeScript API factory for Analytics Dashboard.
 * 100% portable - works with any HTTP adapter (Angular HttpClient, Capacitor, fetch).
 *
 * @example
 * ```typescript
 * // Angular adapter
 * const api = createAnalyticsDashboardApi(angularHttpAdapter, '/api/v1');
 *
 * // Capacitor adapter
 * const api = createAnalyticsDashboardApi(capacitorHttpAdapter, 'https://api.nxt1sports.com/v1');
 *
 * // Usage
 * const report = await api.getReport({ userId: '123', role: 'athlete', period: 'week' });
 * ```
 */

import type { HttpAdapter } from '../api/http-adapter';
import type {
  AnalyticsRequest,
  AnalyticsApiResponse,
  AnalyticsReport,
  AnalyticsPeriod,
  MetricCard,
  AnalyticsInsight,
  AnalyticsRecommendation,
  AthleteRosterAnalytics,
  VideoAnalytics,
  CollegeInterestAnalytics,
} from './analytics-dashboard.types';
import { ANALYTICS_API_ENDPOINTS } from './analytics-dashboard.constants';

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Generic API response wrapper.
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Overview response type.
 */
export interface OverviewResponse {
  metrics: MetricCard[];
  lastUpdated: string;
}

/**
 * Engagement response type.
 */
export interface EngagementResponse {
  viewsBySource: Array<{ source: string; label: string; views: number; percentage: number }>;
  viewsByTime: Array<{ period: number; label: string; count: number; intensity: number }>;
  geoDistribution: Array<{ location: string; code: string; views: number; percentage: number }>;
  viewerTypes: Array<{ type: string; label: string; count: number; percentage: number }>;
}

/**
 * Content response type.
 */
export interface ContentResponse {
  videos: VideoAnalytics[];
  topContent: MetricCard[];
  totalViews: number;
  totalWatchTime: number;
}

/**
 * Roster response type (coach only).
 */
export interface RosterResponse {
  athletes: AthleteRosterAnalytics[];
  totalAthletes: number;
  activeAthletes: number;
}

/**
 * Insights response type.
 */
export interface InsightsResponse {
  insights: AnalyticsInsight[];
  recommendations: AnalyticsRecommendation[];
  aiSummary?: string;
}

// ============================================
// API FACTORY
// ============================================

/**
 * Create Analytics Dashboard API instance.
 *
 * @param http - HTTP adapter (platform-specific)
 * @param baseUrl - API base URL
 * @returns Analytics API methods
 */
export function createAnalyticsDashboardApi(http: HttpAdapter, baseUrl: string) {
  const endpoint = (path: string) => `${baseUrl}${path}`;

  return {
    /**
     * Get complete analytics report.
     *
     * @param request - Analytics request parameters
     * @returns Full analytics report
     */
    async getReport(request: AnalyticsRequest): Promise<AnalyticsReport> {
      const response = await http.get<AnalyticsApiResponse>(
        endpoint(ANALYTICS_API_ENDPOINTS.REPORT),
        {
          params: {
            userId: request.userId,
            role: request.role,
            period: request.period,
            includeDetails: String(request.includeDetails ?? true),
            includeInsights: String(request.includeInsights ?? true),
          },
        }
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch analytics report');
      }

      return response.data;
    },

    /**
     * Get overview metrics only (faster, cached aggressively).
     *
     * @param userId - User or team code ID
     * @param role - User role
     * @param period - Time period
     * @returns Overview metric cards
     */
    async getOverview(
      userId: string,
      role: 'athlete' | 'coach',
      period: AnalyticsPeriod
    ): Promise<OverviewResponse> {
      const response = await http.get<ApiResponse<OverviewResponse>>(
        endpoint(ANALYTICS_API_ENDPOINTS.OVERVIEW),
        { params: { userId, role, period } }
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch overview metrics');
      }

      return response.data;
    },

    /**
     * Get engagement breakdown.
     *
     * @param userId - User ID
     * @param period - Time period
     * @returns Engagement analytics data
     */
    async getEngagement(userId: string, period: AnalyticsPeriod): Promise<EngagementResponse> {
      const response = await http.get<ApiResponse<EngagementResponse>>(
        endpoint(ANALYTICS_API_ENDPOINTS.ENGAGEMENT),
        { params: { userId, period } }
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch engagement data');
      }

      return response.data;
    },

    /**
     * Get content performance analytics.
     *
     * @param userId - User ID
     * @param period - Time period
     * @returns Content analytics data
     */
    async getContent(userId: string, period: AnalyticsPeriod): Promise<ContentResponse> {
      const response = await http.get<ApiResponse<ContentResponse>>(
        endpoint(ANALYTICS_API_ENDPOINTS.CONTENT),
        { params: { userId, period } }
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch content analytics');
      }

      return response.data;
    },

    /**
     * Get recruiting analytics (athlete only).
     *
     * @param userId - Athlete user ID
     * @param period - Time period
     * @returns Recruiting analytics data
     */
    async getRecruiting(
      userId: string,
      period: AnalyticsPeriod
    ): Promise<{
      collegeInterests: CollegeInterestAnalytics[];
      milestones: Array<{ type: string; label: string; achieved: boolean; achievedAt?: string }>;
      stats: { offers: number; visits: number; camps: number };
    }> {
      const response = await http.get<
        ApiResponse<{
          collegeInterests: CollegeInterestAnalytics[];
          milestones: Array<{
            type: string;
            label: string;
            achieved: boolean;
            achievedAt?: string;
          }>;
          stats: { offers: number; visits: number; camps: number };
        }>
      >(endpoint(ANALYTICS_API_ENDPOINTS.RECRUITING), { params: { userId, period } });

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch recruiting analytics');
      }

      return response.data;
    },

    /**
     * Get roster analytics (coach only).
     *
     * @param teamCodeId - Team code ID
     * @param period - Time period
     * @param sortBy - Sort field
     * @param limit - Max athletes to return
     * @returns Roster analytics data
     */
    async getRoster(
      teamCodeId: string,
      period: AnalyticsPeriod,
      sortBy: 'engagement' | 'views' | 'name' | 'classOf' = 'engagement',
      limit = 20
    ): Promise<RosterResponse> {
      const response = await http.get<ApiResponse<RosterResponse>>(
        endpoint(ANALYTICS_API_ENDPOINTS.ROSTER),
        { params: { teamCodeId, period, sortBy, limit: String(limit) } }
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch roster analytics');
      }

      return response.data;
    },

    /**
     * Get AI-generated insights and recommendations.
     *
     * @param userId - User or team code ID
     * @param role - User role
     * @param period - Time period
     * @returns AI insights and recommendations
     */
    async getInsights(
      userId: string,
      role: 'athlete' | 'coach',
      period: AnalyticsPeriod
    ): Promise<InsightsResponse> {
      const response = await http.get<ApiResponse<InsightsResponse>>(
        endpoint(ANALYTICS_API_ENDPOINTS.INSIGHTS),
        { params: { userId, role, period } }
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch insights');
      }

      return response.data;
    },

    /**
     * Export analytics report as PDF or CSV.
     *
     * @param userId - User or team code ID
     * @param role - User role
     * @param period - Time period
     * @param format - Export format
     * @returns Download URL or blob
     */
    async exportReport(
      userId: string,
      role: 'athlete' | 'coach',
      period: AnalyticsPeriod,
      format: 'pdf' | 'csv'
    ): Promise<{ downloadUrl: string; expiresAt: string }> {
      const response = await http.post<ApiResponse<{ downloadUrl: string; expiresAt: string }>>(
        endpoint(ANALYTICS_API_ENDPOINTS.EXPORT),
        {
          userId,
          role,
          period,
          format,
        }
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to export report');
      }

      return response.data;
    },
  } as const;
}

/**
 * Analytics Dashboard API type.
 */
export type AnalyticsDashboardApi = ReturnType<typeof createAnalyticsDashboardApi>;
