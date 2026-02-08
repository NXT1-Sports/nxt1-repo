/**
 * @fileoverview Profile Module - Public API
 * @module @nxt1/ui/profile
 * @version 2.0.0
 *
 * ADAPTIVE DESIGN PATTERN:
 * - ProfileShellComponent → Mobile (Ionic)
 * - ProfileShellWebComponent → Web (Tailwind, SSR-optimized)
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
// SHELL COMPONENTS
// ============================================

/** Mobile shell (Ionic) — For web SSR, use ProfileShellWebComponent instead */
export { ProfileShellComponent, type ProfileShellUser } from './profile-shell.component';

// Web-optimized shell (Tailwind, semantic HTML, Grade A+ SEO)
export { ProfileShellWebComponent } from './web/profile-shell-web.component';

// ============================================
// SECTION COMPONENTS
// ============================================

/** Mobile header (Ionic) — For web SSR, use ProfileHeaderWebComponent instead */
export { ProfileHeaderComponent } from './profile-header.component';

// Web-optimized header (YouTube-style, Tailwind, zero Ionic)
export { ProfileHeaderWebComponent } from './web/profile-header-web.component';

export { ProfileStatsBarComponent } from './profile-stats-bar.component';
export { ProfileTimelineComponent } from './profile-timeline.component';
export { ProfileOffersComponent } from './profile-offers.component';
export {
  ProfileSkeletonComponent,
  type ProfileSkeletonVariant,
} from './profile-skeleton.component';

// ============================================
// MOCK DATA (Development Only)
// ============================================

export {
  MOCK_PROFILE_USER,
  MOCK_FOLLOW_STATS,
  MOCK_QUICK_STATS,
  MOCK_PINNED_VIDEO,
  MOCK_POSTS,
  MOCK_OFFERS,
  MOCK_ATHLETIC_STATS,
  MOCK_EVENTS,
  MOCK_PROFILE_PAGE_DATA,
} from './profile.mock-data';
