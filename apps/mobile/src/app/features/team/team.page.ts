/**
 * @fileoverview Team Profile Page — Mobile App Wrapper
 * @module @nxt1/mobile/features/team
 * @version 2.0.0
 *
 * Thin mobile wrapper for the shared TeamProfileShellWebComponent.
 * Mirrors the Profile mobile wrapper pattern exactly.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                 apps/mobile/team (~5%)                      │
 * │     Mobile-specific: Routes, Ionic nav, native share        │
 * ├─────────────────────────────────────────────────────────────┤
 * │           @nxt1/ui/team-profile (~95% shared)               │
 * │    TeamProfileShellWebComponent + TeamProfileService         │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Responsibilities:
 * - Route parameter extraction (team slug)
 * - API data fetching → TeamProfileService bridge
 * - Ionic navigation (NavController)
 * - Native share via ShareService
 *
 * Routes:
 * - /team/:slug — View team by slug
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  DestroyRef,
  effect,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal, toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map, distinctUntilChanged, switchMap, tap, from, combineLatest, filter, of } from 'rxjs';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import {
  TeamProfileShellWebComponent,
  TeamProfileService,
  ManageTeamBottomSheetService,
  QrCodeBottomSheetService,
  NxtLoggingService,
  NxtToastService,
  NxtPageHeaderComponent,
  NxtIconComponent,
  NxtBottomSheetService,
  NxtSidenavService,
  NxtRefresherComponent,
  SHEET_PRESETS,
  IntelService,
  AgentXOperationChatComponent,
  type ActionFooterButton,
  type BottomSheetAction,
  type RefreshEvent,
} from '@nxt1/ui';
import { APP_EVENTS } from '@nxt1/core/analytics';
import {
  buildCanonicalProfilePath,
  buildCanonicalTeamPath,
  buildUTMShareUrl,
  UTM_MEDIUM,
  UTM_CAMPAIGN,
  type TeamProfileTabId,
  type TeamProfileRosterMember,
  type TeamProfilePost,
} from '@nxt1/core';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';

import { MobileAuthService } from '../../core/services/auth/mobile-auth.service';
import { AnalyticsService } from '../../core/services/infrastructure/analytics.service';
import { ShareService } from '../../core/services/native/share.service';
import { TeamProfileApiService } from '../../core/services/api/team-profile-api.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [
    IonHeader,
    IonContent,
    IonToolbar,
    NxtPageHeaderComponent,
    NxtIconComponent,
    NxtRefresherComponent,
    TeamProfileShellWebComponent,
  ],
  template: `
    <!-- Transparent dummy header: safe area only (matches profile.component.ts pattern) -->
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>

    <!-- Outer content: overflow visible (non-scrolling), matches profile pattern -->
    <ion-content [fullscreen]="true" class="team-outer-content">
      <!-- Fixed page header (outside scrolling area — mirrors profile-shell.component.ts) -->
      <nxt1-page-header [showBack]="true" (backClick)="onBackClick()" (menuClick)="onMenuClick()">
        <!-- Title: "Team" + NXT1 brand logo (mirrors "Profile" + logo in profile-shell) -->
        <div pageHeaderSlot="title" class="header-logo">
          <span class="header-title-text">Team</span>
          <svg
            class="header-brand-logo"
            viewBox="0 0 612 792"
            width="40"
            height="40"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="10"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path [attr.d]="agentXLogoPath" />
            <polygon [attr.points]="agentXLogoPolygon" />
          </svg>
        </div>

        <!-- End: three-dots + pencil (admin only) -->
        <div pageHeaderSlot="end" class="header-actions">
          <button
            type="button"
            class="header-action-btn"
            aria-label="More options"
            (click)="onMoreMenu()"
          >
            <nxt1-icon name="moreHorizontal" [size]="22" />
          </button>
          @if (isTeamAdmin()) {
            <button
              type="button"
              class="header-action-btn"
              aria-label="Manage team"
              (click)="onManageTeam()"
            >
              <nxt1-icon name="pencil" [size]="20" />
            </button>
          }
        </div>
      </nxt1-page-header>

      <!-- Inner scrollable content (mirrors profile-shell ion-content pattern) -->
      <ion-content [fullscreen]="true" class="team-scroll-content">
        <nxt-refresher (onRefresh)="handleRefresh($event)" />
        <nxt1-team-profile-shell-web
          [teamSlug]="teamSlug()"
          [teamId]="routeTeamCode()"
          [isTeamAdmin]="isTeamAdmin()"
          [skipInternalLoad]="true"
          (backClick)="onBackClick()"
          (tabChange)="onTabChange($event)"
          (shareClick)="onShare()"
          (copyLinkClick)="onCopyLink()"
          (qrCodeClick)="onQrCode()"
          (manageTeamClick)="onManageTeam()"
          (rosterMemberClick)="onRosterMemberClick($event)"
          (postClick)="onPostClick($event)"
          (refreshRequest)="onRefreshRequest()"
        />
      </ion-content>
    </ion-content>
    @if (teamFooterButtons().length > 0) {
      <div class="team-action-footer-bar">
        <div class="team-action-footer-inner">
          @for (btn of teamFooterButtons(); track btn.id) {
            <button
              type="button"
              [class]="'taf-btn taf-btn--' + btn.variant"
              (click)="btn.onClick()"
            >
              {{ btn.label }}
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }

    /* Transparent dummy header — safe area only, not visible */
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

    /* Fullscreen content — outer container is non-scrolling (overflow visible) */
    ion-content.team-outer-content {
      --background: var(--nxt1-color-bg-primary, #0a0a0a);
    }
    ion-content.team-outer-content::part(scroll) {
      overflow: visible;
    }

    /* Inner content — the real scrolling container */
    ion-content.team-scroll-content {
      --background: var(--nxt1-color-bg-primary, #0a0a0a);
    }

    /* Header logo: team name + brand logo (matches profile-shell.component.ts) */
    .header-logo {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      width: 100%;
      margin-top: -8px;
      margin-left: -18px;
    }
    .header-title-text {
      display: inline-flex;
      align-items: center;
      font-family: var(--nxt1-font-family-brand, var(--ion-font-family));
      font-size: var(--nxt1-font-size-xl, 20px);
      font-weight: var(--nxt1-font-weight-semibold, 600);
      letter-spacing: var(--nxt1-letter-spacing-tight, -0.01em);
      color: var(--nxt1-color-text-primary, #ffffff);
      line-height: 1;
      transform: translateY(1px);
    }
    .header-brand-logo {
      display: block;
      flex-shrink: 0;
      color: var(--nxt1-color-text-primary, #ffffff);
      transform: translateY(1px);
    }

    /* Action buttons (matches profile-shell.component.ts) */
    .header-actions {
      display: flex;
      align-items: center;
      gap: var(--nxt1-spacing-1, 4px);
    }
    .header-action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      padding: 0;
      margin: 0;
      border: none;
      background: transparent;
      border-radius: var(--nxt1-radius-full, 50%);
      color: var(--m-text);
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition:
        background-color 0.15s ease,
        transform 0.1s ease;
    }
    .header-action-btn:active {
      background: var(--m-surface-2);
      transform: scale(0.92);
    }
    .team-action-footer-bar {
      position: fixed;
      bottom: 84px;
      left: 16px;
      right: 16px;
      z-index: 999;
      background: var(--nxt1-nav-bgSolid, rgb(22, 22, 22));
      border-radius: 16px;
      border: 0.55px solid var(--nxt1-nav-borderSolid, rgba(255, 255, 255, 0.12));
      box-shadow: var(--nxt1-nav-shadowSolid, 0 1px 3px rgba(0, 0, 0, 0.12));
      pointer-events: auto;
      overflow: hidden;
    }
    .team-action-footer-inner {
      display: flex;
      gap: 8px;
      padding: 10px 16px;
    }
    .taf-btn {
      flex: 1;
      padding: 12px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 700;
      font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
      letter-spacing: 0.02em;
    }
    .taf-btn--secondary {
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .taf-btn--primary {
      background: var(--nxt1-color-primary, #d4ff00);
      color: #000;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamPage {
  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;

  // ============================================
  // DEPENDENCIES
  // ============================================

  private readonly route = inject(ActivatedRoute);
  private readonly navController = inject(NavController);
  private readonly authService = inject(MobileAuthService);
  private readonly teamProfile = inject(TeamProfileService);
  private readonly teamApi = inject(TeamProfileApiService);
  private readonly manageTeamSheet = inject(ManageTeamBottomSheetService);
  private readonly qrCode = inject(QrCodeBottomSheetService);
  private readonly analytics = inject(AnalyticsService);
  private readonly share = inject(ShareService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('TeamPage');
  private readonly destroyRef = inject(DestroyRef);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly intel = inject(IntelService);

  // ============================================
  // STATE
  // ============================================

  /**
   * Team slug from route parameter — reactive via toSignal.
   */
  protected readonly teamSlug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug') ?? '')),
    { initialValue: '' }
  );

  protected readonly routeTeamCode = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('teamCode') ?? '')),
    { initialValue: '' }
  );

  /**
   * Whether the current user is an admin of this team.
   * Derived from TeamProfileService after data loads.
   */
  protected readonly isTeamAdmin = computed(() => this.teamProfile.isTeamAdmin());

  /**
   * Page header title — team name once loaded, "Team" as fallback.
   * Mirrors "Profile" label in profile-shell.component.ts.
   */
  protected readonly teamTitle = computed(() => this.teamProfile.team()?.teamName ?? 'Team');

  /**
   * Sticky footer buttons for team admin actions on the intel tab.
   */
  protected readonly teamFooterButtons = computed<ActionFooterButton[]>(() => {
    if (!this.isTeamAdmin()) return [];
    if (this.teamProfile.activeTab() === 'intel') {
      return [
        {
          id: 'team-intel',
          label: this.intel.teamReport() ? 'Update Intel' : 'Generate Intel',
          variant: 'primary',
          onClick: () => void this.onGenerateTeamIntel(),
        },
      ];
    }
    return [];
  });

  constructor() {
    // Clean up service state when leaving this page
    this.destroyRef.onDestroy(() => this.teamProfile.startLoading());

    // Clear stale data immediately when slug changes (prevents old-data flash)
    effect(() => {
      this.teamSlug();
      this.teamProfile.startLoading();
    });

    /**
     * Bridge: fetch real API data → push into TeamProfileService.
     *
     * Waits for auth initialization before reacting to route changes.
     * Without this guard, the first emit happens before auth.user() is
     * populated, causing incorrect isTeamAdmin checks.
     */
    const authReady$ = toObservable(this.authService.isInitialized).pipe(
      filter((initialized) => initialized)
    );

    combineLatest([
      toObservable(this.teamSlug).pipe(distinctUntilChanged()),
      toObservable(this.routeTeamCode).pipe(distinctUntilChanged()),
      authReady$,
    ])
      .pipe(
        map(([slug, teamCode]) => ({ slug, teamCode })),
        distinctUntilChanged(
          (previous, current) =>
            previous.slug === current.slug && previous.teamCode === current.teamCode
        ),
        tap(() => this.teamProfile.startLoading()),
        switchMap(({ slug, teamCode }) => {
          if (!slug && !teamCode) {
            this.teamProfile.setError('No team route provided');
            return of({ success: false as const, error: 'No team route provided' });
          }

          return from(
            teamCode ? this.teamApi.getTeamById(teamCode) : this.teamApi.getTeamBySlug(slug)
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.teamProfile.loadFromExternalData(response.data);
            this.logger.info('Team profile loaded', {
              slug: this.teamSlug(),
              teamCode: this.routeTeamCode(),
              teamName: response.data.team?.teamName,
            });

            // Analytics: track team page view
            this.analytics.trackEvent(APP_EVENTS.TEAM_PAGE_VIEWED, {
              team_id: response.data.team?.id,
              team_slug: this.teamSlug(),
              team_name: response.data.team?.teamName,
              sport: response.data.team?.sport,
            });

            // Track page view (fire-and-forget)
            const teamId = response.data.team?.id;
            const viewerId = this.authService.user()?.uid;
            if (teamId) {
              void this.teamApi.trackPageView(teamId, viewerId);
              // Load intel eagerly so the intel tab renders instantly with no skeleton flash.
              void this.intel.loadTeamIntel(teamId);
            }
          } else {
            this.teamProfile.setError(response.error ?? 'Failed to load team profile');
            this.logger.error('Team profile API error', {
              slug: this.teamSlug(),
              error: response.error,
            });
          }
        },
        error: (err: unknown) => {
          const message = err instanceof Error ? err.message : 'Failed to load team profile';
          this.teamProfile.setError(message);
          this.logger.error('Team profile fetch failed', err, { slug: this.teamSlug() });
        },
      });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle native pull-to-refresh (ion-refresher event from the inner ion-content).
   */
  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    try {
      await this.onRefreshRequest();
    } finally {
      event.complete();
    }
  }

  /**
   * Re-fetches team data from the API and pushes it into TeamProfileService.
   * Called by both the native refresher and the shell's (refreshRequest) output.
   */
  protected async onRefreshRequest(): Promise<void> {
    const slug = this.teamSlug();
    const teamCode = this.routeTeamCode();

    if (!slug && !teamCode) {
      return;
    }

    try {
      const response = teamCode
        ? await this.teamApi.getTeamById(teamCode)
        : await this.teamApi.getTeamBySlug(slug);

      if (response.success && response.data) {
        this.teamProfile.loadFromExternalData(response.data);
        this.logger.info('Team profile refreshed', { slug, teamCode });

        const teamId = response.data.team?.id;
        if (teamId) {
          await this.intel.loadTeamIntel(teamId, true);
        }
      }
    } catch (err) {
      this.logger.error('Failed to refresh team profile', err, { slug, teamCode });
    }
  }

  protected onBackClick(): void {
    this.navController.back();
  }

  protected onMenuClick(): void {
    this.sidenavService.open();
  }

  protected async onMoreMenu(): Promise<void> {
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

  protected onTabChange(tab: TeamProfileTabId): void {
    this.analytics.trackEvent(APP_EVENTS.TAB_CHANGED, {
      tab,
      team_slug: this.teamSlug(),
      context: 'team_profile',
    });
  }

  protected async onShare(): Promise<void> {
    const team = this.teamProfile.team();
    if (!team) return;

    const result = await this.share.shareTeam({
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

    if (result.completed) {
      this.logger.info('Team shared', { slug: team.slug, method: result.activityType });
    }
  }

  protected async onCopyLink(): Promise<void> {
    const team = this.teamProfile.team();
    if (!team) return;

    const teamPath = buildCanonicalTeamPath({
      slug: team.slug,
      teamName: team.teamName,
      teamCode: team.teamCode,
      id: team.id,
    });
    const teamUrl = buildUTMShareUrl(
      `${environment.webUrl}${teamPath}`,
      UTM_MEDIUM.COPY_LINK,
      UTM_CAMPAIGN.TEAM,
      team.sport?.toLowerCase()
    );

    const copied = await this.share.copy(teamUrl, true);
    if (copied) {
      this.logger.info('Team link copied', {
        slug: team.slug,
        teamCode: team.teamCode,
      });
    }
  }

  protected async onQrCode(): Promise<void> {
    const team = this.teamProfile.team();
    if (!team) return;

    const teamPath = buildCanonicalTeamPath({
      slug: team.slug,
      teamName: team.teamName,
      teamCode: team.teamCode,
      id: team.id,
    });
    const qrUrl = buildUTMShareUrl(
      `${environment.webUrl}${teamPath}`,
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
      this.logger.error('Failed to open QR code', err);
      this.toast.error('Unable to open QR code');
    }
  }

  protected async onManageTeam(): Promise<void> {
    const result = await this.manageTeamSheet.open({
      teamId: this.teamProfile.team()?.id,
    });

    if (result?.saved) {
      // Refresh team data after management changes
      const slug = this.teamSlug();
      if (slug) {
        await this.teamApi.invalidateCache(slug);
      }

      const teamCode = this.routeTeamCode();
      const response = teamCode
        ? await this.teamApi.getTeamById(teamCode)
        : slug
          ? await this.teamApi.getTeamBySlug(slug)
          : null;

      if (response?.success && response.data) {
        this.teamProfile.loadFromExternalData(response.data);
      }
    }
  }

  protected onRosterMemberClick(member: TeamProfileRosterMember): void {
    if (member.profileCode) {
      const teamSport = this.teamProfile.team()?.sport;
      const athleteName = member.displayName || `${member.firstName} ${member.lastName}`.trim();
      void this.navController.navigateForward(
        buildCanonicalProfilePath({
          athleteName,
          sport: teamSport,
          unicode: member.profileCode,
        })
      );
    }
  }

  protected onPostClick(post: TeamProfilePost): void {
    if (post.id) {
      void this.navController.navigateForward(`/post/${post.id}`);
    }
  }

  protected async onGenerateTeamIntel(): Promise<void> {
    const teamId = this.teamProfile.team()?.id ?? '';
    const hasReport = !!this.intel.teamReport();
    await this.bottomSheet.openSheet({
      component: AgentXOperationChatComponent,
      componentProps: {
        contextId: 'team-intel-generate',
        contextTitle: hasReport ? 'Update Intel' : 'Generate Intel',
        contextIcon: 'flash-outline',
        contextType: 'command',
        initialMessage: hasReport
          ? `I want to update my team's Intel report. What information or recent results should I include to strengthen it?`
          : `I want to build an Agent X Intel report for my team. What information do you need from me to create the best possible report?`,
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      cssClass: 'agent-x-operation-sheet',
    });
    await this.intel.loadTeamIntel(teamId, true);
  }
}
