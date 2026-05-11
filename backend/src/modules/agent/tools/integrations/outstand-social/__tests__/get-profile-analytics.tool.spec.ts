import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../../base.tool.js';
import { GetProfileAnalyticsTool } from '../get-profile-analytics.tool.js';

vi.mock('../user-social-account-store.js', () => ({
  listUserConnectedSocialAccounts: vi.fn(),
}));

import { listUserConnectedSocialAccounts } from '../user-social-account-store.js';

const context = {
  userId: 'user-123',
  environment: 'staging',
  emitStage: vi.fn(),
} satisfies ToolExecutionContext;

describe('GetProfileAnalyticsTool', () => {
  const bridge = {
    getAccountMetrics: vi.fn(),
  };

  let tool: GetProfileAnalyticsTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new GetProfileAnalyticsTool(bridge as never);
  });

  it('aggregates profile analytics across connected accounts', async () => {
    vi.mocked(listUserConnectedSocialAccounts).mockResolvedValue([
      {
        id: 'acc_x',
        network: 'x',
        username: 'nxt1x',
        isActive: true,
      },
      {
        id: 'acc_ig',
        network: 'instagram',
        username: 'nxt1ig',
        isActive: true,
      },
    ] as never);

    bridge.getAccountMetrics
      .mockResolvedValueOnce({
        socialAccountId: 'acc_x',
        followerCount: 1000,
        engagementRate: 2.5,
        likes: 200,
        comments: 30,
        shares: 20,
        views: 1500,
        impressions: 3000,
        reach: 2500,
        trendPoints: [],
      })
      .mockResolvedValueOnce({
        socialAccountId: 'acc_ig',
        followerCount: 500,
        engagementRate: 4.1,
        likes: 120,
        comments: 15,
        shares: 10,
        views: 900,
        impressions: 1800,
        reach: 1400,
        trendPoints: [],
      });

    const result = await tool.execute({}, context);

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect((data['totals'] as { followerCount: number }).followerCount).toBe(1500);
    expect(data['averageEngagementRate']).toBeGreaterThan(3);
  });
});
