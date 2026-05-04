import { normalizeSportKey } from '@nxt1/core';

type RosterSportProfileLike = {
  sport?: string;
  positions?: string[];
  order?: number;
};

function normalizeSportLabel(value?: string | null): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function resolveRosterSportProfile(
  sports: readonly RosterSportProfileLike[] | undefined,
  teamSport: string
): RosterSportProfileLike | undefined {
  if (!Array.isArray(sports) || sports.length === 0) {
    return undefined;
  }

  const normalizedTeamSport = normalizeSportLabel(teamSport);
  if (normalizedTeamSport) {
    const exactMatch = sports.find(
      (sport) => normalizeSportLabel(sport.sport) === normalizedTeamSport
    );
    if (exactMatch) {
      return exactMatch;
    }
  }

  const normalizedTeamKey = normalizeSportKey(teamSport);
  if (!normalizedTeamKey) {
    return undefined;
  }

  const keyMatches = sports.filter(
    (sport) => normalizeSportKey(sport.sport ?? '') === normalizedTeamKey
  );
  if (keyMatches.length === 0) {
    return undefined;
  }

  return keyMatches.find((sport) => sport.order === 0) ?? keyMatches[0];
}

export function resolveRosterPositions(
  sports: readonly RosterSportProfileLike[] | undefined,
  teamSport: string
): string[] | undefined {
  const positions = resolveRosterSportProfile(sports, teamSport)?.positions;
  if (!Array.isArray(positions)) {
    return undefined;
  }

  const normalized = Array.from(
    new Set(
      positions
        .map((position) => (typeof position === 'string' ? position.trim() : ''))
        .filter(Boolean)
    )
  );

  return normalized.length > 0 ? normalized : undefined;
}
