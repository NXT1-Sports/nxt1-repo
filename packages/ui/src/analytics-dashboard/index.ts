/**
 * @fileoverview Analytics Dashboard Module - Public API
 * @module @nxt1/ui/analytics-dashboard
 * @version 1.0.0
 *
 * Public exports for the Analytics Dashboard feature.
 * Import from '@nxt1/ui' for all analytics dashboard components and services.
 *
 * @example
 * ```typescript
 * import {
 *   AnalyticsDashboardShellComponent,
 *   AnalyticsDashboardService,
 * } from '@nxt1/ui';
 * ```
 */

// ============================================
// COMPONENTS
// ============================================

export {
  AnalyticsDashboardShellComponent,
  type AnalyticsUser,
} from './analytics-dashboard-shell.component';

// ============================================
// WEB COMPONENTS (Zero Ionic)
// ============================================

export { AnalyticsDashboardShellWebComponent } from './web';

// ============================================
// SERVICES
// ============================================

export { AnalyticsDashboardService } from './analytics-dashboard.service';

// ============================================
// MOCK DATA (Development Only)
// ============================================

export {
  getMockAthleteReport,
  getMockCoachReport,
  // Individual mock exports for testing
  MOCK_ATHLETE_OVERVIEW_CARDS,
  MOCK_COACH_OVERVIEW_CARDS,
  MOCK_VIEWS_BY_SOURCE,
  MOCK_GEO_DISTRIBUTION,
  MOCK_VIEWER_TYPES,
  MOCK_ENGAGEMENT_BY_TIME,
  MOCK_VIEWS_CHART,
  MOCK_VIDEO_ANALYTICS,
  MOCK_COLLEGE_INTERESTS,
  MOCK_RECRUITING_MILESTONES,
  MOCK_ROSTER_ANALYTICS,
  MOCK_TEAM_OVERVIEW,
  MOCK_TOP_PERFORMER,
  MOCK_ATHLETE_INSIGHTS,
  MOCK_COACH_INSIGHTS,
  MOCK_ATHLETE_RECOMMENDATIONS,
  MOCK_COACH_RECOMMENDATIONS,
} from './analytics-dashboard.mock-data';
