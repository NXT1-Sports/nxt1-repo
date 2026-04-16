import { describe, expect, it, vi, beforeEach } from 'vitest';

const safeTrackMock = vi.fn();

vi.mock('../analytics-logger.service.js', () => ({
  getAnalyticsLoggerService: () => ({
    safeTrack: safeTrackMock,
  }),
}));

const {
  buildAthleteOverviewCards,
  buildViewsBySourceFromSurfaceCounts,
  buildViewerBreakdownFromRoleCounts,
  getSummaryTimeframeForPeriod,
  recordProfileView,
} = await import('../analytics.service.js');

describe('analytics.service rollup helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps dashboard periods to Mongo rollup timeframes', () => {
    expect(getSummaryTimeframeForPeriod('day')).toBe('24h');
    expect(getSummaryTimeframeForPeriod('week')).toBe('7d');
    expect(getSummaryTimeframeForPeriod('month')).toBe('30d');
    expect(getSummaryTimeframeForPeriod('quarter')).toBe('90d');
    expect(getSummaryTimeframeForPeriod('year')).toBe('all');
    expect(getSummaryTimeframeForPeriod('all-time')).toBe('all');
  });

  it('prefers rollup-backed engagement counts for athlete overview cards', () => {
    const overview = buildAthleteOverviewCards(
      {
        displayName: 'Jordan Athlete',
        aboutMe: 'Explosive two-way player',
        sports: [{ sport: 'football' }],
      },
      [{ views: 275, likes: 25 }],
      [],
      {
        profileViews: 42,
        coachViews: 12,
        followerCount: 7,
      }
    );

    expect(overview.profileViews.value).toBe(42);
    expect(overview.collegeCoachViews.value).toBe(12);
    expect(overview.followers.value).toBe(7);
    expect(overview.videoViews.value).toBe(275);
  });

  it('converts tracked surfaces into proportional source data', () => {
    const rows = buildViewsBySourceFromSurfaceCounts({
      email: 8,
      profile: 6,
      post: 4,
      page: 2,
    });

    expect(rows[0]).toMatchObject({ source: 'email', views: 8, percentage: 40 });
    expect(rows[1]).toMatchObject({ source: 'profile', views: 6, percentage: 30 });
    expect(rows).toHaveLength(4);
  });

  it('builds viewer role percentages from tracked analytics events', () => {
    const rows = buildViewerBreakdownFromRoleCounts({
      coach: 5,
      athlete: 3,
      parent: 2,
    });

    expect(rows.find((row: { type: string }) => row.type === 'coach')).toMatchObject({
      count: 5,
      percentage: 50,
    });
    expect(rows.find((row: { type: string }) => row.type === 'parent')).toMatchObject({
      count: 2,
      percentage: 20,
    });
  });

  it('records profile views without mutating Firestore analytics documents', async () => {
    const setMock = vi.fn();
    const activitySetMock = vi.fn();

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'Users') {
          return {
            doc: vi.fn(() => ({
              collection: vi.fn(() => ({
                doc: vi.fn(() => ({
                  set: activitySetMock,
                })),
              })),
              set: setMock,
            })),
          };
        }

        throw new Error(`Unexpected collection: ${name}`);
      }),
    };

    await recordProfileView(db as never, 'athlete-1', 'viewer-1', 'coach');

    expect(setMock).not.toHaveBeenCalled();
    expect(activitySetMock).not.toHaveBeenCalled();
    expect(safeTrackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'athlete-1',
        eventType: 'profile_viewed',
        actorUserId: 'viewer-1',
      })
    );
  });
});
