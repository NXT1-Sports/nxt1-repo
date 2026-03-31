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
import { map, distinctUntilChanged, switchMap, tap, from, combineLatest, filter } from 'rxjs';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import {
  TeamProfileShellWebComponent,
  TeamProfileService,
  ManageTeamBottomSheetService,
  QrCodeService,
  NxtLoggingService,
  NxtToastService,
  NxtPageHeaderComponent,
  NxtIconComponent,
  NxtBottomSheetService,
  NxtSidenavService,
  SHEET_PRESETS,
  type BottomSheetAction,
} from '@nxt1/ui';
import { APP_EVENTS } from '@nxt1/core/analytics';
import type { TeamProfileTabId, TeamProfileRosterMember, TeamProfilePost } from '@nxt1/core';

import { MobileAuthService } from '../auth/services/mobile-auth.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { ShareService } from '../../core/services/share.service';
import { TeamProfileApiService } from '../../core/services/team-profile-api.service';

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [
    IonHeader,
    IonContent,
    IonToolbar,
    NxtPageHeaderComponent,
    NxtIconComponent,
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
      <nxt1-page-header
        [showBack]="!isTeamAdmin()"
        (backClick)="onBackClick()"
        (menuClick)="onMenuClick()"
      >
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
            <path
              d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
            />
            <polygon
              points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
            />
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
        <nxt1-team-profile-shell-web
          [teamSlug]="teamSlug()"
          [isTeamAdmin]="isTeamAdmin()"
          [skipInternalLoad]="true"
          (backClick)="onBackClick()"
          (tabChange)="onTabChange($event)"
          (shareClick)="onShare()"
          (qrCodeClick)="onQrCode()"
          (manageTeamClick)="onManageTeam()"
          (rosterMemberClick)="onRosterMemberClick($event)"
          (postClick)="onPostClick($event)"
        />
      </ion-content>
    </ion-content>
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamPage {
  // ============================================
  // DEPENDENCIES
  // ============================================

  private readonly route = inject(ActivatedRoute);
  private readonly navController = inject(NavController);
  private readonly authService = inject(MobileAuthService);
  private readonly teamProfile = inject(TeamProfileService);
  private readonly teamApi = inject(TeamProfileApiService);
  private readonly manageTeamSheet = inject(ManageTeamBottomSheetService);
  private readonly qrCode = inject(QrCodeService);
  private readonly analytics = inject(AnalyticsService);
  private readonly share = inject(ShareService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('TeamPage');
  private readonly destroyRef = inject(DestroyRef);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly sidenavService = inject(NxtSidenavService);

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

    combineLatest([toObservable(this.teamSlug).pipe(distinctUntilChanged()), authReady$])
      .pipe(
        map(([slug]) => slug),
        distinctUntilChanged(),
        tap(() => this.teamProfile.startLoading()),
        switchMap((slug) => {
          if (!slug) {
            this.teamProfile.setError('No team slug provided');
            return [];
          }
          return from(this.teamApi.getTeamBySlug(slug));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.teamProfile.loadFromExternalData(response.data);
            this.logger.info('Team profile loaded', {
              slug: this.teamSlug(),
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
        this.teamApi.invalidateCache(slug);
        const response = await this.teamApi.getTeamBySlug(slug);
        if (response.success && response.data) {
          this.teamProfile.loadFromExternalData(response.data);
        }
      }
    }
  }

  protected onRosterMemberClick(member: TeamProfileRosterMember): void {
    if (member.profileCode) {
      void this.navController.navigateForward(`/profile/${member.profileCode}`);
    }
  }

  protected onPostClick(post: TeamProfilePost): void {
    if (post.id) {
      void this.navController.navigateForward(`/post/${post.id}`);
    }
  }
}
