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

import { DeleteTimelinePostTool } from '../user/delete-timeline-post.tool.js';

function createMockFirestore(postData: Record<string, unknown>) {
  const postRef = {
    get: vi.fn().mockResolvedValue({
      exists: true,
      data: () => postData,
    }),
  };
  const userRef = {
    update: vi.fn().mockResolvedValue(undefined),
  };
  const batch = {
    delete: vi.fn(),
    update: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };

  return {
    db: {
      batch: vi.fn().mockReturnValue(batch),
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'Posts') {
          return {
            doc: vi.fn().mockReturnValue(postRef),
          };
        }

        if (name === 'Users') {
          return {
            doc: vi.fn().mockReturnValue(userRef),
          };
        }

        if (name === 'Users/athlete-1/Posts') {
          return {
            doc: vi.fn().mockReturnValue({}),
          };
        }

        throw new Error(`Unexpected collection ${name}`);
      }),
    },
    batch,
    userRef,
  };
}

describe('DeleteTimelinePostTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates the profile timeline v2 cache after a successful delete', async () => {
    const { db, batch, userRef } = createMockFirestore({
      userId: 'athlete-1',
      type: 'text',
    });
    const tool = new DeleteTimelinePostTool(db as never);

    const result = await tool.execute(
      {
        postId: 'post-1',
        userId: 'athlete-1',
      },
      { userId: 'athlete-1' } as never
    );

    expect(result.success).toBe(true);
    expect(batch.commit).toHaveBeenCalled();
    expect(userRef.update).toHaveBeenCalled();
    expect(mockCacheDelByPrefix).toHaveBeenCalledWith('profile:sub:timeline:v2:athlete-1');
    expect(mockCacheDelByPrefix).toHaveBeenCalledWith('feed:post:post-1');
  });
});
