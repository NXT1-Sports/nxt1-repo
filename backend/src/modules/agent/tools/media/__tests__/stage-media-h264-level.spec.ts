import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StageMediaTool } from '../stage-media.tool.js';
import type { FfmpegMcpBridgeService } from '../../integrations/ffmpeg-mcp/ffmpeg-mcp-bridge.service.js';
import type { ToolExecutionContext } from '../../base.tool.js';

type StageMediaResultData = {
  url?: string;
  mediaKind?: string;
};

describe('StageMediaTool: H.264 Level 4.0 Enforcement', () => {
  let tool: StageMediaTool;
  let mockBridge: Partial<FfmpegMcpBridgeService>;
  let context: ToolExecutionContext;

  beforeEach(() => {
    mockBridge = {
      convertVideo: vi.fn(),
      generateThumbnail: vi.fn(),
    };

    context = {
      userId: 'test-user',
      threadId: 'test-thread',
      environment: 'test',
    };

    tool = new StageMediaTool(undefined as never, undefined as never, mockBridge as never);
  });

  it('should call convertVideo when staging a video', async () => {
    const mockConvertVideo = mockBridge.convertVideo as ReturnType<typeof vi.fn>;
    mockConvertVideo.mockResolvedValue({
      success: true,
      outputUrl: 'https://example.com/normalized.mp4',
      output_path: '/tmp/normalized.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 1024000,
    });

    const result = await tool.execute(
      {
        sourceUrl: 'https://example.com/input.mp4',
        mediaKind: 'video',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(mockConvertVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPath: expect.any(String),
        preset: 'medium',
        crf: 23,
        addSilentAudio: true,
      }),
      context
    );
  });

  it('should fail if FFmpeg normalization is not available', async () => {
    tool = new StageMediaTool(undefined as never, undefined as never);

    const result = await tool.execute(
      {
        sourceUrl: 'https://example.com/input.mp4',
        mediaKind: 'video',
      },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('FFmpeg normalization');
  });

  it('should pass normalized video URL in response', async () => {
    const mockConvertVideo = mockBridge.convertVideo as ReturnType<typeof vi.fn>;
    const normalizedUrl = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/normalized.mp4';

    mockConvertVideo.mockResolvedValue({
      success: true,
      outputUrl: normalizedUrl,
      output_path: '/tmp/normalized.mp4',
      storagePath: 'Users/test-user/threads/test-thread/media/staged/video/normalized.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 1024000,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const result = await tool.execute(
      {
        sourceUrl: 'https://example.com/input.mp4',
        mediaKind: 'video',
      },
      context
    );

    expect(result.success).toBe(true);
    const resultData = result.data as StageMediaResultData;

    expect(resultData.url).toBe(normalizedUrl);
    expect(resultData.mediaKind).toBe('video');
  });
});
