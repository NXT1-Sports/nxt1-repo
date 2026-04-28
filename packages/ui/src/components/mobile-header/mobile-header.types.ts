/**
 * @fileoverview Mobile Header Types
 * @module @nxt1/ui/components/mobile-header
 * @version 1.0.0
 *
 * Type definitions for the mobile top navigation header bar.
 * YouTube mobile app-inspired: hamburger | logo | search | more | sign-in.
 * Pure TypeScript — 100% portable.
 */

/**
 * Mobile header configuration.
 */
export interface MobileHeaderConfig {
  /** Show back arrow instead of hamburger menu (e.g. on profile pages) */
  readonly showBack?: boolean;

  /** Whether to show the NXT1 logo */
  readonly showLogo?: boolean;

  /** Whether to show the search button */
  readonly showSearch?: boolean;

  /** Whether to show the more (kebab) menu button */
  readonly showMore?: boolean;

  /** Whether to show the edit (pencil) button — used on own profile pages */
  readonly showEdit?: boolean;

  /** Whether to show notifications bell */
  readonly showNotifications?: boolean;

  /** Notification badge count */
  readonly notificationCount?: number;

  /** Whether to show sign-in button for unauthenticated users */
  readonly showSignIn?: boolean;

  /** Whether to stick to the top */
  readonly sticky?: boolean;

  /** Whether to hide on scroll down */
  readonly hideOnScroll?: boolean;

  /** Whether to show bottom border */
  readonly bordered?: boolean;

  /** Search placeholder text */
  readonly searchPlaceholder?: string;

  /** Visual variant */
  readonly variant?: 'default' | 'blur' | 'elevated';

  /** Whether to show user avatar button (default: true) */
  readonly showAvatar?: boolean;

  /** Whether to show mark-all-read button (e.g. on activity page) */
  readonly showMarkAllRead?: boolean;

  /**
   * Page title to display in the header center when `showLogo` is false.
   * Used on authenticated routes to show the current screen name.
   */
  readonly title?: string;

  /** Whether to show the filter icon button (e.g. on Explore page) */
  readonly showFilter?: boolean;

  /** Number of active filters — renders a green badge dot when > 0 */
  readonly filterActiveCount?: number;

  /** Whether to show the help (?) icon button (e.g. on Billing page) */
  readonly showHelp?: boolean;

  /** Whether to show the budget/settings icon button for org users (e.g. on Billing page) */
  readonly showBudget?: boolean;

  /** Whether to show the Agent X activity bell button */
  readonly showActivity?: boolean;

  /** Unread count for the Agent X activity bell dot */
  readonly activityUnreadCount?: number;

  /** Whether to show the Agent X usage/billing card button */
  readonly showUsage?: boolean;

  /**
   * Whether to show the hamburger menu button on the left.
   * Defaults to true. Set to false to hide it on pages that don't need a sidebar (e.g. Settings).
   * When false and showBack is also false, no left icon is rendered.
   */
  readonly showMenu?: boolean;
}

/**
 * Mobile header user data (simple — avatar only).
 */
export interface MobileHeaderUserData {
  /** User's display name */
  readonly name: string;

  /** Profile image URL */
  readonly profileImg?: string;

  /** Initials (fallback for avatar) */
  readonly initials?: string;

  /** Whether this user is a team-management role (coach/director) */
  readonly isTeamRole?: boolean;

  /** Whether the team-role user currently has a real team association. */
  readonly isOnTeam?: boolean;

  /** Whether the user may create a new team/sport profile from the switcher. */
  readonly canAddProfile?: boolean;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Default mobile header configuration.
 */
export const DEFAULT_MOBILE_HEADER_CONFIG: MobileHeaderConfig = {
  showBack: false,
  showMenu: true,
  showLogo: true,
  showSearch: true,
  showMore: false,
  showEdit: false,
  showNotifications: true,
  notificationCount: 0,
  showSignIn: true,
  sticky: true,
  hideOnScroll: false,
  bordered: true,
  searchPlaceholder: 'Search NXT1',
  variant: 'default',
  showAvatar: true,
  showMarkAllRead: false,
};

/**
 * Create a mobile header configuration with defaults.
 */
export function createMobileHeaderConfig(
  config: Partial<MobileHeaderConfig> = {}
): MobileHeaderConfig {
  return {
    ...DEFAULT_MOBILE_HEADER_CONFIG,
    ...config,
  };
}
