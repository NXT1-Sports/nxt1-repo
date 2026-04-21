import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { GoogleWorkspaceMcpSessionService } from './google-workspace-mcp-session.service.js';

export class ListGoogleWorkspaceToolsTool extends BaseTool {
  readonly name = 'list_google_workspace_tools';
  readonly description =
    'Lists the Google Workspace MCP tools currently available for the authenticated user, including their descriptions, input schemas, and whether each tool mutates data. ' +
    'Use this before executing a Google Workspace action when you need the exact tool name or parameter schema.';

  readonly parameters = {
    type: 'object',
    properties: {},
    additionalProperties: false,
  } as const;

  readonly isMutation = false;
  readonly category = 'system' as const;

  constructor(private readonly sessionService: GoogleWorkspaceMcpSessionService) {
    super();
  }

  async execute(
    _input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    if (!context?.userId) {
      return { success: false, error: 'Authenticated user context is required.' };
    }

    context.onProgress?.('Inspecting Google Workspace capabilities…');

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
