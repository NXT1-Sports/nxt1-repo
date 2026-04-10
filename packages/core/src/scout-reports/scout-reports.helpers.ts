/**
 * @fileoverview Scout Reports Helper Functions
 * @module @nxt1/core/scout-reports
 * @version 1.0.0
 *
 * Pure helper functions for scout reports.
 * 100% portable - no platform dependencies.
 */

import type {
  ScoutReport,
  ScoutRating,
  RatingTier,
  AthleteSport,
  ScoutReportFilter,
  ScoutReportCategoryId,
} from './scout-reports.types';
import {
  RATING_TIER_THRESHOLDS,
  RATING_TIER_COLORS,
  RATING_TIER_LABELS,
  SPORT_LABELS,
  SPORT_ICONS,
  SPORT_COLORS,
  POSITIONS_BY_SPORT,
  SCOUT_REPORT_SUMMARY_PREVIEW_LENGTH,
} from './scout-reports.constants';

// ============================================
// RATING HELPERS
// ============================================

/**
 * Get rating tier based on overall rating value.
 *
 * @param rating - Overall rating value (1.0 - 5.0)
 * @returns Rating tier
 */
export function getRatingTier(rating: number): RatingTier {
  if (rating >= RATING_TIER_THRESHOLDS.elite.min) return 'elite';
  if (rating >= RATING_TIER_THRESHOLDS.excellent.min) return 'excellent';
  if (rating >= RATING_TIER_THRESHOLDS.good.min) return 'good';
  if (rating >= RATING_TIER_THRESHOLDS.average.min) return 'average';
  return 'developing';
}

/**
 * Get color for a rating value.
 *
 * @param rating - Rating value
 * @returns CSS color variable
 */
export function getRatingColor(rating: number): string {
  const tier = getRatingTier(rating);
  return RATING_TIER_COLORS[tier];
}

/**
 * Get label for a rating tier.
 *
 * @param rating - Rating value
 * @returns Human-readable tier label
 */
export function getRatingLabel(rating: number): string {
  const tier = getRatingTier(rating);
  return RATING_TIER_LABELS[tier];
}

/**
 * Format rating for display (e.g., "4.5").
 *
 * @param rating - Rating value
 * @param precision - Decimal places (default 1)
 * @returns Formatted rating string
 */
export function formatRating(rating: number, precision = 1): string {
  return rating.toFixed(precision);
}

/**
 * Calculate star display for rating.
 * Returns array of 'full', 'half', or 'empty' for 5 stars.
 *
 * @param rating - Rating value (1.0 - 5.0)
 * @returns Array of star states
 */
export function calculateStars(rating: number): ('full' | 'half' | 'empty')[] {
  const stars: ('full' | 'half' | 'empty')[] = [];

  for (let i = 1; i <= 5; i++) {
    if (rating >= i) {
      stars.push('full');
    } else if (rating >= i - 0.5) {
      stars.push('half');
    } else {
      stars.push('empty');
    }
  }

  return stars;
}

/**
 * Calculate average rating from ScoutRating breakdown.
 *
 * @param rating - Rating breakdown object
 * @returns Calculated average (may differ from stored overall)
 */
export function calculateAverageRating(rating: ScoutRating): number {
  const sum = rating.physical + rating.technical + rating.mental + rating.potential;
  return sum / 4;
}

/**
 * Get percentage for rating (for progress bars).
 *
 * @param rating - Rating value (1.0 - 5.0)
 * @returns Percentage (0-100)
 */
export function getRatingPercentage(rating: number): number {
  return ((rating - 1) / 4) * 100;
}

// ============================================
// SPORT & POSITION HELPERS
// ============================================

/**
 * Get display label for sport.
 *
 * @param sport - Sport type
 * @returns Display label
 */
export function getSportLabel(sport: AthleteSport): string {
  return SPORT_LABELS[sport] ?? sport;
}

/**
 * Get icon name for sport.
 *
 * @param sport - Sport type
 * @returns Ionicons icon name
 */
export function getSportIcon(sport: AthleteSport): string {
  return SPORT_ICONS[sport] ?? 'help-circle-outline';
}

/**
 * Get color for sport.
 *
 * @param sport - Sport type
 * @returns CSS color variable
 */
export function getSportColor(sport: AthleteSport): string {
  return SPORT_COLORS[sport] ?? 'var(--nxt1-color-sport-other)';
}

/**
 * Get position info by sport.
 *
 * @param sport - Sport type
 * @param position - Position code
 * @returns Position info or null
 */
export function getPositionInfo(
  sport: AthleteSport,
  position: string
): { label: string; color: string } | null {
  const sportPositions = POSITIONS_BY_SPORT[sport];
  if (!sportPositions) return null;
  return sportPositions[position] ?? null;
}

/**
 * Get position display label.
 *
 * @param sport - Sport type
 * @param position - Position code
 * @returns Position label or original code
 */
export function getPositionLabel(sport: AthleteSport, position: string): string {
  const info = getPositionInfo(sport, position);
  return info?.label ?? position;
}

/**
 * Get position color.
 *
 * @param sport - Sport type
 * @param position - Position code
 * @returns CSS color variable
 */
export function getPositionColor(sport: AthleteSport, position: string): string {
  const info = getPositionInfo(sport, position);
  return info?.color ?? 'var(--nxt1-color-text-secondary)';
}

// ============================================
// TEXT FORMATTING HELPERS
// ============================================

/**
 * Format graduation year for display.
 *
 * @param year - Graduation year (e.g., 2026)
 * @returns Formatted string (e.g., "Class of 2026" or "'26")
 */
export function formatGradYear(year: number, short = false): string {
  if (short) {
    return `'${String(year).slice(-2)}`;
  }
  return `Class of ${year}`;
}

/**
 * Truncate summary text with ellipsis.
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length (default from constants)
 * @returns Truncated text
 */
export function truncateSummary(
  text: string,
  maxLength = SCOUT_REPORT_SUMMARY_PREVIEW_LENGTH
): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

/**
 * Format view count for display.
 *
 * @param count - View count
 * @returns Formatted string (e.g., "1.2K", "3.4M")
 */
export function formatViewCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
  return `${(count / 1000000).toFixed(1)}M`;
}

/**
 * Format relative time for timestamp.
 *
 * @param timestamp - ISO timestamp string
 * @returns Relative time string (e.g., "5m ago", "2h ago", "3d ago")
 */
export function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const time = new Date(timestamp).getTime();
  const diff = now - time;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const weeks = Math.floor(diff / 604800000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;

  // Return formatted date for older timestamps
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// ============================================
// ATHLETE STAT HELPERS
// ============================================

/**
 * Format height for display.
 *
 * @param height - Height string (e.g., "74" inches or "6'2\"")
 * @returns Formatted height
 */
export function formatHeight(height: string): string {
  // If already formatted, return as-is
  if (height.includes("'")) return height;

  // Convert inches to feet/inches
  const inches = parseInt(height, 10);
  if (isNaN(inches)) return height;

  const feet = Math.floor(inches / 12);
  const remainingInches = inches % 12;
  return `${feet}'${remainingInches}"`;
}

/**
 * Format weight for display.
 *
 * @param weight - Weight string or number
 * @returns Formatted weight with "lbs"
 */
export function formatWeight(weight: string | number): string {
  const w = typeof weight === 'string' ? weight : String(weight);
  if (w.toLowerCase().includes('lb')) return w;
  return `${w} lbs`;
}

// ============================================
// FILTER HELPERS
// ============================================

/**
 * Check if filter has any active filters applied.
 *
 * @param filter - Filter object
 * @returns True if any filters are active
 */
export function hasActiveFilters(filter: ScoutReportFilter): boolean {
  return !!(
    filter.sports?.length ||
    filter.positions?.length ||
    filter.gradYears?.length ||
    filter.minRating ||
    filter.verifiedOnly ||
    filter.states?.length ||
    filter.searchQuery
  );
}

/**
 * Count number of active filters.
 *
 * @param filter - Filter object
 * @returns Number of active filter criteria
 */
export function countActiveFilters(filter: ScoutReportFilter): number {
  let count = 0;

  if (filter.sports?.length) count += filter.sports.length;
  if (filter.positions?.length) count += filter.positions.length;
  if (filter.gradYears?.length) count += filter.gradYears.length;
  if (filter.minRating) count += 1;
  if (filter.verifiedOnly) count += 1;
  if (filter.states?.length) count += filter.states.length;

  return count;
}

/**
 * Build filter description for display.
 *
 * @param filter - Filter object
 * @returns Human-readable filter summary
 */
export function buildFilterDescription(filter: ScoutReportFilter): string {
  const parts: string[] = [];

  if (filter.sports?.length === 1) {
    parts.push(getSportLabel(filter.sports[0]));
  } else if (filter.sports?.length) {
    parts.push(`${filter.sports.length} sports`);
  }

  if (filter.positions?.length === 1) {
    parts.push(filter.positions[0]);
  } else if (filter.positions?.length) {
    parts.push(`${filter.positions.length} positions`);
  }

  if (filter.gradYears?.length === 1) {
    parts.push(`Class of ${filter.gradYears[0]}`);
  } else if (filter.gradYears?.length) {
    parts.push(`${filter.gradYears.length} classes`);
  }

  if (filter.minRating) {
    parts.push(`${filter.minRating}+ rating`);
  }

  if (filter.verifiedOnly) {
    parts.push('Verified only');
  }

  return parts.join(' • ') || 'All reports';
}

// ============================================
// CATEGORY HELPERS
// ============================================

/**
 * Get graduation year from category ID.
 *
 * @param category - Category ID
 * @returns Graduation year or null
 */
export function getCategoryGradYear(category: ScoutReportCategoryId): number | null {
  if (category.startsWith('class-')) {
    const year = parseInt(category.replace('class-', ''), 10);
    return isNaN(year) ? null : year;
  }
  return null;
}

/**
 * Build filter from category.
 * Returns a new immutable filter object.
 *
 * @param category - Category ID
 * @returns Partial filter object
 */
export function buildFilterFromCategory(
  category: ScoutReportCategoryId
): Partial<ScoutReportFilter> {
  const gradYear = getCategoryGradYear(category);

  // Build base filter
  let filter: Partial<ScoutReportFilter> = { category };

  // Add grad year if applicable
  if (gradYear) {
    filter = { ...filter, gradYears: [gradYear] };
  }

  // Add category-specific defaults using spread
  switch (category) {
    case 'top-rated':
      return { ...filter, sortBy: 'rating', sortOrder: 'desc' };
    case 'recent':
      return { ...filter, sortBy: 'recent', sortOrder: 'desc' };
    case 'trending':
      return { ...filter, sortBy: 'trending', sortOrder: 'desc' };
    case 'saved':
      // Handled by API
      return filter;
    default:
      return filter;
  }
}

// ============================================
// SORTING HELPERS
// ============================================

/**
 * Sort reports by specified criteria.
 * Pure function - returns new sorted array.
 *
 * @param reports - Reports to sort
 * @param sortBy - Sort field
 * @param order - Sort order
 * @returns Sorted reports array
 */
export function sortReports(
  reports: ScoutReport[],
  sortBy: ScoutReportFilter['sortBy'],
  order: 'asc' | 'desc' = 'desc'
): ScoutReport[] {
  const sorted = [...reports];
  const multiplier = order === 'desc' ? -1 : 1;

  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'rating':
        return (a.rating.overall - b.rating.overall) * multiplier;
      case 'recent':
        return (new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()) * multiplier;
      case 'views':
        return (a.viewCount - b.viewCount) * multiplier;
      case 'name':
        return a.athlete.name.localeCompare(b.athlete.name) * multiplier;
      case 'gradYear':
        return (a.athlete.gradYear - b.athlete.gradYear) * multiplier;
      default:
        return 0;
    }
  });

  return sorted;
}

// ============================================
// XP HELPERS
// ============================================

/**
 * Calculate total XP from viewing reports.
 *
 * @param reports - Reports viewed
 * @returns Total XP
 */
export function calculateTotalXp(reports: ScoutReport[]): number {
  return reports.reduce((total, report) => total + (report.xpReward ?? 0), 0);
}

/**
 * Check if milestone threshold is reached.
 *
 * @param viewedCount - Number of reports viewed
 * @param threshold - Milestone threshold
 * @returns True if threshold reached
 */
export function isMilestoneReached(viewedCount: number, threshold: number): boolean {
  return viewedCount >= threshold;
}
