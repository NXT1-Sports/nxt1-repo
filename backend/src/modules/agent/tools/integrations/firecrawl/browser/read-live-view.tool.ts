/**
 * @fileoverview Read Live View Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/firecrawl/browser
 *
 * Agent X tool that extracts the current page content (as text) from an active
 * live-view browser session. This reads from the SAME browser the user sees.
 */

import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../../base.tool.js';
import type { LiveViewSessionService } from './live-view-session.service.js';
import { logger } from '../../../../../../utils/logger.js';
import { z } from 'zod';

export class ReadLiveViewTool extends BaseTool {
  readonly name = 'read_live_view';

  readonly description =
    'Reads the current page content from the active live-view browser session ' +
    "(the one visible in the user's side panel). Returns the page URL, title, and " +
    'text content so you can understand what the user is looking at. ' +
    'Use this whenever you need content from the page that is already open in live view. ' +
    "The sessionId is optional — if omitted, the tool automatically finds the user's active session.";

  readonly parameters = z.object({
    sessionId: z.string().trim().min(1).optional(),
  });

  readonly isMutation = false;
  readonly category = 'system' as const;

  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = ['*'] as const;

  private readonly sessionService: LiveViewSessionService;

  constructor(sessionService: LiveViewSessionService) {
    super();
    this.sessionService = sessionService;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const userId = context?.userId ?? this.str(input, 'userId');

    if (!userId) return this.paramError('userId');

    try {
      const sessionId = this.sessionService.resolveSessionId(this.str(input, 'sessionId'), userId);

      const result = await this.sessionService.extractContent(sessionId, userId);

      logger.info('[ReadLiveViewTool] Content extracted', {
        sessionId,
        userId,
        url: result.url,
        title: result.title,
        contentLength: result.content.length,
      });

      return {
        success: true,
        data: {
          sessionId,
          url: result.url,
          title: result.title,
          content: result.content,
          message: `Page content extracted from the live view. Current URL: ${result.url}`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read live view content';
      logger.error('[ReadLiveViewTool] Extraction failed', {
        userId,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
