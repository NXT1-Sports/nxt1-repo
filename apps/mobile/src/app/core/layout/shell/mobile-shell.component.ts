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
  HostListener,
  NgZone,
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
  type FooterTabItem,
  type FooterTabSelectEvent,
  type FooterConfig,
  type SidenavItemSelectEvent,
  type SidenavConfig,
  type SidenavSection,
  type SidenavUserData,
  type SocialLink,
  type SidenavToggleEvent,
  DEFAULT_FOOTER_TABS,
  DEFAULT_SIDENAV_ITEMS,
  DEFAULT_SOCIAL_LINKS,
  createSidenavConfig,
  findTabByRoute,
  SIDENAV_GESTURE,
  SIDENAV_WIDTHS,
  SIDENAV_ANIMATION,
} from '@nxt1/ui';
import { AUTH_ROUTES } from '@nxt1/core/constants';
import { AuthFlowService } from '../../../features/auth/services/auth-flow.service';

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
        <ion-router-outlet></ion-router-outlet>
      </div>

      <!-- Persistent Bottom Navigation -->
      <nxt1-mobile-footer
        [tabs]="tabs"
        [activeTabId]="activeTabId()"
        [config]="footerConfig()"
        (tabSelect)="onTabSelect($event)"
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

      /* Position footer at bottom */
      nxt1-mobile-footer {
        position: fixed;
        bottom: 20px;
        left: 16px;
        right: 16px;
        z-index: var(--nxt1-z-index-footer, 100);
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
  private readonly ngZone = inject(NgZone);
  private readonly authFlow = inject(AuthFlowService);
  private readonly logger = inject(NxtLoggingService).child('MobileShell');

  /** Public sidenav service for programmatic control */
  readonly sidenavService = inject(NxtSidenavService);

  // ============================================
  // GESTURE STATE
  // ============================================

  /** Track swipe left start position */
  private swipeStartX = 0;

  /** Minimum swipe distance to trigger sidenav (from @nxt1/core) */
  private readonly MIN_SWIPE_DISTANCE = SIDENAV_GESTURE.minSwipeDistance;

  /** Edge threshold for swipe detection (from @nxt1/core) */
  private readonly EDGE_THRESHOLD = 20; // 20px from left edge

  // ============================================
  // FOOTER CONFIGURATION
  // ============================================

  /**
   * Tab configuration - can be customized per user role in the future
   * For now, uses the default 5-tab layout from @nxt1/ui
   */
  readonly tabs: FooterTabItem[] = DEFAULT_FOOTER_TABS;

  /** Currently active tab ID, synced with router */
  private readonly _activeTabId = signal<string>('home');
  readonly activeTabId = this._activeTabId.asReadonly();

  /**
   * Get the visual position of a tab (for animation direction)
   * Regular tabs are positioned left-to-right, action button is always rightmost
   * Visual order: [regular tabs...] [action button]
   */
  private getVisualTabPosition(tabId: string): number {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return -1;

    if (tab.isActionButton) {
      // Action button is always visually last (rightmost)
      return this.tabs.filter((t) => !t.isActionButton).length;
    }

    // Regular tabs: count only non-action tabs before this one
    let position = 0;
    for (const t of this.tabs) {
      if (t.id === tabId) break;
      if (!t.isActionButton) position++;
    }
    return position;
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
    const isIos = this.platform.os() === 'ios';
    return {
      showLabels: true,
      enableHaptics: true,
      variant: isIos ? 'default' : 'elevated',
      hidden: false,
      translucent: isIos,
      indicatorStyle: 'none',
    };
  });

  // ============================================
  // SIDENAV CONFIGURATION
  // ============================================

  /** User data for sidenav header - will be populated from auth state */
  private readonly _sidenavUser = signal<SidenavUserData | null>(null);
  readonly sidenavUser = this._sidenavUser.asReadonly();

  /** Sidenav sections (using defaults from @nxt1/core) */
  readonly sidenavSections: SidenavSection[] = DEFAULT_SIDENAV_ITEMS;

  /** Social links for sidenav footer */
  readonly socialLinks: SocialLink[] = DEFAULT_SOCIAL_LINKS;

  /** Sidenav configuration based on platform */
  readonly sidenavConfig = computed<SidenavConfig>(() => {
    const isIos = this.platform.os() === 'ios';
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
    });
  });

  constructor() {
    // Ionic's ion-menu handles gestures natively - no custom gesture setup needed
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  ngOnInit(): void {
    // Sync active tab with current route on init
    this.syncActiveTabFromRoute(this.router.url);

    // Listen for route changes to update active tab
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        this.syncActiveTabFromRoute(event.urlAfterRedirects);
      });

    // TODO: Subscribe to auth state to populate sidenav user data
    // Example:
    // this.authService.user$.pipe(
    //   takeUntilDestroyed(this.destroyRef)
    // ).subscribe(user => {
    //   if (user) {
    //     this._sidenavUser.set({
    //       name: user.displayName ?? 'User',
    //       subtitle: user.email ?? '',
    //       avatarUrl: user.photoURL ?? undefined,
    //       verified: user.emailVerified,
    //       isPremium: user.subscription?.tier === 'premium',
    //       userId: user.uid,
    //     });
    //   } else {
    //     this._sidenavUser.set(null);
    //   }
    // });
  }

  // ============================================
  // GESTURE HANDLERS
  // ============================================

  /**
   * Handle touch start - record swipe start position
   * Professional UX: Swipe-left opens sidenav (primary nav) instead of going back
   */
  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.swipeStartX = event.touches[0].clientX;
    }
  }

  /**
   * Handle touch end - detect swipe-left gesture
   * If user swipes from left edge more than MIN_SWIPE_DISTANCE to the right,
   * open the sidenav instead of navigating back (Twitter/X pattern)
   */
  @HostListener('touchend', ['$event'])
  onTouchEnd(event: TouchEvent): void {
    if (event.changedTouches.length === 1) {
      const swipeEndX = event.changedTouches[0].clientX;
      const swipeDistance = swipeEndX - this.swipeStartX;

      // Detect left-to-right swipe from left edge
      // (positive distance = swiping right, starting from left edge)
      if (this.swipeStartX < this.EDGE_THRESHOLD && swipeDistance > this.MIN_SWIPE_DISTANCE) {
        this.ngZone.run(() => {
          this.handleSwipeLeftGesture();
        });
        event.preventDefault();
      }
    }
  }

  /**
   * Handle swipe-left gesture - open sidenav
   * This replaces the default iOS back gesture behavior.
   * Professional decision: Users have bottom tabs for navigation,
   * so swipe should open primary nav (sidenav) instead of going back.
   */
  private async handleSwipeLeftGesture(): Promise<void> {
    // Haptic feedback
    await this.haptics.impact('light');

    // Open sidenav
    await this.sidenavService.open();
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
      this.handleAgentAction(tab, currentTabId);
      return;
    }

    // Navigate to tab route with directional animation
    if (tab.route) {
      const direction = this.getAnimationDirection(currentTabId, tab.id);
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
   * Sync active tab based on current route
   * Matches route prefix to find the corresponding tab
   */
  private syncActiveTabFromRoute(url: string): void {
    const matchedTab = findTabByRoute(this.tabs, url);

    if (matchedTab) {
      this._activeTabId.set(matchedTab.id);
    }
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
      void this.router.navigate([event.item.route]);
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
    void this.router.navigate(['/tabs/profile']);
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
        void this.router.navigate(['/tabs/settings']);
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

  /**
   * Update sidenav user data (call from auth service subscription)
   */
  updateSidenavUser(user: SidenavUserData | null): void {
    this._sidenavUser.set(user);
  }
}

// Re-export with old name for backwards compatibility during migration
export { MobileShellComponent as TabsLayoutComponent };
