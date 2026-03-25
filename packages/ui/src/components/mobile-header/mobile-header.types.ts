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
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Default mobile header configuration.
 */
export const DEFAULT_MOBILE_HEADER_CONFIG: MobileHeaderConfig = {
  showBack: false,
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
