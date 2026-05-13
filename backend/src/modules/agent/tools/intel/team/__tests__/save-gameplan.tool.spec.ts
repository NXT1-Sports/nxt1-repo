import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCacheDel, mockCanManageTeamMutationForUser } = vi.hoisted(() => ({
  mockCacheDel: vi.fn().mockResolvedValue(undefined),
  mockCanManageTeamMutationForUser: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../../../../services/core/cache.service.js', () => ({
  getCacheService: () => ({
    del: mockCacheDel,
  }),
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

import { SaveGameplanTool } from '../save-gameplan.tool.js';

describe('SaveGameplanTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanManageTeamMutationForUser.mockResolvedValue(true);
    mockCacheDel.mockResolvedValue(undefined);
  });

  it('writes a sport-agnostic game plan document for a team', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const teamDoc = { exists: true, data: () => ({ ownerId: 'coach-1' }) };
    const existingGamePlanDoc = { exists: false, data: () => undefined };

    const db = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'Teams') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue(teamDoc),
            }),
          };
        }

        if (name === 'TeamGamePlans') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue(existingGamePlanDoc),
              set,
            }),
          };
        }

        throw new Error(`Unexpected collection ${name}`);
      }),
    };

    const tool = new SaveGameplanTool(db as never);
    const result = await tool.execute(
      {
        teamId: 'team-1',
        sport: 'Football',
        title: 'Week 3 vs Westlake',
        opponentName: 'Westlake',
        phase: 'pregame',
        identityFocus: 'Control tempo and force long drives.',
        openingScript: ['Inside zone', 'Boot pass', 'Quick game'],
        adjustmentTriggers: [
          {
            trigger: 'Opponent spins down the safety',
            adjustment: 'Shift to glance/RPO package',
          },
        ],
        halftimePriorities: [
          {
            kind: 'offense',
            label: 'Tempo reset',
            content: 'Use motion to confirm coverage before the snap.',
          },
        ],
        customSections: [
          {
            title: 'Red Zone Notes',
            content: 'Use condensed formations inside the 10.',
          },
        ],
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(set).toHaveBeenCalledTimes(1);
    const payload = set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload['sport']).toBe('football');
    expect(payload['title']).toBe('Week 3 vs Westlake');
    expect(payload['opponentName']).toBe('Westlake');
    expect(payload['phase']).toBe('pregame');
    expect(payload['status']).toBe('draft');
    expect(Array.isArray(payload['adjustmentTriggers'])).toBe(true);
    expect(Array.isArray(payload['halftimePriorities'])).toBe(true);
    expect(Array.isArray(payload['customSections'])).toBe(true);
    expect(mockCacheDel).toHaveBeenCalled();
  });

  it('rejects unauthorized team writes', async () => {
    mockCanManageTeamMutationForUser.mockResolvedValue(false);

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

        if (name === 'TeamGamePlans') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }),
              set: vi.fn(),
            }),
          };
        }

        throw new Error(`Unexpected collection ${name}`);
      }),
    };

    const tool = new SaveGameplanTool(db as never);
    const result = await tool.execute(
      {
        teamId: 'team-1',
        sport: 'Football',
        title: 'Week 3 vs Westlake',
        identityFocus: 'Win first down.',
      },
      { userId: 'coach-2' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Not authorized');
  });

  it('rejects cross-team overwrite attempts when gamePlanId belongs to another team', async () => {
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

        if (name === 'TeamGamePlans') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                exists: true,
                data: () => ({ teamId: 'team-other', createdBy: 'coach-9' }),
              }),
              set: vi.fn(),
            }),
          };
        }

        throw new Error(`Unexpected collection ${name}`);
      }),
    };

    const tool = new SaveGameplanTool(db as never);
    const result = await tool.execute(
      {
        gamePlanId: 'team-other_football_pregame_week-3_westlake',
        teamId: 'team-1',
        sport: 'Football',
        title: 'Week 3 vs Westlake',
        identityFocus: 'Win first down.',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('does not belong');
  });

  it('replaces the full document on update while preserving created metadata', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
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

        if (name === 'TeamGamePlans') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                exists: true,
                data: () => ({
                  teamId: 'team-1',
                  createdBy: 'coach-1',
                  createdAt: '2026-05-01T00:00:00.000Z',
                  specialSituations: 'stale value',
                }),
              }),
              set,
            }),
          };
        }

        throw new Error(`Unexpected collection ${name}`);
      }),
    };

    const tool = new SaveGameplanTool(db as never);
    const result = await tool.execute(
      {
        gamePlanId: 'team-1_football_pregame_2026-09-01_westlake',
        teamId: 'team-1',
        sport: 'Football',
        title: 'Updated Week 3 vs Westlake',
        opponentName: 'Westlake',
        primaryAttackPlan: 'Attack the edge with motion and play-action.',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(set).toHaveBeenCalledTimes(1);
    const payload = set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload['createdBy']).toBe('coach-1');
    expect(payload['createdAt']).toBe('2026-05-01T00:00:00.000Z');
    expect(payload['specialSituations']).toBeUndefined();
    expect(set.mock.calls[0]?.[1]).toBeUndefined();
  });
});
