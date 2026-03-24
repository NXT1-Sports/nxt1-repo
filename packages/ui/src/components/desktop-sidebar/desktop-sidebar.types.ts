/**
 * @fileoverview Desktop Sidebar Types
 * @module @nxt1/ui/components/desktop-sidebar
 *
 * Type definitions for the fixed desktop sidebar component.
 * Pure TypeScript — 100% portable.
 */

// ============================================
// CORE TYPES
// ============================================

/**
 * Desktop sidebar navigation item.
 */
export interface DesktopSidebarItem {
  /** Unique identifier */
  readonly id: string;

  /** Display label */
  readonly label: string;

  /** Icon name from design system */
  readonly icon: string;

  /** Icon when item is active (optional, defaults to icon + 'Filled') */
  readonly activeIcon?: string;

  /** Route path */
  readonly route?: string;

  /** External URL (opens in new tab) */
  readonly href?: string;

  /** Badge count (e.g., unread notifications) */
  readonly badge?: number;

  /** Whether item is disabled */
  readonly disabled?: boolean;

  /** Whether item is hidden */
  readonly hidden?: boolean;

  /** Custom click handler (instead of navigation) */
  readonly action?: 'create' | 'settings' | 'help' | 'logout' | 'custom';

  /** Aria label override */
  readonly ariaLabel?: string;

  /** Whether this is a divider (visual separator) */
  readonly divider?: boolean;

  /** Nested child items (renders as expandable sub-list) */
  readonly children?: readonly DesktopSidebarItem[];

  /** Whether children are initially expanded (defaults to false) */
  readonly expanded?: boolean;
}

/**
 * Desktop sidebar section (group of items).
 */
export interface DesktopSidebarSection {
  /** Unique identifier */
  readonly id: string;

  /** Section label (shown when expanded, optional) */
  readonly label?: string;

  /** Items in this section */
  readonly items: readonly DesktopSidebarItem[];

  /** Whether section is collapsible */
  readonly collapsible?: boolean;

  /** Whether section is initially expanded */
  readonly expanded?: boolean;
}

/**
 * User data for sidebar header.
 */
export interface DesktopSidebarUserData {
  /** User's display name */
  readonly name: string;

  /** Profile image URL */
  readonly profileImg?: string;

  /** Initials (fallback for avatar) */
  readonly initials?: string;

  /** User's handle/username */
  readonly handle?: string;

  /** Whether user is verified */
  readonly verified?: boolean;

  /** Whether user is premium */
  readonly isPremium?: boolean;
}

/**
 * Desktop sidebar configuration.
 */
export interface DesktopSidebarConfig {
  /** Whether sidebar is collapsed (icons only) */
  readonly collapsed?: boolean;

  /** Whether to expand on hover when collapsed */
  readonly expandOnHover?: boolean;

  /** Whether to show the NXT1 logo */
  readonly showLogo?: boolean;

  /** Whether to show user section at bottom */
  readonly showUserSection?: boolean;

  /** Whether to show sign-in prompt for unauthenticated users */
  readonly showSignIn?: boolean;

  /** Whether to show theme toggle */
  readonly showThemeToggle?: boolean;

  /** Whether to persist collapsed state */
  readonly persistState?: boolean;

  /** Storage key for persisting state */
  readonly storageKey?: string;

  /** Visual variant */
  readonly variant?: 'default' | 'minimal' | 'elevated';

  /** Whether to show border */
  readonly bordered?: boolean;
}

/**
 * Sidebar item selection event.
 */
export interface DesktopSidebarSelectEvent {
  /** Selected item */
  readonly item: DesktopSidebarItem;

  /** Section ID */
  readonly sectionId: string;

  /** DOM event */
  readonly event: Event;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Responsive breakpoints for sidebar behavior.
 */
export const SIDEBAR_BREAKPOINTS = {
  /** Mobile: no sidebar (use footer) */
  MOBILE: 768,
  /** Tablet: collapsed sidebar */
  TABLET: 1280,
  /** Desktop: expanded sidebar */
  DESKTOP: 1280,
} as const;

/**
 * Sidebar width values.
 */
export const SIDEBAR_WIDTHS = {
  /** Expanded width */
  EXPANDED: 256,
  /** Collapsed width (icons only) */
  COLLAPSED: 72,
  /** Hover expanded width */
  HOVER_EXPANDED: 280,
} as const;

/**
 * Default sidebar configuration.
 */
export const DEFAULT_DESKTOP_SIDEBAR_CONFIG: DesktopSidebarConfig = {
  collapsed: false,
  expandOnHover: true,
  showLogo: true,
  showUserSection: true,
  showSignIn: true,
  showThemeToggle: true,
  persistState: true,
  storageKey: 'nxt1_sidebar_collapsed',
  variant: 'default',
  bordered: true,
};

/**
 * Default sidebar sections for NXT1 Sports.
 */
export const DEFAULT_DESKTOP_SIDEBAR_SECTIONS: readonly DesktopSidebarSection[] = [
  {
    id: 'main',
    items: [
      { id: 'explore', label: 'Explore', icon: 'compass', route: '/explore' },
      { id: 'rankings', label: 'Rankings', icon: 'trophy', route: '/rankings' },
    ],
  },
  {
    id: 'recruiting',
    label: 'Recruiting',
    items: [
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
      { id: 'analytics', label: 'Analytics', icon: 'barChart', route: '/analytics' },
      { id: 'xp', label: 'XP', icon: 'sparkles', route: '/xp' },
      { id: 'manage-team', label: 'Manage Team', icon: 'users', route: '/manage-team' },
    ],
  },
];

// ============================================
// AUTH-AWARE SECTION CONFIGURATIONS
// ============================================

/**
 * Sidebar sections visible to logged-OUT users.
 * Only public discovery pages — no personal/authenticated content.
 */
export const LOGGED_OUT_SIDEBAR_SECTIONS: readonly DesktopSidebarSection[] = [
  {
    id: 'main',
    items: [
      { id: 'explore', label: 'Explore', icon: 'compass', route: '/explore' },
      { id: 'rankings', label: 'Rankings', icon: 'trophy', route: '/rankings' },
    ],
  },
  {
    id: 'recruiting',
    label: 'Recruiting',
    items: [
      { id: 'colleges', label: 'Colleges', icon: 'graduationCap', route: '/colleges' },
      { id: 'teams', label: 'Teams', icon: 'users', route: '/teams' },
    ],
  },
];

/**
 * Sidebar sections visible to logged-IN users.
 * Full navigation including personal and authenticated content.
 */
export const LOGGED_IN_SIDEBAR_SECTIONS: readonly DesktopSidebarSection[] = [
  {
    id: 'main',
    items: [
      { id: 'explore', label: 'Explore', icon: 'compass', route: '/explore' },
      { id: 'rankings', label: 'Rankings', icon: 'trophy', route: '/rankings' },
    ],
  },
  {
    id: 'recruiting',
    label: 'Recruiting',
    items: [
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
      { id: 'analytics', label: 'Analytics', icon: 'barChart', route: '/analytics' },
      { id: 'xp', label: 'XP', icon: 'sparkles', route: '/xp' },
      { id: 'manage-team', label: 'Manage Team', icon: 'users', route: '/manage-team' },
    ],
  },
];

// ============================================
// AUTH-AWARE FACTORY FUNCTIONS
// ============================================

/**
 * Options for building auth-aware sidebar sections.
 * Role-based filtering is supported but optional (future-ready).
 */
export interface GetSidebarSectionsOptions {
  /** Whether the user is currently authenticated */
  readonly isAuthenticated: boolean;

  /**
   * User role for role-based filtering (optional, future-ready).
   * When provided, sections can be filtered by role.
   * Example: 'athlete' | 'coach' | 'director' | 'recruiter' | 'parent'
   */
  readonly role?: string;

  /**
   * Custom sections to merge/override defaults (optional).
   * Allows app-level customization without modifying library defaults.
   */
  readonly overrides?: readonly DesktopSidebarSection[];
}

/**
 * Get the correct sidebar sections based on authentication state.
 * Pure function — 100% portable, no side effects.
 *
 * Usage in shell component:
 * ```typescript
 * sidebarSections = computed(() =>
 *   getSidebarSections({ isAuthenticated: this.authService.isAuthenticated() })
 * );
 * ```
 *
 * Future role-based usage:
 * ```typescript
 * sidebarSections = computed(() =>
 *   getSidebarSections({
 *     isAuthenticated: true,
 *     role: this.authService.userRole(),
 *   })
 * );
 * ```
 */
export function getSidebarSections(
  options: GetSidebarSectionsOptions
): readonly DesktopSidebarSection[] {
  const { isAuthenticated, overrides } = options;

  // Select base sections by auth state
  const baseSections = isAuthenticated ? LOGGED_IN_SIDEBAR_SECTIONS : LOGGED_OUT_SIDEBAR_SECTIONS;

  // If overrides provided, merge them (override by section id)
  if (overrides && overrides.length > 0) {
    const overrideMap = new Map(overrides.map((s) => [s.id, s]));
    return baseSections.map((section) => overrideMap.get(section.id) ?? section);
  }

  return baseSections;
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create a desktop sidebar configuration with defaults.
 */
export function createDesktopSidebarConfig(
  config: Partial<DesktopSidebarConfig> = {}
): DesktopSidebarConfig {
  return {
    ...DEFAULT_DESKTOP_SIDEBAR_CONFIG,
    ...config,
  };
}
