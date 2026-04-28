/**
 * @fileoverview Extract Live View Media Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/firecrawl/browser
 */

import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../../base.tool.js';
import type { LiveViewSessionService } from './live-view-session.service.js';
import { logger } from '../../../../../../utils/logger.js';
import { z } from 'zod';

const MP4_PATTERN = /\.mp4(?:$|[?#])/i;
const HLS_PATTERN = /\.m3u8(?:$|[?#])/i;
const DASH_PATTERN = /\.mpd(?:$|[?#])/i;

function selectPreferredStream(
  streams: readonly string[],
  currentSrc: string | null
): string | null {
  const playableCurrentSrc =
    currentSrc && !currentSrc.startsWith('blob:') ? currentSrc.trim() : null;

  if (playableCurrentSrc && MP4_PATTERN.test(playableCurrentSrc)) {
    return playableCurrentSrc;
  }

  const directMp4 = streams.find((stream) => MP4_PATTERN.test(stream));
  if (directMp4) return directMp4;

  const hls = streams.find((stream) => HLS_PATTERN.test(stream));
  if (hls) return hls;

  const dash = streams.find((stream) => DASH_PATTERN.test(stream));
  if (dash) return dash;

  return playableCurrentSrc ?? streams[0] ?? null;
}

export class ExtractLiveViewMediaTool extends BaseTool {
  readonly name = 'extract_live_view_media';

  readonly description =
    'Extracts real network media URLs from the active live-view browser session, including HLS manifests (.m3u8), MP4 files, DASH manifests (.mpd), and transport stream chunks. ' +
    'Use this when the page in live view is a protected or signed-in video player such as Hudl and the DOM only shows a blob: URL. ' +
    'This reads the browser Performance API from the exact page the user is watching and returns the fetched stream URLs so downstream video analysis can use them.';

  readonly parameters = z.object({
    sessionId: z.string().trim().min(1).optional(),
  });

  readonly isMutation = false;
  readonly category = 'media' as const;

  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = ['*'] as const;

  constructor(private readonly sessionService: LiveViewSessionService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const userId = context?.userId ?? this.str(input, 'userId');
    if (!userId) return this.paramError('userId');

    try {
      const sessionId = this.sessionService.resolveSessionId(this.str(input, 'sessionId'), userId);
      const result = await this.sessionService.extractMedia(sessionId, userId);
      const mp4Streams = result.streams.filter((stream) => MP4_PATTERN.test(stream));
      const hlsStreams = result.streams.filter((stream) => HLS_PATTERN.test(stream));
      const dashStreams = result.streams.filter((stream) => DASH_PATTERN.test(stream));
      const preferredStream = selectPreferredStream(result.streams, result.currentSrc);
      const recommendedHeaders: Record<string, string> = {};

      if (result.auth.cookieHeader) {
        recommendedHeaders['Cookie'] = result.auth.cookieHeader;
      }
      if (result.auth.userAgent) {
        recommendedHeaders['User-Agent'] = result.auth.userAgent;
      }
      if (result.auth.referer) {
        recommendedHeaders['Referer'] = result.auth.referer;
      }
      if (result.auth.origin) {
        recommendedHeaders['Origin'] = result.auth.origin;
      }

      logger.info('[ExtractLiveViewMediaTool] Media extracted', {
        sessionId,
        userId,
        url: result.url,
        streamCount: result.streams.length,
        cookieCount: result.auth.cookies.length,
        preferredStream,
      });

      return {
        success: true,
        data: {
          sessionId,
          url: result.url,
          title: result.title,
          streams: result.streams,
          primaryStream: preferredStream,
          directMp4Streams: mp4Streams,
          hlsStreams,
          dashStreams,
          currentSrc: result.currentSrc,
          blobSrc: result.blobSrc,
          auth: {
            cookieHeader: result.auth.cookieHeader,
            cookieCount: result.auth.cookies.length,
            cookies: result.auth.cookies,
            userAgent: result.auth.userAgent,
            referer: result.auth.referer,
            origin: result.auth.origin,
            recommendedHeaders,
          },
          apifyHints: {
            sourceUrl: preferredStream,
            headers: recommendedHeaders,
            cookies: result.auth.cookies,
          },
          message:
            result.streams.length > 0
              ? `Detected ${result.streams.length} network media stream URL(s) from the live view. Use the auth payload when handing protected streams to Apify or another downloader.`
              : 'No network media streams were detected, but a direct video source is present.',
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to extract live view media';
      logger.error('[ExtractLiveViewMediaTool] Extraction failed', {
        userId,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
