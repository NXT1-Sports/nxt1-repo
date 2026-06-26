import { beforeEach, describe, expect, it, vi } from 'vitest';

const stageFromUrl = vi.hoisted(() => vi.fn());

vi.mock('../../../media/media-staging.service.js', () => ({
  MediaStagingService: class {
    stageFromUrl = stageFromUrl;
  },
}));

import { RunwayCheckTaskTool } from '../runway-check-task.tool.js';
import type { ToolExecutionContext } from '../../../base.tool.js';

const TEST_CONTEXT = {
  userId: 'user-123',
  threadId: 'thread-456',
  environment: 'staging',
  emitStage: vi.fn(),
} satisfies ToolExecutionContext;

describe('RunwayCheckTaskTool', () => {
  const bridge = {
    getTask: vi.fn(),
  };
  const ffmpegBridge = {
    convertVideo: vi.fn(),
    generateThumbnail: vi.fn(),
  };

  let tool: RunwayCheckTaskTool;

  beforeEach(() => {
    vi.clearAllMocks();
    ffmpegBridge.convertVideo.mockResolvedValue({
      success: true,
      outputUrl: 'https://signed.example/runway-output.mp4',
      storagePath: 'Users/user-123/threads/thread-456/media/staged/video/runway-task-1.mp4',
    });
    ffmpegBridge.generateThumbnail.mockResolvedValue({
      success: true,
      output_path: 'runway-output-thumbnail.jpg',
    });
    tool = new RunwayCheckTaskTool(bridge as never, ffmpegBridge as never);
  });

  it('normalizes succeeded Runway output with FFmpeg before returning the uploaded URL', async () => {
    bridge.getTask.mockResolvedValue({
      status: 'SUCCEEDED',
      progress: 1,
      output: ['https://runway.example/output.mp4'],
    });

    const result = await tool.execute({ taskId: 'task-1' }, TEST_CONTEXT);

    expect(result.success).toBe(true);
    expect(stageFromUrl).not.toHaveBeenCalled();
    expect(ffmpegBridge.convertVideo).toHaveBeenCalledWith(
      {
        inputPath: 'https://runway.example/output.mp4',
        outputPath: 'runway-task-1.mp4',
        preset: 'medium',
        crf: 23,
        addSilentAudio: true,
      },
      TEST_CONTEXT
    );
    expect(result.data).toMatchObject({
      outputUrl: 'https://signed.example/runway-output.mp4',
      storagePath: 'Users/user-123/threads/thread-456/media/staged/video/runway-task-1.mp4',
      ephemeralUrl: 'https://runway.example/output.mp4',
      persisted: true,
    });
    expect(ffmpegBridge.generateThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPath: 'https://signed.example/runway-output.mp4',
        outputPath: 'runway-task-1-thumbnail.jpg',
        time: '0',
      }),
      TEST_CONTEXT
    );
  });

  it('fails closed when Runway output normalization fails', async () => {
    bridge.getTask.mockResolvedValue({
      status: 'SUCCEEDED',
      progress: 1,
      output: [{ url: 'https://runway.example/transient.mp4' }],
    });
    ffmpegBridge.convertVideo.mockRejectedValue(new Error('normalization failed'));

    const result = await tool.execute({ taskId: 'task-2' }, TEST_CONTEXT);

    expect(result.success).toBe(false);
    expect(result.error).toBe('normalization failed');
    expect(stageFromUrl).not.toHaveBeenCalled();
  });

  it('fails closed instead of staging raw Runway video when FFmpeg is unavailable', async () => {
    const localTool = new RunwayCheckTaskTool(bridge as never);
    bridge.getTask.mockResolvedValue({
      status: 'SUCCEEDED',
      progress: 1,
      output: ['https://runway.example/raw-level-62.mp4'],
    });

    const result = await localTool.execute({ taskId: 'task-no-ffmpeg' }, TEST_CONTEXT);

    expect(result.success).toBe(false);
    expect(result.error).toContain('FFmpeg normalization');
    expect(stageFromUrl).not.toHaveBeenCalled();
  });
});
