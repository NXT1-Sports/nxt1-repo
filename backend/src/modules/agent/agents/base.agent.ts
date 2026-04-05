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
import type { SkillRegistry } from '../skills/skill-registry.js';
import { isAgentYield } from '../errors/agent-yield.error.js';
import { ASK_USER_CONTEXT_KEY, type AskUserToolContext } from '../tools/comms/ask-user.tool.js';
import { logger } from '../../../utils/logger.js';

/** Maximum tool-calling iterations before we force the agent to respond. */
const MAX_ITERATIONS = 20;

/**
 * Maximum characters for a single tool observation fed back to the LLM.
 * Prevents context overflow when scrape results are very large.
 */
const MAX_OBSERVATION_LENGTH = 8_000;

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
   * Skill names this agent is allowed to dynamically load.
   * Return an empty array if the agent does not use skills.
   * At runtime, skills are semantically matched against the user intent
   * and only relevant ones are injected into the system prompt.
   */
  getSkills(): readonly string[] {
    return [];
  }

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
    guardrailRunner?: GuardrailRunner,
    skillRegistry?: SkillRegistry
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

    // ── Dynamic Skill Loading ───────────────────────────────────────────
    let skillBlock = '';
    const allowedSkillNames = this.getSkills();
    if (skillRegistry && allowedSkillNames.length > 0) {
      try {
        const intentEmbedding = await llm.embed(intent);
        const matched = await skillRegistry.match(
          intentEmbedding,
          (text) => llm.embed(text),
          allowedSkillNames
        );
        if (matched.length > 0) {
          skillBlock = skillRegistry.buildPromptBlock(matched);
          logger.info(`[${this.id}] Injected ${matched.length} skill(s) into prompt`, {
            agentId: this.id,
            skills: matched.map((m) => m.skill.name),
          });
        }
      } catch (err) {
        // Skill loading is best-effort — agent can still function without skills
        logger.warn(`[${this.id}] Skill loading failed — proceeding without skills`, {
          agentId: this.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Build initial conversation (with optional skill injection)
    const systemContent = skillBlock
      ? `${this.getSystemPrompt(context)}\n${skillBlock}`
      : this.getSystemPrompt(context);

    const messages: LLMMessage[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: intent },
    ];

    logger.info(`[${this.id}] Starting ReAct loop`, {
      agentId: this.id,
      userId: context.userId,
      tier: routing.tier,
      tools: allowedToolNames,
    });

    // ── ReAct Loop ────────────────────────────────────────────────────────

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      logger.info(`[${this.id}] Iteration ${iteration + 1}/${MAX_ITERATIONS}`, {
        agentId: this.id,
        iteration: iteration + 1,
      });
      const result = await llm.complete(messages, {
        tier: routing.tier,
        maxTokens: routing.maxTokens,
        temperature: routing.temperature,
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
        ...(context.operationId && {
          telemetryContext: {
            operationId: context.operationId,
            userId: context.userId,
            agentId: this.id,
          },
        }),
      });

      // If the LLM responded with text and no tool calls → we're done
      if (result.toolCalls.length === 0) {
        logger.info(`[${this.id}] Task complete — no more tool calls`, {
          agentId: this.id,
          iteration: iteration + 1,
          model: result.model,
        });
        // Extract structured data from all completed tool call observations
        // so callers (e.g. agent-activity.service) can read imageUrl, storagePath, etc.
        const extractedToolData: Record<string, unknown> = {};
        for (const msg of messages) {
          if (msg.role === 'tool' && typeof msg.content === 'string') {
            try {
              const parsed = JSON.parse(msg.content) as Record<string, unknown>;
              if (
                parsed['success'] === true &&
                parsed['data'] &&
                typeof parsed['data'] === 'object'
              ) {
                Object.assign(extractedToolData, parsed['data'] as Record<string, unknown>);
              }
            } catch {
              // Not JSON — skip
            }
          }
        }
        return {
          summary: result.content ?? 'Task completed.',
          data: { model: result.model, usage: result.usage, ...extractedToolData },
          suggestions: [],
        };
      }

      // Append the assistant message with its tool calls to the conversation
      messages.push({
        role: 'assistant',
        content: result.content,
        tool_calls: result.toolCalls,
      });

      logger.info(`[${this.id}] Tool calls requested`, {
        agentId: this.id,
        iteration: iteration + 1,
        tools: result.toolCalls.map((t) => t.function.name),
      });

      // Execute each requested tool and feed observations back
      for (const toolCall of result.toolCalls) {
        logger.info(`[${this.id}] Executing tool: ${toolCall.function.name}`, {
          agentId: this.id,
          tool: toolCall.function.name,
          args: toolCall.function.arguments,
        });

        let observation = await this.executeTool(
          toolCall,
          toolRegistry,
          context.userId,
          guardrailRunner,
          // Pass yield context so AskUserTool can serialize the ReAct state.
          // Passed per-invocation (not stored on the singleton) to avoid race
          // conditions with WORKER_CONCURRENCY > 1.
          { agentId: this.id, messages }
        );
        // Truncate large observations (e.g. scrape results) to prevent context overflow.
        // ONLY truncate markdownContent — never truncate the raw observation string, as that
        // would corrupt structured data like imageUrl in generate_image results.
        if (observation.length > MAX_OBSERVATION_LENGTH) {
          try {
            const parsed = JSON.parse(observation) as Record<string, unknown>;
            if (parsed['success'] && parsed['data'] && typeof parsed['data'] === 'object') {
              const data = parsed['data'] as Record<string, unknown>;
              if (
                typeof data['markdownContent'] === 'string' &&
                data['markdownContent'].length > MAX_OBSERVATION_LENGTH
              ) {
                data['markdownContent'] =
                  data['markdownContent'].slice(0, MAX_OBSERVATION_LENGTH) + '\n...[truncated]';
                data['truncated'] = true;
                observation = JSON.stringify(parsed);
              }
              // If no markdownContent to truncate, leave observation intact —
              // the data fields (imageUrl, etc.) must remain complete.
            }
          } catch {
            // Not valid JSON and very large — truncate raw string as last resort
            observation = observation.slice(0, MAX_OBSERVATION_LENGTH) + '\n...[truncated]';
          }
        }
        // Log tool result summary — parse JSON to show structured info instead of raw string
        // (avoids logging huge signed URLs or large content that confuses debugging)
        try {
          const parsed = JSON.parse(observation) as Record<string, unknown>;
          const data = parsed['data'] as Record<string, unknown> | undefined;
          const logSummary: Record<string, unknown> = { success: parsed['success'] };
          if (data) {
            // Log keys present in data (not values — avoids logging signed URLs)
            logSummary['dataKeys'] = Object.keys(data);
            if (typeof data['imageUrl'] === 'string') {
              logSummary['imageUrl'] = data['imageUrl'].slice(0, 80) + '...[see Firestore]';
            }
            if (typeof data['contentLength'] === 'number') {
              logSummary['contentLength'] = data['contentLength'];
            }
            if (typeof data['provider'] === 'string') {
              logSummary['provider'] = data['provider'];
            }
          }
          if (!parsed['success']) logSummary['error'] = parsed['error'];
          logger.info(`[${this.id}] Tool result: ${toolCall.function.name}`, {
            agentId: this.id,
            tool: toolCall.function.name,
            ...logSummary,
          });
        } catch {
          logger.info(`[${this.id}] Tool result: ${toolCall.function.name}`, {
            agentId: this.id,
            tool: toolCall.function.name,
            responseLength: observation.length,
          });
        }
        messages.push({
          role: 'tool',
          content: observation,
          tool_call_id: toolCall.id,
        });
      }
    }

    logger.warn(
      `[${this.id}] Max iterations (${MAX_ITERATIONS}) reached — returning partial result`,
      {
        agentId: this.id,
        userId: context.userId,
      }
    );

    // Exhausted iterations — still extract any tool results that completed successfully
    const extractedToolData: Record<string, unknown> = {};
    for (const msg of messages) {
      if (msg.role === 'tool' && typeof msg.content === 'string') {
        try {
          const parsed = JSON.parse(msg.content) as Record<string, unknown>;
          if (parsed['success'] === true && parsed['data'] && typeof parsed['data'] === 'object') {
            Object.assign(extractedToolData, parsed['data'] as Record<string, unknown>);
          }
        } catch {
          // Not JSON — skip
        }
      }
    }
    return {
      summary:
        'The agent reached its maximum iteration limit. ' +
        'The task may be too complex for a single pass.',
      data: { maxIterationsReached: true, ...extractedToolData },
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
    guardrailRunner?: GuardrailRunner,
    yieldContext?: AskUserToolContext
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

    // Inject yield context into the input so AskUserTool can read it
    // without relying on mutable singleton state (safe with concurrent workers).
    if (yieldContext && toolName === 'ask_user') {
      input[ASK_USER_CONTEXT_KEY] = yieldContext;
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

    // AgentYieldException from AskUserTool must propagate out of the ReAct loop
    // so the worker can catch it and suspend the job. Do NOT catch it here.
    try {
      const result = await registry.execute(toolName, input);
      return JSON.stringify(
        result.success
          ? { success: true, data: result.data }
          : { success: false, error: result.error }
      );
    } catch (err) {
      if (isAgentYield(err)) throw err; // Let yields propagate
      return JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'Tool execution failed',
      });
    }
  }
}
