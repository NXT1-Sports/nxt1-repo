/**
 * @fileoverview NxtSidenav Barrel Export
 * @module @nxt1/ui/components/sidenav
 *
 * Shared sidenav/drawer component for cross-platform navigation.
 * Works identically on Web, iOS, and Android with native-style animations.
 *
 * Architecture:
 * - Pure TypeScript types from @nxt1/core (100% portable)
 * - Angular component in @nxt1/ui
 * - Service for programmatic control
 */

// Component
export { NxtSidenavComponent } from './sidenav.component';

// Service
export { NxtSidenavService } from './sidenav.service';

// Types (re-exported from @nxt1/core for convenience)
export type {
  SidenavIconName,
  SocialLink,
  SidenavItem,
  SidenavSection,
  SidenavSportProfile,
  SidenavUserData,
  SidenavVariant,
  SidenavPosition,
  SidenavMode,
  SidenavConfig,
  SidenavSelectEvent,
  SidenavToggleEvent,
  SidenavSectionToggleEvent,
  // Angular-specific types
  SidenavItemSelectEvent,
  SidenavToggleEventAngular,
} from './sidenav.types';

// Constants (re-exported from @nxt1/core for convenience)
export {
  DEFAULT_SOCIAL_LINKS,
  DEFAULT_SIDENAV_ITEMS,
  SIDENAV_WIDTHS,
  SIDENAV_Z_INDEX,
  SIDENAV_ANIMATION,
  SIDENAV_GESTURE,
} from './sidenav.types';

// Helper functions (re-exported from @nxt1/core for convenience)
export {
  createSidenavConfig,
  findSidenavItemById,
  findSidenavItemByRoute,
  updateSidenavBadge,
  toggleSidenavSection,
  filterSidenavByRoles,
} from './sidenav.types';
