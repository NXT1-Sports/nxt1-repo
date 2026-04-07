/**
 * @fileoverview Read Live View Tool
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Agent X tool that extracts the current page content (as text) from an active
 * live-view browser session. This reads from the SAME browser the user sees —
 * unlike `read_webpage` which creates a separate ephemeral session.
 */

import { BaseTool, type ToolResult } from '../base.tool.js';
import type { LiveViewSessionService } from './live-view-session.service.js';
import { logger } from '../../../../utils/logger.js';

export class ReadLiveViewTool extends BaseTool {
  readonly name = 'read_live_view';

  readonly description =
    'Reads the current page content from the active live-view browser session ' +
    "(the one visible in the user's side panel). Returns the page URL, title, and " +
    'text content so you can understand what the user is looking at. ' +
    'Use this INSTEAD of read_webpage when a live view session is already open. ' +
    "The sessionId is optional — if omitted, the tool automatically finds the user's active session.";

  readonly parameters = {
    type: 'object' as const,
    properties: {
      sessionId: {
        type: 'string',
        description:
          "Optional. The sessionId returned by open_live_view. If omitted, the tool automatically uses the user's current active session.",
      },
      userId: {
        type: 'string',
        description:
          "The authenticated user's ID (uid). Extract from the [User Profile] context — NEVER ask the user.",
      },
    },
    required: ['userId'],
  };

  readonly isMutation = false;
  readonly category = 'analytics' as const;

  override readonly allowedAgents = [
    'data_coordinator',
    'performance_coordinator',
    'recruiting_coordinator',
    'general',
    'brand_media_coordinator',
  ] as const;

  private readonly sessionService: LiveViewSessionService;

  constructor(sessionService: LiveViewSessionService) {
    super();
    this.sessionService = sessionService;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const userId = this.str(input, 'userId');

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
