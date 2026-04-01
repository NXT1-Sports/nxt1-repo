/**
 * @fileoverview Profile Module - Public API
 * @module @nxt1/ui/profile
 * @version 3.0.0
 *
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────────────┐
 * │         components/ — SHARED (~95 %)                        │
 * │   ProfileOverviewComponent, ProfileStatsComponent, etc.     │
 * │   Platform-agnostic Angular — used by BOTH shells           │
 * ├────────────────────────┬────────────────────────────────────┤
 * │  ProfileShellComponent │  ProfileShellWebComponent          │
 * │  (Ionic mobile shell)  │  (SSR web shell in web/)           │
 * └────────────────────────┴────────────────────────────────────┘
 *
 * Import based on platform:
 * ```typescript
 * // Mobile app (Ionic)
 * import { ProfileShellComponent } from '@nxt1/ui';
 *
 * // Web app (SSR, Grade A+ SEO)
 * import { ProfileShellWebComponent } from '@nxt1/ui';
 * ```
 */

// ============================================
// SERVICE (Shared)
// ============================================

export { ProfileService } from './profile.service';

// ============================================
// MAPPERS (Platform-agnostic, shared web+mobile)
// ============================================

export { userToProfilePageData } from './profile-mappers';

// ============================================
// SHELL COMPONENTS
// ============================================

/** Mobile shell (Ionic) — For web SSR, use ProfileShellWebComponent instead */
export { ProfileShellComponent, type ProfileShellUser } from './profile-shell.component';

// Web-optimized shell (Tailwind, semantic HTML, Grade A+ SEO)
export { ProfileShellWebComponent } from './web/profile-shell-web.component';

// ============================================
// SHARED SECTION COMPONENTS (used by both shells)
// ============================================

export {
  ProfileOverviewComponent,
  ProfileMetricsComponent,
  ProfileContactComponent,
  ProfileAcademicComponent,
  ProfileScoutingComponent,
  ProfileMobileHeroComponent,
  ProfileVerificationBannerComponent,
} from './components';

// ============================================
// WEB-ONLY COMPONENTS
// ============================================

/** Mobile header (Ionic) — For web SSR, use ProfileHeaderWebComponent instead */
export { ProfileHeaderComponent } from './profile-header.component';

// Web-optimized header (YouTube-style, Tailwind, zero Ionic)
export { ProfileHeaderWebComponent } from './web/profile-header-web.component';

// Madden-style profile page header (desktop only)
export { ProfilePageHeaderComponent } from './web/profile-page-header.component';

// Related Athletes discovery row (web only)
export { RelatedAthletesComponent, type RelatedAthlete } from './web/related-athletes.component';

// ============================================
// OTHER SECTION COMPONENTS (shared, root-level)
// ============================================

export { ProfileTimelineComponent } from './profile-timeline.component';
export { ProfileOffersComponent } from './profile-offers.component';
export { ProfileRankingsComponent } from './rankings/profile-rankings.component';
export type { RankingSource } from './rankings/profile-rankings.component';
export { ProfileEventsComponent } from './profile-events.component';
export {
  ProfileSkeletonComponent,
  type ProfileSkeletonVariant,
} from './profile-skeleton.component';

// ============================================
// MOCK DATA (Development Only)
// ============================================
// Mock data is preserved in profile.mock-data.ts for development/testing
// but no longer exported from the public API — production code uses real API data.

// ============================================
// PROFILE GENERATION (Agent X Onboarding Scrape)
// ============================================

export {
  ProfileGenerationStateService,
  type GenerationPhase,
  type GenerationSnapshot,
} from './profile-generation-state.service';

export { ProfileGenerationOverlayComponent } from './profile-generation-overlay.component';

export { ProfileGenerationBannerComponent } from './profile-generation-banner.component';
