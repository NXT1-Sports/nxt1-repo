/**
 * @fileoverview Team Profile API - Pure TypeScript
 * @module @nxt1/core/team-profile
 * @version 1.0.0
 *
 * Pure factory function for team-profile-related backend API calls.
 * 100% portable — NO platform dependencies.
 *
 * Uses the HttpAdapter pattern from @nxt1/core/api for full portability
 * across Angular (HttpClient), Capacitor (CapacitorHttp), and Node.js (fetch).
 */

import type { HttpAdapter } from '../api/http-adapter';
import type {
  TeamProfilePageData,
  TeamProfileTeam,
  TeamProfileRosterMember,
  TeamProfileScheduleEvent,
  TeamTimelineFilterId,
} from './team-profile.types';
import type { FeedItem } from '../posts/feed.types';

// ============================================
// COMMON API RESPONSE TYPES
// ============================================

export interface TeamProfileApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface TeamProfilePaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// ============================================
// REQUEST TYPES
// ============================================

export interface TeamProfileSearchParams {
  query?: string;
  sport?: string;
  state?: string;
  teamType?: string;
  page?: number;
  limit?: number;
}

export interface TeamTimelineParams {
  limit?: number;
  cursor?: string;
  filter?: TeamTimelineFilterId;
  sportId?: string;
}

export interface TeamTimelineResponse {
  items: FeedItem[];
  nextCursor?: string;
  hasMore: boolean;
  total?: number;
}

// ============================================
// TEAM PROFILE API FACTORY
// ============================================

export type TeamProfileApi = ReturnType<typeof createTeamProfileApi>;

/**
 * Create Team Profile API instance.
 *
 * @param http - Platform-agnostic HTTP adapter (Angular HttpClient, Capacitor, fetch)
 * @param baseUrl - API base URL (e.g., 'https://api.nxt1sports.com/api/v1')
 *
 * @example
 * ```typescript
 * // Angular adapter
 * const api = createTeamProfileApi(angularAdapter, environment.apiUrl);
 * const result = await api.getTeamBySlug('lincoln-football');
 *
 * // Capacitor adapter
 * const api = createTeamProfileApi(capacitorAdapter, API_URL);
 * const result = await api.getTeamBySlug('lincoln-football');
 * ```
 */
export function createTeamProfileApi(http: HttpAdapter, baseUrl: string) {
  const endpoint = `${baseUrl}/teams`;

  return {
    /**
     * Get team profile by slug.
     * Calls: GET /api/v1/teams/by-slug/:slug
     */
    async getTeamBySlug(slug: string): Promise<TeamProfileApiResponse<TeamProfilePageData>> {
      return http.get<TeamProfileApiResponse<TeamProfilePageData>>(`${endpoint}/by-slug/${slug}`);
    },

    /**
     * Get team profile by short team code (e.g. "57L791").
     * This is the canonical method when routing via /team/:slug/:teamCode.
     * Calls: GET /api/v1/teams/by-teamcode/:teamCode
     */
    async getTeamByTeamCode(
      teamCode: string
    ): Promise<TeamProfileApiResponse<TeamProfilePageData>> {
      return http.get<TeamProfileApiResponse<TeamProfilePageData>>(
        `${endpoint}/by-teamcode/${encodeURIComponent(teamCode)}`
      );
    },

    /**
     * Get team profile by Firestore document ID.
     * Use only when you have an explicit Firestore doc ID, NOT a short team code.
     * For team codes (e.g. "57L791") use getTeamByTeamCode() instead.
     * Calls: GET /api/v1/teams/by-id/:id
     */
    async getTeamById(teamId: string): Promise<TeamProfileApiResponse<TeamProfilePageData>> {
      return http.get<TeamProfileApiResponse<TeamProfilePageData>>(
        `${endpoint}/by-id/${encodeURIComponent(teamId)}`
      );
    },

    /**
     * Search teams.
     */
    async searchTeams(
      params: TeamProfileSearchParams
    ): Promise<TeamProfilePaginatedResponse<TeamProfileTeam>> {
      return http.get<TeamProfilePaginatedResponse<TeamProfileTeam>>(`${endpoint}/search`, {
        params: params as Record<string, string | number | boolean>,
      });
    },

    /**
     * Get team roster.
     */
    async getRoster(
      teamId: string,
      page: number = 1,
      limit: number = 50
    ): Promise<TeamProfilePaginatedResponse<TeamProfileRosterMember>> {
      return http.get<TeamProfilePaginatedResponse<TeamProfileRosterMember>>(
        `${endpoint}/${teamId}/roster`,
        { params: { page, limit } }
      );
    },

    /**
     * Get team schedule.
     */
    async getSchedule(
      teamId: string,
      season?: string
    ): Promise<TeamProfileApiResponse<readonly TeamProfileScheduleEvent[]>> {
      return http.get<TeamProfileApiResponse<readonly TeamProfileScheduleEvent[]>>(
        `${endpoint}/${teamId}/schedule`,
        { params: season ? { season } : undefined }
      );
    },

    /**
     * Track team page view.
     */
    async trackPageView(teamId: string, viewerId?: string): Promise<TeamProfileApiResponse<void>> {
      return http.post<TeamProfileApiResponse<void>>(`${endpoint}/${teamId}/page-view`, {
        viewerId,
      });
    },

    /**
     * Get polymorphic timeline feed for a team.
     * Calls: GET /api/v1/teams/:teamCode/timeline
     *
     * Returns FeedItem[] sorted newest-first, assembled from Posts,
     * Schedule, TeamStats, News, and Recruiting fan-out.
     */
    async getTeamTimeline(
      teamCode: string,
      params?: TeamTimelineParams
    ): Promise<TeamProfileApiResponse<TeamTimelineResponse>> {
      const queryParams: Record<string, string | number | boolean> = {};
      if (params?.limit != null) queryParams['limit'] = params.limit;
      if (params?.cursor) queryParams['cursor'] = params.cursor;
      if (params?.filter && params.filter !== 'all') queryParams['filter'] = params.filter;
      if (params?.sportId) queryParams['sportId'] = params.sportId;

      return http.get<TeamProfileApiResponse<TeamTimelineResponse>>(
        `${endpoint}/${encodeURIComponent(teamCode)}/timeline`,
        Object.keys(queryParams).length > 0 ? { params: queryParams } : undefined
      );
    },
  };
}
