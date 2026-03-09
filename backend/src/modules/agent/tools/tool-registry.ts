/**
 * @fileoverview Tool Registry
 * @module @nxt1/backend/modules/agent/tools
 *
 * Central registry of all tools available to Agent X.
 *
 * Responsibilities:
 * - Holds a map of tool name → BaseTool instance.
 * - Converts tools into OpenAI/OpenRouter function-calling schema format.
 * - Filters tools by sub-agent permissions.
 * - Validates tool input before execution.
 *
 * New tools are registered here at startup. When you want Agent X to support
 * a new action, you create a tool class and register it — no other changes needed.
 *
 * @example
 * ```ts
 * const registry = new ToolRegistry();
 * registry.register(new FetchPlayerStatsTool(db));
 * registry.register(new SendEmailTool(emailService));
 *
 * // Get OpenRouter-compatible schemas for a specific agent:
 * const schemas = registry.getSchemasForAgent('scout');
 *
 * // Execute a tool call from the LLM:
 * const result = await registry.execute('fetch_player_stats', { userId: '123' });
 * ```
 */

import type { AgentIdentifier, AgentToolDefinition } from '@nxt1/core';
import type { BaseTool, ToolResult } from './base.tool.js';

export class ToolRegistry {
  private readonly tools = new Map<string, BaseTool>();

  /** Register a tool instance. Throws if a tool with the same name already exists. */
  register(tool: BaseTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  /** Get a tool by name. */
  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /** Return all registered tool names. */
  listNames(): readonly string[] {
    return [...this.tools.keys()];
  }

  /**
   * Convert all tools (or a filtered subset) into the AgentToolDefinition
   * format that can be sent to OpenRouter as function-calling schemas.
   */
  getDefinitions(agentId?: AgentIdentifier): readonly AgentToolDefinition[] {
    const definitions: AgentToolDefinition[] = [];

    for (const tool of this.tools.values()) {
      const allowed =
        !agentId || tool.allowedAgents.includes('*') || tool.allowedAgents.includes(agentId);

      if (allowed) {
        definitions.push({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          allowedAgents: tool.allowedAgents,
          isMutation: tool.isMutation,
          category: tool.category,
        });
      }
    }

    return definitions;
  }

  /** Execute a tool by name with the given input. */
  async execute(name: string, input: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }
    return tool.execute(input);
  }
}
