/**
 * @fileoverview Extract Live View Media Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/firecrawl/browser
 */

import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../../base.tool.js';
import type { LiveViewSessionService } from './live-view-session.service.js';
import { logger } from '../../../../../../utils/logger.js';
import { z } from 'zod';
import { buildVideoWorkflowArtifact } from '../../../media/media-workflow.js';
import {
  ScraperMediaService,
  type MediaInput,
  type MediaThreadContext,
} from '../../social/scraper-media.service.js';

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
    'Extracts real network media URLs from the active live-view browser session, including MP4 files and streaming format variants. ' +
    'Use this when the page in live view is a protected or signed-in video player such as Hudl and the DOM only shows an unplayable source. ' +
    'This reads the browser network activity from the exact page the user is watching and returns the fetched stream URLs so downstream video analysis can use them.';

  readonly parameters = z.object({
    sessionId: z.string().trim().min(1).optional(),
  });

  readonly isMutation = false;
  readonly category = 'media' as const;

  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = ['*'] as const;

  constructor(
    private readonly sessionService: LiveViewSessionService,
    private readonly media: ScraperMediaService = new ScraperMediaService()
  ) {
    super();
  }

  private guessMediaType(url: string): 'image' | 'video' {
    const lower = url.toLowerCase();
    if (
      lower.includes('.mp4') ||
      lower.includes('.mov') ||
      lower.includes('.avi') ||
      lower.includes('.mkv') ||
      lower.includes('.m3u8') ||
      lower.includes('.mpd')
    ) {
      return 'video';
    }
    return 'image';
  }

  private async persistExtractedMedia(
    streams: readonly string[],
    context?: ToolExecutionContext
  ): Promise<readonly string[]> {
    const staging: MediaThreadContext | undefined =
      context?.userId && context?.threadId
        ? { userId: context.userId, threadId: context.threadId }
        : undefined;

    if (!staging || streams.length === 0) {
      return [];
    }

    const mediaItems: MediaInput[] = streams.map((url) => ({
      url,
      type: this.guessMediaType(url),
      platform: 'web',
      sourceUrl: url,
    }));

    const persisted = await this.media.persistBatch(mediaItems, staging);
    return persisted.map((entry) => entry.url);
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

      const mediaArtifact = buildVideoWorkflowArtifact({
        sourceUrl: preferredStream,
        playableUrls: result.streams,
        directMp4Urls: mp4Streams,
        hlsUrls: hlsStreams,
        dashUrls: dashStreams,
        recommendedHeaders,
        sourceTypeHint:
          preferredStream && mp4Streams.includes(preferredStream)
            ? Object.keys(recommendedHeaders).length > 0
              ? 'protected_direct'
              : 'public_direct'
            : undefined,
      });

      const persistedMediaUrls = await this.persistExtractedMedia(result.streams, context);

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
          persistedMediaUrls,
          mediaArtifact,
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
