import { describe, expect, it, vi } from 'vitest';

import { ProfileComponent } from './profile.component';

describe('ProfileComponent.fetchSubCollections', () => {
  it('loads recruiting activity alongside the other profile sub-collections', async () => {
    const getProfileGameLogs = vi.fn().mockResolvedValue({ success: true, data: [] });
    const getProfileMetrics = vi.fn().mockResolvedValue({ success: true, data: [] });
    const recruiting = [
      {
        id: 'offer-1',
        category: 'offer',
        collegeName: 'Ohio State',
        sport: 'football',
        date: '2026-07-20T00:00:00.000Z',
      },
    ];
    const getProfileRecruiting = vi.fn().mockResolvedValue({
      success: true,
      data: recruiting,
    });
    const getProfileTimeline = vi.fn().mockResolvedValue({
      success: true,
      data: [],
      hasMore: false,
      nextCursor: undefined,
    });
    const setGameLogs = vi.fn();
    const setMetricsFromRaw = vi.fn();
    const setRecruitingActivities = vi.fn();
    const setPolymorphicTimeline = vi.fn();
    const loadAthleteIntel = vi.fn().mockResolvedValue(undefined);

    const component = Object.create(ProfileComponent.prototype) as Record<string, unknown>;
    component['profileApiService'] = {
      getProfileGameLogs,
      getProfileMetrics,
      getProfileRecruiting,
      getProfileTimeline,
    };
    component['uiProfileService'] = {
      setGameLogs,
      setMetricsFromRaw,
      setRecruitingActivities,
      setPolymorphicTimeline,
    };
    component['logger'] = {
      warn: vi.fn(),
    };
    component['intel'] = {
      loadAthleteIntel,
    };

    const fetchSubCollections = component['fetchSubCollections'] as (
      userId: string,
      sportId?: string
    ) => Promise<void>;

    await fetchSubCollections.call(component, 'athlete-1', 'football');

    expect(getProfileRecruiting).toHaveBeenCalledWith('athlete-1', 'football');
    expect(setRecruitingActivities).toHaveBeenCalledWith(recruiting);
    expect(loadAthleteIntel).toHaveBeenCalledWith('athlete-1');
  });
});
