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
 * └─────────────────────────────────────────────────────────────┘
 *
 * Responsibilities:
 * - Route integration with mobile tabs
 * - User state from auth service
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
  effect,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal, toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map, distinctUntilChanged, switchMap, tap, from, of, combineLatest, filter } from 'rxjs';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';

// Shared UI from @nxt1/ui (95% of the code)
import {
  ProfileShellComponent,
  RelatedAthletesComponent,
  EditProfileBottomSheetService,
  ManageTeamBottomSheetService,
  NxtSidenavService,
  ProfileService as UiProfileService,
  userToProfilePageData,
  type RelatedAthlete,
  type RankingSource,
} from '@nxt1/ui';
import { parseApiError, requiresAuth } from '@nxt1/core';
import type { User, UserSummary, ProfileTabId } from '@nxt1/core';
import type { ProfileEvent } from '@nxt1/core/profile';

// Mobile-specific services
import { MobileAuthService } from '../auth/services/mobile-auth.service';
import { ShareService } from '../../core/services/share.service';
import { ProfileApiService } from '../../core/services/profile-api.service';
import { CapacitorHttpAdapter } from '../../core/infrastructure';
import { environment } from '../../../environments/environment';

/**
 * Mobile Profile Feature Component
 *
 * Thin wrapper that:
 * 1. Extracts unicode from route params
 * 2. Provides current user from auth state
 * 3. Delegates all UI to ProfileShellComponent
 * 4. Handles edit profile via bottom sheet
 *
 * Note: isOwnProfile is determined by ProfileShellComponent internally
 * by comparing the loaded profile with the current user.
 */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, ProfileShellComponent, RelatedAthletesComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-profile-shell
        [currentUser]="currentUser()"
        [profileUnicode]="profileUnicode()"
        [isOwnProfile]="isOwnProfile()"
        [skipInternalLoad]="true"
        (avatarClick)="onAvatarClick()"
        (menuClick)="onMenuClick()"
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

      @if (relatedAthletes().length > 0) {
        <nxt1-related-athletes
          [athletes]="relatedAthletes()"
          [sport]="relatedSport()"
          [state]="relatedState()"
          (athleteClick)="onRelatedAthleteClick($event)"
          (seeAllClick)="onSeeAllRelated()"
        />
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
    ion-content {
      --background: var(--nxt1-color-bg-primary, #0a0a0a);
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
  private readonly manageTeamSheet = inject(ManageTeamBottomSheetService);
  private readonly navController = inject(NavController);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly uiProfileService = inject(UiProfileService);
  private readonly profileApiService = inject(ProfileApiService);
  private readonly shareService = inject(ShareService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly http = inject(CapacitorHttpAdapter);

  // ============================================
  // STATE
  // ============================================

  protected readonly relatedAthletes = signal<RelatedAthlete[]>([]);
  private readonly fetchedProfile = signal<User | null>(null);
  protected readonly relatedSport = computed<string>(() => {
    const profile = this.fetchedProfile();
    const activeSport = profile?.sports?.[profile.activeSportIndex ?? 0] ?? profile?.sports?.[0];
    return activeSport?.sport || 'Football';
  });

  /** State/region context for the Related Athletes section */
  protected readonly relatedState = computed<string>(() => {
    return this.fetchedProfile()?.location?.state || 'your area';
  });

  /** Whether current user is viewing their own profile */
  protected readonly isOwnProfile = signal(false);

  /** Resolved unicode from fetched profile — empty string while loading */
  protected readonly resolvedUnicode = signal('');

  /**
   * Raw route param — empty string means own profile (/profile),
   * numeric string means profile by unicode/ID, other string means username.
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
        profileImg: profile.profileImg ?? null,
        displayName: `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() || 'Athlete',
      };
    }
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.uiProfileService.startLoading());

    // CRITICAL: Clear old profile data immediately when route params change
    // This effect runs synchronously when routeParam changes, BEFORE the
    // combineLatest pipe executes, preventing old data flash.
    effect(() => {
      const param = this.routeParam();
      // Trigger on any param change (including undefined → value transitions)
      // startLoading() will clear all old data synchronously
      this.uiProfileService.startLoading();
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
            return from(this.profileApiService.getProfile(authUser.uid)).pipe(
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

          // Case 4: username — lookup by username
          return from(this.profileApiService.getProfileByUsername(param)).pipe(
            map((res) => ({
              ...res,
              _isOwnProfile: !!(res.success && res.data && res.data.id === authUser?.uid),
            }))
          );
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
            const profilePageData = userToProfilePageData(profile, isOwn);
            this.uiProfileService.loadFromExternalData(profilePageData, profile, isOwn);
            this.fetchRelatedAthletes(profile);
            const activeSport =
              profile.sports?.[profile.activeSportIndex ?? 0] ?? profile.sports?.[0];
            const sportId = activeSport?.sport?.toLowerCase();
            void this.fetchSubCollections(profile.id, sportId);
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
   * Fetch timeline, rankings, scout reports, videos, schedule, news in parallel.
   * Mirrors the web forkJoin pattern — all sub-collections loaded after the main profile.
   * @param userId - User ID to fetch data for
   * @param sportId - Optional sport filter (e.g. 'football', 'basketball') for schedule events
   */
  private async fetchSubCollections(userId: string, sportId?: string): Promise<void> {
    const [timeline, rankings, scoutReports, videos, schedule, news] = await Promise.all([
      this.profileApiService.getProfileTimeline(userId),
      this.profileApiService.getProfileRankings(userId),
      this.profileApiService.getProfileScoutReports(userId),
      this.profileApiService.getProfileVideos(userId),
      this.profileApiService.getProfileSchedule(userId, sportId),
      this.profileApiService.getProfileNews(userId),
    ]);

    if (timeline.success) this.uiProfileService.setTimelinePosts(timeline.data);
    if (rankings.success && rankings.data.length > 0) {
      this.uiProfileService.setRankings(rankings.data as unknown as RankingSource[]);
    }
    if (scoutReports.success) this.uiProfileService.setScoutReports(scoutReports.data);
    if (videos.success) this.uiProfileService.setVideoPosts(videos.data);
    if (news.success) this.uiProfileService.setNewsArticles(news.data);

    // Always call setScheduleEvents when API succeeds, even for empty arrays.
    // This ensures _scheduleEvents is non-null and overrides embedded mock data.
    // If we don't call it, _scheduleEvents stays null → events computed falls back to mock.
    if (schedule.success) {
      const SCHEDULE_TYPE_MAP: Record<string, ProfileEvent['type']> = {
        game: 'game',
        camp: 'camp',
        visit: 'visit',
        practice: 'practice',
        tournament: 'game',
        combine: 'combine',
        showcase: 'showcase',
      };
      const events: ProfileEvent[] = schedule.data.map((raw) => ({
        id: String(raw['id'] ?? ''),
        type: SCHEDULE_TYPE_MAP[String(raw['eventType'] ?? '')] ?? 'other',
        name: String(raw['title'] ?? raw['name'] ?? ''),
        location: String(raw['location'] ?? ''),
        startDate: raw['date'] ? String(raw['date']) : new Date().toISOString(),
        opponent: raw['opponent'] ? String(raw['opponent']) : undefined,
        result: raw['result'] ? String(raw['result']) : undefined,
      }));
      this.uiProfileService.setScheduleEvents(events);
    } else {
      console.warn('[Mobile Profile] Schedule API failed:', schedule);
    }
  }

  /**
   * Fetch related athletes dynamically based on current profile's sport + state.
   * Uses CapacitorHttpAdapter (same as all other mobile API calls).
   * Scoring: same sport (+2), same state (+1) → top 8.
   */
  private async fetchRelatedAthletes(profile: User): Promise<void> {
    const activeSport = profile.sports?.[profile.activeSportIndex ?? 0] ?? profile.sports?.[0];
    const sport = activeSport?.sport?.toLowerCase();
    const state = profile.location?.state;

    try {
      const response = await this.http.get<{ success: boolean; data: UserSummary[] }>(
        `${environment.apiUrl}/auth/profile/search?limit=50`
      );

      if (!response.success) return;

      const scored = response.data
        .filter((u) => u.id !== profile.id && !!u.firstName)
        .map((u) => {
          const uSport = u.primarySport?.toLowerCase();
          const uState = u.location?.state;
          const score = (sport && uSport === sport ? 2 : 0) + (state && uState === state ? 1 : 0);
          return { u, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

      const athletes: RelatedAthlete[] = scored.map(({ u }) => ({
        id: u.id,
        unicode: u.unicode ?? u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        profileImg: u.profileImg ?? null,
        sport: u.primarySport ?? '',
        position: u.primaryPosition ?? '',
        classYear: u.classOf ? String(u.classOf) : '',
        school: '',
        state: u.location?.state ?? '',
        isVerified: u.verificationStatus === 'verified',
        matchReason:
          sport && u.primarySport?.toLowerCase() === sport
            ? `Same sport · ${u.primarySport}`
            : state && u.location?.state === state
              ? `Same state · ${state}`
              : 'Similar profile',
      }));

      this.relatedAthletes.set(athletes);
    } catch {
      // Non-critical — silently ignore if fetch fails
    }
  }

  /**
   * Handle related athlete card click — navigate to their profile.
   */
  protected onRelatedAthleteClick(athlete: RelatedAthlete): void {
    void this.navController.navigateForward(`/profile/${athlete.unicode}`);
  }

  /**
   * Handle "See All" related athletes — navigate to explore with sport filter.
   */
  protected onSeeAllRelated(): void {
    void this.navController.navigateForward(`/explore?sport=${this.relatedSport()}`);
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
    const result = await this.editProfileSheet.open();

    if (result?.saved) {
      // Profile was saved - could trigger refresh here if needed
      // The ProfileService should handle data refresh internally
    }
  }

  /**
   * Opens the manage team bottom sheet (full-screen on mobile).
   * Called when user taps 'Edit Team' button.
   */
  protected async onEditTeam(): Promise<void> {
    const result = await this.manageTeamSheet.open();

    if (result?.saved) {
      // Team was saved - could trigger refresh here if needed
      // The ManageTeamService should handle data refresh internally
    }
  }

  /**
   * Handle follow button tap.
   */
  protected onFollow(): void {
    // TODO: implement follow/unfollow with auth guard
  }

  /**
   * Handle QR code tap — navigate to QR code page or open sheet.
   */
  protected onQrCode(): void {
    const unicode = this.resolvedUnicode();
    if (unicode) {
      void this.navController.navigateForward(`/profile/${unicode}/qr`);
    }
  }

  /**
   * Handle AI summary tap.
   */
  protected onAiSummary(): void {
    // TODO: open AI summary sheet
  }

  /**
   * Handle create post tap.
   */
  protected onCreatePost(): void {
    void this.navController.navigateForward('/post/create');
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
        imageUrl: user.profileImg,
      },
      {
        analyticsProps: {
          is_own_profile: this.uiProfileService.isOwnProfile(),
        },
      }
    );
  }
}
