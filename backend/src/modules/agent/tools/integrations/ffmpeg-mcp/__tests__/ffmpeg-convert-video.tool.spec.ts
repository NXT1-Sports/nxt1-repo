import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FfmpegConvertVideoTool } from '../ffmpeg-convert-video.tool.js';
import type { ToolExecutionContext } from '../../../base.tool.js';

const TEST_CONTEXT = {
  userId: 'user-1',
  threadId: 'thread-1',
  emitStage: vi.fn(),
} satisfies ToolExecutionContext;

describe('FfmpegConvertVideoTool', () => {
  const bridge = {
    convertVideo: vi.fn(),
    generateThumbnail: vi.fn(),
  };

  let tool: FfmpegConvertVideoTool;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge.generateThumbnail.mockResolvedValue({
      success: true,
      output_path: '/tmp/intro-with-audio-thumbnail.jpg',
    });
    tool = new FfmpegConvertVideoTool(bridge as never);
  });

  it('accepts addSilentAudio string aliases and legacy customFlags', async () => {
    bridge.convertVideo.mockResolvedValue({
      success: true,
      output_path: '/tmp/intro-with-audio.mp4',
    });

    const result = await tool.execute(
      {
        inputPath: 'https://storage.example.com/intro.mp4',
        outputPath: 'intro-with-audio.mp4',
        addSilentAudio: 'true',
        customFlags: '-map 0:v -c:a aac',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['thumbnailUrl']).toBe(
      '/tmp/intro-with-audio-thumbnail.jpg'
    );
    expect(bridge.convertVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPath: 'https://storage.example.com/intro.mp4',
        outputPath: 'intro-with-audio.mp4',
        addSilentAudio: true,
        extraArgs: '-map 0:v -c:a aac',
      }),
      TEST_CONTEXT
    );
    expect(bridge.generateThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPath: '/tmp/intro-with-audio.mp4',
        outputPath: 'intro-with-audio-thumbnail.jpg',
        time: '0',
      }),
      TEST_CONTEXT
    );
  });
});
