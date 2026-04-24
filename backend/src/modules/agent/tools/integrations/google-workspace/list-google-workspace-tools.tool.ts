import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { GoogleWorkspaceMcpSessionService } from './google-workspace-mcp-session.service.js';
import { z } from 'zod';

const ListGoogleWorkspaceToolsInputSchema = z.object({}).strict();

export class ListGoogleWorkspaceToolsTool extends BaseTool {
  readonly name = 'list_google_workspace_tools';
  readonly description =
    'Lists the Google Workspace MCP tools currently available for the authenticated user, including their descriptions, input schemas, and whether each tool mutates data. ' +
    'Use this before executing a Google Workspace action when you need the exact tool name or parameter schema.';

  readonly parameters = ListGoogleWorkspaceToolsInputSchema;

  readonly isMutation = false;
  readonly category = 'system' as const;

  readonly entityGroup = 'system_tools' as const;
  constructor(private readonly sessionService: GoogleWorkspaceMcpSessionService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ListGoogleWorkspaceToolsInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated user context is required.' };
    }

    context.emitStage?.('fetching_data', {
      source: 'google_workspace',
      phase: 'inspect_tools',
      icon: 'document',
    });

    try {
      const tools = await this.sessionService.listAllowedTools(context);
      return {
        success: true,
        data: {
          count: tools.length,
          tools,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to list Google Workspace tools.';
      logger.error('[GoogleWorkspaceMCP] Failed to list tools', {
        userId: context.userId,
        sessionId: context.sessionId,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
