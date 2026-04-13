/**
 * @fileoverview Agent Router — The Orchestrator
 * @module @nxt1/backend/modules/agent
 *
 * The master orchestrator that:
 * 1. Receives a user intent (plain-text message or structured command).
 * 2. Uses the PlannerAgent to decompose the intent into a DAG of tasks.
 * 3. Executes each task in dependency order by delegating to the correct sub-agent.
 * 4. Streams step updates back via the onUpdate callback.
 * 5. Returns the aggregated result.
 *
 * This class is instantiated once by the worker and re-used across jobs.
 *
 * @example
 * ```ts
 * const router = new AgentRouter(llm, toolRegistry, contextBuilder);
 * const result = await router.run(jobPayload, onUpdate);
 * ```
 */

import type {
  AgentJobPayload,
  AgentJobUpdate,
  AgentPromptContext,
  AgentOperationResult,
  AgentIdentifier,
  AgentTaskStatus,
  AgentTask,
  AgentExecutionPlan,
  AgentSessionContext,
  AgentRetrievedMemories,
  AgentUserContext,
} from '@nxt1/core';
import type { OpenRouterService } from './llm/openrouter.service.js';
import type { ToolRegistry } from './tools/tool-registry.js';
import type { ContextBuilder } from './memory/context-builder.js';
import type { BaseAgent } from './agents/base.agent.js';
import type { SkillRegistry } from './skills/skill-registry.js';
import type { OnStreamEvent } from './queue/event-writer.js';
import { PlannerAgent } from './agents/planner.agent.js';
import { isAgentYield, AgentYieldException } from './errors/agent-yield.error.js';
import { isAgentDelegation } from './errors/agent-delegation.error.js';
import { SemanticCacheService } from './memory/semantic-cache.service.js';
import { ApprovalGateService } from './services/approval-gate.service.js';
import { logger } from '../../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Maximum number of self-correction retries per task.
 * When a coordinator crashes, the router feeds the error back to the agent
 * with an augmented system message, giving it a chance to recover before
 * cascading failure to downstream tasks.
 */
const TASK_MAX_RETRIES = 2;

/**
 * Maximum number of delegation hops before the router gives up.
 * Prevents infinite ping-pong between a coordinator and the Planner.
 */
const MAX_DELEGATION_DEPTH = 2;

// ─── Router ─────────────────────────────────────────────────────────────────

export class AgentRouter {
  private readonly planner: PlannerAgent;
  private readonly agents = new Map<AgentIdentifier, BaseAgent>();
  private readonly semanticCache: SemanticCacheService;

  constructor(
    private readonly llm: OpenRouterService,
    private readonly toolRegistry: ToolRegistry,
    private readonly contextBuilder: ContextBuilder,
    private readonly skillRegistry?: SkillRegistry
  ) {
    this.planner = new PlannerAgent(llm);
    this.semanticCache = new SemanticCacheService(llm);
  }

  /** Register a sub-agent so the router can delegate tasks to it. */
  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.id, agent);
  }

  /**
   * Classify the user's intent and return the best sub-agent identifier.
   * Uses the PlannerAgent to decompose — if it's a single task, returns
   * that task's agent. If multi-task, returns 'router' (meaning: run the full plan).
   */
  async classify(intent: string, userId: string): Promise<AgentIdentifier> {
    const promptContext = await this.contextBuilder.buildPromptContext(userId, intent);
    const context = this.buildSessionContext(userId);
    const enrichedIntent = this.enrichIntentWithContext(
      intent,
      promptContext.profile,
      undefined,
      undefined,
      promptContext.memories
    );

    const result = await this.planner.execute(enrichedIntent, context, []);
    const plan = result.data?.['plan'] as AgentExecutionPlan | undefined;

    if (!plan || plan.tasks.length === 0) return 'general';
    if (plan.tasks.length === 1) return plan.tasks[0].assignedAgent;
    return 'router';
  }

  /**
   * Full execution loop:
   * 1. Build user context from the database.
   * 2. Run the PlannerAgent to create a task DAG.
   * 3. Execute tasks in topological (dependency) order.
   * 4. Aggregate results and return.
   */
  async run(
    payload: AgentJobPayload,
    onUpdate?: (update: AgentJobUpdate) => void,
    firestore?: FirebaseFirestore.Firestore,
    onStreamEvent?: OnStreamEvent
  ): Promise<AgentOperationResult> {
    const { operationId, userId, intent } = payload;
    const approvalGate = firestore ? new ApprovalGateService(firestore) : undefined;

    // ── Resume detection: check if this is a resumed job ──────────────────
    const contextObj =
      typeof payload.context === 'object' && payload.context !== null ? payload.context : {};
    const yieldState = (contextObj as Record<string, unknown>)['yieldState'] as
      | import('@nxt1/core').AgentYieldState
      | undefined;

    if (yieldState) {
      return this.runResumed(payload, yieldState, onUpdate, firestore, onStreamEvent);
    }

    // ── Step 1: Build context ─────────────────────────────────────────────
    this.emitUpdate(onUpdate, operationId, 'thinking', 'Building user context...');

    let promptContext: AgentPromptContext;
    try {
      promptContext = await this.contextBuilder.buildPromptContext(userId, intent, firestore);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Context building failed';
      this.emitUpdate(onUpdate, operationId, 'failed', `Context error: ${message}`);
      return {
        summary: `Failed to build user context: ${message}`,
        suggestions: ['Try again later or contact support.'],
      };
    }

    const userContext = promptContext.profile;

    // Extract threadId for conversation continuity + thread-scoped storage
    // (contextObj already extracted above for resume detection)
    const threadId =
      typeof (contextObj as Record<string, unknown>)['threadId'] === 'string'
        ? ((contextObj as Record<string, unknown>)['threadId'] as string)
        : undefined;

    const context = this.buildSessionContext(userId, payload.sessionId, operationId, threadId);

    // Inject thread history for conversation continuity
    let threadHistoryStr = '';
    if (threadId) {
      try {
        threadHistoryStr = await this.contextBuilder.getRecentThreadHistory(threadId, 20);
      } catch {
        // Thread history is non-critical — continue without it
      }
    }

    const enrichedIntent = this.enrichIntentWithContext(
      intent,
      userContext,
      payload.context,
      threadHistoryStr,
      promptContext.memories
    );

    // ── Direct routing: skip planner when a specific agent is requested ───
    if (payload.agent) {
      const directAgent = this.agents.get(payload.agent);
      if (!directAgent) {
        this.emitUpdate(
          onUpdate,
          operationId,
          'failed',
          `No agent registered for "${payload.agent}".`
        );
        return {
          summary: `No agent registered for "${payload.agent}".`,
          suggestions: ['Check agent configuration or contact support.'],
        };
      }

      this.emitUpdate(onUpdate, operationId, 'acting', `Routing directly to ${payload.agent}...`);

      try {
        let toolDefs = this.toolRegistry.getDefinitions(directAgent.id);

        // Dynamically filter tools by semantic intent matching, if intent embedding succceeds.
        try {
          const intentEmbedding = await this.llm.embed(enrichedIntent);
          // Reassign toolDefs based on RAG. Tools without relevance are trimmed.
          toolDefs = await this.toolRegistry.match(
            intentEmbedding,
            (t) => this.llm.embed(t),
            directAgent.id
          );
        } catch {
          // Ensure we don't blow up DAG execution if embedding service is down.
        }

        const result = await directAgent.execute(
          enrichedIntent,
          context,
          toolDefs,
          this.llm,
          this.toolRegistry,
          this.skillRegistry,
          onStreamEvent,
          approvalGate
        );

        this.emitUpdate(onUpdate, operationId, 'completed', result.summary);
        return result;
      } catch (err) {
        // Let AgentYieldException propagate to the worker for suspend-and-resume
        if (isAgentYield(err)) throw err;

        // ── Delegation Handoff ────────────────────────────────────────────
        // A sub-agent called delegate_task because the request is outside
        // its domain. Re-dispatch through the PlannerAgent for proper routing.
        if (isAgentDelegation(err)) {
          const delegationCount =
            (typeof (contextObj as Record<string, unknown>)['delegationCount'] === 'number'
              ? ((contextObj as Record<string, unknown>)['delegationCount'] as number)
              : 0) + 1;

          if (delegationCount > MAX_DELEGATION_DEPTH) {
            logger.warn('[AgentRouter] Delegation depth exceeded — aborting', {
              operationId,
              delegationCount,
              sourceAgent: payload.agent,
            });
            this.emitUpdate(onUpdate, operationId, 'failed', 'Unable to route this request.');
            return {
              summary:
                "I'm having trouble finding the right specialist for this request. " +
                'Please try rephrasing or submit it from the main Agent X chat.',
              suggestions: ['Try asking from the main Agent X input bar.'],
            };
          }

          logger.info('[AgentRouter] Delegation handoff — re-dispatching through Planner', {
            operationId,
            sourceAgent: payload.agent,
            forwardingIntent: err.payload.forwardingIntent.slice(0, 100),
            delegationCount,
          });

          this.emitUpdate(
            onUpdate,
            operationId,
            'thinking',
            'Transferring your request to the right specialist...'
          );

          // Re-dispatch with agent lock removed so the Planner takes over.
          // Append a routing hint so the Planner avoids the agent that just bailed.
          const sourceAgentId = payload.agent ?? err.payload.sourceAgent;
          const routingHint = sourceAgentId
            ? `\n\n[System: The "${sourceAgentId}" agent could not handle this. Route to a different specialist.]`
            : '';

          const delegatedPayload: AgentJobPayload = {
            ...payload,
            agent: undefined,
            intent: `${err.payload.forwardingIntent}${routingHint}`,
            context: {
              ...contextObj,
              delegationCount,
              delegatedFrom: payload.agent,
            },
          };

          return this.run(delegatedPayload, onUpdate, firestore, onStreamEvent);
        }

        const message = err instanceof Error ? err.message : 'Agent execution failed';
        this.emitUpdate(onUpdate, operationId, 'failed', message);
        return {
          summary: `Agent ${payload.agent} failed: ${message}`,
          suggestions: ['Try again later or contact support.'],
        };
      }
    }

    // ── Semantic Cache: check for near-identical recent answers ────────────
    // This intercepts before the Planner fires, saving LLM tokens and latency.
    // Only applies to non-resumed, non-direct-agent jobs.
    // When a hit is found, the raw cached response is personalized for the
    // current user via a fast micro-LLM pass (the "Synthesizer Pattern").
    try {
      const cacheHit = await this.semanticCache.check(intent);
      if (cacheHit) {
        logger.info('[AgentRouter] Semantic cache hit — personalizing for user', {
          operationId,
          score: cacheHit.score,
          cachedIntent: cacheHit.cachedIntent.slice(0, 80),
          userId,
        });

        this.emitUpdate(
          onUpdate,
          operationId,
          'thinking',
          'Found a cached answer — personalizing...'
        );

        // Fast personalizer: rewrites the cached summary for this user's
        // name, sport, position, and role. Uses the `fast` tier (~300ms)
        // instead of re-running the full DAG (~10-15s).
        const personalized = await this.semanticCache.personalize(
          cacheHit.result,
          userContext,
          intent,
          operationId
        );

        this.emitUpdate(onUpdate, operationId, 'completed', personalized.summary);
        return personalized;
      }
    } catch {
      // Cache check is best-effort — continue to the Planner on failure
    }

    // ── Step 2: Plan ──────────────────────────────────────────────────────
    this.emitUpdate(onUpdate, operationId, 'thinking', 'Decomposing your request into tasks...');

    let planResult: AgentOperationResult;
    try {
      planResult = await this.planner.execute(enrichedIntent, context, []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Planning failed';
      this.emitUpdate(onUpdate, operationId, 'failed', `Planning error: ${message}`);
      return {
        summary: `Failed to create execution plan: ${message}`,
        suggestions: ['Try rephrasing your request or try again later.'],
      };
    }

    const plan = planResult.data?.['plan'] as AgentExecutionPlan | undefined;

    if (!plan || plan.tasks.length === 0) {
      return {
        summary: 'Could not create an execution plan for this request.',
        suggestions: ['Try rephrasing your request with more detail.'],
      };
    }

    this.emitUpdate(
      onUpdate,
      operationId,
      'acting',
      `Plan: ${plan.tasks.length} task(s) — ${planResult.summary}`,
      { eventType: 'plan_created', taskCount: plan.tasks.length }
    );

    // Stream a rich planner card so the frontend renders an interactive checklist
    if (onStreamEvent && plan.tasks.length > 0) {
      onStreamEvent({
        type: 'card',
        cardData: {
          type: 'planner',
          title: 'Execution Plan',
          payload: {
            items: plan.tasks.map((t) => ({
              id: t.id,
              label: t.description,
              done: false,
            })),
          },
        },
      });
    }

    // ── Step 3: Execute tasks in dependency order ─────────────────────────
    const taskResults = new Map<string, AgentOperationResult>();
    const mutableTasks = plan.tasks.map((t) => ({
      ...t,
      _lastError: undefined as string | undefined,
    })) as Array<AgentTask & { status: AgentTaskStatus; _lastError?: string }>;

    while (this.hasPendingTasks(mutableTasks)) {
      // Find tasks whose dependencies are all completed
      const ready = mutableTasks.filter(
        (t) =>
          t.status === 'pending' &&
          t.dependsOn.every(
            (dep) => mutableTasks.find((mt) => mt.id === dep)?.status === 'completed'
          )
      );

      if (ready.length === 0) {
        // All remaining tasks have unmet dependencies (shouldn't happen with DAG validation)
        break;
      }

      // Execute ready tasks sequentially (parallel execution is a future optimization)
      for (const task of ready) {
        task.status = 'in_progress' as AgentTaskStatus;
        this.emitUpdate(
          onUpdate,
          operationId,
          'acting',
          `Running task ${task.id}: ${task.description}`,
          { eventType: 'task_started', taskId: task.id }
        );

        for (let attempt = 0; attempt <= TASK_MAX_RETRIES; attempt++) {
          try {
            const agent = this.agents.get(task.assignedAgent);
            if (!agent) {
              throw new Error(`No agent registered for "${task.assignedAgent}".`);
            }

            // Build the intent for this specific task, enriched with upstream results
            // and the original job context (user profile, linked account URLs, etc.)
            let taskIntent = this.buildTaskIntent(task, taskResults, enrichedIntent);

            // On retry attempts, augment the intent with the previous error so the
            // coordinator can self-correct (e.g. use a different tool or approach).
            if (attempt > 0 && task._lastError) {
              taskIntent +=
                `\n\n[System Intervention — Retry ${attempt}/${TASK_MAX_RETRIES}]\n` +
                `Your previous execution of this task failed with the following error:\n` +
                `"${task._lastError}"\n` +
                `Please formulate an alternative strategy to accomplish this task. ` +
                `Use a different tool, adjust your parameters, or if the task is ` +
                `truly impossible, explain why clearly.`;

              logger.warn('[AgentRouter] Self-correction retry', {
                taskId: task.id,
                agent: task.assignedAgent,
                attempt,
                previousError: task._lastError,
              });

              this.emitUpdate(
                onUpdate,
                operationId,
                'acting',
                `Task ${task.id}: retrying (attempt ${attempt + 1}/${TASK_MAX_RETRIES + 1})...`,
                { eventType: 'task_retry', taskId: task.id, attempt }
              );
            }

            // Dynamic Tool RAG: filter tools by semantic relevance to this task's intent
            let toolDefs = this.toolRegistry.getDefinitions(agent.id);
            try {
              const intentEmbedding = await this.llm.embed(taskIntent);
              toolDefs = await this.toolRegistry.match(
                intentEmbedding,
                (t) => this.llm.embed(t),
                agent.id
              );
            } catch {
              // Embedding unavailable — fall back to all permitted tools
            }

            const result = await agent.execute(
              taskIntent,
              context,
              toolDefs,
              this.llm,
              this.toolRegistry,
              this.skillRegistry,
              onStreamEvent,
              approvalGate
            );

            taskResults.set(task.id, result);
            task.status = 'completed' as AgentTaskStatus;
            this.emitUpdate(
              onUpdate,
              operationId,
              'acting',
              `Task ${task.id} completed: ${result.summary}`
            );

            // Re-emit the planner card with updated done states so the UI
            // checklist ticks off items in real-time as tasks finish.
            if (onStreamEvent) {
              onStreamEvent({
                type: 'card',
                cardData: {
                  type: 'planner',
                  title: 'Execution Plan',
                  payload: {
                    items: mutableTasks.map((t) => ({
                      id: t.id,
                      label: t.description,
                      done: t.status === ('completed' as AgentTaskStatus),
                    })),
                  },
                },
              });
            }

            break; // Success — exit retry loop
          } catch (err) {
            // Attach DAG plan context to yield exceptions so the resume route
            // can reconstruct the partial plan state and continue from here.
            if (isAgentYield(err)) {
              const yieldErr = err as AgentYieldException;
              throw new AgentYieldException({
                ...yieldErr.payload,
                planContext: {
                  currentTaskId: task.id,
                  completedTaskResults: Object.fromEntries(
                    [...taskResults.entries()].map(([k, v]) => [k, v])
                  ),
                  enrichedIntent,
                },
              });
            }

            // In the DAG path, delegation means the Planner mis-routed a task.
            // Treat it as an immediate task failure (no retries — the same agent
            // would just delegate again).
            if (isAgentDelegation(err)) {
              const delErr =
                err as import('./errors/agent-delegation.error.js').AgentDelegationException;
              logger.warn(
                `[AgentRouter] Agent "${task.assignedAgent}" delegated inside DAG — treating as task failure`,
                {
                  operationId,
                  taskId: task.id,
                  forwardingIntent: delErr.payload.forwardingIntent.slice(0, 100),
                }
              );
              task.status = 'failed' as AgentTaskStatus;
              this.emitUpdate(
                onUpdate,
                operationId,
                'acting',
                `Task ${task.id} was misrouted — ${task.assignedAgent} could not handle it.`
              );
              this.cascadeFailure(task.id, mutableTasks);
              break; // Exit retry loop
            }

            const message = err instanceof Error ? err.message : 'Unknown error';

            // Store the error for the next retry attempt's augmented prompt
            task._lastError = message;

            // If this was the last retry, cascade failure
            if (attempt === TASK_MAX_RETRIES) {
              task.status = 'failed' as AgentTaskStatus;
              this.emitUpdate(
                onUpdate,
                operationId,
                'acting',
                `Task ${task.id} failed after ${TASK_MAX_RETRIES + 1} attempts: ${message}`
              );

              // Cascade failure to all downstream dependents
              this.cascadeFailure(task.id, mutableTasks);
            }
          }
        }
      }
    }

    // ── Step 4: Aggregate results ─────────────────────────────────────────
    this.emitUpdate(onUpdate, operationId, 'completed', 'All tasks finished.');

    const summaries = [...taskResults.values()].map((r) => r.summary);
    const allSuggestions = [...taskResults.values()].flatMap((r) => r.suggestions ?? []);

    const aggregatedResult: AgentOperationResult = {
      summary: summaries.join('\n\n'),
      data: {
        plan,
        taskResults: Object.fromEntries(taskResults),
      },
      suggestions: allSuggestions.length > 0 ? allSuggestions : undefined,
    };

    // ── Semantic Cache: store the successful result for future cache hits ──
    // Only cache if ALL tasks completed (no partial failures).
    const allCompleted = mutableTasks.every((t) => t.status === 'completed');
    if (allCompleted && taskResults.size > 0) {
      // Fire-and-forget — never block the response for cache storage
      this.semanticCache.store(intent, aggregatedResult).catch(() => {
        /* noop */
      });
    }

    return aggregatedResult;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Resume a previously yielded job by re-running the agent with the
   * saved message array (which now includes the user's response).
   */
  private async runResumed(
    payload: AgentJobPayload,
    yieldState: import('@nxt1/core').AgentYieldState,
    onUpdate?: (update: AgentJobUpdate) => void,
    firestore?: FirebaseFirestore.Firestore,
    onStreamEvent?: OnStreamEvent
  ): Promise<AgentOperationResult> {
    const { operationId, userId, intent } = payload;
    this.emitUpdate(onUpdate, operationId, 'acting', 'Resuming from your response...');

    // Resolve the agent that was executing when the yield happened
    const agent = this.agents.get(yieldState.agentId);
    if (!agent) {
      this.emitUpdate(
        onUpdate,
        operationId,
        'failed',
        `Cannot resume: no agent registered for "${yieldState.agentId}".`
      );
      return {
        summary: `Cannot resume: agent "${yieldState.agentId}" is not registered.`,
        suggestions: ['Contact support or try submitting the request again.'],
      };
    }

    // Build user context for the resumed execution
    let promptContext: AgentPromptContext | undefined;
    try {
      promptContext = await this.contextBuilder.buildPromptContext(userId, intent, firestore);
    } catch {
      // Non-critical — resume with whatever context we have
      promptContext = {
        profile: { userId } as AgentUserContext,
        memories: { user: [], team: [], organization: [] },
      };
    }

    const userContext = promptContext.profile;

    const resumeContextObj =
      typeof payload.context === 'object' && payload.context !== null ? payload.context : {};
    const resumeThreadId =
      typeof (resumeContextObj as Record<string, unknown>)['threadId'] === 'string'
        ? ((resumeContextObj as Record<string, unknown>)['threadId'] as string)
        : undefined;

    const context = this.buildSessionContext(
      userId,
      payload.sessionId,
      operationId,
      resumeThreadId
    );
    const approvalId =
      typeof (resumeContextObj as Record<string, unknown>)['approvalId'] === 'string'
        ? ((resumeContextObj as Record<string, unknown>)['approvalId'] as string)
        : undefined;
    const enrichedIntent = this.enrichIntentWithContext(
      intent,
      userContext,
      payload.context,
      undefined,
      promptContext.memories
    );
    const approvalGate = firestore ? new ApprovalGateService(firestore) : undefined;

    try {
      let toolDefs = this.toolRegistry.getDefinitions(agent.id);

      try {
        const intentEmbedding = await this.llm.embed(enrichedIntent);
        toolDefs = await this.toolRegistry.match(
          intentEmbedding,
          (t) => this.llm.embed(t),
          agent.id
        );
      } catch {
        // Ignore embedding failures during resume and pass all possible tools.
      }

      const result = await agent.resumeExecution(
        yieldState,
        context,
        toolDefs,
        this.llm,
        this.toolRegistry,
        this.skillRegistry,
        onStreamEvent,
        approvalGate,
        approvalId
      );

      this.emitUpdate(onUpdate, operationId, 'completed', result.summary);
      return result;
    } catch (err) {
      if (isAgentYield(err)) throw err;
      const message = err instanceof Error ? err.message : 'Resume execution failed';
      this.emitUpdate(onUpdate, operationId, 'failed', message);
      return {
        summary: `Resumed agent "${yieldState.agentId}" failed: ${message}`,
        suggestions: ['Try again later or contact support.'],
      };
    }
  }

  /**
   * Enrich the raw user intent with compressed profile context
   * and any structured job context (e.g. linked account URLs from onboarding).
   * This ensures the planner and sub-agents know who the user is
   * and have all the data needed to execute the request.
   */
  private enrichIntentWithContext(
    intent: string,
    userContext: AgentUserContext,
    jobContext?: Record<string, unknown>,
    threadHistory?: string,
    memories: AgentRetrievedMemories = { user: [], team: [], organization: [] }
  ): string {
    const contextStr = this.contextBuilder.compressToPrompt(userContext, memories);
    let enriched = `[User Profile]\n${contextStr}`;

    // Inject structured job context so the LLM has URLs, platform names, etc.
    if (jobContext && Object.keys(jobContext).length > 0) {
      // Exclude internal keys from being shown to the LLM
      const { threadId: _threadId, ...visibleContext } = jobContext;
      if (Object.keys(visibleContext).length > 0) {
        enriched += `\n\n[Job Context]\n${JSON.stringify(visibleContext, null, 2)}`;
      }
    }

    // Inject recent conversation history for continuity
    if (threadHistory) {
      enriched += `\n${threadHistory}`;
    }

    enriched += `\n\n[Request]\n${intent}`;
    return enriched;
  }

  private hasPendingTasks(tasks: readonly (AgentTask & { status: AgentTaskStatus })[]): boolean {
    return tasks.some((t) => t.status === 'pending');
  }

  /**
   * Build the intent string for a sub-task, injecting:
   * 1. The original enriched context (user profile, linked account URLs, job metadata).
   * 2. Results from upstream dependency tasks.
   * 3. The task's own description.
   *
   * This ensures every sub-agent has the full context it needs — especially
   * URLs, userId, sport, and other structured data from the job context.
   */
  private buildTaskIntent(
    task: AgentTask,
    upstreamResults: Map<string, AgentOperationResult>,
    enrichedContext?: string
  ): string {
    const parts: string[] = [];

    // Include the original enriched context so sub-agents have user profile,
    // linked account URLs, userId, sport, and other job metadata.
    if (enrichedContext) {
      parts.push(enrichedContext);
    }

    // Include results from upstream dependency tasks
    if (task.dependsOn.length > 0) {
      for (const depId of task.dependsOn) {
        const depResult = upstreamResults.get(depId);
        if (depResult) {
          parts.push(`[Result from task ${depId}]: ${depResult.summary}`);
        }
      }
    }

    // The specific task instruction
    parts.push(`[Current Task]\n${task.description}`);

    return parts.join('\n\n');
  }

  /** Build a minimal session context. */
  private buildSessionContext(
    userId: string,
    sessionId?: string,
    operationId?: string,
    threadId?: string
  ): AgentSessionContext {
    const now = new Date().toISOString();
    return {
      sessionId: sessionId ?? crypto.randomUUID(),
      userId,
      conversationHistory: [],
      createdAt: now,
      lastActiveAt: now,
      ...(operationId && { operationId }),
      ...(threadId && { threadId }),
    };
  }

  /** Emit a step update to the onUpdate callback (for SSE / Firestore). */
  private emitUpdate(
    onUpdate: ((update: AgentJobUpdate) => void) | undefined,
    operationId: string,
    status: AgentJobUpdate['status'],
    message: string,
    payload?: Record<string, unknown>
  ): void {
    if (!onUpdate) return;
    onUpdate({
      operationId,
      status,
      step: {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        status,
        message,
        payload,
      },
    });
  }

  /**
   * Cascade 'failed' status to all tasks that directly or transitively
   * depend on a failed task, so they are not left as 'pending' forever.
   */
  private cascadeFailure(
    failedTaskId: string,
    tasks: Array<AgentTask & { status: AgentTaskStatus }>
  ): void {
    const queue = [failedTaskId];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const task of tasks) {
        if (task.status === 'pending' && task.dependsOn.includes(currentId)) {
          task.status = 'failed' as AgentTaskStatus;
          queue.push(task.id);
        }
      }
    }
  }
}
