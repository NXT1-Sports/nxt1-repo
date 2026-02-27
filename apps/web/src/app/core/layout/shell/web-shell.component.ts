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
  ElementRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isPlatformBrowser, CommonModule, Location } from '@angular/common';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
// ── Navigation Components (granular imports for tree-shaking) ──
import {
  NxtDesktopSidebarComponent,
  type DesktopSidebarConfig,
  type DesktopSidebarItem,
  type DesktopSidebarSection,
  type DesktopSidebarUserData,
  type DesktopSidebarSelectEvent,
  SIDEBAR_BREAKPOINTS,
  createDesktopSidebarConfig,
} from '@nxt1/ui/components/desktop-sidebar';
import {
  NxtHeaderComponent,
  type TopNavItem,
  type TopNavUserData,
  type TopNavConfig,
  type TopNavSelectEvent,
  type TopNavUserMenuEvent,
  createTopNavConfig,
  DEFAULT_USER_MENU_ITEMS,
} from '@nxt1/ui/components/top-nav';
import {
  NxtMobileFooterComponent,
  type FooterTabItem,
  type FooterTabSelectEvent,
  type FooterScrollToTopEvent,
  type FooterConfig,
  CENTERED_CREATE_FOOTER_TABS,
  findTabByRoute,
} from '@nxt1/ui/components/footer';
import {
  NxtMobileHeaderComponent,
  type MobileHeaderConfig,
  type MobileHeaderUserData,
  createMobileHeaderConfig,
} from '@nxt1/ui/components/mobile-header';
import {
  NxtMobileSidebarComponent,
  type MobileSidebarConfig,
  type MobileSidebarSelectEvent,
  createMobileSidebarConfig,
} from '@nxt1/ui/components/mobile-sidebar';
// ── Services (separate from component barrel) ──
import {
  NxtPlatformService,
  NxtLoggingService,
  NxtScrollService,
  NxtNotificationStateService,
} from '@nxt1/ui/services';
// ── Auth ──
import { AuthModalService } from '@nxt1/ui/auth';
// ── Explore (for global search dropdown) ──
import { ExploreService } from '@nxt1/ui/explore';
import type { TopNavSearchSubmitEvent } from '@nxt1/ui/components/top-nav';
// ── App-level imports ──
import { AuthFlowService } from '../../../features/auth/services';
import { BadgeCountService } from '../../services/badge-count.service';
import { NotificationPopoverComponent } from '../../../features/activity/components';
import {
  DEFAULT_SOCIAL_LINKS,
  DEFAULT_SPORTS,
  formatSportDisplayName,
  normalizeSportKey,
} from '@nxt1/core';

// ============================================
// NAVIGATION CONFIGURATION
// ============================================

/**
 * Desktop sidebar sections - Main navigation structure.
 * Matches YouTube/Twitter sectioned sidebar pattern.
 */
const FOLLOW_US_ITEMS: readonly DesktopSidebarItem[] = DEFAULT_SOCIAL_LINKS.map((social) => ({
  id: `follow-${social.id}`,
  label: social.label,
  icon: social.icon,
  href: social.url,
  ariaLabel: social.ariaLabel ?? `Follow NXT1 on ${social.label}`,
}));

/**
 * Maps normalized sport base names to icon names in the design-tokens registry.
 * Gendered variants (mens/womens) share the same base sport icon.
 */
const SPORT_ICON_MAP: Record<string, string> = {
  football: 'football',
  basketball: 'basketball',
  baseball: 'baseball',
  softball: 'softball',
  soccer: 'soccer',
  lacrosse: 'lacrosse',
  volleyball: 'volleyball',
  golf: 'golf',
  track_field: 'track',
  cross_country: 'crossCountry',
  field_hockey: 'fieldHockey',
  ice_hockey: 'iceHockey',
  tennis: 'tennis',
  swimming_diving: 'swimming',
  rowing: 'rowing',
  wrestling: 'wrestling',
  gymnastics: 'gymnastics',
  water_polo: 'waterPolo',
  bowling: 'bowling',
};

/**
 * resolves a sport name (e.g. "basketball mens") to a design-token icon key.
 */
function getSportIconName(sportName: string): string {
  const key = normalizeSportKey(sportName); // e.g. "basketball_mens" or "track_field_mens"
  // Strip gender suffix to get base sport
  const base = key.replace(/_(mens|womens)$/, '');
  return SPORT_ICON_MAP[base] ?? 'trophy';
}

/**
 * Sport child items — derived from DEFAULT_SPORTS constant in @nxt1/core.
 * All sports from the shared constants are automatically available here.
 */
const SPORT_CHILD_ITEMS: readonly DesktopSidebarItem[] = DEFAULT_SPORTS.map((sport) => {
  const slug = normalizeSportKey(sport.name).replace(/_/g, '-');
  return {
    id: `sport-${slug}`,
    label: formatSportDisplayName(sport.name),
    icon: getSportIconName(sport.name),
    route: `/sports/${slug}`,
  };
});

const DESKTOP_SIDEBAR_SECTIONS: readonly DesktopSidebarSection[] = [
  {
    id: 'main',
    items: [
      {
        id: 'explore',
        label: 'Explore',
        icon: 'compass',
        activeIcon: 'compassFilled',
        route: '/explore',
      },
      { id: 'news', label: 'News', icon: 'newspaper', route: '/news' },
      { id: 'agent', label: 'Agent X', icon: 'agent-x', route: '/agent' },
    ],
  },
  {
    id: 'you',
    label: 'You',
    items: [
      { id: 'profile', label: 'My Profile', icon: 'person', route: '/profile' },
      { id: 'xp', label: 'XP', icon: 'sparkles', route: '/xp' },
      { id: 'analytics', label: 'Analytics', icon: 'barChart', route: '/analytics' },
      { id: 'manage-team', label: 'Manage Team', icon: 'users', route: '/manage-team' },
      { id: 'messages', label: 'Messages', icon: 'messages', route: '/messages', badge: 0 },
    ],
  },
  {
    id: 'footer',
    items: [
      { id: 'usage', label: 'Usage', icon: 'creditCard', route: '/usage' },
      { id: 'settings', label: 'Settings', icon: 'settings', route: '/settings' },
      { id: 'help', label: 'Help Center', icon: 'help', route: '/help-center' },
    ],
  },
  {
    id: 'follow-us',
    label: 'Follow Us',
    items: FOLLOW_US_ITEMS,
  },
];

/**
 * Logged-out variant — Full marketing sidebar with persona-based navigation.
 * Auth-required items (Settings) use `action` instead of direct navigation
 * so the web-shell can present the sign-in modal before routing.
 * Named WEB_* to avoid shadowing the @nxt1/ui LOGGED_OUT_SIDEBAR_SECTIONS export.
 */
const WEB_LOGGED_OUT_SIDEBAR_SECTIONS: readonly DesktopSidebarSection[] = [
  // ── Top-level pages ──
  {
    id: 'main',
    items: [
      {
        id: 'explore',
        label: 'Explore',
        icon: 'compass',
        activeIcon: 'compassFilled',
        route: '/explore',
      },
      { id: 'news', label: 'News', icon: 'newspaper', route: '/news' },
      { id: 'agent', label: 'Agent X', icon: 'agent-x', route: '/agent' },
    ],
  },

  // ── Persona sections + Sports (expandable items with children) ──
  {
    id: 'personas',
    items: [
      {
        id: 'persona-athletes',
        label: 'For Athletes',
        icon: 'athlete',
        expanded: false,
        children: [
          {
            id: 'athlete-platform',
            label: 'Athlete Platform',
            icon: 'athlete',
            route: '/athletes',
          },
          {
            id: 'athlete-profiles',
            label: 'Super Profile',
            icon: 'link',
            route: '/super-profiles',
          },
          { id: 'athlete-ai', label: 'AI for Athletes', icon: 'agent-x', route: '/ai-athletes' },
          {
            id: 'athlete-recruiting',
            label: 'Recruiting',
            icon: 'graduationCap',
            route: '/recruiting-athletes',
          },
          {
            id: 'athlete-content',
            label: 'Content Creation',
            icon: 'videocam',
            route: '/content-creation-athletes',
          },
          {
            id: 'athlete-media',
            label: 'Media & Coverage',
            icon: 'newspaper',
            route: '/media-coverage',
          },
          { id: 'athlete-xp', label: 'XP', icon: 'sparkles', route: '/xp' },
          { id: 'athlete-analytics', label: 'Analytics', icon: 'barChart', route: '/analytics' },
          { id: 'athlete-nil', label: 'NIL', icon: 'creditCard', route: '/nil' },
        ],
      },
      {
        id: 'persona-programs',
        label: 'For Programs/Orgs',
        icon: 'users',
        expanded: false,
        children: [
          { id: 'team-platform', label: 'Team Platform', icon: 'users', route: '/team-platform' },
          { id: 'team-ai', label: 'AI For Coaches', icon: 'agent-x', route: '/ai-coaches' },
          { id: 'team-admin', label: 'Administration', icon: 'clipboard', route: '/team-admin' },
          {
            id: 'team-content',
            label: 'Content Creation',
            icon: 'videocam',
            route: '/team-content',
          },
          { id: 'team-website', label: 'Team Website', icon: 'link', route: '/team-website' },
          {
            id: 'team-management',
            label: 'Management',
            icon: 'settings',
            route: '/team-management',
          },
          { id: 'team-analytics', label: 'Analytics', icon: 'barChart', route: '/team-analytics' },
          {
            id: 'team-recruiting',
            label: 'Recruiting',
            icon: 'graduationCap',
            route: '/team-recruiting',
          },
        ],
      },
      {
        id: 'persona-colleges',
        label: 'For Colleges/Scouts',
        icon: 'search',
        expanded: false,
        children: [
          { id: 'scout-platform', label: 'Scout Platform', icon: 'search', route: '/scouts' },
          { id: 'scout-discover', label: 'Discover Athletes', icon: 'compass', route: '/explore' },
          { id: 'scout-ai', label: 'AI For Scouts', icon: 'agent-x', route: '/ai-scouts' },
          {
            id: 'scout-recruiting',
            label: 'Recruiting',
            icon: 'graduationCap',
            route: '/recruiting-scouts-colleges',
          },
        ],
      },
      {
        id: 'persona-parents',
        label: 'For Parents',
        icon: 'parent',
        expanded: false,
        children: [
          { id: 'parent-platform', label: 'Parent Platform', icon: 'parent', route: '/parents' },
          {
            id: 'parent-content',
            label: 'Content Creation',
            icon: 'videocam',
            route: '/parent-content',
          },
          {
            id: 'parent-coverage',
            label: 'Athlete Coverage',
            icon: 'newspaper',
            route: '/athlete-coverage',
          },
          {
            id: 'parent-recruiting',
            label: 'Recruiting',
            icon: 'graduationCap',
            route: '/parent-recruiting',
          },
        ],
      },
      {
        id: 'persona-businesses',
        label: 'For Businesses',
        icon: 'business',
        expanded: false,
        children: [
          {
            id: 'biz-advertising',
            label: 'Advertising',
            icon: 'star',
            route: '/advertising',
          },
          {
            id: 'biz-recruiting-services',
            label: 'Recruiting Services',
            icon: 'recruiting-service',
            route: '/recruiting-services',
          },
          {
            id: 'biz-whitelabel',
            label: 'Whitelabel',
            icon: 'colorPalette',
            route: '/whitelabel',
          },
          {
            id: 'biz-nil',
            label: 'NIL',
            icon: 'creditCard',
            route: '/nil',
          },
          {
            id: 'biz-partnerships',
            label: 'Partnerships',
            icon: 'handshake',
            route: '/partnerships',
          },
        ],
      },
      {
        id: 'sports',
        label: 'Sports',
        icon: 'trophy',
        expanded: false,
        children: SPORT_CHILD_ITEMS as DesktopSidebarItem[],
      },
    ],
  },

  // ── Footer (Usage, Settings, Help Center) ──
  {
    id: 'footer',
    items: [
      { id: 'usage', label: 'Usage', icon: 'creditCard', route: '/usage' },
      { id: 'settings', label: 'Settings', icon: 'settings', action: 'settings' as const },
      { id: 'help', label: 'Help Center', icon: 'help', route: '/help-center' },
    ],
  },

  // ── Follow Us ──
  {
    id: 'follow-us',
    label: 'Follow Us',
    items: FOLLOW_US_ITEMS,
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
const MOBILE_FOOTER_TABS: FooterTabItem[] = CENTERED_CREATE_FOOTER_TABS;

@Component({
  selector: 'app-web-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    NxtDesktopSidebarComponent,
    NxtHeaderComponent,
    NxtMobileFooterComponent,
    NxtMobileHeaderComponent,
    NxtMobileSidebarComponent,
    // NotificationPopoverComponent is listed here so Angular resolves the selector,
    // but since it's only used inside a @defer block, the compiler automatically
    // splits it + its dependency tree into a separate lazy chunk.
    NotificationPopoverComponent,
  ],
  template: `
    <!--
      2026 A+ SSR-Safe Shell (YouTube / LinkedIn / Twitter Pattern)
      ──────────────────────────────────────────────────────────────
      GOLD STANDARD: Every navigation component is ALWAYS in the DOM.
      CSS media queries — not @if blocks — control which set is visible.

      Why this is the professional standard:
      • SSR HTML is identical to hydrated HTML → zero DOM mutations on load
      • Mobile nav appears on FIRST paint, not after hydration (~200-500ms)
      • Desktop nav appears on FIRST paint, not after hydration
      • Page content is always visible, always indexable (SEO perfect)
      • Zero CLS (Cumulative Layout Shift) — no layout changes after load
      • CSS is instant; JavaScript hydration is asynchronous

      Auth State Transfer (2026):
      • ServerAuthService reads __session cookie during APP_INITIALIZER
      • SSR_AUTH_STATE carries resolved user → AuthFlowService on server
      • TransferState serializes auth state into HTML payload
      • On hydration, AuthFlowService seeds from TransferState immediately
      • Firebase Auth re-initializes in background and confirms state
      • Result: authenticated users NEVER see "Sign In" flash on page load

      Components manage their own internal visibility:
      • nxt1-mobile-sidebar: transform/visibility controlled by [open] input
      • app-notification-popover: controlled by [isOpen] input
      • nxt1-mobile-footer: auth-gated (@if) — auth state is NOW consistent
        between SSR and client (both render authenticated when cookie exists),
        so no risk of hydration mismatch
    -->
    <div class="shell">
      <!-- DESKTOP: Fixed Sidebar — CSS-hidden below 768px -->
      <nxt1-desktop-sidebar
        [sections]="sidebarSections()"
        [user]="sidebarUserData()"
        [config]="sidebarConfig()"
        (itemSelect)="onSidebarItemSelect($event)"
        (userClick)="onSidebarUserClick($event)"
        (logoClick)="onLogoClick()"
        (collapseChange)="onSidebarCollapseChange($event)"
      />

      <!-- MOBILE: Top Header Bar — CSS-hidden at 768px+ -->
      <nxt1-mobile-header
        [config]="mobileHeaderConfig()"
        [user]="mobileHeaderUserData()"
        (menuClick)="onMobileMenuToggle()"
        (backClick)="onMobileBackClick()"
        (logoClick)="onLogoClick()"
        (searchClick)="onMobileSearchClick()"
        (notificationsClick)="onNotificationsClick()"
        (userClick)="onMobileUserClick()"
      />

      <!-- MOBILE: Slide-Out Drawer — CSS-hidden at 768px+, self-manages open/close -->
      <nxt1-mobile-sidebar
        [sections]="mobileSidebarSections()"
        [user]="sidebarUserData()"
        [config]="mobileSidebarConfig()"
        [open]="mobileSidebarOpen()"
        (itemSelect)="onMobileSidebarItemSelect($event)"
        (userClick)="onMobileSidebarUserClick($event)"
        (logoClick)="onLogoClick()"
        (closeRequest)="closeMobileSidebar()"
      />

      <!-- MAIN CONTENT — ALWAYS VISIBLE, ALWAYS INDEXABLE -->
      <div class="shell__main">
        <!-- DESKTOP: Header bar — CSS-hidden below 768px -->
        <nxt1-header
          [items]="headerItems"
          [user]="headerUserData()"
          [isAuthenticated]="topNavIsAuthenticated()"
          [userMenuItems]="userMenuItems"
          [config]="headerConfig()"
          [searchResults]="headerSearchResults()"
          [searchResultsLoading]="headerSearchLoading()"
          [searchRecentSearches]="headerRecentSearches()"
          [searchTrendingSearches]="headerTrendingSearches()"
          (navigate)="onHeaderNavigate($event)"
          (userMenuAction)="onUserMenuAction($event)"
          (notificationsClick)="onNotificationsClick()"
          (createClick)="onCreateClick()"
          (logoClick)="onLogoClick()"
          (searchInputChange)="onHeaderSearchInput($event)"
          (search)="onHeaderSearchSubmit($event)"
          (searchSeeAll)="onHeaderSeeAllResults($event)"
          (clearRecentSearchesClick)="onClearRecentSearches()"
        />

        <!-- DESKTOP: Notification Popover — Lazy-loaded via @defer -->
        <!-- Component + its dependency tree (ActivityListComponent, etc.)
             are only bundled when the user opens the notification panel.
             This removes ~610 lines of component code from the eager shell chunk. -->
        @defer (when notificationPopoverOpen()) {
          <app-notification-popover
            [isOpen]="notificationPopoverOpen()"
            (closePopover)="closeNotificationPopover()"
          />
        }

        <!-- PAGE CONTENT — Never gated by @if or display:none -->
        <main class="shell__content" [class.shell__content--has-footer]="showMobileFooter()">
          <router-outlet />
        </main>
      </div>

      <!-- MOBILE: Bottom Tab Bar — CSS-hidden at 768px+, auth-gated -->
      @if (showMobileFooter()) {
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
        --shell-content-bg: var(--nxt1-color-bg-primary);
        --shell-content-padding-x: 0px;

        /*
         * Fixed positioning takes the shell OUT of document flow.
         * Body has zero scrollable content → no second scrollbar.
         * Same pattern as YouTube / Twitter / LinkedIn app shells.
         */
        position: fixed;
        inset: 0;
        display: flex;
        overflow: hidden;
        background: var(--shell-bg);
        z-index: 1;
      }

      /* ============================================
         SHELL CONTAINER
         Default: row layout (desktop/tablet).
         Media query overrides to column (mobile).
         100% CSS-driven — no JS class bindings.
         ============================================ */
      .shell {
        display: flex;
        flex-direction: row;
        width: 100%;
        height: 100%;
      }

      /* ============================================
         DESKTOP SIDEBAR
         ============================================ */
      nxt1-desktop-sidebar {
        flex-shrink: 0;
        z-index: 50;
      }

      /* ============================================
         MAIN CONTENT AREA
         Always in the DOM — never inside an @if block.
         ============================================ */
      .shell__main {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0; /* Prevent flex overflow */
        min-height: 0; /* Allow flex shrinking for overflow scroll */
      }

      /* ============================================
         HEADER (Desktop)
         ============================================ */
      nxt1-header {
        flex-shrink: 0;
        z-index: 40;
      }

      /* ============================================
         NOTIFICATION POPOVER (Desktop)
         ============================================ */
      app-notification-popover {
        z-index: 45;
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
        padding-top: calc(var(--nxt1-spacing-4, 1rem) + 7px);
        padding-inline: var(--shell-content-padding-x);

        /* Flex column so full-bleed pages (profile, explore) can stretch
           to fill the visible area with flex:1 — YouTube/Twitter pattern */
        display: flex;
        flex-direction: column;
      }

      /* ============================================
         MOBILE HEADER (sticky)
         ============================================ */
      nxt1-mobile-header {
        flex-shrink: 0;
        z-index: 40;
      }

      /* ============================================
         MOBILE SIDEBAR (overlay drawer)
         Component manages its own transform/visibility.
         ============================================ */
      nxt1-mobile-sidebar {
        /* positioned by component — no layout styles needed */
      }

      /* ============================================
         MOBILE FOOTER
         ============================================ */
      nxt1-mobile-footer {
        --nxt1-footer-bottom: 0;
        --nxt1-footer-left: 0;
        --nxt1-footer-right: 0;
        --nxt1-z-index-footer: 1000;
      }

      /* ============================================
         RESPONSIVE LAYOUT — 100% CSS-Driven
         ──────────────────────────────────────────
         YouTube / LinkedIn / Twitter Pattern:
         Both desktop and mobile nav are ALWAYS in the DOM.
         CSS media queries toggle visibility instantly.
         No JavaScript needed for initial layout correctness.

         Results:
         • Zero hydration mismatch (SSR DOM ≡ client DOM)
         • Zero layout shift on any viewport
         • All nav visible on first paint (no waiting for JS)
         • Page content always visible and indexable
         ============================================ */

      /* ─── MOBILE (<768px) ─── */
      @media (max-width: 767.98px) {
        /* Switch to vertical stack */
        .shell {
          flex-direction: column;
        }

        /* Hide desktop navigation chrome */
        nxt1-desktop-sidebar,
        nxt1-header,
        app-notification-popover {
          display: none !important;
        }

        /* Main fills remaining height below mobile header */
        .shell__main {
          flex: 1;
          min-height: 0;
        }

        /* Footer padding when footer is present */
        .shell__content--has-footer {
          padding-bottom: var(--shell-footer-height);
        }
      }

      /* ─── DESKTOP / TABLET (≥768px) ─── */
      @media (min-width: 768px) {
        /* Hide mobile navigation chrome */
        nxt1-mobile-header,
        nxt1-mobile-sidebar,
        nxt1-mobile-footer {
          display: none !important;
        }

        /* Ensure no footer padding on desktop */
        .shell__content--has-footer {
          padding-bottom: 0;
        }
      }

      /* ─── TABLET (768–1279px) ─── */
      @media (min-width: 768px) and (max-width: 1279px) {
        :host {
          --shell-sidebar-width: var(--shell-sidebar-collapsed-width);
          --shell-content-padding-x: 24px;
        }
      }

      /* ─── DESKTOP (≥1280px) ─── */
      @media (min-width: 1280px) {
        :host {
          --shell-sidebar-width: 256px;
          --shell-content-padding-x: 32px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebShellComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly platform = inject(NxtPlatformService);
  private readonly authFlow = inject(AuthFlowService);
  private readonly logger = inject(NxtLoggingService).child('WebShellComponent');
  private readonly destroyRef = inject(DestroyRef);
  private readonly scrollService = inject(NxtScrollService);
  private readonly badgeCount = inject(BadgeCountService);
  private readonly notificationState = inject(NxtNotificationStateService);
  private readonly authModal = inject(AuthModalService);
  private readonly elementRef = inject(ElementRef);
  private readonly exploreService = inject(ExploreService);

  /** Debounce timer for search input */
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Releases top-nav hydration lock shortly after first client paint */
  private topNavUnlockTimer: ReturnType<typeof setTimeout> | null = null;

  // ============================================
  // SIDEBAR CONFIGURATION (Desktop/Tablet)
  // ============================================

  /** Base sidebar sections — auth-aware (Profile → /super-profiles when logged out) */
  private readonly _baseSidebarSections = computed(() =>
    this.authFlow.isAuthenticated() ? DESKTOP_SIDEBAR_SECTIONS : WEB_LOGGED_OUT_SIDEBAR_SECTIONS
  );

  /** Desktop sidebar sections — computed from auth state */
  readonly sidebarSections = this._baseSidebarSections;

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
      profileImg?: string;
      unicode?: string;
    } | null;

    if (!user) return null;

    const name = user.displayName || user.email?.split('@')[0] || 'User';

    return {
      name,
      avatarUrl: user.profileImg,
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
  readonly headerConfig = computed<TopNavConfig>(() => {
    return createTopNavConfig({
      variant: 'default',
      showLogo: false, // Sidebar has logo
      showSearch: true,
      showNotifications: true,
      notificationCount: this.badgeCount.totalUnread(),
      sticky: true,
      hideOnScroll: false,
      bordered: false,
    });
  });

  /** Header user data */
  readonly headerUserData = computed<TopNavUserData | null>(() => {
    const user = this.authFlow.user() as {
      displayName?: string;
      email?: string;
      profileImg?: string;
    } | null;

    // Fall back to firebaseUser if backend profile hasn't synced yet
    const firebaseUser = this.authFlow.firebaseUser();

    if (!user && !firebaseUser) return null;

    return {
      name:
        user?.displayName ||
        user?.email?.split('@')[0] ||
        firebaseUser?.displayName ||
        firebaseUser?.email?.split('@')[0] ||
        'User',
      email: user?.email || firebaseUser?.email || undefined,
      avatarUrl: user?.profileImg || firebaseUser?.photoURL || undefined,
      verified: false,
      roleBadge: undefined,
    };
  });

  /**
   * Hydration lock for the desktop top-nav isAuthenticated input.
   *
   * Freezes the Sign In / user-menu toggle for ~300 ms after the first client
   * paint while Firebase Auth and the SSR→client handover settle. This stops
   * the brief "Sign In" button flash without touching user-data bindings
   * (avatar, name) which are safe to update live.
   */
  private readonly _topNavHydrationLocked = signal(isPlatformBrowser(this.platformId));
  private readonly _frozenTopNavIsAuthenticated = signal(this.authFlow.isAuthenticated());

  /** Stable isAuthenticated input for desktop header during hydration */
  readonly topNavIsAuthenticated = computed(() =>
    this._topNavHydrationLocked() ? this._frozenTopNavIsAuthenticated() : this.isAuthenticated()
  );

  // ============================================
  // HEADER SEARCH RESULTS (Global Search Dropdown)
  // ============================================

  /** Search results for the header dropdown (from shared ExploreService) */
  readonly headerSearchResults = computed(() => this.exploreService.items());

  /** Whether the header search is loading */
  readonly headerSearchLoading = computed(() => this.exploreService.isLoading());

  /** Recent searches for the header dropdown */
  readonly headerRecentSearches = computed(() => this.exploreService.recentSearches());

  /** Trending searches for the header dropdown */
  readonly headerTrendingSearches = computed(() => this.exploreService.trendingSearches());

  // ============================================
  // MOBILE FOOTER CONFIGURATION
  // ============================================

  /** Mobile footer tabs */
  readonly footerTabs = MOBILE_FOOTER_TABS;

  /** Mobile footer configuration */
  readonly footerConfig = computed<FooterConfig>(() => ({
    showLabels: true,
    enableHaptics: false, // Web doesn't have haptics
    variant: 'centeredCreate',
    hidden: false,
    translucent: false,
    glass: false, // Solid opaque background (glass causes see-through)
    indicatorStyle: 'none',
    scrollToTopOnSameTap: true,
  }));

  // ============================================
  // MOBILE HEADER CONFIGURATION (YouTube-style top bar)
  // ============================================

  /** Whether the current route should show a back arrow instead of hamburger */
  private readonly _showMobileBack = computed(() => {
    const route = this._currentRoute();
    return route.startsWith('/profile');
  });

  /** Mobile header configuration — route-aware (back arrow on profile pages) */
  readonly mobileHeaderConfig = computed<MobileHeaderConfig>(() => {
    return createMobileHeaderConfig({
      showBack: this._showMobileBack(),
      showLogo: true,
      showSearch: true,
      showNotifications: true,
      notificationCount: this.badgeCount.totalUnread(),
      showSignIn: true,
      showMore: false,
      sticky: true,
      hideOnScroll: false,
      bordered: true,
      variant: 'default',
    });
  });

  /** Mobile header user data */
  readonly mobileHeaderUserData = computed<MobileHeaderUserData | null>(() => {
    const user = this.authFlow.user() as {
      displayName?: string;
      email?: string;
      profileImg?: string;
    } | null;

    // Fall back to firebaseUser if backend profile hasn't synced yet
    const firebaseUser = this.authFlow.firebaseUser();

    if (!user && !firebaseUser) return null;

    const name =
      user?.displayName ||
      user?.email?.split('@')[0] ||
      firebaseUser?.displayName ||
      firebaseUser?.email?.split('@')[0] ||
      'User';

    return {
      name,
      avatarUrl: user?.profileImg || firebaseUser?.photoURL || undefined,
      initials: this.getInitials(name),
    };
  });

  // ============================================
  // MOBILE SIDEBAR CONFIGURATION (YouTube-style drawer)
  // ============================================

  /**
   * Mobile sidebar sections — auth-aware, same as desktop but
   * filtered to remove the "follow-us" section (social links) for mobile.
   */
  readonly mobileSidebarSections = computed(() =>
    this._baseSidebarSections().filter((s) => s.id !== 'follow-us')
  );

  /** Mobile sidebar configuration */
  readonly mobileSidebarConfig = computed<MobileSidebarConfig>(() => {
    return createMobileSidebarConfig({
      showLogo: true,
      showUserSection: true,
      showThemeToggle: true,
      showSignIn: true,
      showExplore: false,
      variant: 'default',
      width: '280px',
    });
  });

  // ============================================
  // STATE
  // ============================================

  /** Current route for active state detection */
  private readonly _currentRoute = signal('/explore');

  /** Active tab ID for mobile footer */
  private readonly _activeTabId = signal<string | null>('explore');
  readonly activeTabId = computed(() => this._activeTabId());

  /** Sidebar collapsed state (persisted) */
  private readonly _sidebarCollapsed = signal(false);

  /** Whether the mobile sidebar drawer is open */
  private readonly _mobileSidebarOpen = signal(false);
  readonly mobileSidebarOpen = computed(() => this._mobileSidebarOpen());

  /** Whether the notification popover is open (via global state service) */
  readonly notificationPopoverOpen = computed(() => this.notificationState.isOpen());

  /** Whether we're in mobile view (shows footer instead of sidebar) */
  readonly isMobileView = computed(() => {
    const viewport = this.platform.viewport();
    return viewport.width < SIDEBAR_BREAKPOINTS.MOBILE;
  });

  /** Auth state for shell-level UI controls (header, footer, guards). */
  readonly isAuthenticated = computed(() => this.authFlow.isAuthenticated());

  /**
   * Show mobile footer when authenticated.
   * CSS media queries handle viewport visibility (hidden at ≥768px).
   * Auth state is now consistent between SSR and client — both render
   * authenticated when __session cookie exists (via SSR auth state transfer).
   * The @if guard won't cause hydration mismatch.
   */
  readonly showMobileFooter = computed(() => this.isAuthenticated());

  // ============================================
  // LIFECYCLE
  // ============================================

  constructor() {
    this.setupRouteTracking();
    this.loadSidebarState();

    // Freeze desktop top-nav auth UI briefly after hydration to avoid
    // visible flicker while client auth handover settles.
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) {
        this._topNavHydrationLocked.set(false);
        return;
      }

      this.topNavUnlockTimer = setTimeout(() => {
        this._topNavHydrationLocked.set(false);
        this.topNavUnlockTimer = null;
      }, 300);
    });

    // Clean up debounce timer on destroy to prevent memory leaks
    this.destroyRef.onDestroy(() => {
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = null;
      }

      if (this.topNavUnlockTimer) {
        clearTimeout(this.topNavUnlockTimer);
        this.topNavUnlockTimer = null;
      }
    });
  }

  // ============================================
  // SIDEBAR HANDLERS (Desktop/Tablet)
  // ============================================

  /**
   * Handle sidebar item selection.
   *
   * Auth-gated items (Settings) use `action` to prevent the sidebar from
   * navigating directly. Instead, the auth modal is presented first.
   * On success the user is routed to the intended page.
   */
  async onSidebarItemSelect(event: DesktopSidebarSelectEvent): Promise<void> {
    const { item } = event;

    // Handle sign-out
    if (item.action === 'logout') {
      this.signOut();
      return;
    }

    // Auth-gated sidebar items — show sign-in modal for logged-out users
    if (item.action === 'settings' && item.route) {
      const authenticated = await this.requireAuthentication(`access ${item.label.toLowerCase()}`);
      if (!authenticated) return;
      this.router.navigate([item.route]);
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
  // MOBILE HEADER HANDLERS
  // ============================================

  /**
   * Toggle mobile sidebar drawer open/close
   */
  onMobileMenuToggle(): void {
    this._mobileSidebarOpen.update((open) => !open);
    this.logger.debug('Mobile sidebar toggled', { open: this._mobileSidebarOpen() });
  }

  /**
   * Navigate back when back arrow in mobile header is clicked
   */
  onMobileBackClick(): void {
    this.location.back();
  }

  /**
   * Close the mobile sidebar drawer
   */
  closeMobileSidebar(): void {
    this._mobileSidebarOpen.set(false);
  }

  /**
   * Handle mobile search button click.
   * Navigate to explore page on mobile.
   */
  onMobileSearchClick(): void {
    this.router.navigate(['/explore']);
  }

  /**
   * Handle mobile user avatar click.
   * Navigate to settings/account page.
   */
  onMobileUserClick(): void {
    this.router.navigate(['/settings/account']);
  }

  // ============================================
  // MOBILE SIDEBAR HANDLERS
  // ============================================

  /**
   * Handle mobile sidebar item selection
   */
  async onMobileSidebarItemSelect(event: MobileSidebarSelectEvent): Promise<void> {
    const { item } = event;

    // Handle sign-out
    if (item.action === 'logout') {
      this.signOut();
      return;
    }

    // Auth-gated sidebar items — show sign-in modal for logged-out users
    if (item.action === 'settings' && item.route) {
      const authenticated = await this.requireAuthentication(`access ${item.label.toLowerCase()}`);
      if (!authenticated) return;
      this.router.navigate([item.route]);
      return;
    }

    this.logger.debug('Mobile sidebar item selected', { itemId: item.id });
  }

  /**
   * Handle mobile sidebar user section click
   */
  onMobileSidebarUserClick(_event: Event): void {
    this.router.navigate(['/profile']);
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
   * Handle header search input — debounced instant search.
   * Calls ExploreService.search() after 300ms of no typing.
   */
  onHeaderSearchInput(query: string): void {
    // Clear previous debounce
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    const trimmed = query.trim();

    if (trimmed.length < 2) {
      // Clear results when query is too short
      this.exploreService.clearSearch();
      return;
    }

    // Debounce search requests (300ms)
    this.searchDebounceTimer = setTimeout(() => {
      void this.exploreService.search(trimmed);
    }, 300);
  }

  /**
   * Handle header search submit (Enter key).
   * Navigate to /explore with query param.
   */
  onHeaderSearchSubmit(event: TopNavSearchSubmitEvent): void {
    const query = event.query.trim();
    if (query) {
      void this.router.navigate(['/explore'], { queryParams: { q: query } });
    }
  }

  /**
   * Handle "See all results" click from search dropdown.
   * Navigate to /explore with query param.
   */
  onHeaderSeeAllResults(query: string): void {
    void this.router.navigate(['/explore'], { queryParams: { q: query } });
  }

  /**
   * Clear recent searches in ExploreService.
   */
  onClearRecentSearches(): void {
    this.exploreService.clearRecentSearches();
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

    // Target the shell's own scroll container (.shell__content)
    const scrollEl = this.getShellContentElement();
    if (scrollEl) {
      await this.scrollService.scrollToTop({
        target: 'custom',
        scrollElement: scrollEl,
        behavior: 'smooth',
        enableHaptics: false,
      });
    }
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
   * Handle notifications bell click.
   *
   * Professional "Sign in to continue" pattern (Twitter/X, Reddit, Instagram):
   * - Logged in → toggle notification popover (desktop) or navigate (mobile)
   * - Logged out → present auth modal with contextual messaging
   *   On successful auth → immediately show notifications
   */
  async onNotificationsClick(): Promise<void> {
    // Gated feature: require authentication
    const authenticated = await this.requireAuthentication('view your notifications');
    if (!authenticated) return;

    // Authenticated: show notifications
    if (this.isMobileView()) {
      this.router.navigate(['/activity']);
    } else {
      this.notificationState.toggle();
    }
  }

  /**
   * Close the notification popover
   */
  closeNotificationPopover(): void {
    this.notificationState.close();
  }

  /**
   * Handle create button click.
   * Gated behind auth — logged out users see the auth modal first.
   */
  async onCreateClick(): Promise<void> {
    const authenticated = await this.requireAuthentication('create a post');
    if (!authenticated) return;

    this.router.navigate(['/create']);
  }

  /**
   * Handle logo click with auth-aware destination.
   * Authenticated users go to /explore, guests go to root landing (/).
   */
  onLogoClick(): void {
    if (this.authFlow.isAuthenticated()) {
      this.router.navigate(['/explore']);
      return;
    }

    this.router.navigate(['/']);
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

        // Scroll shell content to top on navigation (replaces window.scrollTo)
        const scrollEl = this.getShellContentElement();
        if (scrollEl) {
          scrollEl.scrollTo({ top: 0, behavior: 'instant' });
        }
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
   * Get the shell's main scroll container element (.shell__content).
   * Used to programmatically scroll on navigation and scroll-to-top events.
   */
  private getShellContentElement(): HTMLElement | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    return this.elementRef.nativeElement.querySelector('.shell__content') ?? null;
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
      void this.router.navigate(['/auth']);
    } catch (err) {
      this.logger.error('Sign out failed', err);
    }
  }

  /**
   * Require authentication before proceeding.
   *
   * Presents the "Sign in to continue" modal when the user is logged out.
   * Returns `true` if already authenticated or if the user successfully signs in.
   * Returns `false` if the user dismisses the modal without authenticating.
   *
   * Follows the same production pattern used by the notification bell and
   * create button (Twitter/X, Reddit, Instagram style).
   */
  private async requireAuthentication(featureDescription: string): Promise<boolean> {
    if (this.authFlow.isAuthenticated()) return true;

    const result = await this.authModal.presentSignInToContinue(featureDescription, {
      onGoogle: () => this.authFlow.signInWithGoogle(),
      onApple: () => this.authFlow.signInWithApple(),
      onEmailAuth: (mode, data) =>
        mode === 'login'
          ? this.authFlow.signInWithEmail(data)
          : this.authFlow.signUpWithEmail(data),
      onForgotPassword: () => this.router.navigate(['/auth/forgot-password']),
    });

    return result.authenticated;
  }
}

// Re-export with old name for backwards compatibility during migration
export { WebShellComponent as MainLayoutComponent };
