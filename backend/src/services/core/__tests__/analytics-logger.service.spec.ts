import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAggregate = vi.fn();
const mockFindOne = vi.fn();
const mockUpdateOne = vi.fn();
const mockCreate = vi.fn();

vi.mock('../../../models/analytics/analytics-event.model.js', () => ({
  AnalyticsEventModel: {
    aggregate: (...args: unknown[]) => mockAggregate(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

vi.mock('../../../models/analytics/analytics-rollup.model.js', () => ({
  AnalyticsRollupModel: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    updateOne: (...args: unknown[]) => mockUpdateOne(...args),
  },
}));

vi.mock('../../../config/runtime-environment.js', () => ({
  getRuntimeEnvironment: () => 'staging',
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { AnalyticsLoggerService } = await import('../analytics-logger.service.js');

describe('AnalyticsLoggerService.getSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mockUpdateOne.mockResolvedValue(undefined);
    mockCreate.mockResolvedValue({ _id: 'evt_1' });
  });

  it('returns custom analytics breakdowns by template key and base domain', async () => {
    mockAggregate.mockResolvedValue([
      {
        _id: {
          templateKey: 'injury_report',
          templateBaseDomain: 'performance',
          eventType: 'injury_recorded',
        },
        count: 2,
        numericValueTotal: 0,
        lastEventAt: new Date('2026-04-24T00:00:00.000Z'),
      },
      {
        _id: {
          templateKey: 'injury_report',
          templateBaseDomain: 'performance',
          eventType: 'clearance_recorded',
        },
        count: 1,
        numericValueTotal: 0,
        lastEventAt: new Date('2026-04-25T00:00:00.000Z'),
      },
      {
        _id: {
          templateKey: 'camp_attendance',
          templateBaseDomain: 'recruiting',
          eventType: 'camp_attendance_recorded',
        },
        count: 3,
        numericValueTotal: 0,
        lastEventAt: new Date('2026-04-23T00:00:00.000Z'),
      },
    ]);

    const service = new AnalyticsLoggerService();
    const result = await service.getSummary({
      subjectId: 'user_123',
      subjectType: 'user',
      domain: 'custom',
      timeframe: '30d',
    });

    expect(result.totalCount).toBe(6);
    expect(result.countsByTemplateKey).toEqual({
      injury_report: 3,
      camp_attendance: 3,
    });
    expect(result.countsByTemplateBaseDomain).toEqual({
      performance: 3,
      recruiting: 3,
    });
    expect(result.templateBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          templateKey: 'injury_report',
          templateBaseDomain: 'performance',
          totalCount: 3,
          countsByEventType: {
            injury_recorded: 2,
            clearance_recorded: 1,
          },
        }),
      ])
    );
    expect(mockAggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: expect.objectContaining({
            environment: 'staging',
            subjectId: 'user_123',
            subjectType: 'user',
            domain: 'custom',
          }),
        }),
      ])
    );
  });

  it('rejects system domain events from analyticsEvents ingestion', async () => {
    const service = new AnalyticsLoggerService();

    await expect(
      service.track({
        subjectId: 'user_123',
        subjectType: 'user',
        domain: 'system',
        eventType: 'sync_completed',
        source: 'agent',
        actorUserId: 'user_123',
        payload: {},
      })
    ).rejects.toThrow(/domain=system is not allowed/i);

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects source=system events from analyticsEvents ingestion', async () => {
    const service = new AnalyticsLoggerService();

    await expect(
      service.track({
        subjectId: 'user_123',
        subjectType: 'user',
        domain: 'engagement',
        eventType: 'content_viewed',
        source: 'system',
        actorUserId: 'user_123',
        payload: {},
      })
    ).rejects.toThrow(/source=system is not allowed/i);

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('allows anonymous events only when event type is explicitly allowlisted', async () => {
    const service = new AnalyticsLoggerService();

    await expect(
      service.track({
        subjectId: 'user_123',
        subjectType: 'user',
        domain: 'engagement',
        eventType: 'search_appeared',
        source: 'user',
        actorUserId: null,
        payload: {},
      })
    ).rejects.toThrow(/Anonymous analytics events are blocked/i);

    await expect(
      service.track({
        subjectId: 'user_123',
        subjectType: 'user',
        domain: 'engagement',
        eventType: 'content_viewed',
        source: 'user',
        actorUserId: null,
        payload: {},
      })
    ).resolves.toBeDefined();

    await expect(
      service.track({
        subjectId: 'team_123',
        subjectType: 'team',
        domain: 'engagement',
        eventType: 'content_viewed',
        source: 'user',
        actorUserId: null,
        payload: {},
      })
    ).resolves.toBeDefined();

    await expect(
      service.track({
        subjectId: 'user_123',
        subjectType: 'user',
        domain: 'engagement',
        eventType: 'content_shared',
        source: 'user',
        actorUserId: null,
        payload: {},
      })
    ).resolves.toBeDefined();

    await expect(
      service.track({
        subjectId: 'user_123',
        subjectType: 'user',
        domain: 'engagement',
        eventType: 'video_played',
        source: 'user',
        actorUserId: null,
        payload: {},
      })
    ).resolves.toBeDefined();

    await expect(
      service.track({
        subjectId: 'team_123',
        subjectType: 'team',
        domain: 'engagement',
        eventType: 'video_watched',
        source: 'user',
        actorUserId: null,
        payload: {},
      })
    ).resolves.toBeDefined();

    await expect(
      service.track({
        subjectId: 'user_123',
        subjectType: 'user',
        domain: 'communication',
        eventType: 'email_opened',
        source: 'user',
        actorUserId: null,
        payload: {},
      })
    ).resolves.toBeDefined();
  });
});
