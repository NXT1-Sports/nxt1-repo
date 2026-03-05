/**
 * @fileoverview Navigation Models - Pure TypeScript Types
 * @module @nxt1/core/models/navigation
 *
 * Type definitions for navigation components (footer, tabs, etc.)
 * These are pure TypeScript types - 100% portable across all platforms.
 *
 * Used by:
 * - @nxt1/ui (NxtMobileFooterComponent)
 * - apps/web (Navigation configuration)
 * - apps/mobile (Navigation configuration)
 */

// ============================================
// NAVIGATION ICON TYPES
// ============================================

/**
 * Navigation icon names available in the design token system.
 * These icons have both outline (inactive) and filled (active) variants.
 */
export type NavIconName =
  | 'home'
  | 'homeFilled'
  | 'compass'
  | 'compassFilled'
  | 'search'
  | 'searchFilled'
  | 'user'
  | 'userFilled'
  | 'sparkles'
  | 'sparklesFilled'
  | 'bell'
  | 'bellFilled'
  | 'plusCircle'
  | 'plusCircleFilled'
  | 'bolt'
  | 'boltFilled'
  | 'messages'
  | 'messagesFilled';

// ============================================
// FOOTER / TAB BAR TYPES
// ============================================

/**
 * Individual tab item configuration for footer/tab bar navigation.
 * Platform-agnostic definition that can be used on web or mobile.
 */
export interface FooterTabItem {
  /** Unique identifier for the tab */
  id: string;

  /** Display label for the tab (shown below icon on mobile) */
  label: string;

  /** Outline/inactive icon name from registry */
  icon: NavIconName | string;

  /** Filled/active icon name (optional - defaults to same as icon) */
  iconActive?: NavIconName | string;

  /** Route path for navigation */
  route: string;

  /** Whether to use exact route matching (default: false) */
  routeExact?: boolean;

  /** Badge count to display (0 or undefined = no badge) */
  badge?: number;

  /** Accessibility label override */
  ariaLabel?: string;

  /** Whether tab is disabled */
  disabled?: boolean;

  /** Whether this is a special center action button (larger, prominent) */
  isActionButton?: boolean;

  /** Custom color for the action button (CSS variable or hex) */
  actionButtonColor?: string;
}

/**
 * Footer/tab bar visual variants
 */
export type FooterVariant = 'default' | 'elevated' | 'transparent' | 'floating' | 'centeredCreate';

/**
 * Active tab indicator styles
 */
export type FooterIndicatorStyle = 'pill' | 'underline' | 'none';

/**
 * Footer component configuration
 */
export interface FooterConfig {
  /** Whether to show labels below icons (default: true on mobile, false on tablet) */
  showLabels?: boolean;

  /** Whether to enable haptic feedback on tap (default: true) */
  enableHaptics?: boolean;

  /** Tab bar variant */
  variant?: FooterVariant;

  /** Whether to hide the footer (for scroll hiding) */
  hidden?: boolean;

  /** Whether footer has a translucent/blur effect */
  translucent?: boolean;

  /**
   * Whether to use glass (translucent) or solid background.
   * - true: Translucent "Liquid Glass" effect with backdrop blur (iOS 26 style)
   * - false: Solid opaque background (default)
   */
  glass?: boolean;

  /** Custom background color override */
  backgroundColor?: string;

  /** Active tab indicator style */
  indicatorStyle?: FooterIndicatorStyle;

  /**
   * Whether tapping the currently active tab triggers scroll-to-top.
   * Following Instagram, Twitter, TikTok patterns for native mobile UX.
   * Default: true
   */
  scrollToTopOnSameTap?: boolean;
}

/**
 * Tab selection event payload (platform-agnostic)
 */
export interface FooterTabSelectEvent {
  /** Selected tab item */
  tab: FooterTabItem;

  /** Previous tab item (if any) */
  previousTab?: FooterTabItem;

  /** Event timestamp */
  timestamp?: number;
}

/**
 * Scroll-to-top event payload emitted when tapping same tab.
 * Platform-agnostic definition for cross-platform handling.
 *
 * Emitted when:
 * - User taps the currently active tab
 * - config.scrollToTopOnSameTap is enabled (default: true)
 *
 * Shell components should handle this by scrolling content to top.
 */
export interface FooterScrollToTopEvent {
  /** The tab that was tapped */
  tab: FooterTabItem;

  /** Event timestamp */
  timestamp: number;

  /** Source of the event */
  source: 'same-tab-tap';
}

// ============================================
// DEFAULT CONFIGURATIONS
// ============================================

/**
 * Default tab items for NXT1 application navigation.
 * Can be used directly or as a template for customization.
 *
 * Routes use clean URLs (e.g., '/home' not '/tabs/home') matching modern
 * mobile app patterns (Instagram, TikTok, Twitter).
 */
export const DEFAULT_FOOTER_TABS: FooterTabItem[] = [
  {
    id: 'explore',
    label: 'Explore',
    icon: 'compass',
    iconActive: 'compassFilled',
    route: '/explore',
    ariaLabel: 'Explore athletes and teams',
  },
  {
    id: 'create-post',
    label: 'Create',
    icon: 'plusCircle',
    iconActive: 'plusCircleFilled',
    route: '/create',
    ariaLabel: 'Create a new post',
  },
  {
    id: 'ai',
    label: 'Agent X',
    icon: 'bolt',
    iconActive: 'boltFilled',
    route: '/agent',
    isActionButton: true,
    ariaLabel: 'Open AI Agent X',
  },
  {
    id: 'messages',
    label: 'Messages',
    icon: 'messages',
    iconActive: 'messagesFilled',
    route: '/messages',
    ariaLabel: 'View your messages',
  },
  {
    id: 'activity',
    label: 'Activity',
    icon: 'bell',
    iconActive: 'bellFilled',
    route: '/activity',
    ariaLabel: 'View your activity and notifications',
  },
];

/**
 * Centered-create tab layout for A/B testing.
 * Visual order: Explore, Messages, Create, Notifications, Agent X.
 *
 * Notes:
 * - Create remains in the visual center for a primary action emphasis.
 * - Notifications maps to /activity route to preserve existing backend/frontend contracts.
 */
export const CENTERED_CREATE_FOOTER_TABS: FooterTabItem[] = [
  {
    id: 'explore',
    label: 'Explore',
    icon: 'compass',
    iconActive: 'compassFilled',
    route: '/explore',
    ariaLabel: 'Explore athletes and teams',
  },
  {
    id: 'messages',
    label: 'Messages',
    icon: 'messages',
    iconActive: 'messagesFilled',
    route: '/messages',
    ariaLabel: 'View your messages',
  },
  {
    id: 'create-post',
    label: 'Create',
    icon: 'plusCircle',
    iconActive: 'plusCircleFilled',
    route: '/create',
    ariaLabel: 'Create a new post',
  },
  {
    id: 'activity',
    label: 'Notifications',
    icon: 'bell',
    iconActive: 'bellFilled',
    route: '/activity',
    ariaLabel: 'View your notifications',
  },
  {
    id: 'ai',
    label: 'Agent X',
    icon: 'bolt',
    iconActive: 'boltFilled',
    route: '/agent',
    ariaLabel: 'Open AI Agent X',
  },
];

/**
 * AI-First layout: Agent X in the center, Profile on the far right.
 * Visual order: Explore, Messages, Agent X (center), Activity, Profile.
 *
 * This is the "Inevitable Platform" configuration:
 * - Agent X is the primary action (center, elevated)
 * - Profile is the identity anchor (bottom right)
 * - No manual "Create" — creation is driven through Agent X
 */
export const AGENT_X_CENTER_FOOTER_TABS: FooterTabItem[] = [
  {
    id: 'explore',
    label: 'Explore',
    icon: 'compass',
    iconActive: 'compassFilled',
    route: '/explore',
    ariaLabel: 'Explore athletes and teams',
  },
  {
    id: 'messages',
    label: 'Messages',
    icon: 'messages',
    iconActive: 'messagesFilled',
    route: '/messages',
    ariaLabel: 'View your messages',
  },
  {
    id: 'ai',
    label: 'Agent X',
    icon: 'bolt',
    iconActive: 'boltFilled',
    route: '/agent',
    isActionButton: true,
    ariaLabel: 'Open AI Agent X',
  },
  {
    id: 'activity',
    label: 'Activity',
    icon: 'bell',
    iconActive: 'bellFilled',
    route: '/activity',
    ariaLabel: 'View your activity and notifications',
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: 'user',
    iconActive: 'userFilled',
    route: '/profile',
    ariaLabel: 'View your profile',
  },
];

/**
 * AI-First layout: Agent X on the far left as the home anchor.
 * Visual order: Agent X, Explore, Profile, Activity.
 *
 * Notes:
 * - Agent X remains a circular action button for visual prominence.
 * - Profile is a primary bottom-tab destination.
 * - Connections move to the sidebar for account/link management.
 */
export const AGENT_X_LEFT_FOOTER_TABS: FooterTabItem[] = [
  {
    id: 'ai',
    label: 'Agent X',
    icon: 'bolt',
    iconActive: 'boltFilled',
    route: '/agent',
    isActionButton: true,
    ariaLabel: 'Open AI Agent X',
  },
  {
    id: 'explore',
    label: 'Explore',
    icon: 'compass',
    iconActive: 'compassFilled',
    route: '/explore',
    ariaLabel: 'Explore athletes and teams',
  },
  {
    id: 'activity',
    label: 'Activity',
    icon: 'bell',
    iconActive: 'bellFilled',
    route: '/activity',
    ariaLabel: 'View your activity and notifications',
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: 'user',
    iconActive: 'userFilled',
    route: '/profile',
    ariaLabel: 'View your profile',
  },
];

/**
 * Footer height values (matches design tokens)
 */
export const FOOTER_HEIGHTS = {
  /** Standard footer height */
  default: 56,
  /** Footer height with safe area on notched devices */
  withSafeArea: 'calc(56px + env(safe-area-inset-bottom, 0px))',
  /** Compact footer height (tablet/desktop) */
  compact: 48,
} as const;

/**
 * Animation durations for footer transitions (milliseconds)
 */
export const FOOTER_ANIMATION = {
  /** Tab switch animation duration */
  tabSwitch: 200,
  /** Hide/show animation duration */
  visibility: 300,
  /** Icon scale animation duration */
  iconScale: 150,
  /** Badge pop animation duration */
  badgePop: 200,
} as const;

/**
 * Main page routes where sidenav swipe-to-open gesture is enabled.
 * On these routes, swiping from left edge opens the sidenav.
 * On all other routes, swiping from left edge triggers native back navigation.
 *
 * Professional pattern: Instagram, Twitter, TikTok all allow sidenav
 * swipe only on root/main pages, not on detail/sub-pages.
 */
export const MAIN_PAGE_ROUTES = [
  '/explore',
  '/profile',
  '/agent',
  '/messages',
  '/activity',
] as const;

/**
 * Check if a route is a main page where sidenav swipe should be enabled.
 * Returns true for exact matches only (not sub-routes like /home/details).
 *
 * @param route The current route path
 * @returns true if sidenav swipe-to-open should be enabled
 *
 * @example
 * isMainPageRoute('/home')      // true - sidenav swipe enabled
 * isMainPageRoute('/profile')   // false - back swipe instead
 * isMainPageRoute('/settings')  // false - back swipe instead
 */
export function isMainPageRoute(route: string): boolean {
  // Remove query params and hash from route for comparison
  const cleanRoute = route.split('?')[0].split('#')[0];
  return MAIN_PAGE_ROUTES.some((mainRoute) => cleanRoute === mainRoute);
}

// ============================================
// HELPER FUNCTIONS (Pure TypeScript)
// ============================================

/**
 * Find a tab by its ID
 * @param tabs Array of footer tabs
 * @param id Tab ID to find
 * @returns The matching tab or undefined
 */
export function findTabById(tabs: FooterTabItem[], id: string): FooterTabItem | undefined {
  return tabs.find((tab) => tab.id === id);
}

/**
 * Find a tab by its route
 * @param tabs Array of footer tabs
 * @param route Route path to match
 * @param exact Whether to use exact matching
 * @returns The matching tab or undefined
 */
export function findTabByRoute(
  tabs: FooterTabItem[],
  route: string,
  exact = false
): FooterTabItem | undefined {
  return tabs.find((tab) => {
    if (exact || tab.routeExact) {
      return route === tab.route;
    }
    return route.startsWith(tab.route);
  });
}

/**
 * Create a custom footer configuration with defaults
 * @param config Partial configuration to merge with defaults
 * @returns Complete footer configuration
 */
export function createFooterConfig(config: Partial<FooterConfig> = {}): FooterConfig {
  return {
    showLabels: true,
    enableHaptics: true,
    variant: 'default',
    hidden: false,
    translucent: true,
    glass: true, // Glass background by default
    indicatorStyle: 'none',
    scrollToTopOnSameTap: true, // Enable scroll-to-top on same tab tap by default
    ...config,
  };
}

/**
 * Update a tab's badge count immutably
 * @param tabs Array of footer tabs
 * @param tabId Tab ID to update
 * @param badge New badge count (0 or undefined to remove)
 * @returns New array with updated tab
 */
export function updateTabBadge(
  tabs: FooterTabItem[],
  tabId: string,
  badge: number | undefined
): FooterTabItem[] {
  return tabs.map((tab) => (tab.id === tabId ? { ...tab, badge } : tab));
}

/**
 * Enable or disable a tab immutably
 * @param tabs Array of footer tabs
 * @param tabId Tab ID to update
 * @param disabled Whether the tab should be disabled
 * @returns New array with updated tab
 */
export function setTabDisabled(
  tabs: FooterTabItem[],
  tabId: string,
  disabled: boolean
): FooterTabItem[] {
  return tabs.map((tab) => (tab.id === tabId ? { ...tab, disabled } : tab));
}

// ============================================
// DESKTOP TOP NAVIGATION TYPES
// ============================================

/**
 * Desktop navigation icon names available in the design token system.
 * Maps to icons available in @nxt1/design-tokens/assets/icons
 */
export type TopNavIconName =
  | NavIconName
  | 'settings'
  | 'help'
  | 'logout'
  | 'notifications'
  | 'messages'
  | 'plus'
  | 'chevronDown'
  | 'chevronRight'
  | 'menu';

/**
 * Individual navigation item for desktop top nav.
 * Supports links, dropdowns, and actions.
 */
export interface TopNavItem {
  /** Unique identifier for the nav item */
  id: string;

  /** Display label */
  label: string;

  /** Icon name from registry (optional) */
  icon?: TopNavIconName | string;

  /** Route path for navigation (mutually exclusive with href/action) */
  route?: string;

  /** External URL (opens in new tab) */
  href?: string;

  /** Whether to use exact route matching (default: false) */
  routeExact?: boolean;

  /** Whether this item is currently active */
  active?: boolean;

  /** Badge count to display (0 or undefined = no badge) */
  badge?: number;

  /** Accessibility label override */
  ariaLabel?: string;

  /** Whether item is disabled */
  disabled?: boolean;

  /** Children for dropdown menu */
  children?: TopNavDropdownItem[];

  /** Whether this is highlighted/featured (primary button style) */
  featured?: boolean;

  /** Whether to show on mobile nav (default: true) */
  showOnMobile?: boolean;
}

/**
 * Dropdown menu item within a top nav item
 */
export interface TopNavDropdownItem {
  /** Unique identifier */
  id: string;

  /** Display label */
  label: string;

  /** Icon name (optional) */
  icon?: TopNavIconName | string;

  /** Route path */
  route?: string;

  /** External URL */
  href?: string;

  /** Click action callback identifier */
  action?: string;

  /** Whether item is disabled */
  disabled?: boolean;

  /** Divider before this item */
  divider?: boolean;

  /** Description text shown below label */
  description?: string;
}

/**
 * User menu item configuration
 */
export interface TopNavUserMenuItem {
  /** Unique identifier */
  id: string;

  /** Display label */
  label: string;

  /** Icon name */
  icon?: TopNavIconName | string;

  /** Route path */
  route?: string;

  /** Action identifier (for logout, etc.) */
  action?: string;

  /** Whether item is disabled */
  disabled?: boolean;

  /** Divider before this item */
  divider?: boolean;

  /** Visual variant */
  variant?: 'default' | 'danger';
}

/**
 * User data for avatar and menu display
 */
export interface TopNavUserData {
  /** User display name */
  name: string;

  /** User email */
  email?: string;

  /** Profile image URL (from user.profileImg in database) */
  profileImg?: string;

  /** User initials (fallback when no avatar) */
  initials?: string;

  /** User role badge text */
  roleBadge?: string;

  /** Whether user is verified */
  verified?: boolean;

  /** Whether user has premium subscription */
  isPremium?: boolean;
}

/**
 * Desktop top navigation visual variants
 */
export type TopNavVariant = 'default' | 'transparent' | 'blur' | 'elevated' | 'minimal';

/**
 * Desktop top navigation configuration
 */
export interface TopNavConfig {
  /** Visual variant */
  variant?: TopNavVariant;

  /** Whether to show the logo */
  showLogo?: boolean;

  /** Logo size */
  logoSize?: 'sm' | 'md' | 'lg';

  /** Whether logo links to home */
  logoLinksHome?: boolean;

  /** Whether to show search in nav */
  showSearch?: boolean;

  /** Search placeholder text */
  searchPlaceholder?: string;

  /** Whether to show notifications bell */
  showNotifications?: boolean;

  /** Notification count */
  notificationCount?: number;

  /** Whether to show create button */
  showCreate?: boolean;

  /** Whether to show user menu */
  showUserMenu?: boolean;

  /** Whether header is fixed/sticky */
  sticky?: boolean;

  /** Whether to hide on scroll down */
  hideOnScroll?: boolean;

  /** Custom background color override */
  backgroundColor?: string;

  /** Whether nav has border bottom */
  bordered?: boolean;

  /** Maximum content width */
  maxWidth?: 'full' | 'xl' | '2xl' | 'contained';
}

/**
 * Top nav action event payload
 */
export interface TopNavActionEvent {
  /** Action identifier */
  action: string;

  /** Source item ID */
  itemId: string;

  /** Additional data */
  data?: Record<string, unknown>;

  /** Event timestamp */
  timestamp: number;
}

/**
 * Top nav search event payload
 */
export interface TopNavSearchEvent {
  /** Search query */
  query: string;

  /** Event timestamp */
  timestamp: number;
}

// ============================================
// DEFAULT TOP NAV CONFIGURATIONS
// ============================================

/**
 * Default navigation items for desktop top nav.
 * Can be used directly or as a template for customization.
 */
export const DEFAULT_TOP_NAV_ITEMS: TopNavItem[] = [
  {
    id: 'explore',
    label: 'Explore',
    route: '/explore',
    icon: 'compass',
  },
  {
    id: 'ai',
    label: 'Agent X',
    route: '/agent',
    icon: 'sparkles',
    featured: true,
  },
];

/**
 * Default user menu items
 */
export const DEFAULT_USER_MENU_ITEMS: TopNavUserMenuItem[] = [
  {
    id: 'profile',
    label: 'My Profile',
    icon: 'user',
    route: '/profile',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    route: '/settings',
  },
  {
    id: 'help',
    label: 'Help & Support',
    icon: 'help',
    route: '/help-center',
    divider: true,
  },
  {
    id: 'logout',
    label: 'Sign Out',
    icon: 'logout',
    action: 'logout',
    variant: 'danger',
  },
];

/**
 * Top nav height values (matches design tokens)
 */
export const TOP_NAV_HEIGHTS = {
  /** Standard height on desktop */
  default: 64,
  /** Compact height */
  compact: 56,
  /** Height with safe area (for transparent variants) */
  withSafeArea: 'calc(64px + env(safe-area-inset-top, 0px))',
} as const;

/**
 * Animation durations for top nav transitions (milliseconds)
 */
export const TOP_NAV_ANIMATION = {
  /** Dropdown open/close */
  dropdown: 200,
  /** Hide/show on scroll */
  visibility: 300,
  /** Hover state transitions */
  hover: 150,
  /** Search expand/collapse */
  search: 250,
} as const;

// ============================================
// TOP NAV HELPER FUNCTIONS
// ============================================

/**
 * Create a custom top nav configuration with defaults
 * @param config Partial configuration to merge with defaults
 * @returns Complete top nav configuration
 */
export function createTopNavConfig(config: Partial<TopNavConfig> = {}): TopNavConfig {
  return {
    variant: 'default',
    showLogo: true,
    logoSize: 'md',
    logoLinksHome: true,
    showSearch: true,
    searchPlaceholder: 'Search anything with Agent X',
    showNotifications: true,
    notificationCount: 0,
    showCreate: true,
    showUserMenu: true,
    sticky: true,
    hideOnScroll: false,
    bordered: true,
    maxWidth: 'contained',
    ...config,
  };
}

/**
 * Find a top nav item by its ID
 * @param items Array of top nav items
 * @param id Item ID to find
 * @returns The matching item or undefined
 */
export function findTopNavItemById(items: TopNavItem[], id: string): TopNavItem | undefined {
  return items.find((item) => item.id === id);
}

/**
 * Find a top nav item by its route
 * @param items Array of top nav items
 * @param route Route path to match
 * @param exact Whether to use exact matching
 * @returns The matching item or undefined
 */
export function findTopNavItemByRoute(
  items: TopNavItem[],
  route: string,
  exact = false
): TopNavItem | undefined {
  return items.find((item) => {
    if (!item.route) return false;
    if (exact || item.routeExact) {
      return route === item.route;
    }
    return route.startsWith(item.route);
  });
}

/**
 * Update a top nav item's badge count immutably
 * @param items Array of top nav items
 * @param itemId Item ID to update
 * @param badge New badge count
 * @returns New array with updated item
 */
export function updateTopNavBadge(
  items: TopNavItem[],
  itemId: string,
  badge: number | undefined
): TopNavItem[] {
  return items.map((item) => (item.id === itemId ? { ...item, badge } : item));
}

// ============================================
// SIDENAV / DRAWER TYPES (2026)
// ============================================

/**
 * Sidenav icon names available in the design token system.
 * Extends navigation icons with additional sidenav-specific options.
 */
export type SidenavIconName =
  | NavIconName
  | TopNavIconName
  | 'team'
  | 'analytics'
  | 'media'
  | 'video'
  | 'image'
  | 'graphic'
  | 'college'
  | 'email'
  | 'template'
  | 'guidance'
  | 'camp'
  | 'calendar'
  | 'trophy'
  | 'star'
  | 'heart'
  | 'bookmark'
  | 'share'
  | 'link'
  | 'download'
  | 'upload'
  | 'edit'
  | 'trash'
  | 'archive'
  | 'folder'
  | 'document'
  | 'creditCard'
  | 'gift'
  | 'support'
  | 'info'
  | 'warning'
  | 'x'
  | 'logout'
  | 'logoutFilled'
  | 'sparkles'
  | 'twitter'
  | 'facebook'
  | 'instagram'
  | 'youtube'
  | 'tiktok'
  | 'linkedin';

/**
 * Social link configuration for sidenav footer.
 */
export interface SocialLink {
  /** Unique identifier */
  id: string;

  /** Platform name */
  platform: 'twitter' | 'facebook' | 'instagram' | 'youtube' | 'tiktok' | 'linkedin';

  /** Display label */
  label: string;

  /** URL to navigate to */
  url: string;

  /** Icon name */
  icon: SidenavIconName | string;

  /** Accessibility label */
  ariaLabel?: string;
}

/**
 * Individual sidenav menu item configuration.
 */
export interface SidenavItem {
  /** Unique identifier for the item */
  id: string;

  /** Display label */
  label: string;

  /** Icon name from registry */
  icon?: SidenavIconName | string;

  /** Route path for navigation (mutually exclusive with action) */
  route?: string;

  /** Whether to use exact route matching */
  routeExact?: boolean;

  /** External URL (opens in new tab) */
  href?: string;

  /** Action identifier for custom handlers */
  action?: string;

  /** Badge count to display (0 or undefined = no badge) */
  badge?: number;

  /** Badge variant */
  badgeVariant?: 'default' | 'primary' | 'danger' | 'warning';

  /** Accessibility label override */
  ariaLabel?: string;

  /** Whether item is disabled */
  disabled?: boolean;

  /** Whether item is hidden */
  hidden?: boolean;

  /** Sub-items for expandable sections */
  children?: SidenavItem[];

  /** Whether section is initially expanded (for items with children) */
  expanded?: boolean;

  /** Visual divider before this item */
  divider?: boolean;

  /** Item variant for special styling */
  variant?: 'default' | 'danger' | 'premium';

  /** Description text shown below label */
  description?: string;

  /** Required roles to show this item */
  roles?: string[];

  /** Whether this is a section header (non-clickable) */
  isSection?: boolean;
}

/**
 * Sidenav section group configuration.
 */
export interface SidenavSection {
  /** Unique identifier */
  id: string;

  /** Section header label */
  label?: string;

  /** Items in this section */
  items: SidenavItem[];

  /** Whether section is collapsible */
  collapsible?: boolean;

  /** Whether section is initially expanded */
  expanded?: boolean;

  /** Section icon */
  icon?: SidenavIconName | string;
}

/**
 * Sport profile data for multi-sport users.
 * Allows users to switch between different sport profiles in the sidenav.
 *
 * NOTE: This is a simplified type for UI display only. It differs from the full
 * SportProfile type in user.model.ts which contains complete backend data.
 */
export interface SidenavSportProfile {
  /** Unique profile ID */
  id: string;

  /** Sport name (e.g., 'Football', 'Basketball') */
  sport: string;

  /** Sport icon name (e.g., 'football', 'basketball') */
  sportIcon?: string;

  /** Primary position in this sport */
  position?: string;

  /** Whether this is the currently active profile */
  isActive?: boolean;

  /** Profile-specific avatar URL (if different from main) */
  profileImg?: string;

  /** Class year for this sport (e.g., '2026') */
  classYear?: string;
}

/**
 * User data for sidenav header display.
 */
export interface SidenavUserData {
  /** User display name */
  name: string;

  /** User subtitle (position, role, etc.) */
  subtitle?: string;

  /** Avatar URL */
  profileImg?: string;

  /** User initials (fallback when no avatar) */
  initials?: string;

  /** Whether user is verified */
  verified?: boolean;

  /** Whether user has premium subscription */
  isPremium?: boolean;

  /** User ID for navigation */
  userId?: string;

  /** Available sport profiles for multi-sport athletes */
  sportProfiles?: SidenavSportProfile[];

  /** Currently active sport profile ID */
  activeSportProfileId?: string;
}

/**
 * Sidenav visual variants.
 */
export type SidenavVariant = 'default' | 'blur' | 'elevated' | 'minimal' | 'overlay';

/**
 * Sidenav position.
 */
export type SidenavPosition = 'left' | 'right';

/**
 * Sidenav mode for responsive behavior.
 */
export type SidenavMode = 'over' | 'push' | 'side';

/**
 * Sidenav component configuration.
 */
export interface SidenavConfig {
  /** Visual variant */
  variant?: SidenavVariant;

  /** Position on screen */
  position?: SidenavPosition;

  /** Behavior mode */
  mode?: SidenavMode;

  /** Width of sidenav */
  width?: number | string;

  /** Whether to show user header */
  showUserHeader?: boolean;

  /** Whether to show social links footer */
  showSocialLinks?: boolean;

  /** Whether to show theme selector in footer (default: true) */
  showThemeSelector?: boolean;

  /** Whether to enable haptic feedback */
  enableHaptics?: boolean;

  /** Whether backdrop is dismissable */
  backdropDismiss?: boolean;

  /** Whether to show close button */
  showCloseButton?: boolean;

  /** Custom background color override */
  backgroundColor?: string;

  /** Whether sidenav has border */
  bordered?: boolean;

  /** Animation duration in ms */
  animationDuration?: number;

  /** Whether to push page content when open (push mode) */
  pushContent?: boolean;

  /** Whether to enable swipe gesture to open/close (default: true) */
  swipeGesture?: boolean;
}

/**
 * Sidenav item selection event payload.
 */
export interface SidenavSelectEvent {
  /** Selected item */
  item: SidenavItem;

  /** Parent item ID (if nested) */
  parentId?: string;

  /** Whether item is a child */
  isChild?: boolean;

  /** Event timestamp */
  timestamp: number;
}

/**
 * Sidenav toggle event payload.
 */
export interface SidenavToggleEvent {
  /** Whether sidenav is now open */
  isOpen: boolean;

  /** What triggered the toggle */
  trigger: 'button' | 'backdrop' | 'swipe' | 'programmatic';

  /** Event timestamp */
  timestamp: number;
}

/**
 * Sidenav section toggle event payload.
 */
export interface SidenavSectionToggleEvent {
  /** Section ID */
  sectionId: string;

  /** Whether section is now expanded */
  isExpanded: boolean;

  /** Event timestamp */
  timestamp: number;
}

// ============================================
// DEFAULT SIDENAV CONFIGURATIONS
// ============================================

/**
 * Default social links for NXT1 sidenav.
 */
export const DEFAULT_SOCIAL_LINKS: SocialLink[] = [
  {
    id: 'twitter',
    platform: 'twitter',
    label: 'X (Twitter)',
    url: 'https://twitter.com/nxt1sports',
    icon: 'twitter',
    ariaLabel: 'Follow NXT1 on X (Twitter)',
  },
  {
    id: 'instagram',
    platform: 'instagram',
    label: 'Instagram',
    url: 'https://www.instagram.com/nxt1sports',
    icon: 'instagram',
    ariaLabel: 'Follow NXT1 on Instagram',
  },
  {
    id: 'facebook',
    platform: 'facebook',
    label: 'Facebook',
    url: 'https://www.facebook.com/NXT1sports',
    icon: 'facebook',
    ariaLabel: 'Follow NXT1 on Facebook',
  },
  {
    id: 'youtube',
    platform: 'youtube',
    label: 'YouTube',
    url: 'https://www.youtube.com/@nxt1sports',
    icon: 'youtube',
    ariaLabel: 'Subscribe to NXT1 on YouTube',
  },
  {
    id: 'tiktok',
    platform: 'tiktok',
    label: 'TikTok',
    url: 'https://www.tiktok.com/@nxt1sports',
    icon: 'tiktok',
    ariaLabel: 'Follow NXT1 on TikTok',
  },
];

/**
 * Default sidenav items for NXT1 application.
 * Can be used directly or as a template for customization.
 * Structure: Profile, Analytics, Settings, Help Center
 */
export const DEFAULT_SIDENAV_ITEMS: SidenavSection[] = [
  {
    id: 'main',
    items: [
      {
        id: 'connections',
        label: 'Connections',
        icon: 'link',
        route: '/create',
      },
      {
        id: 'analytics',
        label: 'Analytics',
        icon: 'barChart',
        route: '/analytics',
      },
      {
        id: 'invite-team',
        label: 'Invite team',
        icon: 'plusCircle',
        action: 'invite-team',
      },
    ],
  },
  {
    id: 'support',
    items: [
      {
        id: 'usage',
        label: 'Usage',
        icon: 'creditCard',
        route: '/usage',
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: 'settings',
        route: '/settings',
      },
      {
        id: 'help-center',
        label: 'Help Center',
        icon: 'help',
        route: '/help-center',
      },
    ],
  },
];

/**
 * Sidenav width values (matches design tokens).
 */
export const SIDENAV_WIDTHS = {
  /** Standard width */
  default: 280,
  /** Compact width */
  compact: 240,
  /** Wide width */
  wide: 320,
  /** Full width (mobile) */
  full: '100%',
} as const;

/**
 * Sidenav z-index values.
 */
export const SIDENAV_Z_INDEX = {
  /** Sidenav panel */
  sidenav: 150,
  /** Backdrop overlay */
  backdrop: 140,
} as const;

/**
 * Animation durations for sidenav transitions (milliseconds).
 */
export const SIDENAV_ANIMATION = {
  /** Open/close animation duration */
  toggle: 280,
  /** Section expand/collapse */
  expand: 200,
  /** Item hover transitions */
  hover: 150,
  /** Backdrop fade */
  backdrop: 200,
} as const;

/**
 * Gesture thresholds for sidenav swipe interactions.
 * These values are tuned for native iOS/Android feel.
 */
export const SIDENAV_GESTURE = {
  /** Minimum movement (px) to commit to a drag vs tap */
  dragCommitThreshold: 10,
  /** Minimum distance (px) to trigger sidenav open */
  minSwipeDistance: 50,
  /** Velocity threshold (px/ms) for quick flick gestures */
  velocityThreshold: 0.3,
  /** Edge zone width (px) for swipe-to-open - 9999 = anywhere on screen */
  edgeThreshold: 9999,
  /** Footer slide distance (px) when sidenav opens */
  footerSlideDistance: 140,
} as const;

// ============================================
// SIDENAV HELPER FUNCTIONS
// ============================================

/**
 * Create a custom sidenav configuration with defaults.
 * @param config Partial configuration to merge with defaults
 * @returns Complete sidenav configuration
 */
export function createSidenavConfig(config: Partial<SidenavConfig> = {}): SidenavConfig {
  return {
    variant: 'default',
    position: 'left',
    mode: 'over',
    width: SIDENAV_WIDTHS.default,
    showUserHeader: true,
    showSocialLinks: true,
    showThemeSelector: true,
    enableHaptics: true,
    backdropDismiss: true,
    showCloseButton: true,
    bordered: false,
    animationDuration: SIDENAV_ANIMATION.toggle,
    pushContent: false,
    ...config,
  };
}

/**
 * Find a sidenav item by its ID (deep search).
 * @param sections Array of sidenav sections
 * @param id Item ID to find
 * @returns The matching item or undefined
 */
export function findSidenavItemById(
  sections: SidenavSection[],
  id: string
): SidenavItem | undefined {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.id === id) return item;
      if (item.children) {
        const child = item.children.find((c) => c.id === id);
        if (child) return child;
      }
    }
  }
  return undefined;
}

/**
 * Find a sidenav item by its route (deep search).
 * @param sections Array of sidenav sections
 * @param route Route path to match
 * @param exact Whether to use exact matching
 * @returns The matching item or undefined
 */
export function findSidenavItemByRoute(
  sections: SidenavSection[],
  route: string,
  exact = false
): SidenavItem | undefined {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.route) {
        if (exact || item.routeExact) {
          if (route === item.route) return item;
        } else {
          if (route.startsWith(item.route)) return item;
        }
      }
      if (item.children) {
        const child = item.children.find((c) => {
          if (!c.route) return false;
          if (exact || c.routeExact) return route === c.route;
          return route.startsWith(c.route);
        });
        if (child) return child;
      }
    }
  }
  return undefined;
}

/**
 * Update a sidenav item's badge count immutably.
 * @param sections Array of sidenav sections
 * @param itemId Item ID to update
 * @param badge New badge count
 * @returns New array with updated item
 */
export function updateSidenavBadge(
  sections: SidenavSection[],
  itemId: string,
  badge: number | undefined
): SidenavSection[] {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      if (item.id === itemId) return { ...item, badge };
      if (item.children) {
        return {
          ...item,
          children: item.children.map((child) =>
            child.id === itemId ? { ...child, badge } : child
          ),
        };
      }
      return item;
    }),
  }));
}

/**
 * Toggle a sidenav section's expanded state immutably.
 * @param sections Array of sidenav sections
 * @param sectionId Section ID to toggle
 * @returns New array with toggled section
 */
export function toggleSidenavSection(
  sections: SidenavSection[],
  sectionId: string
): SidenavSection[] {
  return sections.map((section) =>
    section.id === sectionId ? { ...section, expanded: !section.expanded } : section
  );
}

/**
 * Filter sidenav items by user roles.
 * @param sections Array of sidenav sections
 * @param userRoles User's current roles
 * @returns Filtered sections with only authorized items
 */
export function filterSidenavByRoles(
  sections: SidenavSection[],
  userRoles: string[]
): SidenavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (!item.roles || item.roles.length === 0) return true;
        return item.roles.some((role) => userRoles.includes(role));
      }),
    }))
    .filter((section) => section.items.length > 0);
}
