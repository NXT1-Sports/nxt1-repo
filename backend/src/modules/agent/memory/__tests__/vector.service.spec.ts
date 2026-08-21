import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock('../../../../utils/logger.js', () => ({
  logger: mockLogger,
}));

const { AgentMemoryModel, VectorMemoryService } = await import('../vector.service.js');

describe('VectorMemoryService', () => {
  let service: InstanceType<typeof VectorMemoryService>;
  let llm: { embed: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    llm = {
      embed: vi.fn().mockResolvedValue([0.11, 0.22, 0.33]),
    };
    service = new VectorMemoryService(llm as never);
  });

  it('groups recall results by user, team, and organization scope', async () => {
    const aggregateSpy = vi
      .spyOn(AgentMemoryModel, 'aggregate')
      .mockImplementation(async (pipeline: Array<Record<string, unknown>>) => {
        const vectorSearch = pipeline[0]?.['$vectorSearch'] as
          | { filter?: Record<string, unknown> }
          | undefined;
        const filter = vectorSearch?.filter ?? {};

        if (filter['target'] === 'user') {
          return [
            {
              _id: 'user-memory',
              userId: 'user-1',
              target: 'user',
              content: 'User prefers SEC schools.',
              category: 'recruiting_context',
              metadata: { source: 'manual' },
              createdAt: '2026-04-10T00:00:00.000Z',
              expiresAt: new Date('2026-07-10T00:00:00.000Z'),
              score: 0.98,
            },
          ];
        }

        if (filter['target'] === 'team') {
          return [
            {
              _id: 'team-memory',
              userId: 'user-1',
              target: 'team',
              teamId: 'team-9',
              organizationId: 'org-9',
              content: 'The team schedule added a district game.',
              category: 'recruiting_context',
              metadata: { source: 'sync' },
              createdAt: '2026-04-11T00:00:00.000Z',
              expiresAt: new Date('2026-07-11T00:00:00.000Z'),
              score: 0.91,
            },
          ];
        }

        return [
          {
            _id: 'org-memory',
            userId: 'user-1',
            target: 'organization',
            organizationId: 'org-9',
            content: 'The organization logged a new athlete honor.',
            category: 'recruiting_context',
            metadata: { source: 'sync' },
            createdAt: '2026-04-12T00:00:00.000Z',
            expiresAt: new Date('2026-07-12T00:00:00.000Z'),
            score: 0.87,
          },
        ];
      });

    const result = await service.recallByScope('user-1', 'recent recruiting context', {
      teamId: 'team-9',
      organizationId: 'org-9',
      category: 'recruiting_context',
      perTargetLimit: 2,
    });

    expect(llm.embed).toHaveBeenCalledWith('recent recruiting context');
    expect(aggregateSpy).toHaveBeenCalledTimes(3);

    const filters = aggregateSpy.mock.calls.map(
      ([pipeline]) =>
        (pipeline[0] as { $vectorSearch: { filter: Record<string, unknown> } }).$vectorSearch.filter
    );

    expect(filters).toContainEqual({
      userId: 'user-1',
      target: 'user',
      category: 'recruiting_context',
    });
    expect(filters).toContainEqual({
      userId: 'user-1',
      target: 'team',
      teamId: 'team-9',
      category: 'recruiting_context',
    });
    expect(filters).toContainEqual({
      userId: 'user-1',
      target: 'organization',
      organizationId: 'org-9',
      category: 'recruiting_context',
    });

    expect(result.user.map((entry) => entry.id)).toEqual(['user-memory']);
    expect(result.team.map((entry) => entry.teamId)).toEqual(['team-9']);
    expect(result.organization.map((entry) => entry.organizationId)).toEqual(['org-9']);
  });

  it('skips team and organization recalls when scope identifiers are absent', async () => {
    const aggregateSpy = vi.spyOn(AgentMemoryModel, 'aggregate').mockResolvedValue([]);

    const result = await service.recallByScope('user-1', 'profile summary');

    expect(aggregateSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ user: [], team: [], organization: [] });
    expect(
      (aggregateSpy.mock.calls[0][0][0] as { $vectorSearch: { filter: Record<string, unknown> } })
        .$vectorSearch.filter
    ).toEqual({ userId: 'user-1', target: 'user' });
  });
});
