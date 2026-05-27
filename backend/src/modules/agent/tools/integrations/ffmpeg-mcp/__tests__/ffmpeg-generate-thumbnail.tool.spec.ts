import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FfmpegGenerateThumbnailTool } from '../ffmpeg-generate-thumbnail.tool.js';
import type { ToolExecutionContext } from '../../../base.tool.js';

const TEST_CONTEXT = {
  userId: 'user-1',
  threadId: 'thread-1',
  emitStage: vi.fn(),
} satisfies ToolExecutionContext;

describe('FfmpegGenerateThumbnailTool', () => {
  const bridge = {
    generateThumbnail: vi.fn(),
  };

  let tool: FfmpegGenerateThumbnailTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new FfmpegGenerateThumbnailTool(bridge as never);
  });

  it('returns stable thumbnail artifact fields', async () => {
    bridge.generateThumbnail.mockResolvedValue({
      success: true,
      output_path: '/tmp/thumb.jpg',
    });

    const result = await tool.execute(
      {
        inputPath: '/tmp/input.mp4',
        time: 8,
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['outputUrl']).toBe('/tmp/thumb.jpg');
    expect((result.data as Record<string, unknown>)['imageUrl']).toBe('/tmp/thumb.jpg');
    expect((result.data as Record<string, unknown>)['thumbnailUrl']).toBe('/tmp/thumb.jpg');
  });

  it('accepts normalized crop bounds for selected-area thumbnails', async () => {
    bridge.generateThumbnail.mockResolvedValue({
      success: true,
      output_path: '/tmp/thumb.jpg',
    });

    const result = await tool.execute(
      {
        inputPath: '/tmp/input.mp4',
        time: 8,
        cropBounds: {
          minX: 0.25,
          minY: 0.3,
          maxX: 0.55,
          maxY: 0.72,
        },
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(bridge.generateThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPath: '/tmp/input.mp4',
        time: '8',
        cropBounds: {
          minX: 0.25,
          minY: 0.3,
          maxX: 0.55,
          maxY: 0.72,
        },
      }),
      TEST_CONTEXT
    );
    expect((result.data as Record<string, unknown>)['imageUrl']).toBe('/tmp/thumb.jpg');
  });

  it('returns a sanitized playback validation error instead of raw ffmpeg logs', async () => {
    bridge.generateThumbnail.mockRejectedValue(
      new Error('ffmpeg version 7.1.3\n[mov] moov atom not found\nInvalid data found')
    );

    const result = await tool.execute(
      {
        inputPath: '/tmp/bad-output.mp4',
        time: 2,
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('source video is not readable');
    expect(result.error).not.toContain('ffmpeg version');
    expect(result.error).not.toContain('moov atom');
  });
});
