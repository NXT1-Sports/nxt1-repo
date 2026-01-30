/**
 * @fileoverview Web Shell Component - Responsive App Shell
 * @module @nxt1/web/core/layout
 * @version 3.0.0
 *
 * Professional responsive app shell:
 * - Desktop (>768px): Top navigation bar (Linear/Notion pattern)
 * - Mobile (≤768px): Bottom tab bar (Instagram/Twitter pattern)
 *
 * Architecture:
 * - Platform-aware navigation switching
 * - SSR-safe with proper hydration
 * - Shared navigation state across both modes
 *
 * Shell Responsibilities:
 * - Persistent navigation (top on desktop, bottom on mobile)
 * - User authentication state display
 * - Route synchronization with active nav item
 *
 * @example
 * ```typescript
 * // In app.routes.ts
 * {
 *   path: '',
 *   loadComponent: () => import('./core/layout/shell').then(m => m.WebShellComponent),
 *   children: [
 *     { path: 'home', loadComponent: () => import('./features/home/home.component') },
 *   ]
 * }
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import {
  // Header (Desktop)
  NxtHeaderComponent,
  type TopNavItem,
  type TopNavUserData,
  type TopNavConfig,
  type TopNavSelectEvent,
  type TopNavUserMenuEvent,
  createTopNavConfig,
  DEFAULT_TOP_NAV_ITEMS,
  DEFAULT_USER_MENU_ITEMS,
  // Footer (Mobile)
  NxtMobileFooterComponent,
  type FooterTabItem,
  type FooterTabSelectEvent,
  type FooterScrollToTopEvent,
  type FooterConfig,
  DEFAULT_FOOTER_TABS,
  findTabByRoute,
  // Platform
  NxtPlatformService,
  NxtLoggingService,
  // Scroll
  NxtScrollService,
} from '@nxt1/ui';
import { AuthFlowService } from '../../../features/auth/services';

// ============================================
// NAV CONFIGURATION (From Shared Defaults)
// ============================================

/**
 * Desktop navigation items - Customized from defaults
 * In production, this would come from backend API or environment config
 */
const DESKTOP_NAV_ITEMS: TopNavItem[] = [
  // Use shared defaults and customize
  ...DEFAULT_TOP_NAV_ITEMS.filter((item) => ['home', 'discover'].includes(item.id)),
  // Add app-specific items
  {
    id: 'rankings',
    label: 'Rankings',
    icon: 'trophy',
    route: '/rankings',
  },
  {
    id: 'colleges',
    label: 'Colleges',
    icon: 'graduationCap',
    route: '/colleges',
  },
  {
    id: 'messages',
    label: 'Messages',
    icon: 'messages',
    route: '/messages',
  },
];

/**
 * User menu dropdown items - Use shared defaults
 */
const USER_MENU_ITEMS = DEFAULT_USER_MENU_ITEMS;

/**
 * Mobile footer tabs - Use shared defaults
 * These map to the same routes as desktop nav
 */
const MOBILE_FOOTER_TABS: FooterTabItem[] = DEFAULT_FOOTER_TABS;

@Component({
  selector: 'app-web-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NxtHeaderComponent, NxtMobileFooterComponent],
  template: `
    <!-- Desktop Header Navigation -->
    @if (!showMobileNav()) {
      <nxt1-header
        [items]="navItems"
        [user]="userData()"
        [userMenuItems]="userMenuItems"
        [config]="navConfig"
        (navigate)="onNavigate($event)"
        (userMenuAction)="onUserMenuAction($event)"
        (notificationsClick)="onNotificationsClick()"
        (logoClick)="onLogoClick()"
      />
    }

    <!-- Main Content Area -->
    <main class="shell-content" [class.has-mobile-nav]="showMobileNav()">
      <router-outlet />
    </main>

    <!-- Mobile Bottom Navigation -->
    @if (showMobileNav()) {
      <nxt1-mobile-footer
        [tabs]="footerTabs"
        [activeTabId]="activeTabId()"
        [config]="footerConfig()"
        (tabSelect)="onTabSelect($event)"
        (scrollToTop)="onScrollToTop($event)"
      />
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        min-height: 100dvh;
        background: var(--nxt1-color-background-primary, #0a0a0a);
      }

      .shell-content {
        flex: 1;
        display: flex;
        flex-direction: column;
      }

      /* Desktop mode: account for fixed header */
      .shell-content:not(.has-mobile-nav) {
        padding-top: var(--nxt1-nav-height, 56px);
      }

      /* Mobile mode: account for fixed footer */
      .shell-content.has-mobile-nav {
        padding-bottom: var(--nxt1-mobile-footer-height, 56px);
      }

      /* Mobile footer styling */
      nxt1-mobile-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: var(--nxt1-z-index-footer, 1000);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebShellComponent {
  private readonly router = inject(Router);
  private readonly platform = inject(NxtPlatformService);
  private readonly authFlow = inject(AuthFlowService);
  private readonly logger = inject(NxtLoggingService).child('WebShellComponent');
  private readonly destroyRef = inject(DestroyRef);
  private readonly scrollService = inject(NxtScrollService);

  // ============================================
  // DESKTOP NAVIGATION CONFIG
  // ============================================

  /** Desktop navigation items */
  readonly navItems = DESKTOP_NAV_ITEMS;

  /** User menu items */
  readonly userMenuItems = USER_MENU_ITEMS;

  /** Desktop navigation configuration */
  readonly navConfig: TopNavConfig = createTopNavConfig({
    variant: 'blur',
    showSearch: true,
    showNotifications: true,
    sticky: true,
    hideOnScroll: false,
    bordered: true,
  });

  // ============================================
  // MOBILE NAVIGATION CONFIG
  // ============================================

  /** Mobile footer tabs */
  readonly footerTabs = MOBILE_FOOTER_TABS;

  /** Mobile footer configuration */
  readonly footerConfig = computed<FooterConfig>(() => ({
    showLabels: true,
    enableHaptics: false, // Web doesn't have haptics
    variant: 'default',
    hidden: false,
    translucent: false,
    indicatorStyle: 'none',
    scrollToTopOnSameTap: true, // Enable Instagram/Twitter-style scroll-to-top
  }));

  // ============================================
  // STATE
  // ============================================

  /** Current route for active state detection */
  private readonly _currentRoute = signal('/home');

  /** Active tab ID for mobile footer */
  private readonly _activeTabId = signal<string>('home');
  readonly activeTabId = computed(() => this._activeTabId());

  /** Whether we're in desktop mode (shows header instead of footer) */
  readonly showMobileNav = this.platform.isMobile;

  /** User data for the nav avatar/menu */
  readonly userData = computed<TopNavUserData | null>(() => {
    const user = this.authFlow.user() as {
      displayName?: string;
      email?: string;
      photoURL?: string;
    } | null;
    if (!user) return null;

    return {
      name: user.displayName || user.email?.split('@')[0] || 'User',
      email: user.email || undefined,
      avatarUrl: user.photoURL || undefined,
      verified: false,
      roleBadge: undefined,
    };
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  constructor() {
    this.setupRouteTracking();
  }

  // ============================================
  // NAVIGATION HANDLERS
  // ============================================

  /**
   * Handle desktop nav item selection
   */
  onNavigate(event: TopNavSelectEvent): void {
    const { item } = event;
    if (item.route) {
      this.router.navigate([item.route]);
    }
  }

  /**
   * Handle mobile tab selection
   */
  onTabSelect(event: FooterTabSelectEvent): void {
    const { tab } = event;
    if (tab.route) {
      this.router.navigate([tab.route]);
    }
  }

  /**
   * Handle scroll-to-top event when user taps currently active tab.
   * Following Instagram, Twitter, TikTok patterns for native mobile UX.
   * Scrolls the page to top with smooth animation.
   */
  async onScrollToTop(event: FooterScrollToTopEvent): Promise<void> {
    this.logger.debug('Scroll to top triggered', { tabId: event.tab.id, source: event.source });

    // Use the scroll service to scroll to top
    // On web, we use window scroll (no IonContent)
    await this.scrollService.scrollToTop({
      target: 'window',
      behavior: 'smooth',
      enableHaptics: false, // Web doesn't have haptics
    });
  }

  /**
   * Handle user menu action
   */
  onUserMenuAction(event: TopNavUserMenuEvent): void {
    const { item } = event;

    switch (item.id) {
      case 'profile':
        this.router.navigate(['/profile']);
        break;
      case 'settings':
        this.router.navigate(['/settings']);
        break;
      case 'help':
        this.router.navigate(['/help']);
        break;
      case 'logout':
        this.signOut();
        break;
    }
  }

  /**
   * Handle notifications bell click
   */
  onNotificationsClick(): void {
    this.router.navigate(['/notifications']);
  }

  /**
   * Handle logo click - navigate to home
   */
  onLogoClick(): void {
    this.router.navigate(['/home']);
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Track route changes for nav active state
   */
  private setupRouteTracking(): void {
    // Set initial route
    this._currentRoute.set(this.router.url);
    this.syncActiveTabFromRoute(this.router.url);

    // Track route changes
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        this._currentRoute.set(event.urlAfterRedirects);
        this.syncActiveTabFromRoute(event.urlAfterRedirects);
      });
  }

  /**
   * Sync active tab ID from current route (for mobile footer)
   */
  private syncActiveTabFromRoute(url: string): void {
    const matchedTab = findTabByRoute(this.footerTabs, url);
    if (matchedTab) {
      this._activeTabId.set(matchedTab.id);
    }
  }

  /**
   * Sign out user
   */
  private async signOut(): Promise<void> {
    try {
      await this.authFlow.signOut();
      void this.router.navigate(['/auth/login']);
    } catch (err) {
      this.logger.error('Sign out failed', err);
    }
  }
}

// Re-export with old name for backwards compatibility during migration
export { WebShellComponent as MainLayoutComponent };
