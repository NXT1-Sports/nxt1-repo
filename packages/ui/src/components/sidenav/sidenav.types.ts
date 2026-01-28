/**
 * @fileoverview NxtSidenav Types - Re-export from @nxt1/core
 * @module @nxt1/ui/components/sidenav
 *
 * Type definitions for the sidenav/drawer component.
 * Re-exports types from @nxt1/core for convenience.
 *
 * Architecture:
 * - Pure TypeScript types live in @nxt1/core (100% portable)
 * - @nxt1/ui re-exports for convenience and adds Angular-specific event types
 */

// Re-export all sidenav types from @nxt1/core
export {
  type SidenavIconName,
  type SocialLink,
  type SidenavItem,
  type SidenavSection,
  type SidenavUserData,
  type SidenavVariant,
  type SidenavPosition,
  type SidenavMode,
  type SidenavConfig,
  type SidenavSelectEvent,
  type SidenavToggleEvent,
  type SidenavSectionToggleEvent,
  DEFAULT_SOCIAL_LINKS,
  DEFAULT_SIDENAV_ITEMS,
  SIDENAV_WIDTHS,
  SIDENAV_Z_INDEX,
  SIDENAV_ANIMATION,
  SIDENAV_GESTURE,
  createSidenavConfig,
  findSidenavItemById,
  findSidenavItemByRoute,
  updateSidenavBadge,
  toggleSidenavSection,
  filterSidenavByRoles,
} from '@nxt1/core';

/**
 * Angular-specific sidenav item selection event.
 * Extends the core type with the native DOM event.
 */
export interface SidenavItemSelectEvent {
  /** Selected item */
  item: import('@nxt1/core').SidenavItem;

  /** Parent item ID (if nested) */
  parentId?: string;

  /** Whether item is a child */
  isChild?: boolean;

  /** Native DOM event (Angular-specific) */
  event: Event;

  /** Event timestamp */
  timestamp: number;
}

/**
 * Angular-specific sidenav toggle event.
 * Extends the core type with additional Angular context.
 */
export interface SidenavToggleEventAngular {
  /** Whether sidenav is now open */
  isOpen: boolean;

  /** What triggered the toggle */
  trigger: 'button' | 'backdrop' | 'swipe' | 'programmatic';

  /** Native DOM event (if user-triggered) */
  event?: Event;

  /** Event timestamp */
  timestamp: number;
}
