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
  AgentProgressMetadata,
  AgentPromptContext,
  AgentOperationResult,
  AgentIdentifier,
  AgentRouterStage,
  AgentTaskStatus,
  AgentTask,
  AgentExecutionPlan,
  OperationOutcomeCode,
  AgentSessionContext,
  AgentSessionMessage,
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
import { isAgentYield, AgentYieldException } from './exceptions/agent-yield.exception.js';
import { isAgentDelegation } from './exceptions/agent-delegation.exception.js';
import { AgentEngineError } from './exceptions/agent-engine.error.js';
import { SemanticCacheService } from './memory/semantic-cache.service.js';
import { SessionMemoryService } from './memory/session.service.js';
import { ApprovalGateService } from './services/approval-gate.service.js';
import { parallelBatch } from './utils/parallel-batch.js';
import { getAgentRunConfig, DEFAULT_AGENT_RUN_CONFIG } from './config/agent-app-config.js';
import { logger } from '../../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Fallback values used when Firestore `AppConfig/agentConfig` is absent.
 * Live values are read per-run from Firestore via getAgentRunConfig().
 * These are only referenced by DEFAULT_AGENT_RUN_CONFIG in agent-app-config.ts.
 */

type MutableAgentTask = AgentTask & {
  status: AgentTaskStatus;
  _lastError?: string;
};

// ─── Router ─────────────────────────────────────────────────────────────────

export class AgentRouter {
  private readonly planner: PlannerAgent;
  private readonly agents = new Map<AgentIdentifier, BaseAgent>();
  private readonly semanticCache: SemanticCacheService;

  constructor(
    private readonly llm: OpenRouterService,
    private readonly toolRegistry: ToolRegistry,
    private readonly contextBuilder: ContextBuilder,
    private readonly skillRegistry?: SkillRegistry,
    private readonly sessionMemory?: SessionMemoryService
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
      promptContext.memories,
      promptContext.recentSyncSummaries ?? []
    );

    const result = await this.planner.execute(enrichedIntent, context, []);
    const plan = result.data?.['plan'] as AgentExecutionPlan | undefined;

    if (!plan || plan.tasks.length === 0) return 'strategy_coordinator';
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
    onStreamEvent?: OnStreamEvent,
    environment: 'staging' | 'production' = 'production',
    signal?: AbortSignal
  ): Promise<AgentOperationResult> {
    const { operationId, userId, intent } = payload;
    const approvalGate = firestore ? new ApprovalGateService(firestore) : undefined;

    // ── Load runtime config from AppConfig/agentConfig ────────────────────
    const agentRunConfig = firestore
      ? await getAgentRunConfig(firestore)
      : DEFAULT_AGENT_RUN_CONFIG;
    const taskMaxRetries = agentRunConfig.taskMaxRetries;
    const maxDelegationDepth = agentRunConfig.maxDelegationDepth;

    // ── Resume detection: check if this is a resumed job ──────────────────
    const contextObj =
      typeof payload.context === 'object' && payload.context !== null ? payload.context : {};
    const yieldState = (contextObj as Record<string, unknown>)['yieldState'] as
      | import('@nxt1/core').AgentYieldState
      | undefined;

    if (yieldState) {
      return this.runResumed(payload, yieldState, onUpdate, firestore, onStreamEvent, environment);
    }

    // ── Step 1: Build context ─────────────────────────────────────────────
    this.emitUpdate(onUpdate, operationId, 'thinking', 'Building user context...', undefined, {
      agentId: 'router',
      stage: 'building_context',
    });

    let promptContext: AgentPromptContext;
    try {
      promptContext = await this.contextBuilder.buildPromptContext(userId, intent, firestore);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Context building failed';
      this.emitUpdate(onUpdate, operationId, 'failed', `Context error: ${message}`, undefined, {
        agentId: 'router',
        stage: 'building_context',
        outcomeCode: 'context_build_failed',
      });
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

    // Extract SSE-specific context fields injected by the chat route
    const mode =
      typeof (contextObj as Record<string, unknown>)['mode'] === 'string'
        ? ((contextObj as Record<string, unknown>)['mode'] as string)
        : undefined;
    const attachments = Array.isArray((contextObj as Record<string, unknown>)['attachments'])
      ? ((contextObj as Record<string, unknown>)['attachments'] as readonly {
          url: string;
          mimeType: string;
        }[])
      : undefined;
    const videoAttachments = Array.isArray(
      (contextObj as Record<string, unknown>)['videoAttachments']
    )
      ? ((contextObj as Record<string, unknown>)['videoAttachments'] as readonly {
          url: string;
          mimeType: string;
          name: string;
        }[])
      : undefined;

    // ── Session Memory: hydrate prior conversation turns from Redis ─────────
    // getOrCreate runs BEFORE the user message is appended so conversationHistory
    // contains only prior turns — never the current message (no duplication).
    let sessionContext: AgentSessionContext | undefined;
    if (this.sessionMemory) {
      try {
        sessionContext = await this.sessionMemory.getOrCreate(userId, threadId);
      } catch (err) {
        logger.warn(
          '[AgentRouter] Session memory getOrCreate failed — continuing without history',
          {
            userId,
            threadId,
            error: err instanceof Error ? err.message : String(err),
          }
        );
      }
    }

    const context = this.buildSessionContext(
      userId,
      sessionContext?.sessionId ?? payload.sessionId,
      operationId,
      threadId,
      environment,
      signal,
      mode,
      attachments,
      videoAttachments,
      sessionContext?.conversationHistory
    );

    // Append user message to Redis BEFORE the DAG runs.
    // This is awaited (not fire-and-forget) so any concurrent request reading
    // the same thread session sees this turn in the history.
    if (this.sessionMemory && threadId) {
      try {
        await this.sessionMemory.appendMessage(userId, threadId, {
          role: 'user',
          content: intent,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        logger.warn('[AgentRouter] Failed to append user message to session', {
          userId,
          threadId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Inject thread history for conversation continuity (belt-and-suspenders
    // during rollout — can be removed once Redis session memory is stable)
    let threadHistoryStr = '';
    if (threadId) {
      try {
        threadHistoryStr = await this.contextBuilder.getRecentThreadHistory(threadId, 20);
      } catch {
        // Thread history is non-critical — continue without it
      }
    }

    // Inject cross-thread awareness so the agent can answer questions like
    // "what were our recent chats about?" even in a brand-new thread.
    let activeThreadsSummary = '';
    try {
      activeThreadsSummary = await this.contextBuilder.getActiveThreadsSummary(userId, 8);
    } catch {
      // Non-critical — continue without it
    }

    const enrichedIntent = this.enrichIntentWithContext(
      intent,
      userContext,
      payload.context,
      threadHistoryStr,
      promptContext.memories,
      promptContext.recentSyncSummaries ?? [],
      activeThreadsSummary
    );

    // ── Direct routing: skip planner when a specific agent is requested ───
    if (payload.agent) {
      const directAgentId = payload.agent;
      const directAgent = this.agents.get(directAgentId);
      if (!directAgent) {
        this.emitUpdate(
          onUpdate,
          operationId,
          'failed',
          `No agent registered for "${directAgentId}".`,
          undefined,
          {
            agentId: 'router',
            stage: 'routing_to_agent',
            outcomeCode: 'routing_failed',
            metadata: { targetAgentId: directAgentId },
          }
        );
        return {
          summary: `No agent registered for "${directAgentId}".`,
          suggestions: ['Check agent configuration or contact support.'],
        };
      }

      this.emitUpdate(
        onUpdate,
        operationId,
        'acting',
        `Routing directly to ${directAgentId}...`,
        undefined,
        {
          agentId: directAgentId,
          stage: 'routing_to_agent',
          metadata: { targetAgentId: directAgentId },
        }
      );

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

        this.emitUpdate(onUpdate, operationId, 'completed', result.summary, undefined, {
          agentId: directAgentId,
          stage: 'agent_thinking',
          outcomeCode: 'success_default',
          metadata: { executionMode: 'direct' },
        });
        this.appendAssistantMessage(userId, threadId, result.summary);
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

          if (delegationCount > maxDelegationDepth) {
            logger.warn('[AgentRouter] Delegation depth exceeded — aborting', {
              operationId,
              delegationCount,
              sourceAgent: directAgentId,
            });
            this.emitUpdate(
              onUpdate,
              operationId,
              'failed',
              'Unable to route this request.',
              undefined,
              {
                agentId: 'router',
                stage: 'routing_to_agent',
                outcomeCode: 'routing_failed',
              }
            );
            return {
              summary:
                "I'm having trouble finding the right specialist for this request. " +
                'Please try rephrasing or submit it from the main Agent X chat.',
              suggestions: ['Try asking from the main Agent X input bar.'],
            };
          }

          logger.info('[AgentRouter] Delegation handoff — re-dispatching through Planner', {
            operationId,
            sourceAgent: directAgentId,
            forwardingIntent: err.payload.forwardingIntent.slice(0, 100),
            delegationCount,
          });

          this.emitUpdate(
            onUpdate,
            operationId,
            'thinking',
            'Transferring your request to the right specialist...',
            undefined,
            {
              agentId: 'router',
              stage: 'routing_to_agent',
            }
          );

          // Re-dispatch with agent lock removed so the Planner takes over.
          // Append a routing hint so the Planner avoids the agent that just bailed.
          const sourceAgentId = (payload.agent ?? err.payload.sourceAgent) as AgentIdentifier;
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
              delegatedFrom: directAgentId,
            },
          };

          return this.run(delegatedPayload, onUpdate, firestore, onStreamEvent);
        }

        // Re-throw AbortError so the caller (chat.routes.ts) detects the abort
        // and skips persisting a fake failure message to the thread history.
        if (err instanceof Error && err.name === 'AbortError') throw err;

        const message = err instanceof Error ? err.message : 'Agent execution failed';
        this.emitUpdate(onUpdate, operationId, 'failed', message, undefined, {
          agentId: directAgentId,
          stage: 'agent_thinking',
          outcomeCode: 'task_failed',
          metadata: { executionMode: 'direct' },
        });
        return {
          summary: `Agent ${directAgentId} failed: ${message}`,
          suggestions: ['Try again later or contact support.'],
        };
      }
    }

    // ── Semantic Cache: check for near-identical recent answers ────────────
    // This intercepts before the Planner fires, saving LLM tokens and latency.
    // Only applies to non-resumed, non-direct-agent jobs.
    // When a hit is found, the raw cached response is personalized for the
    // current user via a fast micro-LLM pass (the "Synthesizer Pattern").
    // The intent is scoped by [role|sport] to prevent cross-role cache pollution
    // (e.g. an athlete answer being served to a coach for the same raw intent).
    const scopedIntent = this.buildScopedCacheKey(intent, userContext);
    try {
      const cacheHit = await this.semanticCache.check(scopedIntent);
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
          'Found a cached answer — personalizing...',
          undefined,
          {
            agentId: 'router',
            stage: 'agent_thinking',
            metadata: { source: 'semantic_cache' },
          }
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

        this.emitUpdate(onUpdate, operationId, 'completed', personalized.summary, undefined, {
          agentId: 'router',
          stage: 'agent_thinking',
          outcomeCode: 'success_default',
          metadata: { source: 'semantic_cache' },
        });
        return personalized;
      }
    } catch {
      // Cache check is best-effort — continue to the Planner on failure
    }

    // ── Step 2: Plan ──────────────────────────────────────────────────────
    this.emitUpdate(
      onUpdate,
      operationId,
      'thinking',
      'Decomposing your request into tasks...',
      undefined,
      {
        agentId: 'router',
        stage: 'decomposing_intent',
      }
    );

    let planResult: AgentOperationResult;
    try {
      planResult = await this.planner.execute(enrichedIntent, context, []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Planning failed';
      this.emitUpdate(onUpdate, operationId, 'failed', `Planning error: ${message}`, undefined, {
        agentId: 'router',
        stage: 'decomposing_intent',
        outcomeCode: 'planning_failed',
      });
      return {
        summary: `Failed to create execution plan: ${message}`,
        suggestions: ['Try rephrasing your request or try again later.'],
      };
    }

    const plan = planResult.data?.['plan'] as AgentExecutionPlan | undefined;

    if (!plan || plan.tasks.length === 0) {
      this.emitUpdate(
        onUpdate,
        operationId,
        'failed',
        'Could not create an execution plan for this request.',
        undefined,
        {
          agentId: 'router',
          stage: 'decomposing_intent',
          outcomeCode: 'planning_failed',
        }
      );
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
      { eventType: 'plan_created', taskCount: plan.tasks.length },
      {
        agentId: 'router',
        stage: 'routing_to_agent',
        metadata: { taskCount: plan.tasks.length },
      }
    );

    // Stream a rich planner card so the frontend renders an interactive checklist
    if (onStreamEvent && plan.tasks.length > 0) {
      onStreamEvent({
        type: 'card',
        cardData: {
          agentId: 'router',
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
    })) as MutableAgentTask[];

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
        for (const task of mutableTasks) {
          if (task.status === 'pending') {
            task.status = 'failed' as AgentTaskStatus;
            task._lastError =
              'Execution plan stalled because remaining tasks had unmet dependencies.';
          }
        }
        break;
      }

      // ── Parallel DAG frontier execution ───────────────────────────────────
      // Tasks in `ready` have no remaining dependencies — they can all run
      // concurrently. Capped at 5 to match WORKER_CONCURRENCY and bound LLM load.
      // Each task owns its own status/error mutations (safe in single-threaded JS).
      // cascadeFailure is idempotent so concurrent failures on shared dependents are safe.

      // Mark all frontier tasks as in_progress and announce them before the batch starts.
      for (const task of ready) {
        task.status = 'in_progress' as AgentTaskStatus;
        this.emitUpdate(
          onUpdate,
          operationId,
          'acting',
          `Running task ${task.id}: ${task.description}`,
          { eventType: 'task_started', taskId: task.id },
          {
            agentId: task.assignedAgent,
            stage: 'agent_thinking',
            metadata: { taskId: task.id },
          }
        );
      }

      // Snapshot completedTaskResults for yield exception payloads — consistent
      // across all parallel workers regardless of which task yields first.
      const completedAtBatchStart = Object.fromEntries(
        [...taskResults.entries()].map(([k, v]) => [k, v])
      );

      // Per-task async worker — runs the full retry loop for one DAG task.
      const runTask = async (task: MutableAgentTask): Promise<void> => {
        for (let attempt = 0; attempt <= taskMaxRetries; attempt++) {
          try {
            const assignedAgentId = task.assignedAgent;
            const agent = this.agents.get(assignedAgentId);
            if (!agent) {
              throw new AgentEngineError(
                'AGENT_NOT_REGISTERED',
                `No agent registered for "${assignedAgentId}".`,
                { metadata: { assignedAgentId, taskId: task.id } }
              );
            }

            let taskIntent = this.buildTaskIntent(task, taskResults, enrichedIntent);

            if (attempt > 0 && task._lastError) {
              taskIntent +=
                `\n\n[System Intervention — Retry ${attempt}/${taskMaxRetries}]\n` +
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
                `Task ${task.id}: retrying (attempt ${attempt + 1}/${taskMaxRetries + 1})...`,
                { eventType: 'task_retry', taskId: task.id, attempt },
                {
                  agentId: task.assignedAgent,
                  stage: 'agent_thinking',
                  metadata: { taskId: task.id, attempt },
                }
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
              `Task ${task.id} completed: ${result.summary}`,
              undefined,
              {
                agentId: task.assignedAgent,
                stage: 'agent_thinking',
                metadata: { taskId: task.id },
              }
            );

            // Re-emit the planner card with updated done states.
            if (onStreamEvent) {
              onStreamEvent({
                type: 'card',
                cardData: {
                  agentId: 'router',
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

            return; // Success — exit retry loop
          } catch (err) {
            // Attach plan context to yield exceptions so the resume route can
            // reconstruct from the correct DAG snapshot.
            if (isAgentYield(err)) {
              const yieldErr = err as AgentYieldException;
              throw new AgentYieldException({
                ...yieldErr.payload,
                planContext: {
                  currentTaskId: task.id,
                  completedTaskResults: completedAtBatchStart,
                  enrichedIntent,
                },
              });
            }

            // Delegation inside the DAG = mis-routed task — treat as failure.
            if (isAgentDelegation(err)) {
              const delErr =
                err as import('./exceptions/agent-delegation.exception.js').AgentDelegationException;
              logger.warn(
                `[AgentRouter] Agent "${task.assignedAgent}" delegated inside DAG — treating as task failure`,
                {
                  operationId,
                  taskId: task.id,
                  forwardingIntent: delErr.payload.forwardingIntent.slice(0, 100),
                }
              );
              task._lastError = `Delegated back to router: ${delErr.payload.forwardingIntent}`;
              task.status = 'failed' as AgentTaskStatus;
              this.emitUpdate(
                onUpdate,
                operationId,
                'acting',
                `Task ${task.id} was misrouted — ${task.assignedAgent} could not handle it.`,
                {
                  eventType: 'task_failed',
                  taskId: task.id,
                  assignedAgent: task.assignedAgent,
                  error: task._lastError,
                },
                {
                  agentId: 'router',
                  stage: 'routing_to_agent',
                  outcomeCode: 'routing_failed',
                  metadata: {
                    taskId: task.id,
                    delegatedAgentId: task.assignedAgent,
                  },
                }
              );
              this.cascadeFailure(task.id, mutableTasks);
              return; // No retries for delegation failures
            }

            const message = err instanceof Error ? err.message : 'Unknown error';
            task._lastError = message;

            if (attempt === taskMaxRetries) {
              task.status = 'failed' as AgentTaskStatus;
              logger.error('[AgentRouter] Task failed after retries exhausted', {
                operationId,
                taskId: task.id,
                assignedAgent: task.assignedAgent,
                attempts: taskMaxRetries + 1,
                error: message,
              });
              this.emitUpdate(
                onUpdate,
                operationId,
                'acting',
                `Task ${task.id} failed after ${taskMaxRetries + 1} attempts: ${message}`,
                {
                  eventType: 'task_failed',
                  taskId: task.id,
                  assignedAgent: task.assignedAgent,
                  attempts: taskMaxRetries + 1,
                  error: message,
                },
                {
                  agentId: task.assignedAgent,
                  stage: 'agent_thinking',
                  outcomeCode: 'task_failed',
                  metadata: {
                    taskId: task.id,
                    attempts: taskMaxRetries + 1,
                  },
                }
              );
              this.cascadeFailure(task.id, mutableTasks);
            }
          }
        }
      };

      const frontierResults = await parallelBatch(ready, runTask, { concurrency: 5 });

      // Rethrow the first yield exception if any task in this frontier yielded.
      // Yield suspends the entire job, so sibling task results are already in taskResults.
      for (const fr of frontierResults) {
        if (fr.status === 'rejected' && isAgentYield(fr.reason)) {
          throw fr.reason;
        }
      }
    }

    // ── Step 4: Aggregate results ─────────────────────────────────────────
    const summaries = [...taskResults.values()].map((r) => r.summary);
    const allSuggestions = [...taskResults.values()].flatMap((r) => r.suggestions ?? []);
    const failedTasks = mutableTasks.filter(
      (task): task is MutableAgentTask => task.status === 'failed'
    );

    if (failedTasks.length > 0) {
      const firstFailedTask = failedTasks[0];
      const firstFailureMessage = firstFailedTask._lastError ?? 'Unknown error';
      const failureHeadline =
        `Execution plan failed. Task ${firstFailedTask.id} ` +
        `(${firstFailedTask.assignedAgent}) failed: ${firstFailureMessage}`;
      const partialSummary = summaries.join('\n\n').trim();
      const failedTaskDetails = failedTasks.map((task) => ({
        id: task.id,
        description: task.description,
        assignedAgent: task.assignedAgent,
        dependsOn: task.dependsOn,
        error: task._lastError ?? 'Unknown error',
      }));

      logger.error('[AgentRouter] Execution plan failed', {
        operationId,
        failedTaskId: firstFailedTask.id,
        assignedAgent: firstFailedTask.assignedAgent,
        error: firstFailureMessage,
        completedTaskCount: taskResults.size,
        totalTaskCount: mutableTasks.length,
      });

      this.emitUpdate(
        onUpdate,
        operationId,
        'failed',
        failureHeadline,
        {
          eventType: 'plan_failed',
          failedTasks: failedTaskDetails,
          firstFailedTask: failedTaskDetails[0],
        },
        {
          agentId: firstFailedTask.assignedAgent,
          stage: 'agent_thinking',
          outcomeCode: 'task_failed',
          metadata: {
            failedTaskId: firstFailedTask.id,
            failedAgentId: firstFailedTask.assignedAgent,
          },
        }
      );

      return {
        summary:
          partialSummary.length > 0
            ? `${failureHeadline}\n\nPartial completed work:\n${partialSummary}`
            : failureHeadline,
        data: {
          plan,
          taskResults: Object.fromEntries(taskResults),
          operationStatus: 'failed',
          failedTasks: failedTaskDetails,
          firstFailedTask: failedTaskDetails[0],
        },
        suggestions: allSuggestions.length > 0 ? allSuggestions : undefined,
      };
    }

    this.emitUpdate(onUpdate, operationId, 'completed', 'All tasks finished.', undefined, {
      agentId: 'router',
      outcomeCode: 'success_default',
    });

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
      this.semanticCache.store(scopedIntent, aggregatedResult).catch(() => {
        /* noop */
      });
    }

    this.appendAssistantMessage(userId, threadId, aggregatedResult.summary);
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
    onStreamEvent?: OnStreamEvent,
    environment: 'staging' | 'production' = 'production'
  ): Promise<AgentOperationResult> {
    const { operationId, userId, intent } = payload;
    this.emitUpdate(onUpdate, operationId, 'acting', 'Resuming from your response...', undefined, {
      agentId: yieldState.agentId,
      stage: 'resuming_user_input',
    });

    // Resolve the agent that was executing when the yield happened
    const agent = this.agents.get(yieldState.agentId);
    if (!agent) {
      this.emitUpdate(
        onUpdate,
        operationId,
        'failed',
        `Cannot resume: no agent registered for "${yieldState.agentId}".`,
        undefined,
        {
          agentId: 'router',
          stage: 'resuming_user_input',
          outcomeCode: 'routing_failed',
          metadata: { targetAgentId: yieldState.agentId },
        }
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

    // Hydrate session for runResumed so the agent has prior turn context
    let resumeSessionContext: AgentSessionContext | undefined;
    if (this.sessionMemory) {
      try {
        resumeSessionContext = await this.sessionMemory.getOrCreate(userId, resumeThreadId);
      } catch {
        // Non-critical — continue without history
      }
    }

    const context = this.buildSessionContext(
      userId,
      resumeSessionContext?.sessionId ?? payload.sessionId,
      operationId,
      resumeThreadId,
      environment,
      undefined,
      undefined,
      undefined,
      undefined,
      resumeSessionContext?.conversationHistory
    );
    const approvalId =
      typeof (resumeContextObj as Record<string, unknown>)['approvalId'] === 'string'
        ? ((resumeContextObj as Record<string, unknown>)['approvalId'] as string)
        : undefined;
    let resumeActiveThreadsSummary = '';
    try {
      resumeActiveThreadsSummary = await this.contextBuilder.getActiveThreadsSummary(userId, 8);
    } catch {
      // Non-critical — continue without it
    }

    const enrichedIntent = this.enrichIntentWithContext(
      intent,
      userContext,
      payload.context,
      undefined,
      promptContext.memories,
      promptContext.recentSyncSummaries ?? [],
      resumeActiveThreadsSummary
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

      this.emitUpdate(onUpdate, operationId, 'completed', result.summary, undefined, {
        agentId: yieldState.agentId,
        stage: 'resuming_user_input',
        outcomeCode: 'success_default',
      });
      this.appendAssistantMessage(userId, resumeThreadId, result.summary);
      return result;
    } catch (err) {
      if (isAgentYield(err)) throw err;
      const message = err instanceof Error ? err.message : 'Resume execution failed';
      this.emitUpdate(onUpdate, operationId, 'failed', message, undefined, {
        agentId: yieldState.agentId,
        stage: 'resuming_user_input',
        outcomeCode: 'task_failed',
      });
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
  /**
   * Builds a cache key that is scoped by the user's role and primary sport.
   * Embedding two different plain-English intents that differ only by
   * role/sport would produce very similar vectors, causing cross-user hits.
   * Prefixing with `[role|sport]` shifts the embedding into the correct
   * semantic region so the cosine threshold never bridges role boundaries.
   */
  private buildScopedCacheKey(intent: string, userContext: AgentUserContext | undefined): string {
    const role = userContext?.role ?? 'unknown';
    const sport = userContext?.sport ?? 'general';
    return `[${role}|${sport}] ${intent}`;
  }

  private enrichIntentWithContext(
    intent: string,
    userContext: AgentUserContext,
    jobContext?: Record<string, unknown>,
    threadHistory?: string,
    memories: AgentRetrievedMemories = { user: [], team: [], organization: [] },
    recentSyncSummaries: readonly string[] = [],
    activeThreadsSummary?: string
  ): string {
    const contextStr = this.contextBuilder.compressToPrompt(
      userContext,
      memories,
      recentSyncSummaries
    );
    let enriched = `[User Profile]\n${contextStr}`;

    // Inject structured job context so the LLM has URLs, platform names, etc.
    if (jobContext && Object.keys(jobContext).length > 0) {
      // Exclude internal/system keys — these are not useful LLM context
      const {
        threadId: _threadId,
        mode: _mode,
        attachments: _attachments,
        ...visibleContext
      } = jobContext;
      if (Object.keys(visibleContext).length > 0) {
        let contextMd = '\n\n[Job Context]\n';
        for (const [key, value] of Object.entries(visibleContext)) {
          const formatted = typeof value === 'object' ? JSON.stringify(value) : String(value);
          contextMd += `- **${key}**: ${formatted}\n`;
        }
        enriched += contextMd;
      }
    }

    // Inject cross-thread conversation awareness (recent session titles)
    if (activeThreadsSummary) {
      enriched += `\n\n[Recent Conversation Topics]${activeThreadsSummary}`;
    }

    // Inject current thread's message history for in-session continuity
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
    threadId?: string,
    environment?: 'staging' | 'production',
    signal?: AbortSignal,
    mode?: string,
    attachments?: readonly { readonly url: string; readonly mimeType: string }[],
    videoAttachments?: readonly {
      readonly url: string;
      readonly mimeType: string;
      readonly name: string;
    }[],
    conversationHistory?: readonly AgentSessionMessage[]
  ): AgentSessionContext {
    const now = new Date().toISOString();
    return {
      sessionId: sessionId ?? crypto.randomUUID(),
      userId,
      conversationHistory: conversationHistory ?? [],
      createdAt: now,
      lastActiveAt: now,
      ...(environment && { environment }),
      ...(operationId && { operationId }),
      ...(threadId && { threadId }),
      ...(mode && { mode }),
      ...(attachments?.length && { attachments }),
      ...(videoAttachments?.length && { videoAttachments }),
      ...(signal && { signal }),
    };
  }

  /**
   * Fire-and-forget helper to persist the assistant's reply to Redis session memory.
   * Never blocks the response — failures are logged as warnings only.
   */
  private appendAssistantMessage(
    userId: string,
    threadId: string | undefined,
    summary: string
  ): void {
    if (!this.sessionMemory || !threadId) return;
    this.sessionMemory
      .appendMessage(userId, threadId, {
        role: 'assistant',
        content: summary,
        timestamp: new Date().toISOString(),
      })
      .catch((err) => {
        logger.warn('[AgentRouter] Failed to append assistant message to session', {
          userId,
          threadId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }

  /** Emit a step update to the onUpdate callback (for SSE / Firestore). */
  private emitUpdate(
    onUpdate: ((update: AgentJobUpdate) => void) | undefined,
    operationId: string,
    status: AgentJobUpdate['status'],
    message: string,
    payload?: Record<string, unknown>,
    structured?: {
      readonly agentId?: AgentIdentifier;
      readonly stage?: AgentRouterStage;
      readonly outcomeCode?: OperationOutcomeCode;
      readonly metadata?: AgentProgressMetadata;
    }
  ): void {
    if (!onUpdate) return;
    onUpdate({
      operationId,
      status,
      agentId: structured?.agentId,
      stageType: structured?.stage ? 'router' : undefined,
      stage: structured?.stage,
      outcomeCode: structured?.outcomeCode,
      metadata: structured?.metadata,
      step: {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        status,
        message,
        agentId: structured?.agentId,
        stageType: structured?.stage ? 'router' : undefined,
        stage: structured?.stage,
        outcomeCode: structured?.outcomeCode,
        metadata: structured?.metadata,
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
