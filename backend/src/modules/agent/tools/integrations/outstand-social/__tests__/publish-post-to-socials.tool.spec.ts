import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../../base.tool.js';
import { PublishPostToSocialsTool } from '../publish-post-to-socials.tool.js';

vi.mock('../user-social-account-store.js', () => ({
  getUserConnectedSocialAccountsByPlatform: vi.fn(),
}));

import { getUserConnectedSocialAccountsByPlatform } from '../user-social-account-store.js';

const context = {
  userId: 'user-123',
  environment: 'staging',
  emitStage: vi.fn(),
} satisfies ToolExecutionContext;

describe('PublishPostToSocialsTool', () => {
  const bridge = {
    publishPostForPlatforms: vi.fn(),
  };

  let tool: PublishPostToSocialsTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new PublishPostToSocialsTool(bridge as never);
  });

  it('publishes successfully when all requested platforms are connected', async () => {
    vi.mocked(getUserConnectedSocialAccountsByPlatform).mockResolvedValue({
      x: {
        id: 'acc_x',
        network: 'x',
        username: 'nxt1x',
        isActive: true,
      },
      instagram: {
        id: 'acc_ig',
        network: 'instagram',
        username: 'nxt1ig',
        isActive: true,
      },
    } as never);

    bridge.publishPostForPlatforms.mockResolvedValue({
      postIds: ['post_1'],
      status: 'scheduled',
      scheduledAt: '2026-05-10T15:00:00.000Z',
      raw: { ok: true },
    });

    const result = await tool.execute(
      {
        content: 'Game day tomorrow',
        platforms: ['x', 'instagram'],
        scheduledAt: '2026-05-10T15:00:00.000Z',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(bridge.publishPostForPlatforms).toHaveBeenCalledTimes(1);
    expect((result.data as Record<string, unknown>)['isScheduled']).toBe(true);
  });

  it('returns a helpful error when a platform is not connected', async () => {
    vi.mocked(getUserConnectedSocialAccountsByPlatform).mockResolvedValue({
      x: {
        id: 'acc_x',
        network: 'x',
        username: 'nxt1x',
        isActive: true,
      },
      instagram: null,
    } as never);

    const result = await tool.execute(
      {
        content: 'Missing Instagram account',
        platforms: ['x', 'instagram'],
      },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No active connected account found');
    expect(bridge.publishPostForPlatforms).not.toHaveBeenCalled();
  });
});
