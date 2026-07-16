import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { CallApifyActorTool } from '../call-apify-actor.tool.js';
import type { ToolExecutionContext } from '../../../base.tool.js';

const TEST_CONTEXT = {
  userId: 'user-123',
  threadId: 'thread-456',
} satisfies ToolExecutionContext;

describe('CallApifyActorTool', () => {
  const bridge = {
    callActor: vi.fn(),
  };

  const media = {
    persistBatch: vi.fn(),
  };

  let tool: CallApifyActorTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new CallApifyActorTool(bridge as never, media as never);
  });

  it('persists media by default', async () => {
    bridge.callActor.mockResolvedValue({
      videoUrl: 'https://cdn.example.com/film.mp4',
    });
    media.persistBatch.mockResolvedValue([
      {
        url: 'https://storage.example.com/film.mp4',
        storagePath: 'Users/user-123/threads/thread-456/media/film.mp4',
        mimeType: 'video/mp4',
        type: 'video',
        platform: 'web',
        originalUrl: 'https://cdn.example.com/film.mp4',
        sizeBytes: 100,
      },
    ]);

    const result = await tool.execute(
      {
        actorId: 'demo/video-downloader',
        input: {},
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(bridge.callActor).toHaveBeenCalledWith(
      'demo/video-downloader',
      expect.any(Object),
      undefined
    );
    expect(media.persistBatch).toHaveBeenCalledTimes(1);
    expect((result.data as Record<string, unknown>)['persistedMediaUrls']).toEqual([
      'https://storage.example.com/film.mp4',
    ]);
    expect((result.data as Record<string, unknown>)['mediaPersistenceSkipped']).toBe(false);
  });

  it('normalizes only known media fields in output and preserves source fields', async () => {
    const rawVideoUrl = 'https://cdn.example.com/film.mp4';
    const stagedVideoUrl = 'https://storage.example.com/film.mp4';
    const sourceUrl = 'https://x.com/athlete/status/123';

    bridge.callActor.mockResolvedValue({
      url: sourceUrl,
      sourceUrl,
      videoUrl: rawVideoUrl,
      nested: {
        imageUrls: ['https://cdn.example.com/photo.jpg'],
      },
    });
    media.persistBatch.mockResolvedValue([
      {
        url: stagedVideoUrl,
        storagePath: 'Users/user-123/threads/thread-456/media/film.mp4',
        mimeType: 'video/mp4',
        type: 'video',
        platform: 'web',
        originalUrl: rawVideoUrl,
        sizeBytes: 100,
      },
      {
        url: 'https://storage.example.com/photo.jpg',
        storagePath: 'Users/user-123/threads/thread-456/media/photo.jpg',
        mimeType: 'image/jpeg',
        type: 'image',
        platform: 'web',
        originalUrl: 'https://cdn.example.com/photo.jpg',
        sizeBytes: 50,
      },
    ]);

    const result = await tool.execute(
      {
        actorId: 'demo/video-downloader',
        input: {},
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    const output = JSON.parse(data['output'] as string) as Record<string, unknown>;

    expect(output['url']).toBe(sourceUrl);
    expect(output['sourceUrl']).toBe(sourceUrl);
    expect(output['videoUrl']).toBe(stagedVideoUrl);
    expect((output['nested'] as Record<string, unknown>)['imageUrls']).toEqual([
      'https://storage.example.com/photo.jpg',
    ]);
    expect(data['mediaUrlMap']).toEqual([
      {
        originalUrl: rawVideoUrl,
        url: stagedVideoUrl,
        type: 'video',
        sourceUrl: null,
      },
      {
        originalUrl: 'https://cdn.example.com/photo.jpg',
        url: 'https://storage.example.com/photo.jpg',
        type: 'image',
        sourceUrl: null,
      },
    ]);
  });

  it('skips media persistence when explicitly requested', async () => {
    bridge.callActor.mockResolvedValue({
      videoUrl: 'https://cdn.example.com/film.mp4',
    });

    const result = await tool.execute(
      {
        actorId: 'demo/video-downloader',
        input: {},
        skipMediaPersistence: true,
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(media.persistBatch).not.toHaveBeenCalled();
    expect((result.data as Record<string, unknown>)['persistedMediaUrls']).toEqual([]);
    expect((result.data as Record<string, unknown>)['mediaPersistenceSkipped']).toBe(true);
    expect((result.data as Record<string, unknown>)['note']).toBe(
      'Media persistence was skipped for this actor run.'
    );
  });
});
