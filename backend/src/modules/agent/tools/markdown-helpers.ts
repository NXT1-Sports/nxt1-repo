/**
 * @fileoverview Markdown helper functions for Agent X
 * @module @nxt1/backend/modules/agent/tools
 */

import { resolveUrlDisplay, type UrlDisplayOptions } from './favicon-registry.js';

/**
 * Convert an array of objects into a Markdown table.
 * Only includes the specified columns.
 */
export function toMarkdownTable<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T; label: string; format?: (val: unknown) => string }[]
): string {
  if (rows.length === 0) return '';

  const headerRow = `| ${columns.map((col) => col.label).join(' | ')} |`;
  const separatorRow = `| ${columns.map(() => '---').join(' | ')} |`;

  const dataRows = rows.map((row) => {
    return `| ${columns
      .map((col) => {
        const val = row[col.key];
        const displayVal = col.format ? col.format(val) : String(val ?? '—');
        return String(displayVal).replace(/\|/g, '\\|').replace(/\n/g, ' ');
      })
      .join(' | ')} |`;
  });

  return [headerRow, separatorRow, ...dataRows].join('\n');
}

/**
 * Create a markdown link with favicon support.
 * Automatically uses favicons from the favicon registry when available.
 * Falls back to a generic link icon (→) if no favicon is found.
 *
 * @example
 * // With favicon available (MaxPreps)
 * createUrlLink('https://www.maxpreps.com/athlete/abc', 'My Profile')
 * → `[🔗 MaxPreps](https://www.maxpreps.com/athlete/abc)`
 *
 * @example
 * // Without favicon, uses fallback
 * createUrlLink('https://example.com/page')
 * → `[→ Source](https://example.com/page)`
 *
 * @example
 * // Custom display options
 * createUrlLink('https://hudl.com/video/123', undefined, { style: 'domain' })
 * → `[hudl.com](https://hudl.com/video/123)`
 */
export function createUrlLink(url: string, label?: string, options?: UrlDisplayOptions): string {
  return resolveUrlDisplay(url, {
    ...options,
    label: label ?? options?.label,
  });
}
