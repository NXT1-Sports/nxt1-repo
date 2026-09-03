import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTeamFilmReviewApi } from './team-film-review.api';
import type { HttpAdapter } from '../api/http-adapter';

describe('createTeamFilmReviewApi', () => {
  const http: HttpAdapter = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  const api = createTeamFilmReviewApi(http, '/agent-x');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists persisted film review playlists', async () => {
    vi.mocked(http.get).mockResolvedValue({
      success: true,
      data: {
        playlists: [
          {
            id: 'playlist-1',
            teamId: 't1',
            name: 'Self Scout Playlist',
            parentId: null,
            sortOrder: 0,
            createdBy: 'u1',
            updatedBy: 'u1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        count: 1,
      },
    });

    const result = await api.listPlaylists({ teamId: 't1' });

    expect(http.get).toHaveBeenCalledWith('/agent-x/film-review-playlists?teamId=t1');
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Self Scout Playlist');
  });

  it('creates a persisted film review playlist', async () => {
    vi.mocked(http.post).mockResolvedValue({
      success: true,
      data: {
        playlist: {
          id: 'playlist-2',
          teamId: 't1',
          name: 'Opponent Play List',
          parentId: null,
          sortOrder: 1,
          createdBy: 'u1',
          updatedBy: 'u1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    });

    const created = await api.createPlaylist({ teamId: 't1', name: 'Opponent Play List' });

    expect(http.post).toHaveBeenCalledWith('/agent-x/film-review-playlists', {
      teamId: 't1',
      name: 'Opponent Play List',
    });
    expect(created.id).toBe('playlist-2');
  });

  it('updates a persisted film review playlist', async () => {
    vi.mocked(http.patch).mockResolvedValue({
      success: true,
      data: {
        playlist: {
          id: 'playlist-2',
          teamId: 't1',
          name: 'Opponent Scout',
          parentId: 'playlist-root',
          sortOrder: 3,
          createdBy: 'u1',
          updatedBy: 'u2',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      },
    });

    const updated = await api.updatePlaylist('playlist-2', {
      name: 'Opponent Scout',
      parentId: 'playlist-root',
      sortOrder: 3,
    });

    expect(http.patch).toHaveBeenCalledWith('/agent-x/film-review-playlists/playlist-2', {
      name: 'Opponent Scout',
      parentId: 'playlist-root',
      sortOrder: 3,
    });
    expect(updated.parentId).toBe('playlist-root');
  });

  it('deletes a persisted film review playlist', async () => {
    vi.mocked(http.delete).mockResolvedValue({
      success: true,
      data: {
        message: 'Playlist deleted',
        unassignedReviewCount: 2,
        reparentedChildCount: 1,
      },
    });

    const result = await api.deletePlaylist('playlist-2');

    expect(http.delete).toHaveBeenCalledWith('/agent-x/film-review-playlists/playlist-2');
    expect(result.unassignedReviewCount).toBe(2);
  });

  it('creates freehand drawings through the file sidecar endpoint with flat geometry', async () => {
    vi.mocked(http.post).mockResolvedValue({
      success: true,
      data: {
        drawing: {
          id: 'drawing-1',
          playId: 'play-1',
          kind: 'freehand',
          bounds: { minX: 0.1, minY: 0.2, maxX: 0.4, maxY: 0.5 },
          strokeCount: 2,
          points: [
            { x: 0.1, y: 0.2 },
            { x: 0.2, y: 0.3 },
            { x: 0.4, y: 0.5 },
          ],
          strokeStartIndexes: [0, 2],
          revision: 1,
          createdBy: 'u1',
          createdAt: '2026-08-17T00:00:00.000Z',
          updatedBy: 'u1',
          updatedAt: '2026-08-17T00:00:00.000Z',
        },
      },
    });

    await api.createDrawing('review-1', {
      teamId: 'team-1',
      playId: 'play-1',
      kind: 'freehand',
      bounds: { minX: 0.1, minY: 0.2, maxX: 0.4, maxY: 0.5 },
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.2, y: 0.3 },
        { x: 0.4, y: 0.5 },
      ],
      strokeStartIndexes: [0, 2],
    });

    expect(http.post).toHaveBeenCalledWith('/agent-x/files/review-1/film-review/drawings', {
      teamId: 'team-1',
      playId: 'play-1',
      kind: 'freehand',
      bounds: { minX: 0.1, minY: 0.2, maxX: 0.4, maxY: 0.5 },
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.2, y: 0.3 },
        { x: 0.4, y: 0.5 },
      ],
      strokeStartIndexes: [0, 2],
    });
  });

  it('throws when playlist API returns error', async () => {
    vi.mocked(http.get).mockResolvedValue({ success: false, error: 'Forbidden' });

    await expect(api.listPlaylists({ teamId: 'bad-team' })).rejects.toThrow('Forbidden');
  });

  it('requests tracking through the file film review endpoint', async () => {
    vi.mocked(http.post).mockResolvedValue({
      success: true,
      data: {
        jobId: 'tracking-job-1',
        status: 'queued',
        capability: 'detection_only',
      },
    });

    const result = await api.requestTracking('review-1', {
      teamId: 'team-1',
      sourceId: 'wide-1',
      scope: 'play',
      mode: 'draft',
      playIds: ['play-1'],
    });

    expect(http.post).toHaveBeenCalledWith('/agent-x/files/review-1/film-review/tracking', {
      teamId: 'team-1',
      sourceId: 'wide-1',
      scope: 'play',
      mode: 'draft',
      playIds: ['play-1'],
    });
    expect(result.status).toBe('queued');
  });

  it('loads tracking status with optional source filtering', async () => {
    vi.mocked(http.get).mockResolvedValue({
      success: true,
      data: {
        status: 'ready',
        capability: 'metric_ready',
        manifest: null,
      },
    });

    const result = await api.getTrackingStatus('review-1', {
      teamId: 'team-1',
      sourceId: 'wide-1',
    });

    expect(http.get).toHaveBeenCalledWith(
      '/agent-x/files/review-1/film-review/tracking?teamId=team-1&sourceId=wide-1'
    );
    expect(result.capability).toBe('metric_ready');
  });

  it('loads a typed tracking window for synchronized overlays', async () => {
    vi.mocked(http.get).mockResolvedValue({
      success: true,
      data: {
        manifest: {
          schemaVersion: 1,
          id: 'manifest-1',
          filmReviewId: 'review-1',
          sourceId: 'wide-1',
          sport: 'football',
          surfaceType: 'field',
          status: 'ready',
          capability: 'tracked_image_space',
          mode: 'draft',
          modelBundle: { id: 'football-alpha', version: '2026.1.0' },
          generatedAt: '2026-09-02T00:00:00.000Z',
          timeRange: { startSec: 0, endSec: 10 },
          chunks: [],
          tracks: [],
        },
        timeRange: { startSec: 4, endSec: 5 },
        frames: [
          {
            frameIndex: 120,
            timestampSec: 4,
            entities: [
              {
                trackId: 'track-7',
                kind: 'player',
                teamSide: 'home',
                bounds: { minX: 0.1, minY: 0.2, maxX: 0.2, maxY: 0.5 },
                confidence: 0.92,
              },
            ],
          },
        ],
      },
    });

    const result = await api.getTrackingWindow('review-1', {
      teamId: 'team-1',
      sourceId: 'wide-1',
      startSec: 4,
      endSec: 5,
    });

    expect(http.get).toHaveBeenCalledWith(
      '/agent-x/files/review-1/film-review/tracking/window?teamId=team-1&sourceId=wide-1&startSec=4&endSec=5'
    );
    expect(result.frames[0]?.entities[0]?.trackId).toBe('track-7');
  });

  it('creates tracking corrections with optimistic revisions', async () => {
    vi.mocked(http.post).mockResolvedValue({
      success: true,
      data: {
        correction: {
          id: 'correction-1',
          trackId: 'track-7',
          field: 'position',
          value: 'WR',
          previousValue: 'TE',
          source: 'coach_confirmed',
          createdBy: 'u1',
          createdAt: '2026-09-02T00:00:00.000Z',
          revision: 2,
        },
        revision: 2,
      },
    });

    const result = await api.createTrackingCorrection('review-1', {
      teamId: 'team-1',
      sourceId: 'wide-1',
      trackId: 'track-7',
      field: 'position',
      value: 'WR',
      expectedRevision: 1,
    });

    expect(http.post).toHaveBeenCalledWith(
      '/agent-x/files/review-1/film-review/tracking/corrections',
      {
        teamId: 'team-1',
        sourceId: 'wide-1',
        trackId: 'track-7',
        field: 'position',
        value: 'WR',
        expectedRevision: 1,
      }
    );
    expect(result.revision).toBe(2);
  });
});
