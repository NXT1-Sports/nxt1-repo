/**
 * @fileoverview Missions UI Module Barrel Export
 * @module @nxt1/ui/missions
 * @version 1.0.0
 *
 * Public API for the missions UI module.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```typescript
 * import {
 *   MissionsShellComponent,
 *   MissionsService,
 *   MissionsProgressComponent,
 * } from '@nxt1/ui/missions';
 * ```
 */

// ============================================
// COMPONENTS
// ============================================

export { MissionsShellComponent } from './missions-shell.component';
export { MissionsProgressComponent } from './missions-progress.component';
export { MissionsCategoryComponent } from './missions-category.component';
export { MissionsItemComponent } from './missions-item.component';
export { MissionsBadgeComponent, MissionsBadgeGridComponent } from './missions-badge.component';
export {
  MissionsSkeletonComponent,
  MissionsProgressSkeletonComponent,
  MissionsItemSkeletonComponent,
} from './missions-skeleton.component';

// ============================================
// SERVICES
// ============================================

export { MissionsService } from './missions.service';

// ============================================
// MOCK DATA (for development)
// ============================================

export {
  MOCK_ATHLETE_MISSIONS,
  MOCK_COACH_MISSIONS,
  MOCK_ATHLETE_PROGRESS,
  MOCK_COACH_PROGRESS,
} from './missions.mock-data';
