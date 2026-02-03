/**
 * @fileoverview Scout Reports Module - Barrel Export
 * @module @nxt1/core/scout-reports
 * @version 1.0.0
 *
 * Exports all Scout Reports feature types, constants, API, validation, and helpers.
 * 100% portable - no platform dependencies.
 */

// ============================================
// TYPES
// ============================================

export type {
  // Category types
  ScoutReportCategoryId,
  ScoutReportCategory,
  // Rating types
  RatingTier,
  ScoutRating,
  RatingComparison,
  // Athlete types
  AthleteSport,
  AthleteStats,
  ScoutReportAthlete,
  // Scout/Report types
  ScoutInfo,
  ScoutReportVideoClip,
  ScoutReport,
  // Filter types
  ScoutReportSortBy,
  SortOrder,
  ScoutReportFilter,
  // Pagination types
  ScoutReportPagination,
  // API response types
  ScoutReportListResponse,
  ScoutReportDetailResponse,
  ScoutReportBookmarkResponse,
  ScoutReportViewResponse,
  ScoutReportSummary,
  // State types
  ScoutReportState,
  // XP/Gamification types
  ScoutReportXpReward,
  ScoutReportMilestone,
  // Layout types
  ScoutReportViewMode,
  ScoutReportLayoutConfig,
} from './scout-reports.types';

// ============================================
// CONSTANTS
// ============================================

export {
  // Category configuration
  SCOUT_REPORT_CATEGORIES,
  SCOUT_REPORT_DEFAULT_CATEGORY,
  // Rating configuration
  RATING_TIER_THRESHOLDS,
  RATING_TIER_COLORS,
  RATING_TIER_LABELS,
  RATING_TIER_ICONS,
  // Sport configuration
  SPORT_ICONS,
  SPORT_LABELS,
  SPORT_COLORS,
  // Position configuration
  FOOTBALL_POSITIONS,
  BASKETBALL_POSITIONS,
  BASEBALL_POSITIONS,
  POSITIONS_BY_SPORT,
  // Graduation years (use SCOUT_REPORT_GRADUATION_YEARS to avoid conflict)
  GRADUATION_YEARS as SCOUT_REPORT_GRADUATION_YEARS,
  // Sort options
  SCOUT_REPORT_SORT_OPTIONS,
  // XP & Gamification
  SCOUT_REPORT_XP_REWARDS,
  SCOUT_REPORT_MILESTONES,
  // Pagination defaults
  SCOUT_REPORT_PAGINATION_DEFAULTS,
  // Layout defaults
  SCOUT_REPORT_LAYOUT_DEFAULTS,
  // Cache keys
  SCOUT_REPORT_CACHE_KEYS,
  // API endpoints
  SCOUT_REPORT_API_ENDPOINTS,
  // UI constants
  SCOUT_REPORT_CARD_ASPECT,
  SCOUT_REPORT_ANIMATIONS,
  SCOUT_REPORT_SKELETON_COUNT,
  SCOUT_REPORT_SUMMARY_PREVIEW_LENGTH,
  SCOUT_REPORT_MAX_CARD_HIGHLIGHTS,
} from './scout-reports.constants';

// ============================================
// API
// ============================================

export { createScoutReportsApi, type ScoutReportsApi } from './scout-reports.api';

// ============================================
// VALIDATION
// ============================================

export {
  // Types
  type ScoutReportValidationError,
  type ScoutReportValidationResult,
  // Rating validation
  isValidRating,
  validateRating,
  // Athlete validation
  isValidScoutSport,
  isValidGradYear,
  validateAthlete,
  // Report validation
  validateScoutReport,
  // Filter validation
  isValidCategory,
  isValidSortBy,
  validateFilter,
  // Search validation
  validateSearchQuery,
  // Sanitization
  sanitizeFilter,
} from './scout-reports.validation';

// ============================================
// HELPERS
// ============================================

export {
  // Rating helpers
  getRatingTier,
  getRatingColor,
  getRatingLabel,
  formatRating,
  calculateStars,
  calculateAverageRating,
  getRatingPercentage,
  // Sport & Position helpers
  getSportLabel,
  getSportIcon,
  getSportColor,
  getPositionInfo,
  getPositionLabel,
  getPositionColor,
  // Text formatting helpers
  formatGradYear,
  truncateSummary,
  formatViewCount,
  formatRelativeTime,
  // Stat helpers
  formatHeight,
  formatWeight,
  // Filter helpers
  hasActiveFilters,
  countActiveFilters,
  buildFilterDescription,
  // Category helpers
  getCategoryGradYear,
  buildFilterFromCategory,
  // Sorting helpers
  sortReports,
  // XP helpers
  calculateTotalXp,
  isMilestoneReached,
} from './scout-reports.helpers';
