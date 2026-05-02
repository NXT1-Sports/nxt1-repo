/**
 * @fileoverview Extract Live View Playlist Tool
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

export class ExtractLiveViewPlaylistTool extends BaseTool {
  readonly name = 'extract_live_view_playlist';

  readonly description =
    'Extracts playlist clip URLs, titles, durations, thumbnails, and authenticated request material from the active live-view browser session. ' +
    'Use this when the page in live view shows a Hudl or similar playlist and the user wants the first N clips, multiple plays, or batch film analysis without manual clip-by-clip UI navigation. ' +
    'Returns the playlist entries plus session credentials so the clips can be fetched and processed directly.';

  readonly parameters = z.object({
    sessionId: z.string().trim().min(1).optional(),
    maxItems: z.number().int().min(1).max(100).optional(),
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

  private async persistPlaylistMedia(
    urls: readonly string[],
    context?: ToolExecutionContext
  ): Promise<readonly string[]> {
    const staging: MediaThreadContext | undefined =
      context?.userId && context?.threadId
        ? { userId: context.userId, threadId: context.threadId }
        : undefined;

    if (!staging || urls.length === 0) {
      return [];
    }

    const mediaItems: MediaInput[] = urls.map((url) => ({
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
      const maxItems = typeof input['maxItems'] === 'number' ? input['maxItems'] : undefined;
      const result = await this.sessionService.extractPlaylist(sessionId, userId, maxItems);

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

      logger.info('[ExtractLiveViewPlaylistTool] Playlist extracted', {
        sessionId,
        userId,
        url: result.url,
        itemCount: result.items.length,
      });

      const mediaArtifacts = result.items.map((item) =>
        buildVideoWorkflowArtifact({
          sourceUrl: item.url,
          playableUrls: item.url ? [item.url] : [],
          directMp4Urls: item.url && /\.mp4(?:$|[?#])/i.test(item.url) ? [item.url] : [],
          hlsUrls: item.url && /\.m3u8(?:$|[?#])/i.test(item.url) ? [item.url] : [],
          dashUrls: item.url && /\.mpd(?:$|[?#])/i.test(item.url) ? [item.url] : [],
          recommendedHeaders,
          sourceTypeHint: 'playlist',
          rationale: item.url
            ? `Playlist item ${item.index + 1} requires the same portability check as the parent playlist extraction.`
            : 'Playlist item does not expose a direct media URL yet.',
        })
      );

      const playlistUrls = result.items
        .map((item) => item.url)
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
      const persistedMediaUrls = await this.persistPlaylistMedia(playlistUrls, context);

      return {
        success: true,
        data: {
          sessionId,
          url: result.url,
          title: result.title,
          playlistTitle: result.playlistTitle,
          itemCount: result.items.length,
          items: result.items,
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
            sourceUrls: result.items
              .map((item) => item.url)
              .filter((value): value is string => !!value),
            headers: recommendedHeaders,
            cookies: result.auth.cookies,
          },
          persistedMediaUrls,
          mediaArtifacts,
          message: `Detected ${result.items.length} playlist clip(s) from the active live view. Use their URLs plus the auth bundle for batch downloading and analysis.`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to extract live view playlist';
      logger.error('[ExtractLiveViewPlaylistTool] Extraction failed', {
        userId,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
