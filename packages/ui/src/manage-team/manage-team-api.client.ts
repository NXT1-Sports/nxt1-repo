/**
 * @fileoverview Manage Team API Client
 * @module @nxt1/ui/manage-team/api
 *
 * HTTP client for manage team endpoints.
 * Fetches team data from the existing team profile endpoint
 * and maps it to ManageTeamFormData for the editing UI.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import type {
  ConnectedSource,
  TeamProfilePageData,
  TeamProfileRosterMember,
  TeamProfileStaffMember,
  TeamProfileScheduleEvent,
  TeamProfileSponsor,
} from '@nxt1/core';
import type {
  ManageTeamFormData,
  MembershipEditorItem,
  MembershipEditorListResponse,
  UpdateMembershipRequest,
  RosterPlayer,
  StaffMember,
  StaffRole,
  TeamScheduleEvent,
  TeamSponsor,
  TeamCompletionData,
  TeamSectionCompletion,
} from '@nxt1/core';
import { Injectable, inject, InjectionToken } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NxtLoggingService } from '../services/logging/logging.service';

// ============================================
// INJECTION TOKENS
// ============================================

/**
 * Injection token for Manage Team API base URL.
 * Re-uses the same base URL pattern as TeamProfileApiClient.
 */
export const MANAGE_TEAM_API_BASE_URL = new InjectionToken<string>('MANAGE_TEAM_API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api/v1',
});

// ============================================
// TYPES
// ============================================

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    cached?: boolean;
    timestamp?: string;
  };
  error?: string;
}

// ============================================
// SERVICE
// ============================================

@Injectable({ providedIn: 'root' })
export class ManageTeamApiClient {
  private readonly http = inject(HttpClient);
  private readonly logger = inject(NxtLoggingService).child('ManageTeamApiClient');
  private readonly baseUrl = inject(MANAGE_TEAM_API_BASE_URL);

  /**
   * Fetch team data by ID and map to ManageTeamFormData.
   * Uses the existing /teams/by-id/:id endpoint.
   */
  async getTeamForEditing(teamId: string): Promise<{
    formData: ManageTeamFormData;
    completion: TeamCompletionData;
    connectedSources: readonly ConnectedSource[];
  }> {
    if (!teamId) {
      throw new Error('Team ID is required');
    }

    this.logger.info('Fetching team for editing', { teamId });

    try {
      const url = `${this.baseUrl}/teams/by-id/${encodeURIComponent(teamId)}`;
      const response = await firstValueFrom(this.http.get<ApiResponse<TeamProfilePageData>>(url));

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch team data');
      }

      const pageData = response.data;
      const formData = this.mapToFormData(pageData);
      const completion = this.calculateCompletion(formData);
      const connectedSources = pageData.team.connectedSources ?? [];

      this.logger.info('Team data mapped for editing', {
        teamId,
        rosterCount: formData.roster.length,
        scheduleCount: formData.schedule.length,
        staffCount: formData.staff.length,
        sponsorCount: formData.sponsors.length,
        connectedSourcesCount: connectedSources.length,
      });

      return { formData, completion, connectedSources };
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        const message =
          error.status === 404
            ? 'Team not found'
            : error.status === 403
              ? 'You do not have permission to manage this team'
              : `Failed to fetch team: ${error.statusText}`;
        this.logger.error('HTTP error fetching team', error, { teamId, status: error.status });
        const wrappedError = new Error(message);
        Object.defineProperty(wrappedError, 'cause', {
          value: error,
          configurable: true,
          enumerable: false,
        });
        throw wrappedError;
      }
      throw error;
    }
  }

  /**
   * Fetch the current user's teams.
   * GET /api/v1/teams/user/my-teams
   */
  async getUserTeams(): Promise<
    Array<{ id: string; teamName: string; sport: string; slug?: string }>
  > {
    const url = `${this.baseUrl}/teams/user/my-teams`;
    const response = await firstValueFrom(
      this.http.get<
        ApiResponse<{
          teams: Array<{ id: string; teamName: string; sport: string; slug?: string }>;
        }>
      >(url)
    );
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to fetch user teams');
    }
    return response.data.teams;
  }

  /**
   * Update basic team info.
   * PATCH /api/v1/teams/:id
   */
  async updateTeamBasicInfo(
    teamId: string,
    data: {
      teamName?: string;
      teamType?: string;
      sportName?: string;
      division?: string;
      conference?: string;
      mascot?: string;
      email?: string;
      phone?: string;
      website?: string;
      address?: string;
      city?: string;
      state?: string;
      wins?: number;
      losses?: number;
      ties?: number;
      season?: string;
      organizationLogoUrl?: string;
      logoUrl?: string;
      galleryImages?: readonly string[];
      connectedSources?: readonly ConnectedSource[];
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
    }
  ): Promise<void> {
    if (!teamId) {
      throw new Error('Team ID is required');
    }
    const url = `${this.baseUrl}/teams/${encodeURIComponent(teamId)}`;
    const response = await firstValueFrom(this.http.patch<ApiResponse<unknown>>(url, data));
    if (!response.success) {
      throw new Error(response.error || 'Failed to update team');
    }
  }

  /**
   * List all members in normalized MembershipEditorItem format.
   * GET /api/v1/teams/:teamId/membership
   */
  async loadMembership(teamId: string): Promise<MembershipEditorListResponse> {
    const url = `${this.baseUrl}/teams/${encodeURIComponent(teamId)}/membership`;
    const response = await firstValueFrom(
      this.http.get<ApiResponse<MembershipEditorListResponse>>(url)
    );
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to load membership');
    }
    return response.data;
  }

  /**
   * Edit a membership entry (role, title, jersey, positions, status).
   * PATCH /api/v1/teams/:teamId/membership/:entryId
   */
  async updateMembership(
    teamId: string,
    entryId: string,
    data: UpdateMembershipRequest
  ): Promise<MembershipEditorItem> {
    const url = `${this.baseUrl}/teams/${encodeURIComponent(teamId)}/membership/${encodeURIComponent(entryId)}`;
    const response = await firstValueFrom(
      this.http.patch<ApiResponse<MembershipEditorItem>>(url, data)
    );
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to update membership');
    }
    return response.data;
  }

  /**
   * Remove a member from the team (soft delete).
   * DELETE /api/v1/teams/:teamId/membership/:entryId
   */
  async removeMembership(teamId: string, entryId: string): Promise<void> {
    const url = `${this.baseUrl}/teams/${encodeURIComponent(teamId)}/membership/${encodeURIComponent(entryId)}`;
    const response = await firstValueFrom(this.http.delete<ApiResponse<unknown>>(url));
    if (!response.success) {
      throw new Error(response.error || 'Failed to remove membership');
    }
  }

  /**
   * Approve a pending membership entry.
   * POST /api/v1/teams/:teamId/membership/:entryId/approve
   */
  async approveMembership(teamId: string, entryId: string): Promise<MembershipEditorItem> {
    const url = `${this.baseUrl}/teams/${encodeURIComponent(teamId)}/membership/${encodeURIComponent(entryId)}/approve`;
    const response = await firstValueFrom(
      this.http.post<ApiResponse<MembershipEditorItem>>(url, {})
    );
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to approve membership');
    }
    return response.data;
  }

  // ============================================
  // MAPPING: TeamProfilePageData → ManageTeamFormData
  // ============================================

  private mapToFormData(pageData: TeamProfilePageData): ManageTeamFormData {
    const team = pageData.team;

    return {
      basicInfo: {
        name: team.teamName ?? '',
        mascot: team.branding?.mascot,
        abbreviation: undefined,
        sport: team.sport ?? '',
        level: (team.teamType as ManageTeamFormData['basicInfo']['level']) ?? 'varsity',
        division: team.division,
        conference: team.conference,
        gender: 'coed',
        season: team.record?.season,
      },
      branding: {
        logo: team.logoUrl,
        galleryImages: team.galleryImages,
        primaryColor: team.branding?.primaryColor ?? '#ccff00',
        secondaryColor: team.branding?.secondaryColor ?? '#000000',
      },
      contact: {
        email: team.contact?.email,
        phone: team.contact?.phone,
        website: team.contact?.website,
        address: team.contact?.address,
        city: team.city,
        state: team.state,
      },
      record: {
        wins: team.record?.wins ?? 0,
        losses: team.record?.losses ?? 0,
        ties: team.record?.ties,
      },
      roster: this.mapRoster(pageData.roster ?? []),
      schedule: this.mapSchedule(pageData.schedule ?? []),
      staff: this.mapStaff(pageData.staff ?? []),
      sponsors: this.mapSponsors(team.sponsors ?? []),
    };
  }

  private mapRoster(members: readonly TeamProfileRosterMember[]): readonly RosterPlayer[] {
    return members
      .filter((m) => m.role === 'athlete')
      .map((m) => ({
        id: m.id,
        firstName: m.firstName ?? '',
        lastName: m.lastName ?? '',
        displayName: m.displayName,
        number: m.jerseyNumber,
        position: m.position ?? '',
        classYear: m.classYear,
        height: m.height,
        weight: m.weight,
        profileImgs: m.profileImg ? [m.profileImg] : undefined,
        profileId: m.unicode ?? m.profileCode,
        isVerified: m.isVerified,
        status: 'active' as const,
        joinedAt: m.joinedAt,
      }));
  }

  private mapSchedule(events: readonly TeamProfileScheduleEvent[]): readonly TeamScheduleEvent[] {
    return events.map((e) => ({
      id: e.id,
      type: this.mapScheduleEventType(e.type),
      title: e.name,
      opponent: e.opponent,
      opponentLogo: e.opponentLogoUrl,
      date: e.date,
      time: e.time,
      location: e.location ?? '',
      isHome: e.isHome ?? false,
      result: e.result
        ? {
            teamScore: e.result.teamScore,
            opponentScore: e.result.opponentScore,
            outcome: e.result.outcome,
            isOvertime: e.result.overtime,
          }
        : undefined,
      status: this.mapScheduleStatus(e.status),
    }));
  }

  private mapScheduleEventType(type: TeamProfileScheduleEvent['type']): TeamScheduleEvent['type'] {
    const typeMap: Record<string, TeamScheduleEvent['type']> = {
      game: 'game',
      scrimmage: 'scrimmage',
      practice: 'practice',
      camp: 'game',
      combine: 'game',
      showcase: 'game',
      other: 'game',
    };
    return typeMap[type] ?? 'game';
  }

  private mapScheduleStatus(
    status: TeamProfileScheduleEvent['status']
  ): TeamScheduleEvent['status'] {
    const statusMap: Record<string, TeamScheduleEvent['status']> = {
      upcoming: 'scheduled',
      live: 'confirmed',
      final: 'completed',
      postponed: 'postponed',
      cancelled: 'cancelled',
    };
    return statusMap[status] ?? 'scheduled';
  }

  private mapStaffRole(role: string): StaffRole {
    const validRoles: StaffRole[] = [
      'head-coach',
      'assistant-coach',
      'coordinator',
      'position-coach',
      'trainer',
      'manager',
      'statistician',
      'volunteer',
      'administrator',
      'other',
    ];
    return validRoles.includes(role as StaffRole) ? (role as StaffRole) : 'other';
  }

  private mapStaff(members: readonly TeamProfileStaffMember[]): readonly StaffMember[] {
    return members.map(
      (m): StaffMember => ({
        id: m.id,
        firstName: m.firstName ?? '',
        lastName: m.lastName ?? '',
        displayName: undefined,
        role: this.mapStaffRole(m.role),
        title: m.title,
        email: m.email,
        phone: m.phone,
        profileImgs: m.profileImg ? [m.profileImg] : undefined,
        profileId: m.profileCode,
        bio: m.bio,
        isHead: m.role === 'head-coach',
        status: 'active' as const,
      })
    );
  }

  private mapSponsors(sponsors: readonly TeamProfileSponsor[]): readonly TeamSponsor[] {
    return sponsors.map((s, index) => ({
      id: `sponsor-${index}`,
      name: s.name ?? '',
      logo: s.logoUrl,
      tier: this.mapSponsorTier(s.tier),
      website: s.url,
      status: 'active' as const,
    }));
  }

  private mapSponsorTier(tier?: string): TeamSponsor['tier'] {
    const tierMap: Record<string, TeamSponsor['tier']> = {
      title: 'platinum',
      gold: 'gold',
      silver: 'silver',
      bronze: 'bronze',
      partner: 'partner',
    };
    return tierMap[tier ?? ''] ?? 'supporter';
  }

  // ============================================
  // COMPLETION CALCULATION
  // ============================================

  private calculateCompletion(formData: ManageTeamFormData): TeamCompletionData {
    const sections: TeamSectionCompletion[] = [
      {
        sectionId: 'team-info',
        percentage: this.calcInfoCompletion(formData),
        isComplete: this.calcInfoCompletion(formData) >= 100,
        fieldsCompleted: this.countInfoFields(formData),
        fieldsTotal: 4,
      },
      {
        sectionId: 'roster',
        percentage: formData.roster.length > 0 ? 100 : 0,
        isComplete: formData.roster.length > 0,
        fieldsCompleted: formData.roster.length > 0 ? 1 : 0,
        fieldsTotal: 1,
      },
      {
        sectionId: 'schedule',
        percentage: formData.schedule.length > 0 ? 100 : 0,
        isComplete: formData.schedule.length > 0,
        fieldsCompleted: formData.schedule.length > 0 ? 1 : 0,
        fieldsTotal: 1,
      },
      {
        sectionId: 'stats',
        percentage: formData.record.wins > 0 || formData.record.losses > 0 ? 100 : 0,
        isComplete: formData.record.wins > 0 || formData.record.losses > 0,
        fieldsCompleted: formData.record.wins > 0 || formData.record.losses > 0 ? 1 : 0,
        fieldsTotal: 1,
      },
      {
        sectionId: 'staff',
        percentage: formData.staff.length > 0 ? 100 : 0,
        isComplete: formData.staff.length > 0,
        fieldsCompleted: formData.staff.length > 0 ? 1 : 0,
        fieldsTotal: 1,
      },
      {
        sectionId: 'sponsors',
        percentage: formData.sponsors.length > 0 ? 100 : 0,
        isComplete: formData.sponsors.length > 0,
        fieldsCompleted: formData.sponsors.length > 0 ? 1 : 0,
        fieldsTotal: 1,
      },
    ];

    const completedCount = sections.filter((s) => s.isComplete).length;
    const totalPercent = Math.round(
      sections.reduce((sum, s) => sum + s.percentage, 0) / sections.length
    );

    return {
      percentage: totalPercent,
      sectionsComplete: completedCount,
      sectionsTotal: sections.length,
      sections,
    };
  }

  private countInfoFields(formData: ManageTeamFormData): number {
    let filled = 0;
    if (formData.basicInfo.name) filled++;
    if (formData.basicInfo.sport) filled++;
    if (formData.branding.logo) filled++;
    if (formData.contact.email || formData.contact.phone) filled++;
    return filled;
  }

  private calcInfoCompletion(formData: ManageTeamFormData): number {
    let filled = 0;
    const total = 4; // name, sport, logo, contact
    if (formData.basicInfo.name) filled++;
    if (formData.basicInfo.sport) filled++;
    if (formData.branding.logo) filled++;
    if (formData.contact.email || formData.contact.phone) filled++;
    return Math.round((filled / total) * 100);
  }
}
