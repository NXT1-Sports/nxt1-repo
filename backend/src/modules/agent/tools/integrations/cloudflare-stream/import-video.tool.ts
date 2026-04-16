/**
 * @fileoverview Import Video Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/cloudflare-stream
 *
 * Imports a video from a URL (typically a Firebase Storage signed URL) into
 * Cloudflare Stream for ephemeral processing. Auto-schedules deletion to
 * enforce zero permanent CF storage.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type { CloudflareMcpBridgeService } from './cloudflare-mcp-bridge.service.js';
import { ImportVideoInputSchema } from './schemas.js';
import { logger } from '../../../../../utils/logger.js';

/** Default auto-deletion time: 4 hours — enough for processing + download. */
const DEFAULT_DELETION_MINUTES = 240;
/** Time between poll attempts in ms. */
const POLL_INTERVAL_MS = 5_000;
/** Default max wait when polling (5 minutes). */
const DEFAULT_MAX_WAIT_MS = 300_000;

export class ImportVideoTool extends BaseTool {
  readonly name = 'import_video';
  readonly description =
    'Import a video from a URL (e.g. Firebase Storage URL) into Cloudflare Stream for processing. ' +
    'The video is imported temporarily — Cloudflare will auto-delete it after processing completes. ' +
    'After importing, use get_video_details to check when it is ready, then clip_video, ' +
    'generate_captions, or enable_download to work with it. ' +
    'Returns the Cloudflare video ID needed for subsequent operations.';

  readonly parameters = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description:
          'The public or signed URL of the video to import (e.g. Firebase Storage download URL).',
      },
      name: {
        type: 'string',
        description: 'Optional name/label for the video in Cloudflare.',
      },
      scheduleDeletionMinutes: {
        type: 'number',
        description:
          'Auto-delete the video from Cloudflare after this many minutes (default: 240 = 4 hours). ' +
          'Keeps CF storage costs at zero.',
      },
      waitForReady: {
        type: 'boolean',
        description:
          'If true, polls until the video finishes processing (streams progress updates). ' +
          'Recommended for most workflows so follow-up tools can act immediately. Default: false.',
      },
    },
    required: ['url'],
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
    const parsed = ImportVideoInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      };
    }

    const { url, name, scheduleDeletionMinutes, waitForReady } = parsed.data;
    const deletionMinutes = scheduleDeletionMinutes ?? DEFAULT_DELETION_MINUTES;

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { success: false, error: 'URL must start with http:// or https://' };
    }

    const backendUrl = process.env['BACKEND_URL']?.replace(/\/$/, '') || 'unknown';

    logger.info('[ImportVideo] Importing video to Cloudflare Stream', {
      url: url.slice(0, 100),
      name,
      deletionMinutes,
      userId: context?.userId,
      backendUrl,
    });
    context?.onProgress?.('Importing video to Cloudflare Stream…');

    try {
      const meta: Record<string, string> = {
        webhook_backend_url: backendUrl,
      };
      if (name) meta['name'] = name;
      if (context?.userId) meta['nxt1_user_id'] = context.userId;

      const video = await this.bridge.importVideo(url, meta, deletionMinutes);

      logger.info('[ImportVideo] Video import initiated', {
        cloudflareId: video.uid,
        status: video.status?.state,
      });

      // ── Poll for ready if requested ────────────────────────────────────
      let finalStatus = video.status?.state ?? 'queued';
      let duration: number | null = null;

      if (waitForReady) {
        context?.onProgress?.('Video uploaded — waiting for Cloudflare to process…');
        const startMs = Date.now();
        let lastPct = -1;

        while (finalStatus !== 'ready' && finalStatus !== 'error') {
          if (Date.now() - startMs >= DEFAULT_MAX_WAIT_MS) {
            context?.onProgress?.(
              `Still processing after ${Math.round((Date.now() - startMs) / 1000)}s — returning current status.`
            );
            break;
          }

          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          const check = await this.bridge.getVideo(video.uid);
          finalStatus = check.status?.state ?? 'unknown';
          const rawPct = check.status?.pctComplete;
          const pct = typeof rawPct === 'number' ? rawPct : Number(rawPct) || 0;
          duration = check.duration ?? null;

          if (pct !== lastPct) {
            context?.onProgress?.(`Processing video… ${pct}% complete`);
            lastPct = pct;
          }
        }

        if (finalStatus === 'ready') {
          context?.onProgress?.(
            'Video processing complete — ready for clipping, captions, and download!'
          );
        } else if (finalStatus === 'error') {
          context?.onProgress?.('Video processing failed.');
        }
      }

      return {
        success: true,
        data: {
          cloudflareVideoId: video.uid,
          status: finalStatus,
          duration,
          scheduledDeletionMinutes: deletionMinutes,
          message:
            finalStatus === 'ready'
              ? `Video "${video.uid}" is processed and ready. Use clip_video, generate_captions, or enable_download.`
              : `Video import started (status: ${finalStatus}). Use get_video_details with videoId "${video.uid}" and waitForReady=true to track progress.`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Video import failed';
      logger.error('[ImportVideo] Failed', { url: url.slice(0, 100), error: message });
      return { success: false, error: message };
    }
  }
}
