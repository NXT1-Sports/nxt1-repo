import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAssertCanManageProfileTarget, mockCacheDelByPrefix } = vi.hoisted(() => ({
  mockAssertCanManageProfileTarget: vi.fn().mockResolvedValue(undefined),
  mockCacheDelByPrefix: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../../services/core/cache.service.js', () => ({
  getCacheService: () => ({
    delByPrefix: mockCacheDelByPrefix,
  }),
}));

vi.mock('../../../../../services/profile/profile-write-access.service.js', () => ({
  createProfileWriteAccessService: () => ({
    assertCanManageProfileTarget: mockAssertCanManageProfileTarget,
  }),
}));

vi.mock('../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { UpdateTimelinePostTool } from '../user/update-timeline-post.tool.js';

function createMockFirestore(postData: Record<string, unknown>) {
  const postRef = {
    get: vi.fn().mockResolvedValue({
      exists: true,
      data: () => postData,
    }),
    update: vi.fn().mockResolvedValue(undefined),
  };

  return {
    db: {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name !== 'Posts') throw new Error(`Unexpected collection ${name}`);
        return {
          doc: vi.fn().mockReturnValue(postRef),
        };
      }),
    },
    postRef,
  };
}

describe('UpdateTimelinePostTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates the profile timeline v2 cache after a successful update', async () => {
    const { db, postRef } = createMockFirestore({
      userId: 'athlete-1',
      type: 'text',
    });
    const tool = new UpdateTimelinePostTool(db as never);

    const result = await tool.execute(
      {
        postId: 'post-1',
        userId: 'athlete-1',
        content: 'Updated post body',
      },
      { userId: 'athlete-1' } as never
    );

    expect(result.success).toBe(true);
    expect(postRef.update).toHaveBeenCalled();
    expect(mockCacheDelByPrefix).toHaveBeenCalledWith('profile:sub:timeline:v2:athlete-1');
    expect(mockCacheDelByPrefix).toHaveBeenCalledWith('feed:post:post-1');
  });
});
