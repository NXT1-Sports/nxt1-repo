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
  | 'plusCircleFilled';

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
export type FooterVariant = 'default' | 'elevated' | 'transparent' | 'floating';

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

  /** Custom background color override */
  backgroundColor?: string;

  /** Active tab indicator style */
  indicatorStyle?: FooterIndicatorStyle;
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

// ============================================
// DEFAULT CONFIGURATIONS
// ============================================

/**
 * Default tab items for NXT1 application navigation.
 * Can be used directly or as a template for customization.
 *
 * Routes use relative paths within the tabs shell (e.g., 'home' not '/tabs/home')
 * The TabsLayoutComponent handles navigation within its context.
 */
export const DEFAULT_FOOTER_TABS: FooterTabItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: 'home',
    iconActive: 'homeFilled',
    route: '/tabs/home',
    ariaLabel: 'Go to Home',
  },
  {
    id: 'discover',
    label: 'Discover',
    icon: 'compass',
    iconActive: 'compassFilled',
    route: '/tabs/discover',
    ariaLabel: 'Discover athletes and content',
  },
  {
    id: 'ai',
    label: 'Agent X',
    icon: 'bolt',
    iconActive: 'boltFilled',
    route: '/tabs/agent',
    isActionButton: true,
    ariaLabel: 'Open AI Agent X',
  },
  {
    id: 'search',
    label: 'Search',
    icon: 'search',
    iconActive: 'searchFilled',
    route: '/tabs/search',
    ariaLabel: 'Search athletes and teams',
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: 'user',
    iconActive: 'userFilled',
    route: '/tabs/profile',
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
    indicatorStyle: 'none',
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

  /** Avatar URL */
  avatarUrl?: string;

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
    id: 'home',
    label: 'Home',
    route: '/home',
    icon: 'home',
  },
  {
    id: 'discover',
    label: 'Discover',
    route: '/discover',
    icon: 'compass',
  },
  {
    id: 'search',
    label: 'Search',
    route: '/search',
    icon: 'search',
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
    route: '/help',
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
    searchPlaceholder: 'Search athletes, teams...',
    showNotifications: true,
    notificationCount: 0,
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
