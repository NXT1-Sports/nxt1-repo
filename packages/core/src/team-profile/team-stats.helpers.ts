/**
 * @fileoverview Team Stats → ProfileSeasonGameLog Mapper
 * @module @nxt1/core/team-profile
 *
 * Pure function that maps TeamProfileStatsCategory[] into
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
import type { TeamProfileStatsCategory } from './team-profile.types';

/**
 * Maps TeamProfileStatsCategory[] into ProfileSeasonGameLog[] for display
 * in the shared StatsDashboardComponent.
 *
 * Each category becomes a ProfileSeasonGameLog with:
 * - `season` from `category.season` (or 'Current Season')
 * - `category` from `category.name`
 * - `columns` derived from stat keys/labels
 * - `games` empty (team stats are aggregates, not per-game)
 * - `totals` populated from stat values
 *
 * @param categories - Team stat categories from TeamProfileService
 * @returns Mapped game logs suitable for StatsDashboardComponent
 */
export function mapTeamStatsToGameLogs(
  categories: readonly TeamProfileStatsCategory[]
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

    return {
      season: category.season || 'Current Season',
      category: category.name,
      columns,
      games: [], // Team stats are aggregate — no per-game entries
      totals,
    } satisfies ProfileSeasonGameLog;
  });
}
