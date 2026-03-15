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

import { Injectable, inject, signal, computed } from '@angular/core';
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
  TEAM_PROFILE_DEFAULT_TAB,
  USER_ROLES,
} from '@nxt1/core';
import { NxtLoggingService } from '../services/logging/logging.service';
import { TeamProfileApiClient, type TeamProfileApiError } from './team-profile-api.client';

@Injectable({ providedIn: 'root' })
export class TeamProfileService {
  private readonly logger = inject(NxtLoggingService).child('TeamProfileService');
  private readonly apiClient = inject(TeamProfileApiClient);

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

  /** Follow statistics */
  readonly followStats = computed(() => this._teamData()?.followStats ?? null);

  /** Quick stats/analytics */
  readonly quickStats = computed(() => this._teamData()?.quickStats ?? null);

  /** Roster members */
  readonly roster = computed<readonly TeamProfileRosterMember[]>(
    () => this._teamData()?.roster ?? []
  );

  /** Athletes-only roster */
  readonly athletes = computed<readonly TeamProfileRosterMember[]>(() =>
    this.roster().filter((m) => m.role === USER_ROLES.ATHLETE)
  );

  /** Coaches on the roster */
  readonly coaches = computed<readonly TeamProfileRosterMember[]>(() =>
    this.roster().filter((m) => m.role === USER_ROLES.COACH)
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
    this.allPosts().filter((p) => p.type === 'video' || p.type === 'highlight')
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
    overview: 0,
    timeline: this.allPosts().length,
    videos: this.videoPosts().length,
    roster: this.roster().length,
    schedule: this.schedule().length,
    stats: 0,
    news: this.newsPosts().length + this.newsArticles().length,
    recruiting: this.recruitingActivity().length,
    photos: this.galleryImages().length,
  }));

  /** Filtered posts based on active tab */
  readonly filteredPosts = computed<readonly TeamProfilePost[]>(() => {
    const tab = this._activeTab();

    switch (tab) {
      case 'videos':
        return this.videoPosts();
      case 'news':
        return this.newsPosts();
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

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Load team profile by slug (using real API)
   */
  async loadTeam(slug: string, isAdmin = false): Promise<void> {
    if (!slug) {
      this.setError('Team slug is required');
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
   */
  async refresh(): Promise<void> {
    const team = this.team();
    if (!team) return;

    await this.loadTeam(team.slug, this.isTeamAdmin());
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
   * Toggle follow status.
   */
  async toggleFollow(): Promise<void> {
    const followStats = this.followStats();
    const data = this._teamData();
    if (!followStats || !data) return;

    const newIsFollowing = !followStats.isFollowing;
    const teamId = data.team?.id || 'unknown';
    this.logger.info('Toggling team follow', { isFollowing: newIsFollowing, teamId });

    // Optimistic update
    this._teamData.set({
      ...data,
      followStats: {
        ...followStats,
        isFollowing: newIsFollowing,
        followersCount: followStats.followersCount + (newIsFollowing ? 1 : -1),
      },
    });

    try {
      // TODO: Replace with actual API call
      await this.simulateDelay(300);
      this.logger.info(newIsFollowing ? 'Team followed' : 'Team unfollowed', { teamId });
    } catch (err) {
      // Rollback on error
      this._teamData.set(data);
      this.logger.error('Failed to toggle team follow', {
        error: (err as TeamProfileApiError).message,
      });
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
   * Reset all state.
   */
  reset(): void {
    this._isLoading.set(true); // Reset to initial loading state
    this._isLoadingMore.set(false);
    this._error.set(null);
    this._activeTab.set(TEAM_PROFILE_DEFAULT_TAB);
    this._teamData.set(null);
    this._rosterSort.set('number');
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
