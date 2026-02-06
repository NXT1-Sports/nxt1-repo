/**
 * @fileoverview Scout Reports UI Module Exports
 * @module @nxt1/ui/scout-reports
 * @version 1.0.0
 *
 * Barrel export for all scout reports UI components, services, and utilities.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```typescript
 * import {
 *   ScoutReportsShellComponent,
 *   ScoutReportCardComponent,
 *   ScoutReportsService,
 * } from '@nxt1/ui/scout-reports';
 * ```
 */

// ============================================
// COMPONENTS
// ============================================

export { ScoutReportsShellComponent } from './scout-reports-shell.component';
export { ScoutReportsContentComponent } from './scout-reports-content.component';
export { ScoutReportListComponent } from './scout-report-list.component';
export { ScoutReportCardComponent } from './scout-report-card.component';
export { ScoutReportSkeletonComponent } from './scout-report-skeleton.component';
export { ScoutReportDetailSkeletonComponent } from './scout-report-detail-skeleton.component';
export { ScoutReportEmptyStateComponent } from './scout-report-empty-state.component';
export { ScoutReportCategoryTabsComponent } from './scout-report-category-tabs.component';
export { ScoutReportSearchBarComponent } from './scout-report-search-bar.component';
export {
  ScoutReportSortSelectorComponent,
  type ScoutReportSortOption,
} from './scout-report-sort-selector.component';
export { ScoutReportFilterPanelComponent } from './scout-report-filter-panel.component';
export { ScoutReportRatingDisplayComponent } from './scout-report-rating-display.component';
export {
  ScoutReportQuickStatsComponent,
  type QuickStatItem,
} from './scout-report-quick-stats.component';
export { ScoutReportBookmarkButtonComponent } from './scout-report-bookmark-button.component';
export {
  ScoutReportPremiumBadgeComponent,
  type PremiumBadgeVariant,
} from './scout-report-premium-badge.component';

// ============================================
// SERVICES
// ============================================

export { ScoutReportsService } from './scout-reports.service';
export { ScoutReportsApiService } from './scout-reports-api.service';

// ============================================
// MOCK DATA
// ============================================

export {
  MOCK_SCOUT_REPORTS,
  MOCK_CATEGORY_BADGES,
  getMockReportsByCategory,
  getMockReportCount,
} from './scout-reports.mock-data';

// ============================================
// RE-EXPORT TYPES FROM CORE
// ============================================

export type {
  ScoutReport,
  ScoutReportAthlete,
  ScoutRating,
  RatingTier,
  ScoutReportFilter,
  ScoutReportPagination,
  ScoutReportViewMode,
  ScoutReportCategoryId,
  ScoutReportCategory,
  ScoutReportSortBy,
  SortOrder,
  ScoutReportsApi,
} from '@nxt1/core';
