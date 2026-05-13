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
});
