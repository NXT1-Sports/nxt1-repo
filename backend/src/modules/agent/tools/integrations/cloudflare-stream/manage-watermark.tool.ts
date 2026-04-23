/**
 * @fileoverview Manage Watermark Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/cloudflare-stream
 *
 * Creates or lists watermark profiles in Cloudflare Stream.
 * Watermark profiles are reusable — create once (e.g. NXT1 logo),
 * then reference by ID when clipping videos.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type { CloudflareMcpBridgeService } from './cloudflare-mcp-bridge.service.js';
import { ManageWatermarkInputSchema } from './schemas.js';
import { logger } from '../../../../../utils/logger.js';

export class ManageWatermarkTool extends BaseTool {
  readonly name = 'manage_watermark';
  readonly description =
    'Create or list watermark profiles in Cloudflare Stream. ' +
    'A watermark is a transparent PNG image (e.g. the NXT1 logo) that can be stamped ' +
    'onto video clips. Create a watermark once, then pass its ID to clip_video. ' +
    'Action "create" requires name and imageUrl. Action "list" returns all existing profiles.';

  readonly parameters = ManageWatermarkInputSchema;

  override readonly allowedAgents = ['brand_coordinator', 'strategy_coordinator'] as const;

  readonly isMutation = true;
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
    const parsed = ManageWatermarkInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      };
    }

    const { action, name, imageUrl } = parsed.data;

    if (action === 'create') {
      if (!name || !imageUrl) {
        return {
          success: false,
          error: 'Both "name" and "imageUrl" are required when action is "create".',
        };
      }

      if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
        return { success: false, error: 'imageUrl must start with http:// or https://' };
      }

      logger.info('[ManageWatermark] Creating watermark profile', {
        name,
        imageUrl: imageUrl.slice(0, 100),
        userId: context?.userId,
      });
      context?.emitStage?.('uploading_assets', {
        icon: 'upload',
        watermarkName: name,
        phase: 'create_watermark',
      });

      try {
        const watermark = await this.bridge.createWatermarkProfile(name, imageUrl);

        logger.info('[ManageWatermark] Watermark created', {
          uid: watermark.uid,
          name: watermark.name,
        });

        return {
          success: true,
          data: {
            watermarkProfileId: watermark.uid,
            name: watermark.name,
            size: watermark.size,
            width: watermark.width,
            height: watermark.height,
            message: `Watermark profile "${watermark.name}" created. Use watermarkProfileId "${watermark.uid}" when calling clip_video.`,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Watermark creation failed';
        logger.error('[ManageWatermark] Create failed', { name, error: message });
        return { success: false, error: message };
      }
    }

    // action === 'list'
    logger.info('[ManageWatermark] Listing watermark profiles', { userId: context?.userId });

    try {
      const watermarks = await this.bridge.listWatermarkProfiles();

      logger.info('[ManageWatermark] Profiles listed', { count: watermarks.length });

      return {
        success: true,
        data: {
          watermarks: watermarks.map((w) => ({
            watermarkProfileId: w.uid,
            name: w.name,
            size: w.size,
            width: w.width,
            height: w.height,
          })),
          count: watermarks.length,
          message:
            watermarks.length > 0
              ? `Found ${watermarks.length} watermark profile(s). Pass the watermarkProfileId to clip_video to apply it.`
              : 'No watermark profiles found. Use action "create" with name and imageUrl to create one.',
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list watermarks';
      logger.error('[ManageWatermark] List failed', { error: message });
      return { success: false, error: message };
    }
  }
}
