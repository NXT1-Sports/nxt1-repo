/**
 * @fileoverview Shared distiller helpers — DRY utility functions
 * @module @nxt1/backend/modules/agent/tools/scraping/distillers
 *
 * Common type-safe extraction helpers shared across all platform distillers.
 * Eliminates duplicate `asString()`, `asNumber()`, `asArray()`, `get()`,
 * and `toSnakeCase()` definitions.
 */

/** Safely reach into a nested object by dot-separated path. */
export function get(obj: unknown, path: string): unknown {
  let current: unknown = obj;
  for (const key of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Extract a trimmed string, or undefined. Handles numbers by converting. */
export function asString(val: unknown): string | undefined {
  if (typeof val === 'string' && val.trim().length > 0) return val.trim();
  if (typeof val === 'number') return String(val);
  return undefined;
}

/** Extract a finite number, or undefined. Handles numeric strings. */
export function asNumber(val: unknown): number | undefined {
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val === 'string') {
    const n = Number(val);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

/** Ensure val is an array; returns empty array if not. */
export function asArray(val: unknown): unknown[] {
  return Array.isArray(val) ? val : [];
}

/** Convert a display string to a snake_case field key. */
export function toSnakeCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s\-/.]+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase();
}
