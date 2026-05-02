/**
 * @fileoverview Interact With Live View Tool
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Agent X tool that executes browser interactions in an active live-view
 * session using Firecrawl's native AI-driven prompt system. Instead of
 * specifying CSS selectors, describe what you want to do in plain English
 * and Firecrawl's AI will find elements and interact with them automatically.
 *
 * All actions execute in the SAME browser the user sees in their command
 * center iframe.
 */

import { BaseTool, type ToolResult } from '../../../base.tool.js';
import type { LiveViewSessionService } from './live-view-session.service.js';
import { logger } from '../../../../../../utils/logger.js';
import { z } from 'zod';

export class InteractWithLiveViewTool extends BaseTool {
  readonly name = 'interact_with_live_view';

  readonly description =
    'Performs browser interactions in the active live-view session using natural language. ' +
    'Describe what you want to do in plain English (e.g. "Click the Continue with Google button", ' +
    '"Type test@example.com into the email field and click Sign In", "Scroll down to the stats section"). ' +
    "Firecrawl's AI automatically finds elements and interacts with them — no CSS selectors needed. " +
    'The user watches the actions happen in real time in their side panel. ' +
    'Use this whenever the user wants actions performed in the page that is already open in live view. ' +
    "The sessionId is optional — if omitted, the tool automatically finds the user's active session. " +
    'Approval-sensitive actions are evaluated centrally by the agent approval gate before this tool executes. ' +
    'For legacy callers outside the approval-aware runtime, destructive actions still require confirmed: true as a safety fallback.';

  readonly parameters = z.object({
    sessionId: z.string().trim().min(1).optional(),
    prompt: z.string().trim().min(1),
    userId: z.string().trim().min(1),
    confirmed: z.boolean().optional(),
  });

  readonly isMutation = true;
  readonly category = 'system' as const;

  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = ['*'] as const;

  private readonly sessionService: LiveViewSessionService;

  /** Final safety net for non-agent-runtime callers that bypass ApprovalGateService. */
  private static readonly DESTRUCTIVE_KEYWORDS =
    /\b(submit|send|confirm|purchase|buy|place\s+order|delete|remove|pay|checkout|sign\s+up|register|apply|publish|post|transfer|authorize|approve)\b/i;

  constructor(sessionService: LiveViewSessionService) {
    super();
    this.sessionService = sessionService;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const userId = this.str(input, 'userId');
    const prompt = this.str(input, 'prompt');
    const confirmed = input['confirmed'] === true;

    if (!userId) return this.paramError('userId');
    if (!prompt) return this.paramError('prompt');

    if (!confirmed && InteractWithLiveViewTool.DESTRUCTIVE_KEYWORDS.test(prompt)) {
      const matchedWord =
        prompt.match(InteractWithLiveViewTool.DESTRUCTIVE_KEYWORDS)?.[0] ?? 'this action';
      logger.info('[InteractWithLiveViewTool] Destructive action requires confirmation', {
        userId,
        matchedWord,
        prompt: prompt.slice(0, 200),
      });
      return {
        success: true,
        data: {
          requiresConfirmation: true,
          action: matchedWord,
          prompt,
          message:
            `This action involves "${matchedWord}" which could be irreversible. ` +
            'Ask the user to confirm before re-running with confirmed: true.',
        },
      };
    }

    let sessionId: string;
    try {
      sessionId = this.sessionService.resolveSessionId(this.str(input, 'sessionId'), userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No active live view session';
      return { success: false, error: message };
    }

    try {
      const result = await this.sessionService.executePrompt(sessionId, userId, prompt);

      logger.info('[InteractWithLiveViewTool] Prompt executed', {
        sessionId,
        userId,
        success: result.success,
        outputLength: result.output.length,
      });

      return {
        success: result.success,
        data: {
          sessionId,
          output: result.output,
          message: result.success
            ? `Interaction completed. The user can see the changes in their live view panel. Firecrawl AI response: ${result.output}`
            : `Interaction failed: ${result.output}`,
        },
        ...(result.success ? {} : { error: result.output }),
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to execute interaction in live view';
      logger.error('[InteractWithLiveViewTool] Execution failed', {
        sessionId,
        userId,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
