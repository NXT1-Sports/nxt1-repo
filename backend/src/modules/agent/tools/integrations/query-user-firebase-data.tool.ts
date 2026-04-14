import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import type { FirebaseMcpBridgeService } from './firebase-mcp-bridge.service.js';
import {
  FirebaseFiltersSchema,
  FirebaseViewNameSchema,
  MAX_FIREBASE_VIEW_LIMIT,
  type FirebaseMcpQueryInput,
} from './firebase-mcp/shared.js';
import { logger } from '../../../../utils/logger.js';

export class QueryNxt1DataTool extends BaseTool {
  readonly name = 'query_nxt1_data';
  readonly description =
    'Query named, read-only NXT1 data views scoped to the authenticated user and their accessible team and organization records. ' +
    'Use this instead of asking for raw database paths. Supported views include personal profile and performance data, team and organization snapshots, rosters, memberships, and highlight feeds.';

  readonly parameters = {
    type: 'object',
    properties: {
      view: {
        type: 'string',
        enum: [...FirebaseViewNameSchema.options],
        description:
          'Named NXT1 data view to query. Example: "user_profile_snapshot", "team_roster_members", or "organization_highlight_videos".',
      },
      filters: {
        type: 'object',
        description:
          'Optional view-specific filters. Examples: { sportId: "football" }, { category: "offer" }, { visibility: "public" }, { teamId: "team_123" }, { organizationId: "org_456" }.',
      },
      limit: {
        type: 'number',
        description: `Optional max rows to return. Hard-capped at ${MAX_FIREBASE_VIEW_LIMIT}.`,
      },
      cursor: {
        type: 'string',
        description: 'Optional pagination cursor returned by a previous query for the same view.',
      },
    },
    required: ['view'],
  } as const;

  override readonly allowedAgents = [
    'general',
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
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    if (!context?.userId) {
      return {
        success: false,
        error: 'Authenticated user context is required for NXT1 data queries.',
      };
    }

    const rawView = this.str(input, 'view');
    if (!rawView) return this.paramError('view');

    const parsedView = FirebaseViewNameSchema.safeParse(rawView);
    if (!parsedView.success) {
      return {
        success: false,
        error: `Parameter "view" must be one of: ${FirebaseViewNameSchema.options.join(', ')}.`,
      };
    }

    const rawFilters = this.obj(input, 'filters') ?? undefined;
    const filters = rawFilters ? FirebaseFiltersSchema.safeParse(rawFilters) : null;
    if (filters && !filters.success) {
      return {
        success: false,
        error:
          'Parameter "filters" must be an object whose values are strings, numbers, booleans, or arrays of strings.',
      };
    }

    const limit = this.num(input, 'limit') ?? undefined;
    const cursor = this.str(input, 'cursor') ?? undefined;
    const queryInput: FirebaseMcpQueryInput = {
      view: parsedView.data,
      ...(filters?.success ? { filters: filters.data } : {}),
      ...(typeof limit === 'number' ? { limit } : {}),
      ...(cursor ? { cursor } : {}),
    };

    try {
      context.onProgress?.('Preparing NXT1 data request…');
      const result = await this.bridge.queryView(queryInput, context);
      context.onProgress?.('Formatting NXT1 data results…');

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
