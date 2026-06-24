import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolExecutionContext } from '../../base.tool.js';
import { StageMediaTool } from '../stage-media.tool.js';
import type { StagedMediaResult } from '../media-staging.service.js';

describe('StageMediaTool', () => {
  const stageFromUrl = vi.fn();
  const tool = new StageMediaTool({ stageFromUrl } as never);

  const context: ToolExecutionContext = {
    userId: 'user-123',
    threadId: 'thread-456',
    environment: 'staging',
    emitStage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stages remote media into a short-lived signed URL', async () => {
    const staged: StagedMediaResult = {
      signedUrl: 'https://storage.googleapis.com/test-bucket/signed-url',
      expiresAt: '2026-04-29T15:00:00.000Z',
      storagePath: 'Users/user-123/threads/thread-456/media/staged/video/test.mp4',
      fileName: 'test.mp4',
      sourceUrl: 'https://example.com/test.mp4',
      sourceHost: 'example.com',
      mediaKind: 'video',
      mimeType: 'video/mp4',
      sizeBytes: 1024,
    };
    stageFromUrl.mockResolvedValue(staged);

    const result = await tool.execute(
      {
        sourceUrl: 'https://example.com/test.mp4',
        mediaKind: 'video',
        expiresInMinutes: 30,
      },
      context
    );

    expect(result.success).toBe(true);
    expect(stageFromUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://example.com/test.mp4',
        environment: 'staging',
        staging: { userId: 'user-123', threadId: 'thread-456' },
      })
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        url: staged.signedUrl,
        mediaKind: 'video',
        mimeType: 'video/mp4',
        mediaArtifact: expect.objectContaining({
          analysisReady: true,
          recommendedNextAction: 'analyze_video',
          sourceType: 'staged',
        }),
      })
    );
  });

  it('generates a poster thumbnail for staged videos when FFmpeg is available', async () => {
    const staged: StagedMediaResult = {
      signedUrl: 'https://storage.googleapis.com/test-bucket/signed-url',
      expiresAt: '2026-04-29T15:00:00.000Z',
      storagePath: 'Users/user-123/threads/thread-456/media/staged/video/test.mp4',
      fileName: 'test.mp4',
      sourceUrl: 'https://example.com/test.mp4',
      sourceHost: 'example.com',
      mediaKind: 'video',
      mimeType: 'video/mp4',
      sizeBytes: 1024,
    };
    const thumbnailUrl = 'https://storage.googleapis.com/test-bucket/test-thumbnail.jpg';
    const generateThumbnail = vi.fn().mockResolvedValue({ outputUrl: thumbnailUrl });
    stageFromUrl.mockResolvedValue(staged);
    const localTool = new StageMediaTool({ stageFromUrl } as never, undefined, {
      generateThumbnail,
    } as never);

    const result = await localTool.execute(
      {
        sourceUrl: 'https://example.com/test.mp4',
        mediaKind: 'video',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(generateThumbnail).toHaveBeenCalledWith(
      {
        inputPath: staged.signedUrl,
        outputPath: 'Users/user-123/threads/thread-456/media/staged/video/test-thumbnail.jpg',
        time: '1',
      },
      context
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        url: staged.signedUrl,
        thumbnailUrl,
      })
    );
  });

  it('uses transport-resolved URL before staging', async () => {
    const resolvedUrl = 'https://signed.example.com/fresh.mp4';
    const staged: StagedMediaResult = {
      signedUrl: 'https://storage.googleapis.com/test-bucket/staged-url',
      expiresAt: '2026-04-29T15:00:00.000Z',
      storagePath: 'Users/user-123/threads/thread-456/media/staged/video/test.mp4',
      fileName: 'test.mp4',
      sourceUrl: resolvedUrl,
      sourceHost: 'signed.example.com',
      mediaKind: 'video',
      mimeType: 'video/mp4',
      sizeBytes: 1024,
    };
    stageFromUrl.mockResolvedValue(staged);
    const resolveProcessingUrl = vi.fn().mockResolvedValue({
      url: resolvedUrl,
      source: 'direct',
    });
    const localTool = new StageMediaTool(
      { stageFromUrl } as never,
      { resolveProcessingUrl } as never
    );

    const result = await localTool.execute(
      {
        sourceUrl:
          'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-123/uploads/video.MOV?X-Goog-Signature=stale',
        mediaKind: 'video',
      },
      context
    );

    expect(resolveProcessingUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl:
          'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-123/uploads/video.MOV?X-Goog-Signature=stale',
      })
    );
    expect(stageFromUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: resolvedUrl,
      })
    );
    expect(result.success).toBe(true);
  });

  it('rejects missing thread context', async () => {
    const result = await tool.execute(
      {
        sourceUrl: 'https://example.com/test.mp4',
      },
      { userId: 'user-123' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('threadId');
  });

  it('surfaces staging failures', async () => {
    stageFromUrl.mockRejectedValue(new Error('Media fetch failed with status 403'));

    const result = await tool.execute(
      {
        sourceUrl: 'https://example.com/test.mp4',
      },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('status 403');
  });
});
