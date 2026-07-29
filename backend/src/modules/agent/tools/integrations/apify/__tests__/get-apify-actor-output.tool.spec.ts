import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { GetApifyActorOutputTool } from '../get-apify-actor-output.tool.js';
import type { ToolExecutionContext } from '../../../base.tool.js';

const TEST_CONTEXT = {
  userId: 'user-123',
  threadId: 'thread-456',
} satisfies ToolExecutionContext;

describe('GetApifyActorOutputTool', () => {
  const bridge = {
    getActorOutput: vi.fn(),
  };

  const media = {
    persistBatch: vi.fn(),
  };

  let tool: GetApifyActorOutputTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new GetApifyActorOutputTool(bridge as never, media as never);
  });

  it('returns success with empty arrays when the bridge returns an empty dataset', async () => {
    bridge.getActorOutput.mockResolvedValue([]);
    media.persistBatch.mockResolvedValue([]);

    const result = await tool.execute(
      { datasetId: 'ds-empty', offset: 0, limit: 10 },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(JSON.parse(data['output'] as string)).toEqual([]);
    expect(data['persistedMediaUrls']).toEqual([]);
  });

  it('returns a structured error when the bridge throws (e.g. tool-not-found or API failure)', async () => {
    bridge.getActorOutput.mockRejectedValue(
      new Error('Failed to fetch dataset items for "ds-bad": tool not found')
    );

    const result = await tool.execute({ datasetId: 'ds-bad', offset: 0, limit: 10 }, TEST_CONTEXT);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to fetch dataset items');
    expect(result.error).toContain('ds-bad');
  });

  it('returns an input-validation error for a missing datasetId', async () => {
    const result = await tool.execute({}, TEST_CONTEXT);

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(bridge.getActorOutput).not.toHaveBeenCalled();
  });

  it('normalizes only known media fields in output and preserves source fields', async () => {
    const rawVideoUrl = 'https://cdn.example.com/film.mp4';
    const stagedVideoUrl = 'https://storage.example.com/film.mp4';
    const sourceUrl = 'https://www.instagram.com/p/abc123/';

    bridge.getActorOutput.mockResolvedValue([
      {
        url: sourceUrl,
        sourceUrl,
        videoUrl: rawVideoUrl,
      },
    ]);
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
    ]);

    const result = await tool.execute(
      { datasetId: 'dataset-123', offset: 0, limit: 10 },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    const output = JSON.parse(data['output'] as string) as Array<Record<string, unknown>>;

    expect(output[0]?.['url']).toBe(sourceUrl);
    expect(output[0]?.['sourceUrl']).toBe(sourceUrl);
    expect(output[0]?.['videoUrl']).toBe(stagedVideoUrl);
    expect(data['persistedMediaUrls']).toEqual([stagedVideoUrl]);
    expect(data['mediaUrlMap']).toEqual([
      {
        originalUrl: rawVideoUrl,
        url: stagedVideoUrl,
        type: 'video',
        sourceUrl: null,
      },
    ]);
  });
});
