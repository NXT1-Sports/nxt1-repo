import { describe, expect, it, vi } from 'vitest';
import { GetPlaybookTool } from '../get-playbook.tool.js';

vi.mock('../../../../../../services/team/team-intel-permissions.js', () => ({
  canManageTeamMutationForUser: vi.fn().mockResolvedValue(true),
}));

describe('GetPlaybookTool', () => {
  it('returns playbook when exact document ID exists', async () => {
    const db = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'TeamPlaybooks') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                exists: true,
                id: 'pb-doc-1',
                data: () => ({
                  teamId: 'team-1',
                  sport: 'football',
                  name: 'Main Playbook',
                  plays: [],
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

    const tool = new GetPlaybookTool(db as never);
    const result = await tool.execute({ playbookId: 'pb-doc-1' }, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    const data = result.data as { playbook: { id: string } };
    expect(data.playbook.id).toBe('pb-doc-1');
  });

  it('falls back to team/sport/name alias lookup when direct ID is missing', async () => {
    const db = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'TeamPlaybooks') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ exists: false }),
            }),
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({
                  docs: [
                    {
                      id: 'pb-real-id',
                      data: () => ({
                        teamId: 'team-1',
                        sport: 'Football',
                        name: 'Main Playbook',
                        updatedAt: '2026-05-13T00:00:00.000Z',
                      }),
                    },
                  ],
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

    const tool = new GetPlaybookTool(db as never);
    const result = await tool.execute(
      { playbookId: 'team-1_Football_Main Playbook' },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const data = result.data as { playbook: { id: string; name: string } };
    expect(data.playbook.id).toBe('pb-real-id');
    expect(data.playbook.name).toBe('Main Playbook');
  });
});
