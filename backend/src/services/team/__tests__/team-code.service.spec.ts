import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cache: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
  getActiveOrPendingRosterEntry: vi.fn(),
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
  },
}));

import { incrementTeamPageView, updateTeamCode } from '../team-code.service.js';

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
});
