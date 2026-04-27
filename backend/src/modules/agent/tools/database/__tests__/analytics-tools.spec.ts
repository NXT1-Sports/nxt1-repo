/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';

import { TrackAnalyticsEventTool } from '../track-analytics-event.tool.js';
import { GetAnalyticsSummaryTool } from '../get-analytics-summary.tool.js';

describe('analytics agent tools', () => {
  it('tracks a custom analytics event via a registered template', async () => {
    const mockRegistry = {
      getById: vi.fn(),
      getByKeyOrAlias: vi.fn(),
      incrementUsage: vi.fn(),
    };
    const analytics = {
      track: vi.fn().mockResolvedValue({
        eventId: 'evt_custom_1',
        subjectId: 'user_123',
        subjectType: 'user',
        domain: 'custom',
        eventType: 'injury_recorded',
        occurredAt: '2026-04-24T00:00:00.000Z',
      }),
    } as any;

    mockRegistry.getByKeyOrAlias.mockResolvedValue({
      id: 'tmpl_1',
      templateKey: 'injury_report',
      displayName: 'Injury Report',
      description: 'Tracks injury updates',
      baseDomain: 'performance',
      canonicalEventType: 'injury_recorded',
      aliases: ['injury'],
      requiredPayloadFields: ['injuryType'],
      suggestedTags: ['health'],
      payloadSchemaVersion: '1.0.0',
      status: 'active',
      createdBy: 'agent-x',
      createdAt: '2026-04-20T00:00:00.000Z',
      lastUsedAt: null,
      usageCount: 4,
      metadata: {},
    });
    mockRegistry.incrementUsage.mockResolvedValue(undefined);

    const tool = new TrackAnalyticsEventTool(analytics, mockRegistry as any);
    const result = await tool.execute(
      {
        userId: 'user_123',
        domain: 'custom',
        templateKey: 'injury_report',
        payload: { injuryType: 'ankle' },
        tags: ['reported'],
      },
      { userId: 'user_123', sessionId: 'session_1', threadId: 'thread_1' }
    );

    expect(result.success).toBe(true);
    expect(analytics.track).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'user_123',
        domain: 'custom',
        eventType: 'injury_recorded',
        tags: expect.arrayContaining(['reported', 'health']),
        metadata: expect.objectContaining({
          templateId: 'tmpl_1',
          templateKey: 'injury_report',
          templateBaseDomain: 'performance',
        }),
      })
    );
  });

  it('rejects custom analytics events without a registered template', async () => {
    const tool = new TrackAnalyticsEventTool(
      { track: vi.fn() } as any,
      {
        getById: vi.fn(),
        getByKeyOrAlias: vi.fn(),
        incrementUsage: vi.fn(),
      } as any
    );

    const result = await tool.execute({
      userId: 'user_123',
      domain: 'custom',
      payload: { anything: true },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('must use a registered template');
  });

  it('enforces required template payload fields before writing', async () => {
    const mockRegistry = {
      getById: vi.fn(),
      getByKeyOrAlias: vi.fn(),
      incrementUsage: vi.fn(),
    };
    mockRegistry.getByKeyOrAlias.mockResolvedValue({
      id: 'tmpl_2',
      templateKey: 'camp_attendance',
      displayName: 'Camp Attendance',
      description: 'Tracks camp attendance',
      baseDomain: 'recruiting',
      canonicalEventType: 'camp_attendance_recorded',
      aliases: [],
      requiredPayloadFields: ['campName', 'attendedAt'],
      suggestedTags: [],
      payloadSchemaVersion: '1.0.0',
      status: 'active',
      createdBy: 'agent-x',
      createdAt: '2026-04-20T00:00:00.000Z',
      lastUsedAt: null,
      usageCount: 1,
      metadata: {},
    });

    const analytics = { track: vi.fn() } as any;
    const tool = new TrackAnalyticsEventTool(analytics, mockRegistry as any);
    const result = await tool.execute({
      userId: 'user_123',
      domain: 'custom',
      templateKey: 'camp_attendance',
      payload: { campName: 'Elite 11' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('requires payload fields: attendedAt');
    expect(analytics.track).not.toHaveBeenCalled();
  });

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
    expect(result.error).toContain('domain must be one of');
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

  it('passes custom template filters through to summary queries', async () => {
    const analytics = {
      getSummary: vi.fn().mockResolvedValue({
        subjectId: 'user_123',
        subjectType: 'user',
        domain: 'custom',
        timeframe: '30d',
        totalCount: 3,
        numericValueTotal: 0,
        countsByEventType: { injury_recorded: 3 },
        countsByTemplateKey: { injury_report: 3 },
        countsByTemplateBaseDomain: { performance: 3 },
        templateBreakdown: [],
        lastEventAt: '2026-04-24T00:00:00.000Z',
        lastAggregatedAt: '2026-04-24T00:00:00.000Z',
      }),
    } as any;

    const tool = new GetAnalyticsSummaryTool(analytics);
    const result = await tool.execute({
      userId: 'user_123',
      domain: 'custom',
      templateKey: 'injury_report',
      templateBaseDomain: 'performance',
    });

    expect(result.success).toBe(true);
    expect(analytics.getSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'custom',
        templateKey: 'injury_report',
        templateBaseDomain: 'performance',
      })
    );
  });
});
