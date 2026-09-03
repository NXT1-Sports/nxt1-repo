import { describe, expect, it } from 'vitest';
import {
  resolveTeamFilmTrackingAdapter,
  type SportTrackingAdapter,
  type TeamFilmTrackingManifest,
} from './team-film-tracking.model';

describe('team film tracking model contracts', () => {
  it('represents a position-first football tracking manifest', () => {
    const manifest: TeamFilmTrackingManifest = {
      schemaVersion: 1,
      id: 'tracking-review-1-wide-1',
      filmReviewId: 'review-1',
      sourceId: 'wide-1',
      sport: 'football',
      surfaceType: 'field',
      status: 'ready',
      capability: 'metric_ready',
      mode: 'metric',
      modelBundle: {
        id: 'football-tracking-alpha',
        version: '2026.1.0',
        detector: 'rtdetrv2-football-alpha',
        tracker: 'bytetrack',
      },
      generatedAt: '2026-09-02T00:00:00.000Z',
      timeRange: { startSec: 12, endSec: 24 },
      fps: 29.97,
      totalFrameCount: 360,
      chunks: [
        {
          id: 'chunk-12-24',
          storagePath: 'Teams/team-1/film/review-1/tracking/wide-1/chunk-12-24.jsonl.gz',
          timeRange: { startSec: 12, endSec: 24 },
          frameCount: 360,
        },
      ],
      tracks: [
        {
          trackId: 'track-7',
          kind: 'player',
          teamSide: 'home',
          jerseyCandidates: [{ value: '7', confidence: 0.91, source: 'model' }],
          positionCandidates: [{ value: 'WR', confidence: 0.94, source: 'model' }],
          firstSeenSec: 12,
          lastSeenSec: 24,
          confidence: 0.92,
        },
      ],
      playMetrics: [
        {
          playId: 'play-1',
          timeRange: { startSec: 12, endSec: 24 },
          capability: 'metric_ready',
          topSpeedTrackId: 'track-7',
          topSpeedMph: 18.4,
          formationLabel: 'Trips Right',
          coverageLabel: 'Cover 3',
          confidence: 0.86,
        },
      ],
      correctionRevision: 0,
    };

    expect(manifest.tracks[0]?.positionCandidates?.[0]?.value).toBe('WR');
    expect(manifest.playMetrics?.[0]?.topSpeedMph).toBe(18.4);
  });

  it('describes sport adapters without requiring framework dependencies', () => {
    const adapter: SportTrackingAdapter = {
      sport: 'football',
      aliases: ['american_football', 'flag_football'],
      surfaceType: 'field',
      supportedCapabilities: ['detection_only', 'tracked_image_space', 'calibrated_surface'],
      canonicalPositions: ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S'],
      tacticalRoles: ['passer', 'ball_carrier', 'primary_defender', 'edge_rusher'],
      landmarks: ['sideline', 'hash_mark', 'yard_line', 'end_zone', 'goalpost'],
      zones: ['backfield', 'box', 'slot', 'numbers', 'sideline', 'end_zone'],
      metrics: ['speed', 'separation', 'route_depth', 'time_to_pressure'],
    };

    expect(adapter.supportedCapabilities).toContain('calibrated_surface');
    expect(adapter.canonicalPositions).toContain('QB');
  });

  it('resolves sport-specific adapters with a generic fallback', () => {
    expect(resolveTeamFilmTrackingAdapter('Football').surfaceType).toBe('field');
    expect(resolveTeamFilmTrackingAdapter('basketball womens').surfaceType).toBe('court');
    expect(resolveTeamFilmTrackingAdapter('bowling').sport).toBe('generic');
  });
});
