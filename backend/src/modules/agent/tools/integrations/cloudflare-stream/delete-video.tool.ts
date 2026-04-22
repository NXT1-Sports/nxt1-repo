/**
 * @fileoverview Delete Video Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/cloudflare-stream
 *
 * Permanently deletes a video from Cloudflare Stream.
 * Used for manual cleanup or as the final step in the ephemeral architecture
 * after the processed artifact has been saved back to Firebase Storage.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type { CloudflareMcpBridgeService } from './cloudflare-mcp-bridge.service.js';
import { logger } from '../../../../../utils/logger.js';

export class DeleteVideoTool extends BaseTool {
  readonly name = 'delete_video';
  readonly description =
    'Permanently delete a video from Cloudflare Stream. ' +
    'Use this when a user explicitly asks to delete a video, or after the processed ' +
    'artifact has been saved back to Firebase Storage (ephemeral cleanup). ' +
    'The videoId is the Cloudflare video UID (cloudflareVideoId from the upload).';

  readonly parameters = {
    type: 'object',
    properties: {
      videoId: {
        type: 'string',
        description: 'The Cloudflare video ID (UID) to delete.',
      },
    },
    required: ['videoId'],
  } as const;

  override readonly allowedAgents = [
    'brand_coordinator',
    'data_coordinator',
    'strategy_coordinator',
  ] as const;

  readonly isMutation = true;
  readonly category = 'media' as const;

  private readonly bridge: CloudflareMcpBridgeService;

  constructor(bridge: CloudflareMcpBridgeService) {
    super();
    this.bridge = bridge;
  }

  async execute(
    input: Record<string, unknown>,
    _context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const videoId = input['videoId'];
    if (typeof videoId !== 'string' || !videoId.trim()) {
      return { success: false, error: 'videoId is required' };
    }

    logger.info('[DeleteVideo] Deleting video from Cloudflare Stream', { videoId });

    try {
      await this.bridge.deleteVideo(videoId);
      logger.info('[DeleteVideo] Deleted', { videoId });
      return {
        success: true,
        data: {
          videoId,
          message: `Video "${videoId}" has been permanently deleted from Cloudflare Stream.`,
        },
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      logger.error('[DeleteVideo] Failed', { videoId, error });
      return { success: false, error: `Failed to delete video: ${error}` };
    }
  }
}
