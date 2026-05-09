/**
 * @fileoverview Unit Tests for Formatters
 * @module @nxt1/core/helpers
 *
 * Comprehensive tests for all formatting functions.
 * Coverage target: 100%
 *
 * @version 2.0.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatDate,
  getRelativeTime,
  formatDuration,
  formatNumber,
  formatCompactNumber,
  formatCurrency,
  formatPercentage,
  truncate,
  capitalize,
  titleCase,
  slugify,
  camelToTitle,
  kebabToTitle,
  formatFullName,
  getInitials,
  formatAthleteName,
  formatLocation,
  formatHeight,
  formatWeight,
  formatTime,
  formatDistance,
  normalizeWeightDisplay,
  isFemaleGender,
  buildCanonicalTeamPath,
  resolveCanonicalTeamRoute,
} from './formatters';

// ============================================
// DATE FORMATTING
// ============================================

describe('formatDate', () => {
  const testDate = new Date('2025-06-15T14:30:00Z');

  describe('short format', () => {
    it('should format date in short format by default', () => {
      const result = formatDate(testDate, 'short');
      expect(result).toMatch(/Jun 15, 2025/);
    });

    it('should accept Date object', () => {
      expect(formatDate(testDate)).toBeTruthy();
    });

    it('should accept ISO string', () => {
      expect(formatDate('2025-06-15T14:30:00Z')).toBeTruthy();
    });

    it('should accept timestamp number', () => {
      expect(formatDate(testDate.getTime())).toBeTruthy();
    });
  });

  describe('medium format', () => {
    it('should format date in medium format', () => {
      const result = formatDate(testDate, 'medium');
      expect(result).toMatch(/June 15, 2025/);
    });
  });

  describe('long format', () => {
    it('should format date in long format with weekday', () => {
      const result = formatDate(testDate, 'long');
      expect(result).toMatch(/Sunday/);
      expect(result).toMatch(/June 15, 2025/);
    });
  });

  describe('relative format', () => {
    it('should return relative time', () => {
      const now = new Date();
      const result = formatDate(now, 'relative');
      expect(result).toBe('just now');
    });
  });

  describe('iso format', () => {
    it('should return ISO string', () => {
      const result = formatDate(testDate, 'iso');
      expect(result).toBe('2025-06-15T14:30:00.000Z');
    });
  });

  describe('edge cases', () => {
    it('should return empty string for invalid date', () => {
      expect(formatDate('invalid')).toBe('');
      expect(formatDate(null as unknown as Date)).toBe('');
    });
  });
});

describe('getRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "just now" for < 30 seconds', () => {
    const date = new Date('2025-06-15T11:59:45Z');
    expect(getRelativeTime(date)).toBe('just now');
  });

  it('should return seconds ago for < 60 seconds', () => {
    const date = new Date('2025-06-15T11:59:15Z');
    expect(getRelativeTime(date)).toBe('45s ago');
  });

  it('should return minutes ago for < 60 minutes', () => {
    const date = new Date('2025-06-15T11:30:00Z');
    expect(getRelativeTime(date)).toBe('30m ago');
  });

  it('should return hours ago for < 24 hours', () => {
    const date = new Date('2025-06-15T06:00:00Z');
    expect(getRelativeTime(date)).toBe('6h ago');
  });

  it('should return days ago for < 7 days', () => {
    const date = new Date('2025-06-12T12:00:00Z');
    expect(getRelativeTime(date)).toBe('3d ago');
  });

  it('should return weeks ago for < 4 weeks', () => {
    const date = new Date('2025-06-01T12:00:00Z');
    expect(getRelativeTime(date)).toBe('2w ago');
  });

  it('should return months ago for < 12 months', () => {
    const date = new Date('2025-03-15T12:00:00Z');
    expect(getRelativeTime(date)).toBe('3mo ago');
  });

  it('should return years ago for >= 12 months', () => {
    const date = new Date('2023-06-15T12:00:00Z');
    expect(getRelativeTime(date)).toBe('2y ago');
  });

  it('should handle string input', () => {
    const result = getRelativeTime('2025-06-15T11:59:00Z');
    expect(result).toBe('1m ago');
  });

  it('should return empty string for null', () => {
    expect(getRelativeTime(null as unknown as Date)).toBe('');
  });
});

describe('formatDuration', () => {
  it('should format seconds only', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('should format minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2:05');
  });

  it('should format hours, minutes, and seconds', () => {
    expect(formatDuration(3665)).toBe('1:01:05');
  });

  it('should handle zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('should handle negative values', () => {
    expect(formatDuration(-10)).toBe('0:00');
  });

  it('should handle null/undefined', () => {
    expect(formatDuration(null as unknown as number)).toBe('0:00');
  });

  it('should pad minutes and seconds', () => {
    expect(formatDuration(61)).toBe('1:01');
    expect(formatDuration(3601)).toBe('1:00:01');
  });
});

// ============================================
// NUMBER FORMATTING
// ============================================

describe('formatNumber', () => {
  it('should format with commas', () => {
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(1000000)).toBe('1,000,000');
  });

  it('should handle decimals', () => {
    expect(formatNumber(1234.56, 2)).toBe('1,234.56');
    expect(formatNumber(1234, 2)).toBe('1,234.00');
  });

  it('should handle zero decimals by default', () => {
    expect(formatNumber(1234.56)).toBe('1,235');
  });

  it('should return "0" for invalid input', () => {
    expect(formatNumber(NaN)).toBe('0');
    expect(formatNumber('abc' as unknown as number)).toBe('0');
  });

  it('should handle negative numbers', () => {
    expect(formatNumber(-1234)).toBe('-1,234');
  });
});

describe('formatCompactNumber', () => {
  it('should format billions', () => {
    expect(formatCompactNumber(1000000000)).toBe('1B');
    expect(formatCompactNumber(1500000000)).toBe('1.5B');
  });

  it('should format millions', () => {
    expect(formatCompactNumber(1000000)).toBe('1M');
    expect(formatCompactNumber(2500000)).toBe('2.5M');
  });

  it('should format thousands', () => {
    expect(formatCompactNumber(1000)).toBe('1K');
    expect(formatCompactNumber(1500)).toBe('1.5K');
    expect(formatCompactNumber(10000)).toBe('10K');
  });

  it('should not format numbers < 1000', () => {
    expect(formatCompactNumber(999)).toBe('999');
    expect(formatCompactNumber(100)).toBe('100');
  });

  it('should remove trailing .0', () => {
    expect(formatCompactNumber(1000000)).toBe('1M');
    expect(formatCompactNumber(2000000)).toBe('2M');
  });

  it('should handle negative numbers', () => {
    expect(formatCompactNumber(-1000000)).toBe('-1M');
  });

  it('should return "0" for invalid input', () => {
    expect(formatCompactNumber(NaN)).toBe('0');
  });
});

describe('formatCurrency', () => {
  it('should format USD by default', () => {
    const result = formatCurrency(1234.56);
    expect(result).toBe('$1,234.56');
  });

  it('should format other currencies', () => {
    expect(formatCurrency(1234.56, 'EUR', 'de-DE')).toMatch(/1\.234,56/);
    expect(formatCurrency(1234.56, 'GBP')).toMatch(/£/);
  });

  it('should handle zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('should handle negative amounts', () => {
    expect(formatCurrency(-99.99)).toBe('-$99.99');
  });
});

describe('formatPercentage', () => {
  it('should format decimal as percentage', () => {
    expect(formatPercentage(0.5)).toBe('50%');
    expect(formatPercentage(0.75)).toBe('75%');
  });

  it('should handle decimals', () => {
    expect(formatPercentage(0.756, 1)).toBe('75.6%');
    expect(formatPercentage(0.7567, 2)).toBe('75.67%');
  });

  it('should handle values > 1', () => {
    expect(formatPercentage(1.5)).toBe('150%');
  });

  it('should handle zero', () => {
    expect(formatPercentage(0)).toBe('0%');
  });
});

// ============================================
// STRING FORMATTING
// ============================================

describe('truncate', () => {
  it('should truncate long strings', () => {
    expect(truncate('This is a long string', 10)).toBe('This is...');
  });

  it('should not truncate short strings', () => {
    expect(truncate('Short', 10)).toBe('Short');
  });

  it('should use custom suffix', () => {
    expect(truncate('This is a long string', 10, '…')).toBe('This is a…');
  });

  it('should handle exact length', () => {
    expect(truncate('1234567890', 10)).toBe('1234567890');
  });

  it('should handle empty string', () => {
    expect(truncate('', 10)).toBe('');
  });

  it('should handle null', () => {
    expect(truncate(null as unknown as string, 10)).toBe('');
  });
});

describe('capitalize', () => {
  it('should capitalize first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('should lowercase rest of string', () => {
    expect(capitalize('HELLO')).toBe('Hello');
    expect(capitalize('hELLO')).toBe('Hello');
  });

  it('should handle single character', () => {
    expect(capitalize('a')).toBe('A');
  });

  it('should handle empty string', () => {
    expect(capitalize('')).toBe('');
  });

  it('should handle null', () => {
    expect(capitalize(null as unknown as string)).toBe('');
  });
});

describe('titleCase', () => {
  it('should capitalize each word', () => {
    expect(titleCase('hello world')).toBe('Hello World');
  });

  it('should handle mixed case', () => {
    expect(titleCase('hELLO wORLD')).toBe('Hello World');
  });

  it('should handle single word', () => {
    expect(titleCase('hello')).toBe('Hello');
  });

  it('should handle multiple spaces', () => {
    expect(titleCase('hello  world')).toBe('Hello  World');
  });

  it('should handle empty string', () => {
    expect(titleCase('')).toBe('');
  });
});

describe('slugify', () => {
  it('should convert to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('should replace spaces with hyphens', () => {
    expect(slugify('hello world')).toBe('hello-world');
  });

  it('should remove special characters', () => {
    expect(slugify('Hello! World?')).toBe('hello-world');
  });

  it('should remove multiple consecutive hyphens', () => {
    expect(slugify('hello   world')).toBe('hello-world');
  });

  it('should trim hyphens from edges', () => {
    expect(slugify(' hello world ')).toBe('hello-world');
    expect(slugify('--hello--')).toBe('hello');
  });

  it('should handle empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('should handle complex strings', () => {
    expect(slugify("John's 2025 Basketball Highlights!")).toBe('johns-2025-basketball-highlights');
  });
});

describe('buildCanonicalTeamPath', () => {
  it('should use a short team code when available', () => {
    expect(
      buildCanonicalTeamPath({
        slug: 'crown-point-basketball-mens',
        teamName: 'Crown Point Basketball Mens',
        teamCode: '57L791',
      })
    ).toBe('/team/crown-point-basketball-mens/57L791');
  });

  it('should fall back to the team id when no short team code exists', () => {
    expect(
      buildCanonicalTeamPath({
        slug: 'crown-point-basketball-mens',
        teamName: 'Crown Point Basketball Mens',
        id: 'mC3D9qg5d9amvcO0otvi',
      })
    ).toBe('/team/crown-point-basketball-mens/mC3D9qg5d9amvcO0otvi');
  });
});

describe('resolveCanonicalTeamRoute', () => {
  it('should resolve a working team route when only a Firestore team id is available', () => {
    expect(
      resolveCanonicalTeamRoute({
        slug: 'crown-point-basketball-mens',
        teamName: 'Crown Point Basketball Mens',
        teamId: 'mC3D9qg5d9amvcO0otvi',
      })
    ).toEqual({
      slug: 'crown-point-basketball-mens',
      teamIdentifier: 'mC3D9qg5d9amvcO0otvi',
      teamName: 'Crown Point Basketball Mens',
      path: '/team/crown-point-basketball-mens/mC3D9qg5d9amvcO0otvi',
    });
  });
});

describe('camelToTitle', () => {
  it('should convert camelCase to Title Case', () => {
    expect(camelToTitle('firstName')).toBe('First Name');
    expect(camelToTitle('lastName')).toBe('Last Name');
  });

  it('should handle multiple capitals', () => {
    expect(camelToTitle('createdAtDate')).toBe('Created At Date');
  });

  it('should handle single word', () => {
    expect(camelToTitle('name')).toBe('Name');
  });

  it('should handle empty string', () => {
    expect(camelToTitle('')).toBe('');
  });

  it('should handle all capitals', () => {
    expect(camelToTitle('URL')).toBe('U R L');
  });
});

describe('kebabToTitle', () => {
  it('should convert kebab-case to Title Case', () => {
    expect(kebabToTitle('first-name')).toBe('First Name');
    expect(kebabToTitle('last-name')).toBe('Last Name');
  });

  it('should handle multiple hyphens', () => {
    expect(kebabToTitle('created-at-date')).toBe('Created At Date');
  });

  it('should handle single word', () => {
    expect(kebabToTitle('name')).toBe('Name');
  });

  it('should handle empty string', () => {
    expect(kebabToTitle('')).toBe('');
  });
});

// ============================================
// NAME FORMATTING
// ============================================

describe('formatFullName', () => {
  it('should combine first and last name', () => {
    expect(formatFullName('John', 'Doe')).toBe('John Doe');
  });

  it('should handle first name only', () => {
    expect(formatFullName('John', undefined)).toBe('John');
    expect(formatFullName('John', '')).toBe('John');
  });

  it('should handle last name only', () => {
    expect(formatFullName(undefined, 'Doe')).toBe('Doe');
    expect(formatFullName('', 'Doe')).toBe('Doe');
  });

  it('should handle no name', () => {
    expect(formatFullName(undefined, undefined)).toBe('');
    expect(formatFullName('', '')).toBe('');
  });
});

describe('getInitials', () => {
  it('should return initials from first and last name', () => {
    expect(getInitials('John', 'Doe')).toBe('JD');
  });

  it('should handle lowercase', () => {
    expect(getInitials('john', 'doe')).toBe('JD');
  });

  it('should handle first name only', () => {
    expect(getInitials('John', undefined)).toBe('J');
  });

  it('should handle last name only', () => {
    expect(getInitials(undefined, 'Doe')).toBe('D');
  });

  it('should handle no name', () => {
    expect(getInitials(undefined, undefined)).toBe('');
  });
});

describe('formatAthleteName', () => {
  it('should format name with class year', () => {
    expect(formatAthleteName('John', 'Doe', 2025)).toBe("John Doe '25");
  });

  it('should format name without class year', () => {
    expect(formatAthleteName('John', 'Doe')).toBe('John Doe');
    expect(formatAthleteName('John', 'Doe', undefined)).toBe('John Doe');
  });

  it('should handle different years', () => {
    expect(formatAthleteName('Jane', 'Smith', 2030)).toBe("Jane Smith '30");
  });
});

// ============================================
// LOCATION FORMATTING
// ============================================

describe('formatLocation', () => {
  it('should format city and state', () => {
    expect(formatLocation('Austin', 'TX')).toBe('Austin, TX');
  });

  it('should handle city only', () => {
    expect(formatLocation('Austin', undefined)).toBe('Austin');
  });

  it('should handle state only', () => {
    expect(formatLocation(undefined, 'TX')).toBe('TX');
  });

  it('should add non-US country', () => {
    expect(formatLocation('Toronto', 'ON', 'Canada')).toBe('Toronto, ON, Canada');
  });

  it('should not add USA', () => {
    expect(formatLocation('Austin', 'TX', 'USA')).toBe('Austin, TX');
    expect(formatLocation('Austin', 'TX', 'United States')).toBe('Austin, TX');
  });

  it('should handle all empty', () => {
    expect(formatLocation(undefined, undefined)).toBe('');
  });
});

// ============================================
// ATHLETIC MEASUREMENTS
// ============================================

describe('formatHeight', () => {
  it('should format height in feet and inches', () => {
    expect(formatHeight(72)).toBe('6\'0"');
    expect(formatHeight(73)).toBe('6\'1"');
    expect(formatHeight(65)).toBe('5\'5"');
  });

  it('should handle under 12 inches', () => {
    expect(formatHeight(11)).toBe('0\'11"');
  });

  it('should handle zero', () => {
    expect(formatHeight(0)).toBe('');
  });

  it('should handle null/invalid', () => {
    expect(formatHeight(null as unknown as number)).toBe('');
    expect(formatHeight('72' as unknown as number)).toBe('');
  });
});

describe('formatWeight', () => {
  it('should format weight with lbs suffix', () => {
    expect(formatWeight(185)).toBe('185 lbs');
    expect(formatWeight(220)).toBe('220 lbs');
  });

  it('should handle zero', () => {
    expect(formatWeight(0)).toBe('');
  });

  it('should handle null/invalid', () => {
    expect(formatWeight(null as unknown as number)).toBe('');
    expect(formatWeight('185' as unknown as number)).toBe('');
  });
});

describe('formatTime', () => {
  it('should format time with decimals', () => {
    expect(formatTime(10.5)).toBe('10.50');
    expect(formatTime(4.789, 2)).toBe('4.79');
  });

  it('should support custom decimal places', () => {
    expect(formatTime(10.567, 1)).toBe('10.6');
    expect(formatTime(10.567, 3)).toBe('10.567');
  });

  it('should handle integers', () => {
    expect(formatTime(10)).toBe('10.00');
  });

  it('should handle invalid input', () => {
    expect(formatTime(NaN)).toBe('');
    expect(formatTime('10' as unknown as number)).toBe('');
  });
});

describe('formatDistance', () => {
  it('should format distance in feet and inches', () => {
    expect(formatDistance(132)).toBe('11\'0"');
    expect(formatDistance(138)).toBe('11\'6"');
  });

  it('should handle inches only', () => {
    expect(formatDistance(8)).toBe('8"');
  });

  it('should handle zero', () => {
    expect(formatDistance(0)).toBe('');
  });

  it('should handle null/invalid', () => {
    expect(formatDistance(null as unknown as number)).toBe('');
    expect(formatDistance('132' as unknown as number)).toBe('');
  });
});

// ============================================
// WEIGHT DISPLAY NORMALIZATION
// ============================================

describe('normalizeWeightDisplay', () => {
  it('should return empty string for undefined', () => {
    expect(normalizeWeightDisplay(undefined)).toBe('');
  });

  it('should return empty string for empty string', () => {
    expect(normalizeWeightDisplay('')).toBe('');
    expect(normalizeWeightDisplay('   ')).toBe('');
  });

  it('should append " lb" to plain numeric strings', () => {
    expect(normalizeWeightDisplay('185')).toBe('185 lb');
    expect(normalizeWeightDisplay(' 200 ')).toBe('200 lb');
  });

  it('should normalize "lb" to single " lb" suffix', () => {
    expect(normalizeWeightDisplay('185 lb')).toBe('185 lb');
    expect(normalizeWeightDisplay('185lb')).toBe('185 lb');
  });

  it('should normalize "lbs" to " lb"', () => {
    expect(normalizeWeightDisplay('185 lbs')).toBe('185 lb');
    expect(normalizeWeightDisplay('185lbs')).toBe('185 lb');
  });

  it('should normalize "pound" / "pounds" to " lb"', () => {
    expect(normalizeWeightDisplay('185 pound')).toBe('185 lb');
    expect(normalizeWeightDisplay('185 pounds')).toBe('185 lb');
  });

  it('should fix duplicate units like "185 lb lb"', () => {
    expect(normalizeWeightDisplay('185 lb lb')).toBe('185 lb');
  });

  it('should preserve metric units as-is', () => {
    expect(normalizeWeightDisplay('84 kg')).toBe('84 kg');
    expect(normalizeWeightDisplay('84 kgs')).toBe('84 kgs');
    expect(normalizeWeightDisplay('84 kilogram')).toBe('84 kilogram');
    expect(normalizeWeightDisplay('84 kilograms')).toBe('84 kilograms');
  });

  it('should collapse extra whitespace', () => {
    expect(normalizeWeightDisplay('185   lb')).toBe('185 lb');
    expect(normalizeWeightDisplay('  185   lbs  ')).toBe('185 lb');
  });

  it('should handle trailing period after unit', () => {
    expect(normalizeWeightDisplay('185 lb.')).toBe('185 lb');
    expect(normalizeWeightDisplay('185 lbs.')).toBe('185 lb');
  });

  it('should return empty for unit-only strings', () => {
    expect(normalizeWeightDisplay('lb')).toBe('');
    expect(normalizeWeightDisplay('lbs')).toBe('');
  });
});

// ============================================
// FEMALE GENDER CHECK
// ============================================

describe('isFemaleGender', () => {
  it('should return false for undefined', () => {
    expect(isFemaleGender(undefined)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isFemaleGender('')).toBe(false);
  });

  it('should return true for "female"', () => {
    expect(isFemaleGender('female')).toBe(true);
  });

  it('should return true for "Female" (case-insensitive)', () => {
    expect(isFemaleGender('Female')).toBe(true);
    expect(isFemaleGender('FEMALE')).toBe(true);
  });

  it('should return true for "femail" typo', () => {
    expect(isFemaleGender('femail')).toBe(true);
    expect(isFemaleGender('Femail')).toBe(true);
  });

  it('should handle whitespace', () => {
    expect(isFemaleGender('  female  ')).toBe(true);
    expect(isFemaleGender('  femail  ')).toBe(true);
  });

  it('should return false for male', () => {
    expect(isFemaleGender('male')).toBe(false);
    expect(isFemaleGender('Male')).toBe(false);
  });

  it('should return false for other values', () => {
    expect(isFemaleGender('other')).toBe(false);
    expect(isFemaleGender('non-binary')).toBe(false);
    expect(isFemaleGender('prefer-not-to-say')).toBe(false);
  });
});
