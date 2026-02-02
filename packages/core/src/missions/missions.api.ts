/**
 * @fileoverview Missions API Factory - Pure TypeScript
 * @module @nxt1/core/missions
 * @version 1.0.0
 *
 * Pure functions for missions API calls.
 * 100% portable - NO platform dependencies.
 * Enterprise error handling with NxtApiError factories.
 *
 * Uses HttpAdapter pattern for cross-platform compatibility.
 */

import type { HttpAdapter } from '../api/http-adapter';
import type {
  Mission,
  MissionProgress,
  MissionCategoryConfig,
  MissionsResponse,
  MissionCompleteResponse,
  MissionFilter,
} from './missions.types';
import { MISSIONS_API_ENDPOINTS } from './missions.constants';
import { createApiError, isNxtApiError } from '../errors';

// ============================================
// API FACTORY TYPE
// ============================================

export type MissionsApi = ReturnType<typeof createMissionsApi>;

// ============================================
// MISSIONS API FACTORY
// ============================================

/**
 * Create Missions API instance.
 *
 * @param http - Platform-specific HTTP adapter
 * @param baseUrl - Base URL for API endpoints
 * @returns Missions API methods
 *
 * @example
 * ```typescript
 * // Web (Angular)
 * const api = createMissionsApi(angularHttpAdapter, environment.apiUrl);
 *
 * // Mobile (Capacitor)
 * const api = createMissionsApi(capacitorHttpAdapter, API_URL);
 *
 * // Usage
 * const { missions, progress } = await api.getMissions();
 * await api.completeMission('mission-id');
 * ```
 */
export function createMissionsApi(http: HttpAdapter, baseUrl: string) {
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
     * Get all missions for the current user.
     *
     * @param filter - Optional filter options
     * @returns Missions with progress and categories
     * @throws NxtApiError on failure
     */
    async getMissions(filter?: MissionFilter): Promise<{
      missions: readonly Mission[];
      progress: MissionProgress;
      categories: readonly MissionCategoryConfig[];
    }> {
      try {
        // Handle status array properly
        const statusValue = filter?.status
          ? Array.isArray(filter.status)
            ? (filter.status as readonly string[]).join(',')
            : String(filter.status)
          : undefined;

        const url = buildUrl(MISSIONS_API_ENDPOINTS.MISSIONS, {
          category: filter?.category,
          status: statusValue,
          priority: filter?.priority,
          featured: filter?.featured,
          search: filter?.search,
        });

        const response = await http.get<MissionsResponse>(url);

        if (!response.success || !response.data) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to fetch missions',
          });
        }

        return response.data;
      } catch (error) {
        if (isNxtApiError(error)) throw error;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Failed to fetch missions',
          cause: error,
        });
      }
    },

    /**
     * Get user's mission progress.
     *
     * @returns User progress data
     * @throws NxtApiError on failure
     */
    async getProgress(): Promise<MissionProgress> {
      try {
        const response = await http.get<{
          success: boolean;
          data?: MissionProgress;
          error?: string;
        }>(buildUrl(MISSIONS_API_ENDPOINTS.PROGRESS));

        if (!response.success || !response.data) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to fetch progress',
          });
        }

        return response.data;
      } catch (error) {
        if (isNxtApiError(error)) throw error;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Failed to fetch progress',
          cause: error,
        });
      }
    },

    /**
     * Complete a mission.
     *
     * @param missionId - Mission ID to complete
     * @returns Completion response with rewards
     * @throws NxtApiError on failure
     */
    async completeMission(missionId: string): Promise<MissionCompleteResponse['data']> {
      try {
        const url = MISSIONS_API_ENDPOINTS.COMPLETE.replace(':id', missionId);
        const response = await http.post<MissionCompleteResponse>(buildUrl(url), {});

        if (!response.success || !response.data) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to complete mission',
          });
        }

        return response.data;
      } catch (error) {
        if (isNxtApiError(error)) throw error;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Failed to complete mission',
          cause: error,
        });
      }
    },

    /**
     * Get a specific mission by ID.
     *
     * @param missionId - Mission ID
     * @returns Mission or null if not found
     */
    async getMissionById(missionId: string): Promise<Mission | null> {
      try {
        const url = `${MISSIONS_API_ENDPOINTS.MISSIONS}/${missionId}`;
        const response = await http.get<{
          success: boolean;
          data?: Mission;
          error?: string;
        }>(buildUrl(url));

        return response.success && response.data ? response.data : null;
      } catch {
        return null;
      }
    },

    /**
     * Get earned badges.
     *
     * @returns Array of earned badges
     */
    async getBadges(): Promise<MissionProgress['badges']> {
      try {
        const response = await http.get<{
          success: boolean;
          data?: MissionProgress['badges'];
          error?: string;
        }>(buildUrl(MISSIONS_API_ENDPOINTS.BADGES));

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to fetch badges',
          });
        }

        return response.data ?? [];
      } catch (error) {
        if (isNxtApiError(error)) throw error;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Failed to fetch badges',
          cause: error,
        });
      }
    },
  } as const;
}
