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
import { getPlaylistExtractionCached } from './extraction-cache.service.js';

export class ExtractLiveViewPlaylistTool extends BaseTool {
  readonly name = 'extract_live_view_playlist';

  readonly description =
    'Extracts playlist clip URLs, titles, durations, thumbnails, and authenticated request material from the active live-view browser session. ' +
    'Use this for a bounded Hudl or similar playlist subset when the user wants multiple plays, last N plays, specific play numbers, or batch film analysis. ' +
    'It can use Firecrawl browser interaction to scroll virtualized rows, but it must stay bounded to the requested subset. Returns playlist entries plus session credentials so clips can be fetched and processed directly.';

  readonly parameters = z.object({
    sessionId: z.string().trim().min(1).optional(),
    maxItems: z.number().int().min(1).max(25).optional(),
    selection: z.enum(['visible', 'first', 'last']).optional(),
    playNumbers: z.array(z.number().int().positive()).max(25).optional(),
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
      const sessionId = await this.sessionService.resolveSessionId(
        this.str(input, 'sessionId'),
        userId
      );
      const requestedMaxItems = typeof input['maxItems'] === 'number' ? input['maxItems'] : 5;
      const maxItems = Math.min(Math.max(Math.trunc(requestedMaxItems) || 5, 1), 25);
      const selection =
        input['selection'] === 'first' || input['selection'] === 'last'
          ? input['selection']
          : 'visible';
      const playNumbers = Array.isArray(input['playNumbers'])
        ? input['playNumbers']
            .map((value) => (typeof value === 'number' ? Math.trunc(value) : NaN))
            .filter((value) => Number.isFinite(value) && value > 0)
            .slice(0, 25)
        : [];
      const { result, cacheHit } = await getPlaylistExtractionCached(
        sessionId,
        userId,
        context?.threadId,
        maxItems,
        selection,
        playNumbers,
        () =>
          this.sessionService.extractPlaylist(sessionId, userId, maxItems, {
            selection,
            playNumbers,
          })
      );

      if (cacheHit !== 'miss') {
        logger.info('[ExtractLiveViewPlaylistTool] Using cached extraction result', {
          sessionId,
          userId,
          itemCount: result.items.length,
          cacheHit,
          savings: cacheHit === 'request' ? '$12.99' : '$12.99 (session)',
        });
      }

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

      const playlistUrls = result.items
        .map((item) => item.url)
        .filter((value): value is string => typeof value === 'string' && value.length > 0);

      if (playlistUrls.length === 0) {
        return {
          success: false,
          error:
            'Playlist rows were detected, but no clip URLs were extractable from this view. Load the target clip(s) in the player and retry, or run extract_live_view_media for the currently loaded clip.',
          data: {
            sessionId,
            url: result.url,
            title: result.title,
            playlistTitle: result.playlistTitle,
            itemCount: result.items.length,
            items: result.items,
            noExtractableClipUrls: true,
          },
        };
      }

      const mediaArtifacts = result.items
        .filter((item) => typeof item.url === 'string' && item.url.length > 0)
        .map((item) =>
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
