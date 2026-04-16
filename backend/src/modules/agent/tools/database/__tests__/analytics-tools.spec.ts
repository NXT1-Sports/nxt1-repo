import { describe, expect, it, vi } from 'vitest';
import { TrackAnalyticsEventTool } from '../track-analytics-event.tool.js';
import { GetAnalyticsSummaryTool } from '../get-analytics-summary.tool.js';

describe('analytics agent tools', () => {
  it('tracks a NIL analytics event with a smart default event type', async () => {
    const analytics = {
      track: vi.fn().mockResolvedValue({
        eventId: 'evt_1',
        subjectId: 'user_123',
        subjectType: 'user',
        domain: 'nil',
        eventType: 'deal_recorded',
        occurredAt: '2026-04-14T00:00:00.000Z',
      }),
    } as any;

    const tool = new TrackAnalyticsEventTool(analytics);
    const result = await tool.execute(
      {
        userId: 'user_123',
        domain: 'nil',
        value: 500,
        payload: { brand: 'Nike', amount: 500 },
      },
      { userId: 'user_123', sessionId: 'session_1', threadId: 'thread_1' }
    );

    expect(result.success).toBe(true);
    expect(analytics.track).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'user_123',
        domain: 'nil',
        eventType: 'deal_recorded',
        value: 500,
      })
    );
  });

  it('returns a validation error for an unsupported analytics domain', async () => {
    const tool = new TrackAnalyticsEventTool({ track: vi.fn() } as any);

    const result = await tool.execute({
      userId: 'user_123',
      domain: 'made_up_domain',
      payload: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('domain is required');
  });

  it('reads a rollup summary for the requested timeframe', async () => {
    const analytics = {
      getSummary: vi.fn().mockResolvedValue({
        subjectId: 'user_123',
        subjectType: 'user',
        domain: 'communication',
        timeframe: '30d',
        totalCount: 4,
        numericValueTotal: 0,
        countsByEventType: { email_sent: 4 },
        lastEventAt: '2026-04-14T00:00:00.000Z',
        lastAggregatedAt: '2026-04-14T00:00:00.000Z',
      }),
    } as any;

    const tool = new GetAnalyticsSummaryTool(analytics);
    const result = await tool.execute({
      userId: 'user_123',
      domain: 'communication',
      timeframe: '30d',
    });

    expect(result.success).toBe(true);
    expect((result.data as { totalCount: number }).totalCount).toBe(4);
    expect(analytics.getSummary).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'communication', timeframe: '30d' })
    );
  });
});
