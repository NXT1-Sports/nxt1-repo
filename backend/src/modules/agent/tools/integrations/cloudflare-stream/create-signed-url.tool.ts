/**
 * @fileoverview Create Signed URL Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/cloudflare-stream
 *
 * Generates a time-limited signed token for private video access.
 * Used when videos have requireSignedURLs enabled.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type { CloudflareMcpBridgeService } from './cloudflare-mcp-bridge.service.js';
import { CreateSignedUrlInputSchema } from './schemas.js';
import { logger } from '../../../../../utils/logger.js';

export class CreateSignedUrlTool extends BaseTool {
  readonly name = 'create_signed_url';
  readonly description =
    'Generate a time-limited signed URL for private video access in Cloudflare Stream. ' +
    'Use this when a video has restricted access (requireSignedURLs enabled). ' +
    'The signed URL allows temporary viewing without exposing the raw video ID. ' +
    'Default expiry is 60 minutes. Can also allow downloads via the signed URL.';

  readonly parameters = CreateSignedUrlInputSchema;

  override readonly allowedAgents = [
    'brand_coordinator',
    'data_coordinator',
    'recruiting_coordinator',
    'strategy_coordinator',
  ] as const;

  readonly isMutation = false;
  readonly category = 'media' as const;

  readonly entityGroup = 'user_tools' as const;
  private readonly bridge: CloudflareMcpBridgeService;

  constructor(bridge: CloudflareMcpBridgeService) {
    super();
    this.bridge = bridge;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = CreateSignedUrlInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      };
    }

    const { videoId, expiresInMinutes, downloadable } = parsed.data;
    const expiry = expiresInMinutes ?? 60;

    logger.info('[CreateSignedUrl] Generating signed token', {
      videoId,
      expiresInMinutes: expiry,
      downloadable,
      userId: context?.userId,
    });

    try {
      const tokenResult = await this.bridge.createSignedToken(
        videoId,
        expiry,
        downloadable ?? false
      );

      const signedHlsUrl = this.bridge.getHlsUrl(videoId) + `?token=${tokenResult.token}`;

      logger.info('[CreateSignedUrl] Signed URL generated', { videoId, expiresInMinutes: expiry });

      return {
        success: true,
        data: {
          videoId,
          token: tokenResult.token,
          signedHlsUrl,
          expiresInMinutes: expiry,
          downloadable: downloadable ?? false,
          message: `Signed URL valid for ${expiry} minutes. Use the signedHlsUrl for direct playback.`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signed URL generation failed';
      logger.error('[CreateSignedUrl] Failed', { videoId, error: message });
      return { success: false, error: message };
    }
  }
}
