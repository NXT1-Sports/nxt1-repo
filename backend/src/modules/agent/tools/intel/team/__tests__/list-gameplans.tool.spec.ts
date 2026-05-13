import { describe, expect, it, vi } from 'vitest';
import { ListGameplansTool } from '../list-gameplans.tool.js';

vi.mock('../../../../../../services/team/team-intel-permissions.js', () => ({
  canManageTeamMutationForUser: vi.fn().mockResolvedValue(true),
}));

describe('ListGameplansTool', () => {
  it('lists team game plans when authorized', async () => {
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
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({
                  docs: [
                    {
                      data: () => ({
                        id: 'gp-1',
                        teamId: 'team-1',
                        sport: 'basketball',
                        title: 'vs Duke',
                        phase: 'pregame',
                        status: 'draft',
                        updatedAt: '2026-05-10T00:00:00.000Z',
                        createdAt: '2026-05-09T00:00:00.000Z',
                        updatedBy: 'coach-1',
                        createdBy: 'coach-1',
                      }),
                    },
                  ],
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected collection ${name}`);
      }),
    };

    const tool = new ListGameplansTool(db as never);
    const result = await tool.execute({ teamId: 'team-1', limit: 10 }, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    expect(Array.isArray((result.data as Record<string, unknown>)['gamePlans'])).toBe(true);
    expect(((result.data as Record<string, unknown>)['count'] as number) > 0).toBe(true);
  });

  it('returns user-owned plans when no teamId is provided', async () => {
    const db = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'TeamGamePlans') {
          return {
            where: vi.fn().mockImplementation((field: string) => {
              const docs =
                field === 'updatedBy'
                  ? [
                      {
                        data: () => ({
                          id: 'gp-2',
                          teamId: 'team-2',
                          sport: 'football',
                          title: 'Week 3',
                          phase: 'pregame',
                          status: 'active',
                          updatedAt: '2026-05-11T00:00:00.000Z',
                          createdAt: '2026-05-10T00:00:00.000Z',
                          updatedBy: 'coach-1',
                          createdBy: 'coach-1',
                        }),
                      },
                    ]
                  : [];
              return {
                limit: vi.fn().mockReturnValue({
                  get: vi.fn().mockResolvedValue({ docs }),
                }),
              };
            }),
          };
        }
        throw new Error(`Unexpected collection ${name}`);
      }),
    };

    const tool = new ListGameplansTool(db as never);
    const result = await tool.execute({}, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    expect(((result.data as Record<string, unknown>)['count'] as number) >= 1).toBe(true);
  });
});
