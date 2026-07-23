import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCanManageTeamMutationForUser, mockCacheDelByPrefix } = vi.hoisted(() => ({
  mockCanManageTeamMutationForUser: vi.fn().mockResolvedValue(true),
  mockCacheDelByPrefix: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../../../services/team/team-intel-permissions.js', () => ({
  canManageTeamMutationForUser: mockCanManageTeamMutationForUser,
}));

vi.mock('../../../../../../services/core/cache.service.js', () => ({
  getCacheService: () => ({
    delByPrefix: mockCacheDelByPrefix,
  }),
}));

vi.mock('../../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { DeleteTeamPostTool } from '../delete-team-post.tool.js';

function createMockFirestore() {
  const postRef = {
    get: vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ teamId: 'team-1', type: 'text' }),
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  };

  const db = {
    collection: vi.fn().mockImplementation((name: string) => {
      if (name === 'Teams') {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
              exists: true,
              data: () => ({ teamCode: 'TEAM123', slug: 'falcons' }),
            }),
          }),
        };
      }

      if (name === 'Posts') {
        return {
          doc: vi.fn().mockReturnValue(postRef),
        };
      }

      throw new Error(`Unexpected collection ${name}`);
    }),
  };

  return { db, postRef };
}

describe('DeleteTeamPostTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates the team profile id cache after a successful delete', async () => {
    const { db, postRef } = createMockFirestore();
    const tool = new DeleteTeamPostTool(db as never);

    const result = await tool.execute(
      {
        postId: 'post-1',
        teamId: 'team-1',
        teamCode: 'TEAM123',
      },
      { userId: 'coach-1' } as never
    );

    expect(result.success).toBe(true);
    expect(postRef.delete).toHaveBeenCalled();
    expect(mockCacheDelByPrefix).toHaveBeenCalledWith('team:profile:id:team-1:');
    expect(mockCacheDelByPrefix).toHaveBeenCalledWith('feed:post:post-1');
  });
});
