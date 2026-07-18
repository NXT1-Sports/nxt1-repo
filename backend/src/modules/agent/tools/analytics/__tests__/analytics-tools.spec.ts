import { describe, expect, it, vi } from 'vitest';

import { TrackAnalyticsEventTool } from '../track-analytics-event.tool.js';
import { GetAnalyticsSummaryTool } from '../get-analytics-summary.tool.js';
import { GetRecentSyncSummariesTool } from '../get-recent-sync-summaries.tool.js';
import { logger } from '../../../../../utils/logger.js';
import type { AnalyticsLoggerService } from '../../../../../services/core/analytics-logger.service.js';
import type { AnalyticsTemplateRegistry } from '../../../services/analytics/analytics-template-registry.service.js';
import type { SyncDeltaEventService } from '../../../../../services/core/sync-delta-event.service.js';

type AnalyticsLoggerMock = Pick<AnalyticsLoggerService, 'track' | 'getSummary'>;
type AnalyticsTemplateRegistryMock = Pick<
  AnalyticsTemplateRegistry,
  'getById' | 'getByKeyOrAlias' | 'incrementUsage'
>;
type SyncDeltaEventServiceMock = Pick<SyncDeltaEventService, 'listRecentSummaries'>;

describe('analytics agent tools', () => {
  it('tracks a custom analytics event via a registered template', async () => {
    const mockRegistry: AnalyticsTemplateRegistryMock = {
      getById: vi.fn(),
      getByKeyOrAlias: vi.fn(),
      incrementUsage: vi.fn(),
    };
    const analytics: AnalyticsLoggerMock = {
      track: vi.fn().mockResolvedValue({
        eventId: 'evt_custom_1',
        subjectId: 'user_123',
        subjectType: 'user',
        domain: 'custom',
        eventType: 'injury_recorded',
        occurredAt: '2026-04-24T00:00:00.000Z',
      }),
      getSummary: vi.fn(),
    };

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

    const tool = new TrackAnalyticsEventTool(
      analytics as AnalyticsLoggerService,
      mockRegistry as AnalyticsTemplateRegistry
    );
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
      { track: vi.fn(), getSummary: vi.fn() } as AnalyticsLoggerService,
      {
        getById: vi.fn(),
        getByKeyOrAlias: vi.fn(),
        incrementUsage: vi.fn(),
      } as AnalyticsTemplateRegistry
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
    const mockRegistry: AnalyticsTemplateRegistryMock = {
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

    const analytics: AnalyticsLoggerMock = { track: vi.fn(), getSummary: vi.fn() };
    const tool = new TrackAnalyticsEventTool(
      analytics as AnalyticsLoggerService,
      mockRegistry as AnalyticsTemplateRegistry
    );
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
    const analytics: AnalyticsLoggerMock = {
      track: vi.fn().mockResolvedValue({
        eventId: 'evt_1',
        subjectId: 'user_123',
        subjectType: 'user',
        domain: 'nil',
        eventType: 'deal_recorded',
        occurredAt: '2026-04-14T00:00:00.000Z',
      }),
      getSummary: vi.fn(),
    };

    const tool = new TrackAnalyticsEventTool(analytics as AnalyticsLoggerService);
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

  it('rejects failed outcomes before writing analytics events', async () => {
    const analytics: AnalyticsLoggerMock = {
      track: vi.fn(),
      getSummary: vi.fn(),
    };

    const tool = new TrackAnalyticsEventTool(analytics as AnalyticsLoggerService);
    const result = await tool.execute({
      userId: 'user_123',
      domain: 'communication',
      payload: {
        coordinatorId: 'recruiting',
        workflow: 'platform_intro_email',
        outcome: 'failed',
        toolName: 'send_email_via_nxt1',
        recipient: 'john@nxt1sports.com',
      },
      source: 'agent',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed outcomes must not be recorded');
    expect(analytics.track).not.toHaveBeenCalled();
  });

  it('defaults payload to an empty object when omitted', async () => {
    const analytics: AnalyticsLoggerMock = {
      track: vi.fn().mockResolvedValue({
        eventId: 'evt_2',
        subjectId: 'team_123',
        subjectType: 'team',
        domain: 'engagement',
        eventType: 'content_created',
        occurredAt: '2026-04-14T00:00:00.000Z',
      }),
      getSummary: vi.fn(),
    };

    const tool = new TrackAnalyticsEventTool(analytics as AnalyticsLoggerService);
    const result = await tool.execute({
      userId: 'user_123',
      subjectId: 'team_123',
      subjectType: 'team',
      domain: 'engagement',
      eventType: 'content_created',
      value: 'Generated elite promo graphic',
      tags: ['graphic', 'promo'],
    });

    expect(result.success).toBe(true);
    expect(analytics.track).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {},
        domain: 'engagement',
        eventType: 'content_created',
      })
    );
  });

  it('returns a validation error for an unsupported analytics domain', async () => {
    const tool = new TrackAnalyticsEventTool({
      track: vi.fn(),
      getSummary: vi.fn(),
    } as AnalyticsLoggerService);

    const result = await tool.execute({
      userId: 'user_123',
      domain: 'made_up_domain',
      payload: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('domain must be one of');
  });

  it('returns a controlled error when required string fields are missing', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const tool = new TrackAnalyticsEventTool({
      track: vi.fn(),
      getSummary: vi.fn(),
    } as AnalyticsLoggerService);

    const result = await tool.execute(
      {
        userId: undefined,
        domain: undefined,
      },
      {
        userId: 'ctx_user',
        operationId: 'chat-9b570bf3-2fc7-46cb-aa85-7faea3836c0d',
        threadId: '6a5bf7eadacdc25b4a5e86df',
      }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid input');
    expect(result.error).toContain('expected string, received undefined');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('accepts payload provided as a JSON string object', async () => {
    const analytics: AnalyticsLoggerMock = {
      track: vi.fn().mockResolvedValue({
        eventId: 'evt_3',
        subjectId: 'user_123',
        subjectType: 'user',
        domain: 'engagement',
        eventType: 'content_shared',
        occurredAt: '2026-04-14T00:00:00.000Z',
      }),
      getSummary: vi.fn(),
    };

    const tool = new TrackAnalyticsEventTool(analytics as AnalyticsLoggerService);
    const result = await tool.execute(
      {
        userId: 'user_123',
        domain: 'engagement',
        eventType: 'content_shared',
        payload: '{"channel":"instagram","campaign":"summer"}',
      },
      {
        userId: 'user_123',
        operationId: 'chat-9b570bf3-2fc7-46cb-aa85-7faea3836c0d',
        threadId: '6a5bf7eadacdc25b4a5e86df',
      }
    );

    expect(result.success).toBe(true);
    expect(analytics.track).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { channel: 'instagram', campaign: 'summer' },
        metadata: expect.objectContaining({
          payloadCoercedFrom: 'string',
          operationId: 'chat-9b570bf3-2fc7-46cb-aa85-7faea3836c0d',
        }),
      })
    );
  });

  it('returns a controlled error when payload is a non-object string', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const analytics: AnalyticsLoggerMock = {
      track: vi.fn(),
      getSummary: vi.fn(),
    };
    const tool = new TrackAnalyticsEventTool(analytics as AnalyticsLoggerService);

    const result = await tool.execute(
      {
        userId: 'user_123',
        domain: 'engagement',
        payload: '"just a string"',
      },
      {
        userId: 'user_123',
        operationId: 'chat-9b570bf3-2fc7-46cb-aa85-7faea3836c0d',
        threadId: '6a5bf7eadacdc25b4a5e86df',
      }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid input: payload must be a JSON object');
    expect(analytics.track).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns a controlled error instead of throwing when analytics.track fails', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const analytics: AnalyticsLoggerMock = {
      track: vi.fn().mockRejectedValue(new Error('database unavailable')),
      getSummary: vi.fn(),
    };
    const tool = new TrackAnalyticsEventTool(analytics as AnalyticsLoggerService);

    const result = await tool.execute(
      {
        userId: 'vWV0CovcLdUdNSvbmfGshaCSaaE3',
        domain: 'engagement',
        eventType: 'content_viewed',
        payload: {},
      },
      {
        userId: 'vWV0CovcLdUdNSvbmfGshaCSaaE3',
        operationId: 'chat-9b570bf3-2fc7-46cb-aa85-7faea3836c0d',
        threadId: '6a5bf7eadacdc25b4a5e86df',
      }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to track analytics event: database unavailable');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('reads a rollup summary for the requested timeframe', async () => {
    const analytics: AnalyticsLoggerMock = {
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
      track: vi.fn(),
    };

    const tool = new GetAnalyticsSummaryTool(analytics as AnalyticsLoggerService);
    const result = await tool.execute({
      userId: 'user_123',
      domain: 'communication',
      subjectType: 'user',
      timeframe: '30d',
    });

    expect(result.success).toBe(true);
    expect((result.data as { totalCount: number }).totalCount).toBe(4);
    expect(analytics.getSummary).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'communication', timeframe: '30d' })
    );
  });

  it('passes custom template filters through to summary queries', async () => {
    const analytics: AnalyticsLoggerMock = {
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
      track: vi.fn(),
    };

    const tool = new GetAnalyticsSummaryTool(analytics as AnalyticsLoggerService);
    const result = await tool.execute({
      userId: 'user_123',
      domain: 'custom',
      subjectType: 'user',
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

  it('reads recent sync summaries on demand', async () => {
    const syncDeltaEvents: SyncDeltaEventServiceMock = {
      listRecentSummaries: vi
        .fn()
        .mockResolvedValue([
          'football sync via hudl: 2 stat changes. Highlights: passing_yards → 250',
          'football sync via maxpreps: 1 recruiting update.',
        ]),
    };

    const tool = new GetRecentSyncSummariesTool(syncDeltaEvents as SyncDeltaEventService);
    const result = await tool.execute({
      userId: 'user_123',
      teamId: 'team_456',
      limit: 2,
    });

    expect(result.success).toBe(true);
    expect(syncDeltaEvents.listRecentSummaries).toHaveBeenCalledWith({
      userId: 'user_123',
      teamId: 'team_456',
      limit: 2,
    });
    expect((result.data as { count: number }).count).toBe(2);
    expect(result.markdown).toContain('Recent Sync Summaries');
  });

  it('validates recent sync summary input', async () => {
    const syncDeltaEvents: SyncDeltaEventServiceMock = {
      listRecentSummaries: vi.fn(),
    };

    const tool = new GetRecentSyncSummariesTool(syncDeltaEvents as SyncDeltaEventService);
    const result = await tool.execute({
      userId: '',
    });

    expect(result.success).toBe(false);
    expect(syncDeltaEvents.listRecentSummaries).not.toHaveBeenCalled();
  });
});
