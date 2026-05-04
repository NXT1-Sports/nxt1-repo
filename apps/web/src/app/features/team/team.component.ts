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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { TeamProfileShellWebComponent } from '@nxt1/ui/team-profile';
import { NxtCtaBannerComponent, type CtaAvatarImage } from '@nxt1/ui/components/cta-banner';
import {
  ConnectedAccountsModalService,
  ConnectedAccountsResyncService,
} from '@nxt1/ui/components/connected-sources';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { AuthModalService } from '@nxt1/ui/auth';
import { QrCodeService } from '@nxt1/ui/qr-code';
import { TeamProfileService } from '@nxt1/ui/team-profile';
import { ManageTeamModalService } from '@nxt1/ui/manage-team';
import { InviteBottomSheetService } from '@nxt1/ui/invite';
import { NxtOverlayService } from '@nxt1/ui/components/overlay';
import { PostDetailOverlayService } from '@nxt1/ui/post-cards';
import {
  ShareActionsOverlayComponent,
  type ShareAction,
} from '../../core/components/share-actions-overlay.component';
import { IMAGE_PATHS } from '@nxt1/design-tokens/assets';
import {
  buildLinkSourcesFormData,
  buildCanonicalProfilePath,
  buildCanonicalTeamPath,
  buildUTMShareUrl,
  mapToConnectedSources,
  UTM_MEDIUM,
  UTM_CAMPAIGN,
  type TeamProfileTabId,
  type TeamProfileRosterMember,
  type TeamProfilePost,
  type LinkSourcesFormData,
} from '@nxt1/core';
import { resolveCanonicalTeamRoute } from '@nxt1/core/helpers';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { AUTH_SERVICE, type IAuthService } from '../../core/services/auth/auth.interface';
import { AuthFlowService } from '../../core/services/auth';
import {
  SeoService,
  AnalyticsService,
  ShareService,
  ProfilePageActionsService,
  EditProfileApiService,
} from '../../core/services';
import { clearHttpCache } from '../../core/infrastructure';
import { environment } from '../../../environments/environment';

const TEAM_INTEL_ENABLED = false;

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
      [teamId]="routeTeamCode()"
      [isTeamAdmin]="isTeamAdmin()"
      [teamIntelEnabled]="teamIntelEnabled"
      [skipInternalLoad]="true"
      (backClick)="onBackClick()"
      (tabChange)="onTabChange($event)"
      (shareClick)="onShare()"
      (copyLinkClick)="onCopyLink()"
      (qrCodeClick)="onQrCode()"
      (manageTeamClick)="onManageTeam()"
      (connectedAccountsClick)="onConnectedAccounts()"
      (inviteRosterClick)="onInviteRoster()"
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

      @media (max-width: 768px) {
        :host {
          /* Keep horizontal full-bleed, but do not pull content under the fixed top nav. */
          margin-top: 0;
        }
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
  private readonly inviteModal = inject(InviteBottomSheetService);
  private readonly connectedAccountsModal = inject(ConnectedAccountsModalService);
  private readonly connectedAccountsResync = inject(ConnectedAccountsResyncService);
  private readonly editProfileApi = inject(EditProfileApiService);
  private readonly profilePageActions = inject(ProfilePageActionsService);
  private readonly overlay = inject(NxtOverlayService);
  private readonly postDetailOverlay = inject(PostDetailOverlayService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  // ============================================
  // COMPUTED
  // ============================================

  /**
   * Team slug from route parameter.
   */
  private readonly routeParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  protected readonly teamSlug = computed<string>(() => {
    return this.routeParams().get('slug') || '';
  });

  protected readonly routeTeamCode = computed<string>(
    () => this.routeParams().get('teamCode') || ''
  );

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
  protected readonly teamIntelEnabled = TEAM_INTEL_ENABLED;

  constructor() {
    // Update mobile top-nav edit/more buttons when team admin status is resolved
    effect(() => {
      const isAdmin = this.isTeamAdmin();
      // Show more for everyone; show pencil only for admins;
      // isOwnPage = true for admins → hamburger instead of back arrow
      this.profilePageActions.setMobileActions({
        showEdit: isAdmin,
        showMore: true,
        isOwnPage: isAdmin,
      });
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

    let lastSyncedTeamIdentity = '';
    effect(() => {
      const team = this.teamProfile.team();
      const isAdmin = this.isTeamAdmin();
      const teamCode = team?.teamCode?.trim();
      if (!team || !isAdmin || !teamCode) return;

      const syncKey = `${team.id ?? ''}:${team.slug ?? ''}:${teamCode}`;
      if (syncKey === lastSyncedTeamIdentity) return;
      lastSyncedTeamIdentity = syncKey;

      void this.authFlow.applyResolvedTeamIdentity({
        teamCode,
        teamId: team.id,
        slug: team.slug || this.teamSlug(),
        teamName: team.teamName,
        sport: team.sport,
        logoUrl: team.logoUrl,
      });
    });

    effect(() => {
      const team = this.teamProfile.team();
      const routeSlug = this.teamSlug();
      const routeTeamCode = this.routeTeamCode();
      const teamCode = team?.teamCode?.trim();
      if (!team || !routeSlug || !teamCode) return;

      const canonicalPath = buildCanonicalTeamPath({
        slug: team.slug || routeSlug,
        teamName: team.teamName,
        teamCode,
      });

      if (this.router.url.split('?')[0] !== canonicalPath || routeTeamCode !== teamCode) {
        void this.router.navigateByUrl(canonicalPath, { replaceUrl: true });
      }
    });

    // Clear mobile action buttons when navigating away from this page
    this.destroyRef.onDestroy(() => this.profilePageActions.clearMobileActions());
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const slug = params.get('slug') || '';
      const teamCode = params.get('teamCode') || '';

      this.logger.info('Team component initialized/updated', { teamSlug: slug, teamCode });

      // Guard: a slug containing '.' is a static asset (e.g. team-profile-skeleton.component.css.map)
      // being requested relative to the current /team/* URL. Skip the API call.
      if ((!slug && !teamCode) || slug.includes('.')) {
        this.logger.warn(
          'Invalid team identifier (static asset request caught by router), skipping load',
          {
            slug,
            teamCode,
          }
        );
        return;
      }

      const canonicalOwnTeamPath = !teamCode ? this.resolveCanonicalOwnTeamPath() : null;
      if (canonicalOwnTeamPath) {
        this.logger.info('Repairing legacy slug-only own-team route', {
          from: this.router.url,
          to: canonicalOwnTeamPath,
        });
        void this.router.navigateByUrl(canonicalOwnTeamPath, { replaceUrl: true });
        return;
      }

      // Set loading state immediately before async API call to prevent template flash
      // Only set if we are navigating to a strictly different team
      this.teamProfile.startLoading();

      // Use loadTeamById — the :teamCode URL param may be a raw Firestore document ID.
      // The /by-id backend endpoint handles both Firestore IDs and short team codes via
      // fallback, so it works for all teams. The /by-teamcode endpoint only matches the
      // teamCode field and returns 404 for Firestore IDs, causing the first-visit error.
      const loadPromise = teamCode
        ? this.teamProfile.loadTeamById(teamCode, this.isTeamAdmin())
        : this.teamProfile.loadTeam(slug, this.isTeamAdmin());

      loadPromise
        .then(() => {
          const loadedTeam = this.teamProfile.team();
          if (!loadedTeam) return;

          // Immediate canonical repair: when arriving via a slug-only URL (no teamCode in route),
          // navigate to /team/:slug/:teamCode as soon as the API response arrives — same microtask
          // as the signal update, before Angular's next change-detection cycle renders the slug URL.
          // This eliminates the address-bar flash caused by the async constructor-effect approach.
          if (!teamCode && loadedTeam.teamCode?.trim()) {
            const canonicalPath = buildCanonicalTeamPath({
              slug: loadedTeam.slug || slug,
              teamName: loadedTeam.teamName,
              teamCode: loadedTeam.teamCode.trim(),
            });
            void this.router.navigateByUrl(canonicalPath, { replaceUrl: true });
            return; // ngOnInit will re-fire with the correct teamCode param
          }

          // SSR-deterministic SEO: updateSeo is also called from a constructor
          // effect(), but effects may run after Angular serializes SSR HTML.
          // Calling it here directly ensures meta tags are written synchronously
          // when the HTTP response arrives, before serialization completes.
          this.updateSeo(loadedTeam);

          // Track page view after data loads — skip if user is an admin of this team
          if (!this.isTeamAdmin()) {
            const teamId = this.teamProfile.team()?.id;
            if (teamId) void this.teamProfile.trackPageView(teamId);
          }
        })
        .catch((error) => {
          this.logger.error('Failed to load team on init', { slug, teamCode, error });
          this.toast.error('Failed to load team profile');
        });
    });
  }

  // ============================================
  // SEO
  // ============================================

  private resolveCanonicalOwnTeamPath(): string | null {
    const user = this.authFlow.user() as {
      readonly teamCode?:
        | {
            readonly teamCode?: string;
            readonly teamId?: string;
            readonly id?: string;
            readonly code?: string;
            readonly slug?: string;
            readonly unicode?: string;
            readonly teamName?: string;
          }
        | string
        | null;
      readonly managedTeamCodes?: readonly string[] | null;
      readonly sports?: ReadonlyArray<{
        readonly isPrimary?: boolean;
        readonly order?: number;
        readonly team?: {
          readonly name?: string;
          readonly teamId?: string;
          readonly id?: string;
          readonly teamCode?: string;
          readonly code?: string;
        };
      }>;
    } | null;

    if (!user) return null;

    const rawTeamCode = user.teamCode;
    const teamCodeData = rawTeamCode && typeof rawTeamCode === 'object' ? rawTeamCode : null;
    const rawTeamReference = typeof rawTeamCode === 'string' ? rawTeamCode.trim() : '';
    const activeSport =
      user.sports?.find((sport) => sport.isPrimary || sport.order === 0) ?? user.sports?.[0];

    const resolvedTeamRoute = resolveCanonicalTeamRoute({
      slug: teamCodeData?.slug?.trim(),
      teamName: teamCodeData?.teamName ?? activeSport?.team?.name,
      teamCode:
        teamCodeData?.teamCode?.trim() || activeSport?.team?.teamCode?.trim() || rawTeamReference,
      code: teamCodeData?.code?.trim() || activeSport?.team?.code?.trim(),
      teamId: teamCodeData?.teamId?.trim() || activeSport?.team?.teamId?.trim(),
      id:
        (typeof teamCodeData?.id === 'string' ? teamCodeData.id.trim() : '') ||
        activeSport?.team?.id?.trim(),
      unicode: teamCodeData?.unicode?.trim(),
    });

    if (!resolvedTeamRoute?.teamIdentifier) return null;

    // Only auto-repair to the user's own-team canonical path if the URL slug
    // actually matches the resolved own-team slug. Otherwise the user is
    // viewing a different team (via sidebar/switcher) and we must NOT redirect.
    const currentSlug = this.teamSlug().trim().toLowerCase();
    const ownSlug = resolvedTeamRoute.slug?.trim().toLowerCase();
    if (!currentSlug || !ownSlug || currentSlug !== ownSlug) return null;

    return resolvedTeamRoute.path;
  }

  private updateSeo(team: NonNullable<ReturnType<typeof this.teamProfile.team>>): void {
    this.seo.updateForTeam({
      id: team.id,
      slug: team.slug,
      teamCode: team.teamCode,
      teamName: team.teamName,
      sport: team.sport,
      location: team.location,
      logoUrl: team.logoUrl,
      imageUrl: team.galleryImages?.[0] || team.logoUrl,
      record: this.teamProfile.recordDisplay() || undefined,
    });

    this.analytics.trackEvent(APP_EVENTS.TEAM_PAGE_VIEWED, {
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
    this.analytics.trackEvent(APP_EVENTS.TAB_CHANGED, {
      tab,
      team_slug: this.teamSlug(),
      context: 'team_profile',
    });
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
      teamCode: team.teamCode,
      teamName: team.teamName,
      sport: team.sport,
      location: team.location,
      logoUrl: team.logoUrl,
      imageUrl: team.galleryImages?.[0] || team.logoUrl,
      record: this.teamProfile.recordDisplay() || undefined,
    });
  }

  protected async onCopyLink(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const team = this.teamProfile.team();
    if (!team) return;

    const teamPath = buildCanonicalTeamPath({
      slug: team.slug,
      teamName: team.teamName,
      teamCode: team.teamCode,
      id: team.id,
    });
    const shareBaseUrl = globalThis.location?.origin ?? environment.webUrl;
    const teamUrl = buildUTMShareUrl(
      `${shareBaseUrl}${teamPath}`,
      UTM_MEDIUM.COPY_LINK,
      UTM_CAMPAIGN.TEAM,
      team.sport?.toLowerCase()
    );

    const copied = await this.share.copy(teamUrl);
    if (copied) {
      this.logger.info('Team link copied', { teamId: team.id, slug: team.slug });
    }
  }

  /**
   * Handle QR code display.
   */
  protected async onQrCode(): Promise<void> {
    const team = this.teamProfile.team();
    if (!team) return;

    const teamPath = buildCanonicalTeamPath({
      slug: team.slug,
      teamName: team.teamName,
      teamCode: team.teamCode,
      id: team.id,
    });

    const shareBaseUrl = globalThis.location?.origin ?? environment.webUrl;
    const qrUrl = buildUTMShareUrl(
      `${shareBaseUrl}${teamPath}`,
      UTM_MEDIUM.QR,
      UTM_CAMPAIGN.TEAM,
      team.sport?.toLowerCase()
    );

    try {
      await this.qrCode.open({
        url: qrUrl,
        displayName: team.teamName,
        profileImg: team.logoUrl || undefined,
        sport: team.sport || 'Sports',
        unicode: team.teamCode || team.slug,
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
      await this.reloadTeamProfile('manage');
      await this.syncGlobalUserAfterTeamMutation();
    }
  }

  protected async onConnectedAccounts(): Promise<void> {
    const user = this.authService.user();
    if (!user?.uid) {
      this.toast.error('Not signed in. Please refresh and try again.');
      return;
    }

    const linkSourcesData = buildLinkSourcesFormData({
      connectedSources: user.connectedSources ?? [],
      connectedEmails: user.connectedEmails ?? [],
      firebaseProviders: this.authService.firebaseUser()?.providerData ?? [],
    }) as LinkSourcesFormData | null;

    const result = await this.connectedAccountsModal.open({
      role: user.role,
      selectedSports: user.selectedSports ?? [],
      linkSourcesData,
      scope: 'team',
    });

    if (!result.saved || !result.linkSources) {
      if (result.resync) {
        await this.connectedAccountsResync.request(result.sources ?? []);
      }
      return;
    }

    const connectedSources = mapToConnectedSources(result.linkSources.links);
    const saveResult = await this.editProfileApi.updateSection(user.uid, 'connected-sources', {
      connectedSources,
    });

    if (!saveResult.success) {
      this.logger.error('Failed to save team connected accounts', undefined, {
        error: saveResult.error,
      });
      this.toast.error(saveResult.error ?? 'Failed to save connected accounts');
      return;
    }

    await this.authService.refreshUserProfile();
    await this.reloadTeamProfile('connected-accounts');
    this.toast.success('Connected accounts updated');

    if (result.resync) {
      await this.connectedAccountsResync.request(result.sources ?? connectedSources);
    }
  }

  protected async onInviteRoster(): Promise<void> {
    const team = this.teamProfile.team();
    if (!team) return;

    await this.inviteModal.open({
      inviteType: 'team',
      team: {
        id: team.id,
        name: team.teamName || 'Team',
        sport: team.sport || 'Sports',
        logoUrl: team.logoUrl ?? undefined,
        memberCount: this.teamProfile.rosterCount(),
        teamCode: team.teamCode ?? undefined,
      },
    });
  }

  /**
   * Handle roster member click — open desktop web roster clicks in a new tab.
   */
  protected onRosterMemberClick(member: TeamProfileRosterMember): void {
    const canonicalUnicode = member.unicode || member.profileCode;
    if (canonicalUnicode) {
      const teamSport = this.teamProfile.team()?.sport;
      const athleteName = member.displayName || `${member.firstName} ${member.lastName}`.trim();
      const profilePath = buildCanonicalProfilePath({
        athleteName,
        sport: teamSport,
        unicode: canonicalUnicode,
      });

      if (isPlatformBrowser(this.platformId) && this.platform.isDesktop()) {
        window.open(profilePath, '_blank', 'noopener,noreferrer');
        return;
      }

      void this.router.navigateByUrl(profilePath);
    } else {
      this.logger.debug('Roster member has no unicode', { memberId: member.id });
    }
  }

  /**
   * Handle post click — open post detail overlay via canonical post route.
   * Uses teamCode as the userUnicode segment so deep-link URLs are meaningful.
   */
  protected onPostClick(post: TeamProfilePost): void {
    if (!post.id) return;
    const unicode = this.routeTeamCode() || this.teamSlug() || '_';
    const team = this.teamProfile.team();
    void this.postDetailOverlay.open({
      post,
      userUnicode: unicode,
      author: {
        name: team?.teamName ?? 'Team',
        avatarUrl: team?.logoUrl,
      },
    });
    this.logger.debug('Post click — opening post detail overlay', {
      postId: post.id,
      unicode,
    });
  }

  private async reloadTeamProfile(source: 'manage' | 'connected-accounts'): Promise<void> {
    const slug = this.teamSlug();
    const teamCode = this.routeTeamCode();

    if (!slug && !teamCode) return;

    this.teamProfile.startLoading();

    try {
      if (teamCode) {
        await this.teamProfile.loadTeamByCode(teamCode, this.isTeamAdmin(), true);
      } else {
        await this.teamProfile.loadTeam(slug, this.isTeamAdmin(), true);
      }
    } catch (error) {
      this.logger.error('Failed to reload team profile', error, {
        source,
        slug,
        teamCode,
      });
    }
  }

  /**
   * Force-refresh global auth-backed user context after team mutations so
   * shared navigation (top-right sport selector/avatar) updates immediately.
   */
  private async syncGlobalUserAfterTeamMutation(): Promise<void> {
    await clearHttpCache('*teams*');
    await clearHttpCache('*auth/profile*');
    await clearHttpCache('*profile*');

    try {
      await this.authService.refreshUserProfile();
    } catch (error) {
      this.logger.warn('Failed to refresh auth user after team mutation', { error });
    }

    const team = this.teamProfile.team();
    const teamCode = (team?.teamCode ?? team?.id ?? '').trim();
    if (!team || !teamCode) {
      return;
    }

    try {
      await this.authFlow.applyResolvedTeamIdentity({
        teamCode,
        teamId: team.id,
        slug: team.slug,
        teamName: team.teamName,
        sport: team.sport,
        logoUrl: team.logoUrl ?? null,
      });
    } catch (error) {
      this.logger.warn('Failed to apply resolved team identity after team mutation', {
        error,
        teamCode,
      });
    }
  }

  /**
   * Mobile three-dot menu — triggered by top-nav (moreClick) via ProfilePageActionsService.
   * Mirrors TeamProfileShellWebComponent.onMenuClick() for the mobile top-nav context.
   */
  protected async onTeamMoreMenu(): Promise<void> {
    const isAdmin = this.isTeamAdmin();
    const actions: ShareAction[] = isAdmin
      ? [
          { label: 'Manage Team', icon: 'settings' },
          { label: 'Share Team', icon: 'share' },
          { label: 'QR Code', icon: 'qrCode' },
          { label: 'Copy Link', icon: 'link' },
        ]
      : [
          { label: 'Share Team', icon: 'share' },
          { label: 'Copy Link', icon: 'link' },
          { label: 'Report', icon: 'flag', destructive: true },
        ];

    const ref = this.overlay.open<ShareActionsOverlayComponent, { action: string } | null>({
      component: ShareActionsOverlayComponent,
      inputs: { title: 'Team Actions', actions },
      size: 'sm',
      backdropDismiss: true,
      escDismiss: true,
      showCloseButton: false,
      ariaLabel: 'Team Actions',
    });

    const result = await ref.closed;
    const action = result.data?.action;
    if (!action) return;

    switch (action) {
      case 'Manage Team':
        await this.onManageTeam();
        break;
      case 'Share Team':
        await this.onShare();
        break;
      case 'Copy Link':
        await this.onCopyLink();
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
