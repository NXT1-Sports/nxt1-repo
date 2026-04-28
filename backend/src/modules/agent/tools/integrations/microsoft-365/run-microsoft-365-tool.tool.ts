import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { Microsoft365McpSessionService } from './microsoft-365-mcp-session.service.js';
import { truncateMicrosoft365Payload } from './shared.js';
import { z } from 'zod';

const RunMicrosoft365ToolInputSchema = z.object({
  toolName: z.string().trim().min(1),
  arguments: z.record(z.string(), z.unknown()).optional().default({}),
});

export class RunMicrosoft365ToolTool extends BaseTool {
  readonly name = 'run_microsoft_365_tool';
  readonly description =
    'Execute a Microsoft 365 MCP tool for the authenticated user. Always use list_microsoft_365_tools first when you need exact tool names or parameter schemas.';

  readonly parameters = RunMicrosoft365ToolInputSchema;

  readonly isMutation = true;
  readonly category = 'system' as const;

  readonly entityGroup = 'system_tools' as const;

  constructor(private readonly sessionService: Microsoft365McpSessionService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = RunMicrosoft365ToolInputSchema.safeParse(input);
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

    try {
      const data = await this.sessionService.executeAllowedTool(toolName, args, context);
      return {
        success: true,
        data: {
          toolName,
          result: truncateMicrosoft365Payload(data),
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Microsoft 365 tool execution failed.';
      logger.error('[Microsoft365MCP] Tool execution failed', {
        userId: context.userId,
        sessionId: context.sessionId,
        toolName,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
