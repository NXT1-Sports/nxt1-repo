import { describe, expect, it } from 'vitest';

import { SyncDiffService, type PreviousProfileState } from '../sync-diff.service.js';

describe('SyncDiffService', () => {
  it('ignores legacy school and banner fields in identity diffs', () => {
    const service = new SyncDiffService();
    const previous: PreviousProfileState = {
      identity: {
        firstName: 'Jordan',
        school: 'Old School',
        schoolLogoUrl: 'https://old/logo.png',
        bannerImage: 'https://old/banner.png',
      },
    };

    const delta = service.diff('user-1', 'football', 'maxpreps', previous, {
      platform: 'maxpreps',
      profileUrl: 'https://example.com/profile',
      identity: {
        firstName: 'Jordan',
        school: 'New School',
        schoolLogoUrl: 'https://new/logo.png',
        bannerImage: 'https://new/banner.png',
      },
    });

    expect(delta.identityChanges).toEqual([]);
    expect(delta.isEmpty).toBe(true);
  });

  it('uses event type as part of schedule detection so different event types on the same day do not collide', () => {
    const service = new SyncDiffService();
    const previous: PreviousProfileState = {
      schedule: [
        {
          date: '2026-05-01T18:00:00.000Z',
          opponent: 'Central High',
          eventType: 'practice',
          sport: 'football',
        },
      ],
    };

    const delta = service.diff('user-1', 'football', 'maxpreps', previous, {
      platform: 'maxpreps',
      profileUrl: 'https://example.com/profile',
      schedule: [
        {
          date: '2026-05-01T19:00:00.000Z',
          opponent: 'Central High',
          eventType: 'game',
        },
      ],
    });

    expect(delta.newScheduleEvents).toHaveLength(1);
  });
});
