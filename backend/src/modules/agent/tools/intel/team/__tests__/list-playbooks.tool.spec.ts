import { describe, expect, it, vi } from 'vitest';
import { ListPlaybooksTool } from '../list-playbooks.tool.js';

vi.mock('../../../../../../services/team/team-intel-permissions.js', () => ({
  canManageTeamMutationForUser: vi.fn().mockResolvedValue(true),
}));

describe('ListPlaybooksTool', () => {
  it('returns firestore document IDs in summaries', async () => {
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
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({
                  docs: [
                    {
                      id: 'pb-doc-1',
                      data: () => ({
                        teamId: 'team-1',
                        sport: 'football',
                        name: 'Main Playbook',
                        playCount: 12,
                        updatedAt: '2026-05-13T00:00:00.000Z',
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

    const tool = new ListPlaybooksTool(db as never);
    const result = await tool.execute(
      { teamId: 'team-1', sport: 'football' },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const data = result.data as { playbooks: Array<{ id: string }> };
    expect(data.playbooks[0]?.id).toBe('pb-doc-1');
  });
});
