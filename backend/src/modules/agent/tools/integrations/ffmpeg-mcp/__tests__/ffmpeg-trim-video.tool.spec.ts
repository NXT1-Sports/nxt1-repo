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
    expect((result.data as Record<string, unknown>)['outputPath']).toBe('/tmp/output.mp4');
  });

  it('fails validation when endTime and duration are both provided', async () => {
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

    expect(result.success).toBe(false);
    expect(result.error).toContain('Provide endTime or duration, not both.');
    expect(bridge.trimVideo).not.toHaveBeenCalled();
  });
});
