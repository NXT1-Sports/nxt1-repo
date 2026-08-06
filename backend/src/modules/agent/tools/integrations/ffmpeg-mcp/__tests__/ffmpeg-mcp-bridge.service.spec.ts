import { afterEach, describe, expect, it, vi } from 'vitest';

import { FfmpegMcpBridgeService } from '../ffmpeg-mcp-bridge.service.js';
import type { ToolExecutionContext } from '../../../base.tool.js';

type BridgeHarness = {
  executeOperation: (
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number,
    context?: ToolExecutionContext,
    options?: { readonly requireHttpOutputUrl?: boolean }
  ) => Promise<Record<string, unknown>>;
  executeToolStateless: ReturnType<typeof vi.fn>;
  mediaStaging: {
    readonly stageFromUrl: ReturnType<typeof vi.fn>;
  };
  shouldRestageOutputUrl: (outputUrl: string, context?: ToolExecutionContext) => boolean;
};

function createBridgeHarness(): BridgeHarness {
  vi.stubEnv('FFMPEG_MCP_URL', 'https://ffmpeg.example.com/mcp');
  return new FfmpegMcpBridgeService() as unknown as BridgeHarness;
}

describe('FfmpegMcpBridgeService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('stages generated thumbnails as images when restaging public FFmpeg outputs', () => {
    const bridge = createBridgeHarness() as unknown as {
      resolveOutputStageMediaKind: (toolName: string) => string;
    };

    expect(bridge.resolveOutputStageMediaKind('generate_thumbnail')).toBe('image');
    expect(bridge.resolveOutputStageMediaKind('merge_videos')).toBe('video');
  });

  it('restages production Firebase outputs during staging runs', async () => {
    const bridge = createBridgeHarness();
    const productionUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fstaged%2Fvideo%2Fhighlight.mp4?alt=media&token=prod';
    const stagingUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-staging-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fstaged%2Fvideo%2Fhighlight.mp4?alt=media&token=staging';
    const stageFromUrl = vi.fn().mockResolvedValue({
      signedUrl: stagingUrl,
      storagePath: 'Users/user-1/threads/thread-1/media/staged/video/highlight.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 4096,
    });

    bridge.executeToolStateless = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, outputUrl: productionUrl }),
        },
      ],
    });
    bridge.mediaStaging = { stageFromUrl };

    const result = await bridge.executeOperation(
      'merge_videos',
      {},
      1_000,
      { userId: 'user-1', threadId: 'thread-1', environment: 'staging' },
      { requireHttpOutputUrl: true }
    );

    expect(stageFromUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: productionUrl,
        environment: 'staging',
        staging: { userId: 'user-1', threadId: 'thread-1' },
      })
    );
    expect(result['outputUrl']).toBe(stagingUrl);
    expect(result['storagePath']).toBe(
      'Users/user-1/threads/thread-1/media/staged/video/highlight.mp4'
    );
  });

  it('keeps current-environment thread-scoped Firebase outputs without restaging', async () => {
    const bridge = createBridgeHarness();
    const stagingUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-staging-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fstaged%2Fvideo%2Fhighlight.mp4?alt=media&token=staging';
    const stageFromUrl = vi.fn();

    bridge.executeToolStateless = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, outputUrl: stagingUrl }),
        },
      ],
    });
    bridge.mediaStaging = { stageFromUrl };

    const result = await bridge.executeOperation(
      'merge_videos',
      {},
      1_000,
      { userId: 'user-1', threadId: 'thread-1', environment: 'staging' },
      { requireHttpOutputUrl: true }
    );

    expect(stageFromUrl).not.toHaveBeenCalled();
    expect(result['outputUrl']).toBe(stagingUrl);
  });

  it('continues restaging legacy agent-x ffmpeg output paths', () => {
    const bridge = createBridgeHarness();

    expect(
      bridge.shouldRestageOutputUrl(
        'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/agent-x/ffmpeg/merged.mp4',
        { userId: 'user-1', threadId: 'thread-1', environment: 'staging' }
      )
    ).toBe(true);
  });
});
