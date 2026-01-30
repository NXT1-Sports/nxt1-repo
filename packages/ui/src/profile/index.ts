/**
 * @fileoverview Profile Module - Public API
 * @module @nxt1/ui/profile
 * @version 1.0.0
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * This module exports all profile-related components and services.
 *
 * @example
 * ```typescript
 * import {
 *   ProfileShellComponent,
 *   ProfileService,
 *   ProfileHeaderComponent,
 * } from '@nxt1/ui';
 * ```
 */

// ============================================
// SERVICE
// ============================================

export { ProfileService } from './profile.service';

// ============================================
// SHELL COMPONENT (Main Entry Point)
// ============================================

export { ProfileShellComponent, type ProfileShellUser } from './profile-shell.component';

// ============================================
// SECTION COMPONENTS
// ============================================

export { ProfileHeaderComponent } from './profile-header.component';
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
