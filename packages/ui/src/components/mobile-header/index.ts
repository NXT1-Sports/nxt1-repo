/**
 * @fileoverview NxtMobileHeader Barrel Export
 * @module @nxt1/ui/components/mobile-header
 *
 * Professional mobile top navigation bar for web applications.
 * YouTube mobile app-inspired: hamburger | logo | search | sign-in.
 *
 * Architecture:
 * - Minimal top bar with essential action buttons
 * - Hamburger button opens the mobile sidebar drawer
 * - Search, notifications, and user avatar actions
 * - 100% design token integration
 *
 * ⭐ MOBILE WEB ONLY — Use NxtHeaderComponent for desktop ⭐
 */

export { NxtMobileHeaderComponent } from './mobile-header.component';

export type { MobileHeaderConfig, MobileHeaderUserData } from './mobile-header.types';

export { DEFAULT_MOBILE_HEADER_CONFIG, createMobileHeaderConfig } from './mobile-header.types';
