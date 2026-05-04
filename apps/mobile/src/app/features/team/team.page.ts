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
import { Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { toSignal, toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map, distinctUntilChanged, switchMap, tap, from, combineLatest, filter, of } from 'rxjs';
import { IonHeader, IonToolbar, IonContent, NavController } from '@ionic/angular/standalone';
import {
  TeamProfileShellWebComponent,
  TeamProfileService,
  ManageTeamModalService,
  QrCodeBottomSheetService,
  NxtLoggingService,
  NxtToastService,
  NxtBottomSheetService,
  NxtSidenavService,
  SHEET_PRESETS,
  IntelService,
  AgentXOperationChatComponent,
  type ActionFooterButton,
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

import { MobileAuthService } from '../../core/services/auth/mobile-auth.service';
import { AnalyticsService } from '../../core/services/infrastructure/analytics.service';
import { ShareService } from '../../core/services/native/share.service';
import { TeamProfileApiService } from '../../core/services/api/team-profile-api.service';
import { environment } from '../../../environments/environment';
import { PostDetailOverlayService } from '@nxt1/ui/post-cards';

const TEAM_INTEL_ENABLED = false;

@Component({
  selector: 'app-team',
  standalone: true,
  providers: [TeamProfileService],
  imports: [IonHeader, IonToolbar, IonContent, TeamProfileShellWebComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true" class="team-scroll-content" [scrollY]="false">
      <nxt1-team-profile-shell-web
        [teamSlug]="teamSlug()"
        [teamId]="resolvedTeamId()"
        [showPageHeader]="true"
        [isTeamAdmin]="isTeamAdmin()"
        [teamIntelEnabled]="teamIntelEnabled"
        [skipInternalLoad]="true"
        [hideFooterFab]="true"
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
      @if (teamFooterButtons().length > 0) {
        <div class="taf-overlay" slot="fixed">
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
        </div>
      }
    </ion-content>
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

    /* Scrollable content — sibling of nxt1-page-header, Ionic auto-offsets */
    ion-content.team-scroll-content {
      --background: var(--nxt1-color-bg-primary, #0a0a0a);
    }

    ion-content.team-scroll-content::part(scroll) {
      overflow: hidden;
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    nxt1-team-profile-shell-web {
      display: flex;
      flex: 1;
      min-height: 0;
    }

    .taf-overlay {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 30;
      pointer-events: none;
      padding: 0 16px calc(env(safe-area-inset-bottom, 0px) + 8px);
    }

    .team-action-footer-bar {
      pointer-events: auto;
      background: var(--nxt1-nav-bgSolid, rgb(22, 22, 22));
      border-radius: 16px;
      border: 0.55px solid var(--nxt1-nav-borderSolid, rgba(255, 255, 255, 0.12));
      box-shadow: var(--nxt1-nav-shadowSolid, 0 1px 3px rgba(0, 0, 0, 0.12));
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
  protected readonly teamIntelEnabled = TEAM_INTEL_ENABLED;

  // ============================================
  // DEPENDENCIES
  // ============================================

  private readonly route = inject(ActivatedRoute);
  private readonly navController = inject(NavController);
  private readonly authService = inject(MobileAuthService);
  private readonly teamProfile = inject(TeamProfileService);
  private readonly teamApi = inject(TeamProfileApiService);
  private readonly manageTeamModal = inject(ManageTeamModalService);
  private readonly qrCode = inject(QrCodeBottomSheetService);
  private readonly analytics = inject(AnalyticsService);
  private readonly share = inject(ShareService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('TeamPage');
  private readonly destroyRef = inject(DestroyRef);
  private readonly location = inject(Location);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly intel = inject(IntelService);
  private readonly postDetailOverlay = inject(PostDetailOverlayService);

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

  /** Team document ID resolved from loaded payload (never from URL params). */
  protected readonly resolvedTeamId = computed(() => this.teamProfile.team()?.id ?? '');

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
    if (this.teamIntelEnabled && this.teamProfile.activeTab() === 'intel') {
      return [
        {
          id: 'team-intel',
          label: this.intel.teamReport() ? 'Update Intel' : 'Generate Intel',
          variant: 'primary',
          onClick: () => void this.onGenerateTeamIntel(),
        },
      ];
    }
    if (this.teamProfile.activeTab() === 'timeline') {
      return [
        {
          id: 'add-update',
          label: '+ Add Update',
          variant: 'primary',
          onClick: () => void this.onAddUpdate(),
        },
      ];
    }
    return [];
  });

  private readonly firestoreIdPattern = /^[A-Za-z0-9]{20,}$/;

  constructor() {
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
        switchMap(({ teamCode }) => {
          if (!teamCode) {
            this.teamProfile.setError('Team code route is required');
            return of({ success: false as const, error: 'Team code route is required' });
          }

          return from(this.fetchTeamByRouteIdentifier(teamCode));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.teamProfile.loadFromExternalData(response.data);
            // syncCanonicalRoute handles mismatch between route teamCode and loaded teamCode
            // (e.g. after manage-team updates the code).
            this.syncCanonicalRoute(response.data.team);
            this.logger.info('Team profile loaded', {
              routeTeamCode: this.routeTeamCode(),
              loadedTeamCode: response.data.team?.teamCode,
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
              if (this.teamIntelEnabled) {
                void this.intel.loadTeamIntel(teamId);
              }
            }
          } else {
            this.teamProfile.setError(response.error ?? 'Failed to load team profile');
            this.logger.error('Team profile API error', {
              routeTeamCode: this.routeTeamCode(),
              error: response.error,
            });
          }
        },
        error: (err: unknown) => {
          const message = err instanceof Error ? err.message : 'Failed to load team profile';
          this.teamProfile.setError(message);
          this.logger.error('Team profile fetch failed', err, {
            routeTeamCode: this.routeTeamCode(),
          });
        },
      });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Re-fetches team data from the API and pushes it into TeamProfileService.
   * Called by both the native refresher and the shell's (refreshRequest) output.
   */
  protected async onRefreshRequest(): Promise<void> {
    const teamCode = this.routeTeamCode();

    if (!teamCode) {
      return;
    }

    try {
      const response = await this.fetchTeamByRouteIdentifier(teamCode);

      if (response.success && response.data) {
        this.teamProfile.loadFromExternalData(response.data);
        this.syncCanonicalRoute(response.data.team);
        this.logger.info('Team profile refreshed', {
          routeTeamCode: teamCode,
          loadedTeamCode: response.data.team?.teamCode,
        });

        const teamId = response.data.team?.id;
        if (teamId && this.teamIntelEnabled) {
          await this.intel.loadTeamIntel(teamId, true);
        }
      }
    } catch (err) {
      this.logger.error('Failed to refresh team profile', err, {
        routeTeamCode: teamCode,
      });
    }
  }

  private isLikelyDocumentIdentifier(value: string): boolean {
    const trimmed = value.trim();
    return this.firestoreIdPattern.test(trimmed) && /[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed);
  }

  private fetchTeamByRouteIdentifier(teamIdentifier: string) {
    return this.isLikelyDocumentIdentifier(teamIdentifier)
      ? this.teamApi.getTeamById(teamIdentifier)
      : this.teamApi.getTeamByTeamCode(teamIdentifier);
  }

  protected onBackClick(): void {
    this.navController.back();
  }

  private syncCanonicalRoute(team: {
    readonly slug?: string;
    readonly teamName?: string;
    readonly teamCode?: string;
    readonly unicode?: string;
    readonly id?: string;
  }): void {
    const resolvedTeamCode = team.teamCode?.trim();
    if (!resolvedTeamCode) return;

    const currentTeamCode = this.routeTeamCode().trim();
    const currentSlug = this.teamSlug().trim();

    const canonicalPath = buildCanonicalTeamPath({
      slug: team.slug || currentSlug,
      teamName: team.teamName,
      teamCode: resolvedTeamCode,
      unicode: team.unicode,
      id: team.id,
    });

    if (canonicalPath === '/team') {
      this.logger.warn('Skipping canonical route repair due to missing valid team code', {
        routeTeamCode: currentTeamCode,
        resolvedTeamCode,
        teamId: team.id,
      });
      return;
    }

    if (currentTeamCode === resolvedTeamCode && currentSlug === (team.slug || currentSlug)) {
      return;
    }

    // Canonical URL repair without navigation cycle.
    // Prevents a second route activation + skeleton flash when legacy links
    // arrive as /team/:slug/:teamId.
    this.location.replaceState(canonicalPath);
  }

  protected onMenuClick(): void {
    this.sidenavService.open();
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
      unicode: team.unicode,
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
      unicode: team.unicode,
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
    const teamId = await this.resolveManageTeamId();
    if (!teamId) {
      this.logger.warn('Manage Team blocked: unable to resolve canonical team document id', {
        routeTeamCode: this.routeTeamCode(),
        teamSlug: this.teamSlug(),
      });
      this.toast.error('Team is still loading. Try again in a second.');
      return;
    }

    const result = await this.manageTeamModal.open({
      teamId,
      title: 'Manage Team',
    });

    if (result?.saved) {
      // Refresh team data after management changes
      const slug = this.teamSlug();
      if (slug) {
        await this.teamApi.invalidateCache(slug);
      }

      const teamCode = this.routeTeamCode();
      const response = teamCode
        ? await this.fetchTeamByRouteIdentifier(teamCode)
        : slug
          ? await this.teamApi.getTeamBySlug(slug)
          : null;

      if (response?.success && response.data) {
        this.teamProfile.loadFromExternalData(response.data);
      }
    }
  }

  private async resolveManageTeamId(): Promise<string | null> {
    const currentTeam = this.teamProfile.team();
    const currentId = currentTeam?.id?.trim() ?? '';
    const routeTeamCode = this.routeTeamCode().trim();

    // If the team is already hydrated, use that canonical ID directly.
    if (currentId) {
      return currentId;
    }

    if (routeTeamCode) {
      const response = await this.fetchTeamByRouteIdentifier(routeTeamCode);
      const resolvedId = response.success ? response.data?.team?.id?.trim() : '';
      if (response.success && response.data) {
        this.teamProfile.loadFromExternalData(response.data);
      }
      if (resolvedId) {
        return resolvedId;
      }
    }

    const slug = this.teamSlug().trim();
    if (slug) {
      const bySlug = await this.teamApi.getTeamBySlug(slug);
      const resolvedBySlug = bySlug.success ? bySlug.data?.team?.id?.trim() : '';
      if (bySlug.success && bySlug.data) {
        this.teamProfile.loadFromExternalData(bySlug.data);
      }
      if (resolvedBySlug) {
        return resolvedBySlug;
      }
    }

    return currentId || null;
  }

  protected onRosterMemberClick(member: TeamProfileRosterMember): void {
    const canonicalUnicode = member.unicode || member.profileCode;
    if (canonicalUnicode) {
      const teamSport = this.teamProfile.team()?.sport;
      const athleteName = member.displayName || `${member.firstName} ${member.lastName}`.trim();
      void this.navController.navigateForward(
        buildCanonicalProfilePath({
          athleteName,
          sport: teamSport,
          unicode: canonicalUnicode,
        })
      );
    }
  }

  protected onPostClick(post: TeamProfilePost): void {
    if (!post.id) return;
    const team = this.teamProfile.team();
    const unicode = this.routeTeamCode() || this.teamSlug() || team?.teamCode || team?.slug || '_';
    void this.postDetailOverlay.open({
      post,
      userUnicode: unicode,
      author: {
        name: team?.teamName ?? 'Team',
        avatarUrl: team?.logoUrl,
      },
    });
  }

  protected async onAddUpdate(): Promise<void> {
    const hasReport = !!this.intel.teamReport();
    const message = hasReport
      ? 'I want to create a post for our team timeline. After creating the post, automatically review it and update any relevant sections of our Agent X Intel report with new stats, results, recruiting activity, or program updates from the post.'
      : 'I want to create a post for our team timeline.';

    await this.bottomSheet.openSheet({
      component: AgentXOperationChatComponent,
      componentProps: {
        contextId: 'team-timeline-post',
        contextTitle: 'Create a Post',
        contextIcon: 'create-outline',
        contextType: 'command',
        initialMessage: message,
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      cssClass: 'agent-x-operation-sheet',
    });
  }

  protected async onGenerateTeamIntel(): Promise<void> {
    if (!this.teamIntelEnabled) return;

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
