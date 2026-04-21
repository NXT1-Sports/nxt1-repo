/**
 * @fileoverview Generate Thumbnail Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/cloudflare-stream
 *
 * Generates a static JPG thumbnail or animated GIF preview from a CF Stream video.
 * Uses pure URL construction (no MCP call needed) — thumbnails are served on-the-fly
 * by Cloudflare's CDN.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type { CloudflareMcpBridgeService } from './cloudflare-mcp-bridge.service.js';
import { GenerateThumbnailInputSchema } from './schemas.js';
import { logger } from '../../../../../utils/logger.js';

export class GenerateThumbnailTool extends BaseTool {
  readonly name = 'generate_thumbnail';
  readonly description =
    'Generate a thumbnail image (JPG) or animated GIF preview from a Cloudflare Stream video. ' +
    'Specify a timestamp to capture. For animated GIFs, set animated=true with duration and FPS. ' +
    'The video must already be imported and ready in Cloudflare Stream. ' +
    'Returns a direct URL to the thumbnail/GIF — no additional processing needed.';

  readonly parameters = {
    type: 'object',
    properties: {
      videoId: {
        type: 'string',
        description: 'The Cloudflare video ID.',
      },
      timeSeconds: {
        type: 'number',
        description: 'Timestamp in seconds to capture the thumbnail from (default: 0).',
      },
      height: {
        type: 'number',
        description: 'Height in pixels (100-1080). Width auto-scales to preserve aspect ratio.',
      },
      width: {
        type: 'number',
        description: 'Width in pixels (100-1920). Use height OR width, not both.',
      },
      animated: {
        type: 'boolean',
        description: 'Set to true for an animated GIF instead of a static JPG.',
      },
      animatedDurationSeconds: {
        type: 'number',
        description: 'Duration of the animated GIF in seconds (1-10, default: 4).',
      },
      animatedFps: {
        type: 'number',
        description: 'Frames per second for the animated GIF (1-15, default: 8).',
      },
    },
    required: ['videoId'],
  } as const;

  override readonly allowedAgents = [
    'brand_media_coordinator',
    'data_coordinator',
    'general',
  ] as const;

  readonly isMutation = false;
  readonly category = 'media' as const;

  private readonly bridge: CloudflareMcpBridgeService;

  constructor(bridge: CloudflareMcpBridgeService) {
    super();
    this.bridge = bridge;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = GenerateThumbnailInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      };
    }

    const { videoId, timeSeconds, height, width, animated, animatedDurationSeconds, animatedFps } =
      parsed.data;

    logger.info('[GenerateThumbnail] Generating', {
      videoId,
      animated,
      timeSeconds,
      userId: context?.userId,
    });

    try {
      let url: string;

      if (animated) {
        url = this.bridge.getAnimatedGifUrl(videoId, {
          timeSeconds,
          height,
          durationSeconds: animatedDurationSeconds ?? 4,
          fps: animatedFps ?? 8,
        });
      } else {
        url = this.bridge.getThumbnailUrl(videoId, { timeSeconds, height, width });
      }

      const type = animated ? 'animated GIF' : 'thumbnail JPG';

      logger.info('[GenerateThumbnail] URL generated', { videoId, type, url });

      return {
        success: true,
        data: {
          url,
          videoId,
          type,
          timeSeconds: timeSeconds ?? 0,
          message: `${type} URL generated. This URL is served directly by Cloudflare's CDN.`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Thumbnail generation failed';
      logger.error('[GenerateThumbnail] Failed', { videoId, error: message });
      return { success: false, error: message };
    }
  }
}
