import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  MembershipEditorItem,
  MembershipEditorMode,
  TeamOrganizationBudgetAccessState,
  UpdateTeamOrganizationBudgetAccessRequest,
  UpdateMembershipRequest,
} from '@nxt1/core/manage-team';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TRACE_NAMES } from '@nxt1/core/performance';
import { NxtLoggingService } from '../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { PERFORMANCE_ADAPTER } from '../services/performance/performance-adapter.token';
import { ManageTeamApiClient } from './manage-team-api.client';

@Injectable({ providedIn: 'root' })
export class ManageTeamMembershipService {
  private readonly api = inject(ManageTeamApiClient);
  private readonly logger = inject(NxtLoggingService).child('ManageTeamMembershipService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly performance = inject(PERFORMANCE_ADAPTER, { optional: true });

  private readonly _items = signal<readonly MembershipEditorItem[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _teamId = signal<string | null>(null);
  private readonly _mode = signal<MembershipEditorMode>('all');
  private readonly _pendingAction = signal<string | null>(null);
  private readonly _organizationBudgetAccess = signal<TeamOrganizationBudgetAccessState | null>(
    null
  );
  private readonly _currentUserIsTeamAdmin = signal(false);

  readonly items = computed(() => this._items());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());
  readonly teamId = computed(() => this._teamId());
  readonly mode = computed(() => this._mode());
  readonly pendingAction = computed(() => this._pendingAction());
  readonly organizationBudgetAccess = computed(() => this._organizationBudgetAccess());
  /** Whether the current user is a team admin and can grant/revoke admin access. */
  readonly currentUserIsTeamAdmin = computed(() => this._currentUserIsTeamAdmin());

  readonly rosterItems = computed(() =>
    this._items().filter((item) => item.membershipKind === 'roster')
  );
  readonly staffItems = computed(() =>
    this._items().filter((item) => item.membershipKind === 'staff')
  );
  readonly pendingItems = computed(() => this._items().filter((item) => item.isPending));

  readonly totalCount = computed(() => this._items().length);
  readonly rosterCount = computed(() => this.rosterItems().length);
  readonly staffCount = computed(() => this.staffItems().length);
  readonly pendingCount = computed(() => this.pendingItems().length);

  async loadMembership(teamId: string, mode: MembershipEditorMode = 'all'): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    this._teamId.set(teamId);
    this._mode.set(mode);

    this.logger.info('Loading membership data', { teamId, mode });
    this.breadcrumb.trackStateChange('manage-team-membership:loading', {
      teamId,
      mode,
    });

    const trace = await this.performance?.startTrace(TRACE_NAMES.TEAM_LOAD);
    try {
      const response = await this.api.loadMembership(teamId);
      this._items.set(response.members ?? []);
      this._organizationBudgetAccess.set(response.organizationBudgetAccess ?? null);
      this._currentUserIsTeamAdmin.set(response.currentUserIsTeamAdmin ?? false);
      this.analytics?.trackEvent(APP_EVENTS.TEAM_MANAGED, {
        action: 'membership_loaded',
        teamId,
        count: response.members.length,
      });
      this.breadcrumb.trackStateChange('manage-team-membership:loaded', {
        teamId,
        mode,
        count: response.members.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load membership';
      this.logger.error('Failed to load membership data', err, { teamId, mode });
      this._error.set(message);
      this.breadcrumb.trackStateChange('manage-team-membership:error', {
        teamId,
        mode,
      });
    } finally {
      await trace?.stop();
      this._loading.set(false);
    }
  }

  async updateMember(entryId: string, data: UpdateMembershipRequest): Promise<boolean> {
    const teamId = this._teamId();
    if (!teamId) return false;

    this._pendingAction.set(`update:${entryId}`);
    this._error.set(null);

    try {
      const updated = await this.api.updateMembership(teamId, entryId, data);
      this._items.update((items) =>
        items.map((item) => (item.entryId === entryId ? updated : item))
      );
      this.analytics?.trackEvent(APP_EVENTS.TEAM_MANAGED, {
        action: 'membership_updated',
        teamId,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update member';
      this.logger.error('Failed to update member', err, { teamId, entryId });
      this._error.set(message);
      return false;
    } finally {
      this._pendingAction.set(null);
    }
  }

  /**
   * Grant or revoke a staff member's team admin access, which controls
   * `/usage` billing visibility. Only current team admins may call this.
   */
  async updateAdminAccess(entryId: string, isTeamAdmin: boolean): Promise<boolean> {
    const teamId = this._teamId();
    if (!teamId) return false;

    this._pendingAction.set(`admin-access:${entryId}`);
    this._error.set(null);

    try {
      const updated = await this.api.updateMembershipAdminAccess(teamId, entryId, {
        isTeamAdmin,
      });
      this._items.update((items) =>
        items.map((item) => (item.entryId === entryId ? updated : item))
      );
      this.logger.info('Updated member admin access', { teamId, entryId, isTeamAdmin });
      this.breadcrumb.trackStateChange('manage-team-membership:admin-access-updated', {
        teamId,
        entryId,
        isTeamAdmin,
      });
      this.analytics?.trackEvent(APP_EVENTS.TEAM_MANAGED, {
        action: 'membership_admin_access_updated',
        teamId,
        isTeamAdmin,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update admin access';
      this.logger.error('Failed to update member admin access', err, { teamId, entryId });
      this._error.set(message);
      return false;
    } finally {
      this._pendingAction.set(null);
    }
  }

  async removeMember(entryId: string): Promise<boolean> {
    const teamId = this._teamId();
    if (!teamId) return false;

    const before = this._items();
    this._pendingAction.set(`remove:${entryId}`);
    this._error.set(null);
    this._items.update((items) => items.filter((item) => item.entryId !== entryId));

    try {
      await this.api.removeMembership(teamId, entryId);
      this.analytics?.trackEvent(APP_EVENTS.TEAM_MANAGED, {
        action: 'membership_removed',
        teamId,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove member';
      this.logger.error('Failed to remove member', err, { teamId, entryId });
      this._items.set(before);
      this._error.set(message);
      return false;
    } finally {
      this._pendingAction.set(null);
    }
  }

  async approveMember(entryId: string): Promise<boolean> {
    const teamId = this._teamId();
    if (!teamId) return false;

    this._pendingAction.set(`approve:${entryId}`);
    this._error.set(null);

    try {
      const updated = await this.api.approveMembership(teamId, entryId);
      this._items.update((items) =>
        items.map((item) => (item.entryId === entryId ? updated : item))
      );
      this.analytics?.trackEvent(APP_EVENTS.TEAM_MANAGED, {
        action: 'membership_approved',
        teamId,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve member';
      this.logger.error('Failed to approve member', err, { teamId, entryId });
      this._error.set(message);
      return false;
    } finally {
      this._pendingAction.set(null);
    }
  }

  clearError(): void {
    this._error.set(null);
  }

  async updateOrganizationBudgetAccess(
    data: UpdateTeamOrganizationBudgetAccessRequest
  ): Promise<boolean> {
    const teamId = this._teamId();
    if (!teamId) return false;

    this._pendingAction.set('update:organization-budget-access');
    this._error.set(null);

    try {
      const response = await this.api.updateOrganizationBudgetAccess(teamId, data);
      this._items.set(response.members ?? []);
      this._organizationBudgetAccess.set(response.organizationBudgetAccess ?? null);
      this.analytics?.trackEvent(APP_EVENTS.TEAM_MANAGED, {
        action: 'organization_budget_access_updated',
        teamId,
        enabledForAllAthletes: data.enabledForAllAthletes,
        selectedAthleteCount: data.enabledAthleteUserIds?.length ?? 0,
      });
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update organization budget access';
      this.logger.error('Failed to update organization budget access', err, { teamId, data });
      this._error.set(message);
      return false;
    } finally {
      this._pendingAction.set(null);
    }
  }

  reset(): void {
    this._items.set([]);
    this._loading.set(false);
    this._error.set(null);
    this._teamId.set(null);
    this._mode.set('all');
    this._pendingAction.set(null);
    this._organizationBudgetAccess.set(null);
    this._currentUserIsTeamAdmin.set(false);
  }
}
