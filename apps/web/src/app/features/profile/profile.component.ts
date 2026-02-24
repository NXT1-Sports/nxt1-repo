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
import {
  ProfileShellWebComponent,
  type ProfileShellUser,
  RelatedAthletesComponent,
  type RelatedAthlete,
} from '@nxt1/ui/profile';
import { NxtSidenavService } from '@nxt1/ui/components/sidenav';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { AuthModalService } from '@nxt1/ui/auth';
import type { ProfileTabId } from '@nxt1/core';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { AuthFlowService } from '../auth/services';
import { SeoService, AnalyticsService, ShareService } from '../../core/services';
import { ProfileService } from './services/profile.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { APP_EVENTS } from '@nxt1/core/analytics';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ProfileShellWebComponent, RelatedAthletesComponent],
  template: `
    <nxt1-profile-shell-web
      [currentUser]="userInfo()"
      [profileUnicode]="profileUnicode()"
      [isOwnProfile]="isOwnProfile()"
      [hideHeader]="isDesktop()"
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
  `,
  styles: [
    `
      :host {
        display: block;
        margin-top: calc(-1 * (var(--nxt1-spacing-4, 1rem) + 7px));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly authFlow = inject(AuthFlowService);
  private readonly authModal = inject(AuthModalService);
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
  private readonly fetchedProfile = signal<any>(null);
  private readonly destroyRef = inject(DestroyRef);

  /** Desktop detection for hiding redundant page header (sidebar provides nav) */
  protected readonly isDesktop = computed(() => this.platform.viewport().width >= 1280);

  /** Sport context for the Related Athletes section */
  protected readonly relatedSport = computed<string>(() => {
    const profile = this.fetchedProfile();
    const primarySport = profile?.sports?.[profile?.activeSportIndex || 0];
    return primarySport?.sport || profile?.primarySport || 'Football';
  });

  /** State/region context for the Related Athletes section */
  protected readonly relatedState = computed<string>(() => {
    const profile = this.fetchedProfile();
    return profile?.location?.state || profile?.state || 'your area';
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

    // If no route unicode, we're viewing own profile
    if (!routeUnicode) return true;

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
        profileImg: profile.profileImg || profile.imageUrl, // Handle variations in API response
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

  private loadProfileAndSeo(unicode: string) {
    this.profileService
      .getProfile(unicode)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            const profile = response.data;
            this.fetchedProfile.set(profile);

            // Build full name
            const athleteName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();

            // Build location string from structured location or legacy fields
            const city = profile.location?.city || profile.city || '';
            const state = profile.location?.state || profile.state || '';
            const location = [city, state].filter(Boolean).join(', ');

            // Get school name from sports profile or legacy fields
            const primarySport = profile.sports?.[profile.activeSportIndex || 0];
            const school = primarySport?.team?.name || profile.highSchool || undefined;

            // Get sport and position from sports array or legacy fields
            const sport = primarySport?.sport || profile.primarySport || profile.sport || undefined;
            const position = primarySport?.positions?.[0] || profile.position || undefined;

            // Get class year from athlete data or legacy field
            const classYear = profile.athlete?.classOf || profile.classOf || undefined;

            // Get image URL - profileImg is the main field
            const imageUrl = profile.profileImg || undefined;

            // Validate unicode exists
            if (!profile.unicode) {
              this.logger.warn('Profile missing unicode', { profileId: profile.id });
              return;
            }

            // Update SEO tags with complete data
            this.seo.updateForProfile({
              id: profile.unicode,
              athleteName,
              position,
              classYear,
              school,
              sport,
              location: location || undefined,
              imageUrl,
            });

            this.logger.info('Profile SEO updated', {
              unicode: profile.unicode,
              athleteName,
              hasImage: !!imageUrl,
            });

            // Track profile view for analytics
            this.analytics.trackEvent(APP_EVENTS.PROFILE_VIEWED, {
              profile_id: profile.unicode,
              profile_type: profile.athleteOrParentOrCoach || 'athlete',
              is_own_profile: this.isOwnProfile(),
              has_image: !!imageUrl,
              sport: sport,
            });
          }
        },
        error: (err) => {
          this.logger.error('Failed to load profile for SEO', err);

          // Set basic SEO even on error (prevents empty meta tags)
          this.seo.updatePage({
            title: 'Profile',
            description: 'View athlete profile on NXT1 Sports',
            noIndex: true, // Don't index error pages
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
   * Handle tab changes for analytics/logging.
   */
  protected onTabChange(tab: ProfileTabId): void {
    this.logger.debug('Profile tab changed', { tab });
    // In production: track analytics event
    // this.analytics.track('profile_tab_change', { tab });
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

    const unicode = this.profileUnicode();
    if (!unicode) return;

    const profile = this.fetchedProfile();
    const athleteName = profile
      ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim()
      : this.authService.user()?.displayName || 'NXT1 Athlete';

    const city = profile?.location?.city || profile?.city || '';
    const state = profile?.location?.state || profile?.state || '';
    const location = [city, state].filter(Boolean).join(', ');

    const primarySport = profile?.sports?.[profile?.activeSportIndex || 0];
    const school = primarySport?.team?.name || profile?.highSchool || undefined;
    const sport = primarySport?.sport || profile?.primarySport || profile?.sport || undefined;
    const position = primarySport?.positions?.[0] || profile?.position || undefined;
    const classYear = profile?.athlete?.classOf || profile?.classOf || undefined;
    const imageUrl = profile?.profileImg || profile?.imageUrl || undefined;

    await this.share.shareProfile(
      {
        id: unicode,
        slug: profile?.slug,
        athleteName: athleteName || 'NXT1 Athlete',
        position,
        classYear,
        school,
        sport,
        location: location || undefined,
        imageUrl,
      },
      {
        analyticsProps: {
          is_own_profile: this.isOwnProfile(),
        },
      }
    );
  }

  /**
   * Handle QR code display.
   */
  protected onQrCode(): void {
    this.logger.info('QR code clicked');
    // TODO: Open QR code modal with profile URL
    this.toast.info('QR code feature coming soon');
  }

  /**
   * Handle AI summary request.
   */
  protected onAiSummary(): void {
    this.logger.info('AI summary clicked');
    // TODO: Open AI summary modal
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
