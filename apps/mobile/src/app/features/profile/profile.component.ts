/**
 * @fileoverview Profile Feature - Mobile Wrapper
 * @module @nxt1/mobile/features/profile
 *
 * Thin mobile wrapper for profile functionality.
 * All UI logic lives in @nxt1/ui - this just handles mobile-specific concerns.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                 apps/mobile/profile (~5%)                   │
 * │     Mobile-specific: Routes, deep links, native features    │
 * ├─────────────────────────────────────────────────────────────┤
 * │              @nxt1/ui/profile (~95% shared)                 │
 * │        ProfileShellComponent + all UI components            │
 * ├─────────────────────────────────────────────────────────────┤
 * │         Role-Aware Profile (2026 Pattern)                   │
 * │  Coach/Director → TeamProfileShellWebComponent              │
 * │  Athlete/Parent → ProfileShellComponent                     │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Responsibilities:
 * - Route integration with mobile tabs
 * - User state from auth service
 * - Role-aware shell selection (athlete profile vs team profile)
 * - Native navigation (including edit profile bottom sheet)
 * - Deep link handling (future)
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  signal,
  DestroyRef,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal, toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map, distinctUntilChanged, switchMap, tap, from, of, combineLatest, filter } from 'rxjs';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';

// Shared UI from @nxt1/ui (95% of the code)
import {
  ProfileShellComponent,
  EditProfileBottomSheetService,
  ManageTeamModalService,
  NxtSidenavService,
  ProfileService as UiProfileService,
  userToProfilePageData,
  NxtRefresherComponent,
  ProfileGenerationStateService,
  TeamProfileShellWebComponent,
  TeamProfileService,
  QrCodeBottomSheetService,
  NxtToastService,
  NxtLoggingService,
  NxtBreadcrumbService,
  IntelService,
  AgentXOperationChatComponent,
  NxtBottomSheetService,
  SHEET_PRESETS,
  type ActionFooterButton,
  type RefreshEvent,
  type TeamSearchResult,
} from '@nxt1/ui';
import {
  buildCanonicalProfilePath,
  buildCanonicalTeamPath,
  buildTeamSlug,
  parseApiError,
  requiresAuth,
  isTeamRole,
  buildUTMShareUrl,
  UTM_MEDIUM,
  UTM_CAMPAIGN,
} from '@nxt1/core';
import { resolveCanonicalTeamRoute } from '@nxt1/core/helpers';
import { APP_EVENTS } from '@nxt1/core/analytics';
import type { User, ProfileTabId, ProfileTeamAffiliation } from '@nxt1/core';
import type { TeamProfileTabId, TeamProfileRosterMember, TeamProfilePost } from '@nxt1/core';

// Mobile-specific services
import { MobileAuthService } from '../../core/services/auth/mobile-auth.service';
import { AuthFlowService } from '../../core/services/auth';
import { ShareService } from '../../core/services/native/share.service';
import { ProfileApiService } from '../../core/services/api/profile-api.service';
import { EditProfileApiService } from '../../core/services/api/edit-profile-api.service';
import { MobileEmailConnectionService } from '../../core/services/api/email-connection.service';
import { TeamProfileApiService } from '../../core/services/api/team-profile-api.service';
import { AnalyticsService } from '../../core/services/infrastructure/analytics.service';
import { CapacitorHttpAdapter } from '../../core/infrastructure';
import { environment } from '../../../environments/environment';

/**
 * Mobile Profile Feature Component
 *
 * Role-aware wrapper that:
 * 1. Extracts unicode from route params
 * 2. Provides current user from auth state
 * 3. Detects coach/director → renders TeamProfileShellWebComponent
 * 4. Detects athlete/parent → renders ProfileShellComponent
 * 5. Handles edit profile via bottom sheet
 *
 * Professional pattern (Instagram Business / LinkedIn):
 * Same /profile URL, different shell based on user role.
 * No URL redirect, no tab bar flicker, seamless switch.
 */
@Component({
  selector: 'app-profile',
  standalone: true,
  // Scope ProfileService to this component instance so each navigation
  // (own profile / other profile) gets isolated state. Without this,
  // Ionic's stack navigation keeps both components alive simultaneously
  // and they share the singleton — causing stale data cross-contamination.
  providers: [UiProfileService],
  imports: [
    IonHeader,
    IonContent,
    IonToolbar,
    ProfileShellComponent,
    TeamProfileShellWebComponent,
    NxtRefresherComponent,
  ],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt-refresher (onRefresh)="handleRefresh($event)" />

      @if (showTeamProfile()) {
        <!-- Coach/Director own profile → Team Profile Shell -->
        <nxt1-team-profile-shell-web
          [teamSlug]="teamSlug()"
          [isTeamAdmin]="true"
          [skipInternalLoad]="true"
          (backClick)="onBackClick()"
          (tabChange)="onTeamTabChange($event)"
          (shareClick)="onTeamShare()"
          (copyLinkClick)="onTeamCopyLink()"
          (qrCodeClick)="onTeamQrCode()"
          (manageTeamClick)="onManageTeam()"
          (rosterMemberClick)="onRosterMemberClick($event)"
          (postClick)="onTeamPostClick($event)"
        />
      } @else {
        <!-- Athlete/Parent profile (or viewing someone else's profile) -->
        <nxt1-profile-shell
          [currentUser]="currentUser()"
          [profileUnicode]="profileUnicode()"
          [isOwnProfile]="isOwnProfile()"
          [showBack]="true"
          [skipInternalLoad]="true"
          (avatarClick)="onAvatarClick()"
          (menuClick)="onMenuClick()"
          (backClick)="onBackClick()"
          (tabChange)="onTabChange($event)"
          (editProfileClick)="onEditProfile()"
          (teamClick)="onTeamClick($event)"
          (shareClick)="onShare()"
          (copyLinkClick)="onCopyLink()"
          (qrCodeClick)="onQrCode()"
          (aiSummaryClick)="onAiSummary()"
          (refreshRequest)="onRefreshRequest()"
          (generationDismissed)="onGenerationDismissed($event)"
        />
      }
    </ion-content>
    @if (footerButtons().length > 0) {
      <div class="profile-action-footer-bar">
        <div class="profile-action-footer-inner">
          @for (btn of footerButtons(); track btn.id) {
            <button
              type="button"
              [class]="'paf-btn paf-btn--' + btn.variant"
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
    ion-content::part(scroll) {
      overflow: visible;
    }
    .profile-action-footer-bar {
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
    .profile-action-footer-inner {
      display: flex;
      gap: 8px;
      padding: 10px 16px;
    }
    .paf-btn {
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
    .paf-btn--secondary {
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .paf-btn--primary {
      background: var(--nxt1-color-primary, #d4ff00);
      color: #000;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent {
  // ============================================
  // DEPENDENCIES
  // ============================================

  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(MobileAuthService);
  private readonly editProfileSheet = inject(EditProfileBottomSheetService);
  private readonly manageTeamModal = inject(ManageTeamModalService);
  private readonly navController = inject(NavController);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly uiProfileService = inject(UiProfileService);
  private readonly profileApiService = inject(ProfileApiService);
  private readonly editProfileApiService = inject(EditProfileApiService);
  private readonly shareService = inject(ShareService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly http = inject(CapacitorHttpAdapter);
  private readonly emailConnection = inject(MobileEmailConnectionService);
  private readonly authFlow = inject(AuthFlowService);
  protected readonly generation = inject(ProfileGenerationStateService);
  protected readonly intel = inject(IntelService);
  private readonly bottomSheet = inject(NxtBottomSheetService);

  // Team profile dependencies (for coach/director own-profile view)
  private readonly teamProfile = inject(TeamProfileService);
  private readonly teamApi = inject(TeamProfileApiService);
  private readonly qrCode = inject(QrCodeBottomSheetService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ProfileComponent');
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  // ============================================
  // STATE
  // ============================================

  private readonly fetchedProfile = signal<User | null>(null);

  /**
   * Guard: tracks the last "userId:sportId" key that sub-collections were fetched for.
   * Prevents duplicate network cascade when Ionic stack-navigation revisits the page
   * with an already-cached main profile (the subscribe.next() fires again from cache).
   * Cleared by onRefreshRequest() to allow forced re-fetch on pull-to-refresh.
   */
  private _lastFetchedKey: string | null = null;
  /** Whether current user is viewing their own profile */
  protected readonly isOwnProfile = signal(false);

  /**
   * Whether to show the team profile shell instead of the athlete profile.
   * True when: viewing own profile AND user has a team role (coach/director).
   */
  protected readonly showTeamProfile = computed(() => {
    const profile = this.fetchedProfile();
    return this.isOwnProfile() && !!profile && isTeamRole(profile.role);
  });

  /**
   * Team slug extracted from the user's teamCode.
   * Used as input for TeamProfileShellWebComponent.
   */
  protected readonly teamSlug = computed(() => {
    const profile = this.fetchedProfile();
    // Prefer teamCode.slug, fall back to teamCode.unicode or managedTeamCodes[0]
    return (
      profile?.teamCode?.slug ??
      profile?.teamCode?.unicode ??
      profile?.coach?.managedTeamCodes?.[0] ??
      ''
    );
  });

  /** Resolved unicode from fetched profile — empty string while loading */
  protected readonly resolvedUnicode = signal('');

  /**
   * Raw route param — empty string means own profile (/profile),
   * numeric string means profile by unicode, UID-shaped string means profile by userId,
   * everything else is an invalid profile link.
   */
  protected readonly routeParam = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('unicode') ?? '')),
    { initialValue: '' }
  );

  /**
   * Forwarded to ProfileShellComponent as profileUnicode input.
   * Uses resolved unicode from fetched profile (not raw route param).
   * Falls back to auth user's unicode while loading own profile.
   */
  protected readonly profileUnicode = this.resolvedUnicode;

  /**
   * Buttons for the sticky action footer rendered at the routed page level
   * (outside ion-content so Ionic pins it correctly).
   */
  protected readonly footerButtons = computed<ActionFooterButton[]>(() => {
    if (this.showTeamProfile()) {
      if (!this.teamProfile.isTeamAdmin()) return [];
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
    }
    if (!this.isOwnProfile()) return [];
    const tab = this.uiProfileService.activeTab();
    if (tab === 'intel')
      return [
        {
          id: 'intel',
          label: this.intel.athleteReport() ? 'Update Intel' : 'Generate Intel',
          variant: 'primary',
          onClick: () => void this.onGenerateAthleteIntel(),
        },
      ];
    if (tab === 'timeline')
      return [
        {
          id: 'add-update',
          label: 'Add Update',
          variant: 'primary',
          onClick: () => this.onAddUpdate(),
        },
      ];
    return [];
  });

  /** Current authenticated user for header display */
  protected readonly currentUser = computed(() => {
    if (this.isOwnProfile()) {
      const user = this.authService.user();
      if (!user) return null;
      return {
        profileImg: user.profileImg ?? null,
        displayName: user.displayName ?? 'User',
      };
    } else {
      const profile = this.fetchedProfile();
      if (!profile) return null;
      return {
        profileImg: profile.profileImgs?.[0] ?? null,
        displayName: `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() || 'Athlete',
      };
    }
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      // NOTE: Do NOT call startLoading() on any profile service here.
      // When navigating back in Ionic, Component A (own profile) stays alive.
      // Calling teamProfile.startLoading() here fires when ANY profile component
      // (including other users' profiles) is destroyed, which resets the shared
      // TeamProfileService _isLoading=true while Component A is still visible.
    });

    this.uiProfileService.setApiService({
      updateActiveSportIndex: (userId: string, activeSportIndex: number) =>
        this.editProfileApiService.updateActiveSportIndex(userId, activeSportIndex),
    });

    /**
     * Bridge: fetch real API data → push into UIProfileService.
     * distinctUntilChanged prevents duplicate fetches when signals re-emit
     * with same unicode. switchMap cancels any previous in-flight request.
     */
    // Wait for auth to finish initializing before reacting to route changes.
    // Without this, the first emit happens before auth.user() is populated,
    // causing "Not authenticated" on /profile (own profile route).
    const authReady$ = toObservable(this.authService.isInitialized).pipe(
      filter((initialized) => initialized)
    );

    combineLatest([toObservable(this.routeParam).pipe(distinctUntilChanged()), authReady$])
      .pipe(
        map(([param]) => param),
        distinctUntilChanged(),
        tap(() => this.uiProfileService.startLoading()),
        switchMap((param) => {
          const authUser = this.authService.user();

          // Case 1: /profile — load own profile via auth UID
          if (!param) {
            if (!authUser?.uid) {
              return of({
                success: false as const,
                error: 'Not authenticated',
                _isOwnProfile: true,
              });
            }
            return from(this.profileApiService.getMe()).pipe(
              map((res) => ({ ...res, _isOwnProfile: true }))
            );
          }

          // Case 2: numeric unicode — lookup by unicode
          if (/^\d+$/.test(param)) {
            return from(this.profileApiService.getProfileByUnicode(param)).pipe(
              map((res) => ({
                ...res,
                _isOwnProfile: !!(res.success && res.data && res.data.id === authUser?.uid),
              }))
            );
          }

          // Case 3: Firebase UID (20-32 alphanum chars, mixed case) — lookup by userId
          if (/^[a-zA-Z0-9]{20,32}$/.test(param) && /[a-zA-Z]/.test(param) && /[0-9]/.test(param)) {
            return from(this.profileApiService.getProfile(param)).pipe(
              map((res) => ({
                ...res,
                _isOwnProfile: !!(res.success && res.data && res.data.id === authUser?.uid),
              }))
            );
          }

          // Case 4: invalid slug — do not hit the backend
          return of({
            success: false as const,
            error: 'Invalid profile link.',
            _isOwnProfile: false,
          });
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            const profile = response.data;
            this.fetchedProfile.set(profile);
            const isOwn = response._isOwnProfile;
            this.isOwnProfile.set(isOwn);
            this.resolvedUnicode.set(profile.unicode ?? profile.id ?? '');

            // Role-aware branching: coach/director own profile → load team data
            if (isOwn && isTeamRole(profile.role)) {
              const teamPath = this.buildTeamPathFromUser(profile);
              if (teamPath) {
                this.breadcrumb.trackStateChange('profile:team_profile_redirect', {
                  role: profile.role,
                  teamPath,
                });
                void this.navController.navigateRoot(teamPath);
                return;
              }

              this.breadcrumb.trackStateChange('profile:team_profile_loading', {
                role: profile.role,
              });
              void this.loadTeamProfile(profile);
            } else {
              this.breadcrumb.trackStateChange('profile:athlete_profile_loaded', { isOwn });
              // Standard athlete/parent profile flow
              const profilePageData = userToProfilePageData(profile, isOwn);
              this.uiProfileService.loadFromExternalData(profilePageData, profile, isOwn);
              const activeSport =
                profile.sports?.[profile.activeSportIndex ?? 0] ?? profile.sports?.[0];
              const sportId = activeSport?.sport?.toLowerCase();
              const fetchKey = `${profile.id}:${sportId ?? ''}`;
              if (this._lastFetchedKey !== fetchKey) {
                this._lastFetchedKey = fetchKey;
                this.fetchSubCollections(profile.id, sportId).catch((err) => {
                  this.logger.error('Failed to fetch sub-collections', err, { userId: profile.id });
                });
              }
            }
          } else {
            this.uiProfileService.setError(response.error ?? 'Failed to load profile');
          }
        },
        error: (err: unknown) => {
          const parsed = parseApiError(err);
          this.uiProfileService.setError(parsed.message);
          if (requiresAuth(err)) {
            void this.authService.signOut();
          }
        },
      });
  }

  // ============================================
  // ACTIONS
  // ============================================

  /**
   * Load team profile data for coach/director own-profile view.
   * Extracts team slug from user document → fetches via TeamProfileApiService
   * → pushes into TeamProfileService for the shell to render.
   */
  private async loadTeamProfile(profile: User): Promise<void> {
    const slug =
      profile.teamCode?.slug ?? profile.teamCode?.unicode ?? profile.coach?.managedTeamCodes?.[0];

    if (!slug) {
      this.logger.warn('Coach/director has no team slug', { userId: profile.id });
      this.teamProfile.setError('No team associated with this account');
      return;
    }

    // Only show the team skeleton when there is no data already cached.
    // If data exists, refresh silently (stale-while-revalidate) so navigating
    // back to own profile does not flash a loading skeleton.
    if (!this.teamProfile.teamData()) {
      this.teamProfile.startLoading();
    }

    try {
      const response = await this.teamApi.getTeamBySlug(slug);
      if (response.success && response.data) {
        this.teamProfile.loadFromExternalData(response.data);
        this.logger.info('Team profile loaded for own-profile view', {
          slug,
          teamName: response.data.team?.teamName,
        });

        this.analyticsService.trackEvent(APP_EVENTS.TEAM_PAGE_VIEWED, {
          team_id: response.data.team?.id,
          team_slug: slug,
          team_name: response.data.team?.teamName,
          sport: response.data.team?.sport,
          context: 'own_profile',
        });
      } else {
        this.teamProfile.setError(response.error ?? 'Failed to load team profile');
        this.logger.error('Team profile API error', { slug, error: response.error });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load team profile';
      this.teamProfile.setError(message);
      this.logger.error('Team profile fetch failed', err, { slug });
    }
  }

  /**
   * Fetch timeline, game-logs, and metrics in parallel.
   * Rankings, scout reports, videos, schedule, and news are no longer on the profile.
   * All methods are backed by MEDIUM_TTL in-memory cache in ProfileApiService.
   * @param userId - User ID to fetch data for
   * @param sportId - Sport filter for game-logs and metrics
   */
  private async fetchSubCollections(userId: string, sportId?: string): Promise<void> {
    const [gameLogs, metrics, timeline] = await Promise.all([
      sportId
        ? this.profileApiService.getProfileGameLogs(userId, sportId)
        : Promise.resolve({ success: false as const, data: [] }),
      sportId
        ? this.profileApiService.getProfileMetrics(userId, sportId)
        : Promise.resolve({ success: false as const, data: [] }),
      this.profileApiService.getProfileTimeline(userId),
    ]);

    if (gameLogs.success) {
      this.uiProfileService.setGameLogs(gameLogs.data);
    } else if (sportId) {
      this.logger.warn('Failed to load profile game logs', { userId, sportId });
    }
    if (metrics.success) {
      this.uiProfileService.setMetricsFromRaw(metrics.data);
    } else if (sportId) {
      this.logger.warn('Failed to load profile metrics', { userId, sportId });
    }
    if (timeline.success) {
      this.uiProfileService.setTimelinePosts(timeline.data);
    } else {
      this.logger.warn('Failed to load profile timeline', { userId });
    }

    // Load intel eagerly alongside timeline so the intel tab renders instantly
    // (data or empty state) with no skeleton flash on tab switch.
    void this.intel.loadAthleteIntel(userId);
  }

  /**
   * Handle tab changes — re-fetch timeline when switching to it so data stays fresh.
   */
  protected onTabChange(tab: ProfileTabId): void {
    if (tab === 'timeline') {
      const userId = this.fetchedProfile()?.id;
      if (userId) {
        void this.profileApiService.getProfileTimeline(userId).then((resp) => {
          if (resp.success) this.uiProfileService.setTimelinePosts(resp.data);
        });
      }
    }
  }

  // ============================================
  // TEAM PROFILE EVENT HANDLERS
  // ============================================

  protected onTeamTabChange(tab: TeamProfileTabId): void {
    this.analyticsService.trackEvent(APP_EVENTS.TAB_CHANGED, {
      tab,
      team_slug: this.teamSlug(),
      context: 'own_team_profile',
    });
  }

  protected async onTeamShare(): Promise<void> {
    const team = this.teamProfile.team();
    if (!team) return;

    const result = await this.shareService.shareTeam({
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
      this.logger.info('Team shared from own profile', { slug: team.slug });
    }
  }

  protected async onTeamCopyLink(): Promise<void> {
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

    const copied = await this.shareService.copy(teamUrl, true);
    if (copied) {
      this.logger.info('Team link copied from own profile', {
        slug: team.slug,
        teamCode: team.teamCode,
      });
    }
  }

  protected async onTeamQrCode(): Promise<void> {
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
        isOwnProfile: true,
        entityType: 'team',
      });
    } catch (err) {
      this.logger.error('Failed to open QR code', err);
      this.toast.error('Unable to open QR code');
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

  protected onTeamPostClick(post: TeamProfilePost): void {
    if (post.id) {
      void this.navController.navigateForward(`/post/${post.id}`);
    }
  }

  /**
   * Opens the sidenav (mobile pattern - avatar opens sidenav).
   */
  protected onAvatarClick(): void {
    this.sidenavService.open();
  }

  /**
   * Opens the sidenav from the top-left hamburger menu.
   */
  protected onMenuClick(): void {
    this.sidenavService.open();
  }

  /**
   * Navigates back to the previous page using Ionic's NavController.
   * Uses back() for proper navigation stack handling.
   */
  protected onBackClick(): void {
    this.navController.back();
  }

  /**
   * Opens the edit profile bottom sheet (full-screen on mobile).
   * Called when user taps 'Edit Profile' button.
   */
  protected async onEditProfile(): Promise<void> {
    const userId = this.fetchedProfile()?.id ?? this.authService.user()?.uid;
    if (!userId) {
      this.logger.warn('Cannot edit profile: No user ID available');
      return;
    }

    const sportIndex = this.uiProfileService.activeSportIndex();
    const result = await this.editProfileSheet.open(userId, sportIndex, {
      onConnectProvider: (provider) => {
        void this.emailConnection.connectProvider(provider, userId);
      },
      searchTeams: this.searchTeamsFn,
    });

    if (result?.saved) {
      const param = this.routeParam();
      if (!param && userId) {
        // Clear service cache so the re-fetch hits the backend
        this.profileApiService.invalidateCache(userId);

        // Reset UI state — forces full teardown of carousel/images so they
        // re-render from scratch with fresh data (prevents stale component state)
        this.uiProfileService.startLoading();

        // Use getMe() for own profile — same endpoint as the initial load
        const response = await this.profileApiService.getMe();
        if (response.success && response.data) {
          const profile = response.data;
          this.fetchedProfile.set(profile);
          const profilePageData = userToProfilePageData(profile, true);
          this.uiProfileService.loadFromExternalData(profilePageData, profile, true);

          // Refresh sub-collections (same as initial load)
          const activeSport =
            profile.sports?.[profile.activeSportIndex ?? 0] ?? profile.sports?.[0];
          const sportId = activeSport?.sport?.toLowerCase();
          this.fetchSubCollections(profile.id, sportId).catch((err) => {
            this.logger.error('Failed to refresh sub-collections after edit', err, {
              userId: profile.id,
            });
          });
        } else {
          this.uiProfileService.setError(response.error ?? 'Failed to reload profile');
        }
      }
    }
  }

  /**
   * Searches programs/teams via the backend API.
   * Passed to the edit-profile bottom sheet for inline program search.
   */
  private readonly searchTeamsFn = async (query: string): Promise<readonly TeamSearchResult[]> => {
    this.logger.debug('Program search requested', { query });
    try {
      const url = `${environment.apiUrl}/programs/search`;
      const response = await this.http.get<{
        success: boolean;
        data: Array<{
          id: string;
          name: string;
          type: string;
          location?: { state?: string; city?: string };
          logoUrl?: string;
          primaryColor?: string;
          secondaryColor?: string;
          mascot?: string;
          teamCount?: number;
          isClaimed?: boolean;
        }>;
      }>(url, { params: { q: query, limit: '20' } });

      if (!response.success || !response.data) return [];

      return response.data.map((org) => ({
        id: org.id,
        name: org.name,
        sport: '',
        teamType: org.type,
        location:
          org.location?.city && org.location?.state
            ? `${org.location.city}, ${org.location.state}`
            : (org.location?.state ?? ''),
        logoUrl: org.logoUrl ?? undefined,
        colors: [org.primaryColor, org.secondaryColor].filter(Boolean) as string[],
        memberCount: org.teamCount ?? 0,
        isSchool: org.type === 'high-school' || org.type === 'middle-school',
        organizationId: org.id,
      }));
    } catch (err) {
      this.logger.error('Program search failed', err, { query });
      return [];
    }
  };

  /**
   * Handle team card click — navigate to team profile page.
   */
  protected onTeamClick(team: ProfileTeamAffiliation): void {
    if (team.teamCode) {
      const teamPath = buildCanonicalTeamPath({
        slug: team.name,
        teamName: team.name,
        teamCode: team.teamCode,
      });
      this.logger.info('Navigating to team profile', {
        teamCode: team.teamCode,
        teamName: team.name,
      });
      void this.navController.navigateForward(teamPath);
    } else {
      this.logger.warn('Team has no teamCode, cannot navigate', { teamName: team.name });
    }
  }

  /**
   * Opens the manage team modal (bottom sheet on mobile, overlay on desktop).
   * Called when team admin taps 'Manage Team' on the team profile shell.
   */
  protected async onManageTeam(): Promise<void> {
    const result = await this.manageTeamModal.open({
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

  /**
   * Handle QR code tap — open QR code modal/sheet.
   */
  protected async onQrCode(): Promise<void> {
    const user = this.uiProfileService.user();
    if (!user) return;

    const profileId = this.profileUnicode() || user.profileCode || user.uid;
    if (!profileId) return;

    const profilePath = buildCanonicalProfilePath({
      athleteName: user.displayName || `${user.firstName} ${user.lastName}`.trim(),
      sport: user.primarySport?.name,
      unicode: profileId,
    });
    const qrUrl = buildUTMShareUrl(
      `${environment.webUrl}${profilePath}`,
      UTM_MEDIUM.QR,
      UTM_CAMPAIGN.PROFILE,
      user.primarySport?.name?.toLowerCase()
    );

    await this.qrCode.open({
      url: qrUrl,
      displayName: user.displayName || `${user.firstName} ${user.lastName}`.trim() || 'Athlete',
      profileImg: user.profileImg,
      sport: user.primarySport?.name,
    });
  }

  /**
   * Handle AI summary tap.
   */
  protected onAiSummary(): void {
    void this.navController.navigateForward('/agent-x', {
      queryParams: { action: 'ai-summary', profileId: this.fetchedProfile()?.id },
    });
  }

  /**
   * Handles native share for the profile using the centralized ShareService.
   */
  protected async onShare(): Promise<void> {
    const user = this.uiProfileService.user();
    if (!user) return;

    const profileId = this.profileUnicode() || user.profileCode || user.uid;
    if (!profileId) return;

    await this.shareService.shareProfile(
      {
        id: profileId,
        slug: user.profileCode || undefined,
        athleteName:
          user.displayName || `${user.firstName} ${user.lastName}`.trim() || 'NXT1 Athlete',
        position: user.primarySport?.position,
        classYear: user.classYear ? Number(user.classYear) : undefined,
        school: user.school?.name,
        sport: user.primarySport?.name,
        location: user.location || user.school?.location,
        imageUrl: user.profileImg ?? undefined,
      },
      {
        analyticsProps: {
          is_own_profile: this.uiProfileService.isOwnProfile(),
        },
      }
    );
  }

  /**
   * Handle copy link tap — copy profile URL to clipboard.
   */
  protected async onCopyLink(): Promise<void> {
    const user = this.uiProfileService.user();
    if (!user) return;

    const profileId = this.profileUnicode() || user.profileCode || user.uid;
    if (!profileId) return;

    const profilePath = buildCanonicalProfilePath({
      athleteName: user.displayName || `${user.firstName} ${user.lastName}`.trim(),
      sport: user.primarySport?.name,
      unicode: profileId,
    });
    const profileUrl = buildUTMShareUrl(
      `${environment.webUrl}${profilePath}`,
      UTM_MEDIUM.COPY_LINK,
      UTM_CAMPAIGN.PROFILE,
      user.primarySport?.name?.toLowerCase()
    );

    await this.shareService.copy(profileUrl, true);
  }

  /**
   * Handle native pull-to-refresh on the outer ion-content.
   * Delegates to onRefreshRequest for the actual data fetching.
   */
  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    try {
      await this.onRefreshRequest();
    } finally {
      event.complete();
    }
  }

  /**
   * Handle pull-to-refresh from the profile shell.
   * Re-fetches profile + sub-collections from the real API and
   * pushes the fresh data into the shared UIProfileService.
   */
  protected async onRefreshRequest(): Promise<void> {
    const profile = this.fetchedProfile();
    const authUser = this.authService.user();
    const param = this.routeParam();

    try {
      let response: { success: boolean; data?: User; error?: string };

      if (!param && authUser?.uid) {
        response = await this.profileApiService.getMe();
      } else if (profile?.id) {
        response = await this.profileApiService.getProfile(profile.id);
      } else {
        return;
      }

      if (response.success && response.data) {
        const freshProfile = response.data;
        this.fetchedProfile.set(freshProfile);
        const isOwn = this.isOwnProfile();
        this.resolvedUnicode.set(freshProfile.unicode ?? freshProfile.id ?? '');

        // Role-aware refresh: coach/director → re-fetch team data
        if (isOwn && isTeamRole(freshProfile.role)) {
          const teamPath = this.buildTeamPathFromUser(freshProfile);
          if (teamPath) {
            void this.navController.navigateRoot(teamPath);
            return;
          }

          void this.loadTeamProfile(freshProfile);
        } else {
          const profilePageData = userToProfilePageData(freshProfile, isOwn);
          this.uiProfileService.loadFromExternalData(profilePageData, freshProfile, isOwn);
          const activeSport =
            freshProfile.sports?.[freshProfile.activeSportIndex ?? 0] ?? freshProfile.sports?.[0];
          const sportId = activeSport?.sport?.toLowerCase();
          // Clear guard so pull-to-refresh always fetches fresh data
          this._lastFetchedKey = null;
          this.fetchSubCollections(freshProfile.id, sportId).catch((err) => {
            this.logger.error('Failed to fetch sub-collections on refresh', err, {
              userId: freshProfile.id,
            });
          });
        }
      }
    } catch {
      // Non-critical — profile stays with current data
    }
  }

  private buildTeamPathFromUser(profile: User): string | null {
    return (
      resolveCanonicalTeamRoute({
        slug: profile.teamCode?.slug?.trim() || this.teamSlug(),
        teamName: profile.teamCode?.teamName?.trim(),
        teamCode: profile.teamCode?.teamCode?.trim(),
        code: profile.teamCode?.code?.trim(),
        teamId: profile.teamCode?.teamId?.trim(),
        id: typeof profile.teamCode?.id === 'string' ? profile.teamCode.id.trim() : undefined,
        unicode: profile.teamCode?.unicode?.trim(),
        managedTeamCodes: profile.coach?.managedTeamCodes,
      })?.path ?? null
    );
  }
  /**
   * Handle profile generation overlay dismiss.
   * Refreshes auth state so the profile page re-fetches fresh data
   * written by Agent X during the scrape/build process.
   */
  protected async onGenerationDismissed(reason: 'completed' | 'skipped'): Promise<void> {
    if (reason === 'completed') {
      try {
        await this.authFlow.refreshUserProfile();
      } catch {
        // Non-critical — profile data will be stale until next refresh
      }
      await this.onRefreshRequest();
    }
  }

  // ============================================
  // FOOTER ACTION HANDLERS
  // ============================================

  private onAddUpdate(): void {
    void this.openCreatePostSheet();
  }

  private async openCreatePostSheet(): Promise<void> {
    await this.bottomSheet.openSheet({
      component: AgentXOperationChatComponent,
      componentProps: {
        contextId: 'profile-timeline-post',
        contextTitle: 'Create a Post',
        contextIcon: 'create-outline',
        contextType: 'command',
        initialMessage: 'I want to create a post for my timeline.',
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      cssClass: 'agent-x-operation-sheet',
    });
  }

  private async onGenerateAthleteIntel(): Promise<void> {
    const hasReport = !!this.intel.athleteReport();
    const userId = this.uiProfileService.user()?.uid ?? '';
    await this.bottomSheet.openSheet({
      component: AgentXOperationChatComponent,
      componentProps: {
        contextId: 'profile-intel-generate',
        contextTitle: hasReport ? 'Update Intel' : 'Generate Intel',
        contextIcon: 'flash-outline',
        contextType: 'command',
        initialMessage: hasReport
          ? `I want to update my Intel report. What new information or highlights should I add to make it stronger?`
          : `I want to build my Agent X Intel dossier. What information do you need from me to create the best possible report?`,
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      cssClass: 'agent-x-operation-sheet',
    });
    await this.intel.loadAthleteIntel(userId, true);
  }

  private async onGenerateTeamIntel(): Promise<void> {
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
          : `I want to build an Intel dossier for my team. What information do you need from me to create the best possible report?`,
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
