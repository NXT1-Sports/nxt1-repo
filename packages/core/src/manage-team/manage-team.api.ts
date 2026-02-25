/**
 * @fileoverview Manage Team API Factory
 * @module @nxt1/core/manage-team
 * @version 1.0.0
 *
 * Pure TypeScript API factory for Manage Team feature.
 * 100% portable - uses HttpAdapter pattern for framework independence.
 *
 * @description Creates a team management API instance that works with
 * any HTTP client implementation (Angular HttpClient, Capacitor HTTP, fetch, etc.)
 */

import type { HttpAdapter } from '../api/http-adapter';
import type {
  ManageTeamFormData,
  RosterPlayer,
  TeamScheduleEvent,
  StaffMember,
  TeamSponsor,
  TeamIntegration,
  IntegrationProvider,
} from './manage-team.types';

// ============================================
// API RESPONSE TYPE (Local definition)
// ============================================

/**
 * Standard API response wrapper.
 */
interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

// ============================================
// API FACTORY
// ============================================

/**
 * Creates a Manage Team API instance.
 *
 * @param http - HTTP adapter implementing get/post/put/delete
 * @param baseUrl - Base URL for API endpoints
 * @returns Manage Team API methods
 *
 * @example
 * ```typescript
 * // Angular adapter
 * const api = createManageTeamApi(angularHttpAdapter, environment.apiUrl);
 *
 * // Capacitor adapter
 * const api = createManageTeamApi(capacitorHttpAdapter, API_URL);
 * ```
 */
export function createManageTeamApi(http: HttpAdapter, baseUrl: string) {
  const endpoint = `${baseUrl}/teams`;

  return {
    // ============================================
    // TEAM INFO
    // ============================================

    /**
     * Get team details by ID.
     */
    async getTeam(teamId: string): Promise<ManageTeamFormData | null> {
      const response = await http.get<ApiResponse<ManageTeamFormData>>(`${endpoint}/${teamId}`);
      return response.success ? (response.data ?? null) : null;
    },

    /**
     * Update team information.
     */
    async updateTeam(
      teamId: string,
      data: Partial<ManageTeamFormData>
    ): Promise<ManageTeamFormData> {
      const response = await http.put<ApiResponse<ManageTeamFormData>>(
        `${endpoint}/${teamId}`,
        data
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to update team');
      }
      return response.data;
    },

    /**
     * Update team branding (logo, colors).
     */
    async updateBranding(
      teamId: string,
      branding: ManageTeamFormData['branding']
    ): Promise<ManageTeamFormData['branding']> {
      const response = await http.put<ApiResponse<ManageTeamFormData['branding']>>(
        `${endpoint}/${teamId}/branding`,
        branding
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to update branding');
      }
      return response.data;
    },

    // ============================================
    // ROSTER
    // ============================================

    /**
     * Get team roster.
     */
    async getRoster(teamId: string): Promise<readonly RosterPlayer[]> {
      const response = await http.get<ApiResponse<RosterPlayer[]>>(`${endpoint}/${teamId}/roster`);
      return response.success ? (response.data ?? []) : [];
    },

    /**
     * Add player to roster.
     */
    async addPlayer(teamId: string, player: Omit<RosterPlayer, 'id'>): Promise<RosterPlayer> {
      const response = await http.post<ApiResponse<RosterPlayer>>(
        `${endpoint}/${teamId}/roster`,
        player
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to add player');
      }
      return response.data;
    },

    /**
     * Update roster player.
     */
    async updatePlayer(
      teamId: string,
      playerId: string,
      data: Partial<RosterPlayer>
    ): Promise<RosterPlayer> {
      const response = await http.put<ApiResponse<RosterPlayer>>(
        `${endpoint}/${teamId}/roster/${playerId}`,
        data
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to update player');
      }
      return response.data;
    },

    /**
     * Remove player from roster.
     */
    async removePlayer(teamId: string, playerId: string): Promise<void> {
      const response = await http.delete<ApiResponse<void>>(
        `${endpoint}/${teamId}/roster/${playerId}`
      );
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to remove player');
      }
    },

    /**
     * Invite player to roster.
     */
    async invitePlayer(
      teamId: string,
      invite: { email: string; name?: string; position?: string }
    ): Promise<{ inviteId: string; status: string }> {
      const response = await http.post<ApiResponse<{ inviteId: string; status: string }>>(
        `${endpoint}/${teamId}/roster/invite`,
        invite
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to send invite');
      }
      return response.data;
    },

    // ============================================
    // SCHEDULE
    // ============================================

    /**
     * Get team schedule.
     */
    async getSchedule(teamId: string): Promise<readonly TeamScheduleEvent[]> {
      const response = await http.get<ApiResponse<TeamScheduleEvent[]>>(
        `${endpoint}/${teamId}/schedule`
      );
      return response.success ? (response.data ?? []) : [];
    },

    /**
     * Add schedule event.
     */
    async addEvent(
      teamId: string,
      event: Omit<TeamScheduleEvent, 'id'>
    ): Promise<TeamScheduleEvent> {
      const response = await http.post<ApiResponse<TeamScheduleEvent>>(
        `${endpoint}/${teamId}/schedule`,
        event
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to add event');
      }
      return response.data;
    },

    /**
     * Update schedule event.
     */
    async updateEvent(
      teamId: string,
      eventId: string,
      data: Partial<TeamScheduleEvent>
    ): Promise<TeamScheduleEvent> {
      const response = await http.put<ApiResponse<TeamScheduleEvent>>(
        `${endpoint}/${teamId}/schedule/${eventId}`,
        data
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to update event');
      }
      return response.data;
    },

    /**
     * Remove schedule event.
     */
    async removeEvent(teamId: string, eventId: string): Promise<void> {
      const response = await http.delete<ApiResponse<void>>(
        `${endpoint}/${teamId}/schedule/${eventId}`
      );
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to remove event');
      }
    },

    // ============================================
    // STAFF
    // ============================================

    /**
     * Get team staff.
     */
    async getStaff(teamId: string): Promise<readonly StaffMember[]> {
      const response = await http.get<ApiResponse<StaffMember[]>>(`${endpoint}/${teamId}/staff`);
      return response.success ? (response.data ?? []) : [];
    },

    /**
     * Add staff member.
     */
    async addStaffMember(teamId: string, staff: Omit<StaffMember, 'id'>): Promise<StaffMember> {
      const response = await http.post<ApiResponse<StaffMember>>(
        `${endpoint}/${teamId}/staff`,
        staff
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to add staff member');
      }
      return response.data;
    },

    /**
     * Update staff member.
     */
    async updateStaffMember(
      teamId: string,
      staffId: string,
      data: Partial<StaffMember>
    ): Promise<StaffMember> {
      const response = await http.put<ApiResponse<StaffMember>>(
        `${endpoint}/${teamId}/staff/${staffId}`,
        data
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to update staff member');
      }
      return response.data;
    },

    /**
     * Remove staff member.
     */
    async removeStaffMember(teamId: string, staffId: string): Promise<void> {
      const response = await http.delete<ApiResponse<void>>(
        `${endpoint}/${teamId}/staff/${staffId}`
      );
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to remove staff member');
      }
    },

    // ============================================
    // SPONSORS
    // ============================================

    /**
     * Get team sponsors.
     */
    async getSponsors(teamId: string): Promise<readonly TeamSponsor[]> {
      const response = await http.get<ApiResponse<TeamSponsor[]>>(`${endpoint}/${teamId}/sponsors`);
      return response.success ? (response.data ?? []) : [];
    },

    /**
     * Add sponsor.
     */
    async addSponsor(teamId: string, sponsor: Omit<TeamSponsor, 'id'>): Promise<TeamSponsor> {
      const response = await http.post<ApiResponse<TeamSponsor>>(
        `${endpoint}/${teamId}/sponsors`,
        sponsor
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to add sponsor');
      }
      return response.data;
    },

    /**
     * Update sponsor.
     */
    async updateSponsor(
      teamId: string,
      sponsorId: string,
      data: Partial<TeamSponsor>
    ): Promise<TeamSponsor> {
      const response = await http.put<ApiResponse<TeamSponsor>>(
        `${endpoint}/${teamId}/sponsors/${sponsorId}`,
        data
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to update sponsor');
      }
      return response.data;
    },

    /**
     * Remove sponsor.
     */
    async removeSponsor(teamId: string, sponsorId: string): Promise<void> {
      const response = await http.delete<ApiResponse<void>>(
        `${endpoint}/${teamId}/sponsors/${sponsorId}`
      );
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to remove sponsor');
      }
    },

    // ============================================
    // INTEGRATIONS
    // ============================================

    /**
     * Get team integrations.
     */
    async getIntegrations(teamId: string): Promise<readonly TeamIntegration[]> {
      const response = await http.get<ApiResponse<TeamIntegration[]>>(
        `${endpoint}/${teamId}/integrations`
      );
      return response.success ? (response.data ?? []) : [];
    },

    /**
     * Connect integration.
     */
    async connectIntegration(
      teamId: string,
      provider: IntegrationProvider,
      config: { url: string; autoSync?: boolean }
    ): Promise<TeamIntegration> {
      const response = await http.post<ApiResponse<TeamIntegration>>(
        `${endpoint}/${teamId}/integrations`,
        { provider, ...config }
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to connect integration');
      }
      return response.data;
    },

    /**
     * Sync integration data.
     */
    async syncIntegration(
      teamId: string,
      integrationId: string
    ): Promise<{ status: string; lastSync: string }> {
      const response = await http.post<ApiResponse<{ status: string; lastSync: string }>>(
        `${endpoint}/${teamId}/integrations/${integrationId}/sync`,
        {}
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to sync integration');
      }
      return response.data;
    },

    /**
     * Disconnect integration.
     */
    async disconnectIntegration(teamId: string, integrationId: string): Promise<void> {
      const response = await http.delete<ApiResponse<void>>(
        `${endpoint}/${teamId}/integrations/${integrationId}`
      );
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to disconnect integration');
      }
    },
  } as const;
}

/**
 * Type for the Manage Team API.
 */
export type ManageTeamApi = ReturnType<typeof createManageTeamApi>;
