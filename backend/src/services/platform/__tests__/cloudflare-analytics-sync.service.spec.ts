import { describe, expect, it, vi } from 'vitest';
import { CloudflareAnalyticsSyncService } from '../cloudflare-analytics-sync.service.js';

function makeFirestoreForPosts(postsById: Record<string, Record<string, unknown>>) {
  const updates: Array<{ postId: string; payload: Record<string, unknown> }> = [];

  const collection = vi.fn().mockImplementation((_name: string) => ({
    doc: vi.fn().mockImplementation((id: string) => ({
      id,
      get: vi.fn().mockResolvedValue({
        exists: !!postsById[id],
        data: () => postsById[id],
      }),
      update: vi.fn().mockImplementation(async (payload: Record<string, unknown>) => {
        updates.push({ postId: id, payload });
      }),
    })),
    where: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
      }),
    }),
  }));

  return {
    db: { collection } as unknown,
    updates,
  };
}

describe('CloudflareAnalyticsSyncService', () => {
  it('routes team videos to team subject and athlete videos to user subject', async () => {
    const analyticsRows = new Map([
      [
        'video-team-1',
        {
          videoUid: 'video-team-1',
          playCount: 5,
          playbackMinutesViewed: 10,
          deliveryMinutesViewed: 22,
          byCountry: { US: { playCount: 5, playbackMinutesViewed: 10, deliveryMinutesViewed: 22 } },
        },
      ],
      [
        'video-user-1',
        {
          videoUid: 'video-user-1',
          playCount: 0,
          playbackMinutesViewed: 9,
          deliveryMinutesViewed: 0,
          byCountry: { US: { playCount: 0, playbackMinutesViewed: 9, deliveryMinutesViewed: 0 } },
        },
      ],
    ]);

    const cloudflareAnalytics = {
      fetchVideoAnalyticsWindow: vi.fn().mockResolvedValue(analyticsRows),
    };

    const safeTrack = vi.fn().mockResolvedValue(undefined);
    const analyticsLogger = { safeTrack };

    const { db, updates } = makeFirestoreForPosts({
      'cf-stream-video-team-1': { teamId: 'team-123', userId: 'athlete-aaa' },
      'cf-stream-video-user-1': { userId: 'athlete-bbb' },
    });

    const service = new CloudflareAnalyticsSyncService(
      cloudflareAnalytics as never,
      analyticsLogger as never,
      db as never
    );

    const result = await service.syncLast24Hours(new Date('2026-05-06T12:00:00.000Z'));

    expect(result).toEqual({ processed: 2, tracked: 3, errors: 0 });
    expect(safeTrack).toHaveBeenCalledTimes(3);

    expect(safeTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'team-123',
        subjectType: 'team',
        eventType: 'video_played',
        value: 5,
      })
    );

    expect(safeTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'team-123',
        subjectType: 'team',
        eventType: 'video_watched',
        value: 22,
      })
    );

    expect(safeTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'athlete-bbb',
        subjectType: 'user',
        eventType: 'video_watched',
        value: 9,
      })
    );

    expect(updates).toHaveLength(2);
    expect(updates.map((entry) => entry.postId).sort()).toEqual([
      'cf-stream-video-team-1',
      'cf-stream-video-user-1',
    ]);
  });
});
