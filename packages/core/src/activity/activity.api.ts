/**
 * @fileoverview Activity API Factory - Pure TypeScript
 * @module @nxt1/core/activity
 * @version 1.0.0
 *
 * Pure functions for activity/notification API calls.
 * 100% portable - NO platform dependencies.
 *
 * Uses HttpAdapter pattern for cross-platform compatibility.
 */

import type { HttpAdapter } from '../api/http-adapter';
import type {
  ActivityItem,
  ActivityFilter,
  ActivityFeedResponse,
  ActivityMarkReadResponse,
  ActivitySummary,
  ActivityTabId,
} from './activity.types';
import { ACTIVITY_API_ENDPOINTS } from './activity.constants';

// ============================================
// API FACTORY TYPE
// ============================================

export type ActivityApi = ReturnType<typeof createActivityApi>;

// ============================================
// ACTIVITY API FACTORY
// ============================================

/**
 * Create Activity API instance.
 *
 * @param http - Platform-specific HTTP adapter
 * @param baseUrl - Base URL for API endpoints
 * @returns Activity API methods
 *
 * @example
 * ```typescript
 * // Web (Angular)
 * const api = createActivityApi(angularHttpAdapter, environment.apiUrl);
 *
 * // Mobile (Capacitor)
 * const api = createActivityApi(capacitorHttpAdapter, API_URL);
 *
 * // Usage
 * const feed = await api.getFeed({ tab: 'inbox', limit: 20 });
 * await api.markRead(['id1', 'id2']);
 * ```
 */
export function createActivityApi(http: HttpAdapter, baseUrl: string) {
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

  return {
    /**
     * Get activity feed with optional filters.
     *
     * @param filter - Filter and pagination options
     * @returns Paginated activity feed
     */
    async getFeed(filter?: ActivityFilter): Promise<ActivityFeedResponse> {
      const url = buildUrl(ACTIVITY_API_ENDPOINTS.FEED, {
        tab: filter?.tab,
        types: filter?.types?.join(','),
        isRead: filter?.isRead,
        priority: filter?.priority,
        since: filter?.since,
        until: filter?.until,
        page: filter?.page,
        limit: filter?.limit,
        sortBy: filter?.sortBy,
        sortOrder: filter?.sortOrder,
      });

      const response = await http.get<ActivityFeedResponse>(url);

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to fetch activity feed');
      }

      return response;
    },

    /**
     * Get a single activity item by ID.
     *
     * @param id - Activity item ID
     * @returns Activity item or null if not found
     */
    async getItem(id: string): Promise<ActivityItem | null> {
      const url = `${baseUrl}${ACTIVITY_API_ENDPOINTS.ITEM}/${id}`;
      const response = await http.get<{ success: boolean; data?: ActivityItem; error?: string }>(
        url
      );

      if (!response.success) {
        return null;
      }

      return response.data ?? null;
    },

    /**
     * Mark specific activity items as read.
     *
     * @param ids - Array of activity item IDs to mark as read
     * @returns Response with updated badge counts
     */
    async markRead(ids: string[]): Promise<ActivityMarkReadResponse> {
      const url = `${baseUrl}${ACTIVITY_API_ENDPOINTS.MARK_READ}`;
      const response = await http.post<ActivityMarkReadResponse>(url, { ids });

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to mark items as read');
      }

      return response;
    },

    /**
     * Mark all items in a tab as read.
     *
     * @param tab - Tab ID to mark all items as read
     * @returns Response with updated badge counts
     */
    async markAllRead(tab: ActivityTabId): Promise<ActivityMarkReadResponse> {
      const url = `${baseUrl}${ACTIVITY_API_ENDPOINTS.MARK_ALL_READ}`;
      const response = await http.post<ActivityMarkReadResponse>(url, { tab });

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to mark all as read');
      }

      return response;
    },

    /**
     * Get badge counts for all tabs.
     *
     * @returns Badge counts per tab
     */
    async getBadges(): Promise<Record<ActivityTabId, number>> {
      const url = `${baseUrl}${ACTIVITY_API_ENDPOINTS.BADGES}`;
      const response = await http.get<{
        success: boolean;
        badges?: Record<ActivityTabId, number>;
        error?: string;
      }>(url);

      if (!response.success || !response.badges) {
        throw new Error(response.error ?? 'Failed to fetch badges');
      }

      return response.badges;
    },

    /**
     * Get activity summary (total unread, badges, etc.).
     *
     * @returns Activity summary
     */
    async getSummary(): Promise<ActivitySummary> {
      const url = `${baseUrl}${ACTIVITY_API_ENDPOINTS.SUMMARY}`;
      const response = await http.get<{ success: boolean; data?: ActivitySummary; error?: string }>(
        url
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch activity summary');
      }

      return response.data;
    },

    /**
     * Archive activity items.
     *
     * @param ids - Array of activity item IDs to archive
     * @returns Response indicating success
     */
    async archive(ids: string[]): Promise<{ success: boolean; count: number }> {
      const url = `${baseUrl}${ACTIVITY_API_ENDPOINTS.ARCHIVE}`;
      const response = await http.post<{ success: boolean; count?: number; error?: string }>(url, {
        ids,
      });

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to archive items');
      }

      return { success: true, count: response.count ?? 0 };
    },

    /**
     * Restore archived activity items.
     *
     * @param ids - Array of activity item IDs to restore
     * @returns Response indicating success
     */
    async restore(ids: string[]): Promise<{ success: boolean; count: number }> {
      const url = `${baseUrl}${ACTIVITY_API_ENDPOINTS.ARCHIVE}/restore`;
      const response = await http.post<{ success: boolean; count?: number; error?: string }>(url, {
        ids,
      });

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to restore items');
      }

      return { success: true, count: response.count ?? 0 };
    },
  } as const;
}
