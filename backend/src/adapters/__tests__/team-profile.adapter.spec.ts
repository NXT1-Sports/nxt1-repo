import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RosterEntryStatus } from '@nxt1/core/models';

const getUsersByIdsMock = vi.fn();

vi.mock('../../services/profile/users.service.js', () => ({
  getUsersByIds: (...args: unknown[]) => getUsersByIdsMock(...args),
}));

import { mapTeamCodeToProfile } from '../team-profile.adapter.js';

type QueryFilter = {
  field: string;
  op: string;
  value: unknown;
};

function createFirestoreMock(rosterEntries: Array<Record<string, unknown>>) {
  const createRosterQuery = (filters: QueryFilter[] = []) => ({
    where(field: string, op: string, value: unknown) {
      return createRosterQuery([...filters, { field, op, value }]);
    },
    async get() {
      const docs = rosterEntries
        .filter((entry) =>
          filters.every(({ field, op, value }) => {
            if (op === '==') return entry[field] === value;
            if (op === 'in' && Array.isArray(value)) return value.includes(entry[field]);
            return false;
          })
        )
        .map((entry, index) => ({
          id: String(entry.id ?? `entry-${index}`),
          data: () => entry,
        }));

      return { docs, empty: docs.length === 0 };
    },
  });

  return {
    collection(name: string) {
      if (name === 'RosterEntries') {
        return createRosterQuery();
      }

      throw new Error(`Unexpected collection: ${name}`);
    },
  };
}

describe('mapTeamCodeToProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps coaches and directors out of the roster tab while preserving them in staff', async () => {
    getUsersByIdsMock.mockResolvedValue([
      {
        id: 'athlete-1',
        firstName: 'Avery',
        lastName: 'Athlete',
        displayName: 'Avery Athlete',
        unicode: 'avery-athlete',
        role: 'athlete',
        classOf: 2027,
        sports: [{ positions: ['QB'] }],
      },
      {
        id: 'coach-1',
        firstName: 'Casey',
        lastName: 'Coach',
        displayName: 'Casey Coach',
        role: 'coach',
        title: 'Head Coach',
        email: 'coach@example.com',
      },
      {
        id: 'director-1',
        firstName: 'Dana',
        lastName: 'Director',
        displayName: 'Dana Director',
        role: 'director',
        title: 'Athletic Director',
        email: 'director@example.com',
      },
    ]);

    const db = createFirestoreMock([
      {
        id: 'r1',
        teamId: 'team-argyle',
        userId: 'athlete-1',
        role: 'athlete',
        status: RosterEntryStatus.ACTIVE,
        position: 'QB',
      },
      {
        id: 'r2',
        teamId: 'team-argyle',
        userId: 'coach-1',
        role: 'coach',
        status: RosterEntryStatus.ACTIVE,
        title: 'Head Coach',
      },
      {
        id: 'r3',
        teamId: 'team-argyle',
        userId: 'director-1',
        role: 'director',
        status: RosterEntryStatus.ACTIVE,
        title: 'Athletic Director',
      },
    ]);

    const result = await mapTeamCodeToProfile(
      {
        id: 'team-argyle',
        teamCode: 'OTVLDW',
        teamName: 'Argyle Eagles',
        teamType: 'high-school',
        sport: 'Football',
      },
      { includeRoster: true },
      db as never
    );

    expect(result.roster.map((member) => member.id)).toEqual(['athlete-1']);
    expect(result.roster[0]?.unicode).toBe('avery-athlete');
    expect(result.staff.map((member) => member.id)).toEqual(
      expect.arrayContaining(['coach-1', 'director-1'])
    );
  });

  it('maps unicode in legacy memberIds fallback roster payload', async () => {
    getUsersByIdsMock.mockResolvedValue([
      {
        id: 'athlete-legacy-1',
        firstName: 'Legacy',
        lastName: 'Athlete',
        displayName: 'Legacy Athlete',
        unicode: 'legacy-athlete',
        role: 'athlete',
        classOf: 2028,
      },
    ]);

    const db = createFirestoreMock([]);

    const result = await mapTeamCodeToProfile(
      {
        id: 'team-legacy',
        teamCode: 'TEAM01',
        teamName: 'Legacy Lions',
        teamType: 'high-school',
        sport: 'Football',
        memberIds: ['athlete-legacy-1'],
      },
      { includeRoster: true },
      db as never
    );

    expect(result.roster).toHaveLength(1);
    expect(result.roster[0]?.id).toBe('athlete-legacy-1');
    expect(result.roster[0]?.unicode).toBe('legacy-athlete');
  });

  it('prefers canonical roster fields and falls back to legacy playerId for user hydration', async () => {
    getUsersByIdsMock.mockResolvedValue([
      {
        id: 'athlete-canonical-1',
        firstName: 'Jordan',
        lastName: 'Miles',
        displayName: 'Jordan Miles',
        unicode: 'jordan-miles',
        role: 'athlete',
        classOf: 2028,
        sports: [{ sport: 'Basketball', positions: ['SG'] }],
      },
      {
        id: 'athlete-legacy-1',
        firstName: 'Taylor',
        lastName: 'Legacy',
        displayName: 'Taylor Legacy',
        unicode: 'taylor-legacy',
        role: 'athlete',
        classOf: 2029,
        sports: [{ sport: 'Basketball', positions: ['SF'] }],
      },
    ]);

    const db = createFirestoreMock([
      {
        id: 'r1',
        teamId: 'team-canonical',
        userId: 'athlete-canonical-1',
        role: 'athlete',
        status: RosterEntryStatus.ACTIVE,
        sport: 'Basketball',
        positions: ['PG', 'SG'],
        classOfWhenJoined: 2027,
      },
      {
        id: 'r2',
        teamId: 'team-canonical',
        playerId: 'athlete-legacy-1',
        role: 'athlete',
        status: RosterEntryStatus.ACTIVE,
        sport: 'Basketball',
        position: 'PF',
        classYear: '2026',
      },
    ]);

    const result = await mapTeamCodeToProfile(
      {
        id: 'team-canonical',
        teamCode: 'CANON1',
        teamName: 'Canonical Cougars',
        teamType: 'high-school',
        sport: 'Basketball',
      },
      { includeRoster: true },
      db as never
    );

    expect(result.roster).toHaveLength(2);
    expect(result.roster.map((member) => member.id)).toEqual([
      'athlete-canonical-1',
      'athlete-legacy-1',
    ]);
    expect(result.roster[0]).toMatchObject({
      id: 'athlete-canonical-1',
      unicode: 'jordan-miles',
      position: 'PG',
      classYear: '2027',
    });
    expect(result.roster[1]).toMatchObject({
      id: 'athlete-legacy-1',
      unicode: 'taylor-legacy',
      position: 'PF',
      classYear: '2026',
    });
  });
});
