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
