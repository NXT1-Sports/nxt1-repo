import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cache: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
  getActiveOrPendingRosterEntry: vi.fn(),
  removeFromTeam: vi.fn(),
}));

vi.mock('../../core/cache.service.js', () => ({
  getCacheService: () => mocks.cache,
  CACHE_TTL: { PROFILES: 300 },
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../roster-entry.service.js', () => ({
  RosterEntryService: class MockRosterEntryService {
    getActiveOrPendingRosterEntry = mocks.getActiveOrPendingRosterEntry;
    removeFromTeam = mocks.removeFromTeam;
  },
}));

import {
  getUserTeams,
  incrementTeamPageView,
  removeMember,
  updateTeamCode,
} from '../team-code.service.js';

function createMockTeamDb(teamId: string, teamData: Record<string, unknown>) {
  const currentTeam = { ...teamData };
  const update = vi.fn(async (payload: Record<string, unknown>) => {
    Object.assign(currentTeam, payload);
  });

  return {
    db: {
      collection: vi.fn((name: string) => {
        if (name !== 'Teams') {
          throw new Error(`Unexpected collection: ${name}`);
        }

        return {
          doc: vi.fn((id: string) => {
            if (id !== teamId) {
              throw new Error(`Unexpected document id: ${id}`);
            }

            return {
              get: vi.fn().mockResolvedValue({
                exists: true,
                id: teamId,
                data: () => currentTeam,
              }),
              update,
            };
          }),
        };
      }),
    },
    currentTeam,
    update,
  };
}

describe('incrementTeamPageView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cache.get.mockResolvedValue(null);
    mocks.cache.set.mockResolvedValue(undefined);
    mocks.cache.del.mockResolvedValue(undefined);
    mocks.getActiveOrPendingRosterEntry.mockReset();
    mocks.removeFromTeam.mockReset();
  });

  it('does not mutate Teams documents when a page view is recorded', async () => {
    const updateMock = vi.fn();
    const teamDocRef = {
      get: vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({ teamCode: 'YCHQW1', unicode: 'ascension-catholic-football' }),
      }),
      update: updateMock,
    };

    const db = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue(teamDocRef),
      }),
    };

    await incrementTeamPageView(db as never, 'team-123');

    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('updateTeamCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cache.get.mockResolvedValue(null);
    mocks.cache.set.mockResolvedValue(undefined);
    mocks.cache.del.mockResolvedValue(undefined);
    mocks.getActiveOrPendingRosterEntry.mockReset();
    mocks.removeFromTeam.mockReset();
  });

  it('allows roster directors to update team settings', async () => {
    const { db, currentTeam, update } = createMockTeamDb('team-123', {
      teamCode: 'TEAM123',
      teamName: 'Original Team',
      teamType: 'high-school',
      sport: 'Football',
      members: [],
    });

    mocks.getActiveOrPendingRosterEntry.mockResolvedValue({
      id: 'entry-123',
      userId: 'test-user',
      teamId: 'team-123',
      role: 'director',
      status: 'active',
    });

    const updated = await updateTeamCode(db as never, 'team-123', 'test-user', {
      teamName: 'Updated Team',
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(currentTeam).toMatchObject({ teamName: 'Updated Team' });
    expect(updated.teamName).toBe('Updated Team');
  });

  it('rejects users without team manager access', async () => {
    const { db, currentTeam, update } = createMockTeamDb('team-456', {
      teamCode: 'TEAM456',
      teamName: 'Blocked Team',
      teamType: 'high-school',
      sport: 'Football',
      members: [],
    });

    mocks.getActiveOrPendingRosterEntry.mockResolvedValue(null);

    await expect(
      updateTeamCode(db as never, 'team-456', 'test-user', {
        teamName: 'Should Not Save',
      })
    ).rejects.toThrow();

    expect(update).not.toHaveBeenCalled();
    expect(currentTeam).toMatchObject({ teamName: 'Blocked Team' });
  });

  it('removes roster-backed members even when legacy team.members is stale', async () => {
    const { db } = createMockTeamDb('team-789', {
      teamCode: 'TEAM789',
      teamName: 'Roster Backed Team',
      teamType: 'high-school',
      sport: 'Football',
      members: [],
    });

    mocks.getActiveOrPendingRosterEntry.mockImplementation(async (userId: string) => {
      if (userId === 'director-1') {
        return {
          id: 'entry-director',
          userId,
          teamId: 'team-789',
          role: 'director',
          status: 'active',
        };
      }

      if (userId === 'athlete-1') {
        return {
          id: 'entry-athlete',
          userId,
          teamId: 'team-789',
          role: 'athlete',
          status: 'active',
        };
      }

      return null;
    });

    await removeMember(db as never, 'team-789', 'athlete-1', 'director-1');

    expect(mocks.removeFromTeam).toHaveBeenCalledWith('entry-athlete');
  });
});

describe('getUserTeams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cache.get.mockResolvedValue(null);
    mocks.cache.set.mockResolvedValue(undefined);
    mocks.cache.del.mockResolvedValue(undefined);
  });

  it('returns active and pending teams from roster entries', async () => {
    const teamDocs = new Map([
      [
        'team-1',
        {
          teamCode: 'TEAM001',
          teamName: 'Alcoa Football',
          teamType: 'high-school',
          sport: 'Football',
          isActive: true,
        },
      ],
      [
        'team-2',
        {
          teamCode: 'TEAM002',
          teamName: 'Alcoa Basketball',
          teamType: 'high-school',
          sport: 'Basketball',
          isActive: true,
        },
      ],
    ]);

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'RosterEntries') {
          return {
            where: vi.fn((_field: string, _op: string, _value: unknown) => ({
              where: vi.fn((_field2: string, _op2: string, _value2: unknown) => ({
                get: vi.fn().mockResolvedValue({
                  docs: [
                    { data: () => ({ teamId: 'team-1' }) },
                    { data: () => ({ teamId: 'team-2' }) },
                    { data: () => ({ teamId: 'team-2' }) },
                  ],
                }),
              })),
            })),
          };
        }

        if (name === 'Teams') {
          return {
            doc: vi.fn((id: string) => ({
              get: vi.fn().mockResolvedValue({
                exists: teamDocs.has(id),
                id,
                data: () => teamDocs.get(id),
              }),
            })),
          };
        }

        throw new Error(`Unexpected collection: ${name}`);
      }),
    };

    const result = await getUserTeams(db as never, 'user-1');

    expect(result.cached).toBe(false);
    expect(result.teams.map((team) => team.id)).toEqual(['team-1', 'team-2']);
    expect(mocks.cache.set).toHaveBeenCalled();
  });
});
