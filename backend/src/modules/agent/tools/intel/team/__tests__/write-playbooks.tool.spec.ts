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

import { WritePlaybooksTool } from '../write-playbooks.tool.js';

describe('WritePlaybooksTool extraction quality gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanManageTeamMutationForUser.mockResolvedValue(true);
    mockCacheDel.mockResolvedValue(undefined);
  });

  it('rejects severely under-structured football payloads before persisting', async () => {
    const setSpy = vi.fn();

    const db = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'Teams') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi
                .fn()
                .mockResolvedValue({ exists: true, data: () => ({ ownerId: 'coach-1' }) }),
            }),
          };
        }

        if (name === 'TeamPlaybooks') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }),
              set: setSpy,
            }),
          };
        }

        throw new Error(`Unexpected collection ${name}`);
      }),
    };

    const tool = new WritePlaybooksTool(db as never);
    const result = await tool.execute(
      {
        teamId: 'team-1',
        sport: 'football',
        source: 'manual',
        plays: [{ name: 'Play 1' }, { name: 'Play 2' }, { name: 'Play 3' }],
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(false);
    expect(String(result.error ?? '').toLowerCase()).toContain('quality');
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('persists review-required payloads while surfacing quality metadata', async () => {
    const setSpy = vi.fn().mockResolvedValue(undefined);

    const db = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'Teams') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi
                .fn()
                .mockResolvedValue({ exists: true, data: () => ({ ownerId: 'coach-1' }) }),
            }),
          };
        }

        if (name === 'TeamPlaybooks') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }),
              set: setSpy,
            }),
          };
        }

        throw new Error(`Unexpected collection ${name}`);
      }),
    };

    const tool = new WritePlaybooksTool(db as never);
    const result = await tool.execute(
      {
        teamId: 'team-1',
        sport: 'basketball',
        source: 'manual',
        plays: [
          {
            name: 'Horns Twist',
            category: 'offense',
            conceptTags: ['horns'],
          },
          {
            name: 'Spain PNR',
            playType: 'set_play',
            conceptTags: ['pick-and-roll'],
          },
          {
            name: 'Delay Action',
            category: 'offense',
          },
        ],
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const data = (result.data ?? {}) as Record<string, unknown>;
    expect(data['reviewRequired']).toBe(true);
    expect(data['extractionQuality']).toBeDefined();
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it('auto-generates football seed plays when manual seed request omits plays', async () => {
    const setSpy = vi.fn().mockResolvedValue(undefined);

    const db = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'Teams') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi
                .fn()
                .mockResolvedValue({ exists: true, data: () => ({ ownerId: 'coach-1' }) }),
            }),
          };
        }

        if (name === 'TeamPlaybooks') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }),
              set: setSpy,
            }),
          };
        }

        throw new Error(`Unexpected collection ${name}`);
      }),
    };

    const tool = new WritePlaybooksTool(db as never);
    const result = await tool.execute(
      {
        teamId: 'team-1',
        sport: 'football',
        source: 'manual',
        name: 'Seed Test One — Crown Point Bulldogs Complete Playbook',
        season: '2026',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(setSpy).toHaveBeenCalledTimes(1);

    const data = (result.data ?? {}) as Record<string, unknown>;
    expect(data['seedGenerated']).toBe(true);
    expect(Number(data['total'])).toBeGreaterThanOrEqual(8);
  });
});
