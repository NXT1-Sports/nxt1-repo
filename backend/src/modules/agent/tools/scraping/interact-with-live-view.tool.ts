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
 * center iframe — unlike `interact_with_webpage` which spins up an
 * independent ephemeral browser.
 */

import { BaseTool, type ToolResult } from '../base.tool.js';
import type { LiveViewSessionService } from './live-view-session.service.js';
import { logger } from '../../../../utils/logger.js';

export class InteractWithLiveViewTool extends BaseTool {
  readonly name = 'interact_with_live_view';

  readonly description =
    'Performs browser interactions in the active live-view session using natural language. ' +
    'Describe what you want to do in plain English (e.g. "Click the Continue with Google button", ' +
    '"Type test@example.com into the email field and click Sign In", "Scroll down to the stats section"). ' +
    "Firecrawl's AI automatically finds elements and interacts with them — no CSS selectors needed. " +
    'The user watches the actions happen in real time in their side panel. ' +
    'Use this INSTEAD of interact_with_webpage when a live view session is already open. ' +
    "The sessionId is optional — if omitted, the tool automatically finds the user's active session. " +
    'IMPORTANT: For destructive actions (submit, send, purchase, delete, confirm, etc.), you MUST first ask the user for confirmation ' +
    'and then call this tool again with confirmed: true. The tool will reject unconfirmed destructive actions.';

  readonly parameters = {
    type: 'object' as const,
    properties: {
      sessionId: {
        type: 'string',
        description:
          "Optional. The sessionId returned by open_live_view. If omitted, the tool automatically uses the user's current active session.",
      },
      prompt: {
        type: 'string',
        description:
          'A natural language description of what to do in the browser. Be specific and descriptive. ' +
          'Examples: "Click the Log In button", "Type john@example.com into the email field", ' +
          '"Scroll down to find the highlight reel section", "Click Continue with Google, then wait for the page to load". ' +
          'You can describe multi-step sequences in a single prompt.',
      },
      userId: {
        type: 'string',
        description:
          "The authenticated user's ID (uid). Extract from the [User Profile] context — NEVER ask the user.",
      },
      confirmed: {
        type: 'boolean',
        description:
          'Set to true ONLY after you have explicitly asked the user for confirmation and they agreed. ' +
          'Required for destructive or irreversible actions (submit, send, purchase, delete, confirm, place order, etc.). ' +
          'If the action is destructive and confirmed is not true, the tool will reject the call and ask you to confirm with the user first.',
      },
    },
    required: ['prompt', 'userId'],
  };

  readonly isMutation = true;
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

  /** Words in the prompt that indicate a destructive/irreversible action. */
  private static readonly DESTRUCTIVE_KEYWORDS =
    /\b(submit|send|confirm|purchase|buy|place\s+order|delete|remove|pay|checkout|sign\s+up|register|apply|publish|post|transfer|authorize|approve)\b/i;

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const userId = this.str(input, 'userId');
    const prompt = this.str(input, 'prompt');
    const confirmed = input['confirmed'] === true;

    if (!userId) return this.paramError('userId');
    if (!prompt) return this.paramError('prompt');

    // Guard: require explicit user confirmation for destructive actions
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
            'You MUST ask the user if they want to proceed before calling this tool again with confirmed: true. ' +
            'Describe exactly what will happen and wait for their explicit approval.',
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
