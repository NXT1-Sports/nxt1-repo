import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { FirecrawlExtractTool } from '../firecrawl-extract.tool.js';
import type { ToolExecutionContext } from '../../../../base.tool.js';

const TEST_CONTEXT: ToolExecutionContext = {
  userId: 'user-123',
  threadId: 'thread-456',
};

describe('FirecrawlExtractTool — staged media normalization', () => {
  const mockBridge = {
    extract: vi.fn(),
  };

  const mockMedia = {
    persistBatch: vi.fn(),
  };

  let tool: FirecrawlExtractTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new FirecrawlExtractTool(mockBridge as never, mockMedia as never);
  });

  it('normalizes only known media fields and preserves source/page URLs', async () => {
    const pageUrl = 'https://gophersports.com/roster';
    const rawVideoUrl = 'https://cdn.example.com/highlight.mp4';
    const rawImageUrl = 'https://cdn.example.com/photo.jpg';
    const stagedVideoUrl = 'https://storage.example.com/highlight.mp4';
    const stagedImageUrl = 'https://storage.example.com/photo.jpg';

    mockBridge.extract.mockResolvedValue({
      url: pageUrl,
      sourceUrl: pageUrl,
      videoUrl: rawVideoUrl,
      nested: {
        imageUrls: [rawImageUrl],
      },
    });
    mockMedia.persistBatch.mockResolvedValue([
      {
        url: stagedVideoUrl,
        storagePath: 'Users/user-123/threads/thread-456/media/highlight.mp4',
        mimeType: 'video/mp4',
        type: 'video',
        platform: 'web',
        originalUrl: rawVideoUrl,
        sourceUrl: rawVideoUrl,
        sizeBytes: 100,
      },
      {
        url: stagedImageUrl,
        storagePath: 'Users/user-123/threads/thread-456/media/photo.jpg',
        mimeType: 'image/jpeg',
        type: 'image',
        platform: 'web',
        originalUrl: rawImageUrl,
        sourceUrl: rawImageUrl,
        sizeBytes: 50,
      },
    ]);

    const result = await tool.execute(
      {
        urls: [pageUrl],
        prompt: 'extract the media fields',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    const extraction = JSON.parse(data['extraction'] as string) as Record<string, unknown>;

    expect(extraction['url']).toBe(pageUrl);
    expect(extraction['sourceUrl']).toBe(pageUrl);
    expect(extraction['videoUrl']).toBe(stagedVideoUrl);
    expect((extraction['nested'] as Record<string, unknown>)['imageUrls']).toEqual([
      stagedImageUrl,
    ]);
    expect(data['persistedMediaUrls']).toEqual([stagedVideoUrl, stagedImageUrl]);
    expect(data['mediaUrlMap']).toEqual([
      {
        originalUrl: rawVideoUrl,
        url: stagedVideoUrl,
        type: 'video',
        sourceUrl: rawVideoUrl,
      },
      {
        originalUrl: rawImageUrl,
        url: stagedImageUrl,
        type: 'image',
        sourceUrl: rawImageUrl,
      },
    ]);
  });
});
