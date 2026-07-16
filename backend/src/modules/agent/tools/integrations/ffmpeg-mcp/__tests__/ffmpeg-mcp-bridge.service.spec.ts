import { afterEach, describe, expect, it, vi } from 'vitest';

import { FfmpegMcpBridgeService } from '../ffmpeg-mcp-bridge.service.js';

describe('FfmpegMcpBridgeService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('stages generated thumbnails as images when restaging public FFmpeg outputs', () => {
    vi.stubEnv('FFMPEG_MCP_URL', 'https://ffmpeg.example.com/mcp');
    const bridge = new FfmpegMcpBridgeService() as unknown as {
      resolveOutputStageMediaKind: (toolName: string) => string;
    };

    expect(bridge.resolveOutputStageMediaKind('generate_thumbnail')).toBe('image');
    expect(bridge.resolveOutputStageMediaKind('merge_videos')).toBe('video');
  });
});
