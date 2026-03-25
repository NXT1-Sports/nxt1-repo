/**
 * @fileoverview NxtMobileSidebar Barrel Export
 * @module @nxt1/ui/components/mobile-sidebar
 *
 * Professional mobile slide-out sidebar drawer for web applications.
 * YouTube mobile-inspired navigation pattern.
 *
 * Architecture:
 * - Slide-out drawer from left (hamburger menu)
 * - Full-screen overlay with backdrop blur
 * - Reuses same section/item types as desktop sidebar
 * - Full keyboard navigation and accessibility
 * - 100% design token integration
 *
 * ⭐ MOBILE WEB ONLY — Use NxtDesktopSidebar for desktop ⭐
 */

export { NxtMobileSidebarComponent } from './mobile-sidebar.component';

export type {
  MobileSidebarConfig,
  MobileSidebarItem,
  MobileSidebarSection,
  MobileSidebarUserData,
  MobileSidebarSelectEvent,
  MobileSidebarSportSelectEvent,
} from './mobile-sidebar.types';

export { DEFAULT_MOBILE_SIDEBAR_CONFIG, createMobileSidebarConfig } from './mobile-sidebar.types';
