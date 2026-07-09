import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../../../utils/logger.js', () => ({
  logger: loggerMock,
}));

import type { ToolExecutionContext } from '../../base.tool.js';
import { StageMediaTool } from '../stage-media.tool.js';
import type { StagedMediaResult } from '../media-staging.service.js';

const VALID_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QP//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QP//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QP//Z',
  'base64'
);

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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stages remote non-video media into a short-lived signed URL', async () => {
    const staged: StagedMediaResult = {
      signedUrl: 'https://storage.googleapis.com/test-bucket/signed-url',
      expiresAt: '2026-04-29T15:00:00.000Z',
      storagePath: 'Users/user-123/threads/thread-456/media/staged/image/test.jpg',
      fileName: 'test.jpg',
      sourceUrl: 'https://example.com/test.jpg',
      sourceHost: 'example.com',
      mediaKind: 'image',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    };
    stageFromUrl.mockResolvedValue(staged);

    const result = await tool.execute(
      {
        sourceUrl: 'https://example.com/test.jpg',
        mediaKind: 'image',
        expiresInMinutes: 30,
      },
      context
    );

    expect(result.success).toBe(true);
    expect(stageFromUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://example.com/test.jpg',
        environment: 'staging',
        staging: { userId: 'user-123', threadId: 'thread-456' },
      })
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        url: staged.signedUrl,
        mediaKind: 'image',
        mimeType: 'image/jpeg',
        mediaArtifact: expect.objectContaining({
          analysisReady: true,
          recommendedNextAction: 'review_media',
          sourceType: 'staged',
        }),
      })
    );
  });

  it('rejects video staging when FFmpeg conversion is unavailable', async () => {
    const generateThumbnail = vi.fn();
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

    expect(result.success).toBe(false);
    expect(result.error).toContain('FFmpeg normalization');
    expect(stageFromUrl).not.toHaveBeenCalled();
    expect(generateThumbnail).not.toHaveBeenCalled();
  });

  it('normalizes video through FFmpeg before returning a staged video URL', async () => {
    const convertVideo = vi.fn().mockResolvedValue({
      success: true,
      outputUrl: 'https://firebasestorage.googleapis.com/v0/b/test/o/normalized.mp4?alt=media',
      storagePath: 'Users/user-123/threads/thread-456/media/staged/video/normalized.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 2048,
      expiresAt: '2026-04-29T15:00:00.000Z',
    });
    const generateThumbnail = vi.fn().mockResolvedValue({
      outputUrl: 'https://storage.googleapis.com/test-bucket/normalized-thumbnail.jpg',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(VALID_JPEG, {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        })
      )
    );
    const localTool = new StageMediaTool({ stageFromUrl } as never, undefined, {
      convertVideo,
      generateThumbnail,
    } as never);

    const result = await localTool.execute(
      {
        sourceUrl: 'https://example.com/raw-level-62.mp4',
        mediaKind: 'video',
        fileName: 'raw-level-62.mp4',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(stageFromUrl).not.toHaveBeenCalled();
    expect(convertVideo).toHaveBeenCalledWith(
      {
        inputPath: 'https://example.com/raw-level-62.mp4',
        outputPath: 'raw-level-62.mp4',
        preset: 'medium',
        crf: 23,
        addSilentAudio: true,
      },
      context
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        url: 'https://firebasestorage.googleapis.com/v0/b/test/o/normalized.mp4?alt=media',
        storagePath: 'Users/user-123/threads/thread-456/media/staged/video/normalized.mp4',
        mediaKind: 'video',
        mimeType: 'video/mp4',
        sizeBytes: 2048,
        thumbnailUrl: 'https://storage.googleapis.com/test-bucket/normalized-thumbnail.jpg',
      })
    );
  });

  it('uses transport-resolved URL before staging', async () => {
    const resolvedUrl = 'https://signed.example.com/fresh.jpg';
    const staged: StagedMediaResult = {
      signedUrl: 'https://storage.googleapis.com/test-bucket/staged-url',
      expiresAt: '2026-04-29T15:00:00.000Z',
      storagePath: 'Users/user-123/threads/thread-456/media/staged/image/test.jpg',
      fileName: 'test.jpg',
      sourceUrl: resolvedUrl,
      sourceHost: 'signed.example.com',
      mediaKind: 'image',
      mimeType: 'image/jpeg',
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
          'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-123/uploads/image.jpg?X-Goog-Signature=stale',
        mediaKind: 'image',
      },
      context
    );

    expect(resolveProcessingUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl:
          'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-123/uploads/image.jpg?X-Goog-Signature=stale',
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
        sourceUrl: 'https://example.com/test.jpg',
      },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('status 403');
  });

  describe('input validation (Parse Error reproduction)', () => {
    it('returns a descriptive zodError when sourceUrl is missing', async () => {
      const result = await tool.execute({}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('sourceUrl');
    });

    it('returns a descriptive zodError when sourceUrl is not a valid URL', async () => {
      const result = await tool.execute({ sourceUrl: 'not-a-url' }, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('sourceUrl');
      expect(stageFromUrl).not.toHaveBeenCalled();
    });

    it('logs field paths and context when input validation fails', async () => {
      const ctxWithOp: ToolExecutionContext = {
        ...context,
        operationId: 'op-chat-e2be0b86-7f2c-4dd2-a584-6af47faffd3a',
      };

      await tool.execute({ sourceUrl: 'not-a-url' }, ctxWithOp);

      expect(loggerMock.warn).toHaveBeenCalledWith(
        '[StageMediaTool] Input validation failed',
        expect.objectContaining({
          userId: ctxWithOp.userId,
          threadId: ctxWithOp.threadId,
          operationId: ctxWithOp.operationId,
          invalidFields: expect.arrayContaining(['sourceUrl']),
        })
      );
    });

    it('returns a descriptive zodError when artifact has invalid fields', async () => {
      const result = await tool.execute(
        {
          sourceUrl: 'https://example.com/test.jpg',
          artifact: { mediaKind: 'invalid_kind' },
        },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('artifact');
      expect(stageFromUrl).not.toHaveBeenCalled();
    });

    it('wraps a GCS Parse Error with an actionable retry message', async () => {
      stageFromUrl.mockRejectedValue(new Error('Parse Error'));

      const ctxWithOp: ToolExecutionContext = {
        ...context,
        operationId: 'op-chat-e2be0b86-7f2c-4dd2-a584-6af47faffd3a',
      };

      const result = await tool.execute({ sourceUrl: 'https://example.com/test.jpg' }, ctxWithOp);

      expect(result.success).toBe(false);
      expect(result.error).toContain('transient storage error');
      expect(result.error).toContain('retry');
    });

    it('logs operationId and threadId when a staging error occurs', async () => {
      stageFromUrl.mockRejectedValue(new Error('Parse Error'));

      const ctxWithOp: ToolExecutionContext = {
        ...context,
        operationId: 'op-chat-e2be0b86-7f2c-4dd2-a584-6af47faffd3a',
      };

      await tool.execute({ sourceUrl: 'https://example.com/test.jpg' }, ctxWithOp);

      expect(loggerMock.error).toHaveBeenCalledWith(
        '[StageMediaTool] stage_media failed',
        expect.objectContaining({
          userId: ctxWithOp.userId,
          threadId: ctxWithOp.threadId,
          operationId: ctxWithOp.operationId,
        })
      );
    });
  });
});
