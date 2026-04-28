/**
 * @fileoverview Extract Live View Playlist Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/firecrawl/browser
 */

import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../../base.tool.js';
import type { LiveViewSessionService } from './live-view-session.service.js';
import { logger } from '../../../../../../utils/logger.js';
import { z } from 'zod';

export class ExtractLiveViewPlaylistTool extends BaseTool {
  readonly name = 'extract_live_view_playlist';

  readonly description =
    'Extracts playlist clip URLs, titles, durations, thumbnails, and authenticated request material from the active live-view browser session. ' +
    'Use this when the page in live view shows a Hudl or similar playlist and the user wants the first N clips, multiple plays, or batch film analysis without manual clip-by-clip UI navigation. ' +
    'Returns the playlist entries plus headers and cookies so downstream downloaders like Apify can fetch the clips directly.';

  readonly parameters = z.object({
    sessionId: z.string().trim().min(1).optional(),
    maxItems: z.number().int().min(1).max(100).optional(),
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
