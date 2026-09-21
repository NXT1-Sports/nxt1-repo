import { beforeEach, describe, expect, it, vi } from 'vitest';

const { distinct } = vi.hoisted(() => ({ distinct: vi.fn() }));

vi.mock('../../../models/agent/agent-message.model.js', () => ({
  AgentMessageModel: { distinct },
}));

import {
  calculateVisitorConversationMetric,
  calculateVisitorToConversationRate,
} from '../visitor-conversation-metric.js';

describe('visitor-to-conversation metric', () => {
  beforeEach(() => {
    distinct.mockReset();
  });

  it('counts distinct users with a persisted Agent X user message', async () => {
    distinct.mockResolvedValue(['visitor-a', ' visitor-a ', 'visitor-c']);

    const result = await calculateVisitorConversationMetric(
      new Date('2026-07-06T00:00:00.000Z'),
      new Date('2026-07-13T00:00:00.000Z'),
      'week',
      vi.fn().mockResolvedValue({ totalUsers: 10 })
    );

    expect(result).toEqual({
      totalVisitors: 10,
      conversingVisitors: 2,
      ratePercent: 20,
    });
    expect(distinct).toHaveBeenCalledWith('userId', {
      role: 'user',
      createdAt: {
        $gte: '2026-07-06T00:00:00.000Z',
        $lt: '2026-07-13T00:00:00.000Z',
      },
      userId: { $exists: true, $ne: null },
    });
  });

  it('returns no rate when GA4 has no visitors', () => {
    expect(calculateVisitorToConversationRate(1, 0)).toBeUndefined();
  });

  it('returns zero conversing visitors when no messages were sent', async () => {
    distinct.mockResolvedValue([]);

    const result = await calculateVisitorConversationMetric(
      new Date('2026-07-06T00:00:00.000Z'),
      new Date('2026-07-13T00:00:00.000Z'),
      'week',
      vi.fn().mockResolvedValue({ totalUsers: 10 })
    );

    expect(result).toEqual({ totalVisitors: 10, conversingVisitors: 0, ratePercent: 0 });
    expect(distinct).toHaveBeenCalled();
  });
});
