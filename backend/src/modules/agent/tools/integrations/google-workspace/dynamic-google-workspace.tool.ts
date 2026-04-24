import type { AgentIdentifier } from '@nxt1/core';
import { GoogleWorkspaceBaseTool } from './google-workspace-base.tool.js';
import type { GoogleWorkspaceMcpSessionService } from './google-workspace-mcp-session.service.js';
import type { GoogleWorkspaceDiscoveredToolDefinition } from './shared.js';
import { z } from 'zod';

export class DynamicGoogleWorkspaceTool extends GoogleWorkspaceBaseTool {
  readonly name: string;
  readonly mcpToolName: string;
  readonly description: string;
  readonly parameters = z.object({}).passthrough();
  readonly isMutation: boolean;
  readonly category;
  override readonly allowedAgents: readonly (AgentIdentifier | '*')[];

  constructor(
    sessionService: GoogleWorkspaceMcpSessionService,
    definition: GoogleWorkspaceDiscoveredToolDefinition,
    allowedAgents: readonly (AgentIdentifier | '*')[] = ['strategy_coordinator']
  ) {
    super(sessionService);
    this.name = definition.name;
    this.mcpToolName = definition.name;
    this.description = definition.description ?? definition.summary;
    this.isMutation = definition.isMutation;
    this.category = definition.category;
    this.allowedAgents = allowedAgents;
  }
}
