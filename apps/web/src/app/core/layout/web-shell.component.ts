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
  type TopNavSportProfileSelectEvent,
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
  type MobileSidebarSportSelectEvent,
  type MobileSidebarUserData,
  createMobileSidebarConfig,
} from '@nxt1/ui/components/mobile-sidebar';
import { buildNavigationShellUserData } from '@nxt1/ui/components/user-display';
import { ProfileService } from '@nxt1/ui/profile';
// ── Services (separate from component barrel) ──
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtScrollService } from '@nxt1/ui/services/scroll';
import { NxtNotificationStateService } from '@nxt1/ui/services/notification-state';
import { NxtToastService } from '@nxt1/ui/services/toast';
// ── Auth ──
import { AuthModalService } from '@nxt1/ui/auth';
// ── Activity (for mark-all-read on /activity route) ──
import { ActivityService } from '@nxt1/ui/activity';
import type { TopNavSearchSubmitEvent } from '@nxt1/ui/components/top-nav';
// ── Usage (for mobile billing actions) ──
import { UsageService, UsageHelpContentComponent } from '@nxt1/ui/usage';
import { AgentXControlPanelComponent } from '@nxt1/ui/agent-x';
import { ManageTeamModalService } from '@nxt1/ui/manage-team';

// ── Invite ──
import { InviteShellComponent } from '@nxt1/ui/invite';
import { NxtOverlayService } from '@nxt1/ui/components/overlay';
// ── App-level imports ──
import { AuthFlowService } from '../services/auth';
import { EditProfileApiService } from '../services/api/edit-profile-api.service';

import { BadgeCountService, ProfilePageActionsService } from '../services';
import { NotificationPopoverComponent } from '../../features/activity/components';
import {
  DEFAULT_SOCIAL_LINKS,
  DEFAULT_SPORTS,
  type InviteTeam,
  formatSportDisplayName,
  normalizeSportKey,
  buildUserDisplayContext,
  resolveCanonicalTeamRoute,
} from '@nxt1/core';
import { FIREBASE_EVENTS } from '@nxt1/core/analytics';

const IOS_APP_STORE_URL = 'https://apps.apple.com/us/app/nxt-1/id6446410344';
const GOOGLE_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.nxt1sports.app.twa';
import type { SidenavSportProfile, UserDisplayInput, UserDisplayFallback } from '@nxt1/core';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';

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
const _SPORT_CHILD_ITEMS: readonly DesktopSidebarItem[] = DEFAULT_SPORTS.map((sport) => {
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
      { id: 'agent', label: 'Agent X', icon: 'agent-x', route: '/agent-x' },
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
    items: [{ id: 'agent', label: 'Agent X', icon: 'agent-x', route: '/agent-x' }],
  },
  {
    id: 'follow-us',
    label: 'Follow Us',
    items: FOLLOW_US_ITEMS,
  },
];

/**
 * Desktop header navigation items — logged-out only.
 * Simple navigation: Agent X and Programs (no dropdowns, no icons).
 * When logged in, the header only shows: Search, Notifications, User Menu.
 */
const LOGGED_OUT_HEADER_NAV_ITEMS: TopNavItem[] = [
  {
    id: 'nav-agent-x',
    label: 'Agent X',
    route: '/agent-x',
  },
  {
    id: 'nav-programs',
    label: 'Programs',
    route: '/programs',
  },
];

// Mobile sidebar items derive from LOGGED_OUT_HEADER_NAV_ITEMS
// Since header nav is now simple (no dropdowns, no icons), mobile sidebar uses same items
const LOGGED_OUT_MOBILE_SIDEBAR_ITEMS: readonly DesktopSidebarItem[] =
  LOGGED_OUT_HEADER_NAV_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon ?? 'link',
    route: item.route,
    href: item.href,
    ariaLabel: item.ariaLabel,
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
    <div
      class="shell"
      [class.shell--authenticated]="isAuthenticated()"
      [class.shell--logged-out]="!isAuthenticated()"
    >
      <!-- DESKTOP: Fixed Sidebar — authenticated users only; CSS-hidden below 768px -->
      @if (showDesktopSidebar()) {
        <nxt1-desktop-sidebar
          class="shell__desktop-sidebar"
          [sections]="sidebarSections()"
          [user]="sidebarUserData()"
          [config]="sidebarConfig()"
          (itemSelect)="onSidebarItemSelect($event)"
          (userClick)="onSidebarUserClick($event)"
          (logoClick)="onLogoClick()"
          (collapseChange)="onSidebarCollapseChange($event)"
        />
      }

      @if (showLoggedOutPlatformBanner()) {
        <aside
          class="platform-promo platform-promo--mobile"
          [class.platform-promo--hidden]="platformBannerScrolledAway()"
          aria-label="NXT1 platform announcement"
        >
          <div
            class="platform-promo__inner platform-promo__inner--mobile"
            [class.platform-promo__inner--hidden]="platformBannerScrolledAway()"
          >
            <div class="platform-promo__message platform-promo__message--mobile">
              <span class="platform-promo__status" aria-hidden="true"></span>
              <span class="platform-promo__label">New NXT1 is live.</span>
              <span class="platform-promo__copy">Agent X is ready to work.</span>
            </div>
          </div>
        </aside>
      }

      <!-- MOBILE: Top Header Bar — CSS-hidden at 768px+ -->
      <nxt1-mobile-header
        class="shell__mobile-header"
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
        (helpClick)="onMobileUsageHelpClick()"
        (budgetClick)="onMobileUsageBudgetClick()"
        (activityClick)="onMobileAgentXActivityClick()"
        (usageClick)="onMobileAgentXUsageClick()"
        (userClick)="onMobileUserClick()"
      />

      <!-- MOBILE: Slide-Out Drawer — CSS-hidden at 768px+, self-manages open/close -->
      <nxt1-mobile-sidebar
        class="shell__mobile-sidebar"
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
        @if (showLoggedOutPlatformBanner()) {
          <aside
            class="platform-promo"
            [class.platform-promo--hidden]="platformBannerScrolledAway()"
            aria-label="NXT1 app download announcement"
          >
            <div
              class="platform-promo__inner"
              [class.platform-promo__inner--hidden]="platformBannerScrolledAway()"
            >
              <div class="platform-promo__message">
                <span class="platform-promo__status" aria-hidden="true"></span>
                <span class="platform-promo__label">Download the NXT1 app</span>
                <span class="platform-promo__copy">
                  Take the full platform with you and get NXT1 on iPhone or Android.
                </span>
              </div>

              <button type="button" class="platform-promo__button" (click)="onPlatformPromoClick()">
                Download the App
              </button>
            </div>
          </aside>
        }

        <!-- DESKTOP: Header bar — CSS-hidden below 768px -->
        <nxt1-header
          class="shell__desktop-header"
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
          (sportProfileSelect)="onHeaderSportProfileSelect($event)"
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
            class="shell__notification-popover"
            [isOpen]="notificationPopoverOpen()"
            (closePopover)="closeNotificationPopover()"
          />
        }

        <!-- PAGE CONTENT — Never gated by @if or display:none -->
        <main
          class="shell__content"
          [class.shell__content--has-footer]="showMobileFooter()"
          [class.shell__content--full-bleed]="contentUsesFullBleed()"
          (scroll)="onShellContentScroll($event)"
        >
          <router-outlet />
        </main>
      </div>

      <!-- MOBILE: Bottom Tab Bar — CSS-hidden at 768px+, auth-gated -->
      @if (showMobileFooter()) {
        <nxt1-mobile-footer
          class="shell__mobile-footer"
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
      .shell__desktop-header {
        flex-shrink: 0;
        z-index: 40;
      }

      /* ============================================
         NOTIFICATION POPOVER (Desktop)
         ============================================ */
      .shell__notification-popover {
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

      .shell__content--full-bleed {
        scrollbar-gutter: auto;
      }

      .platform-promo {
        display: none;
      }

      @media (min-width: 768px) {
        .platform-promo--mobile {
          display: none !important;
        }

        .shell__content--full-bleed {
          scrollbar-width: none;
        }

        .shell__content--full-bleed::-webkit-scrollbar {
          width: 0;
          height: 0;
        }
      }

      /* ============================================
         MOBILE HEADER (sticky)
         ============================================ */
      .shell__mobile-header {
        flex-shrink: 0;
        z-index: 40;
      }

      /* ============================================
         MOBILE SIDEBAR (overlay drawer)
         Component manages its own transform/visibility.
         ============================================ */
      .shell__mobile-sidebar {
        /* positioned by component — no layout styles needed */
      }

      /* ============================================
         MOBILE FOOTER
         ============================================ */
      .shell__mobile-footer {
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

        /* Hide desktop navigation chrome for authenticated app pages.
           Logged-out app/marketing pages keep the shared desktop header on mobile. */
        .shell__desktop-sidebar,
        .shell__notification-popover {
          display: none !important;
        }

        .shell--logged-out .shell__desktop-header,
        .shell--authenticated .shell__mobile-header {
          display: block !important;
        }

        .shell--authenticated .shell__desktop-header,
        .shell--logged-out .shell__mobile-header,
        .shell--logged-out .shell__mobile-sidebar {
          display: none !important;
        }

        .platform-promo--mobile {
          display: block;
          flex-shrink: 0;
          max-height: 42px;
          overflow: hidden;
          border-bottom: 1px solid var(--nxt1-color-border-subtle);
          background:
            linear-gradient(
              90deg,
              color-mix(in srgb, var(--nxt1-color-primary) 14%, transparent),
              transparent 54%,
              color-mix(in srgb, var(--nxt1-color-secondary) 10%, transparent)
            ),
            var(--nxt1-color-bg-primary);
          transition:
            max-height var(--nxt1-duration-normal, 220ms) var(--nxt1-easing-standard, ease),
            border-color var(--nxt1-duration-normal, 220ms) var(--nxt1-easing-standard, ease);
        }

        .platform-promo--mobile.platform-promo--hidden {
          max-height: 0;
          border-bottom-color: transparent;
        }

        .platform-promo__inner--mobile {
          min-height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--nxt1-spacing-2);
          padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
          opacity: 1;
          transform: translateY(0);
          transition:
            opacity var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-standard, ease),
            transform var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-standard, ease);
        }

        .platform-promo__inner--hidden {
          opacity: 0;
          pointer-events: none;
          transform: translateY(-8px);
        }

        .platform-promo__message--mobile {
          min-width: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--nxt1-spacing-1_5, 6px);
          color: var(--nxt1-color-text-secondary);
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-xs);
          font-weight: var(--nxt1-fontWeight-medium);
          line-height: var(--nxt1-lineHeight-normal);
          text-align: center;
        }

        .platform-promo__message--mobile .platform-promo__status {
          width: 7px;
          height: 7px;
          flex: 0 0 auto;
          border-radius: var(--nxt1-borderRadius-full);
          background: var(--nxt1-color-primary);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--nxt1-color-primary) 14%, transparent);
        }

        .platform-promo__message--mobile .platform-promo__label {
          flex: 0 0 auto;
          color: var(--nxt1-color-text-primary);
          font-weight: var(--nxt1-fontWeight-semibold);
        }

        .platform-promo__message--mobile .platform-promo__copy {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .platform-promo--mobile .platform-promo__button {
          flex: 0 0 auto;
          min-height: 26px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid color-mix(in srgb, var(--nxt1-color-primary) 44%, transparent);
          border-radius: var(--nxt1-borderRadius-full);
          padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2_5, 10px);
          background: color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent);
          color: var(--nxt1-color-primary);
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-xs);
          font-weight: var(--nxt1-fontWeight-semibold);
          line-height: var(--nxt1-lineHeight-normal);
          cursor: pointer;
        }

        @media (max-width: 374px) {
          .platform-promo__message--mobile .platform-promo__copy {
            display: none;
          }
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
        .shell__mobile-header,
        .shell__mobile-sidebar,
        .shell__mobile-footer {
          display: none !important;
        }

        /* Ensure no footer padding on desktop */
        .shell__content--has-footer {
          padding-bottom: 0;
        }

        .platform-promo {
          display: block;
          flex-shrink: 0;
          max-height: 44px;
          overflow: hidden;
          border-bottom: 1px solid var(--nxt1-color-border-subtle);
          background:
            linear-gradient(
              90deg,
              color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent),
              transparent 36%,
              color-mix(in srgb, var(--nxt1-color-secondary) 10%, transparent)
            ),
            var(--nxt1-color-bg-primary);
          transition:
            max-height var(--nxt1-duration-normal, 220ms) var(--nxt1-easing-standard, ease),
            border-color var(--nxt1-duration-normal, 220ms) var(--nxt1-easing-standard, ease);
        }

        .platform-promo--hidden {
          max-height: 0;
          border-bottom-color: transparent;
        }

        .platform-promo__inner {
          min-height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--nxt1-spacing-4);
          padding: var(--nxt1-spacing-2) var(--nxt1-spacing-5);
          opacity: 1;
          transform: translateY(0);
          transition:
            opacity var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-standard, ease),
            transform var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-standard, ease);
        }

        .platform-promo__inner--hidden {
          opacity: 0;
          pointer-events: none;
          transform: translateY(-8px);
        }

        .platform-promo__message {
          min-width: 0;
          display: inline-flex;
          align-items: center;
          gap: var(--nxt1-spacing-2);
          color: var(--nxt1-color-text-secondary);
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-sm);
          font-weight: var(--nxt1-fontWeight-medium);
          line-height: var(--nxt1-lineHeight-normal);
        }

        .platform-promo__status {
          width: 8px;
          height: 8px;
          flex: 0 0 auto;
          border-radius: var(--nxt1-borderRadius-full);
          background: var(--nxt1-color-primary);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--nxt1-color-primary) 14%, transparent);
        }

        .platform-promo__label {
          flex: 0 0 auto;
          color: var(--nxt1-color-text-primary);
          font-weight: var(--nxt1-fontWeight-semibold);
        }

        .platform-promo__copy {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .platform-promo__button {
          flex: 0 0 auto;
          min-height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid color-mix(in srgb, var(--nxt1-color-primary) 46%, transparent);
          border-radius: var(--nxt1-borderRadius-full);
          padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
          background: color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent);
          color: var(--nxt1-color-primary);
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-xs);
          font-weight: var(--nxt1-fontWeight-semibold);
          line-height: var(--nxt1-lineHeight-normal);
          cursor: pointer;
          transition:
            background-color var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-standard, ease),
            border-color var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-standard, ease),
            transform var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-standard, ease);
        }

        .platform-promo__button:hover {
          background: color-mix(in srgb, var(--nxt1-color-primary) 18%, transparent);
          border-color: var(--nxt1-color-primary);
          transform: translateY(-1px);
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
  private readonly editProfileApiService = inject(EditProfileApiService);
  private readonly logger = inject(NxtLoggingService).child('WebShellComponent');
  private readonly toast = inject(NxtToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly scrollService = inject(NxtScrollService);
  private readonly badgeCount = inject(BadgeCountService);
  private readonly profileActions = inject(ProfilePageActionsService);
  private readonly manageTeamModal = inject(ManageTeamModalService);
  private readonly profileService = inject(ProfileService);
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

  private readonly _navigationShellUserData = computed(() => {
    const ctx = this._userDisplayContext();
    return ctx ? buildNavigationShellUserData(ctx) : null;
  });

  /** Sidebar user data — team-role aware */
  readonly sidebarUserData = computed<DesktopSidebarUserData | null>(() => {
    // Return null during auth resolution to prevent premature rendering
    if (!this.authFlow.isAuthReady()) return null;

    return this._navigationShellUserData()?.desktopSidebar ?? null;
  });

  /** Mobile sidebar user data — team-role aware, includes sport profiles for the sport switcher */
  readonly mobileSidebarUserData = computed<MobileSidebarUserData | null>(() => {
    return this._navigationShellUserData()?.mobileSidebar ?? null;
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
      showLogo: !this.showDesktopSidebar(),
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

    return this._navigationShellUserData()?.topNav ?? null;
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

    const activeSportIndex = this.authFlow.user()?.activeSportIndex ?? 0;
    const teamId = this.resolveTeamIdForSportIndex(activeSportIndex);
    const result = await this.manageTeamModal.open({ teamId: teamId ?? undefined });
    if (result.saved) {
      await this.authFlow.refreshUserProfile();
    }
  }

  private async switchOwnSportProfile(profile: SidenavSportProfile): Promise<void> {
    const userId = this.authFlow.user()?.uid;
    const sportIndex = profile.originalIndex;

    if (!userId) {
      this.logger.warn('Cannot switch sport profile without an authenticated user', {
        profileId: profile.id,
        sport: profile.sport,
      });
      return;
    }

    if (sportIndex === undefined || sportIndex < 0) {
      this.logger.warn('Cannot switch sport profile without a valid original index', {
        userId,
        profileId: profile.id,
        sport: profile.sport,
        originalIndex: sportIndex,
      });
      return;
    }

    this.logger.info('Switching sport profile from global navigation', {
      userId,
      profileId: profile.id,
      sport: profile.sport,
      sportIndex,
      currentRoute: this._currentRoute(),
    });

    if (this._currentRoute() === '/profile') {
      await this.profileService.setActiveSportIndex(sportIndex);
      await this.authFlow.refreshUserProfile();
      return;
    }

    const result = await this.editProfileApiService.updateActiveSportIndex(userId, sportIndex);
    if (!result.success) {
      this.logger.warn('Failed to switch active sport profile', {
        userId,
        sportIndex,
        sport: profile.sport,
        error: result.error,
      });
      this.toast.error(result.error ?? 'Unable to switch profile right now.');
      return;
    }

    // Optimistically patch the auth user signal so the switcher checkmark,
    // sport label, and avatar immediately reflect the newly selected sport —
    // no wait for refreshUserProfile() to round-trip from the backend.
    this.authFlow.patchUser({ activeSportIndex: sportIndex });

    if (this._userDisplayContext()?.isTeamRole) {
      return;
    }

    // Fallback: non-team role or no canonical route — use display-context path.
    await this.authFlow.refreshUserProfile();
    await this.navigateToOwnIdentity();
  }

  /**
   * Compute the canonical team route for a given sport index using the current
   * user signal. Used by the global sport switcher so that navigation is
   * independent of any post-save refresh race.
   */
  private resolveTeamRouteForSportIndex(sportIndex: number): string | null {
    const user = this.authFlow.user() as unknown as {
      readonly sports?: ReadonlyArray<{
        readonly sport?: string;
        readonly team?: {
          readonly name?: string;
          readonly teamName?: string;
          readonly slug?: string;
          readonly teamId?: string;
          readonly id?: string;
          readonly teamCode?: string;
          readonly code?: string;
          readonly organizationId?: string;
          readonly unicode?: string;
        };
      }> | null;
    } | null;

    const sport = user?.sports?.[sportIndex];
    const team = sport?.team;
    if (!team) return null;

    const resolved = resolveCanonicalTeamRoute({
      slug: team.slug?.trim(),
      teamName: team.name?.trim() || team.teamName?.trim(),
      teamCode: team.teamCode?.trim(),
      code: team.code?.trim(),
      teamId: team.teamId?.trim() || team.organizationId?.trim(),
      id: team.id?.trim(),
      unicode: team.unicode?.trim(),
    });

    return resolved?.path ?? null;
  }

  private resolveTeamIdForSportIndex(sportIndex: number): string | null {
    const user = this.authFlow.user() as unknown as {
      readonly sports?: ReadonlyArray<{
        readonly team?: {
          readonly teamId?: string;
          readonly id?: string;
          readonly organizationId?: string;
        };
      }> | null;
      readonly teamCode?: { readonly teamId?: string; readonly id?: string } | null;
    } | null;

    const fromTeam = (team?: {
      readonly teamId?: string;
      readonly id?: string;
      readonly organizationId?: string;
    }): string | null =>
      team?.teamId?.trim() || team?.organizationId?.trim() || team?.id?.trim() || null;

    // Coaches have a synthetic sports[] that can rebuild empty/reindexed after a
    // profile refresh, so fall back to teamCode and any other sport before giving up.
    return (
      fromTeam(user?.sports?.[sportIndex]?.team) ??
      (user?.teamCode?.teamId?.trim() || user?.teamCode?.id?.trim() || null) ??
      fromTeam(user?.sports?.find((sport) => sport.team)?.team)
    );
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

  /**
   * Mobile hamburger visibility.
   * - Logged out: always show hamburger so users can access drawer nav from any page.
   * - Logged in: keep current behavior (hamburger on /agent-x, back arrow elsewhere).
   */
  private readonly _showMobileMenu = computed(() => {
    if (!this.isAuthenticated()) return true;
    return this._currentRoute().startsWith('/agent-x');
  });

  /** Whether the current route should show a back arrow.
   * All authenticated non-agent routes get a back arrow — /agent-x uses the hamburger. */
  private readonly _showMobileBack = computed(() => {
    const route = this._currentRoute();
    if (!this.isAuthenticated()) return false;
    // /agent-x uses the hamburger sidebar — no back arrow
    if (route.startsWith('/agent-x')) return false;
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

  /** Whether the current route is the Agent X page */
  private readonly _isOnAgentXPage = computed(() => {
    return this._currentRoute().startsWith('/agent-x');
  });

  /**
   * Derives the display title for the mobile header from the current route.
   * Shown in the header center when the user is authenticated (logo is hidden).
   */
  private readonly _mobilePageTitle = computed((): string => {
    const route = this._currentRoute();

    const MAP: ReadonlyArray<[string, string]> = [
      ['/profile', 'Profile'],
      ['/agent-x', 'Agent X'],
      ['/activity', 'Activity'],
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
    const onProfilePage = this._isOnProfilePage();
    const showSignIn = this.authFlow.isAuthReady() && !isLoggedIn && !onProfilePage;
    const isOwnProfilePage = this._currentRoute() === '/profile';
    const onActivityPage = this._isOnActivityPage();
    const onTeamPage = this._isOnTeamPage();
    const onAgentXPage = this._isOnAgentXPage();

    return createMobileHeaderConfig({
      showBack: this._showMobileBack(),
      showMenu: this._showMobileMenu(),
      // Logged-out: show brand logo. Logged-in: show page title instead.
      showLogo: !isLoggedIn,
      title: isLoggedIn ? this._mobilePageTitle() : undefined,
      // Hide search & bell on profile/team/activity/agent-x pages — top nav shows relevant actions instead
      showSearch: !onProfilePage && !onTeamPage && !onActivityPage && !onAgentXPage,
      showNotifications: !onProfilePage && !onTeamPage && !onActivityPage && !onAgentXPage,
      notificationCount: this.badgeCount.totalUnread(),
      showSignIn, // Hidden until auth resolves, then show only if not logged in
      signInLabel: 'Try NXT1',
      showMore: onProfilePage || onTeamPage,
      showEdit: isOwnProfilePage || this.profileActions.showEditButton(),
      showMarkAllRead: onActivityPage && this.activityService.totalUnread() > 0,
      // Filter icon: not shown (Explore is parked)
      showFilter: false,
      filterActiveCount: 0,
      // Help icon only on /usage for mobile web; desktop uses the header portal.
      showHelp: isLoggedIn && this._isOnUsagePage(),
      showBudget: false,
      showActivity: isLoggedIn && onAgentXPage,
      showUsage: isLoggedIn && onAgentXPage,
      activityUnreadCount: this.activityService.totalUnread(),
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

    return this._navigationShellUserData()?.mobileHeader ?? null;
  });

  // ============================================
  // MOBILE SIDEBAR CONFIGURATION (YouTube-style drawer)
  // ============================================

  /**
   * Mobile sidebar sections — auth-aware. Utility items are shown in a
   * dedicated single-row grid for authenticated users only.
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
            // Invite Team / Usage / Help / Settings are handled in quick actions below.
            ...s.items.filter(
              (item) => item.id !== 'agent' && item.id !== 'explore' && item.id !== 'invite-team'
            ),
            ...(!isAuthenticated ? LOGGED_OUT_MOBILE_SIDEBAR_ITEMS : []),
          ],
        };
      });

    // Quick-action grid — authenticated users only
    const quickActionItems: DesktopSidebarItem[] = isAuthenticated
      ? [
          {
            id: 'invite-team',
            label: 'Invite',
            icon: 'plusCircle',
            action: 'invite-team' as const,
          },
          { id: 'usage', label: 'Usage', icon: 'creditCard', route: '/usage' },
          { id: 'help-center', label: 'Help', icon: 'help', route: '/help-center' },
          { id: 'settings', label: 'Settings', icon: 'settings', route: '/settings' },
        ]
      : [];

    // Follow Us — always shown for all users, matching native mobile app sidenav
    return [
      ...baseSections,
      ...(quickActionItems.length > 0
        ? [
            {
              id: 'quick-actions',
              layout: 'grid' as const,
              items: quickActionItems,
            },
          ]
        : []),
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
      showLegalLinks: false,
      showExplore: false,
      variant: 'default',
      width: '280px',
    });
  });

  // ============================================
  // STATE
  // ============================================

  /** Current route for active state detection */
  private readonly _currentRoute = signal('/agent-x');
  private promoViewed = false;
  protected readonly platformBannerScrolledAway = signal(false);

  protected readonly showLoggedOutPlatformBanner = computed(() => {
    return this.authFlow.isAuthReady() && !this.isAuthenticated();
  });

  protected readonly contentUsesFullBleed = computed(() => {
    const route = this._currentRoute().split('?')[0];
    return route === '/' || route.startsWith('/agent-x');
  });

  /** Active tab ID for mobile footer */
  private readonly _activeTabId = signal<string | null>('agent');
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

  /** Desktop/tablet sidebar is only visible for authenticated users. */
  readonly showDesktopSidebar = computed(() => this.isAuthenticated());

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
    afterNextRender(() => {
      this.trackPromoViewed();
    });

    // Clean up debounce timer on destroy to prevent memory leaks
    this.destroyRef.onDestroy(() => {
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = null;
      }
    });
  }

  /** Build invite overlay inputs with robust no-team fallback. */
  private buildInviteOverlayInputs(): {
    readonly isModal: true;
    readonly inviteType: 'team' | 'general';
    readonly team: InviteTeam | null;
    readonly user: { role?: string | undefined };
  } {
    const authUser = this.authFlow.user() as {
      role?: string | null;
      activeSportIndex?: number;
      sports?: ReadonlyArray<{
        sport?: string;
        team?: {
          teamId?: string;
          organizationId?: string;
          id?: string;
          name?: string;
          teamName?: string;
          logoUrl?: string;
          logo?: string;
          isOrganizationClaimed?: boolean;
          billingOwnerUid?: string;
          billingOwnerId?: string;
          activeAdminCount?: number;
          adminCount?: number;
          admins?: ReadonlyArray<{
            userId?: string;
            active?: boolean;
            isActive?: boolean;
            status?: string;
          }>;
        };
      }>;
    } | null;

    const preferredIndex = authUser?.activeSportIndex ?? 0;
    const currentSport = authUser?.sports?.[preferredIndex] ?? authUser?.sports?.[0];
    const teamInfo = currentSport?.team;
    const teamId =
      teamInfo?.teamId?.trim() || teamInfo?.organizationId?.trim() || teamInfo?.id?.trim();
    const teamName = teamInfo?.name?.trim() || teamInfo?.teamName?.trim();
    const organizationId = teamInfo?.organizationId?.trim();
    const hasBillingOwner = Boolean(
      teamInfo?.billingOwnerUid?.trim() || teamInfo?.billingOwnerId?.trim()
    );
    const activeAdminCount = Math.max(teamInfo?.activeAdminCount ?? 0, teamInfo?.adminCount ?? 0);
    const hasActiveAdmins =
      activeAdminCount > 0 ||
      (teamInfo?.admins?.some((admin) => {
        const status = admin.status?.toLowerCase();
        const isActive = admin.active ?? admin.isActive;
        return Boolean(
          admin.userId?.trim() &&
          isActive !== false &&
          status !== 'inactive' &&
          status !== 'disabled' &&
          status !== 'suspended'
        );
      }) ??
        false);
    const organizationReadyForTeamInvite =
      teamInfo?.isOrganizationClaimed === true || hasBillingOwner || hasActiveAdmins;
    const canUseTeamInvite =
      Boolean(teamId && teamName) && (!organizationId || organizationReadyForTeamInvite);
    const resolvedTeamId = canUseTeamInvite ? (teamId ?? '') : '';
    const resolvedTeamName = canUseTeamInvite ? (teamName ?? '') : '';

    const team: InviteTeam | null = canUseTeamInvite
      ? {
          id: resolvedTeamId,
          name: resolvedTeamName,
          sport: currentSport?.sport?.trim() ?? '',
          logoUrl: teamInfo?.logoUrl ?? teamInfo?.logo ?? undefined,
          memberCount: 0,
        }
      : null;

    return {
      isModal: true,
      inviteType: canUseTeamInvite ? 'team' : 'general',
      team,
      user: { role: authUser?.role ?? undefined },
    };
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
      void this.inviteOverlay.open({
        component: InviteShellComponent,
        inputs: this.buildInviteOverlayInputs(),
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
   * Navigate to Agent X on mobile.
   */
  onMobileSearchClick(): void {
    this.router.navigate(['/agent-x']);
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
      ariaLabel: 'Budget settings',
      panelClass: 'agent-x-control-panel-modal',
    });
    await ref.closed;
  }

  onMobileAgentXActivityClick(): void {
    void this.router.navigate(['/activity']);
  }

  onMobileAgentXUsageClick(): void {
    void this.router.navigate(['/usage']);
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
      void this.inviteOverlay.open({
        component: InviteShellComponent,
        inputs: this.buildInviteOverlayInputs(),
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
  onMobileSidebarSportSelect(event: MobileSidebarSportSelectEvent): void {
    this.logger.debug('Sport profile selected', { sport: event.profile.sport });
    this.closeMobileSidebar();
    void this.switchOwnSportProfile(event.profile);
  }

  onHeaderSportProfileSelect(event: TopNavSportProfileSelectEvent): void {
    this.logger.debug('Header sport profile selected', { sport: event.profile.sport });
    void this.switchOwnSportProfile(event.profile);
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

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onHeaderSearchInput(_query: string): void {}

  onHeaderSearchSubmit(event: TopNavSearchSubmitEvent): void {
    const query = (event.query ?? '').trim();
    if (query) {
      void this.router.navigate(['/agent-x'], { queryParams: { q: query } });
    }
  }

  onHeaderSeeAllResults(query: string): void {
    void this.router.navigate(['/agent-x'], { queryParams: { q: query } });
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
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
   * Authenticated users go to /agent-x, guests go to root landing (/).
   */
  onLogoClick(): void {
    if (this.authFlow.isAuthenticated()) {
      this.router.navigate(['/agent-x']);
      return;
    }

    this.router.navigate(['/']);
  }

  onPlatformPromoClick(): void {
    this.analytics?.trackEvent(FIREBASE_EVENTS.SELECT_PROMOTION, {
      creative_name: 'mobile_app_download_banner',
      creative_slot: 'authenticated_web_shell_banner',
      promotion_id: 'mobile_app_download',
      promotion_name: 'Mobile App Download Banner',
      location_id: 'authenticated_web_shell_banner',
    });

    if (!isPlatformBrowser(this.platformId)) return;

    window.open(this.resolveAppDownloadUrl(), '_blank', 'noopener,noreferrer');
  }

  private trackPromoViewed(): void {
    if (this.promoViewed) return;
    this.promoViewed = true;
    this.analytics?.trackEvent(FIREBASE_EVENTS.VIEW_PROMOTION, {
      creative_name: 'mobile_app_download_banner',
      creative_slot: 'authenticated_web_shell_banner',
      promotion_id: 'mobile_app_download',
      promotion_name: 'Mobile App Download Banner',
      location_id: 'authenticated_web_shell_banner',
    });
  }

  private resolveAppDownloadUrl(): string {
    if (!isPlatformBrowser(this.platformId)) return IOS_APP_STORE_URL;

    const userAgent = window.navigator.userAgent.toLowerCase();
    return userAgent.includes('android') ? GOOGLE_PLAY_STORE_URL : IOS_APP_STORE_URL;
  }

  onShellContentScroll(event: Event): void {
    const scrollTop = event.target instanceof HTMLElement ? event.target.scrollTop : 0;
    const isScrolled = scrollTop > 8;

    if (this.platformBannerScrolledAway() !== isScrolled) {
      this.platformBannerScrolledAway.set(isScrolled);
    }
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

        this.scheduleShellScrollToTop();
      });
  }

  private scheduleShellScrollToTop(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const scrollToTop = () => {
      const scrollEl = this.getShellContentElement();
      scrollEl?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      scrollEl?.querySelectorAll<HTMLElement>('*').forEach((element) => {
        if (element.scrollTop > 0 || element.scrollLeft > 0) {
          element.scrollTop = 0;
          element.scrollLeft = 0;
        }
      });
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      this.platformBannerScrolledAway.set(false);
    };

    scrollToTop();
    window.requestAnimationFrame(() => {
      scrollToTop();
      window.requestAnimationFrame(scrollToTop);
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
