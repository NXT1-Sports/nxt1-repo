/**
 * @fileoverview Navigation Constants
 * @module @nxt1/core/constants
 *
 * Constants for footer, top nav, and sidenav navigation.
 * Extracted from navigation.model.ts for proper separation of concerns.
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import type {
  FooterTabItem,
  TopNavItem,
  TopNavUserMenuItem,
  SocialLink,
  SidenavSection,
} from '../models/platform/navigation.model';

// ============================================
// NAVIGATION SURFACE DEFAULTS
// ============================================

/**
 * Shared navigation surface defaults used by shared header/footer components.
 * The default matches the current page header presentation: solid surface with
 * native Ionic translucency enabled where supported.
 */
export const DEFAULT_NAVIGATION_SURFACE_CONFIG = {
  translucent: true,
  glass: false,
} as const;

// ============================================
// FOOTER TAB CONFIGURATIONS
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
    id: 'ai',
    label: 'Agent X',
    icon: 'bolt',
    iconActive: 'boltFilled',
    route: '/agent-x',
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
    ariaLabel: 'View your activity',
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
    id: 'activity',
    label: 'Activity',
    icon: 'bell',
    iconActive: 'bellFilled',
    route: '/activity',
    ariaLabel: 'View your activity',
  },
  {
    id: 'ai',
    label: 'Agent X',
    icon: 'bolt',
    iconActive: 'boltFilled',
    route: '/agent-x',
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
    route: '/agent-x',
    isActionButton: true,
    ariaLabel: 'Open AI Agent X',
  },
  {
    id: 'activity',
    label: 'Activity',
    icon: 'bell',
    iconActive: 'bellFilled',
    route: '/activity',
    ariaLabel: 'View your activity',
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
 * Visual order: Agent X, Explore, Brand, Activity, Profile.
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
    route: '/agent-x',
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
    ariaLabel: 'View your activity',
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
  '/brand',
  '/profile',
  '/agent-x',
  '/messages',
  '/activity',
] as const;

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
    route: '/agent-x',
    icon: 'sparkles',
    featured: true,
  },
];

/**
 * Default user menu items
 */
export const DEFAULT_USER_MENU_ITEMS: TopNavUserMenuItem[] = [
  {
    id: 'help',
    label: 'Help Center',
    icon: 'help',
    route: '/help-center',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    route: '/settings',
    divider: true,
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
 */
export const DEFAULT_SIDENAV_ITEMS: SidenavSection[] = [
  {
    id: 'quick-actions',
    layout: 'grid',
    items: [
      {
        id: 'invite-team',
        label: 'Invite team',
        shortLabel: 'Invite',
        icon: 'plusCircle',
        action: 'invite-team',
      },
      {
        id: 'usage',
        label: 'Usage',
        shortLabel: 'Usage',
        icon: 'creditCard',
        route: '/usage',
      },
      {
        id: 'help-center',
        label: 'Help Center',
        shortLabel: 'Help',
        icon: 'help',
        route: '/help-center',
      },
      {
        id: 'settings',
        label: 'Settings',
        shortLabel: 'Settings',
        icon: 'settings',
        route: '/settings',
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
