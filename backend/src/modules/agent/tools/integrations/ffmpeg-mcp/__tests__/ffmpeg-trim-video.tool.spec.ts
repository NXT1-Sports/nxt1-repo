import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FfmpegTrimVideoTool } from '../ffmpeg-trim-video.tool.js';
import type { ToolExecutionContext } from '../../../base.tool.js';

const TEST_CONTEXT = {
  userId: 'user-1',
  threadId: 'thread-1',
  emitStage: vi.fn(),
} satisfies ToolExecutionContext;

describe('FfmpegTrimVideoTool', () => {
  const bridge = {
    trimVideo: vi.fn(),
  };

  let tool: FfmpegTrimVideoTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new FfmpegTrimVideoTool(bridge as never);
  });

  it('returns success payload when bridge succeeds', async () => {
    bridge.trimVideo.mockResolvedValue({
      success: true,
      output_path: '/tmp/output.mp4',
    });

    const result = await tool.execute(
      {
        inputPath: '/tmp/input.mp4',
        outputPath: '/tmp/output.mp4',
        startTime: '00:00:05',
        duration: '10',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(bridge.trimVideo).toHaveBeenCalledTimes(1);
    expect((result.data as Record<string, unknown>)['outputUrl']).toBe('/tmp/output.mp4');
  });

  it('accepts legacy inputUrl alias and numeric time inputs', async () => {
    bridge.trimVideo.mockResolvedValue({
      success: true,
      output_path: '/tmp/trimmed.mp4',
    });

    const result = await tool.execute(
      {
        inputUrl: '/tmp/input.mp4',
        startTime: 5,
        duration: 10,
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(bridge.trimVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPath: '/tmp/input.mp4',
        startTime: '5',
        duration: '10',
      }),
      TEST_CONTEXT
    );
  });

  it('prefers endTime when endTime and duration are both provided', async () => {
    bridge.trimVideo.mockResolvedValue({
      success: true,
      output_path: '/tmp/output.mp4',
    });

    const result = await tool.execute(
      {
        inputPath: '/tmp/input.mp4',
        outputPath: '/tmp/output.mp4',
        startTime: '00:00:05',
        endTime: '00:00:20',
        duration: '10',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(bridge.trimVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPath: '/tmp/input.mp4',
        outputPath: '/tmp/output.mp4',
        startTime: '00:00:05',
        endTime: '00:00:20',
      }),
      TEST_CONTEXT
    );
    expect(bridge.trimVideo.mock.calls[0]?.[0]).not.toHaveProperty('duration');
  });

  it('clamps tiny explicit durations to a playable minimum', async () => {
    bridge.trimVideo.mockResolvedValue({
      success: true,
      output_path: '/tmp/output.mp4',
    });

    const result = await tool.execute(
      {
        inputPath: '/tmp/input.mp4',
        outputPath: '/tmp/output.mp4',
        startTime: '00:00:05',
        duration: '0.04',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(bridge.trimVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPath: '/tmp/input.mp4',
        outputPath: '/tmp/output.mp4',
        startTime: '00:00:05',
        duration: '0.5',
      }),
      TEST_CONTEXT
    );
  });

  it('passes through full-source preservation windows for short clips', async () => {
    bridge.trimVideo.mockResolvedValue({
      success: true,
      output_path: '/tmp/preserved.mp4',
    });

    const result = await tool.execute(
      {
        inputPath: '/tmp/short-clip.mp4',
        startTime: '0',
        endTime: '24.5',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(bridge.trimVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPath: '/tmp/short-clip.mp4',
        startTime: '0',
        endTime: '24.5',
      }),
      TEST_CONTEXT
    );
  });
});
