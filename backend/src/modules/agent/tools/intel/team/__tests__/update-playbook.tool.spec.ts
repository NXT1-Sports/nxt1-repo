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

import { UpdatePlaybookTool } from '../update-playbook.tool.js';

describe('UpdatePlaybookTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanManageTeamMutationForUser.mockResolvedValue(true);
    mockCacheDel.mockResolvedValue(undefined);
  });

  it('merges incoming plays by default and preserves existing entries', async () => {
    const existingDoc = {
      id: 'pb-1',
      teamId: 'team-1',
      sport: 'football',
      name: 'Main Playbook',
      plays: [
        {
          playId: 'play_mesh_1',
          name: '60 MESH',
          series: '60 Series',
          objective: 'old objective',
        },
        {
          playId: 'play_smash_1',
          name: 'Double Smash',
          series: '40 Series',
          objective: 'keep this play',
        },
      ],
    } as Record<string, unknown>;

    let updatePayload: Record<string, unknown> | null = null;

    const db = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'TeamPlaybooks') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ exists: true, data: () => existingDoc }),
              update: vi.fn().mockImplementation(async (payload: Record<string, unknown>) => {
                updatePayload = payload;
              }),
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

    const tool = new UpdatePlaybookTool(db as never);
    const result = await tool.execute(
      {
        playbookId: 'pb-1',
        plays: [
          {
            name: '60 MESH',
            series: '60 Series',
            category: 'offense',
            objective: 'updated objective',
          },
        ],
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(updatePayload).not.toBeNull();

    const plays = ((updatePayload ?? {})['plays'] as Record<string, unknown>[] | undefined) ?? [];
    expect(plays).toHaveLength(2);

    const mesh = plays.find((play) => play['playId'] === 'play_mesh_1');
    const smash = plays.find((play) => play['playId'] === 'play_smash_1');

    expect(mesh).toBeDefined();
    expect(mesh?.['objective']).toBe('updated objective');
    expect(mesh?.['category']).toBe('offense');

    expect(smash).toBeDefined();
    expect(smash?.['objective']).toBe('keep this play');
  });

  it('replaces all plays only when replacePlays is true', async () => {
    const existingDoc = {
      id: 'pb-1',
      teamId: 'team-1',
      sport: 'football',
      name: 'Main Playbook',
      plays: [
        {
          playId: 'play_mesh_1',
          name: '60 MESH',
          series: '60 Series',
        },
      ],
    } as Record<string, unknown>;

    let updatePayload: Record<string, unknown> | null = null;

    const db = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'TeamPlaybooks') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ exists: true, data: () => existingDoc }),
              update: vi.fn().mockImplementation(async (payload: Record<string, unknown>) => {
                updatePayload = payload;
              }),
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

    const tool = new UpdatePlaybookTool(db as never);
    const result = await tool.execute(
      {
        playbookId: 'pb-1',
        replacePlays: true,
        plays: [
          {
            name: 'New Play Only',
            series: '70 Series',
            category: 'offense',
            playType: 'pass',
            formation: 'Shotgun Doubles',
            personnel: '11',
            description: 'Quick game adjustment package.',
          },
        ],
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const plays = ((updatePayload ?? {})['plays'] as Record<string, unknown>[] | undefined) ?? [];
    expect(plays).toHaveLength(1);
    expect(plays[0]?.['name']).toBe('New Play Only');
    expect(typeof plays[0]?.['playId']).toBe('string');
  });
});
