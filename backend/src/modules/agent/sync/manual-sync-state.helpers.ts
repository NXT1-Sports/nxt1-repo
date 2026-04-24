/**
 * @fileoverview Manual Sync State Helpers
 * @module @nxt1/backend/modules/agent/sync
 *
 * Normalizes manual profile/team edits into the same deterministic shapes used
 * by SyncDiffService so UI-driven saves can participate in the Agent X sync
 * delta pipeline.
 */

import type { DistilledProfile } from '../tools/scraping/distillers/distiller.types.js';
import type { PreviousProfileState } from './sync-diff.service.js';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeSportInfo(
  source: Record<string, unknown> | undefined
): DistilledProfile['sportInfo'] {
  if (!source) return undefined;

  const sport = asString(source['sport'] ?? source['sportName']);
  if (!sport) return undefined;

  const jerseyNumber = source['jerseyNumber'];

  return {
    sport,
    jerseyNumber:
      typeof jerseyNumber === 'string' || typeof jerseyNumber === 'number'
        ? jerseyNumber
        : undefined,
    side: asString(source['side']),
  };
}

function pickSportRecord(
  user: Record<string, unknown>,
  sportIndex?: number
): Record<string, unknown> | undefined {
  const sports = Array.isArray(user['sports']) ? (user['sports'] as Record<string, unknown>[]) : [];

  if (sports.length === 0) return undefined;

  const preferredIndex =
    typeof sportIndex === 'number' && sportIndex >= 0
      ? sportIndex
      : typeof user['activeSportIndex'] === 'number' && user['activeSportIndex'] >= 0
        ? (user['activeSportIndex'] as number)
        : 0;

  return sports[preferredIndex] ?? sports[0];
}

function normalizeTeamRecord(
  source: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!source) return undefined;

  const branding = asRecord(source['branding']);
  const record = asRecord(source['record']);

  const normalized: Record<string, unknown> = {
    name: asString(source['name'] ?? source['teamName']),
    type: asString(source['type'] ?? source['teamType']),
    mascot: asString(source['mascot'] ?? branding?.['mascot']),
    conference: asString(source['conference']),
    division: asString(source['division']),
    logoUrl: asString(source['logoUrl'] ?? source['teamLogoUrl'] ?? branding?.['logoUrl']),
    primaryColor: asString(source['primaryColor'] ?? branding?.['primaryColor']),
    secondaryColor: asString(source['secondaryColor'] ?? branding?.['secondaryColor']),
    city: asString(source['city']),
    state: asString(source['state']),
    country: asString(source['country']),
    seasonRecord: asString(source['seasonRecord'] ?? record?.['display']),
  };

  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== undefined));
}

function normalizeCoachRecord(
  source: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!source) return undefined;

  const normalized: Record<string, unknown> = {
    firstName: asString(source['firstName']),
    lastName: asString(source['lastName']),
    email: asString(source['email']),
    phone: asString(source['phone']),
    title: asString(source['title']),
  };

  return Object.keys(normalized).length > 0
    ? Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== undefined))
    : undefined;
}

export function buildPreviousStateFromUserRecord(
  user: Record<string, unknown>,
  sportIndex?: number,
  awardDocs: readonly Record<string, unknown>[] = []
): PreviousProfileState {
  const location = asRecord(user['location']);
  const sport = pickSportRecord(user, sportIndex);
  const sportInfo = normalizeSportInfo(sport);

  return {
    identity: {
      firstName: asString(user['firstName']),
      lastName: asString(user['lastName']),
      displayName: asString(user['displayName']),
      height: asString(user['height']),
      weight: asString(user['weight']),
      classOf: asNumber(user['classOf']),
      city: asString(location?.['city']),
      state: asString(location?.['state']),
      country: asString(location?.['country']),
      profileImage:
        asString(user['profileImage']) ??
        (Array.isArray(user['profileImgs']) ? asString(user['profileImgs'][0]) : undefined),
      aboutMe: asString(user['aboutMe']),
    },
    academics: asRecord(user['academics']),
    sportInfo: sportInfo ? { ...sportInfo } : undefined,
    team: normalizeTeamRecord(asRecord(sport?.['team'])),
    coach: normalizeCoachRecord(asRecord(sport?.['coach']) ?? asRecord(user['coach'])),
    awards: awardDocs,
  };
}

export function buildDistilledProfileFromUserRecord(
  user: Record<string, unknown>,
  sportIndex?: number
): DistilledProfile {
  const location = asRecord(user['location']);
  const sport = pickSportRecord(user, sportIndex);

  return {
    platform: 'nxt1',
    profileUrl: '',
    identity: {
      firstName: asString(user['firstName']),
      lastName: asString(user['lastName']),
      displayName: asString(user['displayName']),
      height: asString(user['height']),
      weight: asString(user['weight']),
      classOf: asNumber(user['classOf']),
      city: asString(location?.['city']),
      state: asString(location?.['state']),
      country: asString(location?.['country']),
      profileImage:
        asString(user['profileImage']) ??
        (Array.isArray(user['profileImgs']) ? asString(user['profileImgs'][0]) : undefined),
      aboutMe: asString(user['aboutMe']),
    },
    academics: asRecord(user['academics']) as DistilledProfile['academics'],
    sportInfo: normalizeSportInfo(sport),
    team: normalizeTeamRecord(asRecord(sport?.['team'])) as DistilledProfile['team'],
    coach: normalizeCoachRecord(
      asRecord(sport?.['coach']) ?? asRecord(user['coach'])
    ) as DistilledProfile['coach'],
    awards: Array.isArray(user['awards']) ? (user['awards'] as DistilledProfile['awards']) : [],
  };
}

export function buildPreviousStateFromTeamRecord(
  team: Record<string, unknown>
): PreviousProfileState {
  return {
    team: normalizeTeamRecord(team),
  };
}

export function buildDistilledProfileFromTeamRecord(
  team: Record<string, unknown>,
  sport?: string
): DistilledProfile {
  return {
    platform: 'nxt1',
    profileUrl: '',
    sportInfo:
      normalizeSportInfo({
        sport: sport ?? team['sport'] ?? team['sportName'],
      }) ?? undefined,
    team: normalizeTeamRecord(team) as DistilledProfile['team'],
  };
}
