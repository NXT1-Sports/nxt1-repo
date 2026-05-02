/**
 * @fileoverview Rich preview formatters for approval cards
 * @module @nxt1/core/ai/agent-approval-formatters
 *
 * Transforms tool inputs into human-friendly structured previews:
 * - Season stats → table with sport/year/stats
 * - Core identity → profile sections
 * - Roster entries → team roster table
 */

import type {
  SeasonStatsPreview,
  CoreIdentityPreview,
  RosterPreview,
  ApprovalRichPreview,
} from './agent-x.types';

/**
 * Format write_season_stats input into a stats table preview.
 *
 * Expects input like:
 * ```
 * {
 *   sport: "Football",
 *   year: 2025,
 *   touchdowns: 12,
 *   yards: 847,
 *   catches: 28,
 *   ...
 * }
 * ```
 */
export function formatSeasonStatsPreview(
  input: Record<string, unknown>
): SeasonStatsPreview | null {
  const sport = typeof input['sport'] === 'string' ? input['sport'] : null;
  if (!sport) return null;

  const rawYear = input['year'];
  const year = typeof rawYear === 'string' || typeof rawYear === 'number' ? rawYear : undefined;
  const skipKeys = new Set([
    'sport',
    'year',
    'userId',
    'id',
    'createdAt',
    'updatedAt',
    'sportId',
    'athleteId',
  ]);

  const rows: Array<{ label: string; value: string | number }> = [];
  for (const [key, value] of Object.entries(input)) {
    if (skipKeys.has(key)) continue;
    if (value === null || value === undefined || value === '') continue;

    const label = key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());

    const displayValue =
      typeof value === 'number'
        ? value.toString()
        : typeof value === 'string'
          ? value
          : String(value);

    rows.push({ label, value: displayValue });
  }

  return rows.length > 0
    ? {
        type: 'season_stats',
        sport,
        ...(year !== undefined ? { year } : {}),
        rows,
      }
    : null;
}

/**
 * Format write_core_identity input into profile sections.
 *
 * Expects input like:
 * ```
 * {
 *   firstName: "John",
 *   lastName: "Smith",
 *   height: "6'1\"",
 *   weight: 210,
 *   gpa: 3.8,
 *   classYear: "2025",
 *   position: "QB",
 *   ...
 * }
 * ```
 */
export function formatCoreIdentityPreview(
  input: Record<string, unknown>
): CoreIdentityPreview | null {
  // Group fields into sections
  const personalSection: Array<{ key: string; value: string }> = [];
  const athleticSection: Array<{ key: string; value: string }> = [];

  // Personal fields
  const personalKeys = ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'nationality'];
  // Athletic fields
  const athleticKeys = [
    'height',
    'weight',
    'gpa',
    'classYear',
    'class',
    'position',
    'number',
    'jersey',
  ];
  // Skip internal fields
  const skipKeys = new Set(['id', 'userId', 'createdAt', 'updatedAt', 'athleteId', 'profileId']);

  for (const [key, value] of Object.entries(input)) {
    if (skipKeys.has(key)) continue;
    if (value === null || value === undefined || value === '') continue;

    const displayValue =
      typeof value === 'number'
        ? value.toString()
        : typeof value === 'string'
          ? value
          : String(value);

    const label = key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());

    const field = { key: label, value: displayValue };

    if (personalKeys.includes(key)) {
      personalSection.push(field);
    } else if (athleticKeys.includes(key)) {
      athleticSection.push(field);
    }
  }

  const sections: Array<{
    title: string;
    fields: Array<{ key: string; value: string }>;
  }> = [];

  if (personalSection.length > 0) {
    sections.push({ title: 'Personal Info', fields: personalSection });
  }

  if (athleticSection.length > 0) {
    sections.push({ title: 'Athletic Profile', fields: athleticSection });
  }

  return sections.length > 0
    ? {
        type: 'core_identity',
        sections,
      }
    : null;
}

/**
 * Format write_roster_entries input into a roster table.
 *
 * Expects input like:
 * ```
 * {
 *   teamName?: "Football",
 *   entries: [
 *     { name: "John Smith", number: 7, position: "QB", grade: "12", status: "active" },
 *     ...
 *   ]
 * }
 * ```
 *
 * OR directly an array of entries.
 */
export function formatRosterPreview(input: Record<string, unknown>): RosterPreview | null {
  let entries: unknown[] = [];
  let teamName: string | undefined;

  // Check if input has an 'entries' array
  if (Array.isArray(input['entries'])) {
    entries = input['entries'];
  } else if (Array.isArray(input['roster'])) {
    entries = input['roster'];
  } else if (Array.isArray(input['players'])) {
    entries = input['players'];
  }

  if (entries.length === 0) return null;

  // Extract team name if present
  if (typeof input['teamName'] === 'string') {
    teamName = input['teamName'];
  } else if (typeof input['team'] === 'string') {
    teamName = input['team'];
  }

  const rows: Array<{
    name: string;
    number?: string | number;
    position?: string;
    grade?: string;
    status?: string;
  }> = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;

    const e = entry as Record<string, unknown>;
    const rawName = e['name'] ?? e['fullName'] ?? e['athleteName'];
    if (typeof rawName !== 'string' && typeof rawName !== 'number') continue;
    const name = String(rawName).trim();
    if (!name) continue;

    const rawNumber = e['number'] ?? e['jersey'];
    const number =
      typeof rawNumber === 'string' || typeof rawNumber === 'number' ? rawNumber : undefined;

    rows.push({
      name: String(name).trim(),
      ...(number !== undefined ? { number } : {}),
      position: e['position'] ? String(e['position']).trim() : undefined,
      grade:
        (e['grade'] ?? e['classYear']) ? String(e['grade'] ?? e['classYear']).trim() : undefined,
      status: e['status'] ? String(e['status']).trim() : undefined,
    });
  }

  return rows.length > 0
    ? {
        type: 'roster',
        ...(teamName ? { teamName } : {}),
        rows,
      }
    : null;
}

/**
 * Automatically detect and format the best rich preview for a given tool.
 *
 * Returns null if no rich preview is available for this tool or input format.
 */
export function formatApprovalRichPreview(
  toolName: string,
  input: Record<string, unknown>
): ApprovalRichPreview | null {
  switch (toolName) {
    case 'write_season_stats':
    case 'update_season_stats':
      return formatSeasonStatsPreview(input);

    case 'write_core_identity':
    case 'update_core_identity':
      return formatCoreIdentityPreview(input);

    case 'write_roster_entries':
    case 'update_roster_entries':
      return formatRosterPreview(input);

    default:
      return null;
  }
}
