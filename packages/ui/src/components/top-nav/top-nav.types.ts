/**
 * @fileoverview NxtHeader Types - Angular-specific event types
 * @module @nxt1/ui/components/top-nav
 *
 * Re-exports pure TypeScript types from @nxt1/core and adds Angular-specific event types.
 */

// Re-export all navigation types from @nxt1/core
export {
  type TopNavIconName,
  type TopNavItem,
  type TopNavDropdownItem,
  type TopNavUserMenuItem,
  type TopNavUserData,
  type TopNavVariant,
  type TopNavConfig,
  type TopNavActionEvent,
  type TopNavSearchEvent,
  DEFAULT_TOP_NAV_ITEMS,
  DEFAULT_USER_MENU_ITEMS,
  TOP_NAV_HEIGHTS,
  TOP_NAV_ANIMATION,
  createTopNavConfig,
  findTopNavItemById,
  findTopNavItemByRoute,
  updateTopNavBadge,
} from '@nxt1/core';

/**
 * Angular-specific navigation item selection event.
 * Extends core types with native DOM event for Angular event handling.
 */
export interface TopNavSelectEvent {
  /** Selected nav item */
  item: import('@nxt1/core').TopNavItem;

  /** Native DOM event */
  event: Event;

  /** Whether navigation should be prevented (for custom handling) */
  preventDefault?: boolean;

  /** Event timestamp */
  timestamp: number;
}

/**
 * User menu action event for Angular components
 */
export interface TopNavUserMenuEvent {
  /** Menu item that was selected */
  item: import('@nxt1/core').TopNavUserMenuItem;

  /** Action identifier (matches item.action or item.id) */
  action: string;

  /** Native DOM event */
  event: Event;

  /** Event timestamp */
  timestamp: number;
}

/**
 * Search event for Angular components
 */
export interface TopNavSearchSubmitEvent {
  /** Search query string */
  query: string;

  /** Native DOM event */
  event: Event;

  /** Event timestamp */
  timestamp: number;
}
