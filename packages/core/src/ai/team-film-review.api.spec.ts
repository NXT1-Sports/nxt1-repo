import { describe, expect, it, vi, beforeEach } from 'vitest';
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

  it('lists film reviews', async () => {
    vi.mocked(http.get).mockResolvedValue({
      success: true,
      data: {
        filmReviews: [
          {
            id: 'fr-1',
            teamId: 't1',
            sport: 'basketball',
            title: 'Q4 Review',
            status: 'ready',
            videoUrl: 'https://example.com/video.mp4',
            source: 'manual',
            schemaVersion: 1,
            createdBy: 'u1',
            updatedBy: 'u1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        count: 1,
      },
    });

    const result = await api.listFilmReviews({ teamId: 't1', sport: 'basketball' });

    expect(http.get).toHaveBeenCalledWith('/agent-x/film-reviews?teamId=t1&sport=basketball');
    expect(result).toHaveLength(1);
  });

  it('creates a film review', async () => {
    vi.mocked(http.post).mockResolvedValue({
      success: true,
      data: {
        filmReview: {
          id: 'fr-2',
          teamId: 't1',
          sport: 'football',
          title: 'Week 4 Film',
          status: 'draft',
          videoUrl: 'https://example.com/w4.mp4',
          source: 'manual',
          schemaVersion: 1,
          createdBy: 'u1',
          updatedBy: 'u1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    });

    const created = await api.createFilmReview({
      teamId: 't1',
      sport: 'football',
      title: 'Week 4 Film',
      videoUrl: 'https://example.com/w4.mp4',
    });

    expect(http.post).toHaveBeenCalled();
    expect(created.id).toBe('fr-2');
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

  it('updates a film review timeline', async () => {
    const timeline = [
      {
        id: 'play-1',
        number: 1,
        label: 'Edited label',
        startSec: 12,
        endSec: 20,
        annotation: {
          kind: 'freehand',
          bounds: {
            minX: 0.1,
            minY: 0.2,
            maxX: 0.7,
            maxY: 0.8,
          },
          strokeCount: 1,
          points: [
            { x: 0.1, y: 0.2 },
            { x: 0.7, y: 0.8 },
          ],
          strokes: [
            [
              { x: 0.1, y: 0.2 },
              { x: 0.7, y: 0.8 },
            ],
          ],
        },
        tags: {
          odk: 'O',
          down: 2,
          playType: 'Pass',
        },
      },
    ] as const;

    vi.mocked(http.patch).mockResolvedValue({
      success: true,
      data: {
        filmReview: {
          id: 'fr-2',
          teamId: 't1',
          sport: 'football',
          title: 'Week 4 Film',
          status: 'ready',
          videoUrl: 'https://example.com/w4.mp4',
          timeline,
          source: 'manual',
          schemaVersion: 1,
          createdBy: 'u1',
          updatedBy: 'u1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    });

    const updated = await api.updateFilmReview('fr-2', { timeline });

    expect(http.patch).toHaveBeenCalledWith('/agent-x/film-reviews/fr-2', { timeline });
    expect(updated.timeline).toEqual(timeline);
  });

  it('imports a film review breakdown sheet', async () => {
    const importedReview = {
      id: 'fr-2',
      teamId: 't1',
      sport: 'football',
      title: 'Week 4 Film',
      status: 'ready',
      videoUrl: 'https://example.com/w4.mp4',
      timelineState: 'ready',
      timeline: [
        {
          id: 'hudl-play-1-power',
          number: 1,
          label: 'Power',
          startSec: 12,
          endSec: 20,
          tags: { odk: 'O', down: 1 },
        },
      ],
      source: 'manual',
      schemaVersion: 1,
      createdBy: 'u1',
      updatedBy: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as const;

    vi.mocked(http.post).mockResolvedValue({
      success: true,
      data: {
        filmReview: importedReview,
        playCount: 1,
        rowCount: 1,
        sheetName: 'Hudl Export',
        warnings: [],
      },
    });

    const formData = { file: 'mock-file' };
    const result = await api.importBreakdown('fr-2', formData);

    expect(http.post).toHaveBeenCalledWith('/agent-x/film-reviews/fr-2/breakdown-import', formData);
    expect(result.filmReview.timeline).toEqual(importedReview.timeline);
    expect(result.playCount).toBe(1);
    expect(result.sheetName).toBe('Hudl Export');
  });

  it('throws when API returns error', async () => {
    vi.mocked(http.get).mockResolvedValue({ success: false, error: 'Forbidden' });

    await expect(api.listFilmReviews({ teamId: 'bad-team' })).rejects.toThrow('Forbidden');
  });
});
