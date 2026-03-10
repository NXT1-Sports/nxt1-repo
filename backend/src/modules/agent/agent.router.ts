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
    onUpdate?: (update: AgentJobUpdate) => void
  ): Promise<AgentOperationResult> {
    const { operationId, userId, intent } = payload;

    // ── Step 1: Build context ─────────────────────────────────────────────
    this.emitUpdate(onUpdate, operationId, 'thinking', 'Building user context...');

    let userContext: AgentUserContext;
    try {
      userContext = await this.contextBuilder.buildContext(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Context building failed';
      this.emitUpdate(onUpdate, operationId, 'failed', `Context error: ${message}`);
      return {
        summary: `Failed to build user context: ${message}`,
        suggestions: ['Try again later or contact support.'],
      };
    }

    const context = this.buildSessionContext(userId, payload.sessionId);
    const enrichedIntent = this.enrichIntentWithContext(intent, userContext);

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
          const taskIntent = this.buildTaskIntent(task, taskResults);
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
   * Enrich the raw user intent with compressed profile context.
   * This ensures the planner and sub-agents know who the user is
   * (sport, position, school, subscription tier, etc.) without
   * the user having to re-state it every time.
   */
  private enrichIntentWithContext(intent: string, userContext: AgentUserContext): string {
    const contextStr = this.contextBuilder.compressToPrompt(userContext);
    return `[User Profile]\n${contextStr}\n\n[Request]\n${intent}`;
  }

  private hasPendingTasks(tasks: readonly (AgentTask & { status: AgentTaskStatus })[]): boolean {
    return tasks.some((t) => t.status === 'pending');
  }

  /**
   * Build the intent string for a sub-task, injecting results from
   * upstream dependencies for context.
   */
  private buildTaskIntent(
    task: AgentTask,
    upstreamResults: Map<string, AgentOperationResult>
  ): string {
    let enrichedIntent = task.description;

    if (task.dependsOn.length > 0) {
      const contextParts: string[] = [];
      for (const depId of task.dependsOn) {
        const depResult = upstreamResults.get(depId);
        if (depResult) {
          contextParts.push(`[Result from task ${depId}]: ${depResult.summary}`);
        }
      }
      if (contextParts.length > 0) {
        enrichedIntent = contextParts.join('\n') + '\n\n' + task.description;
      }
    }

    return enrichedIntent;
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
