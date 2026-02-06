/**
 * @fileoverview Web Shell Component - Professional Responsive App Shell
 * @module @nxt1/web/core/layout
 * @version 4.0.0 (2026 Professional Pattern)
 *
 * YouTube/Twitter/LinkedIn-inspired responsive app shell:
 *
 * BREAKPOINTS:
 * - Desktop (≥1280px): Fixed sidebar (expanded) + Header (search/profile only)
 * - Tablet (768-1279px): Fixed sidebar (collapsed) + Header
 * - Mobile (<768px): No sidebar, Bottom tab bar (Instagram/TikTok pattern)
 *
 * Architecture:
 * - Platform-aware navigation switching
 * - SSR-safe with proper hydration
 * - Shared navigation state across all modes
 * - Full keyboard navigation and accessibility
 * - 100% design token integration
 *
 * Shell Responsibilities:
 * - Desktop: Fixed sidebar + minimal header
 * - Tablet: Collapsed sidebar (icons) with hover expand
 * - Mobile: Bottom tab bar (shared with mobile app)
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
  afterNextRender,
  PLATFORM_ID,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import {
  // Desktop Sidebar (new)
  NxtDesktopSidebarComponent,
  type DesktopSidebarConfig,
  type DesktopSidebarSection,
  type DesktopSidebarUserData,
  type DesktopSidebarSelectEvent,
  SIDEBAR_BREAKPOINTS,
  createDesktopSidebarConfig,
  // Header (Desktop - simplified for sidebar mode)
  NxtHeaderComponent,
  type TopNavItem,
  type TopNavUserData,
  type TopNavConfig,
  type TopNavSelectEvent,
  type TopNavUserMenuEvent,
  createTopNavConfig,
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
// NAVIGATION CONFIGURATION
// ============================================

/**
 * Desktop sidebar sections - Main navigation structure.
 * Matches YouTube/Twitter sectioned sidebar pattern.
 */
const DESKTOP_SIDEBAR_SECTIONS: readonly DesktopSidebarSection[] = [
  {
    id: 'main',
    items: [
      { id: 'home', label: 'Home', icon: 'home', activeIcon: 'homeFilled', route: '/home' },
      {
        id: 'discover',
        label: 'Discover',
        icon: 'compass',
        activeIcon: 'compassFilled',
        route: '/discover',
      },
      { id: 'agent', label: 'Agent X', icon: 'sparkles', route: '/agent' },
    ],
  },
  {
    id: 'recruiting',
    label: 'Recruiting',
    items: [
      { id: 'rankings', label: 'Rankings', icon: 'trophy', route: '/rankings' },
      { id: 'colleges', label: 'Colleges', icon: 'graduationCap', route: '/colleges' },
      {
        id: 'scout-reports',
        label: 'Scout Reports',
        icon: 'documentText',
        route: '/scout-reports',
      },
      { id: 'teams', label: 'Teams', icon: 'users', route: '/teams' },
    ],
  },
  {
    id: 'you',
    label: 'You',
    items: [
      { id: 'profile', label: 'My Profile', icon: 'person', route: '/profile' },
      { id: 'xp', label: 'XP', icon: 'sparkles', route: '/xp' },
      { id: 'analytics', label: 'Analytics', icon: 'barChart', route: '/analytics' },
      { id: 'messages', label: 'Messages', icon: 'messages', route: '/messages', badge: 0 },
      {
        id: 'notifications',
        label: 'Notifications',
        icon: 'bell',
        route: '/notifications',
        badge: 0,
      },
    ],
  },
  {
    id: 'footer',
    items: [
      { id: 'settings', label: 'Settings', icon: 'settings', route: '/settings' },
      { id: 'help', label: 'Help Center', icon: 'help', route: '/help-center' },
    ],
  },
];

/**
 * Desktop header navigation items (empty - sidebar has main nav).
 * Header only shows: Search, Notifications, User Menu on desktop with sidebar.
 */
const DESKTOP_HEADER_ITEMS: TopNavItem[] = [];

/**
 * User menu dropdown items - shared across header and sidebar.
 */
const USER_MENU_ITEMS = DEFAULT_USER_MENU_ITEMS;

/**
 * Mobile footer tabs - same items as main sidebar section.
 */
const MOBILE_FOOTER_TABS: FooterTabItem[] = DEFAULT_FOOTER_TABS;

@Component({
  selector: 'app-web-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    NxtDesktopSidebarComponent,
    NxtHeaderComponent,
    NxtMobileFooterComponent,
  ],
  template: `
    <div
      class="shell"
      [class.shell--mobile]="isMobileView()"
      [class.shell--desktop]="!isMobileView()"
    >
      <!-- ============================================
           DESKTOP/TABLET: Sidebar + Header Layout
           ============================================ -->
      @if (!isMobileView()) {
        <!-- Fixed Desktop Sidebar -->
        <nxt1-desktop-sidebar
          [sections]="sidebarSections"
          [user]="sidebarUserData()"
          [config]="sidebarConfig()"
          (itemSelect)="onSidebarItemSelect($event)"
          (userClick)="onSidebarUserClick($event)"
          (logoClick)="onLogoClick()"
          (collapseChange)="onSidebarCollapseChange($event)"
        />

        <!-- Main Content Area -->
        <div class="shell__main">
          <!-- Top Header (Search, Notifications, User - no main nav items) -->
          <nxt1-header
            [items]="headerItems"
            [user]="headerUserData()"
            [userMenuItems]="userMenuItems"
            [config]="headerConfig"
            (navigate)="onHeaderNavigate($event)"
            (userMenuAction)="onUserMenuAction($event)"
            (notificationsClick)="onNotificationsClick()"
            (createClick)="onCreateClick()"
            (logoClick)="onLogoClick()"
          />

          <!-- Page Content -->
          <main class="shell__content">
            <router-outlet />
          </main>
        </div>
      }

      <!-- ============================================
           MOBILE: Footer Tab Bar Layout
           ============================================ -->
      @if (isMobileView()) {
        <!-- Main Content Area (full width) -->
        <main class="shell__content shell__content--mobile">
          <router-outlet />
        </main>

        <!-- Bottom Tab Bar -->
        <nxt1-mobile-footer
          [tabs]="footerTabs"
          [activeTabId]="activeTabId()"
          [config]="footerConfig()"
          (tabSelect)="onTabSelect($event)"
          (scrollToTop)="onScrollToTop($event)"
        />
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       CSS CUSTOM PROPERTIES (Design Tokens)
       ============================================ */
      :host {
        --shell-header-height: 64px;
        --shell-sidebar-width: 256px;
        --shell-sidebar-collapsed-width: 72px;
        --shell-footer-height: var(--nxt1-mobile-footer-height, 72px);
        --shell-bg: var(--nxt1-color-bg-primary);
        --shell-content-bg: var(--nxt1-color-bg-secondary);

        display: block;
        min-height: 100vh;
        min-height: 100dvh;
        background: var(--shell-bg);
      }

      /* ============================================
       SHELL CONTAINER
       ============================================ */
      .shell {
        display: flex;
        min-height: 100vh;
        min-height: 100dvh;
      }

      /* Desktop/Tablet: Sidebar + Main */
      .shell--desktop {
        flex-direction: row;
      }

      /* Mobile: Single column */
      .shell--mobile {
        flex-direction: column;
      }

      /* ============================================
       DESKTOP SIDEBAR
       ============================================ */
      nxt1-desktop-sidebar {
        flex-shrink: 0;
        z-index: 50;
      }

      /* ============================================
       MAIN CONTENT AREA (Desktop)
       ============================================ */
      .shell__main {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0; /* Prevent flex overflow */
        height: 100vh;
        height: 100dvh;
      }

      /* ============================================
       HEADER (Desktop)
       ============================================ */
      nxt1-header {
        flex-shrink: 0;
        z-index: 40;
      }

      /* ============================================
       PAGE CONTENT
       ============================================ */
      .shell__content {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        background: var(--shell-content-bg);
        min-height: 0; /* Critical for flex overflow scrolling */
      }

      /* Mobile: account for fixed footer */
      .shell__content--mobile {
        padding-bottom: var(--shell-footer-height);
      }

      /* ============================================
       MOBILE FOOTER
       ============================================ */
      nxt1-mobile-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: var(--nxt1-z-index-footer, 1000);
      }

      /* ============================================
       RESPONSIVE BEHAVIOR
       ============================================ */

      /* Tablet (768-1279px): Collapsed sidebar */
      @media (min-width: 768px) and (max-width: 1279px) {
        :host {
          --shell-sidebar-width: var(--shell-sidebar-collapsed-width);
        }
      }

      /* Desktop (≥1280px): Expanded sidebar */
      @media (min-width: 1280px) {
        :host {
          --shell-sidebar-width: 256px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebShellComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly platform = inject(NxtPlatformService);
  private readonly authFlow = inject(AuthFlowService);
  private readonly logger = inject(NxtLoggingService).child('WebShellComponent');
  private readonly destroyRef = inject(DestroyRef);
  private readonly scrollService = inject(NxtScrollService);

  // ============================================
  // SIDEBAR CONFIGURATION (Desktop/Tablet)
  // ============================================

  /** Desktop sidebar sections */
  readonly sidebarSections = DESKTOP_SIDEBAR_SECTIONS;

  /** Sidebar configuration - responsive based on viewport */
  readonly sidebarConfig = computed<DesktopSidebarConfig>(() => {
    const viewport = this.platform.viewport();
    const isTablet =
      viewport.width >= SIDEBAR_BREAKPOINTS.MOBILE && viewport.width < SIDEBAR_BREAKPOINTS.DESKTOP;

    return createDesktopSidebarConfig({
      collapsed: isTablet || this._sidebarCollapsed(),
      expandOnHover: false, // Only expand/collapse via hamburger menu click
      showLogo: true,
      showUserSection: false, // User profile is in header (2026 pattern)
      showThemeToggle: true,
      persistState: true,
      variant: 'default',
      bordered: false,
    });
  });

  /** Sidebar user data */
  readonly sidebarUserData = computed<DesktopSidebarUserData | null>(() => {
    const user = this.authFlow.user() as {
      displayName?: string;
      email?: string;
      photoURL?: string;
      unicode?: string;
    } | null;

    if (!user) return null;

    const name = user.displayName || user.email?.split('@')[0] || 'User';

    return {
      name,
      avatarUrl: user.photoURL,
      initials: this.getInitials(name),
      handle: user.unicode ? `@${user.unicode}` : undefined,
      verified: false,
      isPremium: false,
    };
  });

  // ============================================
  // HEADER CONFIGURATION (Desktop - Minimal)
  // ============================================

  /** Desktop header items (empty when using sidebar) */
  readonly headerItems = DESKTOP_HEADER_ITEMS;

  /** User menu items */
  readonly userMenuItems = USER_MENU_ITEMS;

  /** Desktop header configuration - minimal mode with sidebar */
  readonly headerConfig: TopNavConfig = createTopNavConfig({
    variant: 'default',
    showLogo: false, // Sidebar has logo
    showSearch: true,
    showNotifications: true,
    sticky: true,
    hideOnScroll: false,
    bordered: false,
  });

  /** Header user data */
  readonly headerUserData = computed<TopNavUserData | null>(() => {
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
  // MOBILE FOOTER CONFIGURATION
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
    glass: false, // Use solid background
    indicatorStyle: 'none',
    scrollToTopOnSameTap: true,
  }));

  // ============================================
  // STATE
  // ============================================

  /** Current route for active state detection */
  private readonly _currentRoute = signal('/home');

  /** Active tab ID for mobile footer */
  private readonly _activeTabId = signal<string | null>('home');
  readonly activeTabId = computed(() => this._activeTabId());

  /** Sidebar collapsed state (persisted) */
  private readonly _sidebarCollapsed = signal(false);

  /** Whether we're in mobile view (shows footer instead of sidebar) */
  readonly isMobileView = computed(() => {
    const viewport = this.platform.viewport();
    return viewport.width < SIDEBAR_BREAKPOINTS.MOBILE;
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  constructor() {
    this.setupRouteTracking();
    this.loadSidebarState();
  }

  // ============================================
  // SIDEBAR HANDLERS (Desktop/Tablet)
  // ============================================

  /**
   * Handle sidebar item selection
   */
  onSidebarItemSelect(event: DesktopSidebarSelectEvent): void {
    const { item } = event;

    // Handle special actions
    if (item.action === 'logout') {
      this.signOut();
      return;
    }

    // Navigation is handled by the sidebar component
    this.logger.debug('Sidebar item selected', { itemId: item.id });
  }

  /**
   * Handle sidebar user section click
   */
  onSidebarUserClick(_event: Event): void {
    // Could open user menu or navigate to profile
    this.router.navigate(['/settings/account']);
  }

  /**
   * Handle sidebar collapse state change
   */
  onSidebarCollapseChange(collapsed: boolean): void {
    this._sidebarCollapsed.set(collapsed);
    this.saveSidebarState(collapsed);
  }

  // ============================================
  // HEADER HANDLERS (Desktop)
  // ============================================

  /**
   * Handle header nav item selection
   */
  onHeaderNavigate(event: TopNavSelectEvent): void {
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
   * Handle create button click
   */
  onCreateClick(): void {
    this.router.navigate(['/create-post']);
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
   * Sync active tab ID from current route (for mobile footer).
   */
  private syncActiveTabFromRoute(url: string): void {
    const matchedTab = findTabByRoute(this.footerTabs, url);
    this._activeTabId.set(matchedTab?.id ?? null);
  }

  /**
   * Load sidebar collapsed state from storage
   */
  private loadSidebarState(): void {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) return;

      const stored = localStorage.getItem('nxt1_sidebar_collapsed');
      if (stored !== null) {
        this._sidebarCollapsed.set(stored === 'true');
      }
    });
  }

  /**
   * Save sidebar collapsed state to storage
   */
  private saveSidebarState(collapsed: boolean): void {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.setItem('nxt1_sidebar_collapsed', String(collapsed));
  }

  /**
   * Get initials from name
   */
  private getInitials(name: string): string {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0]?.substring(0, 2).toUpperCase() || 'U';
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
