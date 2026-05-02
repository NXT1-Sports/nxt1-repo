/**
 * @fileoverview Unit tests for shared document date resolution utilities.
 */

import { describe, expect, it } from 'vitest';
import { resolveCreatedAt, seasonToDate, yearToDate } from '../doc-date-utils.js';

describe('seasonToDate', () => {
  it('uses the leading year from a season range', () => {
    expect(seasonToDate('2025-2026')).toBe('2025-09-01T00:00:00.000Z');
  });

  it('extracts a year from labeled seasons', () => {
    expect(seasonToDate('Fall 2023')).toBe('2023-09-01T00:00:00.000Z');
  });

  it('returns undefined when no year is present', () => {
    expect(seasonToDate('Varsity Season')).toBeUndefined();
  });
});

describe('yearToDate', () => {
  it('normalizes year strings', () => {
    expect(yearToDate('2024')).toBe('2024-09-01T00:00:00.000Z');
  });

  it('normalizes year numbers', () => {
    expect(yearToDate(2026)).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('resolveCreatedAt', () => {
  it('preserves an existing createdAt value', () => {
    expect(resolveCreatedAt('2024-09-01T00:00:00.000Z', '2025-09-01T00:00:00.000Z')).toBe(
      '2024-09-01T00:00:00.000Z'
    );
  });

  it('falls back to the semantic date when no existing value is present', () => {
    expect(resolveCreatedAt(undefined, '2025-09-01T00:00:00.000Z')).toBe(
      '2025-09-01T00:00:00.000Z'
    );
  });

  it('falls back to the supplied fallback date when semantic data is absent', () => {
    expect(resolveCreatedAt(undefined, undefined, '2026-04-17T00:00:00.000Z')).toBe(
      '2026-04-17T00:00:00.000Z'
    );
  });
});
