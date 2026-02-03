/**
 * @fileoverview Scout Reports Validation
 * @module @nxt1/core/scout-reports
 * @version 1.0.0
 *
 * Pure validation functions for scout reports data.
 * 100% portable - no platform dependencies.
 */

import type {
  ScoutReport,
  ScoutReportFilter,
  ScoutRating,
  ScoutReportAthlete,
  AthleteSport,
  ScoutReportCategoryId,
  ScoutReportSortBy,
} from './scout-reports.types';
import { SCOUT_REPORT_CATEGORIES, SPORT_LABELS, GRADUATION_YEARS } from './scout-reports.constants';

// ============================================
// VALIDATION RESULT TYPES
// ============================================

/**
 * Validation error with field path.
 */
export interface ScoutReportValidationError {
  readonly field: string;
  readonly message: string;
}

/**
 * Validation result.
 */
export interface ScoutReportValidationResult {
  readonly isValid: boolean;
  readonly errors: ScoutReportValidationError[];
}

// ============================================
// RATING VALIDATION
// ============================================

/**
 * Validate a rating value (1.0 - 5.0).
 */
export function isValidRating(rating: number): boolean {
  return typeof rating === 'number' && rating >= 1.0 && rating <= 5.0 && !isNaN(rating);
}

/**
 * Validate a ScoutRating object.
 */
export function validateRating(rating: ScoutRating): ScoutReportValidationResult {
  const errors: ScoutReportValidationError[] = [];

  if (!rating) {
    errors.push({ field: 'rating', message: 'Rating is required' });
    return { isValid: false, errors };
  }

  if (!isValidRating(rating.overall)) {
    errors.push({ field: 'rating.overall', message: 'Overall rating must be between 1.0 and 5.0' });
  }
  if (!isValidRating(rating.physical)) {
    errors.push({
      field: 'rating.physical',
      message: 'Physical rating must be between 1.0 and 5.0',
    });
  }
  if (!isValidRating(rating.technical)) {
    errors.push({
      field: 'rating.technical',
      message: 'Technical rating must be between 1.0 and 5.0',
    });
  }
  if (!isValidRating(rating.mental)) {
    errors.push({ field: 'rating.mental', message: 'Mental rating must be between 1.0 and 5.0' });
  }
  if (!isValidRating(rating.potential)) {
    errors.push({
      field: 'rating.potential',
      message: 'Potential rating must be between 1.0 and 5.0',
    });
  }

  return { isValid: errors.length === 0, errors };
}

// ============================================
// ATHLETE VALIDATION
// ============================================

/**
 * Validate athlete sport type for scout reports.
 * Note: Named differently from global isValidSport to avoid conflicts.
 */
export function isValidScoutSport(sport: string): sport is AthleteSport {
  return sport in SPORT_LABELS;
}

/**
 * Validate graduation year.
 */
export function isValidGradYear(year: number): boolean {
  return GRADUATION_YEARS.includes(year as (typeof GRADUATION_YEARS)[number]);
}

/**
 * Validate athlete data.
 */
export function validateAthlete(athlete: ScoutReportAthlete): ScoutReportValidationResult {
  const errors: ScoutReportValidationError[] = [];

  if (!athlete) {
    errors.push({ field: 'athlete', message: 'Athlete data is required' });
    return { isValid: false, errors };
  }

  if (!athlete.id || typeof athlete.id !== 'string') {
    errors.push({ field: 'athlete.id', message: 'Athlete ID is required' });
  }

  if (!athlete.name || typeof athlete.name !== 'string' || athlete.name.trim().length === 0) {
    errors.push({ field: 'athlete.name', message: 'Athlete name is required' });
  }

  if (!athlete.position || typeof athlete.position !== 'string') {
    errors.push({ field: 'athlete.position', message: 'Position is required' });
  }

  if (!isValidScoutSport(athlete.sport)) {
    errors.push({ field: 'athlete.sport', message: 'Invalid sport type' });
  }

  if (!isValidGradYear(athlete.gradYear)) {
    errors.push({ field: 'athlete.gradYear', message: 'Invalid graduation year' });
  }

  return { isValid: errors.length === 0, errors };
}

// ============================================
// REPORT VALIDATION
// ============================================

/**
 * Validate a complete scout report.
 */
export function validateScoutReport(report: Partial<ScoutReport>): ScoutReportValidationResult {
  const errors: ScoutReportValidationError[] = [];

  if (!report) {
    errors.push({ field: 'report', message: 'Report data is required' });
    return { isValid: false, errors };
  }

  // Validate required fields
  if (!report.id || typeof report.id !== 'string') {
    errors.push({ field: 'id', message: 'Report ID is required' });
  }

  // Validate athlete
  if (!report.athlete) {
    errors.push({ field: 'athlete', message: 'Athlete data is required' });
  } else {
    const athleteValidation = validateAthlete(report.athlete);
    errors.push(...athleteValidation.errors);
  }

  // Validate rating
  if (!report.rating) {
    errors.push({ field: 'rating', message: 'Rating data is required' });
  } else {
    const ratingValidation = validateRating(report.rating);
    errors.push(...ratingValidation.errors);
  }

  // Validate summary
  if (!report.summary || typeof report.summary !== 'string' || report.summary.trim().length === 0) {
    errors.push({ field: 'summary', message: 'Summary is required' });
  }

  // Validate highlights
  if (!report.highlights || !Array.isArray(report.highlights) || report.highlights.length === 0) {
    errors.push({ field: 'highlights', message: 'At least one highlight is required' });
  }

  // Validate scout info
  if (!report.scout || !report.scout.id || !report.scout.name) {
    errors.push({ field: 'scout', message: 'Scout information is required' });
  }

  return { isValid: errors.length === 0, errors };
}

// ============================================
// FILTER VALIDATION
// ============================================

/**
 * Validate category ID.
 */
export function isValidCategory(category: string): category is ScoutReportCategoryId {
  return SCOUT_REPORT_CATEGORIES.some((c) => c.id === category);
}

/**
 * Validate sort by option.
 */
export function isValidSortBy(sortBy: string): sortBy is ScoutReportSortBy {
  const validSortOptions: ScoutReportSortBy[] = [
    'rating',
    'recent',
    'views',
    'name',
    'gradYear',
    'trending',
  ];
  return validSortOptions.includes(sortBy as ScoutReportSortBy);
}

/**
 * Validate filter options.
 */
export function validateFilter(filter: Partial<ScoutReportFilter>): ScoutReportValidationResult {
  const errors: ScoutReportValidationError[] = [];

  if (!filter) {
    return { isValid: true, errors: [] };
  }

  // Validate category
  if (filter.category && !isValidCategory(filter.category)) {
    errors.push({ field: 'category', message: 'Invalid category' });
  }

  // Validate sports
  if (filter.sports) {
    if (!Array.isArray(filter.sports)) {
      errors.push({ field: 'sports', message: 'Sports must be an array' });
    } else {
      const invalidSports = filter.sports.filter((s) => !isValidScoutSport(s));
      if (invalidSports.length > 0) {
        errors.push({ field: 'sports', message: `Invalid sports: ${invalidSports.join(', ')}` });
      }
    }
  }

  // Validate graduation years
  if (filter.gradYears) {
    if (!Array.isArray(filter.gradYears)) {
      errors.push({ field: 'gradYears', message: 'Graduation years must be an array' });
    } else {
      const invalidYears = filter.gradYears.filter((y) => !isValidGradYear(y));
      if (invalidYears.length > 0) {
        errors.push({
          field: 'gradYears',
          message: `Invalid graduation years: ${invalidYears.join(', ')}`,
        });
      }
    }
  }

  // Validate minimum rating
  if (filter.minRating !== undefined) {
    if (typeof filter.minRating !== 'number' || filter.minRating < 1 || filter.minRating > 5) {
      errors.push({ field: 'minRating', message: 'Minimum rating must be between 1 and 5' });
    }
  }

  // Validate sort by
  if (filter.sortBy && !isValidSortBy(filter.sortBy)) {
    errors.push({ field: 'sortBy', message: 'Invalid sort option' });
  }

  // Validate sort order
  if (filter.sortOrder && !['asc', 'desc'].includes(filter.sortOrder)) {
    errors.push({ field: 'sortOrder', message: 'Sort order must be "asc" or "desc"' });
  }

  return { isValid: errors.length === 0, errors };
}

// ============================================
// SEARCH VALIDATION
// ============================================

/**
 * Validate search query.
 */
export function validateSearchQuery(query: string): ScoutReportValidationResult {
  const errors: ScoutReportValidationError[] = [];

  if (!query || typeof query !== 'string') {
    errors.push({ field: 'query', message: 'Search query is required' });
    return { isValid: false, errors };
  }

  const trimmed = query.trim();

  if (trimmed.length < 2) {
    errors.push({ field: 'query', message: 'Search query must be at least 2 characters' });
  }

  if (trimmed.length > 100) {
    errors.push({ field: 'query', message: 'Search query must be less than 100 characters' });
  }

  return { isValid: errors.length === 0, errors };
}

// ============================================
// SANITIZATION HELPERS
// ============================================

/** Mutable version of ScoutReportFilter for internal sanitization. */
type MutableFilter = {
  -readonly [K in keyof ScoutReportFilter]: ScoutReportFilter[K];
};

/**
 * Sanitize filter object by removing invalid values.
 * Returns a new immutable filter object.
 */
export function sanitizeFilter(filter: Partial<ScoutReportFilter>): ScoutReportFilter {
  const result: MutableFilter = {};

  if (filter.category && isValidCategory(filter.category)) {
    result.category = filter.category;
  }

  if (filter.sports && Array.isArray(filter.sports)) {
    const validSports = filter.sports.filter(isValidScoutSport);
    if (validSports.length > 0) {
      result.sports = validSports;
    }
  }

  if (filter.gradYears && Array.isArray(filter.gradYears)) {
    const validYears = filter.gradYears.filter(isValidGradYear);
    if (validYears.length > 0) {
      result.gradYears = validYears;
    }
  }

  if (filter.positions && Array.isArray(filter.positions)) {
    result.positions = filter.positions.filter((p) => typeof p === 'string' && p.trim().length > 0);
  }

  if (typeof filter.minRating === 'number' && filter.minRating >= 1 && filter.minRating <= 5) {
    result.minRating = filter.minRating;
  }

  if (typeof filter.verifiedOnly === 'boolean') {
    result.verifiedOnly = filter.verifiedOnly;
  }

  if (typeof filter.includePremium === 'boolean') {
    result.includePremium = filter.includePremium;
  }

  if (filter.searchQuery && typeof filter.searchQuery === 'string') {
    result.searchQuery = filter.searchQuery.trim();
  }

  if (filter.sortBy && isValidSortBy(filter.sortBy)) {
    result.sortBy = filter.sortBy;
  }

  if (filter.sortOrder && ['asc', 'desc'].includes(filter.sortOrder)) {
    result.sortOrder = filter.sortOrder;
  }

  // Return as immutable
  return result as ScoutReportFilter;
}
