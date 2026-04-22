/**
 * @fileoverview Navigate Live View Tool
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Agent X tool that navigates an active live-view browser session to a new URL.
 * This controls the SAME browser the user sees in their command center iframe.
 */

import { BaseTool, type ToolResult } from '../base.tool.js';
import type { LiveViewSessionService } from './live-view-session.service.js';
import { logger } from '../../../../utils/logger.js';

export class NavigateLiveViewTool extends BaseTool {
  readonly name = 'navigate_live_view';

  readonly description =
    'Navigates the active live-view browser (the one the user can see in the side panel) to a new URL. ' +
    'The iframe updates in real time so the user sees the page change. ' +
    'Use this INSTEAD of closing and re-opening a live view when the user wants to visit a different site. ' +
    'Use this whenever the target page is already being shown in live view so the visible browser stays in sync. ' +
    "The sessionId is optional — if omitted, the tool automatically finds the user's active session.";

  readonly parameters = {
    type: 'object' as const,
    properties: {
      sessionId: {
        type: 'string',
        description:
          "Optional. The sessionId returned by open_live_view. If omitted, the tool automatically uses the user's current active session.",
      },
      url: {
        type: 'string',
        description: 'The URL to navigate to. Must be a valid HTTP(S) URL.',
      },
      userId: {
        type: 'string',
        description:
          "The authenticated user's ID (uid). Extract from the [User Profile] context — NEVER ask the user.",
      },
    },
    required: ['url', 'userId'],
  };

  readonly isMutation = false;
  readonly category = 'analytics' as const;

  override readonly allowedAgents = [
    'data_coordinator',
    'performance_coordinator',
    'recruiting_coordinator',
    'strategy_coordinator',
    'brand_coordinator',
  ] as const;

  private readonly sessionService: LiveViewSessionService;

  constructor(sessionService: LiveViewSessionService) {
    super();
    this.sessionService = sessionService;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const url = this.str(input, 'url');
    const userId = this.str(input, 'userId');

    if (!url) return this.paramError('url');
    if (!userId) return this.paramError('userId');

    try {
      const sessionId = this.sessionService.resolveSessionId(this.str(input, 'sessionId'), userId);

      const result = await this.sessionService.navigate(sessionId, userId, url);

      logger.info('[NavigateLiveViewTool] Navigation complete', {
        sessionId,
        url: result.resolvedUrl,
        userId,
      });

      return {
        success: true,
        data: {
          navigatedTo: result.resolvedUrl,
          sessionId,
          message: `The live view browser has navigated to ${result.resolvedUrl}. The user can see the updated page in their side panel.`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to navigate live view';
      logger.error('[NavigateLiveViewTool] Navigation failed', {
        url,
        userId,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
