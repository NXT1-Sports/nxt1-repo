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
 * - /profile/:unicode — View profile by unicode (unique profile identifier)
 * - /profile — View own profile (redirects to own unicode)
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  OnInit,
  signal,
  PLATFORM_ID,
  DestroyRef,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed, toSignal, toObservable } from '@angular/core/rxjs-interop';
import { filter, distinctUntilChanged, switchMap, tap } from 'rxjs';
import {
  ProfileShellWebComponent,
  ProfileService as UiProfileService,
  type ProfileShellUser,
  RelatedAthletesComponent,
  type RelatedAthlete,
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
      [skipInternalLoad]="!!profileUnicode()"
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
export class ProfileComponent implements OnInit {
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

    return {
      id: profile.unicode,
      athleteName: `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'NXT1 Athlete',
      position: primarySport?.positions?.[0] || undefined,
      classYear: profile.classOf || undefined,
      school: primarySport?.team?.name || undefined,
      sport: primarySport?.sport || undefined,
      location: location || undefined,
      imageUrl: (profile.userImgs?.profileImg ?? profile.profileImg) || undefined,
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
   * /profile/:unicode1 → /profile/:unicode2 without leaving the component.
   * Using snapshot alone would be stale after the first render.
   */
  private readonly routeParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /**
   * Profile unicode from route parameter.
   * Unicode is the unique identifier for profiles (e.g., /profile/abc123).
   * This matches the v1 app's approach for single source of truth.
   */
  protected readonly profileUnicode = computed<string>(() => {
    // Get unicode from reactive route params signal
    const routeUnicode = this.routeParams().get('unicode');
    if (routeUnicode) return routeUnicode;

    // Fall back to current user's unicode
    const user = this.authService.user();
    return user?.unicode ?? '';
  });

  /**
   * Whether viewing own profile.
   */
  protected readonly isOwnProfile = computed<boolean>(() => {
    const user = this.authService.user();
    const routeUnicode = this.routeParams().get('unicode');

    // If no route unicode, it's own profile ONLY when authenticated.
    // Logged-out users on /profile should be treated as viewing a public profile.
    if (!routeUnicode) return !!user;

    // Check if route unicode matches current user's unicode
    return user?.unicode === routeUnicode;
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
        profileImg: profile.userImgs?.profileImg ?? profile.profileImg,
        displayName: `${profile.firstName} ${profile.lastName}`,
      };
    }
  });

  constructor() {
    /**
     * Single subscription for the component lifetime.
     * - toObservable: converts profileUnicode signal → Observable
     * - distinctUntilChanged: skips re-fetch when same unicode emits twice
     *   (e.g. authService.user() re-emits but unicode hasn't changed)
     * - switchMap: CANCELS the previous HTTP request when a new unicode arrives,
     *   eliminating the double-load caused by the old effect()+subscribe() pattern
     *   that accumulated multiple active subscriptions.
     */
    toObservable(this.profileUnicode)
      .pipe(
        filter((unicode) => !!unicode),
        distinctUntilChanged(),
        tap(() => this.uiProfileService.startLoading()),
        switchMap((unicode) => this.apiProfileService.getProfile(unicode)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => this.handleProfileResponse(response),
        error: (err) => this.handleProfileError(err),
      });
  }

  ngOnInit(): void {
    this.logger.info('Profile component initialized', {
      profileUnicode: this.profileUnicode(),
      isOwnProfile: this.isOwnProfile(),
    });
  }

  private handleProfileResponse(response: ApiResponse<User>): void {
    if (!response.success || !response.data) return;

    const profile = response.data;

    // Keep raw User for SEO/share computeds (they need User-specific fields)
    this.fetchedProfile.set(profile);

    // Push real data into the shared UI service so the shell displays
    // actual profile data instead of mock data.
    const profilePageData = userToProfilePageData(profile, this.isOwnProfile());
    this.uiProfileService.loadFromExternalData(profilePageData);

    // profileMeta computed updates automatically via fetchedProfile signal
    const meta = this.profileMeta();
    if (!meta) {
      this.logger.warn('Profile missing unicode', { profileId: profile.id });
      return;
    }

    this.seo.updateForProfile(meta);

    this.logger.info('Profile SEO updated', {
      unicode: meta.id,
      athleteName: meta.athleteName,
      hasImage: !!meta.imageUrl,
    });

    this.analytics.trackEvent(APP_EVENTS.PROFILE_VIEWED, {
      profile_id: meta.id,
      profile_type: profile.role || 'athlete',
      is_own_profile: this.isOwnProfile(),
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

    if (requiresAuth(err)) {
      this.router.navigate(['/login']);
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
   * Handle tab changes for analytics.
   */
  protected onTabChange(tab: ProfileTabId): void {
    this.analytics.trackEvent(APP_EVENTS.PROFILE_TAB_CHANGED, {
      tab,
      profile_id: this.profileUnicode(),
      is_own_profile: this.isOwnProfile(),
    });
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
