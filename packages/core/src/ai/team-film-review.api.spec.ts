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

  it('throws when playlist API returns error', async () => {
    vi.mocked(http.get).mockResolvedValue({ success: false, error: 'Forbidden' });

    await expect(api.listPlaylists({ teamId: 'bad-team' })).rejects.toThrow('Forbidden');
  });
});
