/**
 * @fileoverview Google Workspace Base Tool — Abstract Foundation
 * @module @nxt1/backend/modules/agent/tools/integrations/google-workspace
 *
 * All first-class Google Workspace tools extend this base class.
 * It handles MCP session delegation, error logging, progress reporting,
 * and payload truncation — so each concrete tool only needs to declare
 * its name, description, JSON Schema parameters, and mutation flag.
 */

import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import { GoogleWorkspaceMcpSessionService } from './google-workspace-mcp-session.service.js';
import { getGoogleWorkspaceToolMetadata, truncateGoogleWorkspacePayload } from './shared.js';

export abstract class GoogleWorkspaceBaseTool extends BaseTool {
  /** The exact MCP tool name to invoke on the Google Workspace MCP server. */
  abstract readonly mcpToolName: string;

  constructor(protected readonly sessionService: GoogleWorkspaceMcpSessionService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    if (!context?.userId) {
      return { success: false, error: 'Authenticated user context is required.' };
    }

    const metadata = getGoogleWorkspaceToolMetadata(this.mcpToolName);
    context.onProgress?.(
      metadata.isMutation
        ? `Executing Google ${metadata.service} action…`
        : `Reading from Google ${metadata.service}…`
    );

    try {
      const data = await this.sessionService.executeAllowedTool(this.mcpToolName, input, context);
      return {
        success: true,
        data: truncateGoogleWorkspacePayload(data),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Google ${metadata.service} operation failed.`;
      logger.error(`[GoogleWorkspace:${this.mcpToolName}] Execution failed`, {
        userId: context.userId,
        sessionId: context.sessionId,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
