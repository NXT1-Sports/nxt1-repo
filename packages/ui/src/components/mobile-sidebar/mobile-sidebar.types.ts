/**
 * @fileoverview Mobile Sidebar Types
 * @module @nxt1/ui/components/mobile-sidebar
 * @version 1.0.0
 *
 * Type definitions for the mobile slide-out sidebar drawer.
 * Reuses DesktopSidebarItem/Section for consistency.
 * Pure TypeScript — 100% portable.
 */

import type {
  DesktopSidebarItem,
  DesktopSidebarSection,
  DesktopSidebarUserData,
} from '../desktop-sidebar/desktop-sidebar.types';

// Re-export for convenience — mobile sidebar uses the same nav types
export type MobileSidebarItem = DesktopSidebarItem;
export type MobileSidebarSection = DesktopSidebarSection;
export type MobileSidebarUserData = DesktopSidebarUserData;

/**
 * Mobile sidebar configuration.
 */
export interface MobileSidebarConfig {
  /** Whether to show the NXT1 logo in the sidebar header */
  readonly showLogo?: boolean;

  /** Whether to show user section when authenticated */
  readonly showUserSection?: boolean;

  /** Whether to show theme toggle */
  readonly showThemeToggle?: boolean;

  /** Whether to show the "Explore" section (Shopping, Music, etc.) */
  readonly showExplore?: boolean;

  /** Whether to show sign-in prompt for unauthenticated users */
  readonly showSignIn?: boolean;

  /** Visual variant */
  readonly variant?: 'default' | 'elevated';

  /** Width of the sidebar drawer (CSS value) */
  readonly width?: string;
}

/**
 * Mobile sidebar item selection event.
 */
export interface MobileSidebarSelectEvent {
  /** Selected item */
  readonly item: MobileSidebarItem;

  /** Section ID */
  readonly sectionId: string;

  /** DOM event */
  readonly event: Event;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Default mobile sidebar configuration.
 */
export const DEFAULT_MOBILE_SIDEBAR_CONFIG: MobileSidebarConfig = {
  showLogo: true,
  showUserSection: true,
  showThemeToggle: true,
  showExplore: false,
  showSignIn: true,
  variant: 'default',
  width: '280px',
};

/**
 * Create a mobile sidebar configuration with defaults.
 */
export function createMobileSidebarConfig(
  config: Partial<MobileSidebarConfig> = {}
): MobileSidebarConfig {
  return {
    ...DEFAULT_MOBILE_SIDEBAR_CONFIG,
    ...config,
  };
}
