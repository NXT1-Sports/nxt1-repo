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
 * - Follow with auth guard
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
  imports: [IonHeader, IonContent, IonToolbar, TeamProfileShellWebComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-team-profile-shell-web
        [teamSlug]="teamSlug()"
        [isTeamAdmin]="isTeamAdmin()"
        [skipInternalLoad]="true"
        (backClick)="onBackClick()"
        (tabChange)="onTabChange($event)"
        (shareClick)="onShare()"
        (followClick)="onFollow()"
        (qrCodeClick)="onQrCode()"
        (manageTeamClick)="onManageTeam()"
        (rosterMemberClick)="onRosterMemberClick($event)"
        (postClick)="onPostClick($event)"
      />
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
    ion-content {
      --background: var(--nxt1-color-bg-primary, #0a0a0a);
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

  protected async onFollow(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      this.toast.info('Sign in to follow teams');
      void this.navController.navigateForward('/auth');
      return;
    }

    await this.teamProfile.toggleFollow();
    const isFollowing = this.teamProfile.followStats()?.isFollowing;
    this.toast.success(isFollowing ? 'Following!' : 'Unfollowed');
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
