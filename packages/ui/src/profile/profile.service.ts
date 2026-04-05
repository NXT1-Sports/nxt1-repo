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
  type ProfileSeasonGameLog,
  type AthleticStatsCategory,
  type AthleticStat,
  type VerifiedStat,
  type VerifiedMetric,
  type FeedPost,
  type User,
  type ScoutReport,
  type NewsArticle,
  PROFILE_DEFAULT_TAB,
  profileUserToFeedAuthor,
  buildUnifiedActivityFeed,
} from '@nxt1/core';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtToastService } from '../services/toast/toast.service';
import { type RankingSource } from './rankings/profile-rankings.component';

type ProfileUserTeamExtension = {
  readonly teamId?: string;
  readonly managedTeams?: readonly unknown[];
};

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly logger = inject(NxtLoggingService).child('ProfileService');
  private readonly toast = inject(NxtToastService);

  // Optional API service for persisting active sport index
  private api?: {
    updateActiveSportIndex: (
      userId: string,
      activeSportIndex: number
    ) => Promise<{
      success: boolean;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data?: any;
      error?: string;
    }>;
  };

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
  private readonly _error = signal<string | null>(null);
  private readonly _activeTab = signal<ProfileTabId>(PROFILE_DEFAULT_TAB);
  private readonly _profileData = signal<ProfilePageData | null>(null);
  private readonly _isEditMode = signal(false);
  private readonly _editSection = signal<string | null>(null);
  private readonly _activeSportIndex = signal(0);
  private readonly _rankings = signal<RankingSource[]>([]);
  private readonly _scoutReports = signal<readonly ScoutReport[]>([]);
  private readonly _newsArticles = signal<readonly NewsArticle[]>([]);
  private readonly _activityFeedItems = signal<readonly FeedPost[]>([]);
  /** Timeline posts loaded from the user’s timeline sub-collection */
  private readonly _timelinePosts = signal<readonly ProfilePost[]>([]);
  /** Videos loaded from the user’s videos sub-collection */
  private readonly _videoPosts = signal<readonly ProfilePost[]>([]); /**
   * Schedule events fetched from the API sub-collection.
   * `null` = not yet fetched (fall back to embedded sports[].upcomingEvents).
   * Non-null (even []) = authoritative API result; overrides embedded data.
   * Stored separately from _profileData so switchSport() cannnot overwrite it.
   */
  private readonly _scheduleEvents = signal<readonly ProfileEvent[] | null>(null);

  /**
   * Recruiting activities fetched from the Recruiting collection.
   * `null` = not yet fetched (fall back to embedded sports[].recruitingActivities).
   * Non-null (even []) = authoritative API result; overrides embedded data.
   * Stored separately from _profileData so switchSport() cannot overwrite it.
   */
  private readonly _recruitingActivities = signal<readonly ProfileRecruitingActivity[] | null>(
    null
  );
  private readonly _athleticStatsOverride = signal<readonly AthleticStatsCategory[] | null>(null);
  private readonly _metricsOverride = signal<readonly AthleticStatsCategory[] | null>(null);

  /**
   * Game logs fetched from the PlayerStats collection.
   * `null` = not yet fetched (fall back to embedded profile data).
   * Non-null (even []) = authoritative API result; overrides embedded data.
   */
  private readonly _gameLogOverride = signal<readonly ProfileSeasonGameLog[] | null>(null);

  /** Active season filter ('season' field value, or null = all) */
  private readonly _activeSeason = signal<string | null>(null);
  /** Active sportId filter (sport name/id, or null = all) */
  private readonly _activeSportFilter = signal<string | null>(null);

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

  /** Quick stats/analytics */
  readonly quickStats = computed(() => this._profileData()?.quickStats ?? null);

  /** Athletic stats by category */
  readonly athleticStats = computed(
    () => this._athleticStatsOverride() ?? this._profileData()?.athleticStats ?? []
  );

  /** Game log data — all seasons (MaxPreps-style game-by-game rows) */
  readonly gameLog = computed(() => this._gameLogOverride() ?? this._profileData()?.gameLog ?? []);

  /** Metrics (Combine/Measurables) by category */
  readonly metrics = computed(() => this._metricsOverride() ?? this._profileData()?.metrics ?? []);

  /** Pinned video/mixtape */
  readonly pinnedVideo = computed(() => this._profileData()?.pinnedVideo ?? null);

  /** All posts — sourced from the user's timeline sub-collection */
  readonly allPosts = computed(() => this._timelinePosts());

  /**
   * Filtered posts by active sport.
   * Only filters when the user has explicitly switched sport profiles.
   * Default (no explicit filter): shows ALL posts regardless of sport.
   */
  readonly filteredPosts = computed<readonly ProfilePost[]>(() => {
    const posts = this.allPosts();
    const sportFilter = this._activeSportFilter();

    // Only filter when user has explicitly selected a sport (via sport switcher).
    // Do NOT auto-filter by activeSport on initial load — posts may not be tagged.
    if (!sportFilter) return posts;

    return posts.filter((p) => {
      const postSport =
        (p as unknown as { sport?: string; sportId?: string }).sport ||
        (p as unknown as { sport?: string; sportId?: string }).sportId;
      // Posts without a sport tag are shown for all sports
      if (!postSport) return true;
      return postSport.toLowerCase() === sportFilter;
    });
  });

  /** Videos from the dedicated videos sub-collection (falls back to timeline video-type posts) */
  readonly videoPosts = computed<readonly ProfilePost[]>(() => {
    const dedicated = this._videoPosts();
    const sportFilter = this._activeSportFilter();

    let videos =
      dedicated.length > 0
        ? dedicated
        : this.allPosts().filter((p: ProfilePost) => p.type === 'video' || p.type === 'highlight');

    // Only filter when user has explicitly selected a sport (via sport switcher).
    // Videos without a sport tag are shown for all sports.
    if (sportFilter) {
      videos = videos.filter((v) => {
        const videoSport =
          (v as unknown as { sport?: string; sportId?: string }).sport ||
          (v as unknown as { sport?: string; sportId?: string }).sportId;
        if (!videoSport) return true;
        return videoSport.toLowerCase() === sportFilter;
      });
    }

    return videos;
  });

  /** Currently active season filter (null → all seasons shown) */
  readonly activeSeason = computed(() => this._activeSeason());

  /** Currently active sportId filter (null → active sport, no extra filter) */
  readonly activeSportFilter = computed(() => this._activeSportFilter());

  /**
   * Game log filtered by activeSeason.
   * When activeSeason is null all rows are returned unchanged.
   */
  readonly filteredGameLog = computed(() => {
    const log = this.gameLog();
    const season = this._activeSeason();
    if (!season) return log;
    return log.filter((entry) => String((entry as { season?: unknown }).season ?? '') === season);
  });

  /** Unique seasons available in the full game log (for season picker UI) */
  readonly availableSeasons = computed<readonly string[]>(() => {
    const seen = new Set<string>();
    for (const entry of this.gameLog()) {
      const s = String((entry as { season?: unknown }).season ?? '');
      if (s) seen.add(s);
    }
    return Array.from(seen).sort().reverse();
  });
  /** All recruiting activity (unified) - filtered by active sport */
  readonly recruitingActivity = computed<readonly ProfileRecruitingActivity[]>(() => {
    // Prioritize API-fetched recruiting over embedded sport data
    const apiActivities = this._recruitingActivities();
    const embeddedActivities =
      this._profileData()?.recruitingActivity ?? this._profileData()?.offers ?? [];

    // If API data exists (even if empty), use it; otherwise fall back to embedded
    const allActivity = apiActivities !== null ? apiActivities : embeddedActivities;

    const sportFilter = this._activeSportFilter();
    const activeSport = this.activeSport();
    const filterSport = sportFilter || activeSport?.name?.toLowerCase();

    if (!filterSport) return allActivity;

    return allActivity.filter((a) => {
      const activitySport = (a as unknown as { sport?: string }).sport;
      return activitySport?.toLowerCase() === filterSport;
    });
  });

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

  /** Scout reports from the user's scoutReports sub-collection - filtered by sport */
  readonly scoutReports = computed(() => {
    const allReports = this._scoutReports();
    const sportFilter = this._activeSportFilter();
    const activeSport = this.activeSport();
    const filterSport = sportFilter || activeSport?.name?.toLowerCase();

    if (!filterSport) return allReports;

    return allReports.filter((r) => {
      const reportSport =
        (r as unknown as { sport?: string }).sport ||
        (r as unknown as { sportId?: string }).sportId;
      return reportSport?.toLowerCase() === filterSport;
    });
  });

  /** News articles - filtered by sport */
  readonly newsArticles = computed(() => {
    const allNews = this._newsArticles();
    const sportFilter = this._activeSportFilter();

    // Only filter when user has explicitly selected a sport (via sport switcher).
    // News without a sport tag are shown for all sports.
    if (!sportFilter) return allNews;

    return allNews.filter((n) => {
      const newsSport =
        (n as unknown as { sport?: string }).sport ||
        (n as unknown as { sportId?: string }).sportId;
      if (!newsSport) return true;
      return newsSport.toLowerCase() === sportFilter;
    });
  });

  /**
   * Awards list - filtered by active sport
   * Shows all awards when no sport filter is set, or filters by sport when switching profiles
   */
  readonly awards = computed(() => {
    const allAwards = this._profileData()?.user?.awards ?? [];
    const sportFilter = this._activeSportFilter();
    const activeSport = this.activeSport();
    const filterSport = sportFilter || activeSport?.name?.toLowerCase();

    // If no sport filter or award doesn't have sport field, show all
    if (!filterSport) return allAwards;

    // Filter awards by sport
    return allAwards.filter((award) => {
      if (!award.sport) return true; // Show general awards (no sport specified)
      return award.sport.toLowerCase() === filterSport;
    });
  });

  /**
   * Team affiliations - filtered by active sport
   * Shows team affiliations for the currently active sport
   */
  readonly teamAffiliations = computed(() => {
    const allAffiliations = this._profileData()?.user?.teamAffiliations ?? [];
    const sportFilter = this._activeSportFilter();
    const activeSport = this.activeSport();
    const filterSport = sportFilter || activeSport?.name?.toLowerCase();

    // If no sport filter, show all affiliations
    if (!filterSport) return allAffiliations;

    // Filter team affiliations by sport
    return allAffiliations.filter((team) => {
      if (!team.sport) return true; // Show general teams (no sport specified)
      return team.sport.toLowerCase() === filterSport;
    });
  });

  /** Events list (schedule items — games, practices, etc.)
   * Prefers API-fetched _scheduleEvents when available (non-null),
   * falls back to embedded sports[].upcomingEvents from _profileData.
   * Filtered by active sport.
   */
  readonly events = computed(() => {
    const allEvents = this._scheduleEvents() ?? this._profileData()?.events ?? [];
    const sportFilter = this._activeSportFilter();
    const activeSport = this.activeSport();
    const filterSport = sportFilter || activeSport?.name?.toLowerCase();

    if (!filterSport) return allEvents;

    return allEvents.filter((e) => {
      const eventSport = (e as unknown as { sport?: string }).sport;
      return eventSport?.toLowerCase() === filterSport;
    });
  });

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
    const sportFilter = this._activeSportFilter();

    // Apply sport filter when user has explicitly selected a sport profile.
    // Posts without a sport tag are always included (general content).
    let posts = this._timelinePosts();
    if (sportFilter) {
      posts = posts.filter((p) => {
        const postSport =
          (p as unknown as { sport?: string; sportId?: string }).sport ||
          (p as unknown as { sport?: string; sportId?: string }).sportId;
        if (!postSport) return true;
        return postSport.toLowerCase() === sportFilter;
      });
    }

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
  readonly profileImgs = computed<readonly string[]>(() => {
    const user = this._profileData()?.user;
    if (!user) return [];
    return user.profileImgs ?? [];
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

  /** News posts only */
  readonly newsPosts = computed(() =>
    this.allPosts().filter((p: ProfilePost) => p.type === 'news')
  );

  /** Pinned posts */
  readonly pinnedPosts = computed(() => this.allPosts().filter((p: ProfilePost) => p.isPinned));

  /**
   * Whether the user genuinely has no posts at all.
   * Based on allPosts (unfiltered) so sport-filter doesn't hide the "Create" CTA.
   * For sport-filtered empty state, ProfileTimelineComponent.isFilteredEmpty handles it.
   */
  readonly isEmpty = computed(() => this.allPosts().length === 0);

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
    return {
      intel: 0,
      timeline: this.allPosts().length,
      connect: 0,
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
    // Clear stale sub-collection data from previous profile (singleton service).
    this._timelinePosts.set([]);
    this._videoPosts.set([]);
    this._rankings.set([]);
    this._scoutReports.set([]);
    this._scheduleEvents.set(null);
    this._recruitingActivities.set(null);
    this._athleticStatsOverride.set(null);
    this._metricsOverride.set(null);
    this._gameLogOverride.set(null);
    this._newsArticles.set([]);
    this._activeSeason.set(null);
    this._activeSportFilter.set(null);
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
   * Push videos loaded from the user’s videos sub-collection.
   * Called by the platform wrapper after fetching GET /auth/profile/:userId/videos.
   */
  setVideoPosts(videos: readonly ProfilePost[]): void {
    this._videoPosts.set(videos);
  }

  /**
   * Set active season filter.
   * Pass null to clear the filter and show all seasons.
   */
  setActiveSeason(season: string | null): void {
    this._activeSeason.set(season);
  }

  /**
   * Set active sportId/sport-name filter for sub-collection data.
   * Pass null to clear the filter.
   */
  setActiveSportFilter(sportId: string | null): void {
    this._activeSportFilter.set(sportId);
  }

  /**
   * Push timeline posts loaded from the user’s timeline sub-collection.
   * Called by the platform wrapper after fetching GET /auth/profile/:userId/timeline.
   */
  setTimelinePosts(posts: readonly ProfilePost[]): void {
    this._timelinePosts.set(posts);
  }

  /**
   * Push rankings from the user's rankings sub-collection.
   * Called by the platform wrapper after fetching GET /auth/profile/:userId/rankings.
   */
  setRankings(rankings: RankingSource[]): void {
    this._rankings.set(rankings);
  }

  /**
   * Push scout reports from the user's scoutReports sub-collection.
   * Called by the platform wrapper after fetching GET /auth/profile/:userId/scout-reports.
   */
  setScoutReports(reports: readonly ScoutReport[]): void {
    this._scoutReports.set(reports);
  }

  /**
   * Push news articles from the user's news sub-collection.
   * Called by the platform wrapper after fetching GET /auth/profile/:userId/news.
   */
  setNewsArticles(articles: readonly NewsArticle[]): void {
    this._newsArticles.set(articles);
  }

  /**
   * Store schedule events fetched from GET /auth/profile/:userId/schedule.
   * Stored in a separate signal so sport-switching (switchSport) cannot
   * overwrite API data by re-running userToProfilePageData.
   * Non-null value overrides the embedded sports[].upcomingEvents data.
   */
  setScheduleEvents(events: readonly ProfileEvent[]): void {
    this._scheduleEvents.set(events);
  }

  /**
   * Store recruiting activities fetched from GET /auth/profile/:userId/recruiting.
   * Stored in a separate signal so sport-switching (switchSport) cannot
   * overwrite API data by re-running userToProfilePageData.
   * Non-null value overrides the embedded sports[].recruitingActivities data.
   */
  setRecruitingActivities(activities: readonly ProfileRecruitingActivity[]): void {
    this._recruitingActivities.set(activities);
  }

  private mapVerifiedStatsToCategories(
    stats: readonly VerifiedStat[]
  ): readonly AthleticStatsCategory[] {
    const groups = new Map<string, AthleticStat[]>();

    for (const stat of stats) {
      const category = stat.category
        ? stat.category.charAt(0).toUpperCase() + stat.category.slice(1)
        : 'General';
      const label = stat.season ? `${stat.label} (${stat.season})` : stat.label;
      const mapped: AthleticStat = {
        label,
        value: String(stat.value),
        unit: stat.unit,
        verified: stat.verified,
      };

      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(mapped);
    }

    return Array.from(groups.entries()).map(([name, groupedStats]) => ({
      name,
      stats: groupedStats,
    }));
  }

  private mapVerifiedMetricsToCategories(
    metrics: readonly VerifiedMetric[]
  ): readonly AthleticStatsCategory[] {
    const groups = new Map<string, AthleticStat[]>();

    for (const metric of metrics) {
      const category = metric.category
        ? metric.category.charAt(0).toUpperCase() + metric.category.slice(1)
        : 'General';
      const mapped: AthleticStat = {
        label: metric.label,
        value: String(metric.value),
        unit: metric.unit,
        verified: metric.verified,
      };

      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(mapped);
    }

    return Array.from(groups.entries()).map(([name, groupedStats]) => ({
      name,
      stats: groupedStats,
    }));
  }

  setAthleticStatsFromRaw(stats: readonly VerifiedStat[]): void {
    this._athleticStatsOverride.set(this.mapVerifiedStatsToCategories(stats));
  }

  setGameLogs(gameLogs: readonly ProfileSeasonGameLog[]): void {
    this._gameLogOverride.set(gameLogs);
  }

  setMetricsFromRaw(metrics: readonly VerifiedMetric[]): void {
    this._metricsOverride.set(this.mapVerifiedMetricsToCategories(metrics));
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
  /**
   * Set the API service for persisting active sport index.
   * Platform-specific code should call this during initialization.
   */
  setApiService(api: {
    updateActiveSportIndex: (
      userId: string,
      activeSportIndex: number
    ) => Promise<{
      success: boolean;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data?: any;
      error?: string;
    }>;
  }): void {
    this.api = api;
  }

  loadFromExternalData(data: ProfilePageData, rawUser?: User, _isOwn?: boolean): void {
    this.logger.info('Profile loaded from external data source', {
      profileCode: data.user?.profileCode,
      isOwnProfile: data.isOwnProfile,
    });
    // Store raw User so sport switching can re-map tab content reactively.
    if (rawUser !== undefined) {
      this._rawUser.set(rawUser);
    }
    this._profileData.set(data);
    this._isLoading.set(false);
    this._error.set(null);
  }

  // ============================================
  // PUBLIC METHODS — Data Fetching
  // ============================================

  /**
   * Refresh profile data.
   * Emits a log warning — callers should use startLoading() + loadFromExternalData()
   * via the platform-specific API service to re-fetch.
   */
  async refresh(): Promise<void> {
    this.logger.warn(
      'refresh() called on ProfileService — platform shell should handle re-fetch via loadFromExternalData()'
    );
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
    this.logger.warn(
      'loadMorePosts() called — platform shell should implement pagination via the API service.'
    );
  }

  /**
   * Switch to a different sport profile by index.
   * Automatically updates sport filter so all tabs show content for the selected sport.
   * Persists the selection to the database if API service is configured.
   *
   * Note: This does NOT remap the sports array - it preserves the original order.
   * The activeSportIndex simply points to the selected sport in the array.
   */
  async setActiveSportIndex(index: number): Promise<void> {
    const sports = this.allSports();
    if (index >= 0 && index < sports.length) {
      const selectedSport = sports[index];

      this.logger.info('Sport profile switched', {
        from: this._activeSportIndex(),
        to: index,
        sport: selectedSport?.name,
      });

      // Update sport filter to match selected sport (for cross-tab filtering)
      this._activeSportFilter.set(selectedSport?.name?.toLowerCase() ?? null);

      // Set the active sport index directly - NO remapping
      // This preserves the original sports array order
      this._activeSportIndex.set(index);

      // Persist to database if API service is configured and we have a user ID
      const userId = this.user()?.uid;
      if (this.api?.updateActiveSportIndex && userId) {
        try {
          const result = await this.api.updateActiveSportIndex(userId, index);
          if (result.success) {
            this.logger.info('Active sport index persisted to database', {
              userId,
              activeSportIndex: index,
              sportName: result.data?.sportName,
            });
          } else {
            this.logger.warn('Failed to persist active sport index', {
              userId,
              activeSportIndex: index,
              error: result.error,
            });
          }
        } catch (err) {
          this.logger.error('Error persisting active sport index', {
            userId,
            activeSportIndex: index,
            error: err,
          });
        }
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
    this._activityFeedItems.set([]);
    this._isEditMode.set(false);
    this._editSection.set(null);
    this._activeSportIndex.set(0);
    this._videoPosts.set([]);
    this._athleticStatsOverride.set(null);
    this._metricsOverride.set(null);
    this._gameLogOverride.set(null);
    this._activeSeason.set(null);
    this._activeSportFilter.set(null);
    this._scheduleEvents.set(null);
    this._recruitingActivities.set(null);
    this._newsArticles.set([]);
  }
}
