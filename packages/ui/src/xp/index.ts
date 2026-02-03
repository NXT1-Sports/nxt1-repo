/**
 * @fileoverview XP UI Module Barrel Export
 * @module @nxt1/ui/xp
 * @version 1.0.0
 *
 * Public API for the XP (gamified tasks) UI module.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```typescript
 * import {
 *   XpShellComponent,
 *   XpService,
 *   XpProgressComponent,
 * } from '@nxt1/ui/xp';
 * ```
 */

// ============================================
// COMPONENTS
// ============================================

export { XpShellComponent } from './xp-shell.component';
export { XpProgressComponent } from './xp-progress.component';
export { XpCategoryComponent } from './xp-category.component';
export { XpItemComponent } from './xp-item.component';
export { XpBadgeComponent, XpBadgeGridComponent } from './xp-badge.component';
export {
  XpSkeletonComponent,
  XpProgressSkeletonComponent,
  XpItemSkeletonComponent,
} from './xp-skeleton.component';

// ============================================
// SERVICES
// ============================================

export { XpService } from './xp.service';

// ============================================
// MOCK DATA (for development)
// ============================================

export {
  MOCK_ATHLETE_XP_TASKS,
  MOCK_COACH_XP_TASKS,
  MOCK_ATHLETE_PROGRESS,
  MOCK_COACH_PROGRESS,
} from './xp.mock-data';
