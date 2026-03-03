/**
 * @fileoverview Team Stats → ProfileSeasonGameLog Mapper
 * @module @nxt1/core/team-profile
 *
 * Pure functions that map TeamProfileStatsCategory[] into
 * ProfileSeasonGameLog[] so the shared StatsDashboardComponent
 * can render team stats using the same UI as athlete stats.
 *
 * 100% portable — zero framework / platform dependencies.
 */
import type {
  GameLogColumn,
  GameLogSeasonTotals,
  ProfileSeasonGameLog,
} from '../profile/profile.types';
import type {
  TeamProfileRecord,
  TeamProfileSeasonHistory,
  TeamProfileStatsCategory,
} from './team-profile.types';

/**
 * Converts a single-year season string (e.g. "2025") to an academic-year
 * range ("2025-2026"). Already-hyphenated values pass through unchanged.
 */
export function formatSeasonLabel(season: string): string {
  if (!season) return 'Current Season';
  // Already in "YYYY-YYYY" format
  if (/^\d{4}-\d{4}$/.test(season)) return season;
  // Single year → academic year range
  const year = parseInt(season, 10);
  if (!isNaN(year)) return `${year}-${year + 1}`;
  return season;
}

/**
 * Formats a W-L(-T) record string from wins, losses, and optional ties.
 * Does NOT include the season year — the dashboard already displays that.
 */
function formatRecord(wins: number, losses: number, ties?: number): string {
  return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

/**
 * Builds a lookup map from raw season string → formatted record string.
 *
 * Merges the current-season record with historical season entries so
 * each stat category can display the correct record for its season.
 */
export function buildSeasonRecordMap(
  record?: TeamProfileRecord,
  seasonHistory?: readonly TeamProfileSeasonHistory[]
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();

  // Current season record
  if (record?.season) {
    map.set(record.season, formatRecord(record.wins, record.losses, record.ties));
  }

  // Historical season records
  if (seasonHistory) {
    for (const entry of seasonHistory) {
      if (entry.season && !map.has(entry.season)) {
        map.set(entry.season, formatRecord(entry.wins, entry.losses, entry.ties));
      }
    }
  }

  return map;
}

/**
 * Maps TeamProfileStatsCategory[] into ProfileSeasonGameLog[] for display
 * in the shared StatsDashboardComponent.
 *
 * Each category becomes a ProfileSeasonGameLog with:
 * - `season` formatted as academic year (e.g. "2025-2026")
 * - `category` from `category.name`
 * - `columns` derived from stat keys/labels
 * - `games` empty (team stats are aggregates, not per-game)
 * - `totals` populated from stat values
 * - `seasonRecord` matched from the seasonRecordMap when available
 *
 * @param categories - Team stat categories from TeamProfileService
 * @param seasonRecordMap - Map of raw season → formatted record (e.g. "2025" → "10-2")
 * @returns Mapped game logs suitable for StatsDashboardComponent
 */
export function mapTeamStatsToGameLogs(
  categories: readonly TeamProfileStatsCategory[],
  seasonRecordMap: ReadonlyMap<string, string> = new Map()
): readonly ProfileSeasonGameLog[] {
  return categories.map((category) => {
    const columns: GameLogColumn[] = category.stats.map((stat) => ({
      key: stat.key,
      label: stat.label,
    }));

    const totalsStats: Record<string, string | number> = {};
    for (const stat of category.stats) {
      totalsStats[stat.key] = stat.value;
    }

    const totals: GameLogSeasonTotals[] = [{ label: 'Team Stats', stats: totalsStats }];
    const rawSeason = category.season || '';
    const seasonRecord = rawSeason ? seasonRecordMap.get(rawSeason) : undefined;

    return {
      season: formatSeasonLabel(rawSeason),
      category: category.name,
      teamType: 'school' as const,
      columns,
      games: [], // Team stats are aggregate — no per-game entries
      totals,
      ...(seasonRecord ? { seasonRecord } : {}),
    } satisfies ProfileSeasonGameLog;
  });
}
