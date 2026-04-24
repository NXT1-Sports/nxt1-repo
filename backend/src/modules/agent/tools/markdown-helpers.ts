/**
 * @fileoverview Markdown helper functions for Agent X
 * @module @nxt1/backend/modules/agent/tools
 */

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
