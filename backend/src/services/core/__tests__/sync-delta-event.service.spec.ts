import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreate = vi.fn();
const mockFind = vi.fn();
const mockSafeTrack = vi.fn();

vi.mock('../../../models/core/sync-delta-event.model.js', () => ({
  SyncDeltaEventModel: {
    create: (...args: unknown[]) => mockCreate(...args),
    find: (...args: unknown[]) => mockFind(...args),
  },
}));

vi.mock('../analytics-logger.service.js', () => ({
  getAnalyticsLoggerService: () => ({
    safeTrack: (...args: unknown[]) => mockSafeTrack(...args),
  }),
}));

const { SyncDeltaEventService } = await import('../sync-delta-event.service.js');

describe('SyncDeltaEventService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ _id: 'sync_evt_1' });
    mockSafeTrack.mockResolvedValue(undefined);
  });

  it('persists a sync delta event and mirrors it to analytics', async () => {
    const service = new SyncDeltaEventService();

    const result = await service.record({
      userId: 'user_123',
      sport: 'football',
      source: 'maxpreps',
      syncedAt: '2026-04-14T00:00:00.000Z',
      teamId: 'team_123',
      organizationId: 'org_123',
      isEmpty: false,
      identityChanges: [{ field: 'classOf', oldValue: 2026, newValue: 2027 }],
      newCategories: [],
      statChanges: [],
      newRecruitingActivities: [{ type: 'offer', school: 'Texas' }],
      newAwards: [],
      newScheduleEvents: [],
      newVideos: [],
      summary: {
        identityFieldsChanged: 1,
        newCategoriesAdded: 0,
        statsUpdated: 0,
        newRecruitingActivities: 1,
        newAwards: 0,
        newScheduleEvents: 0,
        newVideos: 0,
        totalChanges: 2,
      },
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({
      environment: 'staging',
      userId: 'user_123',
      teamId: 'team_123',
      organizationId: 'org_123',
      sport: 'football',
      source: 'maxpreps',
      promptSummary: expect.stringContaining('football sync via maxpreps'),
    });
    expect(mockSafeTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'user_123',
        domain: 'system',
        eventType: 'sync_completed',
        value: 2,
      })
    );
    expect(result.eventId).toBe('sync_evt_1');
  });

  it('returns recent prompt summaries in descending sync order', async () => {
    const exec = vi
      .fn()
      .mockResolvedValue([
        { promptSummary: 'football sync via maxpreps: 2 stat changes.' },
        { promptSummary: 'football sync via hudl: 1 new video.' },
      ]);
    const lean = vi.fn(() => ({ exec }));
    const select = vi.fn(() => ({ lean }));
    const limit = vi.fn(() => ({ select }));
    const sort = vi.fn(() => ({ limit }));
    mockFind.mockReturnValue({ sort });

    const service = new SyncDeltaEventService();
    const result = await service.listRecentSummaries({ userId: 'user_123', limit: 2 });

    expect(mockFind).toHaveBeenCalledWith({ environment: 'staging', userId: 'user_123' });
    expect(result).toEqual([
      'football sync via maxpreps: 2 stat changes.',
      'football sync via hudl: 1 new video.',
    ]);
  });
});
