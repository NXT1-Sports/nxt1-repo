/**
 * @fileoverview NxtMobileFooter Barrel Export
 * @module @nxt1/ui/components/footer
 *
 * Shared mobile footer/tab bar component for cross-platform navigation.
 * Works identically on Web, iOS, and Android.
 *
 * Architecture:
 * - Pure TypeScript types from @nxt1/core (100% portable)
 * - Angular component in @nxt1/ui
 */

// Component
export { NxtMobileFooterComponent } from './footer.component';

// Types (re-exported from @nxt1/core for convenience)
export type {
  NavIconName,
  FooterTabItem,
  FooterVariant,
  FooterIndicatorStyle,
  FooterConfig,
  FooterTabSelectEvent,
  FooterTabSelectEventBase,
  FooterScrollToTopEvent,
} from './footer.types';

// Constants (re-exported from @nxt1/core for convenience)
export {
  DEFAULT_FOOTER_TABS,
  CENTERED_CREATE_FOOTER_TABS,
  AGENT_X_CENTER_FOOTER_TABS,
  AGENT_X_LEFT_FOOTER_TABS,
  FOOTER_HEIGHTS,
  FOOTER_ANIMATION,
  MAIN_PAGE_ROUTES,
} from './footer.types';

// Helper functions (re-exported from @nxt1/core for convenience)
export {
  findTabById,
  findTabByRoute,
  createFooterConfig,
  updateTabBadge,
  setTabDisabled,
  isMainPageRoute,
} from './footer.types';
