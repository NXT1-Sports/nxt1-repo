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
 * const schemas = registry.getSchemasForAgent('performance_coordinator');
 *
 * // Execute a tool call from the LLM:
 * const result = await registry.execute('fetch_player_stats', { userId: '123' });
 * ```
 */

import type { AgentIdentifier, AgentToolDefinition } from '@nxt1/core';
import type { BaseTool, ToolResult } from './base.tool.js';

export class ToolRegistry {
  private readonly tools = new Map<string, BaseTool>();

  /**
   * Minimum cosine similarity score required for a tool to be selected.
   * Tune this up to make tool loading stricter, down to make it looser.
   */
  static readonly DEFAULT_TOOL_THRESHOLD = 0.35;

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

  /**
   * Evaluate which tools match the current user intent based on semantic similarity.
   * This prevents injecting irrelevant tools into the LLM context.
   */
  async match(
    intentVector: readonly number[],
    embedFn: (text: string) => Promise<readonly number[]>,
    agentId?: AgentIdentifier,
    threshold: number = ToolRegistry.DEFAULT_TOOL_THRESHOLD
  ): Promise<readonly AgentToolDefinition[]> {
    // Filter first by permissions
    const allowedTools = Array.from(this.tools.values()).filter(
      (tool) => !agentId || tool.allowedAgents.includes('*') || tool.allowedAgents.includes(agentId)
    );

    // Compute cosine similarity for all allowed tools
    type ScoredTool = { tool: BaseTool; score: number };
    const scoredTools: ScoredTool[] = [];

    // Parallel embedding cache check & matching
    await Promise.all(
      allowedTools.map(async (tool) => {
        try {
          const score = await tool.matchIntent(intentVector, embedFn);
          if (score >= threshold) {
            scoredTools.push({ tool, score });
          }
        } catch (err) {
          // Log issue, but don't blow up the entire RAG pipeline
          // You can use proper logger if you inject it into ToolRegistry
          console.warn(`[ToolRegistry] Failed to match intent for tool \${tool.name}`, err);
        }
      })
    );

    // Sort descending by relevance
    scoredTools.sort((a, b) => b.score - a.score);

    return scoredTools.map(({ tool }) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      allowedAgents: tool.allowedAgents,
      isMutation: tool.isMutation,
      category: tool.category,
    }));
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
