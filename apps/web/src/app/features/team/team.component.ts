/**
 * @fileoverview Team Page - Web App Wrapper
 * @module @nxt1/web/features/team
 * @version 2.0.0
 *
 * Thin wrapper component that imports the shared TeamProfileShellWeb
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ USES WEB-OPTIMIZED SHELL FOR GRADE A+ SEO ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - SEO Metadata for team pages
 * - Share / QR code functionality
 * - Auth-gated follow
 * - Analytics tracking
 *
 * Routes:
 * - /team/:slug — View team by slug (SEO-friendly URL)
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  OnInit,
  PLATFORM_ID,
  DestroyRef,
  effect,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { TeamProfileShellWebComponent } from '@nxt1/ui/team-profile';
import { NxtCtaBannerComponent, type CtaAvatarImage } from '@nxt1/ui/components/cta-banner';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { AuthModalService } from '@nxt1/ui/auth';
import { QrCodeService } from '@nxt1/ui/qr-code';
import { TeamProfileService } from '@nxt1/ui/team-profile';
import { ManageTeamModalService } from '@nxt1/ui/manage-team';
import {
  NxtBottomSheetService,
  SHEET_PRESETS,
  type BottomSheetAction,
} from '@nxt1/ui/components/bottom-sheet';
import { IMAGE_PATHS } from '@nxt1/design-tokens/assets';
import type { TeamProfileTabId, TeamProfileRosterMember, TeamProfilePost } from '@nxt1/core';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { AuthFlowService } from '../auth/services';
import {
  SeoService,
  AnalyticsService,
  ShareService,
  ProfilePageActionsService,
} from '../../core/services';

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
  selector: 'app-team',
  standalone: true,
  imports: [TeamProfileShellWebComponent, NxtCtaBannerComponent],
  template: `
    <nxt1-team-profile-shell-web
      [teamSlug]="teamSlug()"
      [isTeamAdmin]="isTeamAdmin()"
      (backClick)="onBackClick()"
      (tabChange)="onTabChange($event)"
      (shareClick)="onShare()"
      (qrCodeClick)="onQrCode()"
      (manageTeamClick)="onManageTeam()"
      (rosterMemberClick)="onRosterMemberClick($event)"
      (postClick)="onPostClick($event)"
    >
      @if (!isLoggedIn()) {
        <nxt1-cta-banner
          variant="conversion"
          badgeLabel="Agentic Team Profile"
          title="Your Program. Always Up to Date."
          subtitle="NXT1 team profiles sync rosters, schedules, and recruiting activity automatically — giving coaches and scouts a living snapshot of your program without the manual work."
          ctaLabel="Claim Your Team Profile"
          ctaRoute="/auth"
          titleId="team-profile-cta-banner-title"
          [avatarImages]="ctaAvatars"
        />
      }
    </nxt1-team-profile-shell-web>
  `,
  styles: [
    `
      :host {
        /* Flex layout: stretch to fill shell__content.
           Full-bleed team page — cancels shell padding for edge-to-edge layout. */
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        /* Cancel the shell__content padding so team page sits
           flush against edges — full-bleed Madden Franchise layout. */
        margin-top: calc(-1 * (var(--nxt1-spacing-4, 1rem) + 7px));
        margin-inline: calc(-1 * var(--shell-content-padding-x, 0px));
      }

      nxt1-team-profile-shell-web {
        flex-shrink: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly authFlow = inject(AuthFlowService);
  private readonly authModal = inject(AuthModalService);
  private readonly qrCode = inject(QrCodeService);
  private readonly platform = inject(NxtPlatformService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('TeamComponent');
  private readonly seo = inject(SeoService);
  private readonly analytics = inject(AnalyticsService);
  private readonly share = inject(ShareService);
  private readonly teamProfile = inject(TeamProfileService);
  private readonly manageTeamModal = inject(ManageTeamModalService);
  private readonly profilePageActions = inject(ProfilePageActionsService);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  // ============================================
  // COMPUTED
  // ============================================

  /**
   * Team slug from route parameter.
   */
  protected readonly teamSlug = computed<string>(() => {
    return this.route.snapshot.paramMap.get('slug') || '';
  });

  /**
   * Whether the current user is an admin of this team.
   * For now always false — will integrate with team membership checks.
   */
  protected readonly isTeamAdmin = computed<boolean>(() => {
    return this.teamProfile.isTeamAdmin();
  });

  /** Logged-out users see below-fold conversion CTA. */
  protected readonly isLoggedIn = computed(() => this.authFlow.isAuthenticated());

  protected readonly ctaAvatars = CTA_AVATARS;

  constructor() {
    // Update mobile top-nav edit/more buttons when team admin status is resolved
    effect(() => {
      const isAdmin = this.isTeamAdmin();
      // Show more for everyone; show pencil only for admins
      this.profilePageActions.setMobileActions({ showEdit: isAdmin, showMore: true });
    });

    // Handle mobile top-nav pencil tap — open manage team modal
    // Capture current counter so we only react to NEW taps, not stale values
    // from a previous page (e.g. profile → team navigation).
    let lastEditHandled = this.profilePageActions.editRequested();
    effect(() => {
      const count = this.profilePageActions.editRequested();
      if (count > lastEditHandled) {
        lastEditHandled = count;
        void this.onManageTeam();
      }
    });

    // Handle mobile top-nav three-dot tap — open team action sheet
    let lastMoreHandled = this.profilePageActions.moreRequested();
    effect(() => {
      const count = this.profilePageActions.moreRequested();
      if (count > lastMoreHandled) {
        lastMoreHandled = count;
        void this.onTeamMoreMenu();
      }
    });

    // Effect to update SEO when team data loads
    effect(() => {
      const team = this.teamProfile.team();
      if (team) {
        this.updateSeo(team);
      }
    });

    // Clear mobile action buttons when navigating away from this page
    this.destroyRef.onDestroy(() => this.profilePageActions.clearMobileActions());
  }

  ngOnInit(): void {
    const slug = this.teamSlug();

    this.logger.info('Team component initialized', { teamSlug: slug });

    // Guard: a slug containing '.' is a static asset (e.g. team-profile-skeleton.component.css.map)
    // being requested relative to the current /team/* URL. Skip the API call.
    if (!slug || slug.includes('.')) {
      this.logger.warn('Invalid team slug (static asset request caught by router), skipping load', {
        slug,
      });
      return;
    }

    // Set loading state immediately before async API call to prevent template flash
    this.teamProfile.startLoading();

    // Load team data from API
    this.teamProfile
      .loadTeam(slug, this.isTeamAdmin())
      .then(() => {
        // Track page view after data loads — skip if user is an admin of this team
        if (!this.isTeamAdmin()) {
          const teamId = this.teamProfile.team()?.id;
          if (teamId) void this.teamProfile.trackPageView(teamId);
        }
      })
      .catch((error) => {
        this.logger.error('Failed to load team on init', { slug, error });
        this.toast.error('Failed to load team profile');
      });
  }

  // ============================================
  // SEO
  // ============================================

  private updateSeo(team: NonNullable<ReturnType<typeof this.teamProfile.team>>): void {
    this.seo.updateForTeam({
      id: team.id,
      slug: team.slug,
      teamName: team.teamName,
      sport: team.sport,
      location: team.location,
      logoUrl: team.logoUrl,
      imageUrl: team.galleryImages?.[0] || team.logoUrl,
      record: this.teamProfile.recordDisplay() || undefined,
    });

    this.analytics.trackEvent('team_viewed', {
      team_id: team.id,
      team_slug: team.slug,
      team_name: team.teamName,
      sport: team.sport,
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle back navigation — SSR-safe.
   */
  protected onBackClick(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (window.history.length > 1) {
      window.history.back();
    } else {
      this.router.navigate(['/home']);
    }
  }

  /**
   * Handle tab changes for analytics.
   */
  protected onTabChange(tab: TeamProfileTabId): void {
    this.analytics.trackEvent('tab_changed', {
      tab,
      team_slug: this.teamSlug(),
      context: 'team_profile',
    });
  }

  /**
   * Handle follow button — requires authentication.
   */
  protected async onFollow(): Promise<void> {
    if (!this.authFlow.isAuthenticated()) {
      const result = await this.authModal.presentSignInToContinue('follow teams', {
        onGoogle: () => this.authFlow.signInWithGoogle(),
        onApple: () => this.authFlow.signInWithApple(),
        onEmailAuth: async (mode, data) =>
          mode === 'login'
            ? this.authFlow.signInWithEmail(data)
            : this.authFlow.signUpWithEmail(data),
      });
      if (!result.authenticated) return;
    }

    // Authenticated — toggle follow
    await this.teamProfile.toggleFollow();
    const isFollowing = this.teamProfile.followStats()?.isFollowing;
    this.toast.success(isFollowing ? 'Following!' : 'Unfollowed');
  }

  /**
   * Handle share team.
   */
  protected async onShare(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const team = this.teamProfile.team();
    if (!team) return;

    await this.share.shareTeam({
      id: team.id,
      slug: team.slug,
      teamName: team.teamName,
      sport: team.sport,
      location: team.location,
      logoUrl: team.logoUrl,
      imageUrl: team.galleryImages?.[0] || team.logoUrl,
      record: this.teamProfile.recordDisplay() || undefined,
    });
  }

  /**
   * Handle QR code display.
   */
  protected async onQrCode(): Promise<void> {
    const team = this.teamProfile.team();
    if (!team) return;

    try {
      await this.qrCode.open({
        url: `https://nxt1sports.com/team/${team.slug}`,
        displayName: team.teamName,
        profileImg: team.logoUrl || undefined,
        sport: team.sport || 'Sports',
        unicode: team.slug,
        isOwnProfile: this.isTeamAdmin(),
        entityType: 'team',
      });
    } catch (err) {
      this.logger.error('Failed to open QR code modal', err);
      this.toast.error('Unable to open QR code');
    }
  }

  /**
   * Handle manage team — open adaptive modal overlay.
   * On save, invalidate cache and reload team data.
   */
  protected async onManageTeam(): Promise<void> {
    const team = this.teamProfile.team();
    const result = await this.manageTeamModal.open({
      teamId: team?.id ?? undefined,
    });

    if (result.saved) {
      // Reload team data to reflect management changes
      const slug = this.teamSlug();
      if (slug) {
        this.teamProfile.startLoading();
        this.teamProfile.loadTeam(slug, this.isTeamAdmin()).catch((error) => {
          this.logger.error('Failed to reload team after manage', { slug, error });
        });
      }
    }
  }

  /**
   * Handle roster member click — navigate to their profile.
   */
  protected onRosterMemberClick(member: TeamProfileRosterMember): void {
    if (member.profileCode) {
      this.router.navigate(['/profile', member.profileCode]);
    } else {
      this.logger.debug('Roster member has no profile code', { memberId: member.id });
    }
  }

  /**
   * Handle post click — navigate to post detail.
   */
  protected onPostClick(post: TeamProfilePost): void {
    if (post.id) {
      this.router.navigate(['/post', post.id]);
    }
  }

  /**
   * Mobile three-dot menu — triggered by top-nav (moreClick) via ProfilePageActionsService.
   * Mirrors TeamProfileShellWebComponent.onMenuClick() for the mobile top-nav context.
   */
  protected async onTeamMoreMenu(): Promise<void> {
    const isAdmin = this.isTeamAdmin();
    const actions: BottomSheetAction[] = isAdmin
      ? [
          { label: 'Manage Team', role: 'secondary', icon: 'settings' },
          { label: 'Share Team', role: 'secondary', icon: 'share' },
          { label: 'QR Code', role: 'secondary', icon: 'qrCode' },
          { label: 'Copy Link', role: 'secondary', icon: 'link' },
        ]
      : [
          { label: 'Share Team', role: 'secondary', icon: 'share' },
          { label: 'Copy Link', role: 'secondary', icon: 'link' },
          { label: 'Report', role: 'destructive', icon: 'flag' },
        ];

    const result = await this.bottomSheet.show<BottomSheetAction>({
      actions,
      showClose: false,
      backdropDismiss: true,
      ...SHEET_PRESETS.COMPACT,
    });

    const selected = result?.data as BottomSheetAction | undefined;
    if (!selected) return;

    switch (selected.label) {
      case 'Manage Team':
        await this.onManageTeam();
        break;
      case 'Share Team':
      case 'Copy Link':
        await this.onShare();
        break;
      case 'QR Code':
        await this.onQrCode();
        break;
      case 'Report':
        this.logger.info('Report team requested');
        break;
    }
  }
}
