/**
 * @fileoverview Base Agent — Abstract Sub-Agent
 * @module @nxt1/backend/modules/agent/agents
 *
 * Every specialized sub-agent (Scout, Recruiter, Creative Director, etc.)
 * extends this base class. It provides the standard ReAct execution loop:
 *
 *   System prompt → LLM call → Tool call (if requested) → Observation → Loop
 *
 * Sub-agents override:
 * - `systemPrompt` — The agent's persona and domain instructions.
 * - `availableTools` — Array of tool names this agent is allowed to use.
 * - `modelRouting` — Default model tier for this agent's tasks.
 */

import type {
  AgentIdentifier,
  AgentToolDefinition,
  AgentSessionContext,
  AgentOperationResult,
  ModelRoutingConfig,
} from '@nxt1/core';

export abstract class BaseAgent {
  abstract readonly id: AgentIdentifier;
  abstract readonly name: string;

  /** The persona / system prompt for this sub-agent. */
  abstract getSystemPrompt(context: AgentSessionContext): string;

  /** Tool names this agent is allowed to invoke. */
  abstract getAvailableTools(): readonly string[];

  /** Default model routing for this agent. */
  abstract getModelRouting(): ModelRoutingConfig;

  /**
   * Execute the agent's ReAct loop for a given user intent.
   * The base implementation will be filled in during the implementation phase.
   */
  async execute(
    _intent: string,
    _context: AgentSessionContext,
    _tools: readonly AgentToolDefinition[]
  ): Promise<AgentOperationResult> {
    throw new Error(`${this.name}.execute() not implemented`);
  }
}
