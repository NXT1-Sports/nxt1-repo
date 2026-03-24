/**
 * @fileoverview Profile Feature - Mobile Wrapper
 * @module @nxt1/mobile/features/profile
 *
 * Thin mobile wrapper for profile functionality.
 * All UI logic lives in @nxt1/ui - this just handles mobile-specific concerns.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                 apps/mobile/profile (~5%)                   │
 * │     Mobile-specific: Routes, deep links, native features    │
 * ├─────────────────────────────────────────────────────────────┤
 * │              @nxt1/ui/profile (~95% shared)                 │
 * │        ProfileShellComponent + all UI components            │
 * ├─────────────────────────────────────────────────────────────┤
 * │         Role-Aware Profile (2026 Pattern)                   │
 * │  Coach/Director → TeamProfileShellWebComponent              │
 * │  Athlete/Parent → ProfileShellComponent                     │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Responsibilities:
 * - Route integration with mobile tabs
 * - User state from auth service
 * - Role-aware shell selection (athlete profile vs team profile)
 * - Native navigation (including edit profile bottom sheet)
 * - Deep link handling (future)
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  signal,
  DestroyRef,
  effect,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal, toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map, distinctUntilChanged, switchMap, tap, from, of, combineLatest, filter } from 'rxjs';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';

// Shared UI from @nxt1/ui (95% of the code)
import {
  ProfileShellComponent,
  RelatedAthletesComponent,
  EditProfileBottomSheetService,
  ManageTeamModalService,
  NxtSidenavService,
  ProfileService as UiProfileService,
  userToProfilePageData,
  NxtRefresherComponent,
  ProfileGenerationOverlayComponent,
  ProfileGenerationStateService,
  TeamProfileShellWebComponent,
  TeamProfileService,
  QrCodeService,
  NxtToastService,
  NxtLoggingService,
  NxtBreadcrumbService,
  type RelatedAthlete,
  type RankingSource,
  type RefreshEvent,
  type TeamSearchResult,
} from '@nxt1/ui';
import { parseApiError, requiresAuth, isTeamRole } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import type { User, UserSummary, ProfileTabId, ProfileTeamAffiliation } from '@nxt1/core';
import type { ProfileEvent } from '@nxt1/core/profile';
import type { TeamProfileTabId, TeamProfileRosterMember, TeamProfilePost } from '@nxt1/core';

// Mobile-specific services
import { MobileAuthService } from '../auth/services/mobile-auth.service';
import { AuthFlowService } from '../auth/services';
import { ShareService } from '../../core/services/share.service';
import { ProfileApiService } from '../../core/services/profile-api.service';
import { EditProfileApiService } from '../../core/services/edit-profile-api.service';
import { MobileEmailConnectionService } from '../activity/services/email-connection.service';
import { TeamProfileApiService } from '../../core/services/team-profile-api.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { CapacitorHttpAdapter } from '../../core/infrastructure';
import { environment } from '../../../environments/environment';

/**
 * Mobile Profile Feature Component
 *
 * Role-aware wrapper that:
 * 1. Extracts unicode from route params
 * 2. Provides current user from auth state
 * 3. Detects coach/director → renders TeamProfileShellWebComponent
 * 4. Detects athlete/parent → renders ProfileShellComponent
 * 5. Handles edit profile via bottom sheet
 *
 * Professional pattern (Instagram Business / LinkedIn):
 * Same /profile URL, different shell based on user role.
 * No URL redirect, no tab bar flicker, seamless switch.
 */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    IonHeader,
    IonContent,
    IonToolbar,
    ProfileShellComponent,
    TeamProfileShellWebComponent,
    RelatedAthletesComponent,
    NxtRefresherComponent,
    ProfileGenerationOverlayComponent,
  ],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt-refresher (onRefresh)="handleRefresh($event)" />

      @if (showTeamProfile()) {
        <!-- Coach/Director own profile → Team Profile Shell -->
        <nxt1-team-profile-shell-web
          [teamSlug]="teamSlug()"
          [isTeamAdmin]="true"
          [skipInternalLoad]="true"
          (backClick)="onBackClick()"
          (tabChange)="onTeamTabChange($event)"
          (shareClick)="onTeamShare()"
          (followClick)="onFollow()"
          (qrCodeClick)="onTeamQrCode()"
          (manageTeamClick)="onManageTeam()"
          (rosterMemberClick)="onRosterMemberClick($event)"
          (postClick)="onTeamPostClick($event)"
        />
      } @else {
        <!-- Athlete/Parent profile (or viewing someone else's profile) -->
        <nxt1-profile-shell
          [currentUser]="currentUser()"
          [profileUnicode]="profileUnicode()"
          [isOwnProfile]="isOwnProfile()"
          [skipInternalLoad]="true"
          (avatarClick)="onAvatarClick()"
          (menuClick)="onMenuClick()"
          (backClick)="onBackClick()"
          (tabChange)="onTabChange($event)"
          (editProfileClick)="onEditProfile()"
          (teamClick)="onTeamClick($event)"
          (shareClick)="onShare()"
          (copyLinkClick)="onCopyLink()"
          (followClick)="onFollow()"
          (qrCodeClick)="onQrCode()"
          (aiSummaryClick)="onAiSummary()"
          (createPostClick)="onCreatePost()"
          (refreshRequest)="onRefreshRequest()"
        />

        @if (relatedAthletes().length > 0) {
          <nxt1-related-athletes
            [athletes]="relatedAthletes()"
            [sport]="relatedSport()"
            [state]="relatedState()"
            (athleteClick)="onRelatedAthleteClick($event)"
            (seeAllClick)="onSeeAllRelated()"
          />
        }
      }
    </ion-content>

    @if (generation.isGenerating()) {
      <nxt1-profile-generation-overlay (dismissed)="onGenerationDismissed($event)" />
    }
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    ion-header {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: -1;
      --background: transparent;
    }
    ion-toolbar {
      --background: transparent;
      --min-height: 0;
      --padding-top: 0;
      --padding-bottom: 0;
    }
    ion-content {
      --background: var(--nxt1-color-bg-primary, #0a0a0a);
    }
    ion-content::part(scroll) {
      overflow: visible;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent {
  // ============================================
  // DEPENDENCIES
  // ============================================

  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(MobileAuthService);
  private readonly editProfileSheet = inject(EditProfileBottomSheetService);
  private readonly manageTeamModal = inject(ManageTeamModalService);
  private readonly navController = inject(NavController);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly uiProfileService = inject(UiProfileService);
  private readonly profileApiService = inject(ProfileApiService);
  private readonly editProfileApiService = inject(EditProfileApiService);
  private readonly shareService = inject(ShareService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly http = inject(CapacitorHttpAdapter);
  private readonly emailConnection = inject(MobileEmailConnectionService);
  private readonly authFlow = inject(AuthFlowService);
  protected readonly generation = inject(ProfileGenerationStateService);

  // Team profile dependencies (for coach/director own-profile view)
  private readonly teamProfile = inject(TeamProfileService);
  private readonly teamApi = inject(TeamProfileApiService);
  private readonly qrCode = inject(QrCodeService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ProfileComponent');
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  // ============================================
  // STATE
  // ============================================

  protected readonly relatedAthletes = signal<RelatedAthlete[]>([]);
  private readonly fetchedProfile = signal<User | null>(null);
  protected readonly relatedSport = computed<string>(() => {
    const profile = this.fetchedProfile();
    const activeSport = profile?.sports?.[profile.activeSportIndex ?? 0] ?? profile?.sports?.[0];
    return activeSport?.sport || 'Football';
  });

  /** State/region context for the Related Athletes section */
  protected readonly relatedState = computed<string>(() => {
    return this.fetchedProfile()?.location?.state || 'your area';
  });

  /** Whether current user is viewing their own profile */
  protected readonly isOwnProfile = signal(false);

  /**
   * Whether to show the team profile shell instead of the athlete profile.
   * True when: viewing own profile AND user has a team role (coach/director).
   */
  protected readonly showTeamProfile = computed(() => {
    const profile = this.fetchedProfile();
    return this.isOwnProfile() && !!profile && isTeamRole(profile.role);
  });

  /**
   * Team slug extracted from the user's teamCode.
   * Used as input for TeamProfileShellWebComponent.
   */
  protected readonly teamSlug = computed(() => {
    const profile = this.fetchedProfile();
    // Prefer teamCode.slug, fall back to teamCode.unicode or managedTeamCodes[0]
    return (
      profile?.teamCode?.slug ??
      profile?.teamCode?.unicode ??
      profile?.coach?.managedTeamCodes?.[0] ??
      ''
    );
  });

  /** Resolved unicode from fetched profile — empty string while loading */
  protected readonly resolvedUnicode = signal('');

  /**
   * Raw route param — empty string means own profile (/profile),
   * numeric string means profile by unicode/ID, other string means username.
   */
  protected readonly routeParam = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('unicode') ?? '')),
    { initialValue: '' }
  );

  /**
   * Forwarded to ProfileShellComponent as profileUnicode input.
   * Uses resolved unicode from fetched profile (not raw route param).
   * Falls back to auth user's unicode while loading own profile.
   */
  protected readonly profileUnicode = this.resolvedUnicode;

  /** Current authenticated user for header display */
  protected readonly currentUser = computed(() => {
    if (this.isOwnProfile()) {
      const user = this.authService.user();
      if (!user) return null;
      return {
        profileImg: user.profileImg ?? null,
        displayName: user.displayName ?? 'User',
      };
    } else {
      const profile = this.fetchedProfile();
      if (!profile) return null;
      return {
        profileImg: profile.profileImgs?.[0] ?? null,
        displayName: `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() || 'Athlete',
      };
    }
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.uiProfileService.startLoading();
      this.teamProfile.startLoading();
    });

    this.uiProfileService.setApiService({
      updateActiveSportIndex: (userId: string, activeSportIndex: number) =>
        this.editProfileApiService.updateActiveSportIndex(userId, activeSportIndex),
    });

    // CRITICAL: Clear old profile data immediately when route params change
    // This effect runs synchronously when routeParam changes, BEFORE the
    // combineLatest pipe executes, preventing old data flash.
    effect(() => {
      this.routeParam();
      // Trigger on any param change (including undefined → value transitions)
      // startLoading() will clear all old data synchronously
      this.uiProfileService.startLoading();
    });

    /**
     * Bridge: fetch real API data → push into UIProfileService.
     * distinctUntilChanged prevents duplicate fetches when signals re-emit
     * with same unicode. switchMap cancels any previous in-flight request.
     */
    // Wait for auth to finish initializing before reacting to route changes.
    // Without this, the first emit happens before auth.user() is populated,
    // causing "Not authenticated" on /profile (own profile route).
    const authReady$ = toObservable(this.authService.isInitialized).pipe(
      filter((initialized) => initialized)
    );

    combineLatest([toObservable(this.routeParam).pipe(distinctUntilChanged()), authReady$])
      .pipe(
        map(([param]) => param),
        distinctUntilChanged(),
        tap(() => this.uiProfileService.startLoading()),
        switchMap((param) => {
          const authUser = this.authService.user();

          // Case 1: /profile — load own profile via auth UID
          if (!param) {
            if (!authUser?.uid) {
              return of({
                success: false as const,
                error: 'Not authenticated',
                _isOwnProfile: true,
              });
            }
            return from(this.profileApiService.getMe()).pipe(
              map((res) => ({ ...res, _isOwnProfile: true }))
            );
          }

          // Case 2: numeric unicode — lookup by unicode
          if (/^\d+$/.test(param)) {
            return from(this.profileApiService.getProfileByUnicode(param)).pipe(
              map((res) => ({
                ...res,
                _isOwnProfile: !!(res.success && res.data && res.data.id === authUser?.uid),
              }))
            );
          }

          // Case 3: Firebase UID (20-32 alphanum chars, mixed case) — lookup by userId
          if (/^[a-zA-Z0-9]{20,32}$/.test(param) && /[a-zA-Z]/.test(param) && /[0-9]/.test(param)) {
            return from(this.profileApiService.getProfile(param)).pipe(
              map((res) => ({
                ...res,
                _isOwnProfile: !!(res.success && res.data && res.data.id === authUser?.uid),
              }))
            );
          }

          // Case 4: username — lookup by username
          return from(this.profileApiService.getProfileByUsername(param)).pipe(
            map((res) => ({
              ...res,
              _isOwnProfile: !!(res.success && res.data && res.data.id === authUser?.uid),
            }))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            const profile = response.data;
            this.fetchedProfile.set(profile);
            const isOwn = response._isOwnProfile;
            this.isOwnProfile.set(isOwn);
            this.resolvedUnicode.set(profile.unicode ?? profile.id ?? '');

            // Role-aware branching: coach/director own profile → load team data
            if (isOwn && isTeamRole(profile.role)) {
              this.breadcrumb.trackStateChange('profile:team_profile_loading', {
                role: profile.role,
              });
              void this.loadTeamProfile(profile);
            } else {
              this.breadcrumb.trackStateChange('profile:athlete_profile_loaded', { isOwn });
              // Standard athlete/parent profile flow
              const profilePageData = userToProfilePageData(profile, isOwn);
              this.uiProfileService.loadFromExternalData(profilePageData, profile, isOwn);
              this.fetchRelatedAthletes(profile);
              const activeSport =
                profile.sports?.[profile.activeSportIndex ?? 0] ?? profile.sports?.[0];
              const sportId = activeSport?.sport?.toLowerCase();
              this.fetchSubCollections(profile.id, sportId).catch((err) => {
                this.logger.error('Failed to fetch sub-collections', err, { userId: profile.id });
              });
              // Initialize isFollowing state — run separately so it doesn't block
              // sub-collection loading and cannot race with optimistic follow toggles.
              if (!isOwn && this.authService.isAuthenticated()) {
                this.profileApiService
                  .checkFollow(profile.id)
                  .then((res) => {
                    if (res.success) {
                      this.uiProfileService.setFollowState(res.data?.isFollowing ?? false);
                    }
                  })
                  .catch(() => {
                    /* silent — follow state defaults to false */
                  });
              }
            }
          } else {
            this.uiProfileService.setError(response.error ?? 'Failed to load profile');
          }
        },
        error: (err: unknown) => {
          const parsed = parseApiError(err);
          this.uiProfileService.setError(parsed.message);
          if (requiresAuth(err)) {
            void this.authService.signOut();
          }
        },
      });
  }

  // ============================================
  // ACTIONS
  // ============================================

  /**
   * Load team profile data for coach/director own-profile view.
   * Extracts team slug from user document → fetches via TeamProfileApiService
   * → pushes into TeamProfileService for the shell to render.
   */
  private async loadTeamProfile(profile: User): Promise<void> {
    const slug =
      profile.teamCode?.slug ?? profile.teamCode?.unicode ?? profile.coach?.managedTeamCodes?.[0];

    if (!slug) {
      this.logger.warn('Coach/director has no team slug', { userId: profile.id });
      this.teamProfile.setError('No team associated with this account');
      return;
    }

    this.teamProfile.startLoading();

    try {
      const response = await this.teamApi.getTeamBySlug(slug);
      if (response.success && response.data) {
        this.teamProfile.loadFromExternalData(response.data);
        this.logger.info('Team profile loaded for own-profile view', {
          slug,
          teamName: response.data.team?.teamName,
        });

        this.analyticsService.trackEvent(APP_EVENTS.TEAM_PAGE_VIEWED, {
          team_id: response.data.team?.id,
          team_slug: slug,
          team_name: response.data.team?.teamName,
          sport: response.data.team?.sport,
          context: 'own_profile',
        });
      } else {
        this.teamProfile.setError(response.error ?? 'Failed to load team profile');
        this.logger.error('Team profile API error', { slug, error: response.error });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load team profile';
      this.teamProfile.setError(message);
      this.logger.error('Team profile fetch failed', err, { slug });
    }
  }

  /**
   * Fetch timeline, rankings, scout reports, videos, schedule, news in parallel.
   * Mirrors the web forkJoin pattern — all sub-collections loaded after the main profile.
   * @param userId - User ID to fetch data for
   * @param sportId - Optional sport filter (e.g. 'football', 'basketball') for schedule events
   */
  private async fetchSubCollections(userId: string, sportId?: string): Promise<void> {
    const [stats, gameLogs, metrics, timeline, rankings, scoutReports, videos, schedule, news] =
      await Promise.all([
        sportId
          ? this.profileApiService.getProfileStats(userId, sportId)
          : Promise.resolve({ success: false as const, data: [] }),
        sportId
          ? this.profileApiService.getProfileGameLogs(userId, sportId)
          : Promise.resolve({ success: false as const, data: [] }),
        sportId
          ? this.profileApiService.getProfileMetrics(userId, sportId)
          : Promise.resolve({ success: false as const, data: [] }),
        this.profileApiService.getProfileTimeline(userId),
        this.profileApiService.getProfileRankings(userId),
        this.profileApiService.getProfileScoutReports(userId),
        this.profileApiService.getProfileVideos(userId),
        this.profileApiService.getProfileSchedule(userId, sportId),
        this.profileApiService.getProfileNews(userId),
      ]);

    if (stats.success) {
      this.uiProfileService.setAthleticStatsFromRaw(stats.data);
    } else if (sportId) {
      this.logger.warn('Failed to load profile stats', { userId, sportId });
    }
    if (gameLogs.success) {
      this.uiProfileService.setGameLogs(gameLogs.data);
    } else if (sportId) {
      this.logger.warn('Failed to load profile game logs', { userId, sportId });
    }
    if (metrics.success) {
      this.uiProfileService.setMetricsFromRaw(metrics.data);
    } else if (sportId) {
      this.logger.warn('Failed to load profile metrics', { userId, sportId });
    }

    if (timeline.success) this.uiProfileService.setTimelinePosts(timeline.data);
    if (rankings.success && rankings.data.length > 0) {
      this.uiProfileService.setRankings(rankings.data as unknown as RankingSource[]);
    }
    if (scoutReports.success) this.uiProfileService.setScoutReports(scoutReports.data);
    if (videos.success) this.uiProfileService.setVideoPosts(videos.data);
    if (news.success) this.uiProfileService.setNewsArticles(news.data);

    // Always call setScheduleEvents when API succeeds, even for empty arrays.
    // This ensures _scheduleEvents is non-null and overrides embedded mock data.
    // If we don't call it, _scheduleEvents stays null → events computed falls back to mock.
    if (schedule.success) {
      const SCHEDULE_TYPE_MAP: Record<string, ProfileEvent['type']> = {
        game: 'game',
        camp: 'camp',
        visit: 'visit',
        practice: 'practice',
        tournament: 'game',
        combine: 'combine',
        showcase: 'showcase',
      };
      const events: ProfileEvent[] = schedule.data.map((raw) => ({
        id: String(raw['id'] ?? ''),
        type: SCHEDULE_TYPE_MAP[String(raw['eventType'] ?? '')] ?? 'other',
        name: String(raw['title'] ?? raw['name'] ?? ''),
        location: String(raw['location'] ?? ''),
        startDate: raw['date'] ? String(raw['date']) : new Date().toISOString(),
        opponent: raw['opponent'] ? String(raw['opponent']) : undefined,
        result: raw['result'] ? String(raw['result']) : undefined,
      }));
      this.uiProfileService.setScheduleEvents(events);
    } else {
      this.logger.warn('Schedule API failed', { userId });
    }
  }

  /**
   * Fetch related athletes dynamically based on current profile's sport + state.
   * Uses CapacitorHttpAdapter (same as all other mobile API calls).
   * Scoring: same sport (+2), same state (+1) → top 8.
   */
  private async fetchRelatedAthletes(profile: User): Promise<void> {
    const activeSport = profile.sports?.[profile.activeSportIndex ?? 0] ?? profile.sports?.[0];
    const sport = activeSport?.sport?.toLowerCase();
    const state = profile.location?.state;

    try {
      const response = await this.http.get<{ success: boolean; data: UserSummary[] }>(
        `${environment.apiUrl}/auth/profile/search?limit=50`
      );

      if (!response.success) return;

      const scored = response.data
        .filter((u) => u.id !== profile.id && !!u.firstName)
        .map((u) => {
          const uSport = u.primarySport?.toLowerCase();
          const uState = u.location?.state;
          const score = (sport && uSport === sport ? 2 : 0) + (state && uState === state ? 1 : 0);
          return { u, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

      const athletes: RelatedAthlete[] = scored.map(({ u }) => ({
        id: u.id,
        unicode: u.unicode ?? u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        profileImg: u.profileImgs?.[0] ?? null,
        sport: u.primarySport ?? '',
        position: u.primaryPosition ?? '',
        classYear: u.classOf ? String(u.classOf) : '',
        school: '',
        state: u.location?.state ?? '',
        isVerified: u.verificationStatus === 'verified',
        matchReason:
          sport && u.primarySport?.toLowerCase() === sport
            ? `Same sport · ${u.primarySport}`
            : state && u.location?.state === state
              ? `Same state · ${state}`
              : 'Similar profile',
      }));

      this.relatedAthletes.set(athletes);
    } catch (err) {
      this.logger.warn('Failed to fetch related athletes', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Handle related athlete card click — navigate to their profile.
   */
  protected onRelatedAthleteClick(athlete: RelatedAthlete): void {
    void this.navController.navigateForward(`/profile/${athlete.unicode}`);
  }

  /**
   * Handle "See All" related athletes — navigate to explore with sport filter.
   */
  protected onSeeAllRelated(): void {
    void this.navController.navigateForward(`/explore?sport=${this.relatedSport()}`);
  }

  /**
   * Handle tab changes — re-fetch timeline when switching to it so data stays fresh.
   */
  protected onTabChange(tab: ProfileTabId): void {
    if (tab === 'timeline') {
      const userId = this.fetchedProfile()?.id;
      if (userId) {
        void this.profileApiService.getProfileTimeline(userId).then((resp) => {
          if (resp.success) this.uiProfileService.setTimelinePosts(resp.data);
        });
      }
    }
  }

  // ============================================
  // TEAM PROFILE EVENT HANDLERS
  // ============================================

  protected onTeamTabChange(tab: TeamProfileTabId): void {
    this.analyticsService.trackEvent(APP_EVENTS.TAB_CHANGED, {
      tab,
      team_slug: this.teamSlug(),
      context: 'own_team_profile',
    });
  }

  protected async onTeamShare(): Promise<void> {
    const team = this.teamProfile.team();
    if (!team) return;

    const result = await this.shareService.shareTeam({
      id: team.id,
      slug: team.slug,
      teamName: team.teamName,
      sport: team.sport,
      location: team.location,
      logoUrl: team.logoUrl,
      imageUrl: team.galleryImages?.[0] || team.logoUrl,
      record: this.teamProfile.recordDisplay() || undefined,
    });

    if (result.completed) {
      this.logger.info('Team shared from own profile', { slug: team.slug });
    }
  }

  protected async onTeamQrCode(): Promise<void> {
    const team = this.teamProfile.team();
    if (!team) return;

    try {
      await this.qrCode.open({
        url: `https://nxt1sports.com/team/${team.slug}`,
        displayName: team.teamName,
        profileImg: team.logoUrl || undefined,
        sport: team.sport || 'Sports',
        unicode: team.slug,
        isOwnProfile: true,
      });
    } catch (err) {
      this.logger.error('Failed to open QR code', err);
      this.toast.error('Unable to open QR code');
    }
  }

  protected onRosterMemberClick(member: TeamProfileRosterMember): void {
    if (member.profileCode) {
      void this.navController.navigateForward(`/profile/${member.profileCode}`);
    }
  }

  protected onTeamPostClick(post: TeamProfilePost): void {
    if (post.id) {
      void this.navController.navigateForward(`/post/${post.id}`);
    }
  }

  /**
   * Opens the sidenav (mobile pattern - avatar opens sidenav).
   */
  protected onAvatarClick(): void {
    this.sidenavService.open();
  }

  /**
   * Opens the sidenav from the top-left hamburger menu.
   */
  protected onMenuClick(): void {
    this.sidenavService.open();
  }

  /**
   * Navigates back to the previous page using Ionic's NavController.
   * Uses back() for proper navigation stack handling.
   */
  protected onBackClick(): void {
    this.navController.back();
  }

  /**
   * Opens the edit profile bottom sheet (full-screen on mobile).
   * Called when user taps 'Edit Profile' button.
   */
  protected async onEditProfile(): Promise<void> {
    const userId = this.fetchedProfile()?.id ?? this.authService.user()?.uid;
    if (!userId) {
      this.logger.warn('Cannot edit profile: No user ID available');
      return;
    }

    const sportIndex = this.uiProfileService.activeSportIndex();
    const result = await this.editProfileSheet.open(userId, sportIndex, {
      onConnectProvider: (provider) => {
        void this.emailConnection.connectProvider(provider, userId);
      },
      searchTeams: this.searchTeamsFn,
    });

    if (result?.saved) {
      const param = this.routeParam();
      if (!param && userId) {
        // Clear service cache so the re-fetch hits the backend
        this.profileApiService.invalidateCache(userId);

        // Reset UI state — forces full teardown of carousel/images so they
        // re-render from scratch with fresh data (prevents stale component state)
        this.uiProfileService.startLoading();

        // Use getMe() for own profile — same endpoint as the initial load
        const response = await this.profileApiService.getMe();
        if (response.success && response.data) {
          const profile = response.data;
          this.fetchedProfile.set(profile);
          const profilePageData = userToProfilePageData(profile, true);
          this.uiProfileService.loadFromExternalData(profilePageData, profile, true);

          // Refresh sub-collections (same as initial load)
          const activeSport =
            profile.sports?.[profile.activeSportIndex ?? 0] ?? profile.sports?.[0];
          const sportId = activeSport?.sport?.toLowerCase();
          this.fetchSubCollections(profile.id, sportId).catch((err) => {
            this.logger.error('Failed to refresh sub-collections after edit', err, {
              userId: profile.id,
            });
          });
        } else {
          this.uiProfileService.setError(response.error ?? 'Failed to reload profile');
        }
      }
    }
  }

  /**
   * Searches programs/teams via the backend API.
   * Passed to the edit-profile bottom sheet for inline program search.
   */
  private readonly searchTeamsFn = async (query: string): Promise<readonly TeamSearchResult[]> => {
    this.logger.debug('Program search requested', { query });
    try {
      const url = `${environment.apiUrl}/programs/search`;
      const response = await this.http.get<{
        success: boolean;
        data: Array<{
          id: string;
          name: string;
          type: string;
          location?: { state?: string; city?: string };
          logoUrl?: string;
          primaryColor?: string;
          secondaryColor?: string;
          mascot?: string;
          teamCount?: number;
          isClaimed?: boolean;
        }>;
      }>(url, { params: { q: query, limit: '20' } });

      if (!response.success || !response.data) return [];

      return response.data.map((org) => ({
        id: org.id,
        name: org.name,
        sport: '',
        teamType: org.type,
        location:
          org.location?.city && org.location?.state
            ? `${org.location.city}, ${org.location.state}`
            : (org.location?.state ?? ''),
        logoUrl: org.logoUrl ?? undefined,
        colors: [org.primaryColor, org.secondaryColor].filter(Boolean) as string[],
        memberCount: org.teamCount ?? 0,
        isSchool: org.type === 'high-school' || org.type === 'middle-school',
        organizationId: org.id,
      }));
    } catch (err) {
      this.logger.error('Program search failed', err, { query });
      return [];
    }
  };

  /**
   * Handle team card click — navigate to team profile page.
   */
  protected onTeamClick(team: ProfileTeamAffiliation): void {
    if (team.teamCode) {
      this.logger.info('Navigating to team profile', {
        teamCode: team.teamCode,
        teamName: team.name,
      });
      void this.navController.navigateForward(`/team/${team.teamCode}`);
    } else {
      this.logger.warn('Team has no teamCode, cannot navigate', { teamName: team.name });
    }
  }

  /**
   * Opens the manage team modal (bottom sheet on mobile, overlay on desktop).
   * Called when team admin taps 'Manage Team' on the team profile shell.
   */
  protected async onManageTeam(): Promise<void> {
    const result = await this.manageTeamModal.open({
      teamId: this.teamProfile.team()?.id,
    });

    if (result?.saved) {
      // Refresh team data after management changes
      const slug = this.teamSlug();
      if (slug) {
        this.teamApi.invalidateCache(slug);
        const response = await this.teamApi.getTeamBySlug(slug);
        if (response.success && response.data) {
          this.teamProfile.loadFromExternalData(response.data);
        }
      }
    }
  }

  /**
   * Handle follow button tap.
   */
  protected async onFollow(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      this.toast.info('Sign in to follow');
      void this.navController.navigateForward('/auth');
      return;
    }

    // Team follow when viewing team profile
    if (this.showTeamProfile()) {
      await this.teamProfile.toggleFollow();
      const isFollowing = this.teamProfile.followStats()?.isFollowing;
      this.toast.success(isFollowing ? 'Following!' : 'Unfollowed');
      return;
    }

    // User (athlete/parent/coach) profile follow
    const currentUserId = this.authService.user()?.uid;
    const profileUserId = this.fetchedProfile()?.id;
    if (!currentUserId || !profileUserId) return;

    const wasFollowing = this.uiProfileService.followStats()?.isFollowing ?? false;
    // Optimistic update
    void this.uiProfileService.toggleFollow();

    try {
      if (!wasFollowing) {
        await this.profileApiService.follow(currentUserId, profileUserId);
      } else {
        await this.profileApiService.unfollow(currentUserId, profileUserId);
      }
      this.toast.success(!wasFollowing ? 'Following!' : 'Unfollowed');
    } catch {
      // Rollback optimistic update
      void this.uiProfileService.toggleFollow();
      this.toast.error('Could not update follow status. Please try again.');
    }
  }

  /**
   * Handle QR code tap — open QR code modal/sheet.
   */
  protected async onQrCode(): Promise<void> {
    const user = this.uiProfileService.user();
    if (!user) return;

    const profileId = this.profileUnicode() || user.profileCode || user.uid;
    if (!profileId) return;

    const profileUrl = `${environment.webUrl}/profile/${profileId}`;

    await this.qrCode.open({
      url: profileUrl,
      displayName: user.displayName || `${user.firstName} ${user.lastName}`.trim() || 'Athlete',
      profileImg: user.profileImg,
      sport: user.primarySport?.name,
    });
  }

  /**
   * Handle AI summary tap.
   */
  protected onAiSummary(): void {
    void this.navController.navigateForward('/agent-x', {
      queryParams: { action: 'ai-summary', profileId: this.fetchedProfile()?.id },
    });
  }

  /**
   * Handle create post tap.
   */
  protected onCreatePost(): void {
    void this.navController.navigateForward('/post/create');
  }

  /**
   * Handles native share for the profile using the centralized ShareService.
   */
  protected async onShare(): Promise<void> {
    const user = this.uiProfileService.user();
    if (!user) return;

    const profileId = this.profileUnicode() || user.profileCode || user.uid;
    if (!profileId) return;

    await this.shareService.shareProfile(
      {
        id: profileId,
        slug: user.profileCode || undefined,
        athleteName:
          user.displayName || `${user.firstName} ${user.lastName}`.trim() || 'NXT1 Athlete',
        position: user.primarySport?.position,
        classYear: user.classYear ? Number(user.classYear) : undefined,
        school: user.school?.name,
        sport: user.primarySport?.name,
        location: user.location || user.school?.location,
        imageUrl: user.profileImg ?? undefined,
      },
      {
        analyticsProps: {
          is_own_profile: this.uiProfileService.isOwnProfile(),
        },
      }
    );
  }

  /**
   * Handle copy link tap — copy profile URL to clipboard.
   */
  protected async onCopyLink(): Promise<void> {
    const user = this.uiProfileService.user();
    if (!user) return;

    const profileId = this.profileUnicode() || user.profileCode || user.uid;
    if (!profileId) return;

    const profileUrl = `${environment.webUrl}/profile/${profileId}`;
    await this.shareService.copy(profileUrl, true);
  }

  /**
   * Handle native pull-to-refresh on the outer ion-content.
   * Delegates to onRefreshRequest for the actual data fetching.
   */
  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    try {
      await this.onRefreshRequest();
    } finally {
      event.complete();
    }
  }

  /**
   * Handle pull-to-refresh from the profile shell.
   * Re-fetches profile + sub-collections from the real API and
   * pushes the fresh data into the shared UIProfileService.
   */
  protected async onRefreshRequest(): Promise<void> {
    const profile = this.fetchedProfile();
    const authUser = this.authService.user();
    const param = this.routeParam();

    try {
      let response: { success: boolean; data?: User; error?: string };

      if (!param && authUser?.uid) {
        response = await this.profileApiService.getMe();
      } else if (profile?.id) {
        response = await this.profileApiService.getProfile(profile.id);
      } else {
        return;
      }

      if (response.success && response.data) {
        const freshProfile = response.data;
        this.fetchedProfile.set(freshProfile);
        const isOwn = this.isOwnProfile();
        this.resolvedUnicode.set(freshProfile.unicode ?? freshProfile.id ?? '');

        // Role-aware refresh: coach/director → re-fetch team data
        if (isOwn && isTeamRole(freshProfile.role)) {
          void this.loadTeamProfile(freshProfile);
        } else {
          const profilePageData = userToProfilePageData(freshProfile, isOwn);
          this.uiProfileService.loadFromExternalData(profilePageData, freshProfile, isOwn);
          this.fetchRelatedAthletes(freshProfile);
          const activeSport =
            freshProfile.sports?.[freshProfile.activeSportIndex ?? 0] ?? freshProfile.sports?.[0];
          const sportId = activeSport?.sport?.toLowerCase();
          this.fetchSubCollections(freshProfile.id, sportId).catch((err) => {
            this.logger.error('Failed to fetch sub-collections on refresh', err, {
              userId: freshProfile.id,
            });
          });
        }
      }
    } catch {
      // Non-critical — profile stays with current data
    }
  }

  /**
   * Handle profile generation overlay dismiss.
   * Refreshes auth state so the profile page re-fetches fresh data
   * written by Agent X during the scrape/build process.
   */
  protected async onGenerationDismissed(reason: 'completed' | 'skipped'): Promise<void> {
    if (reason === 'completed') {
      try {
        await this.authFlow.refreshUserProfile();
      } catch {
        // Non-critical — profile data will be stale until next refresh
      }
      await this.onRefreshRequest();
    }
  }
}
