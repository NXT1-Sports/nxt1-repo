/**
 * @fileoverview Clip Video Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/cloudflare-stream
 *
 * Creates a highlight clip from a source video in Cloudflare Stream.
 * Supports optional watermark overlay and auto-scheduled deletion.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type { CloudflareMcpBridgeService } from './cloudflare-mcp-bridge.service.js';
import { ClipVideoInputSchema } from './schemas.js';
import { logger } from '../../../../../utils/logger.js';

/** Default auto-deletion for clips: 4 hours. */
const DEFAULT_DELETION_MINUTES = 240;

export class ClipVideoTool extends BaseTool {
  readonly name = 'clip_video';
  readonly description =
    'Create a highlight clip from a video already imported into Cloudflare Stream. ' +
    'Specify start and end times in seconds. Optionally apply a watermark. ' +
    'The source video must already be in Cloudflare (use import_video first). ' +
    'Returns a new Cloudflare video ID for the clip. Use enable_download to get the MP4.';

  readonly parameters = ClipVideoInputSchema;

  override readonly allowedAgents = [
    'brand_coordinator',
    'data_coordinator',
    'strategy_coordinator',
  ] as const;

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
    const parsed = ClipVideoInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      };
    }

    const {
      videoId,
      startTimeSeconds,
      endTimeSeconds,
      watermarkProfileId,
      scheduleDeletionMinutes,
    } = parsed.data;

    if (endTimeSeconds <= startTimeSeconds) {
      return { success: false, error: 'endTimeSeconds must be greater than startTimeSeconds.' };
    }

    const clipDuration = endTimeSeconds - startTimeSeconds;
    if (clipDuration > 600) {
      return { success: false, error: 'Clip duration cannot exceed 10 minutes (600 seconds).' };
    }

    const deletionMinutes = scheduleDeletionMinutes ?? DEFAULT_DELETION_MINUTES;

    logger.info('[ClipVideo] Creating clip', {
      videoId,
      startTimeSeconds,
      endTimeSeconds,
      clipDuration,
      watermarkProfileId,
      userId: context?.userId,
    });
    context?.emitStage?.('processing_media', {
      icon: 'media',
      videoId,
      startTimeSeconds,
      endTimeSeconds,
      clipDuration,
      phase: 'clip_video',
    });

    try {
      const clip = await this.bridge.clipVideo(
        videoId,
        startTimeSeconds,
        endTimeSeconds,
        watermarkProfileId,
        deletionMinutes
      );

      logger.info('[ClipVideo] Clip created', {
        clipId: clip.uid,
        sourceId: videoId,
        status: clip.status?.state,
      });

      return {
        success: true,
        data: {
          clipVideoId: clip.uid,
          sourceVideoId: videoId,
          startTimeSeconds,
          endTimeSeconds,
          durationSeconds: clipDuration,
          status: clip.status?.state ?? 'queued',
          message: `Clip created. Use get_video_details with videoId "${clip.uid}" to check when ready, then enable_download to get the MP4.`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Clip creation failed';
      logger.error('[ClipVideo] Failed', { videoId, error: message });
      return { success: false, error: message };
    }
  }
}
