/**
 * @fileoverview Close Live View Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/firecrawl/browser
 *
 * Agent X tool that closes an active live-view browser session and cleans up
 * Firecrawl resources. Use when the user is done browsing or asks to close
 * the live view panel.
 */

import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../../base.tool.js';
import type { LiveViewSessionService } from './live-view-session.service.js';
import { logger } from '../../../../../../utils/logger.js';
import { z } from 'zod';

export class CloseLiveViewTool extends BaseTool {
  readonly name = 'close_live_view';

  readonly description =
    'Closes an active live-view browser session and cleans up resources. ' +
    'Use this when the user asks to close the live view, is done browsing, ' +
    'or when you want to free up the session after completing a task. ' +
    'The sessionId is optional — if omitted, the tool closes ALL active sessions for the user.';

  readonly parameters = z.object({
    sessionId: z.string().trim().min(1).optional(),
  });

  readonly isMutation = true;
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
    const sessionId = this.str(input, 'sessionId');

    if (!userId) return this.paramError('userId');

    try {
      if (sessionId) {
        // Try to close the specific session
        await this.sessionService.closeSession(sessionId, userId);
        logger.info('[CloseLiveViewTool] Session closed', { sessionId, userId });
        return {
          success: true,
          data: {
            sessionId,
            message: 'The live view session has been closed and resources cleaned up.',
          },
        };
      }

      // No sessionId provided — close ALL user sessions
      const closed = await this.sessionService.closeAllUserSessions(userId);
      logger.info('[CloseLiveViewTool] All user sessions closed', { userId, closed });
      return {
        success: true,
        data: {
          closed,
          message:
            closed > 0
              ? `Closed ${closed} live view session(s) and freed up resources.`
              : 'No active live view sessions found to close.',
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to close live view session';
      logger.error('[CloseLiveViewTool] Close failed', {
        sessionId,
        userId,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
