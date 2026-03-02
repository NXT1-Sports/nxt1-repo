/**
 * @fileoverview Shared Profile Components — Barrel Export
 * @module @nxt1/ui/profile/components
 *
 * Platform-agnostic profile sub-components used by BOTH the mobile (Ionic)
 * shell and the web (SSR) shell. Zero platform dependencies — pure Angular
 * with CSS custom properties.
 *
 * Architecture per @nxt1/ui:
 * ┌─────────────────────────────────────────────────────────────┐
 * │         components/ — SHARED (~95 %)                        │
 * │   ProfileOverviewComponent, ProfileStatsComponent, etc.     │
 * ├────────────────────────┬────────────────────────────────────┤
 * │  ProfileShellComponent │  ProfileShellWebComponent          │
 * │  (Ionic mobile shell)  │  (SSR web shell in web/)           │
 * └────────────────────────┴────────────────────────────────────┘
 */

// Content / Section Components
export { ProfileOverviewComponent } from './profile-overview.component';
export { ProfileMetricsComponent } from './profile-metrics.component';
export { ProfileContactComponent } from './profile-contact.component';
export { ProfileAcademicComponent } from './profile-academic.component';
export { ProfileScoutingComponent } from './profile-scouting.component';

// Hero / Identity
export { ProfileMobileHeroComponent } from './profile-mobile-hero.component';

// Banners
export { ProfileVerificationBannerComponent } from './profile-verification-banner.component';
