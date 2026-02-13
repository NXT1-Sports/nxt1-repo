/**
 * @fileoverview NxtDesktopSidebar Barrel Export
 * @module @nxt1/ui/components/desktop-sidebar
 *
 * Professional fixed desktop sidebar component for web applications.
 * YouTube/Twitter/LinkedIn-inspired navigation pattern.
 *
 * Architecture:
 * - Fixed sidebar on desktop (≥1280px: expanded, 768-1279px: collapsed)
 * - Auto-collapse to icons-only on smaller screens
 * - Hover expand option when collapsed
 * - Full keyboard navigation and accessibility
 * - 100% design token integration
 *
 * ⭐ DESKTOP WEB ONLY — Use NxtMobileFooter for mobile ⭐
 */

export { NxtDesktopSidebarComponent } from './desktop-sidebar.component';

export type {
  DesktopSidebarConfig,
  DesktopSidebarSection,
  DesktopSidebarItem,
  DesktopSidebarUserData,
  DesktopSidebarSelectEvent,
} from './desktop-sidebar.types';

export {
  DEFAULT_DESKTOP_SIDEBAR_CONFIG,
  DEFAULT_DESKTOP_SIDEBAR_SECTIONS,
  LOGGED_IN_SIDEBAR_SECTIONS,
  LOGGED_OUT_SIDEBAR_SECTIONS,
  SIDEBAR_BREAKPOINTS,
  SIDEBAR_WIDTHS,
  createDesktopSidebarConfig,
  getSidebarSections,
} from './desktop-sidebar.types';

export type { GetSidebarSectionsOptions } from './desktop-sidebar.types';
