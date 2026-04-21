import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { GoogleWorkspaceMcpSessionService } from './google-workspace-mcp-session.service.js';
import {
  describeAllowedGoogleWorkspaceTools,
  getGoogleWorkspaceToolMetadata,
  isGoogleWorkspaceAllowedToolName,
  truncateGoogleWorkspacePayload,
} from './shared.js';

export class RunGoogleWorkspaceToolTool extends BaseTool {
  readonly name = 'run_google_workspace_tool';
  readonly description =
    'Execute an allowed Google Workspace MCP tool on behalf of the authenticated user. ' +
    'Always use list_google_workspace_tools first when you need the exact parameter schema. ' +
    describeAllowedGoogleWorkspaceTools();

  readonly parameters = {
    type: 'object',
    properties: {
      toolName: {
        type: 'string',
        description: 'The exact Google Workspace MCP tool name to execute.',
      },
      arguments: {
        type: 'object',
        description:
          'A JSON object that matches the selected Google Workspace MCP tool schema exactly.',
        additionalProperties: true,
      },
    },
    required: ['toolName'],
    additionalProperties: false,
  } as const;

  readonly isMutation = true;
  readonly category = 'system' as const;

  constructor(private readonly sessionService: GoogleWorkspaceMcpSessionService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    if (!context?.userId) {
      return { success: false, error: 'Authenticated user context is required.' };
    }

    const toolName = this.str(input, 'toolName');
    if (!toolName) return this.paramError('toolName');
    if (!isGoogleWorkspaceAllowedToolName(toolName)) {
      return {
        success: false,
        error:
          `Unsupported Google Workspace tool "${toolName}". ` +
          'Use list_google_workspace_tools to inspect the currently supported tool surface.',
      };
    }

    const args = this.obj(input, 'arguments') ?? {};
    const metadata = getGoogleWorkspaceToolMetadata(toolName);

    context.onProgress?.(
      metadata.isMutation
        ? `Executing Google ${metadata.service} action…`
        : `Reading from Google ${metadata.service}…`
    );

    try {
      const data = await this.sessionService.executeAllowedTool(toolName, args, context);
      return {
        success: true,
        data: {
          toolName,
          service: metadata.service,
          isMutation: metadata.isMutation,
          result: truncateGoogleWorkspacePayload(data),
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Google Workspace tool execution failed.';
      logger.error('[GoogleWorkspaceMCP] Tool execution failed', {
        userId: context.userId,
        sessionId: context.sessionId,
        toolName,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
