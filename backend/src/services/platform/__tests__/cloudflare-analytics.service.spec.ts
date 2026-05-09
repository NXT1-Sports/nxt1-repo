import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudflareAnalyticsService } from '../cloudflare-analytics.service.js';

describe('CloudflareAnalyticsService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('merges playback and delivery analytics by video and country', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            viewer: {
              accounts: [
                {
                  videoPlaybackEventsAdaptiveGroups: [
                    {
                      count: 10,
                      sum: { timeViewedMinutes: 25 },
                      dimensions: { uid: 'video-1', clientCountryName: 'US' },
                    },
                    {
                      count: 4,
                      sum: { timeViewedMinutes: 8 },
                      dimensions: { uid: 'video-1', clientCountryName: 'CA' },
                    },
                  ],
                },
              ],
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            viewer: {
              accounts: [
                {
                  streamMinutesViewedAdaptiveGroups: [
                    {
                      sum: { minutesViewed: 33 },
                      dimensions: { uid: 'video-1', clientCountryName: 'US' },
                    },
                  ],
                },
              ],
            },
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const service = new CloudflareAnalyticsService('acct_1', 'token_1');
    const result = await service.fetchVideoAnalyticsWindow(
      new Date('2026-05-01T00:00:00.000Z'),
      new Date('2026-05-02T00:00:00.000Z')
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.size).toBe(1);

    const record = result.get('video-1');
    expect(record).toBeDefined();
    expect(record?.playCount).toBe(14);
    expect(record?.playbackMinutesViewed).toBe(33);
    expect(record?.deliveryMinutesViewed).toBe(33);
    expect(record?.byCountry['US']).toEqual({
      playCount: 10,
      playbackMinutesViewed: 25,
      deliveryMinutesViewed: 33,
    });
    expect(record?.byCountry['CA']).toEqual({
      playCount: 4,
      playbackMinutesViewed: 8,
      deliveryMinutesViewed: 0,
    });
  });
});
