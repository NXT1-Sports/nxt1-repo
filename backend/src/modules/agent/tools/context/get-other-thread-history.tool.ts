/**
 * @fileoverview Get Other Thread History Tool — Lazy Cross-Thread Recall
 * @module @nxt1/backend/modules/agent/tools/context
 *
 * Pulls the recent message history of a *different* thread (not the current one).
 * The current thread's last N turns are ALWAYS in the Primary Agent's
 * messages[] (Tier A non-negotiable), so this tool is strictly for cross-thread
 * recall when the user explicitly references another conversation.
 */

import { z } from 'zod';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import type { ContextBuilder } from '../../memory/context-builder.js';

const InputSchema = z.object({
  threadId: z.string().trim().min(1),
  maxMessages: z.coerce.number().int().min(1).max(50).optional(),
});

export class GetOtherThreadHistoryTool extends BaseTool {
  readonly name = 'get_other_thread_history';
  readonly description =
    'Read the recent message history of ANOTHER thread (not the current one). ' +
    'Use this when the user references a different conversation. The current ' +
    'thread’s history is already in your context — never call this for the current threadId.';

  readonly parameters = InputSchema;
  readonly isMutation = false;
  readonly category = 'analytics' as const;
  readonly entityGroup = 'platform_tools' as const;

  override readonly allowedAgents = ['*'] as const;

  constructor(private readonly contextBuilder: ContextBuilder) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { threadId } = parsed.data;
    const maxMessages = parsed.data.maxMessages ?? 20;

    if (context?.threadId && context.threadId === threadId) {
      return {
        success: false,
        error:
          'Refusing to read the current thread’s history. The current thread is already in your context window.',
      };
    }

    const transcript = await this.contextBuilder.getRecentThreadHistory(threadId, maxMessages);

    return {
      success: true,
      data: { threadId, transcript, maxMessages },
      markdown:
        transcript && transcript.trim().length > 0
          ? `## Thread \`${threadId}\` — Recent History\n\n${transcript}`
          : `## Thread \`${threadId}\`\n\n- No recent messages found.`,
    };
  }
}
