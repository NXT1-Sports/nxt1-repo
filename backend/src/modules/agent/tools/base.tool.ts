/**
 * @fileoverview Base Tool — Abstract Tool Interface
 * @module @nxt1/backend/modules/agent/tools
 *
 * Every tool the agent can invoke extends this base class.
 * Tools are single-purpose, stateless functions that:
 * 1. Accept validated JSON input (matching their schema).
 * 2. Perform one specific action (DB query, API call, file generation).
 * 3. Return a structured result the LLM can interpret.
 *
 * Tools do NOT hold state or call the LLM — that is the agent's job.
 *
 * @example
 * ```ts
 * export class FetchPlayerStatsTool extends BaseTool {
 *   readonly name = 'fetch_player_stats';
 *   readonly description = 'Retrieves verified stats for a player by userId and sport.';
 *   readonly parameters = { ... };  // JSON Schema
 *   readonly isMutation = false;
 *   readonly category = 'database';
 *
 *   async execute(input: { userId: string; sport: string }): Promise<ToolResult> {
 *     const stats = await this.db.getStats(input.userId, input.sport);
 *     return { success: true, data: stats };
 *   }
 * }
 * ```
 */

import type { AgentToolCategory, AgentIdentifier } from '@nxt1/core';

export interface ToolResult {
  readonly success: boolean;
  readonly data?: unknown;
  readonly error?: string;
}

export abstract class BaseTool {
  /** Unique tool name (snake_case). Used in LLM function-calling schemas. */
  abstract readonly name: string;

  /** Human-readable description. Sent to the LLM so it knows when to use this tool. */
  abstract readonly description: string;

  /** JSON Schema describing the tool's input parameters. */
  abstract readonly parameters: Record<string, unknown>;

  /** Whether this tool performs a write/mutation (triggers pre-tool guardrails). */
  abstract readonly isMutation: boolean;

  /** Logical category for organization and permissions. */
  abstract readonly category: AgentToolCategory;

  /** Which sub-agents are allowed to invoke this tool. '*' = all. */
  readonly allowedAgents: readonly (AgentIdentifier | '*')[] = ['*'];

  /** Execute the tool with validated input. */
  abstract execute(input: Record<string, unknown>): Promise<ToolResult>;
}
