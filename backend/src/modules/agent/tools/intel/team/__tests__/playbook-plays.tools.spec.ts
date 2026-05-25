import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCacheDel, mockCanManageTeamMutationForUser } = vi.hoisted(() => ({
  mockCacheDel: vi.fn().mockResolvedValue(undefined),
  mockCanManageTeamMutationForUser: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../../../../services/core/cache.service.js', () => ({
  getCacheService: () => ({ del: mockCacheDel }),
}));

vi.mock('../../../../../../services/team/team-intel-permissions.js', () => ({
  canManageTeamMutationForUser: mockCanManageTeamMutationForUser,
}));

vi.mock('../../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  AddPlayToPlaybookTool,
  DeletePlayFromPlaybookTool,
  UpdatePlayInPlaybookTool,
} from '../playbook-plays.tools.js';

describe('playbook play tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanManageTeamMutationForUser.mockResolvedValue(true);
    mockCacheDel.mockResolvedValue(undefined);
  });

  function makeDb(initialPlays: Record<string, unknown>[]) {
    const state = {
      doc: {
        teamId: 'team-1',
        sport: 'football',
        name: 'Main Playbook',
        plays: initialPlays,
      } as Record<string, unknown>,
    };

    const update = vi.fn().mockImplementation(async (payload: Record<string, unknown>) => {
      state.doc = { ...state.doc, ...payload };
    });

    const db = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'TeamPlaybooks') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ exists: true, data: () => state.doc }),
              update,
            }),
          };
        }
        if (name === 'Teams') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi
                .fn()
                .mockResolvedValue({ exists: true, data: () => ({ ownerId: 'coach-1' }) }),
            }),
          };
        }

        throw new Error(`Unexpected collection ${name}`);
      }),
    };

    return { db, update, state };
  }

  it('adds a play with a stable playId', async () => {
    const { db, state } = makeDb([]);
    const tool = new AddPlayToPlaybookTool(db as never);

    const result = await tool.execute(
      {
        playbookId: 'pb-1',
        name: 'Guns Double Smash',
        series: '40 Series',
        conceptTags: ['smash', 'shot'],
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const plays = (state.doc['plays'] as Record<string, unknown>[]) ?? [];
    expect(plays).toHaveLength(1);
    expect(typeof plays[0]?.['playId']).toBe('string');
    expect((plays[0]?.['name'] as string) ?? '').toContain('Guns');
  });

  it('updates by playId and allows explicit clearing', async () => {
    const { db, state } = makeDb([
      {
        playId: 'play_abc',
        name: 'Horns Twist',
        coachingPoints: ['keep spacing'],
        diagramUrl: 'https://example.com/old.png',
      },
    ]);
    const tool = new UpdatePlayInPlaybookTool(db as never);

    const result = await tool.execute(
      {
        playbookId: 'pb-1',
        playId: 'play_abc',
        name: 'Horns Twist Motion',
        coachingPoints: [],
        diagramUrl: null,
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const play = ((state.doc['plays'] as Record<string, unknown>[]) ?? [])[0] ?? {};
    expect(play['name']).toBe('Horns Twist Motion');
    expect(play['coachingPoints']).toEqual([]);
    expect(play['diagramUrl']).toBeUndefined();
  });

  it('falls back to exact play-name match when playId is not provided correctly', async () => {
    const { db, state } = makeDb([
      {
        playId: 'play_mesh_1',
        name: '60 MESH',
        installNotes: 'old notes',
      },
    ]);
    const tool = new UpdatePlayInPlaybookTool(db as never);

    const result = await tool.execute(
      {
        playbookId: 'pb-1',
        playId: '60 MESH',
        installNotes: 'new install notes',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const payload = (result.data ?? {}) as { matchedBy?: string; playId?: string };
    expect(payload.matchedBy).toBe('name');
    expect(payload.playId).toBe('play_mesh_1');

    const play = ((state.doc['plays'] as Record<string, unknown>[]) ?? [])[0] ?? {};
    expect(play['playId']).toBe('play_mesh_1');
    expect(play['installNotes']).toBe('new install notes');
  });

  it('deletes a play by playId', async () => {
    const { db, state } = makeDb([
      { playId: 'play_abc', name: 'Play A' },
      { playId: 'play_def', name: 'Play B' },
    ]);
    const tool = new DeletePlayFromPlaybookTool(db as never);

    const result = await tool.execute(
      {
        playbookId: 'pb-1',
        playId: 'play_abc',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const plays = (state.doc['plays'] as Record<string, unknown>[]) ?? [];
    expect(plays).toHaveLength(1);
    expect(plays[0]?.['playId']).toBe('play_def');
  });
});
