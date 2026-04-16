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
  type TopNavUserMenuItem,
  type TopNavConfig,
  type TopNavSelectEvent,
  type TopNavUserMenuEvent,
  createTopNavConfig,
} from '@nxt1/ui/components/top-nav';
import {
  NxtMobileFooterComponent,
  type FooterTabItem,
  type FooterTabSelectEvent,
  type FooterScrollToTopEvent,
  type FooterConfig,
  buildDynamicFooterTabs,
  updateTabBadge,
  createFooterConfig,
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
  type MobileSidebarUserData,
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
// ── Activity (for mark-all-read on /activity route) ──
import { ActivityService } from '@nxt1/ui/activity';
import type { TopNavSearchSubmitEvent } from '@nxt1/ui/components/top-nav';
// ── Usage (for mobile billing actions) ──
import { UsageService, UsageHelpContentComponent } from '@nxt1/ui/usage';
import { AgentXControlPanelComponent } from '@nxt1/ui/agent-x';

// ── Invite ──
import { InviteShellComponent } from '@nxt1/ui/invite';
import { NxtOverlayService } from '@nxt1/ui/components/overlay';
// ── App-level imports ──
import { AuthFlowService } from '../services/auth';

import { BadgeCountService, ProfilePageActionsService } from '../services';
import { NotificationPopoverComponent } from '../../features/activity/components';
import {
  DEFAULT_SOCIAL_LINKS,
  DEFAULT_SPORTS,
  formatSportDisplayName,
  normalizeSportKey,
  buildUserDisplayContext,
} from '@nxt1/core';
import type { SidenavSportProfile, UserDisplayInput, UserDisplayFallback } from '@nxt1/core';

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
      { id: 'agent', label: 'Agent X', icon: 'agent-x', route: '/agent' },
      {
        id: 'invite-team',
        label: 'Invite team',
        icon: 'plusCircle',
        action: 'invite-team',
      },
    ],
  },
  {
    id: 'account',
    items: [
      { id: 'usage', label: 'Billing & Usage', icon: 'creditCard', route: '/usage' },
      { id: 'help', label: 'Help Center', icon: 'help', route: '/help-center' },
      { id: 'settings', label: 'Settings', icon: 'settings', route: '/settings' },
    ],
  },
  {
    id: 'follow-us',
    label: 'Follow Us',
    items: FOLLOW_US_ITEMS,
  },
];

/**
 * Logged-out variant — Streamlined sidebar for unauthenticated users.
 * Desktop keeps persona navigation in the top header bar, while the
 * mobile web sidebar mirrors those routes for signed-out users.
 * Auth-required items (Settings) use `action` instead of direct navigation
 * so the web-shell can present the sign-in modal before routing.
 * Named WEB_* to avoid shadowing the @nxt1/ui LOGGED_OUT_SIDEBAR_SECTIONS export.
 */
const WEB_LOGGED_OUT_SIDEBAR_SECTIONS: readonly DesktopSidebarSection[] = [
  {
    id: 'main',
    items: [{ id: 'agent', label: 'Agent X', icon: 'agent-x', route: '/agent' }],
  },
  {
    id: 'follow-us',
    label: 'Follow Us',
    items: FOLLOW_US_ITEMS,
  },
];

/**
 * Desktop header navigation items — logged-out only.
 * Shows Athletes, Programs, and Sports dropdowns in the top bar.
 * When logged in, the header only shows: Search, Notifications, User Menu.
 */
const LOGGED_OUT_HEADER_NAV_ITEMS: TopNavItem[] = [
  {
    id: 'nav-programs',
    label: 'Programs',
    icon: 'users',
    children: [
      { id: 'team-platform', label: 'Team Platform', icon: 'users', route: '/team-platform' },
      { id: 'team-ai', label: 'AI For Coaches', icon: 'agent-x', route: '/ai-coaches' },
      { id: 'team-admin', label: 'Administration', icon: 'clipboard', route: '/team-admin' },
      { id: 'team-content', label: 'Content Creation', icon: 'videocam', route: '/team-content' },
      { id: 'team-website', label: 'Team Website', icon: 'link', route: '/team-website' },
      { id: 'team-management', label: 'Management', icon: 'settings', route: '/team-management' },
      {
        id: 'team-recruiting',
        label: 'Discovery',
        icon: 'graduationCap',
        route: '/team-recruiting',
      },
    ],
  },
  {
    id: 'nav-athletes',
    label: 'Athletes',
    icon: 'athlete',
    children: [
      { id: 'athlete-platform', label: 'Athlete Platform', icon: 'athlete', route: '/athletes' },
      { id: 'athlete-profiles', label: 'Super Profile', icon: 'link', route: '/super-profiles' },
      { id: 'athlete-ai', label: 'AI for Athletes', icon: 'agent-x', route: '/ai-athletes' },
      {
        id: 'athlete-recruiting',
        label: 'Discovery',
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
      { id: 'athlete-nil', label: 'NIL', icon: 'creditCard', route: '/nil' },
    ],
  },
  {
    id: 'nav-sports',
    label: 'Sports',
    icon: 'trophy',
    children: SPORT_CHILD_ITEMS.map((sport) => ({
      id: sport.id,
      label: sport.label,
      icon: sport.icon,
      route: sport.route,
    })),
  },
];

const LOGGED_OUT_MOBILE_SIDEBAR_ITEMS: readonly DesktopSidebarItem[] =
  LOGGED_OUT_HEADER_NAV_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon ?? 'link',
    route: item.route,
    href: item.href,
    ariaLabel: item.ariaLabel,
    children: item.children?.map((child) => ({
      id: child.id,
      label: child.label,
      icon: child.icon ?? 'link',
      route: child.route,
      href: child.href,
      ariaLabel: child.ariaLabel,
      disabled: child.disabled,
    })),
    disabled: item.disabled,
  }));

/**
 * User menu dropdown items — profile/account meta only.
 * Navigation items (Usage, Settings, Help) live in the sidebar.
 */
const USER_MENU_ITEMS: TopNavUserMenuItem[] = [];

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
        (editClick)="onMobileProfileEditClick()"
        (moreClick)="onMobileProfileMoreClick()"
        (markAllReadClick)="onMobileActivityMarkAllReadClick()"
        (filterClick)="onMobileExploreFilterClick()"
        (helpClick)="onMobileUsageHelpClick()"
        (budgetClick)="onMobileUsageBudgetClick()"
        (userClick)="onMobileUserClick()"
      />

      <!-- MOBILE: Slide-Out Drawer — CSS-hidden at 768px+, self-manages open/close -->
      <nxt1-mobile-sidebar
        [sections]="mobileSidebarSections()"
        [user]="mobileSidebarUserData()"
        [config]="mobileSidebarConfig()"
        [open]="mobileSidebarOpen()"
        (itemSelect)="onMobileSidebarItemSelect($event)"
        (userClick)="onMobileSidebarUserClick($event)"
        (logoClick)="onLogoClick()"
        (closeRequest)="closeMobileSidebar()"
        (sportProfileSelect)="onMobileSidebarSportSelect($event)"
        (addSportClick)="onMobileSidebarAddSport()"
      />

      <!-- MAIN CONTENT — ALWAYS VISIBLE, ALWAYS INDEXABLE -->
      <div class="shell__main">
        <!-- DESKTOP: Header bar — CSS-hidden below 768px -->
        <nxt1-header
          [items]="headerItems()"
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
          (userClick)="onHeaderUserClick($event)"
          (addSportClick)="onAddSportClick()"
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
          [tabs]="footerTabs()"
          [activeTabId]="activeTabId()"
          [config]="footerConfig()"
          [profileAvatarSrc]="sidebarUserData()?.profileImg"
          [profileAvatarName]="sidebarUserData()?.name"
          [profileAvatarIsTeam]="headerUserData()?.isTeamRole ?? false"
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
        --shell-content-padding-top: calc(var(--nxt1-spacing-4, 1rem) + 7px);

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
        scrollbar-gutter: stable;
        background: var(--shell-content-bg);
        min-height: 0; /* Critical for flex overflow scrolling */
        padding-top: var(--shell-content-padding-top);
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
        --nxt1-footer-bottom: 28px;
        --nxt1-footer-left: 16px;
        --nxt1-footer-right: 16px;
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

        /* No top gap on mobile — mobile nav bar provides the top boundary */
        :host {
          --shell-content-padding-top: 0px;
          /* Footer removed: pull input bar + coordinator pills to the bottom edge.
             Negative value cancels the built-in pill-height + gap offsets so
             the input lands ~16px from the bottom instead of ~60px. */
          --nxt1-footer-bottom: -40px;
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
  private readonly profileActions = inject(ProfilePageActionsService);
  private readonly inviteOverlay = inject(NxtOverlayService);
  private readonly notificationState = inject(NxtNotificationStateService);
  private readonly activityService = inject(ActivityService);
  private readonly authModal = inject(AuthModalService);
  private readonly elementRef = inject(ElementRef);
  private readonly usageService = inject(UsageService);

  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ============================================
  // SIDEBAR CONFIGURATION (Desktop/Tablet)
  // ============================================

  /** Base sidebar sections — auth-aware (Profile → /super-profiles when logged out) */
  private readonly _baseSidebarSections = computed(() => {
    return this.authFlow.isAuthenticated()
      ? DESKTOP_SIDEBAR_SECTIONS
      : WEB_LOGGED_OUT_SIDEBAR_SECTIONS;
  });

  /** Desktop sidebar sections — computed from auth state */
  readonly sidebarSections = this._baseSidebarSections;

  /** Sidebar configuration - responsive based on viewport */
  readonly sidebarConfig = computed<DesktopSidebarConfig>(() => {
    const viewport = this.platform.viewport();
    const isTablet =
      viewport.width >= SIDEBAR_BREAKPOINTS.MOBILE && viewport.width < SIDEBAR_BREAKPOINTS.DESKTOP;

    // Show Sign In when auth is fully resolved and no user is present.
    // isAuthReady() waits for Firebase to confirm — prevents premature "Sign In" flash.
    const showSignIn = this.authFlow.isAuthReady() && !this.isAuthenticated();

    return createDesktopSidebarConfig({
      collapsed: isTablet || this._sidebarCollapsed(),
      expandOnHover: false, // Only expand/collapse via hamburger menu click
      showLogo: true,
      showUserSection: false, // User profile is in header (2026 pattern)
      showSignIn, // Hidden until auth resolves, then show only if not logged in
      showThemeToggle: true,
      persistState: true,
      variant: 'default',
      bordered: false,
    });
  });

  // ============================================
  // USER DISPLAY CONTEXT (Single Source of Truth)
  // ============================================

  /**
   * Centralized user display context — all 4 user data computeds
   * (sidebar, mobileSidebar, header, mobileHeader) derive from this.
   * Built by the pure `buildUserDisplayContext()` function in @nxt1/core.
   */
  private readonly _userDisplayContext = computed(() => {
    const user = this.authFlow.user() as UserDisplayInput | null;
    const firebaseUser = this.authFlow.firebaseUser();
    const fallback: UserDisplayFallback | null = firebaseUser
      ? { displayName: firebaseUser.displayName, email: firebaseUser.email }
      : null;

    return buildUserDisplayContext(user, fallback);
  });

  /** Sidebar user data — team-role aware */
  readonly sidebarUserData = computed<DesktopSidebarUserData | null>(() => {
    // Return null during auth resolution to prevent premature rendering
    if (!this.authFlow.isAuthReady()) return null;

    const ctx = this._userDisplayContext();
    if (!ctx) return null;

    return {
      name: ctx.name,
      profileImg: ctx.profileImg,
      initials: ctx.initials,
      handle: ctx.handle,
      verified: ctx.verified,
      isTeamRole: ctx.isTeamRole,
    };
  });

  /** Mobile sidebar user data — team-role aware, includes sport profiles for the sport switcher */
  readonly mobileSidebarUserData = computed<MobileSidebarUserData | null>(() => {
    const ctx = this._userDisplayContext();
    if (!ctx) return null;

    return {
      name: ctx.name,
      profileImg: ctx.profileImg,
      initials: ctx.initials,
      handle: ctx.handle,
      verified: ctx.verified,
      sportLabel: ctx.sportLabel,
      sportProfiles: ctx.sportProfiles as SidenavSportProfile[],
      switcherTitle: ctx.switcherTitle,
      isTeamRole: ctx.isTeamRole,
      actionLabel: ctx.actionLabel,
    };
  });

  // ============================================
  // HEADER CONFIGURATION (Desktop - Minimal)
  // ============================================

  /** Desktop header items — auth-aware.
   * Logged out: Athletes, Programs, Sports dropdowns.
   * Logged in: empty (sidebar has main nav).
   */
  readonly headerItems = computed(() =>
    this.authFlow.isAuthenticated() ? ([] as TopNavItem[]) : LOGGED_OUT_HEADER_NAV_ITEMS
  );

  /** User menu items (Settings, Help, etc. — profile navigation is handled by the user info header) */
  readonly userMenuItems = USER_MENU_ITEMS;

  /** Desktop header configuration - minimal mode with sidebar */
  readonly headerConfig = computed<TopNavConfig>(() => {
    return createTopNavConfig({
      variant: 'default',
      showLogo: false, // Sidebar has logo
      showSearch: false,
      showNotifications: true,
      notificationCount: this.badgeCount.totalUnread(),
      sticky: true,
      hideOnScroll: false,
      bordered: false,
    });
  });

  /** Header user data — includes team/athlete context for the profile link in the dropdown */
  readonly headerUserData = computed<TopNavUserData | null>(() => {
    // Wait for auth to resolve before showing Sign In button
    // This prevents flash of "Sign In" during Firebase auth hydration
    if (!this.authFlow.isAuthReady()) return null;

    const ctx = this._userDisplayContext();
    if (!ctx) return null;

    return {
      name: ctx.name,
      email: ctx.email,
      profileImg: ctx.profileImg,
      verified: ctx.verified,
      sportLabel: ctx.sportLabel,
      profileRoute: ctx.profileRoute,
      switcherTitle: ctx.switcherTitle,
      isTeamRole: ctx.isTeamRole,
      actionLabel: ctx.actionLabel,
      sportProfiles: ctx.sportProfiles as SidenavSportProfile[],
    };
  });

  /**
   * Stable isAuthenticated signal for desktop header.
   * With TransferState, auth state is known synchronously on both
   * server and client — no hydration lock needed.
   */
  readonly topNavIsAuthenticated = computed(() => this.isAuthenticated());

  // ============================================
  // HEADER SEARCH RESULTS (Global Search Dropdown)
  // ============================================

  /** Search results for the header dropdown — disabled while Explore is parked */
  readonly headerSearchResults = computed(() => []);

  /** Whether the header search is loading */
  readonly headerSearchLoading = computed(() => false);

  /** Recent searches for the header dropdown */
  readonly headerRecentSearches = computed(() => []);

  /** Trending searches for the header dropdown */
  readonly headerTrendingSearches = computed(() => []);

  // ============================================
  // MOBILE FOOTER CONFIGURATION
  // ============================================

  /**
   * Mobile footer tabs with reactive badge count.
   * Uses buildDynamicFooterTabs() to render role-aware tabs:
   * - Athletes: "Profile" tab with user icon
   * - Coaches/Directors: "Team" tab with shield icon
   *
   * Streams unread count from BadgeCountService so the red dot
   * appears/disappears in real-time as notifications are read.
   */
  readonly footerTabs = computed<FooterTabItem[]>(() => {
    const ctx = this._userDisplayContext();
    const baseTabs = buildDynamicFooterTabs(ctx);
    const unreadCount = this.badgeCount.activityBadge();
    return updateTabBadge(baseTabs, 'activity', unreadCount > 0 ? unreadCount : undefined);
  });

  /** Current user's canonical identity route (profile for athletes, team for team roles). */
  private readonly _ownIdentityRoute = computed(() => {
    return this._userDisplayContext()?.profileRoute ?? '/profile';
  });

  private async navigateToOwnIdentity(): Promise<void> {
    const ctx = this._userDisplayContext();
    const route = ctx?.profileRoute ?? '/profile';

    if (!ctx?.isTeamRole) {
      await this.router.navigateByUrl(route);
      return;
    }

    if (route && route !== '/profile') {
      await this.router.navigateByUrl(route);
      return;
    }

    await this.authFlow.refreshUserProfile();
    const refreshedRoute = this._userDisplayContext()?.profileRoute;

    if (refreshedRoute && refreshedRoute !== '/profile') {
      await this.router.navigateByUrl(refreshedRoute);
      return;
    }

    this.logger.warn('Team route unavailable for coach/director avatar navigation');
  }

  /** Mobile footer configuration */
  readonly footerConfig = computed<FooterConfig>(() =>
    createFooterConfig({
      enableHaptics: false, // Web doesn't have haptics
    })
  );

  // ============================================
  // MOBILE HEADER CONFIGURATION (YouTube-style top bar)
  // ============================================

  /** Only /agent gets a hamburger on mobile — all other top-level pages have no left icon */
  private readonly _showMobileMenu = computed(() => this._currentRoute().startsWith('/agent'));

  /** Whether the current route should show a back arrow.
   * All authenticated non-agent routes get a back arrow — /agent uses the hamburger. */
  private readonly _showMobileBack = computed(() => {
    const route = this._currentRoute();
    if (!this.isAuthenticated()) return false;
    // /agent uses the hamburger sidebar — no back arrow
    if (route.startsWith('/agent')) return false;
    return true;
  });

  /** Whether the current route is any profile page (hides search/bell) */
  private readonly _isOnProfilePage = computed(() => {
    return this._currentRoute().startsWith('/profile');
  });

  /** Whether the current route is a team profile page (hides search/bell) */
  private readonly _isOnTeamPage = computed(() => {
    return this._currentRoute().startsWith('/team');
  });

  /** Whether the current route is the activity page */
  private readonly _isOnActivityPage = computed(() => {
    return this._currentRoute().startsWith('/activity');
  });

  /** Whether the current route is the usage/billing page */
  private readonly _isOnUsagePage = computed(() => {
    return this._currentRoute().startsWith('/usage');
  });

  /**
   * Derives the display title for the mobile header from the current route.
   * Shown in the header center when the user is authenticated (logo is hidden).
   */
  private readonly _mobilePageTitle = computed((): string => {
    const route = this._currentRoute();

    const MAP: ReadonlyArray<[string, string]> = [
      ['/profile', 'Profile'],
      ['/agent', 'Agent X'],
      ['/activity', 'Activity'],
      ['/messages', 'Messages'],
      ['/settings', 'Settings'],
      ['/usage', 'Billing & Usage'],
      ['/help-center', 'Help Center'],
      ['/analytics', 'Analytics'],
      ['/invite', 'Invite Friends'],
      ['/manage-team', 'My Team'],
      ['/team', 'Team'],
      ['/rankings', 'Rankings'],
      ['/colleges', 'Colleges'],
      ['/terms', 'Terms of Use'],
      ['/privacy', 'Privacy Policy'],
      ['/about', 'About'],
    ];

    for (const [prefix, label] of MAP) {
      if (route.startsWith(prefix)) return label;
    }
    return '';
  });

  /** Mobile header configuration — route-aware (back arrow on profile pages) */
  readonly mobileHeaderConfig = computed<MobileHeaderConfig>(() => {
    const isLoggedIn = this.isAuthenticated();
    const showSignIn = this.authFlow.isAuthReady() && !isLoggedIn;

    const onProfilePage = this._isOnProfilePage();
    const isOwnProfilePage = this._currentRoute() === '/profile';
    const onActivityPage = this._isOnActivityPage();
    const onTeamPage = this._isOnTeamPage();

    return createMobileHeaderConfig({
      showBack: this._showMobileBack(),
      showMenu: this._showMobileMenu(),
      // Logged-out: show brand logo. Logged-in: show page title instead.
      showLogo: !isLoggedIn,
      title: isLoggedIn ? this._mobilePageTitle() : undefined,
      // Hide search & bell on profile/team/activity pages — top nav shows relevant actions instead
      showSearch: !onProfilePage && !onTeamPage && !onActivityPage,
      showNotifications: !onProfilePage && !onTeamPage && !onActivityPage,
      notificationCount: this.badgeCount.totalUnread(),
      showSignIn, // Hidden until auth resolves, then show only if not logged in
      showMore: onProfilePage || onTeamPage,
      showEdit: isOwnProfilePage || this.profileActions.showEditButton(),
      showMarkAllRead: onActivityPage && this.activityService.totalUnread() > 0,
      // Filter icon: not shown (Explore is parked)
      showFilter: false,
      filterActiveCount: 0,
      // Help + Budget icons: visible on /usage (desktop nav portal handles desktop)
      showHelp: isLoggedIn && this._isOnUsagePage(),
      showBudget: isLoggedIn && this._isOnUsagePage() && this.usageService.isOrg(),
      // Avatar already lives in the mobile footer tab bar — hide it here
      showAvatar: !isLoggedIn,
      sticky: true,
      hideOnScroll: false,
      bordered: true,
      variant: 'default',
    });
  });

  /** Mobile header user data */
  readonly mobileHeaderUserData = computed<MobileHeaderUserData | null>(() => {
    // Wait for auth to resolve before showing Sign In button
    // This prevents flash of "Sign In" during Firebase auth hydration
    if (!this.authFlow.isAuthReady()) return null;

    const ctx = this._userDisplayContext();
    if (!ctx) return null;

    return {
      name: ctx.name,
      profileImg: ctx.profileImg,
      initials: ctx.initials,
      isTeamRole: ctx.isTeamRole,
    };
  });

  // ============================================
  // MOBILE SIDEBAR CONFIGURATION (YouTube-style drawer)
  // ============================================

  /**
   * Mobile sidebar sections — auth-aware. The 4 utility items (Invite Team,
   * Usage, Help Center, Settings) are placed in a dedicated single-row grid
   * section so they render as compact icon+label tiles instead of full-width rows.
   */
  readonly mobileSidebarSections = computed(() => {
    const isAuthenticated = this.authFlow.isAuthenticated();
    const baseSections = this._baseSidebarSections()
      .filter((s) => s.id !== 'follow-us' && s.id !== 'account')
      .map((s) => {
        if (s.id !== 'main') return s;
        return {
          ...s,
          items: [
            // Agent X and Explore are in the mobile footer.
            // Invite Team, Usage, Help Center, Settings go into the grid section below.
            ...s.items.filter(
              (item) => item.id !== 'agent' && item.id !== 'explore' && item.id !== 'invite-team'
            ),
            ...(!isAuthenticated ? LOGGED_OUT_MOBILE_SIDEBAR_ITEMS : []),
          ],
        };
      });

    // Quick-action grid — Invite Team (auth only), Usage, Help Center, Settings
    const quickActionItems: DesktopSidebarItem[] = [
      ...(isAuthenticated
        ? [
            {
              id: 'invite-team',
              label: 'Invite',
              icon: 'plusCircle',
              action: 'invite-team' as const,
            },
          ]
        : []),
      { id: 'usage', label: 'Usage', icon: 'creditCard', route: '/usage' },
      { id: 'help-center', label: 'Help', icon: 'help', route: '/help-center' },
      { id: 'settings', label: 'Settings', icon: 'settings', route: '/settings' },
    ];

    // Follow Us — always shown for all users, matching native mobile app sidenav
    return [
      ...baseSections,
      {
        id: 'quick-actions',
        layout: 'grid' as const,
        items: quickActionItems,
      },
      {
        id: 'follow-us',
        label: 'Follow Us',
        items: FOLLOW_US_ITEMS,
      },
    ];
  });

  /** Mobile sidebar configuration */
  readonly mobileSidebarConfig = computed<MobileSidebarConfig>(() => {
    const showSignIn = this.authFlow.isAuthReady() && !this.isAuthenticated();

    return createMobileSidebarConfig({
      showLogo: true,
      showUserSection: true,
      showThemeToggle: true,
      showSignIn, // Hidden until auth resolves, then show only if not logged in
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
  readonly showMobileFooter = computed(() => false);

  // ============================================
  // LIFECYCLE
  // ============================================

  constructor() {
    this.setupRouteTracking();
    this.loadSidebarState();

    // Clean up debounce timer on destroy to prevent memory leaks
    this.destroyRef.onDestroy(() => {
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = null;
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

    // Handle invite-team action
    if (item.action === 'invite-team') {
      const authUser = this.authFlow.user() as { role?: string | null } | null;
      void this.inviteOverlay.open({
        component: InviteShellComponent,
        inputs: { isModal: true, inviteType: 'team', user: { role: authUser?.role ?? undefined } },
        size: 'lg',
        backdropDismiss: true,
      });
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
    void this.navigateToOwnIdentity();
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
    this.router.navigate(['/agent']);
  }

  /**
   * Handle mobile user avatar click.
   * Navigate to settings/account page.
   */
  onMobileUserClick(): void {
    void this.navigateToOwnIdentity();
  }

  /**
   * Handle mobile top-nav pencil (edit profile) click on own profile page.
   * Delegates to profile.component via ProfilePageActionsService.
   */
  onMobileProfileEditClick(): void {
    this.profileActions.requestEdit();
  }

  /**
   * Handle mobile top-nav three-dot (more) click on any profile page.
   * Delegates to profile.component via ProfilePageActionsService.
   */
  onMobileProfileMoreClick(): void {
    this.profileActions.requestMore();
  }

  /**
   * Handle mobile top-nav mark-all-read click on the activity page.
   */
  onMobileActivityMarkAllReadClick(): void {
    this.activityService.markAllRead();
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async onMobileExploreFilterClick(): Promise<void> {}

  /**
   * Handle mobile top-nav help click on the billing/usage page.
   * Opens the usage help dialog via the overlay service.
   */
  onMobileUsageHelpClick(): void {
    this.inviteOverlay.open({
      component: UsageHelpContentComponent,
      size: 'lg',
      showCloseButton: true,
      backdropDismiss: true,
      ariaLabel: 'How Billing Works',
    });
  }

  /**
   * Handle mobile top-nav budget button click on the billing/usage page (org users only).
   * Opens the Agent X control panel (budget tab) as an overlay.
   */
  async onMobileUsageBudgetClick(): Promise<void> {
    const ref = this.inviteOverlay.open<AgentXControlPanelComponent>({
      component: AgentXControlPanelComponent,
      inputs: { panel: 'budget', presentation: 'modal', required: false },
      size: 'xl',
      backdropDismiss: true,
      escDismiss: true,
      ariaLabel: 'Agent budget controls',
      panelClass: 'agent-x-control-panel-modal',
    });
    await ref.closed;
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

    // Handle invite-team action
    if (item.action === 'invite-team') {
      const authUser = this.authFlow.user() as { role?: string | null } | null;
      void this.inviteOverlay.open({
        component: InviteShellComponent,
        inputs: { isModal: true, inviteType: 'team', user: { role: authUser?.role ?? undefined } },
        size: 'lg',
        backdropDismiss: true,
      });
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
    void this.navigateToOwnIdentity();
  }

  /**
   * Handle mobile sidebar sport profile selection.
   * Navigates to profile (sport switching handled by backend).
   */
  onMobileSidebarSportSelect(
    event: import('@nxt1/ui/components/mobile-sidebar').MobileSidebarSportSelectEvent
  ): void {
    this.logger.debug('Sport profile selected', { sport: event.profile.sport });
    void this.navigateToOwnIdentity();
  }

  /**
   * Handle mobile sidebar "Add Sport" click.
   * Navigates to the Add Sport / Add Team wizard.
   */
  onMobileSidebarAddSport(): void {
    this.logger.debug('Add sport clicked from mobile sidebar');
    void this.router.navigate(['/add-sport']);
  }

  // ============================================
  // HEADER HANDLERS (Desktop)
  // ============================================

  onHeaderUserClick(_event: Event): void {
    void this.navigateToOwnIdentity();
  }

  /**
   * Handle header nav item selection
   */
  onHeaderNavigate(event: TopNavSelectEvent): void {
    const { item } = event;
    if (item.route) {
      this.router.navigate([item.route]);
    }
  }

  onHeaderSearchInput(_query: string): void {}

  onHeaderSearchSubmit(event: TopNavSearchSubmitEvent): void {
    const query = event.query.trim();
    if (query) {
      void this.router.navigate(['/agent'], { queryParams: { q: query } });
    }
  }

  onHeaderSeeAllResults(query: string): void {
    void this.router.navigate(['/agent'], { queryParams: { q: query } });
  }

  onClearRecentSearches(): void {}

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

    // Navigation is handled by the header component via item.route.
    // Only handle non-navigation actions here.
    switch (item.id) {
      case 'logout':
        this.signOut();
        break;
    }
  }

  /**
   * Handle "Add Sport" / "Add Team" click from the header dropdown.
   * Navigates to the post-onboarding Add Sport / Add Team wizard.
   */
  onAddSportClick(): void {
    void this.router.navigate(['/add-sport']);
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

    this.router.navigate(['/post/create']);
  }

  /**
   * Handle logo click with auth-aware destination.
   * Authenticated users go to /agent, guests go to root landing (/).
   */
  onLogoClick(): void {
    if (this.authFlow.isAuthenticated()) {
      this.router.navigate(['/agent']);
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
    const matchedTab = findTabByRoute(this.footerTabs(), url);
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
