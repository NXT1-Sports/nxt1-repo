/**
 * @fileoverview Mobile Shell Component - Native App Shell
 * @module @nxt1/mobile/core/layout
 * @version 3.0.0
 *
 * Professional app shell providing persistent bottom navigation + sidenav.
 * Following Instagram, TikTok, Twitter patterns for native mobile UX.
 *
 * Architecture:
 * - Bottom tab bar persists across all screens (no re-render)
 * - Twitter/X-style sidenav with swipe-to-open gesture
 * - Child routes render inside <router-outlet>
 * - Pages own their own headers via <nxt1-page-header>
 * - Seamless transitions between tabs
 * - Safe area handling for notched devices
 *
 * Gesture Handling (delegated to NxtSidenavGestureService):
 * - Native touch events for 60fps responsiveness
 * - Lazy drag commitment pattern (tap vs drag detection)
 * - Velocity-based flick detection
 * - Shared service from @nxt1/ui for reusability
 *
 * Shell Responsibilities:
 * - Persistent bottom navigation (footer)
 * - Sidenav/drawer (Twitter/X style)
 * - Tab state synchronization with router
 * - Haptic feedback on tab selection
 * - Safe area insets
 *
 * Page Responsibilities:
 * - Header (via NxtPageHeaderComponent)
 * - Content and scrolling
 * - Page-specific actions
 * - Triggering sidenav via header avatar click
 *
 * @example
 * ```typescript
 * // In app.routes.ts
 * {
 *   path: 'tabs',
 *   loadComponent: () => import('./core/layout/shell').then(m => m.MobileShellComponent),
 *   children: [
 *     { path: 'home', loadComponent: () => import('./features/home/home.component') },
 *     { path: 'discover', loadComponent: () => import('./features/discover/discover.component') },
 *   ]
 * }
 *
 * // In any page component - open sidenav on avatar click
 * onAvatarClick(): void {
 *   this.sidenavService.open();
 * }
 * ```
 */

import {
  Component,
  inject,
  signal,
  computed,
  effect,
  viewChild,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  DestroyRef,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { IonRouterOutlet, NavController } from '@ionic/angular/standalone';

import {
  NxtPlatformService,
  NxtSidenavComponent,
  NxtSidenavService,
  HapticsService,
  NxtLoggingService,
  NxtScrollService,
  InviteBottomSheetService,
  ActivityService,
  type FooterTabItem,
  type FooterTabSelectEvent,
  type FooterScrollToTopEvent,
  type FooterConfig,
  type SidenavItemSelectEvent,
  type SidenavConfig,
  type SidenavSection,
  type SidenavUserData,
  type SidenavSportProfile,
  type SocialLink,
  type SidenavToggleEvent,
  DEFAULT_SIDENAV_ITEMS,
  DEFAULT_SOCIAL_LINKS,
  createFooterConfig,
  createSidenavConfig,
  findTabByRoute,
  updateTabBadge,
  isMainPageRoute,
  buildDynamicFooterTabs,
  SIDENAV_WIDTHS,
  SIDENAV_ANIMATION,
} from '@nxt1/ui';
import {
  AUTH_ROUTES,
  buildUserDisplayContext,
  type UserDisplayInput,
  type UserDisplayFallback,
} from '@nxt1/core';
import type { InviteTeam } from '@nxt1/core';
import { AuthFlowService } from '../services/auth/auth-flow.service';
import { ProfileService } from '../services/state/profile.service';
import { EditProfileApiService } from '../services/api/edit-profile-api.service';

/**
 * MobileShellComponent
 *
 * Root layout shell for all authenticated mobile screens.
 * Provides persistent bottom navigation + Twitter/X-style sidenav:
 *
 * - Footer stays mounted (no flicker on navigation)
 * - Sidenav opens via header avatar tap or swipe-right gesture
 * - Active tab synced with current route
 * - Smooth transitions via router animations
 * - Haptic feedback on tab selection
 * - Safe area handling for notched devices
 *
 * Individual pages are responsible for their own headers using NxtPageHeaderComponent.
 * Pages can open the sidenav by injecting NxtSidenavService and calling open().
 */
@Component({
  selector: 'app-mobile-shell',
  standalone: true,
  imports: [CommonModule, IonRouterOutlet, NxtSidenavComponent],
  template: `
    <!-- Sidenav using Ionic ion-menu - attaches to main-content -->
    <nxt1-sidenav
      contentId="main-content"
      [user]="sidenavUser() ?? undefined"
      [sections]="sidenavSections()"
      [socialLinks]="socialLinks"
      [config]="sidenavConfig()"
      (toggle)="onSidenavToggle($event)"
      (itemSelect)="onSidenavItemSelect($event)"
      (socialClick)="onSocialLinkClick($event)"
      (addSportClick)="onAddSportClick()"
      (sportProfileSelect)="onSportProfileSelect($event)"
    />

    <!-- Main Content Container - ID matches contentId for ion-menu -->
    <div id="main-content" class="mobile-shell">
      <!-- Page Content Area - Uses IonRouterOutlet for proper Ionic page lifecycle -->
      <div class="shell-content" #shellContent>
        <!-- 
          ⭐ PROFESSIONAL UX PATTERN (2026) ⭐
          - On main pages: swipeGesture=false (sidenav handles swipe)
          - On sub-pages: swipeGesture=true (native iOS back gesture)
          This matches Instagram, Twitter, TikTok navigation behavior.
        -->
        <ion-router-outlet [swipeGesture]="!isOnMainPage()"></ion-router-outlet>
      </div>

      <!-- Persistent Bottom Navigation removed -->
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      .mobile-shell {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        position: relative;
        background: var(--nxt1-color-background-primary, var(--ion-background-color, #0a0a0a));
        /* Ion-menu handles push animation automatically when type="push" */
      }

      .shell-content {
        flex: 1;
        overflow: hidden;
        position: relative;

        /* No footer — remove bottom padding */
        padding-bottom: 0;
      }

      /* Ensure ion-router-outlet and its pages fill available space */
      .shell-content ion-router-outlet {
        display: block;
        height: 100%;
        width: 100%;
      }

      /* ion-router-outlet uses .ion-page class for child pages */
      .shell-content ion-router-outlet .ion-page {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
      }

      /* Keyboard open: ensure no bottom padding */
      :host-context(.keyboard-open) .shell-content {
        padding-bottom: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobileShellComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly navController = inject(NavController);
  private readonly platform = inject(NxtPlatformService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef);
  private readonly haptics = inject(HapticsService);
  private readonly authFlow = inject(AuthFlowService);
  private readonly activityService = inject(ActivityService);
  private readonly scrollService = inject(NxtScrollService);
  private readonly inviteSheet = inject(InviteBottomSheetService);
  private readonly logger = inject(NxtLoggingService).child('MobileShell');

  /**
   * ⭐ ProfileService - Single source of truth for user data ⭐
   * Uses User type from @nxt1/core/models (professional 2026 pattern)
   */
  private readonly profileService = inject(ProfileService);
  private readonly editProfileApi = inject(EditProfileApiService);
  /** Public sidenav service for programmatic control */
  readonly sidenavService = inject(NxtSidenavService);

  // ============================================
  // ROUTE TRACKING (for sidenav gesture control)
  // ============================================

  /** Reference to the main IonRouterOutlet — used to check canGoBack() after navigation. */
  private readonly outlet = viewChild(IonRouterOutlet);

  /**
   * Current route - used to determine sidenav swipe gesture behavior.
   * Updated on navigation events.
   */
  private readonly _currentRoute = signal<string>('');

  /**
   * Whether the Ionic outlet has navigation history that can be popped.
   * Updated after every NavigationEnd via a microtask so Ionic's view stack
   * is settled before we read canGoBack().
   */
  private readonly _canGoBack = signal(false);

  /**
   * Whether current page is a "main page" where sidenav swipe should be enabled.
   *
   * A page is a main page ONLY when:
   *   1. Its route is in MAIN_PAGE_ROUTES (or a /team/* route for coaches), AND
   *   2. There is NO navigation history to go back to.
   *
   * When there IS history (user navigated forward to this page), back-swipe must
   * take priority — even if the URL matches a normally-main route like /activity.
   *
   * Professional pattern: Instagram, Twitter, TikTok all use this approach.
   */
  readonly isOnMainPage = computed(
    () => isMainPageRoute(this._currentRoute()) && !this._canGoBack()
  );

  // ============================================
  // FOOTER CONFIGURATION
  // ============================================

  /**
   * Tab configuration with reactive badge count for notifications.
   * Uses buildDynamicFooterTabs() to render role-aware tabs:
   * - Athletes: "Profile" tab with user icon
   * - Coaches/Directors: "Team" tab with shield icon
   *
   * Derives role from both ProfileService and AuthFlowService for consistency
   * during the window between auth resolution and full profile load.
   */
  readonly tabs = computed<FooterTabItem[]>(() => {
    const profile = this.profileService.userAsDisplayInput();
    const authUser = this.authFlow.user() as UserDisplayInput | null;
    const firebaseUser = this.authFlow.firebaseUser();
    const fallback: UserDisplayFallback | null = firebaseUser
      ? {
          displayName: firebaseUser.displayName,
          email: firebaseUser.email,
        }
      : null;
    const ctx = buildUserDisplayContext(profile ?? authUser, fallback);
    const baseTabs = buildDynamicFooterTabs(ctx);
    const activityUnreadCount = this.activityService.totalUnread();
    return updateTabBadge(
      baseTabs,
      'activity',
      activityUnreadCount > 0 ? activityUnreadCount : undefined
    );
  });

  /** Current user's canonical identity route (profile for athletes, team for team roles). */
  readonly ownIdentityRoute = computed(() => {
    return this.tabs().find((tab) => tab.id === 'profile')?.route ?? '/profile';
  });

  /** Currently active tab ID, synced with router (null when on pages not in footer like /settings) */
  private readonly _activeTabId = signal<string | null>('explore');
  readonly activeTabId = this._activeTabId.asReadonly();

  /**
   * Get the visual position of a tab (for animation direction)
   * Position follows tab array order from the active footer variant.
   */
  private getVisualTabPosition(tabId: string): number {
    return this.tabs().findIndex((tab) => tab.id === tabId);
  }

  /**
   * Get fallback tab ID when active tab is null.
   * Uses the first regular (non-action) tab to keep animation direction stable.
   */
  private getFallbackTabId(): string {
    const firstRegularTab = this.tabs().find((tab) => !tab.isActionButton);
    return firstRegularTab?.id ?? 'explore';
  }

  /**
   * Determine animation direction based on visual tab positions
   * Returns 'forward' when moving right, 'back' when moving left
   */
  private getAnimationDirection(fromTabId: string, toTabId: string): 'forward' | 'back' {
    const fromPosition = this.getVisualTabPosition(fromTabId);
    const toPosition = this.getVisualTabPosition(toTabId);

    // If we can't determine positions, default to forward
    if (fromPosition === -1 || toPosition === -1) return 'forward';

    // Moving to a higher position = forward (slide left)
    // Moving to a lower position = back (slide right)
    return toPosition > fromPosition ? 'forward' : 'back';
  }

  /** Footer configuration based on platform */
  readonly footerConfig = computed<FooterConfig>(() =>
    createFooterConfig({
      enableHaptics: true,
    })
  );

  // ============================================
  // SIDENAV CONFIGURATION
  // ============================================

  /**
   * User data for sidenav header - hybrid approach with intelligent avatar fallback.
   *
   * ⭐ Avatar Priority Logic ⭐
   * 1. profileImg from database (if user uploaded one via profileImgs[0])
   * 2. Fallback to initials (handled by nxt1-avatar component)
   * NOTE: Google/OAuth photoURL is intentionally NEVER used.
   *
   * ⭐ Uses ProfileService (full User data) when available ⭐
   * Falls back to AuthUser (persisted) for immediate display on app resume.
   * This ensures sidenav always has data even before ProfileService loads.
   */
  readonly sidenavUser = computed<SidenavUserData | null>(() => {
    const rawProfile = this.profileService.user();
    const profile = this.profileService.userAsDisplayInput();
    const rawAuthUser = this.authFlow.user();
    const authUser = rawAuthUser as UserDisplayInput | null;
    const firebaseUser = this.authFlow.firebaseUser();
    const fallback: UserDisplayFallback | null = firebaseUser
      ? {
          displayName: firebaseUser.displayName,
          email: firebaseUser.email,
        }
      : null;

    const ctx = buildUserDisplayContext(profile ?? authUser, fallback);
    if (!ctx) return null;

    return {
      name: ctx.name,
      subtitle: ctx.sportLabel ?? (profile ? (ctx.isTeamRole ? 'Coach' : 'Athlete') : ctx.email),
      profileImg: ctx.profileImg,
      initials: ctx.initials,
      verified: profile ? ctx.verified : (rawAuthUser?.emailVerified ?? ctx.verified),
      profileRoute: ctx.profileRoute,
      isTeamRole: ctx.isTeamRole,
      switcherTitle: ctx.switcherTitle,
      actionLabel: ctx.actionLabel,
      userId: rawProfile?.id ?? rawAuthUser?.uid,
      sportProfiles: ctx.sportProfiles as SidenavSportProfile[],
      activeSportProfileId: ctx.sportProfiles.find((sportProfile) => sportProfile.isActive)?.id,
    };
  });

  /**
   * Sidenav sections (using defaults from @nxt1/core).
   * Usage is always visible — the backend determines the correct billing
   * entity (individual vs organization) and the Usage page renders accordingly.
   */
  readonly sidenavSections = computed<SidenavSection[]>(() => DEFAULT_SIDENAV_ITEMS);

  /** Social links for sidenav footer */
  readonly socialLinks: SocialLink[] = DEFAULT_SOCIAL_LINKS;

  /**
   * Sidenav configuration - reactive to current route.
   *
   * ⭐ PROFESSIONAL UX PATTERN (2026) ⭐
   * - On main pages (home, search, activity, agent): Enable sidenav swipe gesture
   * - On sub-pages (profile, settings, help, etc.): Disable sidenav swipe,
   *   allowing Ionic's native iOS back swipe to work
   *
   * This matches Instagram, Twitter, TikTok navigation patterns.
   */
  readonly sidenavConfig = computed<SidenavConfig>(() => {
    const isIos = this.platform.os() === 'ios';
    const enableSwipe = this.isOnMainPage();

    return createSidenavConfig({
      mode: 'push',
      position: 'left',
      width: SIDENAV_WIDTHS.default,
      backdropDismiss: true,
      enableHaptics: true,
      animationDuration: isIos ? SIDENAV_ANIMATION.toggle + 70 : SIDENAV_ANIMATION.toggle + 20,
      showUserHeader: true,
      showSocialLinks: true,
      variant: 'default',
      // Only enable swipe-to-open on main pages
      // Sub-pages use native back swipe instead
      swipeGesture: enableSwipe,
    });
  });

  /** Badge polling interval handle */
  private badgePollTimer: ReturnType<typeof setInterval> | null = null;

  /** Track last badge fetch time for debouncing */
  private lastBadgeFetchTime = 0;

  /**
   * One-shot retry timer for newly-signed-up users.
   * Cloud Functions that create welcome/signup notifications run async —
   * the initial `refreshBadges()` can fire before those writes complete.
   * A 5-second retry catches them without waiting for the 60-second poll.
   */
  private earlyRetryTimer: ReturnType<typeof setTimeout> | null = null;

  /** Bound handler for cleanup */
  private readonly onVisibilityChange = (): void => {
    const isAuthenticated = this.authFlow.isAuthenticated();
    const isInitialized = this.authFlow.isInitialized();
    const user = this.authFlow.user();

    if (!isAuthenticated || !isInitialized || !user) return;

    if (document.visibilityState === 'visible') {
      // App/tab foregrounded — resume polling (will fetch on next interval)
      this.logger.debug('Tab visible, resuming badge polling');
      this.startBadgePolling();
    } else {
      // App/tab backgrounded — pause polling to save resources
      this.logger.debug('Tab hidden, pausing badge polling');
      this.stopBadgePolling();
    }
  };

  constructor() {
    // Fetch badge counts when user authenticates and poll to keep them fresh.
    // This ensures the red dot on the bell icon is accurate from first render.
    effect(() => {
      const isAuthenticated = this.authFlow.isAuthenticated();
      const isInitialized = this.authFlow.isInitialized();
      const user = this.authFlow.user();

      // ⭐ Wait for auth to be FULLY initialized before calling badge API
      // isInitialized becomes true AFTER Firebase token provider is ready
      if (isAuthenticated && isInitialized && user) {
        // Only fetch badges when we have actual user data AND token is ready
        // Uses debounced fetch with token validation to prevent race conditions
        void this.fetchBadgesIfNeeded();

        // Schedule a 5-second retry to catch async backend workflows
        // (e.g., Cloud Functions creating welcome notifications after signup).
        this.scheduleEarlyRetry();

        if (document.visibilityState === 'visible') {
          this.startBadgePolling();
        }
      } else {
        this.stopBadgePolling();
        this.cancelEarlyRetry();
      }
    });

    // Pause/resume polling on app lifecycle changes
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    // Note: foreground push badge refresh is handled by PushHandlerService,
    // which owns the pushNotificationReceived listener and calls refreshBadges().
  }

  ngOnDestroy(): void {
    this.stopBadgePolling();
    this.cancelEarlyRetry();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private async fetchBadgesIfNeeded(): Promise<void> {
    const now = Date.now();
    if (now - this.lastBadgeFetchTime < 2000) {
      this.logger.debug('Skipping badge fetch (too soon after previous fetch)');
      return;
    }

    try {
      const token = await this.authFlow.getIdToken();
      if (!token) {
        this.logger.debug('No auth token available yet, skipping badge fetch');
        return;
      }
    } catch (err) {
      this.logger.debug('Failed to get auth token, skipping badge fetch', { error: err });
      return;
    }

    this.lastBadgeFetchTime = now;
    this.activityService.refreshBadges().catch((err) => {
      this.logger.debug('Badge fetch failed (will retry on next poll)', err);
    });
  }

  private startBadgePolling(): void {
    this.stopBadgePolling();
    this.badgePollTimer = setInterval(() => {
      this.activityService.refreshBadges().catch(() => {
        // Silent fail — will retry next interval
      });
    }, 60_000);
  }

  private stopBadgePolling(): void {
    if (this.badgePollTimer) {
      clearInterval(this.badgePollTimer);
      this.badgePollTimer = null;
    }
  }

  /**
   * Schedule a one-shot badge refresh 5 seconds after first auth.
   * Handles the race where Cloud Functions (e.g. welcome notifications) finish
   * after the shell's initial `refreshBadges()` call.
   */
  private scheduleEarlyRetry(): void {
    this.cancelEarlyRetry();
    this.earlyRetryTimer = setTimeout(() => {
      this.activityService.refreshBadges().catch(() => {
        /* noop */
      });
      this.earlyRetryTimer = null;
    }, 5_000);
  }

  private cancelEarlyRetry(): void {
    if (this.earlyRetryTimer) {
      clearTimeout(this.earlyRetryTimer);
      this.earlyRetryTimer = null;
    }
  }

  ngOnInit(): void {
    // Initialize current route tracking
    this._currentRoute.set(this.router.url);

    // Sync active tab with current route on init
    this.syncActiveTabFromRoute(this.router.url);

    // Listen for route changes to update active tab AND sidenav gesture state
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        // Update current route for sidenav swipe gesture control
        this._currentRoute.set(event.urlAfterRedirects);

        // Update canGoBack after Ionic's outlet has processed the navigation.
        // A microtask ensures the outlet's internal view stack is settled before
        // we read canGoBack(), avoiding a one-frame lag on the gesture state.
        void Promise.resolve().then(() => {
          this._canGoBack.set(this.outlet()?.canGoBack() ?? false);
        });

        // Sync active tab highlight
        this.syncActiveTabFromRoute(event.urlAfterRedirects);
      });

    // sidenavUser is now a computed signal that automatically reacts to auth state changes
  }

  // ============================================
  // FOOTER HANDLERS
  // ============================================

  /**
   * Handle tab selection from footer
   * Uses NavController with directional animation based on tab position
   * - Moving to right tab = slide left (forward animation)
   * - Moving to left tab = slide right (back animation)
   * This matches professional apps like Instagram, Twitter, TikTok
   */
  onTabSelect(event: FooterTabSelectEvent): void {
    const { tab } = event;

    // Close sidenav if open
    if (this.sidenavService.isOpen()) {
      this.sidenavService.close();
    }

    // Don't navigate if already on this tab
    const currentTabId = this._activeTabId();
    if (tab.id === currentTabId) {
      return;
    }

    // Handle action button (Agent X) differently if needed
    if (tab.isActionButton) {
      this.handleAgentAction(tab, currentTabId ?? this.getFallbackTabId());
      return;
    }

    // Navigate to tab route with directional animation
    if (tab.route) {
      const direction = this.getAnimationDirection(currentTabId ?? this.getFallbackTabId(), tab.id);
      this.navigateToTab(tab.route, direction);
    }
  }

  /**
   * Special handling for the center action button (Agent X)
   */
  private handleAgentAction(tab: FooterTabItem, currentTabId: string): void {
    if (tab.route) {
      const direction = this.getAnimationDirection(currentTabId, tab.id);
      this.navigateToTab(tab.route, direction);
    }
  }

  /**
   * Handle scroll-to-top event when user taps currently active tab.
   * Following Instagram, Twitter, TikTok patterns for native mobile UX.
   * Scrolls the current page's IonContent to top with smooth animation.
   */
  async onScrollToTop(event: FooterScrollToTopEvent): Promise<void> {
    this.logger.debug('Scroll to top triggered', { tabId: event.tab.id, source: event.source });

    // Use the scroll service to scroll IonContent to top
    // This handles Ionic's scrollToTop method automatically
    const scrolled = await this.scrollService.scrollIonContentToTop(this.elementRef.nativeElement, {
      behavior: 'smooth',
      duration: 300,
      enableHaptics: true,
    });

    if (!scrolled) {
      // Fallback: Try window scroll if no IonContent found
      await this.scrollService.scrollToTop({
        target: 'window',
        behavior: 'smooth',
        enableHaptics: true,
      });
    }
  }

  /**
   * Navigate to a tab with the specified animation direction.
   *
   * ⭐ Uses navigateRoot (not navigateForward/Back) so each tab tap clears
   * the navigation stack. This is the standard pattern for tab-based apps
   * (Instagram, Twitter, TikTok) and is critical for correct gesture behaviour:
   *
   * - navigateRoot → canGoBack() = false  → sidenav swipe enabled on tab root ✅
   * - navigateForward inside a tab → canGoBack() = true → back-swipe enabled ✅
   *
   * Previously using navigateForward pushed tabs onto the stack, causing
   * isOnMainPage() to incorrectly return false (back-swipe enabled) on pages
   * like /activity and /profile even when they were the intended tab root.
   */
  private navigateToTab(route: string, direction: 'forward' | 'back'): void {
    void this.navController.navigateRoot(route, {
      animated: true,
      animationDirection: direction,
    });
  }

  /**
   * Sync active tab based on current route.
   * Sets to null when on pages not in the footer (like /settings, /profile)
   * - Professional pattern: Instagram, Twitter, TikTok all show no tab
   *   selected when on secondary pages outside main navigation.
   */
  private syncActiveTabFromRoute(url: string): void {
    const matchedTab = findTabByRoute(this.tabs(), url);
    // Set to matched tab ID or null (professional apps show no selection on secondary pages)
    this._activeTabId.set(matchedTab?.id ?? null);
  }

  // ============================================
  // SIDENAV HANDLERS
  // ============================================

  /**
   * Handle sidenav toggle events
   */
  onSidenavToggle(event: SidenavToggleEvent): void {
    if (!event.isOpen) {
      this.sidenavService.close();
    }
  }

  /**
   * Handle sidenav menu item selection
   */
  onSidenavItemSelect(event: SidenavItemSelectEvent): void {
    // Haptic feedback
    this.haptics.impact('light');

    // Close sidenav
    this.sidenavService.close();

    // Navigate if item has a route
    if (event.item.route) {
      void this.navController.navigateForward(event.item.route);
    }

    // Execute action if item has one
    if (event.item.action) {
      this.handleSidenavAction(event.item.action);
    }
  }

  /**
   * Handle "Add Sport" tap from sidenav switcher.
   * Navigates to the add-sport wizard so athletes can add a new sport and
   * coaches/directors can add a new sport team.
   */
  onAddSportClick(): void {
    this.haptics.impact('light');
    void this.navController.navigateForward('/add-sport');
  }

  /**
   * Handle sport profile selection from sidenav switcher.
   * Switches the active sport index and navigates to the user's profile.
   */
  async onSportProfileSelect(event: { profile: SidenavSportProfile; event: Event }): Promise<void> {
    const profile = this.profileService.user();
    if (!profile) return;

    const sports = profile.sports ?? [];
    const selectedSport = event.profile.sport?.toLowerCase().replace(/\s+/g, '-');

    // Find the index of the selected sport in the user's sports array
    const sportIndex = sports.findIndex((s) => {
      const name = (s.sport ?? '').toLowerCase().replace(/\s+/g, '-');
      return name === selectedSport;
    });

    if (sportIndex >= 0 && sportIndex !== this.getActiveSportIndex(sports)) {
      this.logger.info('Switching sport from sidenav', {
        sport: event.profile.sport,
        index: sportIndex,
      });

      // Persist the active sport index
      const uid = profile.id;
      if (uid) {
        await this.editProfileApi.updateActiveSportIndex(uid, sportIndex);
        await this.profileService.refresh(uid);
      }
    }

    this.sidenavService.close();
    void this.navController.navigateForward(this.ownIdentityRoute());
  }

  /**
   * Get the currently active sport index from the sports array.
   */
  private getActiveSportIndex(sports: Array<{ order?: number | null }>): number {
    const idx = sports.findIndex((s) => s.order === 0);
    return idx >= 0 ? idx : 0;
  }

  /**
   * Handle social link click
   */
  onSocialLinkClick(event: { social: SocialLink; event: Event }): void {
    this.haptics.impact('light');

    // Open external link
    if (event.social.url) {
      window.open(event.social.url, '_blank', 'noopener,noreferrer');
    }
  }

  /**
   * Handle special sidenav actions
   */
  private async handleSidenavAction(action: string): Promise<void> {
    switch (action) {
      case 'signout':
        await this.handleSignOut();
        break;
      case 'settings':
        void this.navController.navigateForward('/settings');
        break;
      case 'invite-team':
        await this.openInviteSheet();
        break;
      case 'help':
        void this.navController.navigateForward('/help-center');
        break;
      default:
        // Unknown action - silently ignore
        break;
    }
  }

  /**
   * Open invite feature in a bottom sheet
   * Professional native UX: Opens as a draggable sheet modal
   */
  private async openInviteSheet(): Promise<void> {
    const user = this.profileService.user();
    const primarySport = this.profileService.primarySport();

    // Build InviteTeam from the user's primary sport team data
    const teamInfo = primarySport?.team;
    const team: InviteTeam | undefined =
      teamInfo?.teamId && primarySport
        ? {
            id: teamInfo.teamId,
            name: teamInfo.name ?? '',
            sport: primarySport.sport,
            logoUrl: teamInfo.logoUrl ?? teamInfo.logo ?? undefined,
            memberCount: 0,
          }
        : undefined;

    await this.inviteSheet.open({
      inviteType: team ? 'team' : 'general',
      team,
      user: user
        ? {
            displayName: `${user.firstName} ${user.lastName}`.trim() || user.email || undefined,
            profileImg: user.profileImgs?.[0] ?? undefined,
            role: user.role,
          }
        : undefined,
    });
  }

  /**
   * Handle sign out action from sidenav
   */
  private async handleSignOut(): Promise<void> {
    try {
      await this.authFlow.signOut();
      await this.navController.navigateRoot(AUTH_ROUTES.ROOT);
    } catch (error) {
      this.logger.error('Sign out failed', error);
    }
  }
}

// Re-export with old name for backwards compatibility during migration
export { MobileShellComponent as TabsLayoutComponent };
