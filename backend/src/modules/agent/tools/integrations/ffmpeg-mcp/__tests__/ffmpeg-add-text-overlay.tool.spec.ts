import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FfmpegAddTextOverlayTool } from '../ffmpeg-add-text-overlay.tool.js';
import type { ToolExecutionContext } from '../../../base.tool.js';

const TEST_CONTEXT = {
  userId: 'user-1',
  threadId: 'thread-1',
  emitStage: vi.fn(),
} satisfies ToolExecutionContext;

describe('FfmpegAddTextOverlayTool', () => {
  const bridge = {
    addTextOverlay: vi.fn(),
  };

  let tool: FfmpegAddTextOverlayTool;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['FFMPEG_MAX_TEXT_OVERLAY_DURATION_SECONDS'];
    tool = new FfmpegAddTextOverlayTool(bridge as never);
  });

  afterEach(() => {
    delete process.env['FFMPEG_MAX_TEXT_OVERLAY_DURATION_SECONDS'];
  });

  it('adds short timed overlays', async () => {
    bridge.addTextOverlay.mockResolvedValue({
      success: true,
      output_path: '/tmp/overlay.mp4',
    });

    const result = await tool.execute(
      {
        inputPath: '/tmp/input.mp4',
        text: 'KELVIN PERKINS | QB',
        startTime: 0,
        endTime: 5,
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(bridge.addTextOverlay).toHaveBeenCalledTimes(1);
    expect(TEST_CONTEXT.emitStage).toHaveBeenCalledWith('processing_media', {
      icon: 'media',
      phase: 'ffmpeg_add_text_overlay',
    });
  });

  it('rejects overlays without explicit timing to avoid full-video re-encodes', async () => {
    const result = await tool.execute(
      {
        inputPath: '/tmp/input.mp4',
        text: 'KELVIN PERKINS | QB',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('requires startTime and endTime');
    expect(bridge.addTextOverlay).not.toHaveBeenCalled();
    expect(TEST_CONTEXT.emitStage).not.toHaveBeenCalled();
  });

  it('rejects long overlay windows before calling FFmpeg', async () => {
    const result = await tool.execute(
      {
        inputPath: '/tmp/input.mp4',
        text: 'KELVIN PERKINS | QB | SOUTHWIND HS | CLASS OF 2026',
        startTime: 0,
        endTime: 80,
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('limited to 15s windows');
    expect(result.error).toContain('Requested 80s');
    expect(bridge.addTextOverlay).not.toHaveBeenCalled();
    expect(TEST_CONTEXT.emitStage).not.toHaveBeenCalled();
  });
});
