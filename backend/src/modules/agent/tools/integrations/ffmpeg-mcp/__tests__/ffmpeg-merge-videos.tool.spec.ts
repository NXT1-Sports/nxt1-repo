import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FfmpegMergeVideosTool } from '../ffmpeg-merge-videos.tool.js';
import type { ToolExecutionContext } from '../../../base.tool.js';

const TEST_CONTEXT = {
  userId: 'user-1',
  threadId: 'thread-1',
  emitStage: vi.fn(),
} satisfies ToolExecutionContext;

describe('FfmpegMergeVideosTool', () => {
  const bridge = {
    mergeVideos: vi.fn(),
  };

  let tool: FfmpegMergeVideosTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new FfmpegMergeVideosTool(bridge as never);
  });

  it('accepts legacy inputUrls and outputFormat aliases', async () => {
    bridge.mergeVideos.mockResolvedValue({
      success: true,
      output_path: '/tmp/merged.webm',
    });

    const result = await tool.execute(
      {
        inputUrls: ['/tmp/intro.mp4', '/tmp/highlight.mp4'],
        outputFormat: 'webm',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['videoUrl']).toBe('/tmp/merged.webm');
    expect(bridge.mergeVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPaths: ['/tmp/intro.mp4', '/tmp/highlight.mp4'],
        outputPath: 'merged.webm',
      }),
      TEST_CONTEXT
    );
  });

  it('accepts inputPaths as a JSON-array string', async () => {
    bridge.mergeVideos.mockResolvedValue({
      success: true,
      output_path: '/tmp/merged.mp4',
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
      output_path: '/tmp/merged.mp4',
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
