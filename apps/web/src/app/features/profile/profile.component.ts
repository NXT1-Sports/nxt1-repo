/**
 * @fileoverview Profile Page - Web App Wrapper
 * @module @nxt1/web/features/profile
 * @version 2.0.0
 *
 * Thin wrapper component that imports the shared Profile shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ USES WEB-OPTIMIZED SHELL FOR GRADE A+ SEO ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthService
 * - Share/QR code native APIs
 * - SEO Metadata
 *
 * Routes:
 * - /profile              — View own profile (me)
 * - /profile/:username    — View profile by username  (e.g. /profile/devmonster)
 * - /profile/:unicode     — View profile by unicode   (e.g. /profile/180798)
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  effect,
  OnInit,
  OnDestroy,
  signal,
  PLATFORM_ID,
  DestroyRef,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed, toSignal, toObservable } from '@angular/core/rxjs-interop';
import {
  distinctUntilChanged,
  first,
  firstValueFrom,
  forkJoin,
  switchMap,
  tap,
  filter,
  catchError,
  of,
} from 'rxjs';
import {
  ProfileShellWebComponent,
  ProfileService,
  type ProfileShellUser,
  RelatedAthletesComponent,
  type RelatedAthlete,
  type RankingSource,
  userToProfilePageData,
  ProfileGenerationStateService,
} from '@nxt1/ui/profile';
import { TeamProfileService } from '@nxt1/ui/team-profile';
import { EditProfileModalService } from '@nxt1/ui/edit-profile';
import { ManageTeamModalService } from '@nxt1/ui/manage-team';
import {
  NxtBottomSheetService,
  SHEET_PRESETS,
  type BottomSheetAction,
} from '@nxt1/ui/components/bottom-sheet';
import type { TeamSearchResult } from '@nxt1/ui/onboarding';

import { NxtCtaBannerComponent, type CtaAvatarImage } from '@nxt1/ui/components/cta-banner';
import { NxtSidenavService } from '@nxt1/ui/components/sidenav';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { AuthModalService } from '@nxt1/ui/auth';
import { QrCodeService } from '@nxt1/ui/qr-code';
import { parseApiError, requiresAuth, isTeamRole } from '@nxt1/core';
import type {
  ProfileTabId,
  ProfileShareSource,
  ProfileTeamAffiliation,
  User,
  UserSummary,
} from '@nxt1/core';
import type { ApiResponse } from '@nxt1/core/profile';
import { AUTH_SERVICE, type IAuthService } from '../../core/services/auth/auth.interface';
import { AuthFlowService } from '../../core/services/auth';
import {
  SeoService,
  AnalyticsService,
  ShareService,
  ProfilePageActionsService,
} from '../../core/services';
import { clearHttpCache } from '../../core/infrastructure';
import { EditProfileApiService } from '../../core/services';
import { ProfileService as ApiProfileService } from '../../core/services/api/profile-api.service';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { IMAGE_PATHS } from '@nxt1/design-tokens/assets';
import { environment } from '../../../environments/environment';

const CTA_AVATARS: readonly CtaAvatarImage[] = [
  { src: `/${IMAGE_PATHS.athlete1}`, alt: 'High school athlete' },
  { src: `/${IMAGE_PATHS.athlete2}`, alt: 'Club athlete' },
  { src: `/${IMAGE_PATHS.athlete3}`, alt: 'Student athlete' },
  { src: `/${IMAGE_PATHS.athlete4}`, alt: 'Varsity athlete' },
  { src: `/${IMAGE_PATHS.athlete5}`, alt: 'Travel ball athlete' },
  { src: `/${IMAGE_PATHS.coach1}`, alt: 'College coach' },
  { src: `/${IMAGE_PATHS.athlete3}`, alt: 'Elite recruit' },
] as const;

@Component({
  selector: 'app-profile',
  standalone: true,
  // Scope ProfileService to this component instance so each route navigation
  // gets isolated state and cannot pollute a concurrent instance's view.
  providers: [ProfileService],
  imports: [ProfileShellWebComponent, NxtCtaBannerComponent, RelatedAthletesComponent],
  template: `
    <nxt1-profile-shell-web
      [currentUser]="userInfo()"
      [profileUnicode]="profileUnicode()"
      [isOwnProfile]="isOwnProfile()"
      [skipInternalLoad]="true"
      (avatarClick)="onAvatarClick()"
      (backClick)="onBackClick()"
      (tabChange)="onTabChange($event)"
      (editProfileClick)="onEditProfile()"
      (editTeamClick)="onEditTeam()"
      (teamClick)="onTeamClick($event)"
      (shareClick)="onShare()"
      (qrCodeClick)="onQrCode()"
      (aiSummaryClick)="onAiSummary()"
      (retryClick)="onRetry()"
      (generationDismissed)="onGenerationDismissed($event)"
    >
      <!-- ═══ PROJECTED BELOW-FOLD CONTENT (inside shell scroll container) ═══ -->
      @defer (on viewport) {
        <nxt1-related-athletes
          [athletes]="relatedAthletes()"
          [sport]="relatedSport()"
          [state]="relatedState()"
          (athleteClick)="onRelatedAthleteClick($event)"
          (seeAllClick)="onSeeAllRelated()"
        />
      } @placeholder {
        <div style="height: 200px;"></div>
      }

      @if (!isLoggedIn()) {
        <nxt1-cta-banner
          variant="conversion"
          badgeLabel="Agentic Profile"
          title="This Profile Runs Itself."
          subtitle="NXT1 profiles update stats, sync highlights, and surface recruiting signals automatically — so coaches always see the latest without athletes lifting a finger."
          ctaLabel="Build Your Agentic Profile"
          ctaRoute="/auth"
          titleId="profile-cta-banner-title"
          [avatarImages]="ctaAvatars"
        />
      }
    </nxt1-profile-shell-web>
  `,
  styles: [
    `
      :host {
        /* Flex layout: stretch to fill shell__content.
           Full-bleed profile — cancels shell padding for edge-to-edge hero. */
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        /* Cancel the shell__content padding so profile page sits
           flush against edges — full-bleed Madden Franchise layout. */
        margin-top: calc(-1 * (var(--nxt1-spacing-4, 1rem) + 7px));
        margin-inline: calc(-1 * var(--shell-content-padding-x, 0px));
      }

      /* Profile shell fills the entire visible area.
         flex-shrink:0 prevents the shell from collapsing when the
         related-athletes section overflows below the fold. */
      nxt1-profile-shell-web {
        flex-shrink: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly authFlow = inject(AuthFlowService);
  private readonly authModal = inject(AuthModalService);
  private readonly qrCode = inject(QrCodeService);
  private readonly editProfileModal = inject(EditProfileModalService);
  private readonly manageTeamModal = inject(ManageTeamModalService);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly platform = inject(NxtPlatformService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ProfileComponent');
  private readonly seo = inject(SeoService);
  private readonly analytics = inject(AnalyticsService);
  private readonly share = inject(ShareService);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly profilePageActions = inject(ProfilePageActionsService);
  /**
   * Platform-specific API service — fetches real profile data from the backend.
   * @see apps/web/src/app/core/services/api/profile-api.service.ts
   */
  private readonly apiProfileService = inject(ApiProfileService);
  private readonly editProfileApiService = inject(EditProfileApiService);
  private readonly http = inject(HttpClient);

  /**
   * Shared UI state service — single source of truth for the profile shell.
   * Injected here so we can push real API data into it, bypassing mock data.
   * @see packages/ui/src/profile/profile.service.ts
   */
  private readonly profileService: ProfileService = inject(ProfileService);
  private readonly teamProfileService = inject(TeamProfileService);

  private readonly platformId = inject(PLATFORM_ID);
  protected readonly generation = inject(ProfileGenerationStateService);

  /**
   * Raw User object returned by the API — kept for SEO/share/QR computed
   * properties that need User-specific fields not mapped into ProfileUser.
   * The shell itself reads from uiProfileService (real ProfilePageData).
   */
  private readonly fetchedProfile = signal<User | null>(null);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly relatedAthletes = signal<RelatedAthlete[]>([]);
  protected readonly ctaAvatars = CTA_AVATARS;

  /** Whether current user is logged in — used to hide CTA for authenticated users */
  protected readonly isLoggedIn = computed(() => this.authFlow.isAuthenticated());

  /**
   * Team slug extracted from the user's teamCode — used for coach/director redirect.
   */
  protected readonly teamSlug = computed(() => {
    const profile = this.fetchedProfile();
    return (
      profile?.teamCode?.slug ??
      profile?.teamCode?.unicode ??
      profile?.coach?.managedTeamCodes?.[0] ??
      ''
    );
  });

  /**
   * Resolved profile metadata for SEO, sharing, and QR code.
   * Single source of truth — eliminates field extraction duplication.
   */
  private readonly profileMeta = computed<ProfileShareSource | null>(() => {
    const profile = this.fetchedProfile();
    if (!profile?.unicode) return null;

    const primarySport = profile.sports?.[profile.activeSportIndex || 0];
    const city = profile.location?.city || '';
    const state = profile.location?.state || '';
    const location = [city, state].filter(Boolean).join(', ');

    // Prefer username as URL slug so canonical = /profile/devmonster (human-readable)
    // rather than /profile/180798 (numeric). Google ranks clean URLs higher.
    const slug = profile.username || undefined;

    return {
      id: profile.unicode,
      slug,
      athleteName: `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'NXT1 Athlete',
      position: primarySport?.positions?.[0] || undefined,
      classYear: profile.classOf || undefined,
      school: primarySport?.team?.name || undefined,
      sport: primarySport?.sport || undefined,
      location: location || undefined,
      imageUrl: profile.profileImgs?.[0] || undefined,
    };
  });

  /** Sport context for the Related Athletes section */
  protected readonly relatedSport = computed<string>(() => this.profileMeta()?.sport || 'Football');

  /** State/region context for the Related Athletes section */
  protected readonly relatedState = computed<string>(() => {
    const profile = this.fetchedProfile();
    return profile?.location?.state || 'your area';
  });

  /**
   * Reactive route params signal — updates correctly when navigating between
   * profiles without leaving the component.
   * Using snapshot alone would be stale after the first render.
   */
  private readonly routeParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /**
   * Raw route parameter (:param wildcard — catches both username and unicode).
   */
  private readonly routeParam = computed<string>(() => this.routeParams().get('param') ?? '');

  /**
   * Route mode derived from the presence and shape of :param.
   * - 'me'       — no param  → load authenticated user's own profile
   * - 'unicode'  — param is purely numeric (e.g. '180798')  → lookup by unicode
   * - 'userid'   — param looks like a Firebase UID (20-32 alphanum)  → lookup by userId
   * - 'username' — param contains non-digit chars (e.g. 'devmonster')  → lookup by username
   */
  private readonly routeMode = computed<'me' | 'unicode' | 'userid' | 'username'>(() => {
    const param = this.routeParam();
    if (!param) return 'me';
    if (/^\d+$/.test(param)) return 'unicode';
    // Firebase UIDs: 20-32 chars, only alphanumeric (a-z A-Z 0-9), mixed case
    if (/^[a-zA-Z0-9]{20,32}$/.test(param) && /[a-zA-Z]/.test(param) && /[0-9]/.test(param)) {
      return 'userid';
    }
    return 'username';
  });

  /**
   * Fetch source — drives the switchMap in the constructor.
   * For 'me' mode, returns null until auth has finished initializing so
   * we never fire a request while uid is still null after a page reload
   * (Firebase restores sessions asynchronously from IndexedDB).
   * uid is included so that logging in via auth modal triggers a re-fetch.
   */
  private readonly fetchSource = computed<{
    mode: 'me' | 'unicode' | 'userid' | 'username';
    param: string;
    uid: string | undefined;
  } | null>(() => {
    const mode = this.routeMode();
    const param = this.routeParam();
    const uid = this.authService.user()?.uid;
    // For own profile: block until Firebase auth state is resolved
    if (mode === 'me' && !this.authService.isInitialized()) return null;
    // Don't emit if uid is still missing after init — the unauthenticated
    // effect below will handle that case directly without an API call.
    if (mode === 'me' && !uid) return null;
    return { mode, param, uid };
  });

  /**
   * Profile unicode resolved from the fetched profile.
   * Falls back to the auth user's unicode while the fetch is in-flight.
   * This is the canonical unicode used for share/QR/SEO — it comes from the
   * API response, NOT from the raw route param (which may be a username or
   * a numeric code, not the actual unicode field).
   */
  protected readonly profileUnicode = computed<string>(() => {
    const profile = this.fetchedProfile();
    if (profile?.unicode) return profile.unicode;
    // Fallback: own profile before first fetch completes
    return this.authService.user()?.unicode ?? '';
  });

  /**
   * Whether viewing own profile.
   */
  protected readonly isOwnProfile = computed<boolean>(() => {
    const user = this.authService.user();
    const mode = this.routeMode();

    // No route param — own profile (only authenticated users reach /profile)
    if (mode === 'me') return !!user;
    if (!user) return false;

    const param = this.routeParam();
    if (mode === 'unicode') return user.unicode === param;
    if (mode === 'userid') return user.uid === param;
    // username mode — compare against the username field on AppUser
    return user.username === param;
  });

  /**
   * Transform auth user to ProfileShellUser interface.
   */
  protected readonly userInfo = computed<ProfileShellUser | null>(() => {
    if (this.isOwnProfile()) {
      const user = this.authService.user();
      if (!user) return null;
      return {
        profileImg: user.profileImg ?? null,
        displayName: user.displayName,
      };
    } else {
      const profile = this.fetchedProfile();
      if (!profile) return null;
      return {
        profileImg: profile.profileImgs?.[0],
        displayName: `${profile.firstName} ${profile.lastName}`,
      };
    }
  });

  constructor() {
    // Clear any stale error/data state immediately so the skeleton loader
    // shows from the first render instead of flashing a leftover error
    // (ProfileService is providedIn:'root' — it persists across navigations).
    this.profileService.startLoading();
    this.profileService.setApiService({
      updateActiveSportIndex: (userId: string, activeSportIndex: number) =>
        this.editProfileApiService.updateActiveSportIndex(userId, activeSportIndex),
    });

    // Auto-invalidate profile cache when user returns to tab/window.
    // This ensures fresh data after editing profile in another tab or coming back from edit page.
    if (isPlatformBrowser(this.platformId)) {
      const handleVisibilityChange = () => {
        if (!document.hidden && this.isOwnProfile()) {
          // User returned to tab viewing their own profile - invalidate cache
          const user = this.authService.user();
          if (user) {
            this.apiProfileService.invalidateCache(
              user.uid,
              user.username ?? undefined,
              user.unicode ?? undefined
            );
            this.logger.debug('Profile cache invalidated on tab focus');
          }
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      // Clean up on component destroy
      this.destroyRef.onDestroy(() => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      });
    }

    // SSR: own profile (/profile) — auth is not initialized server-side so no API fetch
    // happens during SSR. Set minimal noIndex meta so the empty shell HTML is never
    // accidentally crawled. This effect fires immediately on both SSR and client.
    effect(() => {
      if (this.routeMode() === 'me' && !this.fetchedProfile()) {
        this.seo.updatePage({
          title: 'My Profile | NXT1 Sports',
          description: 'View and manage your NXT1 athlete recruiting profile.',
          noIndex: true,
        });
      }
    });

    // When the user visits /profile but is not logged in (after Firebase has
    // fully resolved), skip the API call and immediately open the auth modal.
    // This prevents the 401 → error flash cycle.
    // IMPORTANT: guard with isBrowser — toast and auth modal require browser APIs;
    // firing them during SSR logs bogus errors and breaks server rendering.
    effect(() => {
      if (
        isPlatformBrowser(this.platformId) &&
        this.routeMode() === 'me' &&
        this.authService.isInitialized() &&
        !this.authService.user()
      ) {
        this.profileService.setError('Please sign in to continue.');
        this.authModal.present();
      }
    });

    // Handle mobile top-nav edit (pencil) button — delegated via ProfilePageActionsService
    // Capture current counter so we only react to NEW taps, not stale values
    // from a previous page (e.g. team → profile navigation).
    let lastEditHandled = this.profilePageActions.editRequested();
    effect(() => {
      const count = this.profilePageActions.editRequested();
      if (count > lastEditHandled) {
        lastEditHandled = count;
        void this.onEditProfile();
      }
    });

    // Handle mobile top-nav three-dot (more) button — delegated via ProfilePageActionsService
    let lastMoreHandled = this.profilePageActions.moreRequested();
    effect(() => {
      const count = this.profilePageActions.moreRequested();
      if (count > lastMoreHandled) {
        lastMoreHandled = count;
        void this.onProfileMoreMenu();
      }
    });

    /**
     * Single reactive subscription for the component lifetime.
     *
     * fetchSource signal encodes both the mode and the param value so
     * distinctUntilChanged can skip re-fetches when nothing has changed.
     * switchMap cancels the in-flight request when the route changes.
     *
     * Route modes:
     *   'me'       → GET /auth/profile/me       (authenticated user)
     *   'unicode'  → GET /auth/profile/unicode/:unicode
     *   'username' → GET /auth/profile/username/:username
     */
    toObservable(this.fetchSource)
      .pipe(
        // Skip null emissions (auth not yet initialized for 'me' mode)
        filter(
          (
            source
          ): source is {
            mode: 'me' | 'unicode' | 'userid' | 'username';
            param: string;
            uid: string | undefined;
          } => source !== null
        ),
        distinctUntilChanged((a, b) => a.mode === b.mode && a.param === b.param && a.uid === b.uid),
        tap(() => this.profileService.startLoading()),
        switchMap(({ mode, param, uid: _uid }) => {
          if (mode === 'me') {
            // uid is always defined here (fetchSource blocks when uid is missing)
            return this.apiProfileService.getMe();
          }
          if (mode === 'unicode') return this.apiProfileService.getProfileByUnicode(param);
          if (mode === 'userid') return this.apiProfileService.getProfile(param);
          return this.apiProfileService.getProfileByUsername(param);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => this.handleProfileResponse(response),
        error: (err) => this.handleProfileError(err),
      });
  }

  ngOnDestroy(): void {
    // NOTE: Do NOT call profileService.startLoading() here.
    // The new component's constructor always calls startLoading() before its first
    // fetch, so calling it here would race with the new component's data load and
    // reset _isLoading=true AFTER the new component has already displayed data.
  }

  ngOnInit(): void {
    this.logger.info('Profile component initialized', {
      profileUnicode: this.profileUnicode(),
      isOwnProfile: this.isOwnProfile(),
    });

    // Check for background generation job completion.
    // If the user previously navigated away while the overlay was showing
    // (or skipped/timed out), the scrape job may have finished in the
    // background. Detect this and silently reload fresh profile data.
    if (isPlatformBrowser(this.platformId) && !this.generation.isGenerating()) {
      void this.checkBackgroundGenerationCompletion();
    }
  }

  /**
   * Check if a profile generation job completed while the user was away.
   * Uses sessionStorage to remember the last jobId so we can query its
   * status on return. If completed, invalidates cache and reloads.
   */
  private async checkBackgroundGenerationCompletion(): Promise<void> {
    try {
      const lastJobId = sessionStorage.getItem('nxt1:profile-generation-job');
      if (!lastJobId) return;

      const status = await this.generation.checkJobStatus(lastJobId);
      if (status === 'completed') {
        this.logger.info('Background generation completed while away', { jobId: lastJobId });
        sessionStorage.removeItem('nxt1:profile-generation-job');
        this.apiProfileService.invalidateAllProfileCache();
        this.reloadProfile();
      } else if (status === 'failed' || !status) {
        // Job failed or no longer exists — clean up
        sessionStorage.removeItem('nxt1:profile-generation-job');
      }
      // If still 'processing' or 'pending', leave the key for next visit
    } catch {
      // Non-critical — don't block profile rendering
    }
  }

  private handleProfileResponse(response: ApiResponse<User>): void {
    if (!response.success || !response.data) {
      // API returned a non-success response — treat as an error so the shell
      // shows the error state instead of stale data.
      this.profileService.setError(response.error ?? 'Failed to load profile');
      this.logger.warn('Profile API returned non-success response', {
        error: response.error,
      });
      return;
    }

    const profile = response.data;

    // Keep raw User for SEO/share computeds (they need User-specific fields)
    this.fetchedProfile.set(profile);

    // Determine isOwnProfile reliably at response time (avoids auth race condition):
    // - 'me' mode: always true — getMe() only succeeds for the authenticated user
    // - other modes: compare fetched profile.id with authenticated user's uid
    //   (authService.user() is guaranteed populated by the time a network response arrives)
    const isOwn = this.routeMode() === 'me' ? true : profile.id === this.authService.user()?.uid;

    // Track profile view — fire-and-forget, skip own profile
    if (!isOwn) {
      this.http
        .post(`${environment.apiURL}/analytics/profile-view`, { viewedUserId: profile.id })
        .pipe(first())
        .subscribe();
    }

    // Push real data into the shared UI service so the shell displays
    // actual profile data instead of mock data.
    // Pass the raw User so ProfileService can re-map tab content on sport switch.
    const profilePageData = userToProfilePageData(profile, isOwn);
    this.profileService.loadFromExternalData(profilePageData, profile, isOwn);

    // Role-aware: coach/director own profile → redirect to canonical /team/:slug route.
    // This ensures the URL bar shows the shareable team link and analytics
    // correctly attribute team page views. replaceUrl avoids back-button loops.
    if (isOwn && isTeamRole(profile.role)) {
      const slug = this.teamSlug();
      if (slug) {
        this.logger.info('Redirecting coach/director to team route', { slug, role: profile.role });
        void this.router.navigate(['/team', slug], { replaceUrl: true });
        return; // Skip sub-collection fetches — /team/:slug loads its own data
      }
    }

    this.fetchRelatedAthletes(profile);

    // profileMeta computed updates automatically via fetchedProfile signal
    const meta = this.profileMeta();
    if (!meta) {
      this.logger.warn('Profile missing unicode', { profileId: profile.id });
      return;
    }

    const activeSport = profile.sports?.[profile.activeSportIndex ?? 0] ?? profile.sports?.[0];
    const sportId = activeSport?.sport?.toLowerCase();
    // Fetch all sub-collections in parallel — single subscription, parallel requests.
    forkJoin({
      stats: sportId
        ? this.apiProfileService.getProfileStats(profile.id, sportId).pipe(
            catchError((err) => {
              this.logger.warn('Failed to load profile stats', { err });
              return of({ success: false as const, data: [] });
            })
          )
        : of({ success: false as const, data: [] }),
      gameLogs: sportId
        ? this.apiProfileService.getProfileGameLogs(profile.id, sportId).pipe(
            catchError((err) => {
              this.logger.warn('Failed to load game logs', { err });
              return of({ success: false as const, data: [] });
            })
          )
        : of({ success: false as const, data: [] }),
      metrics: sportId
        ? this.apiProfileService.getProfileMetrics(profile.id, sportId).pipe(
            catchError((err) => {
              this.logger.warn('Failed to load profile metrics', { err });
              return of({ success: false as const, data: [] });
            })
          )
        : of({ success: false as const, data: [] }),
      timeline: this.apiProfileService.getProfileTimeline(profile.id).pipe(
        catchError((err) => {
          this.logger.warn('Failed to load timeline posts', { err });
          return of({ success: false as const, data: [] });
        })
      ),
      rankings: this.apiProfileService.getProfileRankings(profile.id).pipe(
        catchError((err) => {
          this.logger.warn('Failed to load rankings', { err });
          return of({ success: false as const, data: [] });
        })
      ),
      scoutReports: this.apiProfileService.getProfileScoutReports(profile.id).pipe(
        catchError((err) => {
          this.logger.warn('Failed to load scout reports', { err });
          return of({ success: false as const, data: [] });
        })
      ),
      videos: this.apiProfileService.getProfileVideos(profile.id).pipe(
        catchError((err) => {
          this.logger.warn('Failed to load videos', { err });
          return of({ success: false as const, data: [] });
        })
      ),
      schedule: this.apiProfileService.getProfileSchedule(profile.id, sportId).pipe(
        catchError((err) => {
          this.logger.warn('Failed to load schedule', { err });
          return of({ success: false as const, data: [] });
        })
      ),
      news: this.apiProfileService.getProfileNews(profile.id).pipe(
        catchError((err) => {
          this.logger.warn('Failed to load news articles', { err });
          return of({ success: false as const, data: [] });
        })
      ),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(
        ({
          stats,
          gameLogs,
          metrics,
          timeline,
          rankings,
          scoutReports,
          videos,
          schedule,
          news,
        }) => {
          if (stats.success) this.profileService.setAthleticStatsFromRaw(stats.data);
          if (gameLogs.success) this.profileService.setGameLogs(gameLogs.data);
          if (metrics.success) this.profileService.setMetricsFromRaw(metrics.data);
          if (timeline.success) this.profileService.setTimelinePosts(timeline.data);
          if (rankings.success && rankings.data.length > 0) {
            this.profileService.setRankings(rankings.data as unknown as RankingSource[]);
          }
          if (scoutReports.success) this.profileService.setScoutReports(scoutReports.data);
          if (videos.success) this.profileService.setVideoPosts(videos.data);
          if (news.success) this.profileService.setNewsArticles(news.data);
          // Always call setScheduleEvents when API succeeds, even for empty arrays.
          // This signals that real API data loaded (overrides embedded mock data).
          if (schedule.success) {
            this.profileService.setScheduleEvents(schedule.data);
          }
        }
      );

    this.seo.updateForProfile(meta);

    this.logger.info('Profile SEO updated', {
      unicode: meta.id,
      athleteName: meta.athleteName,
      hasImage: !!meta.imageUrl,
    });

    this.analytics.trackEvent(APP_EVENTS.PROFILE_VIEWED, {
      profile_id: meta.id,
      profile_type: profile.role || 'athlete',
      is_own_profile: isOwn,
      has_image: !!meta.imageUrl,
      sport: meta.sport,
    });
  }

  /**
   * Fetch related athletes from the dedicated backend endpoint.
   * The backend handles all scoring (sport, state, position affinity)
   * and returns exactly 12 pre-ranked athletes.
   */

  private fetchRelatedAthletes(profile: User): void {
    const activeSport = profile.sports?.[profile.activeSportIndex ?? 0] ?? profile.sports?.[0];
    const sport = activeSport?.sport;
    const state = profile.location?.state;
    const position = activeSport?.positions?.[0];

    if (!sport) {
      this.relatedAthletes.set([]);
      return;
    }

    this.relatedAthletes.set([]);

    const params = new URLSearchParams({ sport });
    if (state) params.set('state', state);
    if (position) params.set('position', position);
    if (profile.id) params.set('exclude', profile.id);

    this.http
      .get<{ success: boolean; data: UserSummary[] }>(
        `${environment.apiURL}/auth/profile/related?${params.toString()}`
      )
      .pipe(
        catchError(() => of({ success: false as const, data: [] as UserSummary[] })),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((response) => {
        if (!response.success) {
          this.relatedAthletes.set([]);
          return;
        }

        const athletes: RelatedAthlete[] = response.data.map((u) => {
          const sameState = state && u.location?.state === state;
          const samePosition =
            position && u.primaryPosition?.toLowerCase() === position.toLowerCase();

          let matchReason: string;
          if (sameState && samePosition) matchReason = `Same position · ${u.primaryPosition}`;
          else if (sameState) matchReason = `Same state · ${state}`;
          else if (samePosition) matchReason = `Same position · ${u.primaryPosition}`;
          else matchReason = `Same sport · ${sport}`;

          return {
            id: u.id,
            unicode: u.unicode!,
            firstName: u.firstName,
            lastName: u.lastName,
            profileImg: u.profileImgs?.[0] ?? null,
            sport: u.primarySport ?? '',
            position: u.primaryPosition ?? '',
            classYear: u.classOf ? String(u.classOf) : '',
            school: '',
            state: u.location?.state ?? '',
            isVerified: u.verificationStatus === 'verified',
            matchReason,
          };
        });

        this.relatedAthletes.set(athletes);
      });
  }

  private handleProfileError(err: unknown): void {
    const parsed = parseApiError(err);
    this.logger.error('Failed to load profile', {
      code: parsed.code,
      statusCode: parsed.statusCode,
    });
    this.profileService.setError(parsed.message);

    if (requiresAuth(err) && isPlatformBrowser(this.platformId)) {
      this.authModal.present();
      return;
    }

    this.seo.updatePage({
      title: 'Profile',
      description: 'View athlete profile on NXT1 Sports',
      noIndex: true,
    });
  }

  /**
   * Handle avatar click - open sidenav (Twitter/X pattern).
   */
  protected onAvatarClick(): void {
    this.sidenavService.open();
  }

  /**
   * Handle back navigation.
   */
  protected onBackClick(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Use browser history if available, otherwise go home
    if (window.history.length > 1) {
      window.history.back();
    } else {
      this.router.navigate(['/home']);
    }
  }

  /**
   * Handle retry after error - re-fetch profile data from API.
   */
  protected onRetry(): void {
    this.logger.info('Retrying profile load');

    // Clear error state and start loading
    this.profileService.startLoading();

    // Trigger reload by updating route params (forces subscription to re-execute)
    const currentRoute = this.route.snapshot;
    if (currentRoute.params['username']) {
      this.router.navigate(['/profile', currentRoute.params['username']], { replaceUrl: true });
    } else if (currentRoute.params['unicode']) {
      this.router.navigate(['/profile', currentRoute.params['unicode']], { replaceUrl: true });
    } else {
      // Own profile - reload current route
      this.router.navigate(['/profile'], { replaceUrl: true });
    }
  }

  /**
   * Handle tab changes — track analytics and lazy-load tab data.
   */
  protected onTabChange(tab: ProfileTabId): void {
    this.analytics.trackEvent(APP_EVENTS.PROFILE_TAB_CHANGED, {
      tab,
      profile_id: this.profileUnicode(),
      is_own_profile: this.isOwnProfile(),
    });

    // Re-fetch timeline posts on tab select so data stays fresh
    if (tab === 'timeline') {
      const userId = this.fetchedProfile()?.id;
      if (userId) {
        this.apiProfileService
          .getProfileTimeline(userId)
          .pipe(first())
          .subscribe({
            next: (resp) => {
              if (resp.success) this.profileService.setTimelinePosts(resp.data);
            },
            error: (err) => this.logger.warn('Failed to refresh timeline posts', { err }),
          });
      }
    }
  }

  /**
   * Handle edit team — opens manage team modal (same pattern as mobile).
   */
  protected async onEditTeam(): Promise<void> {
    this.logger.info('Edit team clicked');
    const team = this.teamProfileService.team();
    const result = await this.manageTeamModal.open({
      teamId: team?.id ?? undefined,
    });

    if (result.saved) {
      const slug = this.teamSlug();
      if (slug) {
        this.teamProfileService.startLoading();
        this.teamProfileService.loadTeam(slug, true).catch((error) => {
          this.logger.error('Failed to reload team after manage', { slug, error });
        });
      }
    }
  }

  /**
   * Handle edit profile navigation.
   */
  protected async onEditProfile(): Promise<void> {
    this.logger.info('Edit profile clicked');

    const fetchedProfile = this.fetchedProfile();
    const authUser = this.authService.user();
    const userId = fetchedProfile?.id ?? authUser?.uid;
    if (!userId) {
      this.logger.warn('Cannot open edit profile: missing user ID');
      this.toast.error('Unable to open edit profile right now.');
      return;
    }

    const result = await this.editProfileModal.open({
      userId,
      sportIndex: fetchedProfile?.activeSportIndex ?? 0,
      searchTeams: this.searchTeamsFn,
      apiService: {
        getProfile: (uid: string, sportIndex?: number) =>
          this.editProfileApiService.getProfile(uid, sportIndex),
        updateSection: (
          uid: string,
          sectionId: string,
          data: Record<string, unknown>,
          sportIndex?: number
        ) => this.editProfileApiService.updateSection(uid, sectionId, data, sportIndex),
        updateActiveSportIndex: (uid: string, activeSportIndex: number) =>
          this.editProfileApiService.updateActiveSportIndex(uid, activeSportIndex),
        uploadPhoto: (uid: string, type: 'profile' | 'banner', file: File | Blob) =>
          this.editProfileApiService.uploadPhoto(uid, type, file),
      },
    });

    if (!result.saved) {
      return;
    }

    this.logger.info('Edit profile saved, refreshing profile data', { userId });

    // Clear BOTH cache layers so the re-fetch gets fresh data
    this.apiProfileService.invalidateCache(userId);
    await clearHttpCache('*profile*');

    // Directly re-fetch instead of router navigation (which distinctUntilChanged blocks)
    this.profileService.startLoading();
    const mode = this.routeMode();
    const param = this.routeParam();
    let fetch$;
    if (mode === 'me') {
      fetch$ = this.apiProfileService.getMe();
    } else if (mode === 'unicode') {
      fetch$ = this.apiProfileService.getProfileByUnicode(param);
    } else if (mode === 'userid') {
      fetch$ = this.apiProfileService.getProfile(param);
    } else {
      fetch$ = this.apiProfileService.getProfileByUsername(param);
    }
    fetch$.pipe(first()).subscribe({
      next: (response) => this.handleProfileResponse(response),
      error: (err) => this.handleProfileError(err),
    });
  }

  /**
   * Searches programs/teams via the backend API.
   * Passed to the edit-profile modal for inline program search.
   */
  private readonly searchTeamsFn = async (query: string): Promise<readonly TeamSearchResult[]> => {
    this.logger.debug('Program search requested', { query });
    try {
      const response = await firstValueFrom(
        this.http.get<{
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
        }>(`${environment.apiURL}/programs/search`, { params: { q: query, limit: '20' } })
      );

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
      this.router.navigate(['/team', team.teamCode]);
    } else {
      this.logger.warn('Team has no teamCode, cannot navigate', { teamName: team.name });
    }
  }

  /**
   * Handle share profile.
   */
  protected async onShare(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const meta = this.profileMeta();
    if (!meta) return;

    await this.share.shareProfile(meta, {
      analyticsProps: { is_own_profile: this.isOwnProfile() },
    });
  }

  /**
   * Handle QR code display.
   * Opens adaptive QR code modal (centered on desktop, bottom sheet on mobile).
   */
  protected async onQrCode(): Promise<void> {
    const meta = this.profileMeta();
    const unicode = meta?.id || this.profileUnicode() || 'demo';

    const user = this.authService.user();
    const profileImg = meta?.imageUrl || user?.profileImg || undefined;
    const displayName = meta?.athleteName || user?.displayName || 'NXT1 Athlete';

    try {
      await this.qrCode.open({
        url: `https://nxt1sports.com/profile/${unicode}`,
        displayName,
        profileImg,
        sport: meta?.sport || 'Football',
        unicode,
        isOwnProfile: this.isOwnProfile(),
      });
    } catch (err) {
      this.logger.error('Failed to open QR code modal', err);
      this.toast.error('Unable to open QR code');
    }
  }

  /**
   * Handle AI summary request.
   * Opens the AI-powered profile summary modal (powered by OpenRouter on backend).
   */
  protected onAiSummary(): void {
    this.logger.info('AI summary requested', { unicode: this.profileUnicode() });
    this.toast.info('AI summary feature coming soon');
  }

  /**
   * Handle mobile top-nav three-dot menu — shows profile actions bottom sheet.
   * Called via ProfilePageActionsService from the web-shell's (moreClick) handler.
   */
  protected async onProfileMoreMenu(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const isOwn = this.isOwnProfile();
    const actions: BottomSheetAction[] = isOwn
      ? [
          { label: 'Share Profile', role: 'primary', icon: 'share' },
          { label: 'QR Code', role: 'secondary', icon: 'qrCode' },
          { label: 'Copy Link', role: 'secondary', icon: 'link' },
        ]
      : [
          { label: 'Share Profile', role: 'primary', icon: 'share' },
          { label: 'Copy Link', role: 'secondary', icon: 'link' },
          { label: 'Report', role: 'destructive', icon: 'flag' },
        ];

    const result = await this.bottomSheet.show<BottomSheetAction>({
      title: 'Profile Actions',
      actions,
      backdropDismiss: true,
      ...SHEET_PRESETS.HALF,
    });

    const selected = result?.data as BottomSheetAction | undefined;
    if (!selected) return;

    switch (selected.label) {
      case 'Share Profile':
        await this.onShare();
        break;
      case 'QR Code':
        await this.onQrCode();
        break;
      case 'Copy Link': {
        const meta = this.profileMeta();
        const unicode = meta?.id || this.profileUnicode();
        if (unicode) {
          const url = `https://nxt1sports.com/profile/${unicode}`;
          await navigator.clipboard.writeText(url);
          this.toast.success('Link copied!');
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * Handle related athlete click - navigate to their profile.
   */
  protected onRelatedAthleteClick(athlete: RelatedAthlete): void {
    this.logger.info('Related athlete clicked', { unicode: athlete.unicode });
    this.router.navigate(['/profile', athlete.unicode]);
  }

  /**
   * Handle see all related athletes click.
   */
  protected onSeeAllRelated(): void {
    this.logger.info('See all related athletes clicked');
    // Navigate to explore page with sport/state filters
    const sport = this.relatedSport();
    const state = this.relatedState();
    this.router.navigate(['/explore'], {
      queryParams: { sport, state },
    });
  }

  /**
   * Handle profile generation overlay dismiss.
   * Always invalidates cache and re-fetches profile data so any data
   * written by Agent X during the scraping process is loaded — regardless
   * of whether the overlay reports 'completed' or 'skipped' (the user may
   * skip while the backend job is still progressing in the background).
   */
  protected onGenerationDismissed(reason: 'completed' | 'skipped'): void {
    this.logger.info('Profile generation overlay dismissed', { reason });

    // If the user skipped, the backend job may still be running.
    // Store the jobId so we can check for completion on next profile visit.
    if (reason === 'skipped') {
      const jobId = this.generation.jobId();
      if (jobId && isPlatformBrowser(this.platformId)) {
        sessionStorage.setItem('nxt1:profile-generation-job', jobId);
      }
    } else {
      // Completed — clear any stored jobId
      if (isPlatformBrowser(this.platformId)) {
        sessionStorage.removeItem('nxt1:profile-generation-job');
      }
    }

    this.apiProfileService.invalidateAllProfileCache();
    this.reloadProfile();
  }

  /**
   * Force re-fetch the current profile by invalidating signals and
   * re-triggering the reactive fetch subscription without a full navigation.
   */
  private reloadProfile(): void {
    this.profileService.startLoading();
    const param = this.routeParam();
    if (param) {
      this.router.navigate(['/profile', param], { replaceUrl: true });
    } else {
      this.router.navigate(['/profile'], { replaceUrl: true });
    }
  }
}
