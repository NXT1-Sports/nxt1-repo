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
  NxtMobileFooterComponent,
  NxtPlatformService,
  NxtSidenavComponent,
  NxtSidenavService,
  HapticsService,
  NxtLoggingService,
  NxtScrollService,
  InviteBottomSheetService,
  type FooterTabItem,
  type FooterTabSelectEvent,
  type FooterScrollToTopEvent,
  type FooterConfig,
  type SidenavItemSelectEvent,
  type SidenavConfig,
  type SidenavSection,
  type SidenavUserData,
  type SocialLink,
  type SidenavToggleEvent,
  AGENT_X_LEFT_FOOTER_TABS,
  DEFAULT_SIDENAV_ITEMS,
  DEFAULT_SOCIAL_LINKS,
  createSidenavConfig,
  findTabByRoute,
  updateTabBadge,
  isMainPageRoute,
  SIDENAV_WIDTHS,
  SIDENAV_ANIMATION,
} from '@nxt1/ui';
import { AUTH_ROUTES } from '@nxt1/core';
import { AuthFlowService } from '../../../features/auth/services/auth-flow.service';
import { ProfileService } from '../../../core/services/profile.service';
import { ActivityService } from '../../../features/activity/services/activity.service';

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
  imports: [CommonModule, IonRouterOutlet, NxtMobileFooterComponent, NxtSidenavComponent],
  template: `
    <!-- Sidenav using Ionic ion-menu - attaches to main-content -->
    <nxt1-sidenav
      contentId="main-content"
      [user]="sidenavUser() ?? undefined"
      [sections]="sidenavSections"
      [socialLinks]="socialLinks"
      [config]="sidenavConfig()"
      (toggle)="onSidenavToggle($event)"
      (itemSelect)="onSidenavItemSelect($event)"
      (socialClick)="onSocialLinkClick($event)"
      (profileClick)="onSidenavUserClick()"
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

      <!-- Persistent Bottom Navigation -->
      <nxt1-mobile-footer
        [tabs]="tabs()"
        [activeTabId]="activeTabId()"
        [config]="footerConfig()"
        [profileAvatarSrc]="sidenavUser()?.avatarUrl"
        [profileAvatarName]="sidenavUser()?.name"
        (tabSelect)="onTabSelect($event)"
        (scrollToTop)="onScrollToTop($event)"
      />
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

        /* Account for footer height + safe area + floating offset */
        padding-bottom: calc(
          var(--nxt1-footer-height, 80px) + env(safe-area-inset-bottom, 0px) + 24px
        );
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

      /* Position footer at bottom - uses component's CSS variables for customization */
      nxt1-mobile-footer {
        /* Footer component handles positioning via :host styles */
        /* Override defaults if needed via CSS variables: */
        --nxt1-footer-bottom: 20px;
        --nxt1-footer-left: 16px;
        --nxt1-footer-right: 16px;
        --nxt1-z-index-footer: 1000;

        /* Smooth transitions for scroll-hide behavior */
        transition:
          transform var(--nxt1-transition-normal, 300ms)
            var(--nxt1-ease-out, cubic-bezier(0.33, 1, 0.68, 1)),
          opacity var(--nxt1-transition-normal, 300ms)
            var(--nxt1-ease-out, cubic-bezier(0.33, 1, 0.68, 1));
        will-change: transform, opacity;
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
  /** Public sidenav service for programmatic control */
  readonly sidenavService = inject(NxtSidenavService);

  // ============================================
  // ROUTE TRACKING (for sidenav gesture control)
  // ============================================

  /**
   * Current route - used to determine sidenav swipe gesture behavior.
   * Updated on navigation events.
   */
  private readonly _currentRoute = signal<string>('');

  /**
   * Whether current page is a main page where sidenav swipe should be enabled.
   * On main pages (home, search, activity, agent), swipe-right opens sidenav.
   * On sub-pages (profile, settings, etc.), swipe-right triggers native back navigation.
   *
   * Professional pattern: Instagram, Twitter, TikTok all use this approach.
   */
  readonly isOnMainPage = computed(() => isMainPageRoute(this._currentRoute()));

  // ============================================
  // FOOTER CONFIGURATION
  // ============================================

  /**
   * Tab configuration with reactive badge count for notifications.
   * Uses computed signal to update footer badges when unread counts change.
   */
  readonly tabs = computed<FooterTabItem[]>(() => {
    const activityUnreadCount = this.activityService.totalUnread();
    return updateTabBadge(
      AGENT_X_LEFT_FOOTER_TABS,
      'activity',
      activityUnreadCount > 0 ? activityUnreadCount : undefined
    );
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
  readonly footerConfig = computed<FooterConfig>(() => {
    return {
      showLabels: true,
      enableHaptics: true,
      variant: 'default',
      hidden: false,
      translucent: false,
      glass: false, // Solid opaque background
      indicatorStyle: 'none',
      scrollToTopOnSameTap: true, // Enable Instagram/Twitter-style scroll-to-top
    };
  });

  // ============================================
  // SIDENAV CONFIGURATION
  // ============================================

  /**
   * User data for sidenav header - hybrid approach with intelligent avatar fallback.
   *
   * ⭐ Avatar Priority Logic (Fixed for Google Sign-In) ⭐
   * 1. Custom profileImg (if user uploaded one)
   * 2. Google photoURL (from social sign-in)
   * 3. Fallback to initials (handled by nxt1-avatar component)
   *
   * ⭐ Uses ProfileService (full User data) when available ⭐
   * Falls back to AuthUser (persisted) for immediate display on app resume.
   * This ensures sidenav always has data even before ProfileService loads.
   */
  readonly sidenavUser = computed<SidenavUserData | null>(() => {
    // Get both data sources for intelligent avatar fallback
    const profile = this.profileService.user();
    const authUser = this.authFlow.user();

    if (profile) {
      // Get primary sport using order === 0 (User model uses 'order', not 'isPrimary')
      const primarySport = profile.sports?.find((s) => s.order === 0) ?? profile.sports?.[0];
      const position = primarySport?.positions?.[0] ?? '';
      const displayName = `${profile.firstName} ${profile.lastName}`.trim();
      const avatarUrl = profile.profileImg || authUser?.profileImg || undefined;
      return {
        name: displayName || 'User',
        subtitle: position ? `${primarySport?.sport ?? ''} • ${position}` : profile.email,
        avatarUrl,
        initials: this.getInitials(displayName || profile.email || 'U'),
        verified: false,
        isPremium: this.profileService.isPremium(),
        userId: profile.id,
        sportProfiles: (profile.sports ?? []).map((s, index: number) => ({
          id: `${profile.id}-${s.sport?.toLowerCase().replace(/\s+/g, '-') ?? index}`,
          sport: s.sport ?? 'Unknown Sport',
          sportIcon: this.getSportIcon(s.sport),
          position: s.positions?.[0] ?? undefined,
          isActive: s.order === 0, // Primary sport has order === 0
          classYear: undefined, // TODO: Get from backend profile
        })),
        activeSportProfileId: primarySport
          ? `${profile.id}-${primarySport.sport?.toLowerCase().replace(/\s+/g, '-')}`
          : undefined,
      };
    }

    // Fallback to AuthUser (persisted, available immediately on app resume)
    if (!authUser) return null;

    return {
      name: authUser.displayName || 'User',
      subtitle: authUser.email,
      avatarUrl: authUser.profileImg ?? undefined,
      initials: this.getInitials(authUser.displayName || authUser.email || 'U'),
      verified: authUser.emailVerified,
      isPremium: authUser.isPremium,
      userId: authUser.uid,
      sportProfiles: [], // AuthUser doesn't have sports data
      activeSportProfileId: undefined,
    };
  });

  /**
   * Sidenav sections (using defaults from @nxt1/core)
   * Both web and mobile now use clean URLs (no tabs prefix)
   */
  readonly sidenavSections: SidenavSection[] = DEFAULT_SIDENAV_ITEMS;

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

  constructor() {
    // Ionic's ion-menu handles gestures natively - no custom gesture setup needed
  }

  ngOnDestroy(): void {
    // Cleanup if needed
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

        // Sync active tab highlight
        this.syncActiveTabFromRoute(event.urlAfterRedirects);
      });

    // sidenavUser is now a computed signal that automatically reacts to auth state changes
  }

  /**
   * Get user initials from display name or email
   */
  private getInitials(nameOrEmail: string): string {
    if (!nameOrEmail) return 'U';

    // If it looks like an email, use first letter
    if (nameOrEmail.includes('@')) {
      return nameOrEmail.charAt(0).toUpperCase();
    }

    // Split by spaces and get first letter of each word (max 2)
    const parts = nameOrEmail.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return nameOrEmail.charAt(0).toUpperCase();
  }

  /**
   * Get icon name for a sport
   */
  private getSportIcon(sport: string | undefined): string | undefined {
    if (!sport) return undefined;

    const sportLower = sport.toLowerCase();
    const sportIcons: Record<string, string> = {
      football: 'football',
      basketball: 'basketball',
      baseball: 'baseball',
      softball: 'softball',
      soccer: 'soccer',
      volleyball: 'volleyball',
      lacrosse: 'lacrosse',
      tennis: 'tennis',
      golf: 'golf',
      swimming: 'swimming',
      track: 'track',
      wrestling: 'wrestling',
      hockey: 'hockey',
    };

    return sportIcons[sportLower] ?? 'trophy';
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
   * Navigate to a tab with the specified animation direction
   * Uses navigateForward for right movement, navigateBack for left movement
   */
  private navigateToTab(route: string, direction: 'forward' | 'back'): void {
    if (direction === 'forward') {
      void this.navController.navigateForward(route, {
        animated: true,
        animationDirection: 'forward',
      });
    } else {
      void this.navController.navigateBack(route, {
        animated: true,
        animationDirection: 'back',
      });
    }
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
   * Handle sidenav user profile click
   */
  onSidenavUserClick(): void {
    this.haptics.impact('light');
    this.sidenavService.close();
    void this.navController.navigateForward('/profile');
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
        // TODO: Open help/support modal or page
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
    await this.inviteSheet.open({
      inviteType: 'team',
      user: user
        ? {
            displayName: `${user.firstName} ${user.lastName}`.trim() || user.email || undefined,
            profileImg: user.profileImg ?? undefined,
            referralCode: undefined, // TODO: Get from backend
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
