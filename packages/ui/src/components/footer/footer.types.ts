/**
 * @fileoverview NxtMobileFooter Types - Re-export from @nxt1/core
 * @module @nxt1/ui/components/footer
 *
 * Type definitions for the mobile footer/tab bar component.
 * Re-exports types from @nxt1/core for convenience.
 *
 * Architecture:
 * - Pure TypeScript types live in @nxt1/core (100% portable)
 * - @nxt1/ui re-exports for convenience and adds Angular-specific event types
 */

// Re-export all navigation types from @nxt1/core
export {
  type NavIconName,
  type FooterTabItem,
  type FooterVariant,
  type FooterIndicatorStyle,
  type FooterConfig,
  type FooterScrollToTopEvent,
  DEFAULT_FOOTER_TABS,
  FOOTER_HEIGHTS,
  FOOTER_ANIMATION,
  MAIN_PAGE_ROUTES,
  findTabById,
  findTabByRoute,
  createFooterConfig,
  updateTabBadge,
  setTabDisabled,
  isMainPageRoute,
} from '@nxt1/core';

// Re-export the base event type from core
export type { FooterTabSelectEvent as FooterTabSelectEventBase } from '@nxt1/core';

/**
 * Angular-specific tab selection event payload.
 * Extends the core type with the native DOM event.
 */
export interface FooterTabSelectEvent {
  /** Selected tab item */
  tab: import('@nxt1/core').FooterTabItem;

  /** Previous tab item (if any) */
  previousTab?: import('@nxt1/core').FooterTabItem;

  /** Native DOM event (Angular-specific) */
  event: Event;

  /** Event timestamp */
  timestamp?: number;
}
