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
  type ProfileEvent,
  type ProfileStatItem,
  PROFILE_DEFAULT_TAB,
} from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { NxtLoggingService } from '../services/logging/logging.service';
import { MOCK_PROFILE_PAGE_DATA, getMockOwnProfileData } from './profile.mock-data';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly logger = inject(NxtLoggingService).child('ProfileService');

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _isLoading = signal(false);
  private readonly _isLoadingMore = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _activeTab = signal<ProfileTabId>(PROFILE_DEFAULT_TAB);
  private readonly _profileData = signal<ProfilePageData | null>(null);
  private readonly _isEditMode = signal(false);
  private readonly _editSection = signal<string | null>(null);

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

  /** Pinned video/mixtape */
  readonly pinnedVideo = computed(() => this._profileData()?.pinnedVideo ?? null);

  /** All posts */
  readonly allPosts = computed(() => this._profileData()?.recentPosts ?? []);

  /** Offers list */
  readonly offers = computed(() => this._profileData()?.offers ?? []);

  /** Events list */
  readonly events = computed(() => this._profileData()?.events ?? []);

  /** Whether viewing own profile */
  readonly isOwnProfile = computed(() => this._profileData()?.isOwnProfile ?? false);

  /** Whether can edit profile */
  readonly canEdit = computed(() => this._profileData()?.canEdit ?? false);

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
        icon: 'eye-outline',
      },
      {
        key: 'videoViews',
        label: 'Video Views',
        value: stats.videoViews,
        icon: 'play-circle-outline',
      },
      {
        key: 'offerCount',
        label: 'Offers',
        value: stats.offerCount,
        icon: 'trophy-outline',
      },
      {
        key: 'highlightCount',
        label: 'Highlights',
        value: stats.highlightCount,
        icon: 'videocam-outline',
      },
      {
        key: 'collegeInterestCount',
        label: 'College Interest',
        value: stats.collegeInterestCount,
        icon: 'school-outline',
      },
      {
        key: 'shareCount',
        label: 'Shares',
        value: stats.shareCount,
        icon: 'share-social-outline',
      },
    ];
  });

  /** Tab badge counts */
  readonly tabBadges = computed(() => {
    const offers = this.offers();
    const events = this.events();

    return {
      timeline: this.allPosts().length,
      videos: this.videoPosts().length,
      offers: offers.length,
      stats: 0,
      events: events.length,
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

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Load profile data by profile code.
   */
  async loadProfile(profileCode: string, isOwnProfile = false): Promise<void> {
    this.logger.info('Loading profile', { profileCode, isOwnProfile });
    this._isLoading.set(true);
    this._error.set(null);

    try {
      // TODO: Replace with actual API call
      await this.simulateDelay(800);

      const data = isOwnProfile ? getMockOwnProfileData() : MOCK_PROFILE_PAGE_DATA;
      this._profileData.set(data);

      this.logger.info('Profile loaded successfully', { profileCode });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load profile';
      this._error.set(message);
      this.logger.error('Failed to load profile', { profileCode, error: err });
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
    const profileUserId = data.user?.id || 'unknown';
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
    this._isEditMode.set(false);
    this._editSection.set(null);
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
