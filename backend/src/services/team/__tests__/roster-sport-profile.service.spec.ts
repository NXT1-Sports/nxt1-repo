import { describe, expect, it } from 'vitest';

import {
  resolveRosterPositions,
  resolveRosterSportProfile,
} from '../roster-sport-profile.service.js';

describe('resolveRosterSportProfile', () => {
  it('prefers an exact sport-name match when present', () => {
    const sports = [
      { sport: 'Basketball', order: 0, positions: ['PG'] },
      { sport: 'Basketball Mens', order: 1, positions: ['SG'] },
    ];

    expect(resolveRosterSportProfile(sports, 'Basketball Mens')).toEqual(sports[1]);
  });

  it('falls back to normalized sport-key matching for mens/womens variants', () => {
    const sports = [{ sport: 'Basketball', order: 0, positions: ['PG', 'SG'] }];

    expect(resolveRosterSportProfile(sports, 'Basketball Mens')).toEqual(sports[0]);
  });

  it('matches display-name gender prefixes to the same base sport', () => {
    const sports = [{ sport: "Men's Basketball", order: 0, positions: ['PG', 'SG'] }];

    expect(resolveRosterSportProfile(sports, 'Basketball')).toEqual(sports[0]);
  });
});

describe('resolveRosterPositions', () => {
  it('returns deduped trimmed positions from the matched sport profile', () => {
    const sports = [{ sport: 'Football', order: 0, positions: ['QB', ' QB ', 'Safety'] }];

    expect(resolveRosterPositions(sports, 'Football')).toEqual(['QB', 'Safety']);
  });

  it('returns undefined when there is no matching sport profile', () => {
    const sports = [{ sport: 'Baseball', order: 0, positions: ['P'] }];

    expect(resolveRosterPositions(sports, 'Football')).toBeUndefined();
  });
});
