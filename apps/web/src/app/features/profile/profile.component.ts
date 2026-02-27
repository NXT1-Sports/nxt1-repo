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
  effect,
  PLATFORM_ID,
  DestroyRef,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProfileShellWebComponent, type ProfileShellUser } from '@nxt1/ui/profile';
import { NxtCtaBannerComponent } from '@nxt1/ui/components/cta-banner';
import { NxtSidenavService } from '@nxt1/ui/components/sidenav';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { AuthModalService } from '@nxt1/ui/auth';
import { QrCodeService } from '@nxt1/ui/qr-code';
import type { ProfileTabId, ProfileShareSource, User } from '@nxt1/core';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { AuthFlowService } from '../auth/services';
import { SeoService, AnalyticsService, ShareService } from '../../core/services';
import { ProfileService } from './services/profile.service';
import { APP_EVENTS } from '@nxt1/core/analytics';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ProfileShellWebComponent, NxtCtaBannerComponent],
  template: `
    <nxt1-profile-shell-web
      [currentUser]="userInfo()"
      [profileUnicode]="profileUnicode()"
      [isOwnProfile]="isOwnProfile()"
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

    <!-- ═══ CTA BANNER — Below-the-fold conversion for logged-out users ═══
         Deferred to viewport: never rendered during SSR, zero CLS impact.
         Profiles are public pages — no auth gate blocks initial render. ═══ -->
    @defer (on viewport) {
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
    } @placeholder {
      <div></div>
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
  private readonly profileService = inject(ProfileService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly fetchedProfile = signal<User | null>(null);
  private readonly destroyRef = inject(DestroyRef);

  /** Whether current user is logged in — used to hide CTA for authenticated users */
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
      imageUrl: profile.profileImg || undefined,
    };
  });

  /**
   * Profile unicode from route parameter.
   * Unicode is the unique identifier for profiles (e.g., /profile/abc123).
   * This matches the v1 app's approach for single source of truth.
   */
  protected readonly profileUnicode = computed<string>(() => {
    // Get unicode from route params
    const routeUnicode = this.route.snapshot.paramMap.get('unicode');
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
    const routeUnicode = this.route.snapshot.paramMap.get('unicode');

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
        profileImg: profile.profileImg,
        displayName: `${profile.firstName} ${profile.lastName}`,
      };
    }
  });

  constructor() {
    // Effect to fetch profile data when unicode changes and it's not own profile (or even if it is, for completeness/SEO)
    effect(() => {
      const unicode = this.profileUnicode();
      if (unicode) {
        this.loadProfileAndSeo(unicode);
      }
    });
  }

  ngOnInit(): void {
    this.logger.info('Profile component initialized', {
      profileUnicode: this.profileUnicode(),
      isOwnProfile: this.isOwnProfile(),
    });
  }

  private loadProfileAndSeo(unicode: string): void {
    this.profileService
      .getProfile(unicode)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            const profile = response.data;
            this.fetchedProfile.set(profile);

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
        },
        error: (err) => {
          this.logger.error('Failed to load profile for SEO', err);

          this.seo.updatePage({
            title: 'Profile',
            description: 'View athlete profile on NXT1 Sports',
            noIndex: true,
          });
        },
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
}
