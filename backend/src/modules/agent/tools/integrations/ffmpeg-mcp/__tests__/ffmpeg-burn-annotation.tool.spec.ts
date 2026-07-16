import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FfmpegBurnAnnotationTool } from '../ffmpeg-burn-annotation.tool.js';
import type { ToolExecutionContext } from '../../../base.tool.js';

const TEST_CONTEXT = {
  userId: 'user-1',
  threadId: 'thread-1',
  emitStage: vi.fn(),
} satisfies ToolExecutionContext;

describe('FfmpegBurnAnnotationTool', () => {
  const bridge = {
    burnAnnotation: vi.fn(),
  };

  let tool: FfmpegBurnAnnotationTool;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['FFMPEG_MAX_ANNOTATION_BURN_DURATION_SECONDS'];
    tool = new FfmpegBurnAnnotationTool(bridge as never);
  });

  it('burns a selected-context annotation into a video clip', async () => {
    bridge.burnAnnotation.mockResolvedValue({
      success: true,
      output_path: '/tmp/annotated-clip.mp4',
    });

    const result = await tool.execute(
      {
        inputPath: '/tmp/input.mp4',
        annotation: {
          kind: 'circle',
          bounds: {
            minX: 0.31,
            minY: 0.48,
            maxX: 0.42,
            maxY: 0.61,
          },
        },
        startTime: 0,
        endTime: 8,
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(bridge.burnAnnotation).toHaveBeenCalledTimes(1);
    expect(TEST_CONTEXT.emitStage).toHaveBeenCalledWith('processing_media', {
      icon: 'media',
      phase: 'ffmpeg_burn_annotation',
    });
  });

  it('rejects invalid annotation timing windows before calling FFmpeg', async () => {
    const result = await tool.execute(
      {
        inputPath: '/tmp/input.mp4',
        annotation: {
          kind: 'freehand',
          bounds: {
            minX: 0.1,
            minY: 0.2,
            maxX: 0.4,
            maxY: 0.7,
          },
          points: [
            { x: 0.1, y: 0.2 },
            { x: 0.2, y: 0.3 },
          ],
        },
        startTime: 10,
        endTime: 5,
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('endTime must be greater than startTime');
    expect(bridge.burnAnnotation).not.toHaveBeenCalled();
  });
});
