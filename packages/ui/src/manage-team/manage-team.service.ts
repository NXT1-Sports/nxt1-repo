/**
 * @fileoverview Manage Team Service - Shared State Management
 * @module @nxt1/ui/manage-team
 * @version 1.0.0
 *
 * Signal-based state management for Manage Team feature.
 * Shared between web and mobile applications.
 *
 * Features:
 * - Reactive state with Angular signals
 * - Tab-based navigation
 * - Section-based form management
 * - Team completion tracking
 * - Dirty state tracking
 * - Validation management
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import type {
  ManageTeamSectionId,
  ManageTeamTabId,
  ManageTeamSection,
  ManageTeamFormData,
  TeamCompletionData,
  ManageTeamFieldChangeEvent,
  RosterPlayer,
  TeamSponsor,
} from '@nxt1/core';
import { MANAGE_TEAM_TABS } from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';

// ⚠️ TEMPORARY: Mock data for development (remove when backend is ready)
import {
  MOCK_MANAGE_TEAM_FORM_DATA,
  MOCK_TEAM_COMPLETION,
  MOCK_MANAGE_TEAM_SECTIONS,
} from './manage-team.mock-data';

/**
 * Manage Team state management service.
 * Provides reactive state for the team management interface.
 */
@Injectable({ providedIn: 'root' })
export class ManageTeamService {
  // ⚠️ TEMPORARY: API service commented out - using mock data
  // private readonly api = inject(ManageTeamApiService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ManageTeamService');

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _formData = signal<ManageTeamFormData | null>(null);
  private readonly _completion = signal<TeamCompletionData | null>(null);
  private readonly _sections = signal<ManageTeamSection[]>([]);
  private readonly _activeTab = signal<ManageTeamTabId>('overview');
  private readonly _expandedSection = signal<ManageTeamSectionId | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _isSaving = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _dirtyFields = signal<Set<string>>(new Set());
  private readonly _validationErrors = signal<Record<string, string>>({});
  private readonly _teamId = signal<string | null>(null);

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** Current form data */
  readonly formData = computed(() => this._formData());

  /** Team completion data */
  readonly completion = computed(() => this._completion());

  /** Manage team sections with fields */
  readonly sections = computed(() => this._sections());

  /** Currently active tab */
  readonly activeTab = computed(() => this._activeTab());

  /** Currently expanded section ID */
  readonly expandedSection = computed(() => this._expandedSection());

  /** Whether loading team data */
  readonly isLoading = computed(() => this._isLoading());

  /** Whether saving changes */
  readonly isSaving = computed(() => this._isSaving());

  /** Current error message */
  readonly error = computed(() => this._error());

  /** Dirty fields set */
  readonly dirtyFields = computed(() => this._dirtyFields());

  /** Validation errors by field */
  readonly validationErrors = computed(() => this._validationErrors());

  /** Whether there are unsaved changes */
  readonly hasUnsavedChanges = computed(() => this._dirtyFields().size > 0);

  /** Current team ID */
  readonly teamId = computed(() => this._teamId());

  /** Available tabs */
  readonly tabs = MANAGE_TEAM_TABS;

  // ============================================
  // DERIVED COMPUTEDS - TEAM INFO
  // ============================================

  /** Team name */
  readonly teamName = computed(() => this._formData()?.basicInfo?.name ?? '');

  /** Team logo */
  readonly teamLogo = computed(() => this._formData()?.branding?.logo ?? null);

  /** Team colors */
  readonly teamColors = computed(() => ({
    primary: this._formData()?.branding?.primaryColor ?? '#ccff00',
    secondary: this._formData()?.branding?.secondaryColor ?? '#000000',
    accent: this._formData()?.branding?.accentColor ?? null,
  }));

  /** Team record */
  readonly teamRecord = computed(() => this._formData()?.record ?? { wins: 0, losses: 0 });

  /** Record string (e.g., "8-2") */
  readonly recordString = computed(() => {
    const record = this.teamRecord();
    const ties = record.ties ? `-${record.ties}` : '';
    return `${record.wins}-${record.losses}${ties}`;
  });

  // ============================================
  // DERIVED COMPUTEDS - ROSTER
  // ============================================

  /** Roster players */
  readonly roster = computed(() => this._formData()?.roster ?? []);

  /** Active roster count */
  readonly activeRosterCount = computed(
    () => this.roster().filter((p) => p.status === 'active').length
  );

  /** Roster by position */
  readonly rosterByPosition = computed(() => {
    const players = this.roster();
    const grouped = new Map<string, RosterPlayer[]>();
    for (const player of players) {
      const position = player.position;
      if (!grouped.has(position)) grouped.set(position, []);
      grouped.get(position)!.push(player);
    }
    return grouped;
  });

  // ============================================
  // DERIVED COMPUTEDS - SCHEDULE
  // ============================================

  /** Schedule events */
  readonly schedule = computed(() => this._formData()?.schedule ?? []);

  /** Upcoming games */
  readonly upcomingGames = computed(() =>
    this.schedule()
      .filter((e) => e.status === 'scheduled' || e.status === 'confirmed')
      .slice(0, 5)
  );

  /** Recent results */
  readonly recentResults = computed(() =>
    this.schedule()
      .filter((e) => e.status === 'completed' && e.result)
      .slice(-5)
      .reverse()
  );

  // ============================================
  // DERIVED COMPUTEDS - STAFF & SPONSORS
  // ============================================

  /** Staff members */
  readonly staff = computed(() => this._formData()?.staff ?? []);

  /** Head coach */
  readonly headCoach = computed(() => this.staff().find((s) => s.role === 'head-coach'));

  /** Sponsors */
  readonly sponsors = computed(() => this._formData()?.sponsors ?? []);

  /** Active sponsors by tier */
  readonly sponsorsByTier = computed(() => {
    const sponsors = this.sponsors().filter((s) => s.status === 'active');
    const grouped = new Map<string, TeamSponsor[]>();
    for (const sponsor of sponsors) {
      if (!grouped.has(sponsor.tier)) grouped.set(sponsor.tier, []);
      grouped.get(sponsor.tier)!.push(sponsor);
    }
    return grouped;
  });

  // ============================================
  // DERIVED COMPUTEDS - INTEGRATIONS
  // ============================================

  /** Integrations */
  readonly integrations = computed(() => this._formData()?.integrations ?? []);

  /** Connected integrations */
  readonly connectedIntegrations = computed(() =>
    this.integrations().filter((i) => i.status === 'connected')
  );

  // ============================================
  // DERIVED COMPUTEDS - COMPLETION
  // ============================================

  /** Completion percentage */
  readonly completionPercent = computed(() => this._completion()?.percentage ?? 0);

  /** Completed sections */
  readonly completedSections = computed(
    () => this._completion()?.sections.filter((s) => s.isComplete) ?? []
  );

  // ============================================
  // ACTIONS - LOADING
  // ============================================

  /**
   * Load team data by ID.
   */
  async loadTeam(teamId: string): Promise<void> {
    this.logger.info('Loading team', { teamId });
    this._isLoading.set(true);
    this._error.set(null);
    this._teamId.set(teamId);

    try {
      // ⚠️ TEMPORARY: Using mock data (replace with API call)
      await this.simulateNetworkDelay(800);
      this._formData.set(MOCK_MANAGE_TEAM_FORM_DATA);
      this._completion.set(MOCK_TEAM_COMPLETION);
      this._sections.set([...MOCK_MANAGE_TEAM_SECTIONS] as ManageTeamSection[]);
      this._dirtyFields.set(new Set());

      this.logger.info('Team loaded successfully', { teamId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load team';
      this._error.set(message);
      this.logger.error('Failed to load team', { teamId, error: err });
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Load current user's team (default team).
   */
  async loadCurrentUserTeam(): Promise<void> {
    this.logger.info('Loading current user team');
    // ⚠️ TEMPORARY: For now, load mock data with a default team ID
    // In production, this would fetch the user's default team from the API
    await this.loadTeam('current-user-team');
  }

  /**
   * Refresh team data.
   */
  async refreshTeam(): Promise<void> {
    const teamId = this._teamId();
    if (teamId) {
      await this.loadTeam(teamId);
    }
  }

  // ============================================
  // ACTIONS - NAVIGATION
  // ============================================

  /**
   * Set active tab.
   */
  setActiveTab(tabId: ManageTeamTabId): void {
    this._activeTab.set(tabId);
    this.haptics.impact('light');
  }

  /**
   * Toggle section expansion.
   */
  toggleSection(sectionId: ManageTeamSectionId): void {
    const current = this._expandedSection();
    this._expandedSection.set(current === sectionId ? null : sectionId);
    this.haptics.impact('light');
  }

  /**
   * Expand specific section.
   */
  expandSection(sectionId: ManageTeamSectionId): void {
    this._expandedSection.set(sectionId);
  }

  /**
   * Collapse all sections.
   */
  collapseAllSections(): void {
    this._expandedSection.set(null);
  }

  // ============================================
  // ACTIONS - FIELD UPDATES
  // ============================================

  /**
   * Update a field value.
   */
  updateField(event: ManageTeamFieldChangeEvent): void {
    const { sectionId, fieldId } = event;
    this.logger.debug('Field updated', { sectionId, fieldId });

    // Mark field as dirty
    this._dirtyFields.update((fields) => {
      const newFields = new Set(fields);
      newFields.add(`${sectionId}.${fieldId}`);
      return newFields;
    });

    // Update form data based on section
    this._formData.update((data) => {
      if (!data) return data;

      // Deep clone and update (simplified - real impl would be more sophisticated)
      return { ...data };
    });

    this.haptics.impact('light');
  }

  // ============================================
  // ACTIONS - SAVING
  // ============================================

  /**
   * Save team changes.
   */
  async saveChanges(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) return true;

    this.logger.info('Saving team changes');
    this._isSaving.set(true);
    this._error.set(null);

    try {
      // ⚠️ TEMPORARY: Simulate save (replace with API call)
      await this.simulateNetworkDelay(1000);

      // Clear dirty state
      this._dirtyFields.set(new Set());

      this.haptics.notification('success');
      this.toast.success('Team saved successfully');
      this.logger.info('Team saved successfully');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save team';
      this._error.set(message);
      this.toast.error(message);
      this.haptics.notification('error');
      this.logger.error('Failed to save team', { error: err });
      return false;
    } finally {
      this._isSaving.set(false);
    }
  }

  /**
   * Discard unsaved changes.
   */
  async discardChanges(): Promise<void> {
    this._dirtyFields.set(new Set());
    const teamId = this._teamId();
    if (teamId) {
      await this.loadTeam(teamId);
    }
    this.haptics.impact('medium');
  }

  // ============================================
  // ACTIONS - ROSTER
  // ============================================

  /**
   * Add player to roster (UI action - actual add via API).
   */
  requestAddPlayer(): void {
    this.logger.debug('Request add player');
    // This would open a modal/sheet - handled by component
  }

  /**
   * Remove player from roster.
   */
  async removePlayer(playerId: string): Promise<void> {
    this.logger.info('Removing player', { playerId });
    // Mark as dirty and update local state
    this._dirtyFields.update((fields) => {
      const newFields = new Set(fields);
      newFields.add('roster.players');
      return newFields;
    });

    this._formData.update((data) => {
      if (!data) return data;
      return {
        ...data,
        roster: data.roster.filter((p) => p.id !== playerId),
      };
    });

    this.haptics.impact('medium');
  }

  // ============================================
  // ACTIONS - SCHEDULE
  // ============================================

  /**
   * Add event to schedule (UI action).
   */
  requestAddEvent(): void {
    this.logger.debug('Request add event');
  }

  /**
   * Remove event from schedule.
   */
  async removeEvent(eventId: string): Promise<void> {
    this.logger.info('Removing event', { eventId });
    this._dirtyFields.update((fields) => {
      const newFields = new Set(fields);
      newFields.add('schedule.events');
      return newFields;
    });

    this._formData.update((data) => {
      if (!data) return data;
      return {
        ...data,
        schedule: data.schedule.filter((e) => e.id !== eventId),
      };
    });

    this.haptics.impact('medium');
  }

  // ============================================
  // ACTIONS - STAFF
  // ============================================

  /**
   * Add staff member (UI action).
   */
  requestAddStaff(): void {
    this.logger.debug('Request add staff');
  }

  /**
   * Remove staff member.
   */
  async removeStaff(staffId: string): Promise<void> {
    this.logger.info('Removing staff', { staffId });
    this._dirtyFields.update((fields) => {
      const newFields = new Set(fields);
      newFields.add('staff.members');
      return newFields;
    });

    this._formData.update((data) => {
      if (!data) return data;
      return {
        ...data,
        staff: data.staff.filter((s) => s.id !== staffId),
      };
    });

    this.haptics.impact('medium');
  }

  // ============================================
  // ACTIONS - SPONSORS
  // ============================================

  /**
   * Add sponsor (UI action).
   */
  requestAddSponsor(): void {
    this.logger.debug('Request add sponsor');
  }

  /**
   * Remove sponsor.
   */
  async removeSponsor(sponsorId: string): Promise<void> {
    this.logger.info('Removing sponsor', { sponsorId });
    this._dirtyFields.update((fields) => {
      const newFields = new Set(fields);
      newFields.add('sponsors.list');
      return newFields;
    });

    this._formData.update((data) => {
      if (!data) return data;
      return {
        ...data,
        sponsors: data.sponsors.filter((s) => s.id !== sponsorId),
      };
    });

    this.haptics.impact('medium');
  }

  // ============================================
  // ACTIONS - INTEGRATIONS
  // ============================================

  /**
   * Connect integration (UI action).
   */
  requestConnectIntegration(): void {
    this.logger.debug('Request connect integration');
  }

  /**
   * Disconnect integration.
   */
  async disconnectIntegration(integrationId: string): Promise<void> {
    this.logger.info('Disconnecting integration', { integrationId });
    this._dirtyFields.update((fields) => {
      const newFields = new Set(fields);
      newFields.add('integrations.list');
      return newFields;
    });

    this._formData.update((data) => {
      if (!data) return data;
      return {
        ...data,
        integrations: data.integrations.map((i) =>
          i.id === integrationId ? { ...i, status: 'disconnected' as const } : i
        ),
      };
    });

    this.haptics.impact('medium');
  }

  /**
   * Sync integration data.
   */
  async syncIntegration(integrationId: string): Promise<void> {
    this.logger.info('Syncing integration', { integrationId });
    // Would call API to trigger sync
    this.toast.info('Syncing data...');
    await this.simulateNetworkDelay(2000);
    this.toast.success('Data synced successfully');
    this.haptics.notification('success');
  }

  // ============================================
  // UTILITIES
  // ============================================

  /**
   * Reset service state.
   */
  reset(): void {
    this._formData.set(null);
    this._completion.set(null);
    this._sections.set([]);
    this._activeTab.set('overview');
    this._expandedSection.set(null);
    this._isLoading.set(false);
    this._isSaving.set(false);
    this._error.set(null);
    this._dirtyFields.set(new Set());
    this._validationErrors.set({});
    this._teamId.set(null);
  }

  /**
   * Simulate network delay for mock data.
   * @internal
   */
  private simulateNetworkDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
