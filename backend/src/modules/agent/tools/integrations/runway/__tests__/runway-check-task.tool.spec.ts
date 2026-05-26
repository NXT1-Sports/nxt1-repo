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

  let tool: RunwayCheckTaskTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new RunwayCheckTaskTool(bridge as never);
  });

  it('stages succeeded Runway output with the execution environment', async () => {
    bridge.getTask.mockResolvedValue({
      status: 'SUCCEEDED',
      progress: 1,
      output: ['https://runway.example/output.mp4'],
    });
    stageFromUrl.mockResolvedValue({
      signedUrl: 'https://signed.example/runway-output.mp4',
      storagePath: 'Users/user-123/threads/thread-456/media/staged/video/runway-task-1.mp4',
    });

    const result = await tool.execute({ taskId: 'task-1' }, TEST_CONTEXT);

    expect(result.success).toBe(true);
    expect(stageFromUrl).toHaveBeenCalledWith({
      sourceUrl: 'https://runway.example/output.mp4',
      staging: {
        userId: 'user-123',
        threadId: 'thread-456',
      },
      environment: 'staging',
      fileName: 'runway-task-1',
      mediaKind: 'auto',
      expiresInMinutes: 120,
    });
    expect(result.data).toMatchObject({
      outputUrl: 'https://signed.example/runway-output.mp4',
      storagePath: 'Users/user-123/threads/thread-456/media/staged/video/runway-task-1.mp4',
      ephemeralUrl: 'https://runway.example/output.mp4',
      persisted: true,
    });
  });

  it('falls back to the Runway URL when staging fails', async () => {
    bridge.getTask.mockResolvedValue({
      status: 'SUCCEEDED',
      progress: 1,
      output: [{ url: 'https://runway.example/transient.mp4' }],
    });
    stageFromUrl.mockRejectedValue(new Error('storage unavailable'));

    const result = await tool.execute({ taskId: 'task-2' }, TEST_CONTEXT);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      outputUrl: 'https://runway.example/transient.mp4',
      storagePath: null,
      ephemeralUrl: null,
      persisted: false,
    });
  });
});
