/**
 * @fileoverview Shared date resolution utilities for Agent X database write tools
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Centralizes how write tools derive stable document chronology from semantic
 * source data such as seasons, years, event dates, and publish timestamps.
 */

const DEFAULT_SEASON_MONTH_INDEX = 8;
const DEFAULT_SEASON_DAY = 1;

function normalizeDateValue(value: unknown): string | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;

    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      const converted = (value as { toDate: () => unknown }).toDate();
      return normalizeDateValue(converted);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function extractFirstYear(value: string): number | undefined {
  const match = value.match(/\b(19|20)\d{2}\b/);
  if (!match) return undefined;

  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildSeasonAnchor(year: number): string {
  return new Date(Date.UTC(year, DEFAULT_SEASON_MONTH_INDEX, DEFAULT_SEASON_DAY)).toISOString();
}

export function yearToDate(year: string | number | undefined | null): string | undefined {
  if (year === undefined || year === null) return undefined;

  const normalizedYear = typeof year === 'number' ? year : extractFirstYear(String(year).trim());

  if (!normalizedYear || normalizedYear < 1900 || normalizedYear > 2100) {
    return undefined;
  }

  return buildSeasonAnchor(normalizedYear);
}

export function seasonToDate(season: string | undefined | null): string | undefined {
  if (!season) return undefined;
  return yearToDate(extractFirstYear(season));
}

export function resolveCreatedAt(
  existingCreatedAt: unknown,
  semanticDate?: unknown,
  fallbackDate?: unknown
): string {
  return (
    normalizeDateValue(existingCreatedAt) ??
    normalizeDateValue(semanticDate) ??
    normalizeDateValue(fallbackDate) ??
    new Date().toISOString()
  );
}
