import { describe, expect, it, vi } from 'vitest';
import { GetGameplanTool } from '../get-gameplan.tool.js';

vi.mock('../../../../../../services/team/team-intel-permissions.js', () => ({
  canManageTeamMutationForUser: vi.fn().mockResolvedValue(true),
}));

describe('GetGameplanTool', () => {
  it('returns a game plan when caller is authorized', async () => {
    const db = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'TeamGamePlans') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                exists: true,
                data: () => ({
                  id: 'gp-1',
                  teamId: 'team-1',
                  sport: 'basketball',
                  title: 'vs Duke',
                  phase: 'pregame',
                  status: 'draft',
                  createdBy: 'coach-1',
                  updatedBy: 'coach-1',
                  createdAt: '2026-05-10T00:00:00.000Z',
                  updatedAt: '2026-05-11T00:00:00.000Z',
                }),
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

    const tool = new GetGameplanTool(db as never);
    const result = await tool.execute({ gamePlanId: 'gp-1' }, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['gamePlan']).toBeTruthy();
  });

  it('returns not found when game plan does not exist', async () => {
    const db = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'TeamGamePlans') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ exists: false }),
            }),
          };
        }
        throw new Error(`Unexpected collection ${name}`);
      }),
    };

    const tool = new GetGameplanTool(db as never);
    const result = await tool.execute({ gamePlanId: 'missing' }, { userId: 'coach-1' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});
