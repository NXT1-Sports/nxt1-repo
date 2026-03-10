/**
 * @fileoverview Base Agent — Abstract Sub-Agent with ReAct Loop
 * @module @nxt1/backend/modules/agent/agents
 *
 * Every specialized coordinator (Performance, Recruiting, Brand & Media, etc.)
 * extends this base class. It provides the standard ReAct execution loop:
 *
 *   System prompt → LLM call → Tool call (if requested) → Observation → Loop
 *
 * Sub-agents override:
 * - `getSystemPrompt()` — The agent's persona and domain instructions.
 * - `getAvailableTools()` — Array of tool names this agent is allowed to use.
 * - `getModelRouting()` — Default model tier for this agent's tasks.
 *
 * The ReAct loop is capped at MAX_ITERATIONS to prevent runaway execution.
 */

import type {
  AgentIdentifier,
  AgentToolDefinition,
  AgentSessionContext,
  AgentOperationResult,
  ModelRoutingConfig,
} from '@nxt1/core';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { GuardrailRunner } from '../guardrails/guardrail-runner.js';
import type { LLMMessage, LLMToolSchema, LLMToolCall } from '../llm/llm.types.js';

/** Maximum tool-calling iterations before we force the agent to respond. */
const MAX_ITERATIONS = 10;

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
   *
   * Flow:
   *   1. Build system prompt + inject tool schemas.
   *   2. Call LLM with conversation history.
   *   3. If LLM requests tool calls → execute them → feed observations back.
   *   4. Repeat until LLM responds with text (no more tool calls) or MAX_ITERATIONS.
   *   5. Return the final text as the operation result.
   */
  async execute(
    intent: string,
    context: AgentSessionContext,
    _toolDefinitions: readonly AgentToolDefinition[],
    llm?: OpenRouterService,
    toolRegistry?: ToolRegistry,
    guardrailRunner?: GuardrailRunner
  ): Promise<AgentOperationResult> {
    if (!llm || !toolRegistry) {
      throw new Error(
        `${this.name}.execute() requires llm and toolRegistry. ` + `Pass them from the AgentRouter.`
      );
    }

    const routing = this.getModelRouting();
    const allowedToolNames = this.getAvailableTools();

    // Build LLM tool schemas from the registry (filtered to this agent's permissions)
    const toolSchemas: LLMToolSchema[] = toolRegistry
      .getDefinitions(this.id)
      .filter((def) => allowedToolNames.length === 0 || allowedToolNames.includes(def.name))
      .map((def) => ({
        type: 'function' as const,
        function: {
          name: def.name,
          description: def.description,
          parameters: def.parameters,
        },
      }));

    // Build initial conversation
    const messages: LLMMessage[] = [
      { role: 'system', content: this.getSystemPrompt(context) },
      { role: 'user', content: intent },
    ];

    // ── ReAct Loop ────────────────────────────────────────────────────────

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const result = await llm.complete(messages, {
        tier: routing.tier,
        maxTokens: routing.maxTokens,
        temperature: routing.temperature,
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
      });

      // If the LLM responded with text and no tool calls → we're done
      if (result.toolCalls.length === 0) {
        return {
          summary: result.content ?? 'Task completed.',
          data: { model: result.model, usage: result.usage },
          suggestions: [],
        };
      }

      // Append the assistant message with its tool calls to the conversation
      messages.push({
        role: 'assistant',
        content: result.content,
        tool_calls: result.toolCalls,
      });

      // Execute each requested tool and feed observations back
      for (const toolCall of result.toolCalls) {
        const observation = await this.executeTool(
          toolCall,
          toolRegistry,
          context.userId,
          guardrailRunner
        );
        messages.push({
          role: 'tool',
          content: observation,
          tool_call_id: toolCall.id,
        });
      }
    }

    // If we exhausted iterations, return what we have
    return {
      summary:
        'The agent reached its maximum iteration limit. ' +
        'The task may be too complex for a single pass.',
      data: { maxIterationsReached: true },
      suggestions: ['Try breaking the request into smaller tasks.'],
    };
  }

  // ─── Tool Execution ─────────────────────────────────────────────────────

  /**
   * Execute a single tool call and return the observation string
   * for the LLM to consume.
   */
  private async executeTool(
    toolCall: LLMToolCall,
    registry: ToolRegistry,
    userId: string,
    guardrailRunner?: GuardrailRunner
  ): Promise<string> {
    const toolName = toolCall.function.name;

    // Re-check permissions: ensure the LLM isn't calling a tool outside its allowlist
    const allowedToolNames = this.getAvailableTools();
    if (allowedToolNames.length > 0 && !allowedToolNames.includes(toolName)) {
      return JSON.stringify({
        error: `Tool "${toolName}" is not allowed for agent "${this.id}".`,
      });
    }

    let input: Record<string, unknown>;
    try {
      input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    } catch {
      return JSON.stringify({
        error: `Invalid JSON arguments for tool "${toolName}".`,
      });
    }

    // Run pre-tool guardrails (if any are registered)
    if (guardrailRunner) {
      const verdicts = await guardrailRunner.runPreTool({
        userId,
        toolName,
        toolInput: input,
      });
      const blocked = verdicts.find((v) => !v.passed && v.severity === 'block');
      if (blocked) {
        return JSON.stringify({
          error: `Blocked by guardrail "${blocked.guardrailName}": ${blocked.reason}`,
          suggestion: blocked.suggestion,
        });
      }
    }

    const result = await registry.execute(toolName, input);

    return JSON.stringify(
      result.success
        ? { success: true, data: result.data }
        : { success: false, error: result.error }
    );
  }
}
