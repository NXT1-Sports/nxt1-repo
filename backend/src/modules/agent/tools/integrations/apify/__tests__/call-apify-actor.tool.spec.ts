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
    media.persistBatch.mockResolvedValue([{ url: 'https://storage.example.com/film.mp4' }]);

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
