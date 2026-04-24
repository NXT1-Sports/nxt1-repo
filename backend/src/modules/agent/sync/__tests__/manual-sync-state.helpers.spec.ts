import { describe, expect, it } from 'vitest';

import { SyncDiffService } from '../sync-diff.service.js';
import {
  buildDistilledProfileFromTeamRecord,
  buildDistilledProfileFromUserRecord,
  buildPreviousStateFromTeamRecord,
  buildPreviousStateFromUserRecord,
} from '../manual-sync-state.helpers.js';

describe('manual sync state helpers', () => {
  it('maps manual profile edits into a diffable sync payload', () => {
    const previousUser = {
      firstName: 'Jordan',
      lastName: 'Smith',
      displayName: 'Jordan Smith',
      aboutMe: 'Old bio',
      academics: { gpa: 3.4 },
      sports: [
        {
          sport: 'football',
          jerseyNumber: '4',
          side: 'offense',
          team: { name: 'Old Tigers', conference: 'A-East' },
        },
      ],
      activeSportIndex: 0,
    };

    const updatedUser = {
      ...previousUser,
      aboutMe: 'New bio',
      academics: { gpa: 3.9 },
      sports: [
        {
          sport: 'football',
          jerseyNumber: '8',
          side: 'offense',
          team: { name: 'New Tigers', conference: 'A-West' },
        },
      ],
    };

    const service = new SyncDiffService();
    const delta = service.diff(
      'user-1',
      'football',
      'manual-profile',
      buildPreviousStateFromUserRecord(previousUser),
      buildDistilledProfileFromUserRecord(updatedUser)
    );

    expect(delta.isEmpty).toBe(false);
    expect(delta.identityChanges.map((change) => change.field)).toEqual(
      expect.arrayContaining([
        'aboutMe',
        'academics.gpa',
        'sportInfo.jerseyNumber',
        'team.name',
        'team.conference',
      ])
    );
  });

  it('maps manage team edits into a diffable sync payload', () => {
    const previousTeam = {
      teamName: 'Old Tigers',
      teamType: 'varsity',
      sportName: 'football',
      division: '2A',
      conference: 'East',
      mascot: 'Tigers',
      primaryColor: '#111111',
      secondaryColor: '#eeeeee',
      city: 'Memphis',
      state: 'TN',
      country: 'USA',
    };

    const updatedTeam = {
      ...previousTeam,
      teamName: 'New Tigers',
      division: '3A',
      conference: 'West',
      primaryColor: '#ccff00',
    };

    const service = new SyncDiffService();
    const delta = service.diff(
      'coach-1',
      'football',
      'manual-team',
      buildPreviousStateFromTeamRecord(previousTeam),
      buildDistilledProfileFromTeamRecord(updatedTeam, 'football')
    );

    expect(delta.isEmpty).toBe(false);
    expect(delta.identityChanges.map((change) => change.field)).toEqual(
      expect.arrayContaining(['team.name', 'team.division', 'team.conference', 'team.primaryColor'])
    );
  });
});
