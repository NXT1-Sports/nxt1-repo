/**
 * @fileoverview Get Recent Sync Summaries Tool
 * @module @nxt1/backend/modules/agent/tools/analytics
 *
 * Read recent deterministic sync/diff summaries on demand instead of preloading
 * them into every agent run.
 */

import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import {
  SyncDeltaEventService,
  getSyncDeltaEventService,
} from '../../../../services/core/sync-delta-event.service.js';
import { z } from 'zod';

const GetRecentSyncSummariesInputSchema = z.object({
  userId: z.string().trim().min(1),
  teamId: z.string().trim().min(1).optional(),
  organizationId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

export class GetRecentSyncSummariesTool extends BaseTool {
  readonly name = 'get_recent_sync_summaries';
  readonly description =
    'Retrieve recent sync/diff summaries for a user, team, or organization on demand. ' +
    'Use this when you need to understand what changed recently before answering or taking action.';

  readonly parameters = GetRecentSyncSummariesInputSchema;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'analytics' as const;

  readonly entityGroup = 'platform_tools' as const;

  constructor(
    private readonly syncDeltaEvents: SyncDeltaEventService = getSyncDeltaEventService()
  ) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    _context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = GetRecentSyncSummariesInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const summaries = await this.syncDeltaEvents.listRecentSummaries(parsed.data);

    return {
      success: true,
      data: {
        summaries,
        count: summaries.length,
      },
      markdown:
        summaries.length > 0
          ? ['## Recent Sync Summaries', '', ...summaries.map((summary) => `- ${summary}`)].join(
              '\n'
            )
          : '## Recent Sync Summaries\n\n- No recent sync activity found.',
    };
  }
}
