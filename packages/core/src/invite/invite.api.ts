/**
 * @fileoverview Invite API Factory - Pure TypeScript
 * @module @nxt1/core/invite
 * @version 1.0.0
 *
 * Pure functions for invite API calls.
 * 100% portable - NO platform dependencies.
 * Enterprise error handling with NxtApiError factories.
 *
 * Uses HttpAdapter pattern for cross-platform compatibility.
 */

import type { HttpAdapter } from '../api/http-adapter';
import type {
  InviteStats,
  InviteAchievement,
  InviteLink,
  InviteFilter,
  InviteHistoryResponse,
  SendInviteRequest,
  SendInviteResponse,
  TeamBulkInviteRequest,
  InviteType,
} from './invite.types';
import { INVITE_API_ENDPOINTS } from './invite.constants';
import { createApiError, isNxtApiError } from '../errors';

// ============================================
// API FACTORY TYPE
// ============================================

export type InviteApi = ReturnType<typeof createInviteApi>;

// ============================================
// INVITE API FACTORY
// ============================================

/**
 * Create Invite API instance.
 *
 * @param http - Platform-specific HTTP adapter
 * @param baseUrl - Base URL for API endpoints
 * @returns Invite API methods
 *
 * @example
 * ```typescript
 * // Web (Angular)
 * const api = createInviteApi(angularHttpAdapter, environment.apiUrl);
 *
 * // Mobile (Capacitor)
 * const api = createInviteApi(capacitorHttpAdapter, API_URL);
 *
 * // Usage
 * const link = await api.generateLink('general');
 * await api.sendInvite({ type: 'team', channel: 'sms', recipients: [...] });
 * ```
 */
export function createInviteApi(http: HttpAdapter, baseUrl: string) {
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
     * Generate an invite link.
     *
     * @param type - Type of invite
     * @param teamId - Optional team ID for team invites
     * @param teamCode - Optional team code (preferred over teamId for team invites)
     * @returns Generated invite link data
     * @throws NxtApiError on failure
     */
    async generateLink(type: InviteType, teamId?: string, teamCode?: string): Promise<InviteLink> {
      try {
        const url = buildUrl(INVITE_API_ENDPOINTS.GENERATE_LINK, { type, teamId, teamCode });
        const response = await http.post<{ success: boolean; data: InviteLink; error?: string }>(
          url,
          {}
        );

        if (!response.success || !response.data) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to generate invite link',
          });
        }

        return response.data;
      } catch (error) {
        if (isNxtApiError(error)) throw error;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: 'Failed to generate invite link',
          cause: error,
        });
      }
    },

    /**
     * Send invite(s) to recipients.
     *
     * @param request - Send invite request data
     * @returns Send response with XP earned
     * @throws NxtApiError on failure
     */
    async sendInvite(request: SendInviteRequest): Promise<SendInviteResponse> {
      try {
        const url = buildUrl(INVITE_API_ENDPOINTS.SEND);
        const response = await http.post<SendInviteResponse>(url, request);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to send invite',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: 'Failed to send invite',
          cause: error,
        });
      }
    },

    /**
     * Send bulk team invites.
     *
     * @param request - Bulk invite request data
     * @returns Send response with XP earned
     * @throws NxtApiError on failure
     */
    async sendBulkInvites(request: TeamBulkInviteRequest): Promise<SendInviteResponse> {
      try {
        const url = buildUrl(INVITE_API_ENDPOINTS.SEND_BULK);
        const response = await http.post<SendInviteResponse>(url, request);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to send bulk invites',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: 'Failed to send bulk invites',
          cause: error,
        });
      }
    },

    /**
     * Get invite history with optional filters.
     *
     * @param filter - Filter and pagination options
     * @returns Paginated invite history
     * @throws NxtApiError on failure
     */
    async getHistory(filter?: InviteFilter): Promise<InviteHistoryResponse> {
      try {
        const url = buildUrl(INVITE_API_ENDPOINTS.HISTORY, {
          type: filter?.type,
          channel: filter?.channel,
          status: filter?.status,
          teamId: filter?.teamId,
          since: filter?.since,
          until: filter?.until,
          page: filter?.page,
          limit: filter?.limit,
        });

        const response = await http.get<InviteHistoryResponse>(url);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: 'Failed to fetch invite history',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: 'Failed to fetch invite history',
          cause: error,
        });
      }
    },

    /**
     * Get user's invite statistics.
     *
     * @returns User invite stats
     * @throws NxtApiError on failure
     */
    async getStats(): Promise<InviteStats> {
      try {
        const url = buildUrl(INVITE_API_ENDPOINTS.STATS);
        const response = await http.get<{ success: boolean; data: InviteStats; error?: string }>(
          url
        );

        if (!response.success || !response.data) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to fetch invite stats',
          });
        }

        return response.data;
      } catch (error) {
        if (isNxtApiError(error)) throw error;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: 'Failed to fetch invite stats',
          cause: error,
        });
      }
    },

    /**
     * Get user's invite achievements.
     *
     * @returns User achievements with progress
     * @throws NxtApiError on failure
     */
    async getAchievements(): Promise<readonly InviteAchievement[]> {
      try {
        const url = buildUrl(INVITE_API_ENDPOINTS.ACHIEVEMENTS);
        const response = await http.get<{
          success: boolean;
          data: InviteAchievement[];
          error?: string;
        }>(url);

        if (!response.success || !response.data) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to fetch achievements',
          });
        }

        return response.data;
      } catch (error) {
        if (isNxtApiError(error)) throw error;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: 'Failed to fetch achievements',
          cause: error,
        });
      }
    },

    /**
     * Accept an invite (for recipient).
     *
     * @param code - Referral/invite code
     * @param teamCode - Optional team code to join (for team invites)
     * @param role - Optional role chosen by the invitee
     * @returns Accept result
     * @throws NxtApiError on failure
     */
    async acceptInvite(
      code: string,
      teamCode?: string,
      role?: string,
      inviterUid?: string,
      isNewUser?: boolean
    ): Promise<{
      success: boolean;
      teamJoined?: string;
      joinedAsPending?: boolean;
    }> {
      try {
        const roleMap: Record<string, string> = {
          athlete: 'Athlete',
          coach: 'Coach',
          director: 'Administrative',
          // Legacy role aliases
          recruiter: 'Coach',
          parent: 'Athlete',
        };
        const normalizedRole = role ? (roleMap[role.toLowerCase()] ?? 'Athlete') : undefined;
        const url = buildUrl(INVITE_API_ENDPOINTS.ACCEPT);
        const response = await http.post<{
          success: boolean;
          teamJoined?: string;
          joinedAsPending?: boolean;
          error?: string;
        }>(url, { code, teamCode, role: normalizedRole, inviterUid, isNewUser });

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to accept invite',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;
        throw createApiError('SRV_INTERNAL_ERROR', {
          message: 'Failed to accept invite',
          cause: error,
        });
      }
    },
  } as const;
}
