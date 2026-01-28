/**
 * @fileoverview NxtHeader Module Exports
 * @module @nxt1/ui/components/top-nav
 *
 * Responsive navigation component with full design token integration.
 * Professional 2026 native-app-style navigation for all screen sizes.
 */

export { NxtHeaderComponent } from './top-nav.component';
export {
  type TopNavSelectEvent,
  type TopNavUserMenuEvent,
  type TopNavSearchSubmitEvent,
} from './top-nav.types';

// Re-export core types for convenience
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
