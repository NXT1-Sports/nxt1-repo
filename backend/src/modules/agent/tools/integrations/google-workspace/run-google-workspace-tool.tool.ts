import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { GoogleWorkspaceMcpSessionService } from './google-workspace-mcp-session.service.js';
import {
  describeAllowedGoogleWorkspaceTools,
  getGoogleWorkspaceToolMetadata,
  isGoogleWorkspaceAllowedToolName,
  truncateGoogleWorkspacePayload,
} from './shared.js';
import { z } from 'zod';

const RunGoogleWorkspaceToolInputSchema = z.object({
  toolName: z.string().trim().min(1),
  arguments: z.record(z.string(), z.unknown()).optional().default({}),
});

export class RunGoogleWorkspaceToolTool extends BaseTool {
  readonly name = 'run_google_workspace_tool';
  readonly description =
    'Execute an allowed Google Workspace MCP tool on behalf of the authenticated user. ' +
    'Always use list_google_workspace_tools first when you need the exact parameter schema. ' +
    describeAllowedGoogleWorkspaceTools();

  readonly parameters = RunGoogleWorkspaceToolInputSchema;

  readonly isMutation = true;
  readonly category = 'system' as const;

  readonly entityGroup = 'system_tools' as const;
  constructor(private readonly sessionService: GoogleWorkspaceMcpSessionService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = RunGoogleWorkspaceToolInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated user context is required.' };
    }

    const { toolName, arguments: args } = parsed.data;
    if (!isGoogleWorkspaceAllowedToolName(toolName)) {
      return {
        success: false,
        error:
          `Unsupported Google Workspace tool "${toolName}". ` +
          'Use list_google_workspace_tools to inspect the currently supported tool surface.',
      };
    }

    const metadata = getGoogleWorkspaceToolMetadata(toolName);

    context.emitStage?.(metadata.isMutation ? 'submitting_job' : 'fetching_data', {
      source: 'google_workspace',
      phase: metadata.isMutation ? 'execute_action' : 'read_data',
      service: metadata.service,
      toolName,
      icon: metadata.service === 'gmail' ? 'email' : 'document',
    });

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
