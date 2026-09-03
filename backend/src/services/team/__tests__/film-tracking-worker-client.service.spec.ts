import { describe, expect, it, vi } from 'vitest';
import {
  FilmTrackingWorkerClient,
  FilmTrackingWorkerClientError,
  FilmTrackingWorkerClientUnavailableError,
} from '../film-tracking-worker-client.service.js';

describe('FilmTrackingWorkerClient', () => {
  it('reports unavailable when no worker URL is configured', async () => {
    const client = new FilmTrackingWorkerClient({ baseUrl: '' });

    await expect(
      client.track({ fileId: 'review-1', sport: 'football', scope: 'play', mode: 'draft' })
    ).rejects.toBeInstanceOf(FilmTrackingWorkerClientUnavailableError);
  });

  it('posts tracking requests to the configured worker', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ready',
        capability: 'tracked_image_space',
        manifestStoragePath: 'film-tracking/review-1/manifest.json',
      }),
    } as Response);
    const client = new FilmTrackingWorkerClient({
      baseUrl: 'https://worker.example.com/',
      fetchImpl,
      timeoutMs: 1000,
    });

    const result = await client.track({
      fileId: 'review-1',
      sourceId: 'wide-1',
      sport: 'football',
      scope: 'play',
      mode: 'draft',
      playIds: ['play-1'],
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example.com/track',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.manifestStoragePath).toBe('film-tracking/review-1/manifest.json');
  });

  it('surfaces worker error details', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'play scope requires at least one playId' }),
    } as Response);
    const client = new FilmTrackingWorkerClient({
      baseUrl: 'https://worker.example.com',
      fetchImpl,
    });

    await expect(
      client.track({ fileId: 'review-1', sport: 'football', scope: 'play', mode: 'draft' })
    ).rejects.toMatchObject<Partial<FilmTrackingWorkerClientError>>({
      message: 'play scope requires at least one playId',
      status: 400,
    });
  });

  it('rejects invalid worker payloads', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'queued' }),
    } as Response);
    const client = new FilmTrackingWorkerClient({
      baseUrl: 'https://worker.example.com',
      fetchImpl,
    });

    await expect(
      client.track({ fileId: 'review-1', sport: 'football', scope: 'timeline', mode: 'draft' })
    ).rejects.toThrow('Film tracking worker returned an invalid payload');
  });
});
