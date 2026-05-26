import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WriteRosterEntriesTool } from '../write-roster-entries.tool.js';

const mocked = vi.hoisted(() => ({
  cache: {
    del: vi.fn().mockResolvedValue(undefined),
    delByPrefix: vi.fn().mockResolvedValue(undefined),
  },
  canManageTeamMutationForUser: vi.fn().mockResolvedValue(true),
  createRosterEntryService: vi.fn().mockReturnValue({
    syncUserProfileToRosterEntries: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../../../../../services/core/cache.service.js', () => ({
  getCacheService: vi.fn(() => mocked.cache),
}));

vi.mock('../../../../../../services/team/team-intel-permissions.js', () => ({
  canManageTeamMutationForUser: mocked.canManageTeamMutationForUser,
}));

vi.mock('../../../../../../services/team/roster-entry.service.js', () => ({
  createRosterEntryService: mocked.createRosterEntryService,
}));

vi.mock('../../../../../../routes/profile/shared.js', () => ({
  invalidateProfileCaches: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('WriteRosterEntriesTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts input without teamCode so the tool can resolve it from team data', () => {
    const tool = new WriteRosterEntriesTool({} as never);

    const parsed = tool.parameters.safeParse({
      teamId: 'team-1',
      entries: [{ displayName: 'Alex Carter' }],
    });

    expect(parsed.success).toBe(true);
  });

  it('resolves cache invalidation teamCode from the team document when omitted', async () => {
    const batch = {
      set: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };

    const db = {
      batch: vi.fn(() => batch),
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'Teams') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                exists: true,
                data: () => ({ teamCode: 'TEAM123', teamName: 'Falcons', sport: 'Football' }),
              }),
            }),
          };
        }

        if (name === 'RosterEntries') {
          return {
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ docs: [] }),
            }),
            doc: vi.fn().mockReturnValue({ id: 'pending_team-1_hash' }),
          };
        }

        throw new Error(`Unexpected collection ${name}`);
      }),
    };

    const tool = new WriteRosterEntriesTool(db as never);
    const result = await tool.execute(
      {
        teamId: 'team-1',
        strictSourceValidation: false,
        entries: [{ displayName: 'Alex Carter', firstName: 'Alex', lastName: 'Carter' }],
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(mocked.canManageTeamMutationForUser).toHaveBeenCalledWith(
      db,
      'coach-1',
      'team-1',
      expect.objectContaining({ teamCode: 'TEAM123' })
    );
    expect(mocked.cache.delByPrefix).toHaveBeenCalledWith('team:timeline:v1:TEAM123:');
    expect(mocked.cache.delByPrefix).toHaveBeenCalledWith('team:profile:code:TEAM123:');
  });
});
