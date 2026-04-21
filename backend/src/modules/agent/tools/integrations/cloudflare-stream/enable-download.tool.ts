/**
 * @fileoverview Enable Download Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/cloudflare-stream
 *
 * Enables downloadable MP4 or M4A rendering of a Cloudflare Stream video.
 * CRITICAL for the ephemeral architecture: Agent X must call this to pull
 * processed artifacts (clips, watermarked videos) back to Firebase Storage
 * as downloadable files before Cloudflare auto-deletes them.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type { CloudflareMcpBridgeService } from './cloudflare-mcp-bridge.service.js';
import { EnableDownloadInputSchema } from './schemas.js';
import { logger } from '../../../../../utils/logger.js';

export class EnableDownloadTool extends BaseTool {
  readonly name = 'enable_download';
  readonly description =
    'Enable a downloadable MP4 (video) or M4A (audio-only) version of a Cloudflare Stream video. ' +
    'This is REQUIRED to retrieve the final processed file (clip, watermarked video, etc.) ' +
    'back from Cloudflare. After enabling, use get_video_details to check download status. ' +
    'Once download URL is ready, the backend can pull the MP4 back to Firebase Storage. ' +
    'The video must be in "ready" state before calling this.';

  readonly parameters = {
    type: 'object',
    properties: {
      videoId: {
        type: 'string',
        description: 'The Cloudflare video ID to enable downloads for.',
      },
      type: {
        type: 'string',
        enum: ['video', 'audio'],
        description: '"video" for MP4 download (default), "audio" for M4A audio-only.',
      },
    },
    required: ['videoId'],
  } as const;

  override readonly allowedAgents = [
    'brand_media_coordinator',
    'data_coordinator',
    'general',
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
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = EnableDownloadInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      };
    }

    const { videoId, type } = parsed.data;
    const downloadType = type === 'audio' ? 'audio' : 'video';

    logger.info('[EnableDownload] Enabling download', {
      videoId,
      type: downloadType,
      userId: context?.userId,
    });
    context?.onProgress?.(`Enabling ${downloadType} download…`);

    try {
      const download = await this.bridge.enableDownload(videoId, downloadType);
      context?.onProgress?.(`Rendering ${downloadType} file…`);

      // Try to get the current download status/URL
      let downloadUrl: string | null = null;
      let status = 'processing';
      let percentComplete: number | null = null;

      if (downloadType === 'audio' && download.audio) {
        downloadUrl = download.audio.url ?? null;
        status = download.audio.status ?? 'processing';
        percentComplete = download.audio.percentComplete ?? null;
      } else if (download.default) {
        downloadUrl = download.default.url ?? null;
        status = download.default.status ?? 'processing';
        percentComplete = download.default.percentComplete ?? null;
      }

      // Poll until the download URL is available (max 3 minutes)
      const maxWaitMs = 180_000;
      const pollInterval = 5_000;
      const startMs = Date.now();

      while (!downloadUrl && status === 'processing' && Date.now() - startMs < maxWaitMs) {
        context?.onProgress?.(`Rendering ${downloadType}… ${percentComplete ?? 0}% complete`);
        await new Promise((r) => setTimeout(r, pollInterval));

        try {
          const links = await this.bridge.getDownloadLinks(videoId);
          if (downloadType === 'audio' && links.audio) {
            downloadUrl = links.audio.url ?? null;
            status = links.audio.status ?? 'processing';
            percentComplete = links.audio.percentComplete ?? null;
          } else if (links.default) {
            downloadUrl = links.default.url ?? null;
            status = links.default.status ?? 'processing';
            percentComplete = links.default.percentComplete ?? null;
          }
        } catch {
          // Non-fatal — keep polling
        }
      }

      if (downloadUrl) {
        context?.onProgress?.(`${downloadType === 'audio' ? 'Audio' : 'Video'} download ready!`);
      }

      logger.info('[EnableDownload] Download enabled', {
        videoId,
        type: downloadType,
        status,
        downloadUrl: downloadUrl ? 'available' : 'processing',
      });

      return {
        success: true,
        data: {
          videoId,
          type: downloadType,
          status,
          downloadUrl,
          percentComplete,
          message: downloadUrl
            ? `Download ready! URL: ${downloadUrl}`
            : `Download rendering in progress (${percentComplete ?? 0}% complete). ` +
              `Use get_video_details to poll for the download URL.`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Enable download failed';
      logger.error('[EnableDownload] Failed', { videoId, error: message });
      return { success: false, error: message };
    }
  }
}
