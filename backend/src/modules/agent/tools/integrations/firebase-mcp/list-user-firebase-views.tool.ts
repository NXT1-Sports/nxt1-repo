import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import type { FirebaseMcpBridgeService } from './firebase-mcp-bridge.service.js';
import { z } from 'zod';
import { logger } from '../../../../../utils/logger.js';

const ListNxt1DataViewsInputSchema = z.object({});

export class ListNxt1DataViewsTool extends BaseTool {
  readonly name = 'list_nxt1_data_views';
  readonly description =
    'List the named, read-only NXT1 data views available for the current account, team, and organization scope. ' +
    'Use this before querying when you need to understand which data surfaces and accessible scopes are available.';

  readonly parameters = ListNxt1DataViewsInputSchema;

  override readonly allowedAgents = [
    'strategy_coordinator',
    'data_coordinator',
    'performance_coordinator',
    'recruiting_coordinator',
  ] as const;

  readonly isMutation = false;
  readonly category = 'database' as const;

  constructor(private readonly bridge: FirebaseMcpBridgeService) {
    super();
  }

  async execute(
    _input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    if (!context?.userId) {
      return {
        success: false,
        error: 'Authenticated user context is required to list NXT1 data views.',
      };
    }

    try {
      const result = await this.bridge.listViews(context);
      context.emitStage?.('fetching_data', {
        source: 'firebase_mcp',
        phase: 'prepare_views',
        icon: 'database',
      });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list NXT1 data views';
      logger.error('[FirebaseMCP] list_nxt1_data_views failed', {
        userId: context.userId,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
