/**
 * @fileoverview Profile Schedule Pure Helpers
 * @module @nxt1/core/profile
 *
 * Pure functions for mapping ProfileEvent[] → ScheduleRow[].
 * Used by both web and mobile profile shells.
 * 100% portable — zero framework / platform dependencies.
 */
import type { ProfileEvent, ScheduleRow } from './profile.types';

// ============================================
// PUBLIC API
// ============================================

/**
 * Context required to map profile events into displayable schedule rows.
 * The shell gathers this from the ProfileService and passes it in.
 */
export interface ProfileScheduleContext {
  /** Resolved team display name (school, club, or user name) */
  readonly teamName: string;
  /** Team logo URL (school logo or first team affiliation logo) */
  readonly teamLogo?: string;
}

/**
 * Maps an array of ProfileEvent objects into ScheduleRow[] for the
 * ScheduleBoardComponent. Pure function — no side-effects, no DI.
 *
 * @param events - Sorted events to map (already filtered by season if needed)
 * @param ctx    - Team name / logo context from the profile
 * @returns Display-ready schedule rows
 */
export function mapProfileEventsToScheduleRows(
  events: readonly ProfileEvent[],
  ctx: ProfileScheduleContext
): readonly ScheduleRow[] {
  const now = Date.now();

  return events.map((event) => {
    const matchup = resolveMatchup(event, ctx.teamName, ctx.teamLogo);
    const isPast = new Date(event.startDate).getTime() <= now;

    return {
      id: event.id,
      isPast,
      month: formatMonth(event.startDate),
      day: formatDay(event.startDate),
      homeTeam: matchup.homeTeam,
      awayTeam: matchup.awayTeam,
      homeLogo: matchup.homeLogo,
      awayLogo: matchup.awayLogo,
      location: event.location || 'Location TBA',
      time: resolveTime(event),
      statusLabel: isPast ? 'Completed' : 'Upcoming',
      statusValue: event.result?.trim() || (isPast ? 'No score reported' : 'Scheduled'),
    } satisfies ScheduleRow;
  });
}

/**
 * Filters and sorts profile events for the schedule board.
 * Prioritizes games/practices; falls back to all events.
 * Optionally filters by season label (e.g. "2025-2026").
 *
 * @param events      - Raw events from ProfileService
 * @param seasonLabel - If provided, only return events in this season
 * @returns Sorted, filtered event list
 */
export function filterScheduleEvents(
  events: readonly ProfileEvent[],
  seasonLabel?: string
): readonly ProfileEvent[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  const gameSchedule = sorted.filter((event) => event.type === 'game' || event.type === 'practice');
  const base = gameSchedule.length > 0 ? gameSchedule : sorted;

  if (seasonLabel) {
    return base.filter((event) => getSeasonForDate(event.startDate) === seasonLabel);
  }

  return base;
}

/**
 * Extracts unique season labels from profile events, sorted descending
 * (most recent first). Season boundaries: Aug–Dec → current→next year,
 * Jan–Jul → previous→current year.
 *
 * @param events - Raw events from ProfileService
 * @returns Unique season labels (e.g. ["2025-2026", "2024-2025"])
 */
export function getScheduleSeasons(events: readonly ProfileEvent[]): readonly string[] {
  const gameEvents = events.filter((e) => e.type === 'game' || e.type === 'practice');
  const source = gameEvents.length > 0 ? gameEvents : events;

  const seen = new Set<string>();
  const seasons: string[] = [];
  for (const event of source) {
    const season = getSeasonForDate(event.startDate);
    if (!seen.has(season)) {
      seen.add(season);
      seasons.push(season);
    }
  }
  seasons.sort((a, b) => b.localeCompare(a));
  return seasons;
}

/**
 * Derives the academic/athletic season label for a given date.
 * Aug–Dec → "YYYY-(YYYY+1)", Jan–Jul → "(YYYY-1)-YYYY".
 */
export function getSeasonForDate(dateString: string): string {
  const d = new Date(dateString);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed: 0=Jan … 7=Aug … 11=Dec
  if (month >= 7) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

// ============================================
// PRIVATE HELPERS
// ============================================

interface Matchup {
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly homeLogo?: string;
  readonly awayLogo?: string;
}

function resolveMatchup(
  event: ProfileEvent,
  ownTeamName: string,
  ownTeamLogo: string | undefined
): Matchup {
  const opponentName = resolveOpponent(event, ownTeamName);
  const isHome = isHomeEvent(event.name, ownTeamName);

  return isHome
    ? {
        homeTeam: ownTeamName,
        awayTeam: opponentName,
        homeLogo: ownTeamLogo,
        awayLogo: event.logoUrl,
      }
    : {
        homeTeam: opponentName,
        awayTeam: ownTeamName,
        homeLogo: event.logoUrl,
        awayLogo: ownTeamLogo,
      };
}

function resolveOpponent(event: ProfileEvent, ownTeamName: string): string {
  if (event.opponent?.trim()) return event.opponent.trim();
  const parsed = parseMatchupTeams(event.name, ownTeamName);
  return parsed ?? 'Opponent';
}

function resolveTime(event: ProfileEvent): string {
  if (event.isAllDay) return 'All day';
  const d = new Date(event.startDate);
  if (Number.isNaN(d.getTime())) return 'Time TBA';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function isHomeEvent(eventName: string, ownTeamName: string): boolean {
  const name = eventName.toLowerCase();
  if (name.includes(' @ ')) return !name.startsWith(ownTeamName.toLowerCase());
  return true;
}

function parseMatchupTeams(eventName: string, ownTeamName: string): string | undefined {
  const cleaned = eventName.trim();
  if (!cleaned) return undefined;

  const separator = cleaned.includes(' vs ')
    ? /\s+vs\.?\s+/i
    : cleaned.includes(' @ ')
      ? /\s+@\s+/i
      : null;
  if (!separator) return undefined;

  const [left, right] = cleaned.split(separator);
  if (!left?.trim() || !right?.trim()) return undefined;

  const leftTeam = left.trim();
  const rightTeam = right.trim();
  const own = ownTeamName.toLowerCase();

  if (leftTeam.toLowerCase() === own) return rightTeam;
  if (rightTeam.toLowerCase() === own) return leftTeam;
  return rightTeam;
}

function formatMonth(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short' });
}

function formatDay(dateString: string): string {
  return new Date(dateString).getDate().toString();
}
