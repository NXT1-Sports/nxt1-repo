/**
 * @fileoverview Get Video Details Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/cloudflare-stream
 *
 * Retrieves video metadata, processing status, dimensions, duration,
 * and playback URLs (HLS/DASH) from Cloudflare Stream.
 *
 * When `waitForReady` is true, the tool polls until the video reaches
 * "ready" (or "error") state, streaming progress updates to the user.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type { CloudflareMcpBridgeService } from '../cloudflare-mcp-bridge.service.js';
import { GetVideoDetailsInputSchema } from './schemas.js';
import { logger } from '../../../../../utils/logger.js';

/** Time between poll attempts in ms. */
const POLL_INTERVAL_MS = 5_000;
/** Default max wait when polling (5 minutes). */
const DEFAULT_MAX_WAIT_S = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class GetVideoDetailsTool extends BaseTool {
  readonly name = 'get_video_details';
  readonly description =
    'Get details about a video in Cloudflare Stream including processing status, duration, ' +
    'dimensions, and streaming URLs. Set waitForReady=true to automatically poll until the ' +
    'video finishes processing (shows live progress). Without waitForReady, returns the ' +
    'current status immediately.';

  readonly parameters = {
    type: 'object',
    properties: {
      videoId: {
        type: 'string',
        description: 'The Cloudflare video ID to look up.',
      },
      waitForReady: {
        type: 'boolean',
        description:
          'If true, polls until the video is ready or errored, streaming progress updates ' +
          'to the user. Highly recommended after import_video or clip_video. Default: false.',
      },
      maxWaitSeconds: {
        type: 'number',
        description: 'Maximum seconds to wait when waitForReady is true (default: 300, max: 600).',
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
    const parsed = GetVideoDetailsInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      };
    }

    const { videoId, waitForReady, maxWaitSeconds } = parsed.data;
    const shouldPoll = waitForReady === true;
    const maxWaitMs = (maxWaitSeconds ?? DEFAULT_MAX_WAIT_S) * 1_000;

    logger.info('[GetVideoDetails] Fetching', {
      videoId,
      waitForReady: shouldPoll,
      userId: context?.userId,
    });
    context?.onProgress?.(shouldPoll ? 'Checking video status…' : 'Fetching video details…');

    try {
      const startMs = Date.now();
      let video = await this.bridge.getVideo(videoId);
      let state = video.status?.state ?? 'unknown';
      let pct = video.status?.pctComplete ?? null;

      // ── Polling loop (only when waitForReady=true) ───────────────────
      if (shouldPoll) {
        let lastReportedPct = -1;

        while (state !== 'ready' && state !== 'error') {
          const elapsed = Date.now() - startMs;
          if (elapsed >= maxWaitMs) {
            context?.onProgress?.(
              `Still processing after ${Math.round(elapsed / 1000)}s — returning current status.`
            );
            logger.warn('[GetVideoDetails] Max wait exceeded', { videoId, elapsed, state, pct });
            break;
          }

          // Report every meaningful change
          const currentPct = typeof pct === 'number' ? pct : Number(pct) || 0;
          if (currentPct !== lastReportedPct) {
            context?.onProgress?.(`Video processing… ${currentPct}% complete`);
            lastReportedPct = currentPct;
          }

          await sleep(POLL_INTERVAL_MS);

          video = await this.bridge.getVideo(videoId);
          state = video.status?.state ?? 'unknown';
          pct = video.status?.pctComplete ?? null;
        }

        if (state === 'ready') {
          context?.onProgress?.('Video processing complete — ready!');
          logger.info('[GetVideoDetails] Video ready', { videoId, duration: video.duration });
        } else if (state === 'error') {
          context?.onProgress?.('Video processing failed.');
          logger.error('[GetVideoDetails] Video errored', {
            videoId,
            error: video.status?.errorReasonText,
          });
        }
      }

      logger.info('[GetVideoDetails] Retrieved', {
        videoId,
        status: state,
        readyToStream: video.readyToStream,
        duration: video.duration,
        polled: shouldPoll,
      });

      return {
        success: true,
        data: {
          videoId: video.uid,
          status: state,
          processingPercent: pct,
          readyToStream: video.readyToStream ?? false,
          duration: video.duration ?? null,
          dimensions: video.input ? { width: video.input.width, height: video.input.height } : null,
          playback: {
            hls: video.playback?.hls ?? null,
            dash: video.playback?.dash ?? null,
          },
          thumbnail: video.thumbnail ?? null,
          created: video.created ?? null,
          meta: video.meta ?? null,
          scheduledDeletion: video.scheduledDeletion ?? null,
          clippedFromVideoUID: video.clippedFromVideoUID ?? null,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get video details';
      logger.error('[GetVideoDetails] Failed', { videoId, error: message });
      return { success: false, error: message };
    }
  }
}
