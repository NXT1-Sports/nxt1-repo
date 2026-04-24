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
import {
  MANAGE_TEAM_TABS,
  applyManageTeamFieldChange,
  buildManageTeamUpdatePayload,
} from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TRACE_NAMES } from '@nxt1/core/performance';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { PERFORMANCE_ADAPTER } from '../services/performance/performance-adapter.token';
import { ManageTeamApiClient } from './manage-team-api.client';

/**
 * Manage Team state management service.
 * Provides reactive state for the team management interface.
 */
@Injectable({ providedIn: 'root' })
export class ManageTeamService {
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ManageTeamService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly performance = inject(PERFORMANCE_ADAPTER, { optional: true });
  private readonly apiClient = inject(ManageTeamApiClient);

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
  private readonly _connectedSources = signal<
    NonNullable<Parameters<ManageTeamApiClient['updateTeamBasicInfo']>[1]['connectedSources']>
  >([]);

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

  /** Team-level connected accounts/sources. */
  readonly connectedSources = computed(() => this._connectedSources());

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
    this.breadcrumb.trackStateChange('manage-team:loading', { teamId });
    this._isLoading.set(true);
    this._error.set(null);
    this._teamId.set(teamId);

    const trace = this.performance
      ? await this.performance.startTrace(TRACE_NAMES.TEAM_LOAD)
      : null;

    try {
      const result = await this.apiClient.getTeamForEditing(teamId);
      this._formData.set(result.formData);
      this._completion.set(result.completion);
      this._connectedSources.set(result.connectedSources ?? []);
      this._dirtyFields.set(new Set());

      await trace?.putMetric('roster_count', result.formData.roster.length);
      await trace?.putMetric('staff_count', result.formData.staff.length);
      await trace?.putMetric('sponsor_count', result.formData.sponsors.length);

      this.analytics?.trackEvent(APP_EVENTS.TEAM_MANAGED, {
        action: 'loaded',
        teamId,
      });
      this.logger.info('Team loaded successfully', { teamId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load team';
      this._error.set(message);
      this.breadcrumb.trackStateChange('manage-team:error', { teamId, message });
      this.logger.error('Failed to load team', err, { teamId });
    } finally {
      this._isLoading.set(false);
      await trace?.stop();
    }
  }

  /**
   * Load current user's team (default team).
   */
  async loadCurrentUserTeam(): Promise<void> {
    this.logger.info('Loading current user team');
    this._isLoading.set(true);
    this._error.set(null);
    try {
      const teams = await this.apiClient.getUserTeams();
      if (teams.length === 0) {
        this._error.set('No team found for this account');
        return;
      }
      await this.loadTeam(teams[0].id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load team';
      this._error.set(message);
      this.logger.error('Failed to load current user team', err);
    } finally {
      this._isLoading.set(false);
    }
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

    this._dirtyFields.update((fields) => {
      const newFields = new Set(fields);
      newFields.add(`${sectionId}.${fieldId}`);
      return newFields;
    });

    this._formData.update((data) => {
      if (!data) return data;
      return applyManageTeamFieldChange(data, event);
    });

    this.breadcrumb.trackUserAction('manage-team-field-updated', {
      sectionId,
      fieldId,
    });
    void this.haptics.impact('light');
  }

  /** Update team connected accounts from the shared connected accounts modal. */
  setConnectedSources(
    sources: NonNullable<
      Parameters<ManageTeamApiClient['updateTeamBasicInfo']>[1]['connectedSources']
    >
  ): void {
    this._connectedSources.set([...sources]);

    this._dirtyFields.update((fields) => {
      const next = new Set(fields);
      next.add('accounts.connectedSources');
      return next;
    });

    this.breadcrumb.trackUserAction('manage-team-connected-sources-updated', {
      count: sources.length,
    });
    void this.haptics.impact('light');
  }

  // ============================================
  // ACTIONS - SAVING
  // ============================================

  /**
   * Save team changes.
   */
  async saveChanges(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) return true;

    const formData = this._formData();
    const teamId = this._teamId();
    if (!formData || !teamId) {
      this._error.set('Team data is not available');
      return false;
    }

    const payload = buildManageTeamUpdatePayload(formData);
    const payloadWithLegacy = payload as unknown as {
      organizationLogoUrl?: string;
      logoUrl?: string;
      [key: string]: unknown;
    };
    const { logoUrl: legacyLogoUrl, ...payloadWithoutLegacyLogo } = payloadWithLegacy;

    const requestPayload: Parameters<ManageTeamApiClient['updateTeamBasicInfo']>[1] = {
      ...payloadWithoutLegacyLogo,
      organizationLogoUrl: payloadWithLegacy.organizationLogoUrl ?? legacyLogoUrl ?? '',
      connectedSources: this._connectedSources(),
    };

    if (!requestPayload.teamName) {
      const message = 'Team name is required';
      this._error.set(message);
      this.toast.error(message);
      return false;
    }

    if (requestPayload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(requestPayload.email)) {
      const message = 'Enter a valid team email address';
      this._error.set(message);
      this.toast.error(message);
      return false;
    }

    const dirtyCount = this._dirtyFields().size;
    this.logger.info('Saving team changes', { teamId, dirtyCount });
    this.breadcrumb.trackStateChange('manage-team:saving', { teamId, dirtyCount });
    this._isSaving.set(true);
    this._error.set(null);

    const trace = this.performance
      ? await this.performance.startTrace(TRACE_NAMES.PROFILE_UPDATE)
      : null;

    try {
      await this.apiClient.updateTeamBasicInfo(teamId, requestPayload);

      this._dirtyFields.set(new Set());
      this.analytics?.trackEvent(APP_EVENTS.TEAM_MANAGED, {
        action: 'saved',
        teamId,
        dirtyCount,
      });
      this.logger.info('Team saved successfully', { teamId, dirtyCount });
      this.toast.success('Team saved successfully');
      await trace?.putMetric('dirty_count', dirtyCount);
      await this.refreshTeam();
      await this.haptics.notification('success');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save team';
      this._error.set(message);
      this.toast.error(message);
      await this.haptics.notification('error');
      this.breadcrumb.trackStateChange('manage-team:save-error', { teamId, message });
      this.logger.error('Failed to save team', err, { teamId });
      return false;
    } finally {
      this._isSaving.set(false);
      await trace?.stop();
    }
  }

  /**
   * Discard unsaved changes.
   */
  async discardChanges(): Promise<void> {
    this._dirtyFields.set(new Set());
    const teamId = this._teamId();
    this.breadcrumb.trackUserAction('manage-team-discarded', { teamId });
    if (teamId) {
      await this.loadTeam(teamId);
    }
    await this.haptics.impact('medium');
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
}
