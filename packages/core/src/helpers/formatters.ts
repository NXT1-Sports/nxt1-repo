/**
 * @fileoverview Formatting Helpers - Pure TypeScript
 * @module @nxt1/core/helpers
 *
 * Pure formatting functions with no platform dependencies.
 * 100% portable - works on Web, Mobile, Server.
 *
 * @version 2.0.0
 */

// ============================================
// DATE FORMATTING
// ============================================

export type DateFormat = 'short' | 'medium' | 'long' | 'relative' | 'iso';

/**
 * Format date to human-readable string
 */
export function formatDate(date: Date | string | number, format: DateFormat = 'short'): string {
  const d = toDate(date);
  if (!d || isNaN(d.getTime())) return '';

  switch (format) {
    case 'relative':
      return getRelativeTime(d);
    case 'iso':
      return d.toISOString();
    case 'long':
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      });
    case 'medium':
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    case 'short':
    default:
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
  }
}

/**
 * Get relative time string (e.g., "2 hours ago")
 */
export function getRelativeTime(date: Date | string | number): string {
  const d = toDate(date);
  if (!d) return '';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 30) return 'just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${diffYears}y ago`;
}

/**
 * Format time duration
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Convert various date inputs to Date object
 */
function toDate(date: Date | string | number): Date | null {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date === 'number') return new Date(date);
  if (typeof date === 'string') return new Date(date);
  return null;
}

// ============================================
// NUMBER FORMATTING
// ============================================

/**
 * Format number with commas
 */
export function formatNumber(num: number, decimals: number = 0): string {
  if (typeof num !== 'number' || isNaN(num)) return '0';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format number with K/M/B suffixes
 */
export function formatCompactNumber(num: number): string {
  if (typeof num !== 'number' || isNaN(num)) return '0';

  const absNum = Math.abs(num);
  if (absNum >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  }
  if (absNum >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (absNum >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toString();
}

/**
 * Format currency
 */
export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 0): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

// ============================================
// STRING FORMATTING
// ============================================

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number, suffix: string = '...'): string {
  if (!text || text.length <= maxLength) return text || '';
  return text.slice(0, maxLength - suffix.length).trim() + suffix;
}

/**
 * Capitalize first letter
 */
export function capitalize(text: string): string {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Capitalize each word
 */
export function titleCase(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Convert to slug
 */
export function slugify(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Convert camelCase to Title Case
 */
export function camelToTitle(text: string): string {
  if (!text) return '';
  return text
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * Convert kebab-case to Title Case
 */
export function kebabToTitle(text: string): string {
  if (!text) return '';
  return text
    .split('-')
    .map((word) => capitalize(word))
    .join(' ');
}

// ============================================
// NAME FORMATTING
// ============================================

/**
 * Format full name
 */
export function formatFullName(firstName?: string, lastName?: string): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim();
}

/**
 * Get initials from name
 */
export function getInitials(firstName?: string, lastName?: string): string {
  const first = firstName?.charAt(0).toUpperCase() || '';
  const last = lastName?.charAt(0).toUpperCase() || '';
  return first + last;
}

/**
 * Format athlete name with year
 */
export function formatAthleteName(firstName: string, lastName: string, classOf?: number): string {
  const name = formatFullName(firstName, lastName);
  return classOf ? `${name} '${String(classOf).slice(-2)}` : name;
}

// ============================================
// LOCATION FORMATTING
// ============================================

/**
 * Format city, state
 */
export function formatLocation(city?: string, state?: string, country?: string): string {
  const parts = [city, state].filter(Boolean);
  if (country && country !== 'USA' && country !== 'United States') {
    parts.push(country);
  }
  return parts.join(', ');
}

// ============================================
// ATHLETIC MEASUREMENTS
// ============================================

/**
 * Format height (inches to feet/inches)
 */
export function formatHeight(inches: number): string {
  if (!inches || typeof inches !== 'number') return '';
  const feet = Math.floor(inches / 12);
  const remainingInches = inches % 12;
  return `${feet}'${remainingInches}"`;
}

/**
 * Format weight from numeric pounds.
 */
export function formatWeight(pounds: number): string {
  if (!pounds || typeof pounds !== 'number') return '';
  return `${pounds} lbs`;
}

/**
 * Normalize a raw weight string from the backend into a consistent display
 * format. Handles cases where the backend already includes a unit suffix
 * (e.g. "185 lbs", "185lb", "185 pounds") to prevent duplicate units.
 *
 * - Metric values (kg) are returned as-is.
 * - Imperial values have their unit stripped and re-appended as " lb".
 * - Bare numbers get " lb" appended.
 */
export function normalizeWeightDisplay(rawWeight: string | undefined): string {
  const normalized = rawWeight?.trim().replace(/\s+/g, ' ') ?? '';
  if (!normalized) return '';

  if (/(^|\s|(?<=\d))(kg|kgs|kilogram|kilograms)\b/i.test(normalized)) return normalized;

  if (/(^|\s|(?<=\d))(lb|lbs|pound|pounds)\b\.?/i.test(normalized)) {
    const stripped = normalized.replace(/(^|\s|(?<=\d))(lb|lbs|pound|pounds)\b\.?/gi, '$1').trim();
    return stripped.length > 0 ? `${stripped} lb` : '';
  }

  return `${normalized} lb`;
}

/**
 * Check whether a gender string represents female.
 * Handles the known "femail" typo in legacy data.
 */
export function isFemaleGender(gender: string | undefined): boolean {
  const g = gender?.trim().toLowerCase() ?? '';
  return g === 'female' || g === 'femail';
}

/**
 * Format time (seconds with decimals)
 */
export function formatTime(seconds: number, decimals: number = 2): string {
  if (typeof seconds !== 'number' || isNaN(seconds)) return '';
  return seconds.toFixed(decimals);
}

/**
 * Format distance (inches)
 */
export function formatDistance(inches: number): string {
  if (!inches || typeof inches !== 'number') return '';
  const feet = Math.floor(inches / 12);
  const remainingInches = inches % 12;
  if (feet === 0) return `${remainingInches}"`;
  return `${feet}'${remainingInches}"`;
}
