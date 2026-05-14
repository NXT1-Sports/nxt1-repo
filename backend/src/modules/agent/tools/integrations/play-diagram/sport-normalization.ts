import type { NormalizedSport } from './shared/diagram.types.js';

const BASKETBALL_ALIASES = new Set([
  'basketball',
  'basketball_mens',
  'basketball_womens',
  'basketball mens',
  'basketball womens',
  "men's basketball",
  "women's basketball",
]);

const SOCCER_ALIASES = new Set([
  'soccer',
  'soccer_mens',
  'soccer_womens',
  'soccer mens',
  'soccer womens',
  "men's soccer",
  "women's soccer",
]);

export function normalizeSportId(value: string | undefined | null): NormalizedSport {
  const raw = (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

  if (raw === 'football') return 'football';
  if (raw === 'baseball') return 'baseball';
  if (raw === 'softball') return 'softball';
  if (BASKETBALL_ALIASES.has(raw)) return 'basketball';
  if (SOCCER_ALIASES.has(raw)) return 'soccer';

  return 'football';
}

export function supportsExtendedSport(sport: NormalizedSport): boolean {
  return sport === 'soccer' || sport === 'baseball' || sport === 'softball';
}

export function applySportFeatureFlag(
  sport: NormalizedSport,
  extendedSportsEnabled: boolean
): NormalizedSport {
  if (!extendedSportsEnabled && supportsExtendedSport(sport)) {
    return 'football';
  }
  return sport;
}
