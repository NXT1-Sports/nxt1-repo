/**
 * @fileoverview Get Active Threads Tool — Lazy Cross-Thread Awareness
 * @module @nxt1/backend/modules/agent/tools/context
 *
 * On-demand summary of the user's recent active conversations. Useful when
 * the user references "the other thread" or asks the Primary Agent to merge
 * context across conversations. Never pre-loaded.
 */

import { z } from 'zod';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import type { ContextBuilder } from '../../memory/context-builder.js';

const InputSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  maxThreads: z.coerce.number().int().min(1).max(20).optional(),
});

export class GetActiveThreadsTool extends BaseTool {
  readonly name = 'get_active_threads';
  readonly description =
    'List the user’s recent active conversation threads with brief summaries. ' +
    'Use this only when the user references work happening in another thread or ' +
    'asks you to merge cross-thread context.';

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

    const userId = parsed.data.userId ?? context?.userId;
    if (!userId) {
      return { success: false, error: 'userId is required (none in input or execution context)' };
    }

    const maxThreads = parsed.data.maxThreads ?? 5;
    const summary = await this.contextBuilder.getActiveThreadsSummary(userId, maxThreads);

    return {
      success: true,
      data: { summary, maxThreads },
      markdown:
        summary && summary.trim().length > 0
          ? summary
          : '## Active Threads\n\n- No other active threads.',
    };
  }
}
