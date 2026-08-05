import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FfmpegMergeVideosTool } from '../ffmpeg-merge-videos.tool.js';
import type { ToolExecutionContext } from '../../../base.tool.js';

const TEST_CONTEXT = {
  userId: 'user-1',
  threadId: 'thread-1',
  emitStage: vi.fn(),
} satisfies ToolExecutionContext;

const VALID_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QP//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QP//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QP//Z',
  'base64'
);

describe('FfmpegMergeVideosTool', () => {
  const bridge = {
    mergeVideos: vi.fn(),
    generateThumbnail: vi.fn(),
  };

  let tool: FfmpegMergeVideosTool;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(VALID_JPEG, {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        })
      )
    );
    bridge.generateThumbnail.mockResolvedValue({
      success: true,
      outputUrl: 'https://cdn.example.com/merged-thumbnail.jpg',
    });
    tool = new FfmpegMergeVideosTool(bridge as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts legacy inputUrls and outputFormat aliases', async () => {
    bridge.mergeVideos.mockResolvedValue({
      success: true,
      outputUrl: 'https://cdn.example.com/merged.webm',
    });

    const result = await tool.execute(
      {
        inputUrls: ['/tmp/intro.mp4', '/tmp/highlight.mp4'],
        outputFormat: 'webm',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['videoUrl']).toBe(
      'https://cdn.example.com/merged.webm'
    );
    expect((result.data as Record<string, unknown>)['thumbnailUrl']).toBe(
      'https://cdn.example.com/merged-thumbnail.jpg'
    );
    expect(bridge.mergeVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPaths: ['/tmp/intro.mp4', '/tmp/highlight.mp4'],
        outputPath: 'merged.webm',
      }),
      TEST_CONTEXT
    );
    expect(bridge.generateThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPath: 'https://cdn.example.com/merged.webm',
        outputPath: 'merged-thumbnail.jpg',
        time: '1',
      }),
      TEST_CONTEXT
    );
  });

  it('accepts inputPaths as a JSON-array string', async () => {
    bridge.mergeVideos.mockResolvedValue({
      success: true,
      outputUrl: 'https://cdn.example.com/merged.mp4',
    });

    const result = await tool.execute(
      {
        inputPaths: '["/tmp/intro.mp4", "/tmp/highlight.mp4"]',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(bridge.mergeVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPaths: ['/tmp/intro.mp4', '/tmp/highlight.mp4'],
      }),
      TEST_CONTEXT
    );
  });

  it('accepts max_intro_seconds aliases for branded intro clamps', async () => {
    bridge.mergeVideos.mockResolvedValue({
      success: true,
      outputUrl: 'https://cdn.example.com/merged.mp4',
    });

    const result = await tool.execute(
      {
        inputPaths: ['/tmp/runway-intro.mp4', '/tmp/highlight.mp4'],
        max_intro_seconds: '4',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(bridge.mergeVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        maxIntroSeconds: 4,
      }),
      TEST_CONTEXT
    );
  });

  it('uses an explicit branded poster while still generating a validation thumbnail', async () => {
    bridge.mergeVideos.mockResolvedValue({
      success: true,
      outputUrl: 'https://cdn.example.com/merged.mp4',
    });

    const result = await tool.execute(
      {
        inputPaths: ['/tmp/runway-intro.mp4', '/tmp/highlight.mp4'],
        posterUrl: 'https://cdn.example.com/gunslinger-title-card.png',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(bridge.mergeVideos).toHaveBeenCalledWith(
      expect.not.objectContaining({ posterUrl: expect.any(String) }),
      TEST_CONTEXT
    );
    expect((result.data as Record<string, unknown>)['thumbnailUrl']).toBe(
      'https://cdn.example.com/gunslinger-title-card.png'
    );
    expect((result.data as Record<string, unknown>)['posterUrl']).toBe(
      'https://cdn.example.com/gunslinger-title-card.png'
    );
    expect((result.data as Record<string, unknown>)['validationThumbnailUrl']).toBe(
      'https://cdn.example.com/merged-thumbnail.jpg'
    );
  });

  it('forces concat_filter for professional reels even when concat_demuxer is requested', async () => {
    bridge.mergeVideos.mockResolvedValue({
      success: true,
      outputUrl: 'https://cdn.example.com/merged.mp4',
    });

    const result = await tool.execute(
      {
        inputPaths: ['/tmp/runway-intro.mp4', '/tmp/highlight.mp4'],
        method: 'concat_demuxer',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(bridge.mergeVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'concat_filter',
      }),
      TEST_CONTEXT
    );
  });

  it('requires a generated thumbnail before reporting the merged video as ready', async () => {
    bridge.mergeVideos.mockResolvedValue({
      success: true,
      outputUrl: 'https://cdn.example.com/merged.mp4',
    });
    bridge.generateThumbnail.mockRejectedValue(new Error('Failed to read frame at 0s'));

    const result = await tool.execute(
      {
        inputPaths: ['/tmp/runway-intro.mp4', '/tmp/highlight.mp4'],
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('thumbnail validation failed');
  });

  it('rejects a merged video when the thumbnail URL is not a readable image', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('not an image', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    );
    bridge.mergeVideos.mockResolvedValue({
      success: true,
      outputUrl: 'https://cdn.example.com/merged.mp4',
    });

    const result = await tool.execute(
      {
        inputPaths: ['/tmp/runway-intro.mp4', '/tmp/highlight.mp4'],
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('thumbnail validation failed');
  });

  it('returns a sanitized actionable merge error instead of raw ffmpeg logs', async () => {
    bridge.mergeVideos.mockRejectedValue(
      new Error('Stream specifier :a:0 matches no streams. ffmpeg version 7.1.3')
    );

    const result = await tool.execute(
      {
        inputPaths: ['/tmp/runway-intro.mp4', '/tmp/highlight.mp4'],
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Audio-less clips are supported');
    expect(result.error).not.toContain('ffmpeg version');
    expect(result.error).not.toContain('matches no streams');
  });

  it('returns an actionable error when only one merge input is provided', async () => {
    const result = await tool.execute(
      {
        inputPaths: '/tmp/only-one.mp4',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('requires at least 2 inputPaths');
    expect(bridge.mergeVideos).not.toHaveBeenCalled();
  });
});
