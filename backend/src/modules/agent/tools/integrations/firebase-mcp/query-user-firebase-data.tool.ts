import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import type { FirebaseMcpBridgeService } from './firebase-mcp-bridge.service.js';
import { FirebaseMcpQueryInputSchema, type FirebaseMcpQueryInput } from './shared.js';
import { logger } from '../../../../../utils/logger.js';

export class QueryNxt1DataTool extends BaseTool {
  readonly name = 'query_nxt1_data';
  readonly description =
    'Query named, read-only NXT1 data views scoped to the authenticated user and their accessible team and organization records. ' +
    'Use this instead of asking for raw database paths. Supported views include personal profile and performance data, team and organization snapshots, rosters, memberships, and highlight feeds.';

  readonly parameters = FirebaseMcpQueryInputSchema;

  override readonly allowedAgents = ['*'] as const;

  readonly isMutation = false;
  readonly category = 'system' as const;

  readonly entityGroup = 'platform_tools' as const;
  constructor(private readonly bridge: FirebaseMcpBridgeService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    if (!context?.userId) {
      return {
        success: false,
        error: 'Authenticated user context is required for NXT1 data queries.',
      };
    }

    const parsedInput = FirebaseMcpQueryInputSchema.safeParse(input);
    if (!parsedInput.success) {
      return {
        success: false,
        error: parsedInput.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const queryInput: FirebaseMcpQueryInput = parsedInput.data;

    try {
      context.emitStage?.('fetching_data', {
        icon: 'database',
        view: queryInput.view,
        phase: 'prepare_request',
      });
      const result = await this.bridge.queryView(queryInput, context);
      context.emitStage?.('persisting_result', {
        icon: 'database',
        view: queryInput.view,
        phase: 'format_results',
      });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'NXT1 data query failed';
      logger.error('[FirebaseMCP] query_nxt1_data failed', {
        view: queryInput.view,
        userId: context.userId,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
