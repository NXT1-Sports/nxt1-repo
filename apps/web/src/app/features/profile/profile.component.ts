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
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed, toSignal, toObservable } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, first, switchMap, tap, filter } from 'rxjs';
import {
  ProfileShellWebComponent,
  ProfileService as UiProfileService,
  type ProfileShellUser,
  RelatedAthletesComponent,
  type RelatedAthlete,
  type RankingSource,
  userToProfilePageData,
} from '@nxt1/ui/profile';
import { NxtCtaBannerComponent } from '@nxt1/ui/components/cta-banner';
import { NxtSidenavService } from '@nxt1/ui/components/sidenav';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { AuthModalService } from '@nxt1/ui/auth';
import { QrCodeService } from '@nxt1/ui/qr-code';
import { parseApiError, requiresAuth } from '@nxt1/core';
import type { ProfileTabId, ProfileShareSource, User } from '@nxt1/core';
import type { ApiResponse } from '@nxt1/core/profile';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { AuthFlowService } from '../auth/services';
import { SeoService, AnalyticsService, ShareService } from '../../core/services';
import { ProfileService as ApiProfileService } from './services/profile.service';
import { APP_EVENTS } from '@nxt1/core/analytics';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ProfileShellWebComponent, RelatedAthletesComponent, NxtCtaBannerComponent],
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
      (shareClick)="onShare()"
      (followClick)="onFollow()"
      (qrCodeClick)="onQrCode()"
      (aiSummaryClick)="onAiSummary()"
      (createPostClick)="onCreatePost()"
    />

    <!-- ═══ RELATED ATHLETES — Discovery Row (below profile shell) ═══ -->
    @defer (on viewport) {
      <nxt1-related-athletes
        [sport]="relatedSport()"
        [state]="relatedState()"
        (athleteClick)="onRelatedAthleteClick($event)"
        (seeAllClick)="onSeeAllRelated()"
      />
    } @placeholder {
      <div style="height: 200px;"></div>
    }

    <!-- ═══ CTA BANNER — Logged-out users only ═══ -->
    @if (!isLoggedIn()) {
      <nxt1-cta-banner
        variant="conversion"
        badgeLabel="Super Profile"
        title="Drop Your Links. We Build the Rest."
        subtitle="Paste your Hudl, MaxPreps, or social links — NXT1 auto-generates a verified Super Profile that stays updated with your latest stats, highlights, and academics. Coaches see everything in one tap."
        ctaLabel="Get Your Super Profile Free"
        ctaRoute="/auth"
        titleId="profile-cta-banner-title"
      />
    }
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
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly platform = inject(NxtPlatformService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ProfileComponent');
  private readonly seo = inject(SeoService);
  private readonly analytics = inject(AnalyticsService);
  private readonly share = inject(ShareService);
  /**
   * Platform-specific API service — fetches real profile data from the backend.
   * @see apps/web/src/app/features/profile/services/profile.service.ts
   */
  private readonly apiProfileService = inject(ApiProfileService);

  /**
   * Shared UI state service — single source of truth for the profile shell.
   * Injected here so we can push real API data into it, bypassing mock data.
   * @see packages/ui/src/profile/profile.service.ts
   */
  private readonly uiProfileService = inject(UiProfileService);

  private readonly platformId = inject(PLATFORM_ID);

  /**
   * Raw User object returned by the API — kept for SEO/share/QR computed
   * properties that need User-specific fields not mapped into ProfileUser.
   * The shell itself reads from uiProfileService (real ProfilePageData).
   */
  private readonly fetchedProfile = signal<User | null>(null);
  private readonly destroyRef = inject(DestroyRef);

  /** Whether current user is logged in (CTA banner hidden when authenticated) */
  protected readonly isLoggedIn = computed(() => this.authFlow.isAuthenticated());

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
      imageUrl: profile.profileImg || undefined,
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
   * - 'username' — param contains non-digit chars (e.g. 'devmonster')  → lookup by username
   */
  private readonly routeMode = computed<'me' | 'unicode' | 'username'>(() => {
    const param = this.routeParam();
    if (!param) return 'me';
    return /^\d+$/.test(param) ? 'unicode' : 'username';
  });

  /**
   * Fetch source — drives the switchMap in the constructor.
   * For 'me' mode, returns null until auth has finished initializing so
   * we never fire a request while uid is still null after a page reload
   * (Firebase restores sessions asynchronously from IndexedDB).
   * uid is included so that logging in via auth modal triggers a re-fetch.
   */
  private readonly fetchSource = computed<{
    mode: 'me' | 'unicode' | 'username';
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
        profileImg: user.profileImg,
        displayName: user.displayName,
      };
    } else {
      const profile = this.fetchedProfile();
      if (!profile) return null;
      return {
        profileImg: profile.profileImg,
        displayName: `${profile.firstName} ${profile.lastName}`,
      };
    }
  });

  constructor() {
    // Clear any stale error/data state immediately so the skeleton loader
    // shows from the first render instead of flashing a leftover error
    // (ProfileService is providedIn:'root' — it persists across navigations).
    this.uiProfileService.startLoading();

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
        this.uiProfileService.setError('Please sign in to continue.');
        this.authModal.present();
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
            mode: 'me' | 'unicode' | 'username';
            param: string;
            uid: string | undefined;
          } => source !== null
        ),
        distinctUntilChanged((a, b) => a.mode === b.mode && a.param === b.param && a.uid === b.uid),
        tap(() => this.uiProfileService.startLoading()),
        switchMap(({ mode, param, uid }) => {
          if (mode === 'me') {
            // uid is always defined here (fetchSource blocks when uid is missing)
            return this.apiProfileService.getProfile(uid!);
          }
          if (mode === 'unicode') return this.apiProfileService.getProfileByUnicode(param);
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
    // Reset to loading state so if user navigates back to /profile the
    // skeleton shows immediately instead of flashing stale error/data.
    this.uiProfileService.startLoading();
  }

  ngOnInit(): void {
    this.logger.info('Profile component initialized', {
      profileUnicode: this.profileUnicode(),
      isOwnProfile: this.isOwnProfile(),
    });
  }

  private handleProfileResponse(response: ApiResponse<User>): void {
    if (!response.success || !response.data) {
      // API returned a non-success response — treat as an error so the shell
      // shows the error state instead of stale data.
      this.uiProfileService.setError(response.error ?? 'Failed to load profile');
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

    // Push real data into the shared UI service so the shell displays
    // actual profile data instead of mock data.
    // Pass the raw User so ProfileService can re-map tab content on sport switch.
    const profilePageData = userToProfilePageData(profile, isOwn);
    this.uiProfileService.loadFromExternalData(profilePageData, profile, isOwn);

    // profileMeta computed updates automatically via fetchedProfile signal
    const meta = this.profileMeta();
    if (!meta) {
      this.logger.warn('Profile missing unicode', { profileId: profile.id });
      return;
    }

    // Fetch timeline posts from the sub-collection (independent of profile doc)
    this.apiProfileService
      .getProfileTimeline(profile.id)
      .pipe(first())
      .subscribe({
        next: (resp) => {
          if (resp.success) this.uiProfileService.setTimelinePosts(resp.data);
        },
        error: (err) => this.logger.warn('Failed to load timeline posts', { err }),
      });

    // Fetch rankings from the user's rankings sub-collection
    this.apiProfileService
      .getProfileRankings(profile.id)
      .pipe(first())
      .subscribe({
        next: (resp) => {
          if (resp.success && resp.data.length > 0) {
            this.uiProfileService.setRankings(resp.data as unknown as RankingSource[]);
          }
        },
        error: (err) => this.logger.warn('Failed to load rankings', { err }),
      });

    // Fetch scout reports from the user's scoutReports sub-collection
    this.apiProfileService
      .getProfileScoutReports(profile.id)
      .pipe(first())
      .subscribe({
        next: (resp) => {
          if (resp.success) this.uiProfileService.setScoutReports(resp.data);
        },
        error: (err) => this.logger.warn('Failed to load scout reports', { err }),
      });

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

  private handleProfileError(err: unknown): void {
    const parsed = parseApiError(err);
    this.logger.error('Failed to load profile', {
      code: parsed.code,
      statusCode: parsed.statusCode,
    });
    this.uiProfileService.setError(parsed.message);

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
              if (resp.success) this.uiProfileService.setTimelinePosts(resp.data);
            },
            error: (err) => this.logger.warn('Failed to refresh timeline posts', { err }),
          });
      }
    }
  }

  /**
   * Handle edit profile navigation.
   */
  protected onEditProfile(): void {
    this.logger.info('Edit profile clicked');
    this.router.navigate(['/settings/profile']);
  }

  /**
   * Handle edit team navigation.
   */
  protected onEditTeam(): void {
    this.logger.info('Edit team clicked');
    // Navigate to manage team page (or open bottom sheet on mobile)
    this.router.navigate(['/manage-team']);
  }

  /**
   * Handle follow button — requires authentication.
   * Logged-out users see the "Sign in to continue" modal first.
   */
  protected async onFollow(): Promise<void> {
    if (!this.authFlow.isAuthenticated()) {
      const result = await this.authModal.presentSignInToContinue('follow athletes', {
        onGoogle: () => this.authFlow.signInWithGoogle(),
        onApple: () => this.authFlow.signInWithApple(),
        onEmailAuth: async (mode, data) =>
          mode === 'login'
            ? this.authFlow.signInWithEmail(data)
            : this.authFlow.signUpWithEmail(data),
      });
      if (!result.authenticated) return;
    }

    // Authenticated — proceed with follow
    this.logger.info('Follow clicked', { unicode: this.profileUnicode() });
    this.toast.success('Following!');
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
   * Handle create post navigation.
   */
  protected onCreatePost(): void {
    this.logger.info('Create post clicked');
    this.router.navigate(['/post/create']);
  }

  /**
   * Handle related athlete card click — navigate to their profile.
   */
  protected onRelatedAthleteClick(athlete: RelatedAthlete): void {
    this.logger.info('Related athlete clicked', { unicode: athlete.unicode });
    this.router.navigate(['/profile', athlete.unicode]);
  }

  /**
   * Handle "See All" related athletes — navigate to explore with sport filter.
   */
  protected onSeeAllRelated(): void {
    this.logger.info('See all related athletes clicked');
    this.router.navigate(['/explore'], {
      queryParams: { sport: this.relatedSport() },
    });
  }
}
