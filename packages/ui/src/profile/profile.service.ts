/**
 * @fileoverview Profile Service - State Management
 * @module @nxt1/ui/profile
 * @version 1.0.0
 *
 * Signal-based state management for Profile feature.
 * Handles loading states, tab navigation, and data fetching.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import {
  type ProfileTabId,
  type ProfilePageData,
  type ProfilePost,
  type ProfileRecruitingActivity,
  type ProfileEvent,
  type ProfileStatItem,
  type ProfileSport,
  type FeedPost,
  type User,
  PROFILE_DEFAULT_TAB,
  profileUserToFeedAuthor,
  buildUnifiedActivityFeed,
  parseApiError,
} from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtToastService } from '../services/toast/toast.service';
import { userToProfilePageData } from './profile-mappers';
import {
  MOCK_PROFILE_PAGE_DATA,
  getMockOwnProfileData,
  MOCK_ACTIVITY_FEED_ITEMS,
} from './profile.mock-data';
import { type RankingSource, MOCK_RANKINGS } from './rankings/profile-rankings.component';

type ProfileUserTeamExtension = {
  readonly teamId?: string;
  readonly managedTeams?: readonly unknown[];
};

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly logger = inject(NxtLoggingService).child('ProfileService');
  private readonly toast = inject(NxtToastService);

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  // Start in loading state so the skeleton always shows on first render —
  // regardless of whether the consumer calls startLoading() before the first
  // change-detection tick (SSR hydration, singleton reuse, etc.).
  private readonly _isLoading = signal(true);
  private readonly _isLoadingMore = signal(false);

  /** Raw User from the API response — stored so sport switching can re-map tab data. */
  private readonly _rawUser = signal<User | null>(null);
  /** Whether the loaded profile is the current user's own profile. */
  private _profileIsOwn = false;
  private readonly _error = signal<string | null>(null);
  private readonly _activeTab = signal<ProfileTabId>(PROFILE_DEFAULT_TAB);
  private readonly _profileData = signal<ProfilePageData | null>(null);
  private readonly _isEditMode = signal(false);
  private readonly _editSection = signal<string | null>(null);
  private readonly _activeSportIndex = signal(0);
  private readonly _rankings = signal<RankingSource[]>(MOCK_RANKINGS);
  private readonly _activityFeedItems = signal<readonly FeedPost[]>([]);

  // ============================================
  // PUBLIC COMPUTED SIGNALS (READ-ONLY)
  // ============================================

  /** Whether profile is loading */
  readonly isLoading = computed(() => this._isLoading());

  /** Whether loading more content */
  readonly isLoadingMore = computed(() => this._isLoadingMore());

  /** Error message if any */
  readonly error = computed(() => this._error());

  /** Currently active tab */
  readonly activeTab = computed(() => this._activeTab());

  /** Full profile page data */
  readonly profileData = computed(() => this._profileData());

  /** Profile user data */
  readonly user = computed(() => this._profileData()?.user ?? null);

  /** Follow statistics */
  readonly followStats = computed(() => this._profileData()?.followStats ?? null);

  /** Quick stats/analytics */
  readonly quickStats = computed(() => this._profileData()?.quickStats ?? null);

  /** Athletic stats by category */
  readonly athleticStats = computed(() => this._profileData()?.athleticStats ?? []);

  /** Game log data — all seasons (MaxPreps-style game-by-game rows) */
  readonly gameLog = computed(() => this._profileData()?.gameLog ?? []);

  /** Metrics (Combine/Measurables) by category */
  readonly metrics = computed(() => this._profileData()?.metrics ?? []);

  /** Pinned video/mixtape */
  readonly pinnedVideo = computed(() => this._profileData()?.pinnedVideo ?? null);

  /** All posts */
  readonly allPosts = computed(() => this._profileData()?.recentPosts ?? []);

  /** All recruiting activity (unified) */
  readonly recruitingActivity = computed<readonly ProfileRecruitingActivity[]>(
    () => this._profileData()?.recruitingActivity ?? this._profileData()?.offers ?? []
  );

  /** Offers (category: 'offer') */
  readonly offers = computed<readonly ProfileRecruitingActivity[]>(() =>
    this.recruitingActivity().filter((a) => a.category === 'offer')
  );

  /** Commitments (category: 'commitment') */
  readonly committedOffers = computed<readonly ProfileRecruitingActivity[]>(() =>
    this.recruitingActivity().filter((a) => a.category === 'commitment')
  );

  /** Interests (category: 'interest') */
  readonly interestOffers = computed<readonly ProfileRecruitingActivity[]>(() =>
    this.recruitingActivity().filter((a) => a.category === 'interest')
  );

  /** Active offers (excludes interests and commitments) */
  readonly activeOffers = computed<readonly ProfileRecruitingActivity[]>(() =>
    this.recruitingActivity().filter((a) => a.category === 'offer')
  );

  /** Visits (category: 'visit') */
  readonly visits = computed<readonly ProfileRecruitingActivity[]>(() =>
    this.recruitingActivity().filter((a) => a.category === 'visit')
  );

  /** Camps (category: 'camp') */
  readonly camps = computed<readonly ProfileRecruitingActivity[]>(() =>
    this.recruitingActivity().filter((a) => a.category === 'camp')
  );

  /** Whether the user has any recruiting activity at all */
  readonly hasRecruitingActivity = computed<boolean>(() => this.recruitingActivity().length > 0);

  /** Rankings from various scouting services */
  readonly rankings = computed(() => this._rankings());

  /** Awards list */
  readonly awards = computed(() => this._profileData()?.user?.awards ?? []);

  /** Events list (schedule items — games, practices, etc.) */
  readonly events = computed(() => this._profileData()?.events ?? []);

  /** Player card data (Agent X / Madden-style) */
  readonly playerCard = computed(() => this._profileData()?.playerCard ?? null);

  /**
   * Unified activity timeline feed.
   * Merges all profile sections (posts, offers, events) + extra activity items
   * (stat updates, metrics, awards, news, schedule, external syncs)
   * into a single chronologically sorted FeedPost array.
   *
   * This powers the unified Timeline tab, showing EVERY update across
   * the entire profile in one seamless feed.
   */
  readonly unifiedTimeline = computed<readonly FeedPost[]>(() => {
    const data = this._profileData();
    if (!data?.user) return [];

    const author = profileUserToFeedAuthor(data.user);
    const posts = data.recentPosts ?? [];
    const offers = data.offers ?? [];
    const events = data.events ?? [];

    // Build unified feed from posts + offers + events
    const baseFeed = buildUnifiedActivityFeed(posts, offers, events, author);

    // Merge in extra activity items (stat updates, metrics, awards, news, etc.)
    const extraItems = this._activityFeedItems();
    if (extraItems.length === 0) return baseFeed;

    // Combine and re-sort chronologically (newest first)
    const combined = [...baseFeed, ...extraItems];
    combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return combined;
  });

  /**
   * All profile images for carousel display.
   */
  readonly profileImages = computed<readonly string[]>(() => {
    const user = this._profileData()?.user;
    if (!user) return [];
    return user.profileImages ?? [];
  });

  /** Whether viewing own profile */
  readonly isOwnProfile = computed(() => this._profileData()?.isOwnProfile ?? false);

  /** Whether can edit profile */
  readonly canEdit = computed(() => this._profileData()?.canEdit ?? false);

  /** All sports (primary + additional) for profile switching */
  readonly allSports = computed<readonly ProfileSport[]>(() => {
    const user = this._profileData()?.user;
    if (!user) return [];
    const sports: ProfileSport[] = [];
    if (user.primarySport) sports.push(user.primarySport);
    if (user.additionalSports?.length) {
      for (const s of user.additionalSports) {
        sports.push(s);
      }
    }
    return sports;
  });

  /** Whether user has multiple sport profiles */
  readonly hasMultipleSports = computed(() => this.allSports().length > 1);

  /** Currently active sport index */
  readonly activeSportIndex = computed(() => {
    const idx = this._activeSportIndex();
    const sports = this.allSports();
    return idx < sports.length ? idx : 0;
  });

  /** Currently active sport profile */
  readonly activeSport = computed<ProfileSport | null>(() => {
    const sports = this.allSports();
    const idx = this.activeSportIndex();
    return sports[idx] ?? null;
  });

  /** Whether user has a team to edit */
  readonly hasTeam = computed(() => {
    // Check if user has team in their sports profile
    const user = this._profileData()?.user;
    if (!user) return false;
    const extendedUser = user as typeof user & ProfileUserTeamExtension;
    // For now, return true for coaches/team managers, or if they have a team association
    // This will be enhanced when backend provides team data
    return !!extendedUser.teamId || !!extendedUser.managedTeams?.length;
  });

  /** Whether in edit mode */
  readonly isEditMode = computed(() => this._isEditMode());

  /** Current edit section */
  readonly editSection = computed(() => this._editSection());

  /** Filtered posts based on active tab */
  readonly filteredPosts = computed<readonly ProfilePost[]>(() => {
    const posts = this.allPosts();
    const tab = this._activeTab();

    if (tab === 'timeline') {
      return posts;
    }

    if (tab === 'videos') {
      return posts.filter((p: ProfilePost) => p.type === 'video' || p.type === 'highlight');
    }

    return [];
  });

  /** Video posts only */
  readonly videoPosts = computed(() =>
    this.allPosts().filter((p: ProfilePost) => p.type === 'video' || p.type === 'highlight')
  );

  /** News posts only */
  readonly newsPosts = computed(() =>
    this.allPosts().filter((p: ProfilePost) => p.type === 'news')
  );

  /** Pinned posts */
  readonly pinnedPosts = computed(() => this.allPosts().filter((p: ProfilePost) => p.isPinned));

  /** Whether posts list is empty */
  readonly isEmpty = computed(() => this.filteredPosts().length === 0);

  /** Whether there are more posts to load */
  readonly hasMore = computed(() => {
    // TODO: Implement proper pagination
    return this.allPosts().length >= 20;
  });

  /** Quick stats formatted for display */
  readonly quickStatsDisplay = computed<ProfileStatItem[]>(() => {
    const stats = this.quickStats();
    if (!stats) return [];

    return [
      {
        key: 'profileViews',
        label: 'Profile Views',
        value: stats.profileViews,
        icon: 'eye',
      },
      {
        key: 'videoViews',
        label: 'Video Views',
        value: stats.videoViews,
        icon: 'play-circle',
      },
      {
        key: 'offerCount',
        label: 'Offers',
        value: stats.offerCount,
        icon: 'trophy',
      },
      {
        key: 'highlightCount',
        label: 'Highlights',
        value: stats.highlightCount,
        icon: 'videocam',
      },
      {
        key: 'collegeInterestCount',
        label: 'College Interest',
        value: stats.collegeInterestCount,
        icon: 'school',
      },
      {
        key: 'shareCount',
        label: 'Shares',
        value: stats.shareCount,
        icon: 'share-social',
      },
    ];
  });

  /** Tab badge counts */
  readonly tabBadges = computed(() => {
    const offers = this.offers();
    const events = this.events();

    return {
      overview: 0,
      timeline: this.allPosts().length,
      news: this.newsPosts().length,
      videos: this.videoPosts().length,
      offers: offers.length,
      metrics: 0,
      stats: 0,
      academic: 0,
      events: events.length,
      schedule: events.length,
      contact: 0,
    };
  });

  /** Upcoming events (future) */
  readonly upcomingEvents = computed(() => {
    const now = new Date();
    return this.events().filter((e: ProfileEvent) => new Date(e.startDate) > now);
  });

  /** Past events */
  readonly pastEvents = computed(() => {
    const now = new Date();
    return this.events().filter((e: ProfileEvent) => new Date(e.startDate) <= now);
  });

  /** Visit events */
  readonly visitEvents = computed(() =>
    this.events().filter((e: ProfileEvent) => e.type === 'visit')
  );

  /** Camp events */
  readonly campEvents = computed(() =>
    this.events().filter((e: ProfileEvent) => e.type === 'camp')
  );

  /** General events (combines, showcases, other — excludes visits, camps, games, practice) */
  readonly generalEvents = computed(() =>
    this.events().filter(
      (e: ProfileEvent) =>
        e.type !== 'visit' && e.type !== 'camp' && e.type !== 'game' && e.type !== 'practice'
    )
  );

  /**
   * All non-game events (visits, camps, combines, showcases, other).
   * Used by the events section which excludes games and practice.
   */
  readonly nonGameEvents = computed(() =>
    this.events().filter((e: ProfileEvent) => e.type !== 'game' && e.type !== 'practice')
  );

  // ============================================
  // PUBLIC METHODS
  // ============================================

  // ============================================
  // PUBLIC METHODS — External Data Bridge
  // ============================================

  /**
   * Signal loading state externally.
   * Call this BEFORE making a platform-specific API request so the shell
   * immediately shows the skeleton loader.
   */
  startLoading(): void {
    this._isLoading.set(true);
    this._error.set(null);
    // Clear stale/mock data so the skeleton loader shows while fetching real data.
    // Without this, old mock data persists if the API call fails.
    this._profileData.set(null);
  }

  /**
   * Set an error state externally.
   * Call this when a platform-specific API request fails.
   */
  setError(message: string | null): void {
    this._error.set(message);
    this._isLoading.set(false);
    if (message) {
      this.toast.error(message);
    }
  }

  /**
   * Load profile data from an externally fetched source.
   *
   * Used by platform-specific wrappers (web / mobile) to inject real API data
   * into the shared UI state, bypassing the internal mock-data fallback.
   *
   * Pattern:
   * ```
   * // 1. Signal loading to the shell
   * uiProfileService.startLoading();
   * // 2. Fetch real data via platform API service
   * apiService.getProfile(unicode).subscribe(response => {
   *   const data = buildProfilePageData(response.data, isOwnProfile);
   *   // 3. Push into shared state — shell updates reactively
   *   uiProfileService.loadFromExternalData(data);
   * });
   * ```
   */
  loadFromExternalData(data: ProfilePageData, rawUser?: User, isOwn?: boolean): void {
    this.logger.info('Profile loaded from external data source', {
      profileCode: data.user?.profileCode,
      isOwnProfile: data.isOwnProfile,
    });
    // Store raw User so sport switching can re-map tab content reactively.
    if (rawUser !== undefined) {
      this._rawUser.set(rawUser);
      this._profileIsOwn = isOwn ?? data.isOwnProfile ?? false;
    }
    this._profileData.set(data);
    this._isLoading.set(false);
    this._error.set(null);
  }

  // ============================================
  // PUBLIC METHODS — Data Fetching (Internal / Mock)
  // ============================================

  /**
   * Load profile data by profile code.
   * @internal Uses mock data — replace TODO with real API call once backend is ready.
   *           For production web/mobile, prefer calling `startLoading()` then
   *           `loadFromExternalData()` with data fetched from the platform API service.
   */
  async loadProfile(profileCode: string, isOwnProfile = false): Promise<void> {
    this.logger.info('Loading profile (internal/mock)', { profileCode, isOwnProfile });
    this._isLoading.set(true);
    this._error.set(null);

    try {
      // TODO: Replace with actual API call
      await this.simulateDelay(800);

      const data = isOwnProfile ? getMockOwnProfileData() : MOCK_PROFILE_PAGE_DATA;
      this._profileData.set(data);
      this._activityFeedItems.set(MOCK_ACTIVITY_FEED_ITEMS);

      this.logger.info('Profile loaded successfully', { profileCode });
    } catch (err) {
      const message = parseApiError(err).message;
      this.logger.error('Failed to load profile', { profileCode, error: err });
      this.setError(message);
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Refresh profile data.
   */
  async refresh(): Promise<void> {
    const user = this.user();
    if (!user) return;

    await this.loadProfile(user.profileCode, this.isOwnProfile());
  }

  /**
   * Switch active tab.
   */
  setActiveTab(tab: ProfileTabId): void {
    this.logger.debug('Tab changed', { from: this._activeTab(), to: tab });
    this._activeTab.set(tab);
  }

  /**
   * Load more posts for infinite scroll.
   */
  async loadMorePosts(): Promise<void> {
    if (this._isLoadingMore()) return;

    this.logger.debug('Loading more posts');
    this._isLoadingMore.set(true);

    try {
      // TODO: Replace with actual API call
      await this.simulateDelay(500);
      // Would append more posts here
    } catch (err) {
      this.logger.error('Failed to load more posts', { error: err });
    } finally {
      this._isLoadingMore.set(false);
    }
  }

  /**
   * Toggle follow status.
   */
  async toggleFollow(): Promise<void> {
    const followStats = this.followStats();
    const data = this._profileData();
    if (!followStats || !data) return;

    const newIsFollowing = !followStats.isFollowing;
    const profileUserId = data.user?.uid || 'unknown';
    this.logger.info('Toggling follow', { isFollowing: newIsFollowing, userId: profileUserId });

    // Optimistic update
    this._profileData.set({
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

      // Track follow/unfollow event
      // Note: Analytics should be injected in platform-specific wrappers for best practice,
      // but we log here as a signal that tracking should occur
      this.logger.info(newIsFollowing ? 'User followed' : 'User unfollowed', {
        followed_user_id: profileUserId,
        event: newIsFollowing ? APP_EVENTS.USER_FOLLOWED : APP_EVENTS.USER_UNFOLLOWED,
      });
    } catch (err) {
      // Rollback on error
      this._profileData.set(data);
      this.logger.error('Failed to toggle follow', { error: err });
    }
  }

  /**
   * Switch to a different sport profile by index.
   */
  setActiveSportIndex(index: number): void {
    const sports = this.allSports();
    if (index >= 0 && index < sports.length) {
      this.logger.info('Sport profile switched', {
        from: this._activeSportIndex(),
        to: index,
        sport: sports[index]?.name,
      });
      this._activeSportIndex.set(index);

      // Re-map full profile data so tab content (stats, metrics, events, recruiting)
      // reflects the newly selected sport rather than the original load.
      const rawUser = this._rawUser();
      if (rawUser) {
        const remapped = userToProfilePageData(
          { ...rawUser, activeSportIndex: index } as User,
          this._profileIsOwn
        );
        this._profileData.set(remapped);
      }
    }
  }

  /**
   * Enter edit mode for a specific section.
   */
  enterEditMode(section?: string): void {
    this.logger.debug('Entering edit mode', { section });
    this._isEditMode.set(true);
    this._editSection.set(section ?? null);
  }

  /**
   * Exit edit mode.
   */
  exitEditMode(): void {
    this.logger.debug('Exiting edit mode');
    this._isEditMode.set(false);
    this._editSection.set(null);
  }

  /**
   * Reset all state.
   */
  reset(): void {
    this._isLoading.set(false);
    this._isLoadingMore.set(false);
    this._error.set(null);
    this._activeTab.set(PROFILE_DEFAULT_TAB);
    this._profileData.set(null);
    this._rawUser.set(null);
    this._profileIsOwn = false;
    this._activityFeedItems.set([]);
    this._isEditMode.set(false);
    this._editSection.set(null);
    this._activeSportIndex.set(0);
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
