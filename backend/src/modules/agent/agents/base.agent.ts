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
  AgentToolCallRecord,
  ModelRoutingConfig,
} from '@nxt1/core';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { ToolExecutionContext } from '../tools/base.tool.js';
import type { LLMMessage, LLMToolSchema, LLMToolCall } from '../llm/llm.types.js';
import type { SkillRegistry } from '../skills/skill-registry.js';
import type { OnStreamEvent } from '../queue/event-writer.js';
import { GlobalKnowledgeSkill } from '../skills/knowledge/global-knowledge.skill.js';
import { AgentYieldException, isAgentYield } from '../exceptions/agent-yield.exception.js';
import {
  isAgentDelegation,
  AgentDelegationException,
} from '../exceptions/agent-delegation.exception.js';
import type { ApprovalGateService } from '../services/approval-gate.service.js';
import { ASK_USER_CONTEXT_KEY, type AskUserToolContext } from '../tools/comms/ask-user.tool.js';
import {
  sanitizeAgentOutputText,
  sanitizeAgentPayload,
} from '../utils/platform-identifier-sanitizer.js';
import { getAgentAnalyticsGate } from '../services/agent-analytics-gate.js';
import { logger } from '../../../utils/logger.js';

/** Maximum tool-calling iterations before we force the agent to respond. */
const MAX_ITERATIONS = 20;

/**
 * Maximum characters for a single tool observation fed back to the LLM.
 * Prevents context overflow when scrape results are very large.
 */
const MAX_OBSERVATION_LENGTH = 8_000;

interface ToolSessionContext {
  readonly sessionId?: string;
  readonly threadId?: string;
  readonly operationId?: string;
  readonly environment?: 'staging' | 'production';
  readonly approvalId?: string;
  readonly bypassPermissionForTool?: {
    readonly toolName: string;
    readonly toolCallId: string;
  };
}

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
    skillRegistry?: SkillRegistry,
    onStreamEvent?: OnStreamEvent,
    approvalGate?: ApprovalGateService
  ): Promise<AgentOperationResult> {
    if (!llm || !toolRegistry) {
      throw new Error(
        `${this.name}.execute() requires llm and toolRegistry. ` + `Pass them from the AgentRouter.`
      );
    }

    const routing = this.getModelRouting();
    const allowedToolNames = this.getAvailableTools();

    // Build LLM tool schemas from the registry (filtered to this agent's permissions).
    // System-category tools (e.g. delegate_task) are always included regardless
    // of the agent's getAvailableTools() list — they provide cross-cutting
    // infrastructure that every coordinator needs.
    const toolSchemas: LLMToolSchema[] = toolRegistry
      .getDefinitions(this.id)
      .filter(
        (def) =>
          def.category === 'system' ||
          allowedToolNames.length === 0 ||
          allowedToolNames.includes(def.name)
      )
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
          // Trigger retrieval for GlobalKnowledgeSkill before building prompt.
          // Pass the already-computed intentEmbedding to skip a redundant embed call.
          for (const m of matched) {
            if (m.skill instanceof GlobalKnowledgeSkill) {
              await m.skill.retrieveForIntent(intent, intentEmbedding);
            }
          }
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

    // Build initial conversation (with optional skill injection + delegation rule)
    const delegationRule = [
      '\n## Cross-Domain Delegation',
      "If the user's request falls outside your area of expertise or you lack the",
      'tools to complete it, call the `delegate_task` tool with a clear description',
      'of what the user needs. Do NOT attempt to answer outside your domain —',
      'delegate instead. Never apologize or tell the user you cannot help; just delegate.',
    ].join('\n');

    let systemContent = this.getSystemPrompt(context);
    if (skillBlock) systemContent += `\n${skillBlock}`;
    systemContent += delegationRule;
    systemContent +=
      '\n- NEVER reveal raw NXT1 platform identifiers such as user IDs, team IDs, organization IDs, post IDs, unicode values, team codes, routes, cursors, or internal document IDs. Refer to people and entities by name only.';

    // Build the initial user message — multipart when file attachments are present
    // (e.g. images forwarded from the SSE chat client).
    const userMessage: LLMMessage = context.attachments?.length
      ? {
          role: 'user',
          content: [
            { type: 'text' as const, text: intent },
            ...context.attachments.map((a) => ({
              type: 'image_url' as const,
              image_url: { url: a.url, detail: 'auto' as const },
            })),
          ],
        }
      : { role: 'user', content: intent };

    const messages: LLMMessage[] = [{ role: 'system', content: systemContent }, userMessage];

    logger.info(`[${this.id}] Starting ReAct loop`, {
      agentId: this.id,
      userId: context.userId,
      tier: routing.tier,
      tools: allowedToolNames,
    });

    return this.runLoop(
      messages,
      context,
      llm,
      toolRegistry,
      toolSchemas,
      routing,
      onStreamEvent,
      approvalGate
    );
  }

  /**
   * Continue execution from a previously yielded message array.
   * Used when the user approves a pending tool or answers an ask_user question.
   */
  async resumeExecution(
    yieldState: {
      readonly reason: 'needs_input' | 'needs_approval';
      readonly messages: readonly Record<string, unknown>[];
      readonly pendingToolCall?: {
        readonly toolName: string;
        readonly toolInput: Record<string, unknown>;
        readonly toolCallId: string;
      };
      readonly planContext?: {
        readonly currentTaskId: string;
        readonly completedTaskResults: Record<string, unknown>;
        readonly enrichedIntent: string;
      };
    },
    context: AgentSessionContext,
    _toolDefinitions: readonly AgentToolDefinition[],
    llm?: OpenRouterService,
    toolRegistry?: ToolRegistry,
    _skillRegistry?: SkillRegistry,
    onStreamEvent?: OnStreamEvent,
    approvalGate?: ApprovalGateService,
    approvalId?: string
  ): Promise<AgentOperationResult> {
    if (!llm || !toolRegistry) {
      throw new Error(
        `${this.name}.resumeExecution() requires llm and toolRegistry. ` +
          `Pass them from the AgentRouter.`
      );
    }

    const routing = this.getModelRouting();
    const allowedToolNames = this.getAvailableTools();
    const toolSchemas: LLMToolSchema[] = toolRegistry
      .getDefinitions(this.id)
      .filter(
        (def) =>
          def.category === 'system' ||
          allowedToolNames.length === 0 ||
          allowedToolNames.includes(def.name)
      )
      .map((def) => ({
        type: 'function' as const,
        function: {
          name: def.name,
          description: def.description,
          parameters: def.parameters,
        },
      }));

    const messages = yieldState.messages.map((msg) => ({ ...msg })) as unknown as LLMMessage[];
    const sessionContext: ToolSessionContext = {
      sessionId: context.sessionId,
      threadId: context.threadId,
      operationId: context.operationId,
      ...(context.environment && { environment: context.environment }),
      ...(approvalId ? { approvalId } : {}),
      ...(yieldState.reason === 'needs_approval' && yieldState.pendingToolCall
        ? {
            bypassPermissionForTool: {
              toolName: yieldState.pendingToolCall.toolName,
              toolCallId: yieldState.pendingToolCall.toolCallId,
            },
          }
        : {}),
    };

    if (yieldState.reason === 'needs_approval' && yieldState.pendingToolCall) {
      const pendingToolCall: LLMToolCall = {
        id: yieldState.pendingToolCall.toolCallId,
        type: 'function',
        function: {
          name: yieldState.pendingToolCall.toolName,
          arguments: JSON.stringify(yieldState.pendingToolCall.toolInput),
        },
      };

      onStreamEvent?.({
        type: 'step_active',
        agentId: this.id,
        toolName: pendingToolCall.function.name,
        message: `Running ${pendingToolCall.function.name} after approval...`,
      });

      let observation = await this.executeTool(
        pendingToolCall,
        toolRegistry,
        context.userId,
        {
          agentId: this.id,
          messages,
          planContext: yieldState.planContext,
        },
        sessionContext,
        messages,
        approvalGate
      );
      observation = this.truncateObservation(observation);

      onStreamEvent?.({
        type: 'tool_result',
        agentId: this.id,
        toolName: pendingToolCall.function.name,
        toolSuccess: true,
        message: `${pendingToolCall.function.name} completed`,
      });

      messages.push({
        role: 'tool',
        content: observation,
        tool_call_id: pendingToolCall.id,
      });
    }

    return this.runLoop(
      messages,
      context,
      llm,
      toolRegistry,
      toolSchemas,
      routing,
      onStreamEvent,
      approvalGate
    );
  }

  private async runLoop(
    messages: LLMMessage[],
    context: AgentSessionContext,
    llm: OpenRouterService,
    toolRegistry: ToolRegistry,
    toolSchemas: readonly LLMToolSchema[],
    routing: ModelRoutingConfig,
    onStreamEvent?: OnStreamEvent,
    approvalGate?: ApprovalGateService
  ): Promise<AgentOperationResult> {
    // ── ReAct Loop ────────────────────────────────────────────────────────

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      logger.info(`[${this.id}] Iteration ${iteration + 1}/${MAX_ITERATIONS}`, {
        agentId: this.id,
        iteration: iteration + 1,
      });

      const llmOptions = {
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
        // Propagate the SSE abort signal so client disconnects cancel in-flight LLM calls
        ...(context.signal && { signal: context.signal }),
      };

      // Use streaming when onStreamEvent is provided so deltas flow to the caller.
      // SSE chat now provides onStreamEvent, so streaming is always active for live requests.
      const result = onStreamEvent
        ? await llm.completeStream(messages, llmOptions, (delta) => {
            if (delta.content) {
              onStreamEvent({
                type: 'delta',
                agentId: this.id,
                text: delta.content,
              });
            }
            if (delta.toolName) {
              onStreamEvent({
                type: 'tool_call',
                agentId: this.id,
                toolName: delta.toolName,
                ...(delta.toolArgs ? { toolArgs: sanitizeAgentOutputText(delta.toolArgs) } : {}),
              });
            }
          })
        : await llm.complete(messages, llmOptions);

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
                Object.assign(
                  extractedToolData,
                  sanitizeAgentPayload(parsed['data'] as Record<string, unknown>)
                );
              }
            } catch {
              // Not JSON — skip
            }
          }
        }

        // Build persistent tool call records from the conversation history
        const toolCallRecords = this.extractToolCallRecords(messages);

        // Synthesize a summary from tool observations when the LLM returns empty content
        let summary = sanitizeAgentOutputText(result.content ?? '');
        if (!summary.trim()) {
          summary = this.synthesizeSummary(toolCallRecords);
        }

        summary = sanitizeAgentOutputText(summary);

        if (onStreamEvent && summary.trim()) {
          onStreamEvent({ type: 'delta', text: summary, agentId: this.id });
        }

        return {
          summary,
          data: sanitizeAgentPayload({
            model: result.model,
            usage: result.usage,
            toolCallRecords,
            ...extractedToolData,
          }),
          suggestions: [],
        };
      }

      // Append the assistant message with its tool calls to the conversation
      messages.push({
        role: 'assistant',
        content:
          typeof result.content === 'string'
            ? sanitizeAgentOutputText(result.content)
            : result.content,
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

        // Emit step_active so the UI shows the tool is running
        onStreamEvent?.({
          type: 'step_active',
          agentId: this.id,
          toolName: toolCall.function.name,
          message: `Running ${toolCall.function.name}...`,
        });

        let observation = await this.executeTool(
          toolCall,
          toolRegistry,
          context.userId,
          // Pass yield context so AskUserTool can serialize the ReAct state.
          // Passed per-invocation (not stored on the singleton) to avoid race
          // conditions with WORKER_CONCURRENCY > 1.
          { agentId: this.id, messages },
          // Pass session context so tools can use thread-scoped storage paths
          {
            sessionId: context.sessionId,
            threadId: context.threadId,
            operationId: context.operationId,
          },
          messages,
          approvalGate
        );
        observation = this.truncateObservation(observation);
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

        // Emit tool_result so the UI can render the tool card
        if (onStreamEvent) {
          let toolSuccess: boolean;
          let toolResult: Record<string, unknown> | undefined;
          try {
            const parsed = JSON.parse(observation) as Record<string, unknown>;
            toolSuccess = parsed['success'] === true;
            toolResult =
              typeof parsed['data'] === 'object' && parsed['data'] !== null
                ? sanitizeAgentPayload(parsed['data'] as Record<string, unknown>)
                : undefined;
          } catch {
            // Not JSON — mark as success if non-empty
            toolSuccess = observation.length > 0;
          }
          onStreamEvent({
            type: 'tool_result',
            agentId: this.id,
            toolName: toolCall.function.name,
            toolSuccess,
            toolResult,
            message: toolSuccess
              ? `${toolCall.function.name} completed`
              : `${toolCall.function.name} failed`,
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
            Object.assign(
              extractedToolData,
              sanitizeAgentPayload(parsed['data'] as Record<string, unknown>)
            );
          }
        } catch {
          // Not JSON — skip
        }
      }
    }
    const toolCallRecords = this.extractToolCallRecords(messages);
    return {
      summary: sanitizeAgentOutputText(
        'The agent reached its maximum iteration limit. ' +
          'The task may be too complex for a single pass.'
      ),
      data: sanitizeAgentPayload({
        maxIterationsReached: true,
        toolCallRecords,
        ...extractedToolData,
      }),
      suggestions: ['Try breaking the request into smaller tasks.'],
    };
  }

  private truncateObservation(observation: string): string {
    if (observation.length <= MAX_OBSERVATION_LENGTH) {
      return observation;
    }

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
          return JSON.stringify(parsed);
        }
      }
    } catch {
      return observation.slice(0, MAX_OBSERVATION_LENGTH) + '\n...[truncated]';
    }

    return observation;
  }

  // ─── Tool Call Record Extraction ──────────────────────────────────────────

  /**
   * Walk the conversation messages and build `AgentToolCallRecord[]` by
   * pairing each assistant `tool_calls` entry with its corresponding
   * `role: 'tool'` observation. This data is persisted to MongoDB so
   * the frontend can reconstruct historical tool steps.
   */
  private extractToolCallRecords(messages: readonly LLMMessage[]): AgentToolCallRecord[] {
    const records: AgentToolCallRecord[] = [];

    // Build a map from tool_call_id → observation content
    const observationMap = new Map<string, string>();
    for (const msg of messages) {
      if (msg.role === 'tool' && msg.tool_call_id && typeof msg.content === 'string') {
        observationMap.set(msg.tool_call_id, msg.content);
      }
    }

    // Walk assistant messages looking for tool_calls
    for (const msg of messages) {
      if (msg.role !== 'assistant' || !msg.tool_calls) continue;

      for (const tc of msg.tool_calls) {
        const observation = observationMap.get(tc.id) ?? '';
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          // Malformed JSON — leave empty
        }

        let output: Record<string, unknown> | undefined;
        let status: AgentToolCallRecord['status'] = 'success';
        try {
          const parsed = JSON.parse(observation) as Record<string, unknown>;
          if (parsed['success'] === false) {
            status = parsed['error']?.toString().includes('guardrail')
              ? 'blocked_by_guardrail'
              : 'error';
          }
          output =
            typeof parsed['data'] === 'object' && parsed['data'] !== null
              ? sanitizeAgentPayload(parsed['data'] as Record<string, unknown>)
              : sanitizeAgentPayload(parsed);
        } catch {
          // Non-JSON observation — store as raw text
          output = observation
            ? sanitizeAgentPayload({ raw: sanitizeAgentOutputText(observation.slice(0, 500)) })
            : undefined;
        }

        records.push({
          toolName: tc.function.name,
          input: sanitizeAgentPayload(input),
          output,
          status,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return records;
  }

  /**
   * Synthesize a human-readable summary from tool call records when the
   * LLM returns no explicit text content after its final iteration.
   * Falls back to a generic message only if no tool records exist.
   */
  private synthesizeSummary(records: readonly AgentToolCallRecord[]): string {
    if (records.length === 0) return 'Task completed.';

    const successRecords = records.filter((r) => r.status === 'success');
    if (successRecords.length === 0) {
      return 'Task completed, but some steps encountered errors.';
    }

    // Build a description from tool names (human-readable)
    const toolNames = [...new Set(successRecords.map((r) => r.toolName.replace(/_/g, ' ')))];
    if (toolNames.length === 1) {
      return `Completed: ${toolNames[0]}.`;
    }
    return `Completed ${successRecords.length} step${successRecords.length > 1 ? 's' : ''}: ${toolNames.join(', ')}.`;
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
    yieldContext?: AskUserToolContext,
    sessionContext?: ToolSessionContext,
    currentMessages?: readonly LLMMessage[],
    approvalGate?: ApprovalGateService
  ): Promise<string> {
    const toolName = toolCall.function.name;

    // Re-check permissions: ensure the LLM isn't calling a tool outside its allowlist.
    // System-category tools (e.g. delegate_task) bypass the allowlist.
    const allowedToolNames = this.getAvailableTools();
    const tool = registry.get(toolName);
    const isSystemTool = tool?.category === 'system';
    const bypassPermissions =
      sessionContext?.bypassPermissionForTool?.toolName === toolName &&
      sessionContext?.bypassPermissionForTool?.toolCallId === toolCall.id;
    if (
      !isSystemTool &&
      !bypassPermissions &&
      allowedToolNames.length > 0 &&
      !allowedToolNames.includes(toolName)
    ) {
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

    if (approvalGate) {
      const approvalRequirement = approvalGate.getApprovalRequirement(toolName, input);
      if (approvalRequirement) {
        const approvalAlreadyGranted =
          typeof sessionContext?.approvalId === 'string'
            ? await approvalGate.isApprovalGranted(
                sessionContext.approvalId,
                userId,
                toolName,
                input
              )
            : false;

        if (!approvalAlreadyGranted) {
          const approvalRequest = await approvalGate.requestApproval({
            operationId: sessionContext?.operationId ?? toolCall.id,
            taskId: sessionContext?.operationId ?? toolCall.id,
            userId,
            toolName,
            toolInput: input,
            actionSummary: approvalRequirement.actionSummary,
            reasoning: approvalRequirement.promptToUser,
            threadId: sessionContext?.threadId,
          });

          throw new AgentYieldException({
            reason: 'needs_approval',
            promptToUser: approvalRequirement.promptToUser,
            agentId: this.id,
            messages: currentMessages ?? yieldContext?.messages ?? [],
            pendingToolCall: {
              toolName,
              toolInput: input,
              toolCallId: toolCall.id,
            },
            approvalId: approvalRequest.id,
          });
        }
      }
    }

    // Inject yield context into the input so AskUserTool can read it
    // without relying on mutable singleton state (safe with concurrent workers).
    if (yieldContext && toolName === 'ask_user') {
      input[ASK_USER_CONTEXT_KEY] = yieldContext;
    }

    // Build execution context for the tool — provides identity & session info
    // so tools can use thread-scoped storage paths, audit logging, etc.
    const toolExecContext: ToolExecutionContext = {
      userId,
      ...(sessionContext?.environment && { environment: sessionContext.environment }),
      ...(sessionContext?.threadId && { threadId: sessionContext.threadId }),
      ...(sessionContext?.sessionId && { sessionId: sessionContext.sessionId }),
    };

    // AgentYieldException from AskUserTool must propagate out of the ReAct loop
    // so the worker can catch it and suspend the job. Do NOT catch it here.
    // AgentDelegationException from DelegateTaskTool must propagate out so the
    // AgentRouter can re-dispatch through the PlannerAgent.
    try {
      const result = await registry.execute(toolName, input, toolExecContext);
      const sanitizedData =
        result.data !== undefined ? sanitizeAgentPayload(result.data) : undefined;
      // Fire-and-forget: track this tool execution in the user's analytics record.
      // Self-tracking tools (send_email, write_recruiting_activity, etc.) are
      // skipped inside the gate to prevent double-counting.
      if (result.success) {
        getAgentAnalyticsGate().trackToolExecution({
          userId,
          agentId: this.id,
          toolName,
          sessionId: sessionContext?.sessionId,
          threadId: sessionContext?.threadId,
          operationId: sessionContext?.operationId,
        });
      }
      return JSON.stringify(
        result.success
          ? { success: true, ...(sanitizedData !== undefined ? { data: sanitizedData } : {}) }
          : {
              success: false,
              error: sanitizeAgentOutputText(result.error ?? 'Tool execution failed'),
            }
      );
    } catch (err) {
      if (isAgentYield(err)) throw err; // Let yields propagate
      if (isAgentDelegation(err)) {
        // Enrich the delegation payload with the actual agent ID before propagating
        throw new AgentDelegationException({
          ...err.payload,
          sourceAgent: this.id,
        });
      }
      return JSON.stringify({
        success: false,
        error: sanitizeAgentOutputText(
          err instanceof Error ? err.message : 'Tool execution failed'
        ),
      });
    }
  }
}
