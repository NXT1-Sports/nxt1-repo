import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RosterEntryStatus } from '@nxt1/core/models';

const getUsersByIdsMock = vi.fn();

vi.mock('../users.service.js', () => ({
  getUsersByIds: (...args: unknown[]) => getUsersByIdsMock(...args),
}));

import { mapTeamCodeToProfile } from '../team-profile-mapper.service.js';

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
    expect(result.staff.map((member) => member.id)).toEqual(
      expect.arrayContaining(['coach-1', 'director-1'])
    );
  });
});
