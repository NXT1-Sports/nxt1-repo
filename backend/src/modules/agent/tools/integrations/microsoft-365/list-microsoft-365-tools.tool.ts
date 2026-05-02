import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { Microsoft365McpSessionService } from './microsoft-365-mcp-session.service.js';
import { z } from 'zod';

const ListMicrosoft365ToolsInputSchema = z.object({}).strict();

export class ListMicrosoft365ToolsTool extends BaseTool {
  readonly name = 'list_microsoft_365_tools';
  readonly description =
    'Lists Microsoft 365 MCP tools currently available for the authenticated user, including names, descriptions, schemas, and mutation flags. Use before execution when exact tool names are unknown.';

  readonly parameters = ListMicrosoft365ToolsInputSchema;

  readonly isMutation = false;
  readonly category = 'system' as const;

  readonly entityGroup = 'system_tools' as const;

  constructor(private readonly sessionService: Microsoft365McpSessionService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ListMicrosoft365ToolsInputSchema.safeParse(input);
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
      source: 'microsoft_365',
      phase: 'inspect_tools',
      icon: 'document',
    });

    try {
      const tools = await this.sessionService.listAvailableTools(context);
      return {
        success: true,
        data: {
          count: tools.length,
          tools,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to list Microsoft 365 tools.';
      logger.error('[Microsoft365MCP] Failed to list tools', {
        userId: context.userId,
        sessionId: context.sessionId,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
