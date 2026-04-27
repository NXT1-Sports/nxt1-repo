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
  AgentToolEntityGroup,
  AgentSessionContext,
  AgentOperationResult,
  AgentToolCallRecord,
  AgentXToolStepIcon,
  ModelRoutingConfig,
  ToolStage,
} from '@nxt1/core';
import { resolveAgentApprovalPrompt } from '@nxt1/core';
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
import { AgentEngineError } from '../exceptions/agent-engine.error.js';
import type { ApprovalGateService } from '../services/approval-gate.service.js';
import { ASK_USER_CONTEXT_KEY, type AskUserToolContext } from '../tools/system/ask-user.tool.js';
import { isToolAllowedByPatterns } from './tool-policy.js';
import {
  sanitizeAgentOutputText,
  sanitizeAgentPayload,
} from '../utils/platform-identifier-sanitizer.js';
import { parallelBatch } from '../utils/parallel-batch.js';
import { getCachedAgentAppConfig, resolveAgentSystemPrompt } from '../config/agent-app-config.js';
import { logger } from '../../../utils/logger.js';

/** Maximum tool-calling iterations before we force the agent to respond. */
const MAX_ITERATIONS = 20;

/**
 * Maximum characters for a single tool observation fed back to the LLM.
 * Prevents context overflow when scrape results are very large.
 */
const MAX_OBSERVATION_LENGTH = 8_000;

// ─── Context Window Budget ────────────────────────────────────────────────────

/**
 * Number of initial tool-calling exchanges to pin at the front of the context.
 * These contain the foundational scraping data the agent's entire reasoning is
 * built on — they must never be pruned.
 */
const CONTEXT_KEEP_FIRST_EXCHANGES = 2;

/**
 * Number of most-recent tool-calling exchanges to retain for recency bias.
 * The LLM needs these to avoid repeating what it just did and to pick the
 * correct next action.
 */
const CONTEXT_KEEP_LAST_EXCHANGES = 3;

/**
 * Minimum number of complete exchanges before pruning is worthwhile.
 * = KEEP_FIRST + KEEP_LAST + 1 (at least one exchange must land in the
 * collapsed middle or the prune is a no-op).
 */
const CONTEXT_PRUNE_THRESHOLD = CONTEXT_KEEP_FIRST_EXCHANGES + CONTEXT_KEEP_LAST_EXCHANGES + 1;

interface ToolSessionContext {
  readonly sessionId?: string;
  readonly threadId?: string;
  readonly operationId?: string;
  readonly environment?: 'staging' | 'production';
  readonly approvalId?: string;
  readonly allowedToolNames?: readonly string[];
  readonly allowedEntityGroups?: readonly AgentToolEntityGroup[];
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
   * Maximum number of tools to execute in parallel within a single LLM
   * iteration. Defaults to 1 (sequential) so the user sees one step at a time
   * and the visual stream stays in deterministic order. Override in subclasses
   * (e.g. agents that fan out N read_distilled_section calls) when ordered
   * concurrency is desired \u2014 parallelBatch still preserves input order so
   * the messages array remains structurally valid for OpenRouter.
   */
  getToolConcurrency(): number {
    return 1;
  }

  protected withConfiguredSystemPrompt(
    basePrompt: string,
    templateValues?: Readonly<Record<string, string | undefined>>
  ): string {
    return resolveAgentSystemPrompt(this.id, basePrompt, templateValues);
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
    toolDefinitions: readonly AgentToolDefinition[],
    llm?: OpenRouterService,
    toolRegistry?: ToolRegistry,
    skillRegistry?: SkillRegistry,
    onStreamEvent?: OnStreamEvent,
    approvalGate?: ApprovalGateService
  ): Promise<AgentOperationResult> {
    if (!llm || !toolRegistry) {
      throw new AgentEngineError(
        'AGENT_DEPENDENCY_MISSING',
        `${this.name}.execute() requires llm and toolRegistry. ` + `Pass them from the AgentRouter.`
      );
    }

    const routing = this.getModelRouting();
    const allowedToolNames = this.getAvailableTools();

    // Build LLM tool schemas from the registry (filtered to this agent's permissions).
    // System-category tools (e.g. delegate_task) are always included regardless
    // of the agent's getAvailableTools() list — they provide cross-cutting
    // infrastructure that every coordinator needs.
    const toolSchemas: LLMToolSchema[] = toolDefinitions
      .filter(
        (def) => def.category === 'system' || isToolAllowedByPatterns(def.name, allowedToolNames)
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
    const appConfig = getCachedAgentAppConfig();
    const configuredPrompt = appConfig.prompts.agentSystemPrompts[this.id];
    if (configuredPrompt) {
      logger.info(`[${this.id}] Applying configured system prompt override`, {
        agentId: this.id,
        configSchemaVersion: appConfig.schemaVersion,
        configUpdatedAt: appConfig.updatedAt,
      });
    }

    if (skillBlock) systemContent += `\n${skillBlock}`;
    systemContent += delegationRule;
    systemContent +=
      '\n- NEVER reveal raw NXT1 platform identifiers such as user IDs, team IDs, organization IDs, post IDs, unicode values, team codes, routes, cursors, or internal document IDs. Refer to people and entities by name only.';

    // Build the initial user message — multipart when file attachments are present
    // (e.g. images forwarded from the SSE chat client).
    // Video attachments are injected as text URL references (videos can't be passed
    // as vision content) so tools like write_athlete_videos have access to the URL.
    let intentText = intent;
    // Non-image, non-video attachments (PDFs, CSVs, DOCs) are also text references
    // since OpenRouter only supports images + videos for vision content.

    // Add video references
    if (context.videoAttachments?.length) {
      const videoRefs = context.videoAttachments
        .map((v) => `[Attached video: ${v.name} — ${v.url}]`)
        .join('\n');
      intentText = `${intent}\n\n${videoRefs}`;
    }

    // Only map image attachments to vision content
    const imageAttachments = (context.attachments ?? []).filter((a) =>
      a.mimeType.startsWith('image/')
    );

    // Add non-image, non-video attachment references
    const nonImageAttachments = (context.attachments ?? []).filter(
      (a) => !a.mimeType.startsWith('image/')
    );
    if (nonImageAttachments.length > 0) {
      const docRefs = nonImageAttachments
        .map((a) => `[Attached document: ${a.mimeType} — ${a.url}]`)
        .join('\n');
      intentText = `${intentText}\n\n${docRefs}`;
    }

    const userMessage: LLMMessage =
      imageAttachments.length > 0
        ? {
            role: 'user',
            content: [
              { type: 'text' as const, text: intentText },
              ...imageAttachments.map((a) => ({
                type: 'image_url' as const,
                image_url: { url: a.url, detail: 'auto' as const },
              })),
            ],
          }
        : { role: 'user', content: intentText };

    // Some chat-tier models in OpenRouter do not accept image_url content.
    // When user image attachments are present, force vision tier routing.
    const effectiveRouting: ModelRoutingConfig =
      imageAttachments.length > 0 && routing.tier !== 'vision_analysis'
        ? {
            ...routing,
            tier: 'vision_analysis',
            maxTokens: Math.max(routing.maxTokens ?? 0, 4096),
            temperature: 0,
          }
        : routing;

    // Inject prior conversation turns so the agent has cross-message continuity.
    // history contains ONLY user + assistant turns from previous messages in this
    // thread (tool observations are never persisted to session memory).
    // The current userMessage is appended AFTER history — never duplicated.
    const historyMessages: LLMMessage[] = (context.conversationHistory ?? []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const messages: LLMMessage[] = [
      { role: 'system', content: systemContent },
      ...historyMessages,
      userMessage,
    ];

    logger.info(`[${this.id}] Starting ReAct loop`, {
      agentId: this.id,
      userId: context.userId,
      tier: effectiveRouting.tier,
      tools: allowedToolNames,
      hasImageAttachments: imageAttachments.length > 0,
    });

    const effectiveAllowedToolNames = toolSchemas.map((schema) => schema.function.name);
    const effectiveAllowedEntityGroups = Array.from(
      new Set(
        toolDefinitions
          .map((definition) => definition.entityGroup)
          .filter((group): group is AgentToolEntityGroup => Boolean(group))
      )
    );

    return this.runLoop(
      messages,
      context,
      llm,
      toolRegistry,
      toolSchemas,
      effectiveAllowedToolNames,
      effectiveAllowedEntityGroups,
      effectiveRouting,
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
      throw new AgentEngineError(
        'AGENT_DEPENDENCY_MISSING',
        `${this.name}.resumeExecution() requires llm and toolRegistry. ` +
          `Pass them from the AgentRouter.`
      );
    }

    const routing = this.getModelRouting();
    const allowedToolNames = this.getAvailableTools();
    const toolSchemas: LLMToolSchema[] = _toolDefinitions
      .filter(
        (def) => def.category === 'system' || isToolAllowedByPatterns(def.name, allowedToolNames)
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
        stepId: pendingToolCall.id,
        toolName: pendingToolCall.function.name,
        stageType: 'tool',
        icon: this.resolveToolStepIcon(pendingToolCall.function.name),
        message: this.resolveToolInvocationLabel(
          pendingToolCall.function.name,
          pendingToolCall.function.arguments
        ),
      });

      let observation = await this.executeTool(
        pendingToolCall,
        toolRegistry,
        context.userId,
        context.signal,
        {
          agentId: this.id,
          messages,
          planContext: yieldState.planContext,
        },
        sessionContext,
        messages,
        approvalGate,
        onStreamEvent
      );
      observation = this.truncateObservation(observation);

      onStreamEvent?.({
        type: 'tool_result',
        agentId: this.id,
        stepId: pendingToolCall.id,
        toolName: pendingToolCall.function.name,
        stageType: 'tool',
        toolSuccess: true,
        icon: this.resolveToolStepIcon(pendingToolCall.function.name),
        message: this.resolveToolInvocationLabel(
          pendingToolCall.function.name,
          pendingToolCall.function.arguments
        ),
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
      toolSchemas.map((schema) => schema.function.name),
      Array.from(
        new Set(
          _toolDefinitions
            .map((definition) => definition.entityGroup)
            .filter((group): group is AgentToolEntityGroup => Boolean(group))
        )
      ),
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
    allowedToolNames: readonly string[],
    allowedEntityGroups: readonly AgentToolEntityGroup[],
    routing: ModelRoutingConfig,
    onStreamEvent?: OnStreamEvent,
    approvalGate?: ApprovalGateService
  ): Promise<AgentOperationResult> {
    // ── ReAct Loop ────────────────────────────────────────────────────────

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      this.throwIfAborted(context.signal);

      // Prune the context window before every LLM call (except the first iteration
      // which only has system + user messages — nothing to prune yet).
      // No-op when total tool-calling exchanges is below CONTEXT_PRUNE_THRESHOLD.
      if (iteration > 0) this.pruneMessageHistory(messages);

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
            // Abort the stream eagerly if the operation was paused/cancelled
            // mid-stream — without this check, deltas could keep flowing for
            // hundreds of ms after `signal.abort()` because the underlying
            // fetch reader buffers chunks. Throwing here causes the OpenRouter
            // adapter to reject and propagate the AbortError up.
            this.throwIfAborted(context.signal);
            if (delta.content) {
              onStreamEvent({
                type: 'delta',
                agentId: this.id,
                text: sanitizeAgentOutputText(delta.content),
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

      this.throwIfAborted(context.signal);

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
        const isSynthesized = !summary.trim();

        if (isSynthesized) {
          summary = this.synthesizeSummary(toolCallRecords);
        }

        summary = sanitizeAgentOutputText(summary);

        // Only stream the summary if it was synthesized because result.content was already streamed
        if (onStreamEvent && summary.trim() && isSynthesized) {
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

      // ── Tool execution (sequential by default, concurrent when opted-in) ──
      // The agent declares its tool concurrency via getToolConcurrency() (default 1).
      // parallelBatch preserves input order regardless of concurrency, so the
      // messages array stays structurally valid \u2014 OpenRouter requires every
      // tool_call to have a matching tool response message with the same id.
      const toolConcurrency = Math.max(
        1,
        Math.min(this.getToolConcurrency(), result.toolCalls.length)
      );
      const runConcurrent = toolConcurrency > 1;

      // 1. When running concurrently, emit step_active for ALL tools upfront so
      //    the UI shows the full batch as active in invocation order. When running
      //    sequentially, defer the step_active emission until the worker actually
      //    starts \u2014 this keeps the visual stream in strict order (one step
      //    spinning at a time) and avoids the "ugly" all-at-once flash.
      if (runConcurrent) {
        for (const toolCall of result.toolCalls) {
          this.throwIfAborted(context.signal);
          logger.info(`[${this.id}] Executing tool: ${toolCall.function.name}`, {
            agentId: this.id,
            tool: toolCall.function.name,
            args: toolCall.function.arguments,
          });
          onStreamEvent?.({
            type: 'step_active',
            agentId: this.id,
            stepId: toolCall.id,
            toolName: toolCall.function.name,
            stageType: 'tool',
            icon: this.resolveToolStepIcon(toolCall.function.name),
            message: this.resolveToolInvocationLabel(
              toolCall.function.name,
              toolCall.function.arguments
            ),
          });
        }
      }

      // 2. Capture session context once \u2014 shared read-only across all workers.
      const sessionCtxForTools: ToolSessionContext = {
        sessionId: context.sessionId,
        threadId: context.threadId,
        operationId: context.operationId,
        allowedToolNames,
        allowedEntityGroups,
      };

      // 3. Run tools \u2014 sequential or concurrent depending on agent config.
      //    The yield-context messages snapshot is captured here, before any tool
      //    observations are pushed \u2014 safe because ask_user is never co-emitted
      //    alongside data tools in the same LLM response.
      const yieldCtxSnapshot = { agentId: this.id, messages };
      const toolBatchResults = await parallelBatch(
        result.toolCalls,
        async (toolCall) => {
          if (!runConcurrent) {
            this.throwIfAborted(context.signal);
            logger.info(`[${this.id}] Executing tool: ${toolCall.function.name}`, {
              agentId: this.id,
              tool: toolCall.function.name,
              args: toolCall.function.arguments,
            });
            onStreamEvent?.({
              type: 'step_active',
              agentId: this.id,
              stepId: toolCall.id,
              toolName: toolCall.function.name,
              stageType: 'tool',
              icon: this.resolveToolStepIcon(toolCall.function.name),
              message: this.resolveToolInvocationLabel(
                toolCall.function.name,
                toolCall.function.arguments
              ),
            });
          }
          return this.executeTool(
            toolCall,
            toolRegistry,
            context.userId,
            context.signal,
            yieldCtxSnapshot,
            sessionCtxForTools,
            messages,
            approvalGate,
            onStreamEvent
          );
        },
        { concurrency: toolConcurrency }
      );

      // 4. Process results in original order, push tool messages, emit tool_result events.
      //    Track yield/delegation exceptions; rethrow after all observations are committed
      //    so the messages array is complete and structurally valid for OpenRouter.
      let pendingThrow: unknown = undefined;
      for (let ti = 0; ti < result.toolCalls.length; ti++) {
        this.throwIfAborted(context.signal);

        const toolCall = result.toolCalls[ti];
        const br = toolBatchResults[ti];

        if (br.status === 'rejected') {
          const err = br.reason;
          // Capture the first yield/delegation exception for rethrowing after the loop.
          if ((isAgentYield(err) || isAgentDelegation(err)) && !pendingThrow) {
            pendingThrow = err;
          }
          // Always push a placeholder so every tool_call has a corresponding tool message.
          messages.push({
            role: 'tool',
            content: JSON.stringify({ success: false, error: 'Tool execution was interrupted.' }),
            tool_call_id: toolCall.id,
          });
          continue;
        }

        const observation = this.truncateObservation(br.value);
        // Log tool result summary (structured — avoids logging signed URLs)
        try {
          const parsed = JSON.parse(observation) as Record<string, unknown>;
          const data = parsed['data'] as Record<string, unknown> | undefined;
          const logSummary: Record<string, unknown> = { success: parsed['success'] };
          if (data) {
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
            toolSuccess = observation.length > 0;
          }
          onStreamEvent({
            type: 'tool_result',
            agentId: this.id,
            stepId: toolCall.id,
            toolName: toolCall.function.name,
            stageType: 'tool',
            toolSuccess,
            toolResult,
            icon: this.resolveToolStepIcon(toolCall.function.name),
            message: this.resolveToolInvocationLabel(
              toolCall.function.name,
              toolCall.function.arguments
            ),
          });
        }

        messages.push({
          role: 'tool',
          content: observation,
          tool_call_id: toolCall.id,
        });
      }

      // 5. Rethrow yield/delegation only after all tool messages are committed.
      if (pendingThrow) throw pendingThrow;

      this.throwIfAborted(context.signal);
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

  // ─── Context Window Pruner ────────────────────────────────────────────────

  /**
   * Prune the ReAct conversation history to keep the LLM context within budget.
   *
   * Without pruning, a 15-iteration run with 3 tools/iteration accumulates
   * 45 tool messages × 8k chars = 360k chars — well beyond what most models
   * handle efficiently, causing slower responses, higher costs, and occasional
   * 400 "context too large" errors that trigger the fallback chain.
   *
   * Strategy:
   * 1. Parse `messages` into complete "exchanges" (one assistant message with
   *    tool_calls + its matching tool-response messages).
   * 2. If total exchanges ≤ CONTEXT_PRUNE_THRESHOLD: no-op.
   * 3. Otherwise: pin the first CONTEXT_KEEP_FIRST_EXCHANGES exchanges
   *    (foundational data) and the last CONTEXT_KEEP_LAST_EXCHANGES exchanges
   *    (recent work), collapse the middle into a single compact assistant
   *    message listing what was accomplished.
   *
   * Invariants:
   * - messages[0] always remains the system prompt.
   * - messages[1] always remains the user intent.
   * - Every assistant message that has tool_calls always appears alongside
   *   ALL its matching tool-response messages — no orphaned tool_call_ids.
   * - Prior summary messages (from earlier prunes) are folded into the new
   *   summary rather than re-inserted as stand-alone messages.
   */
  private pruneMessageHistory(messages: LLMMessage[]): void {
    if (messages.length <= 2) return;

    const systemMsg = messages[0];
    const userMsg = messages[1];
    const tail = messages.slice(2);

    // ── Parse into exchanges and prior-summary overhead ───────────────────
    // An exchange = [assistantMsg (with tool_calls), ...matching tool msgs].
    // Standalone assistant messages without tool_calls are prior prune
    // summaries — their text is harvested and folded into the next summary.
    const exchanges: LLMMessage[][] = [];
    const priorSummaryLines: string[] = [];
    let current: LLMMessage[] = [];

    for (const msg of tail) {
      if (msg.role === 'assistant') {
        if (current.length > 0) {
          const head = current[0];
          if (head.tool_calls && head.tool_calls.length > 0) {
            exchanges.push(current);
          } else if (typeof head.content === 'string' && head.content.trim()) {
            // Prior prune summary — harvest text, drop the message itself
            priorSummaryLines.push(head.content.trim());
          }
        }
        current = [msg];
      } else {
        current.push(msg);
      }
    }
    // Flush the final group
    if (current.length > 0) {
      const head = current[0];
      if (head.tool_calls && head.tool_calls.length > 0) {
        exchanges.push(current);
      } else if (typeof head.content === 'string' && head.content.trim()) {
        priorSummaryLines.push(head.content.trim());
      }
    }

    // Below threshold — nothing to do
    if (exchanges.length <= CONTEXT_PRUNE_THRESHOLD) return;

    const firstExchanges = exchanges.slice(0, CONTEXT_KEEP_FIRST_EXCHANGES);
    const lastExchanges = exchanges.slice(exchanges.length - CONTEXT_KEEP_LAST_EXCHANGES);
    const middleExchanges = exchanges.slice(
      CONTEXT_KEEP_FIRST_EXCHANGES,
      exchanges.length - CONTEXT_KEEP_LAST_EXCHANGES
    );

    // ── Build the compaction summary ──────────────────────────────────────
    const summaryLines: string[] = [];

    // Carry forward any text from previous prune passes
    if (priorSummaryLines.length > 0) {
      summaryLines.push(...priorSummaryLines, '');
    }

    summaryLines.push(
      `[Context compacted — ${middleExchanges.length} iteration(s) summarized for token efficiency]`,
      'Tool calls completed in compacted iterations:'
    );

    for (const exchange of middleExchanges) {
      const assistantMsg = exchange[0];
      if (!assistantMsg.tool_calls) continue;
      for (const tc of assistantMsg.tool_calls) {
        const toolMsg = exchange.find((m) => m.role === 'tool' && m.tool_call_id === tc.id);
        let outcome = 'completed';
        if (toolMsg && typeof toolMsg.content === 'string') {
          try {
            const p = JSON.parse(toolMsg.content) as Record<string, unknown>;
            if (p['success'] === false) {
              outcome = `failed: ${sanitizeAgentOutputText(String(p['error'] ?? 'unknown'))}`;
            }
          } catch {
            /* non-JSON observation — treat as completed */
          }
        }
        const argSummary = this.summarizeToolArgs(tc.function.arguments);
        summaryLines.push(`  \u2022 ${tc.function.name}(${argSummary}) \u2192 ${outcome}`);
      }
    }

    const summaryMsg: LLMMessage = {
      role: 'assistant',
      content: summaryLines.join('\n'),
      // Intentionally no tool_calls — this message will not be re-parsed as
      // an exchange on the next prune pass; its content is harvested instead.
    };

    const totalBefore = messages.length;

    // Mutate in-place so callers that hold a reference to this array see
    // the updated window without needing to re-assign.
    messages.splice(
      0,
      messages.length,
      systemMsg,
      userMsg,
      ...firstExchanges.flat(),
      summaryMsg,
      ...lastExchanges.flat()
    );

    logger.info(`[${this.id}] Context window pruned`, {
      agentId: this.id,
      prunedExchanges: middleExchanges.length,
      keptFirst: CONTEXT_KEEP_FIRST_EXCHANGES,
      keptLast: CONTEXT_KEEP_LAST_EXCHANGES,
      messagesBefore: totalBefore,
      messagesAfter: messages.length,
    });
  }

  /**
   * Compress tool call arguments into a short, human-readable string for use
   * inside the context compaction summary. Never fed back to the LLM as tool
   * input — purely for readability in the summary message.
   */
  private summarizeToolArgs(argsJson: string): string {
    try {
      const args = JSON.parse(argsJson) as Record<string, unknown>;
      const entries = Object.entries(args);
      if (entries.length === 0) return '';
      const [key, val] = entries[0];
      const valStr = String(val).slice(0, 50);
      const suffix = entries.length > 1 ? ` +${entries.length - 1}` : '';
      return `${key}: "${valStr}"${suffix}`;
    } catch {
      return argsJson.slice(0, 40);
    }
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
    signal?: AbortSignal,
    yieldContext?: AskUserToolContext,
    sessionContext?: ToolSessionContext,
    currentMessages?: readonly LLMMessage[],
    approvalGate?: ApprovalGateService,
    onStreamEvent?: OnStreamEvent
  ): Promise<string> {
    this.throwIfAborted(signal);

    const toolName = toolCall.function.name;

    // Re-check permissions: ensure the LLM isn't calling a tool outside its allowlist.
    // System-category tools (e.g. delegate_task) bypass the allowlist.
    const allowedToolNames = sessionContext?.allowedToolNames ?? this.getAvailableTools();
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
        errorCode: 'AGENT_TOOL_NOT_ALLOWED',
      });
    }

    let input: Record<string, unknown>;
    try {
      input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    } catch {
      return JSON.stringify({
        error: `Invalid JSON arguments for tool "${toolName}".`,
        errorCode: 'AGENT_TOOL_ARGS_INVALID',
      });
    }

    if (approvalGate) {
      const approvalRequirement = approvalGate.getApprovalRequirement(toolName, input);
      if (approvalRequirement) {
        const approvalPrompt = resolveAgentApprovalPrompt({
          reasonCode: approvalRequirement.reasonCode,
          actionSummary: approvalRequirement.actionSummary,
        });
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
            reasoning: approvalRequirement.actionSummary,
            threadId: sessionContext?.threadId,
          });

          throw new AgentYieldException({
            reason: 'needs_approval',
            promptToUser: approvalPrompt,
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
      ...(signal && { signal }),
      ...(sessionContext?.environment && { environment: sessionContext.environment }),
      ...(sessionContext?.operationId && { operationId: sessionContext.operationId }),
      ...(sessionContext?.threadId && { threadId: sessionContext.threadId }),
      ...(sessionContext?.sessionId && { sessionId: sessionContext.sessionId }),
      ...(sessionContext?.allowedToolNames && {
        allowedToolNames: sessionContext.allowedToolNames,
      }),
      ...(sessionContext?.allowedEntityGroups && {
        allowedEntityGroups: sessionContext.allowedEntityGroups,
      }),
      ...(onStreamEvent && {
        emitStage: (stage, metadata) => {
          onStreamEvent({
            type: 'step_active',
            agentId: this.id,
            stepId: toolCall.id,
            toolName,
            stageType: 'tool',
            stage,
            metadata,
            icon: metadata?.icon ?? this.resolveToolStepIcon(toolName, stage),
            message: this.resolveToolStageLabel(toolName, stage, metadata, input),
          });
        },
      }),
    };

    // AgentYieldException from AskUserTool must propagate out of the ReAct loop
    // so the worker can catch it and suspend the job. Do NOT catch it here.
    // AgentDelegationException from DelegateTaskTool must propagate out so the
    // AgentRouter can re-dispatch through the PlannerAgent.
    try {
      const result = await registry.execute(toolName, input, toolExecContext);
      this.throwIfAborted(signal);

      const sanitizedData =
        result.data !== undefined ? sanitizeAgentPayload(result.data) : undefined;

      if (result.success && result.markdown) {
        return result.markdown;
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
      if (this.isAbortError(err)) throw err;
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

  private isAbortError(err: unknown): err is Error {
    return err instanceof Error && err.name === 'AbortError';
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) return;
    const abortError = new Error('Operation aborted');
    abortError.name = 'AbortError';
    throw abortError;
  }

  private resolveToolStepIcon(toolName: string, stage?: ToolStage): AgentXToolStepIcon {
    const normalized = `${toolName} ${stage ?? ''}`.toLowerCase();

    if (/(delete|remove|cancel)/.test(normalized)) return 'delete';
    if (/(upload|cdn|storage)/.test(normalized)) return 'upload';
    if (/(download|export)/.test(normalized)) return 'download';
    if (/(search|query|find|fetch)/.test(normalized)) return 'search';
    if (/(email|mail)/.test(normalized)) return 'email';
    if (/(video|image|graphic|media)/.test(normalized)) return 'media';
    if (/(database|firebase|mongo|memory)/.test(normalized)) return 'database';
    if (/(document|pdf|doc)/.test(normalized)) return 'document';
    if (/approval/.test(normalized)) return 'approval';

    return 'processing';
  }

  private humanizeToolName(toolName: string): string {
    const KNOWN_TOOLS: Record<string, string> = {
      // Firecrawl & Web
      firecrawl_agent_research: 'Conducting web research',
      firecrawl_search_web: 'Searching the web',
      extract_web_data: 'Extracting structured data',
      scrape_webpage: 'Scraping web page',
      map_website: 'Mapping website structure',
      search_web: 'Searching the web',

      // Social & Intel
      scrape_instagram: 'Scanning Instagram',
      scrape_twitter: 'Scanning Twitter (X)',
      scrape_and_index_profile: 'Indexing profile data',
      update_intel: 'Updating intelligence file',
      write_intel: 'Writing intelligence report',

      // Memory
      search_memory: 'Recalling memory',
      save_memory: 'Saving to memory',
      delete_memory: 'Updating memory records',

      // Database & Platform
      query_nxt1_data: 'Querying platform database',
      query_nxt1_platform_data: 'Querying platform database',
      search_colleges: 'Searching college database',
      search_college_coaches: 'Searching coaching staff',
      search_nxt1_platform: 'Searching platform registry',
      write_season_stats: 'Updating athletic stats',
      write_team_stats: 'Updating team statistics',
      write_roster_entries: 'Updating team roster',
      write_schedule: 'Updating season schedule',
      write_awards: 'Adding career awards',

      // Media & Video
      generate_graphic: 'Designing graphic',
      runway_generate_video: 'Generating AI video',
      analyze_video: 'Analyzing game film',
      runway_upscale_video: 'Enhancing video quality',
      clip_video: 'Clipping video highlight',
      import_video: 'Importing media',
      generate_captions: 'Transcribing audio/video',

      // Workspace & Documents
      docs_create_document: 'Drafting document',
      sheets_create_spreadsheet: 'Building spreadsheet',
      gmail_send_email: 'Sending email',
      create_gmail_draft: 'Drafting email',
      query_gmail_emails: 'Checking inbox',
      create_calendar_event: 'Scheduling event',
      calendar_get_events: 'Checking calendar',

      // Automation
      enqueue_heavy_task: 'Queueing background operation',
      schedule_recurring_task: 'Scheduling automation',
      call_apify_actor: 'Running cloud automation',
      delegate_task: 'Delegating to specialized agent',

      // Live Browser
      open_live_view: 'Opening virtual browser',
      read_live_view: 'Scanning virtual browser',
      navigate_live_view: 'Navigating webpage',

      // Comms
      scan_timeline_posts: 'Scanning recent posts',
      write_timeline_post: 'Drafting new post',
      send_email: 'Sending email',
      dynamic_export: 'Generating data export',
    };

    if (KNOWN_TOOLS[toolName]) return KNOWN_TOOLS[toolName];

    // Fallback for unknown tools
    return toolName
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 0)
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(' ');
  }

  private resolveToolInvocationLabel(
    toolName: string,
    inputOrArgs?: Record<string, unknown> | string
  ): string {
    const baseLabel = this.humanizeToolName(toolName);
    const descriptor = this.resolveToolInvocationDescriptor(inputOrArgs);
    return descriptor ? `${baseLabel}: ${descriptor}` : baseLabel;
  }

  private resolveToolInvocationDescriptor(
    inputOrArgs?: Record<string, unknown> | string
  ): string | null {
    let input: Record<string, unknown> | null = null;

    if (typeof inputOrArgs === 'string') {
      try {
        const parsed = JSON.parse(inputOrArgs) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          input = parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    } else if (inputOrArgs && typeof inputOrArgs === 'object' && !Array.isArray(inputOrArgs)) {
      input = inputOrArgs;
    }

    if (!input) return null;

    const priorityKeys = [
      'programName',
      'schoolName',
      'collegeName',
      'teamName',
      'organizationName',
      'school',
      'query',
      'url',
      'hostname',
      'name',
      'title',
      'profileName',
      'personName',
    ] as const;

    for (const key of priorityKeys) {
      const candidate = this.formatToolInvocationValue(input[key]);
      if (candidate) return candidate;
    }

    for (const [key, value] of Object.entries(input)) {
      if (!this.isMeaningfulInvocationKey(key)) continue;
      const candidate = this.formatToolInvocationValue(value);
      if (candidate) return candidate;
    }

    return null;
  }

  private isMeaningfulInvocationKey(key: string): boolean {
    return ![
      'page',
      'limit',
      'offset',
      'cursor',
      'count',
      'ids',
      'include',
      'sort',
      'order',
      'filters',
      'options',
      'metadata',
      'userId',
      'threadId',
      'operationId',
    ].includes(key);
  }

  private formatToolInvocationValue(value: unknown): string | null {
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (!normalized) return null;
      return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return null;
      const first = this.formatToolInvocationValue(value[0]);
      if (!first) return `${value.length} item${value.length === 1 ? '' : 's'}`;
      return value.length === 1 ? first : `${first} +${value.length - 1}`;
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['name', 'title', 'label', 'url', 'hostname'] as const) {
        const candidate = this.formatToolInvocationValue(record[key]);
        if (candidate) return candidate;
      }
    }

    return null;
  }

  private resolveToolStageLabel(
    toolName: string,
    stage: ToolStage,
    metadata?: Record<string, unknown>,
    inputOrArgs?: Record<string, unknown> | string
  ): string {
    const invocationLabel = this.resolveToolInvocationLabel(toolName, inputOrArgs);

    if (stage === 'invoking_sub_agent') {
      const subAgentId =
        typeof metadata?.['subAgentId'] === 'string' ? (metadata['subAgentId'] as string) : null;
      return subAgentId ? `Calling sub-agent: ${subAgentId}...` : 'Calling sub-agent...';
    }

    switch (stage) {
      case 'fetching_data':
        return `Fetching data • ${invocationLabel}`;
      case 'processing_media':
        return `Processing media • ${invocationLabel}`;
      case 'uploading_assets':
        return `Uploading assets • ${invocationLabel}`;
      case 'submitting_job':
        return `Submitting • ${invocationLabel}`;
      case 'checking_status':
        return `Checking status • ${invocationLabel}`;
      case 'persisting_result':
        return `Saving results • ${invocationLabel}`;
      case 'deleting_resource':
        return `Deleting resources • ${invocationLabel}`;
      default:
        return invocationLabel;
    }
  }
}
