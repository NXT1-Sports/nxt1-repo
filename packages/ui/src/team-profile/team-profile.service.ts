/**
 * @fileoverview Team Profile Service - State Management
 * @module @nxt1/ui/team-profile
 * @version 1.0.0
 *
 * Signal-based state management for the public-facing Team Profile feature.
 * Handles loading states, tab navigation, and data management.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Mirrors the ProfileService architecture — same signal-based pattern,
 * adapted for team-specific data shapes and tab structure.
 */

import { Injectable, inject, signal, computed, effect } from '@angular/core';
import {
  type TeamProfileTabId,
  type TeamProfilePageData,
  type TeamProfilePost,
  type TeamProfileRosterMember,
  type TeamProfileScheduleEvent,
  type TeamProfileStaffMember,
  type TeamProfileRecruitingActivity,
  type TeamProfileStatsCategory,
  type NewsArticle,
  type FeedItem,
  type TeamTimelineFilterId,
  TEAM_PROFILE_DEFAULT_TAB,
  TEAM_TIMELINE_DEFAULT_FILTER,
  USER_ROLES,
} from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { NxtLoggingService } from '../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { NxtThemeService } from '../services/theme';
import { TeamProfileApiClient, type TeamProfileApiError } from './team-profile-api.client';

@Injectable({ providedIn: 'root' })
export class TeamProfileService {
  private static readonly TEAM_THEME_SOURCE = 'team-profile-service';

  private readonly logger = inject(NxtLoggingService).child('TeamProfileService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly theme = inject(NxtThemeService);
  private readonly apiClient = inject(TeamProfileApiClient);

  constructor() {
    effect(() => {
      const branding = this._teamData()?.team?.branding;
      if (branding?.primaryColor) {
        this.theme.applyOrgTheme(branding.primaryColor, branding.secondaryColor);
        this.theme.activateTeamTheme(TeamProfileService.TEAM_THEME_SOURCE);
      } else {
        this.theme.clearOrgTheme();
        this.theme.deactivateTeamTheme(TeamProfileService.TEAM_THEME_SOURCE);
      }
    });
  }

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  /**
   * Start with loading=false to prevent SSR hydration mismatch.
   * Will be set to true when loadTeam() is called.
   */
  private readonly _isLoading = signal(false);
  private readonly _isLoadingMore = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _activeTab = signal<TeamProfileTabId>(TEAM_PROFILE_DEFAULT_TAB);
  private readonly _teamData = signal<TeamProfilePageData | null>(null);
  private readonly _rosterSort = signal<string>('number');

  // Timeline signals
  private readonly _timeline = signal<readonly FeedItem[]>([]);
  private readonly _timelineLoading = signal(false);
  private readonly _timelineError = signal<string | null>(null);
  private readonly _timelineCursor = signal<string | null>(null);
  private readonly _timelineHasMore = signal(false);
  private readonly _activeTimelineFilter = signal<TeamTimelineFilterId>(
    TEAM_TIMELINE_DEFAULT_FILTER
  );

  // ============================================
  // PUBLIC COMPUTED SIGNALS (READ-ONLY)
  // ============================================

  /** Whether team profile is loading */
  readonly isLoading = computed(() => this._isLoading());

  /** Whether loading more content */
  readonly isLoadingMore = computed(() => this._isLoadingMore());

  /** Error message if any */
  readonly error = computed(() => this._error());

  /** Currently active tab */
  readonly activeTab = computed(() => this._activeTab());

  /** Full team page data */
  readonly teamData = computed(() => this._teamData());

  /** Core team data */
  readonly team = computed(() => this._teamData()?.team ?? null);

  /** Quick stats/analytics */
  readonly quickStats = computed(() => this._teamData()?.quickStats ?? null);

  /** Roster members — athlete roles only. Coaches/directors belong in staff, not roster. */
  readonly roster = computed<readonly TeamProfileRosterMember[]>(() =>
    (this._teamData()?.roster ?? []).filter((member) => {
      const role = String(member.role ?? '').toLowerCase();
      return role === USER_ROLES.ATHLETE || role === 'player';
    })
  );

  /** Athletes-only roster */
  readonly athletes = computed<readonly TeamProfileRosterMember[]>(() => this.roster());

  /** Coaches on the roster */
  readonly coaches = computed<readonly TeamProfileRosterMember[]>(() =>
    (this._teamData()?.roster ?? []).filter((member) => {
      const role = String(member.role ?? '').toLowerCase();
      return role === USER_ROLES.COACH;
    })
  );

  /** Roster count */
  readonly rosterCount = computed(() => this.roster().length);

  /** Distinct class years from roster (for side tab split) */
  readonly rosterClassYears = computed<readonly string[]>(() => {
    const years = new Set<string>();
    for (const m of this.athletes()) {
      if (m.classYear) years.add(m.classYear);
    }
    return [...years].sort((a, b) => b.localeCompare(a));
  });

  /** Roster grouped by class year */
  readonly rosterByYear = computed<ReadonlyMap<string, readonly TeamProfileRosterMember[]>>(() => {
    const map = new Map<string, TeamProfileRosterMember[]>();
    for (const m of this.athletes()) {
      const year = m.classYear ?? 'Unknown';
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(m);
    }
    return map;
  });

  /** Roster sort option */
  readonly rosterSort = computed(() => this._rosterSort());

  /** Sorted roster based on active sort */
  readonly sortedRoster = computed<readonly TeamProfileRosterMember[]>(() => {
    const members = [...this.athletes()];
    const sort = this._rosterSort();

    switch (sort) {
      case 'name':
        members.sort((a, b) => a.lastName.localeCompare(b.lastName));
        break;
      case 'number':
        members.sort((a, b) => {
          const numA = parseInt(a.jerseyNumber ?? '999', 10);
          const numB = parseInt(b.jerseyNumber ?? '999', 10);
          return numA - numB;
        });
        break;
      case 'position':
        members.sort((a, b) => (a.position ?? '').localeCompare(b.position ?? ''));
        break;
      case 'class':
        members.sort((a, b) => (a.classYear ?? '').localeCompare(b.classYear ?? ''));
        break;
      case 'recent':
        members.sort((a, b) => {
          const dateA = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
          const dateB = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
          return dateB - dateA;
        });
        break;
    }

    return members;
  });

  /** Schedule events */
  readonly schedule = computed<readonly TeamProfileScheduleEvent[]>(
    () => this._teamData()?.schedule ?? []
  );

  /** Upcoming games/events */
  readonly upcomingSchedule = computed<readonly TeamProfileScheduleEvent[]>(() =>
    this.schedule().filter((e) => e.status === 'upcoming' || e.status === 'live')
  );

  /** Completed games/events */
  readonly completedSchedule = computed<readonly TeamProfileScheduleEvent[]>(() =>
    this.schedule().filter((e) => e.status === 'final')
  );

  /** Team stats categories */
  readonly stats = computed<readonly TeamProfileStatsCategory[]>(
    () => this._teamData()?.stats ?? []
  );

  /** Staff members */
  readonly staff = computed<readonly TeamProfileStaffMember[]>(() => this._teamData()?.staff ?? []);

  /** Head coach */
  readonly headCoach = computed<TeamProfileStaffMember | null>(
    () => this.staff().find((s) => s.role === 'head-coach') ?? null
  );

  /** All posts */
  readonly allPosts = computed<readonly TeamProfilePost[]>(
    () => this._teamData()?.recentPosts ?? []
  );

  /** Pinned posts */
  readonly pinnedPosts = computed<readonly TeamProfilePost[]>(() =>
    this.allPosts().filter((p) => p.isPinned)
  );

  /** Video/highlight posts */
  readonly videoPosts = computed<readonly TeamProfilePost[]>(() =>
    this.allPosts().filter((p) => p.type === 'video')
  );

  /** News/announcement posts */
  readonly newsPosts = computed<readonly TeamProfilePost[]>(() =>
    this.allPosts().filter((p) => p.type === 'news' || p.type === 'announcement')
  );

  /** Structured news articles from News collection (type==='team' documents). */
  readonly newsArticles = computed<readonly NewsArticle[]>(
    () => this._teamData()?.newsArticles ?? []
  );

  /** Recruiting activity */
  readonly recruitingActivity = computed<readonly TeamProfileRecruitingActivity[]>(
    () => this._teamData()?.recruitingActivity ?? []
  );

  /** Sponsors */
  readonly sponsors = computed(() => this._teamData()?.team?.sponsors ?? []);

  /** Image/photo posts */
  readonly imagePosts = computed<readonly TeamProfilePost[]>(() =>
    this.allPosts().filter((p) => p.type === 'image')
  );

  /** Whether user is an admin of this team */
  readonly isTeamAdmin = computed(() => this._teamData()?.isTeamAdmin ?? false);

  /** Whether user can edit */
  readonly canEdit = computed(() => this._teamData()?.canEdit ?? false);

  /** Whether user is a team member */
  readonly isMember = computed(() => this._teamData()?.isMember ?? false);

  /** Gallery images for carousel */
  readonly galleryImages = computed<readonly string[]>(() => {
    const team = this._teamData()?.team;
    if (!team) return [];
    return team.galleryImages ?? [];
  });

  /** Season record formatted */
  readonly recordDisplay = computed<string>(() => {
    const record = this._teamData()?.team?.record;
    if (!record) return '';
    if (record.formatted) return record.formatted;
    const parts = [`${record.wins}-${record.losses}`];
    if (record.ties !== undefined && record.ties > 0) parts[0] += `-${record.ties}`;
    if (record.season) parts.push(record.season);
    return parts.join(' ');
  });

  /** Tab badge counts */
  readonly tabBadges = computed(() => ({
    intel: 0,
    timeline: this.allPosts().length,
    roster: this.roster().length,
    connect: 0,
  }));

  /** Filtered posts based on active tab */
  readonly filteredPosts = computed<readonly TeamProfilePost[]>(() => {
    const tab = this._activeTab();

    switch (tab) {
      case 'timeline':
        return this.allPosts();
      default:
        return this.allPosts();
    }
  });

  /** Whether posts are empty */
  readonly isEmpty = computed(() => this.filteredPosts().length === 0);

  /** Whether there are more posts to load */
  readonly hasMore = computed(() => this.allPosts().length >= 20);

  /** Polymorphic timeline feed items */
  readonly timeline = computed(() => this._timeline());

  /** Whether the timeline is loading */
  readonly timelineLoading = computed(() => this._timelineLoading());

  /** Timeline error message */
  readonly timelineError = computed(() => this._timelineError());

  /** Whether there are more timeline pages */
  readonly timelineHasMore = computed(() => this._timelineHasMore());

  /** Active timeline filter chip */
  readonly activeTimelineFilter = computed(() => this._activeTimelineFilter());

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Load team profile by short team code (e.g. "57L791").
   * This is the canonical method for routes using /team/:slug/:teamCode.
   * Calls GET /api/v1/teams/by-teamcode/:teamCode on the backend.
   */
  async loadTeamByCode(teamCode: string, isAdmin = false): Promise<void> {
    if (!teamCode) {
      this.setError('Team code is required');
      return;
    }

    // SSR hydration guard: if data is already present for this team code (transferred
    // from server render), skip the destructive reset to prevent mismatch.
    const existing = this._teamData();
    if (existing?.team?.teamCode === teamCode) {
      this.logger.debug('Team already hydrated, skipping reload', { teamCode });
      this._isLoading.set(false);
      return;
    }

    this._isLoading.set(true);
    this._error.set(null);
    this._teamData.set(null);

    this.logger.info('Loading team profile by team code', { teamCode, isAdmin });

    try {
      const data = await this.apiClient.getTeamByTeamCode(teamCode);

      this._teamData.set(data);
      this._isLoading.set(false);

      if (data.team.id) {
        this.apiClient.incrementTeamView(data.team.id).catch(() => {
          // Ignore errors — view tracking is non-critical
        });
      }

      this.logger.info('Team profile loaded by team code', {
        teamCode,
        teamId: data.team.id,
        teamName: data.team.teamName,
        rosterCount: data.roster.length,
      });
    } catch (error) {
      const { message, code, status } = error as TeamProfileApiError;

      this._error.set(message);
      this._isLoading.set(false);

      this.logger.error('Failed to load team profile by team code', error as unknown, {
        teamCode,
        code,
        status,
      });
    }
  }

  /**
   * Load team profile by Firestore document ID.
   * Prefer over loadTeam(slug) when you have the exact team ID —
   * avoids slug ambiguity when multiple teams share the same name.
   */
  async loadTeamById(teamId: string, isAdmin = false): Promise<void> {
    if (!teamId) {
      this.setError('Team ID is required');
      return;
    }

    // SSR hydration guard: if data is already present for this team (transferred
    // from server render), skip the destructive reset to prevent mismatch.
    const existing = this._teamData();
    if (existing?.team?.id === teamId) {
      this.logger.debug('Team already hydrated, skipping reload', { teamId });
      this._isLoading.set(false); // ensure loading clears (caller may have set it true)
      return;
    }

    this._isLoading.set(true);
    this._error.set(null);
    this._teamData.set(null);

    this.logger.info('Loading team profile by ID', { teamId, isAdmin });

    try {
      const data = await this.apiClient.getTeamById(teamId);

      this._teamData.set(data);
      this._isLoading.set(false);

      if (data.team.id) {
        this.apiClient.incrementTeamView(data.team.id).catch(() => {
          // Ignore errors
        });
      }

      this.logger.info('Team profile loaded by ID', {
        teamId: data.team.id,
        teamName: data.team.teamName,
        rosterCount: data.roster.length,
      });
    } catch (error) {
      const { message, code, status } = error as TeamProfileApiError;

      this._error.set(message);
      this._isLoading.set(false);

      this.logger.error('Failed to load team profile by ID', error as unknown, {
        teamId,
        code,
        status,
      });
    }
  }

  /**
   * Load team profile by slug (using real API)
   */
  async loadTeam(slug: string, isAdmin = false): Promise<void> {
    if (!slug) {
      this.setError('Team slug is required');
      return;
    }

    // SSR hydration guard: if data is already present for this slug (transferred
    // from server render), skip the destructive reset to prevent mismatch.
    const existing = this._teamData();
    if (existing?.team?.slug === slug) {
      this.logger.debug('Team already hydrated, skipping reload', { slug });
      this._isLoading.set(false); // ensure loading clears (caller may have set it true)
      return;
    }

    // Reset state
    this._isLoading.set(true);
    this._error.set(null);
    this._teamData.set(null);

    this.logger.info('Loading team profile', { slug, isAdmin });

    try {
      // Fetch from API (with Redis cache)
      const data = await this.apiClient.getTeamBySlug(slug);

      // Update state
      this._teamData.set(data);
      this._isLoading.set(false);

      // Track page view (non-blocking)
      if (data.team.id) {
        this.apiClient.incrementTeamView(data.team.id).catch(() => {
          // Ignore errors
        });
      }

      this.logger.info('Team profile loaded', {
        teamId: data.team.id,
        teamName: data.team.teamName,
        rosterCount: data.roster.length,
      });
    } catch (error) {
      const { message, code, status } = error as TeamProfileApiError;

      this._error.set(message);
      this._isLoading.set(false);

      this.logger.error('Failed to load team profile', error as unknown, { slug, code, status });
    }
  }

  /**
   * Refresh team data.
   * Prefers teamCode if available, falls back to ID or slug.
   */
  async refresh(): Promise<void> {
    const team = this.team();
    if (!team) return;

    if (team.teamCode) {
      await this.loadTeamByCode(team.teamCode, this.isTeamAdmin());
    } else if (team.id) {
      await this.loadTeamById(team.id, this.isTeamAdmin());
    } else {
      await this.loadTeam(team.slug, this.isTeamAdmin());
    }
  }

  /**
   * Switch active tab.
   */
  setActiveTab(tab: TeamProfileTabId): void {
    this.logger.debug('Tab changed', { from: this._activeTab(), to: tab });
    this._activeTab.set(tab);
  }

  /**
   * Set roster sort order.
   */
  setRosterSort(sort: string): void {
    this.logger.debug('Roster sort changed', { sort });
    this._rosterSort.set(sort);
  }

  /**
   * Track team page view (fire-and-forget).
   */
  async trackPageView(teamId: string): Promise<void> {
    try {
      await this.apiClient.incrementTeamView(teamId);
    } catch {
      // Non-critical — swallow errors
    }
  }

  /**
   * Load more posts for infinite scroll.
   */
  async loadMorePosts(): Promise<void> {
    if (this._isLoadingMore()) return;

    this.logger.debug('Loading more team posts');
    this._isLoadingMore.set(true);

    try {
      // TODO: Replace with actual API call
      await this.simulateDelay(500);
    } catch (err) {
      this.logger.error('Failed to load more team posts', {
        error: (err as TeamProfileApiError).message,
      });
    } finally {
      this._isLoadingMore.set(false);
    }
  }

  /**
   * Load team from externally-fetched data.
   * Used by platform wrappers (web SSR resolver, mobile deep-link bridge).
   */
  loadFromExternalData(data: TeamProfilePageData): void {
    this._teamData.set(data);
    this._isLoading.set(false);
    this._error.set(null);
    this.logger.info('Team loaded from external data');
  }

  /**
   * Set an error state.
   */
  setError(message: string): void {
    this._error.set(message);
    this._isLoading.set(false);
    this.logger.error('Team error set externally', { message });
  }

  /**
   * Manually start loading state.
   */
  startLoading(): void {
    this._isLoading.set(true);
    this._error.set(null);
  }

  /**
   * Load team timeline feed.
   * Called when user navigates to the timeline tab or changes filter.
   */
  async loadTimeline(teamCode: string, filter?: TeamTimelineFilterId): Promise<void> {
    const activeFilter = filter ?? this._activeTimelineFilter();
    this._timelineLoading.set(true);
    this._timelineError.set(null);
    this._timelineCursor.set(null);

    this.logger.info('Loading team timeline', { teamCode, filter: activeFilter });
    this.breadcrumb.trackStateChange('team-timeline loading', { teamCode, filter: activeFilter });

    try {
      const result = await this.apiClient.getTeamTimeline(teamCode, { filter: activeFilter });
      this._timeline.set(result.items);
      this._timelineCursor.set(result.nextCursor ?? null);
      this._timelineHasMore.set(!!result.nextCursor);
      this.logger.info('Team timeline loaded', {
        teamCode,
        count: result.items.length,
        hasMore: !!result.nextCursor,
      });
      this.analytics?.trackEvent(APP_EVENTS.TEAM_TIMELINE_VIEWED, {
        teamCode,
        filter: activeFilter,
        count: result.items.length,
      });
      this.breadcrumb.trackStateChange('team-timeline loaded', {
        teamCode,
        count: result.items.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load timeline';
      this._timelineError.set(message);
      this.logger.error('Failed to load team timeline', err as Error, { teamCode });
      this.breadcrumb.trackStateChange('team-timeline error', { teamCode });
    } finally {
      this._timelineLoading.set(false);
    }
  }

  /**
   * Load the next page of the timeline (infinite scroll).
   */
  async loadMoreTimeline(teamCode: string): Promise<void> {
    if (this._timelineLoading() || this._isLoadingMore() || !this._timelineHasMore()) return;
    const cursor = this._timelineCursor();
    if (!cursor) return;

    this._isLoadingMore.set(true);
    this.logger.debug('Loading more timeline items', { teamCode, cursor });

    try {
      const result = await this.apiClient.getTeamTimeline(teamCode, {
        filter: this._activeTimelineFilter(),
        cursor,
      });
      this._timeline.update((prev) => [...prev, ...result.items]);
      this._timelineCursor.set(result.nextCursor ?? null);
      this._timelineHasMore.set(!!result.nextCursor);
    } catch (err) {
      this.logger.error('Failed to load more timeline items', err as Error, { teamCode });
    } finally {
      this._isLoadingMore.set(false);
    }
  }

  /**
   * Switch the active timeline filter chip.
   * Reloads timeline with the new filter.
   */
  async setTimelineFilter(teamCode: string, filter: TeamTimelineFilterId): Promise<void> {
    if (this._activeTimelineFilter() === filter) return;
    this._activeTimelineFilter.set(filter);
    this.analytics?.trackEvent(APP_EVENTS.TEAM_TIMELINE_FILTER_APPLIED, { teamCode, filter });
    this.breadcrumb.trackUserAction('team-timeline-filter', { teamCode, filter });
  }

  /**
   * Reset all state.
   */
  reset(): void {
    this._isLoading.set(true); // Reset to initial loading state
    this._isLoadingMore.set(false);
    this._error.set(null);
    this._activeTab.set(TEAM_PROFILE_DEFAULT_TAB);
    this._teamData.set(null);
    this._rosterSort.set('number');
    this._timeline.set([]);
    this._timelineLoading.set(false);
    this._timelineError.set(null);
    this._timelineCursor.set(null);
    this._timelineHasMore.set(false);
    this._activeTimelineFilter.set(TEAM_TIMELINE_DEFAULT_FILTER);
    this.theme.clearOrgTheme();
    this.theme.deactivateTeamTheme(TeamProfileService.TEAM_THEME_SOURCE);
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
