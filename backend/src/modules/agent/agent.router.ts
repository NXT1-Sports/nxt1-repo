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
  AgentOperationResult,
  AgentIdentifier,
  AgentTaskStatus,
  AgentTask,
  AgentExecutionPlan,
  AgentSessionContext,
  AgentUserContext,
} from '@nxt1/core';
import type { OpenRouterService } from './llm/openrouter.service.js';
import type { ToolRegistry } from './tools/tool-registry.js';
import type { ContextBuilder } from './memory/context-builder.js';
import type { BaseAgent } from './agents/base.agent.js';
import type { GuardrailRunner } from './guardrails/guardrail-runner.js';
import { PlannerAgent } from './agents/planner.agent.js';
import { isAgentYield, AgentYieldException } from './errors/agent-yield.error.js';

// ─── Router ─────────────────────────────────────────────────────────────────

export class AgentRouter {
  private readonly planner: PlannerAgent;
  private readonly agents = new Map<AgentIdentifier, BaseAgent>();

  constructor(
    private readonly llm: OpenRouterService,
    private readonly toolRegistry: ToolRegistry,
    private readonly contextBuilder: ContextBuilder,
    private readonly guardrailRunner?: GuardrailRunner
  ) {
    this.planner = new PlannerAgent(llm);
  }

  /** Register a sub-agent so the router can delegate tasks to it. */
  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.id, agent);
  }

  /** Get the guardrail runner (sub-agents use this for pre-tool checks). */
  getGuardrailRunner(): GuardrailRunner | undefined {
    return this.guardrailRunner;
  }

  /**
   * Classify the user's intent and return the best sub-agent identifier.
   * Uses the PlannerAgent to decompose — if it's a single task, returns
   * that task's agent. If multi-task, returns 'router' (meaning: run the full plan).
   */
  async classify(intent: string, userId: string): Promise<AgentIdentifier> {
    const userContext = await this.contextBuilder.buildContext(userId);
    const context = this.buildSessionContext(userId);
    const enrichedIntent = this.enrichIntentWithContext(intent, userContext);

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
    firestore?: FirebaseFirestore.Firestore
  ): Promise<AgentOperationResult> {
    const { operationId, userId, intent } = payload;

    // ── Resume detection: check if this is a resumed job ──────────────────
    const contextObj =
      typeof payload.context === 'object' && payload.context !== null ? payload.context : {};
    const yieldState = (contextObj as Record<string, unknown>)['yieldState'] as
      | import('@nxt1/core').AgentYieldState
      | undefined;

    if (yieldState) {
      return this.runResumed(payload, yieldState, onUpdate, firestore);
    }

    // ── Step 1: Build context ─────────────────────────────────────────────
    this.emitUpdate(onUpdate, operationId, 'thinking', 'Building user context...');

    let userContext: AgentUserContext;
    try {
      userContext = await this.contextBuilder.buildContext(userId, firestore);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Context building failed';
      this.emitUpdate(onUpdate, operationId, 'failed', `Context error: ${message}`);
      return {
        summary: `Failed to build user context: ${message}`,
        suggestions: ['Try again later or contact support.'],
      };
    }

    const context = this.buildSessionContext(userId, payload.sessionId);

    // Inject thread history for conversation continuity
    // (contextObj already extracted above for resume detection)
    const threadId =
      typeof (contextObj as Record<string, unknown>)['threadId'] === 'string'
        ? ((contextObj as Record<string, unknown>)['threadId'] as string)
        : undefined;
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
      threadHistoryStr
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
        const toolDefs = this.toolRegistry.getDefinitions(directAgent.id);
        const result = await directAgent.execute(
          enrichedIntent,
          context,
          toolDefs,
          this.llm,
          this.toolRegistry,
          this.guardrailRunner
        );

        this.emitUpdate(onUpdate, operationId, 'completed', result.summary);
        return result;
      } catch (err) {
        // Let AgentYieldException propagate to the worker for suspend-and-resume
        if (isAgentYield(err)) throw err;
        const message = err instanceof Error ? err.message : 'Agent execution failed';
        this.emitUpdate(onUpdate, operationId, 'failed', message);
        return {
          summary: `Agent ${payload.agent} failed: ${message}`,
          suggestions: ['Try again later or contact support.'],
        };
      }
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

    // ── Step 3: Execute tasks in dependency order ─────────────────────────
    const taskResults = new Map<string, AgentOperationResult>();
    const mutableTasks = plan.tasks.map((t) => ({ ...t })) as Array<
      AgentTask & { status: AgentTaskStatus }
    >;

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

        try {
          const agent = this.agents.get(task.assignedAgent);
          if (!agent) {
            throw new Error(`No agent registered for "${task.assignedAgent}".`);
          }

          // Build the intent for this specific task, enriched with upstream results
          // and the original job context (user profile, linked account URLs, etc.)
          const taskIntent = this.buildTaskIntent(task, taskResults, enrichedIntent);
          const toolDefs = this.toolRegistry.getDefinitions(agent.id);

          const result = await agent.execute(
            taskIntent,
            context,
            toolDefs,
            this.llm,
            this.toolRegistry,
            this.guardrailRunner
          );

          taskResults.set(task.id, result);
          task.status = 'completed' as AgentTaskStatus;
          this.emitUpdate(
            onUpdate,
            operationId,
            'acting',
            `Task ${task.id} completed: ${result.summary}`
          );
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

          task.status = 'failed' as AgentTaskStatus;
          const message = err instanceof Error ? err.message : 'Unknown error';
          this.emitUpdate(onUpdate, operationId, 'acting', `Task ${task.id} failed: ${message}`);

          // Cascade failure to all downstream dependents (H7)
          this.cascadeFailure(task.id, mutableTasks);
        }
      }
    }

    // ── Step 4: Aggregate results ─────────────────────────────────────────
    this.emitUpdate(onUpdate, operationId, 'completed', 'All tasks finished.');

    const summaries = [...taskResults.values()].map((r) => r.summary);
    const allSuggestions = [...taskResults.values()].flatMap((r) => r.suggestions ?? []);

    return {
      summary: summaries.join('\n\n'),
      data: {
        plan,
        taskResults: Object.fromEntries(taskResults),
      },
      suggestions: allSuggestions.length > 0 ? allSuggestions : undefined,
    };
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
    firestore?: FirebaseFirestore.Firestore
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
    let userContext: AgentUserContext;
    try {
      userContext = await this.contextBuilder.buildContext(userId, firestore);
    } catch {
      // Non-critical — resume with whatever context we have
      userContext = { userId } as AgentUserContext;
    }

    const context = this.buildSessionContext(userId, payload.sessionId);
    const enrichedIntent = this.enrichIntentWithContext(intent, userContext, payload.context);

    try {
      const toolDefs = this.toolRegistry.getDefinitions(agent.id);

      // Design note (V1): We intentionally restart the agent's ReAct loop
      // from scratch rather than injecting the saved message array directly.
      // The user's answer is persisted to the MongoDB thread by the resume
      // route, and the ContextBuilder injects recent thread messages into
      // the system prompt — so the agent sees the full conversation history
      // including its original question and the user's response.
      //
      // Tradeoff: this is less token-efficient than resuming mid-loop
      // (prior tool results are re-discovered, not replayed), but it's
      // simpler and avoids deserializing LLM message arrays across module
      // boundaries. A future optimization could add a `resumeFromMessages`
      // method to BaseAgent that pre-populates the message array.
      const result = await agent.execute(
        enrichedIntent,
        context,
        toolDefs,
        this.llm,
        this.toolRegistry,
        this.guardrailRunner
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
    threadHistory?: string
  ): string {
    const contextStr = this.contextBuilder.compressToPrompt(userContext);
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
  private buildSessionContext(userId: string, sessionId?: string): AgentSessionContext {
    const now = new Date().toISOString();
    return {
      sessionId: sessionId ?? crypto.randomUUID(),
      userId,
      conversationHistory: [],
      createdAt: now,
      lastActiveAt: now,
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
