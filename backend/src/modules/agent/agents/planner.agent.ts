/**
 * @fileoverview Planner Agent — Plan-and-Execute Orchestrator
 * @module @nxt1/backend/modules/agent/agents
 *
 * The PlannerAgent is the FIRST agent invoked by the Worker Queue.
 * It does NOT perform any real work itself. Its sole responsibility is:
 *
 *   1. Receive the raw user intent.
 *   2. Use an LLM (fast tier) to decompose the intent into a structured
 *      To-Do List (AgentExecutionPlan / DAG).
 *   3. Return the plan to the Worker, which then dispatches each task
 *      to the correct coordinator in dependency order.
 *
 * Example:
 *   User: "Grade my new highlight tape and email D3 coaches in Ohio."
 *
 *   PlannerAgent output:
 *   [
 *     { id: "1", agent: "performance_coordinator", description: "Analyze and grade highlight tape", dependsOn: [] },
 *     { id: "2", agent: "recruiting_coordinator",  description: "Draft and send emails to D3 Ohio coaches", dependsOn: ["1"] }
 *   ]
 *
 * The Worker then runs task 1 (Performance Coordinator), waits for completion,
 * pipes the result into task 2 (Recruiting Coordinator), and marks the operation complete.
 */

import { BaseAgent } from './base.agent.js';
import type {
  AgentIdentifier,
  AgentSessionContext,
  AgentToolDefinition,
  AgentOperationResult,
  AgentExecutionPlan,
  AgentTask,
  AgentTaskStatus,
  AgentPlannerOutput,
  ModelRoutingConfig,
  AgentDescriptor,
} from '@nxt1/core';
import { MODEL_ROUTING_DEFAULTS } from '@nxt1/core';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import { z } from 'zod';
import { getConfiguredCoordinatorDescriptors } from '../config/agent-app-config.js';
import { AgentEngineError } from '../exceptions/agent-engine.error.js';

const plannerResponseSchema = z
  .object({
    summary: z.string().optional(),
    estimatedSteps: z.number().optional(),
    tasks: z.array(
      z.object({
        id: z.union([z.string(), z.number()]).optional(),
        assignedAgent: z.string().optional(),
        description: z.string().optional(),
        dependsOn: z.array(z.union([z.string(), z.number()])).optional(),
      })
    ),
  })
  .transform((data) => ({
    summary: data.summary,
    estimatedSteps: data.estimatedSteps,
    tasks: data.tasks.map((task, idx) => ({
      id: String(task.id ?? idx + 1),
      assignedAgent: task.assignedAgent ?? 'strategy_coordinator',
      description: task.description ?? '',
      dependsOn: (task.dependsOn ?? []).map(String),
    })),
  }));

export class PlannerAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'router';
  readonly name = 'Chief of Staff';

  /** Default LLM instance (used when execute() is called without an llm parameter). */
  private readonly defaultLlm: OpenRouterService;

  constructor(llm: OpenRouterService) {
    super();
    this.defaultLlm = llm;
  }

  /**
   * Builds the system prompt that instructs the LLM to act as a task decomposer.
   * The prompt includes the full catalogue of available sub-agents so the LLM
   * knows which specialists it can assign tasks to.
   */
  getSystemPrompt(_context: AgentSessionContext): string {
    const agentCatalogue = this.getCoordinatorDescriptors()
      .map(
        (a) =>
          `- **${a.name}** (id: "${a.id}"): ${a.description}\n  Capabilities: ${a.capabilities.join(', ')}`
      )
      .join('\n');

    const prompt = `You are the Chief of Staff for Agent X, the AI engine of NXT1 Sports.

Your ONLY job is to decompose the user's request into a structured execution plan (a To-Do list).
You do NOT execute any actions. You ONLY plan and assign tasks to coordinators.

## Available Coordinators
${agentCatalogue}

## Rules
1. Break the user's intent into the SMALLEST independent tasks possible.
2. Assign each task to exactly ONE coordinator by its "id".
3. Set "dependsOn" to an array of task IDs that MUST complete before this task can start.
   - If a task has no dependencies, use an empty array [].
   - Tasks with no dependencies CAN run in parallel.
4. Order tasks logically. Data-producing tasks (analyze, fetch, generate) come before
   data-consuming tasks (email, share, post).
5. If a request is simple (single action), return a plan with ONE task. Do not over-decompose.
6. If the user's request is ambiguous, create the most reasonable plan and note assumptions.

## Output Format (STRICT JSON)
Respond with ONLY a JSON object matching this schema — no markdown, no explanation:
{
  "summary": "One-sentence description of the overall plan",
  "estimatedSteps": <number>,
  "tasks": [
    {
      "id": "1",
      "assignedAgent": "<agent_id>",
      "description": "What this task does",
      "dependsOn": []
    }
  ]
}`;

    return this.withConfiguredSystemPrompt(prompt);
  }

  private getCoordinatorDescriptors(): readonly AgentDescriptor[] {
    return getConfiguredCoordinatorDescriptors().filter((descriptor) => descriptor.id !== 'router');
  }

  /**
   * The Planner does not call any tools itself.
   * It purely reasons about the intent and outputs a JSON plan.
   */
  getAvailableTools(): readonly string[] {
    return [];
  }

  /**
   * Uses the "routing" tier — structured JSON extraction for task decomposition.
   * Sonnet at 1024 tokens produces reliable JSON plans; Haiku is too error-prone
   * for multi-task dependency graphs.
   */
  getModelRouting(): ModelRoutingConfig {
    return { ...MODEL_ROUTING_DEFAULTS['routing'], maxTokens: 1024 };
  }

  /**
   * Execute the planning phase.
   *
   * 1. Call the LLM with the system prompt + user intent.
   * 2. Parse the JSON response into an AgentExecutionPlan.
   * 3. Validate task IDs and dependency references.
   * 4. Return the plan as the operation result.
   *
   * The Worker Queue reads .result.data.plan to get the task list.
   */
  override async execute(
    intent: string,
    context: AgentSessionContext,
    _tools: readonly AgentToolDefinition[],
    llm?: OpenRouterService
  ): Promise<AgentOperationResult> {
    const activeLlm = llm ?? this.defaultLlm;
    const routing = this.getModelRouting();

    // ── Phase 1: Call LLM ─────────────────────────────────────────────
    const result = await activeLlm.prompt(this.getSystemPrompt(context), intent, {
      tier: routing.tier,
      maxTokens: routing.maxTokens,
      temperature: routing.temperature,
      outputSchema: {
        name: 'planner_execution_plan',
        schema: plannerResponseSchema,
      },
      ...(context.operationId && {
        telemetryContext: {
          operationId: context.operationId,
          userId: context.userId,
          agentId: this.id,
        },
      }),
    });

    if (result.parsedOutput === undefined) {
      throw new AgentEngineError(
        'PLANNER_EMPTY_PLAN',
        'Planner LLM returned no structured execution plan.'
      );
    }

    // ── Phase 2: Resolve structured response ──────────────────────────────
    const parsed = this.resolvePlanResponse(result);

    // ── Phase 3: Build the execution plan ─────────────────────────────────
    const now = new Date().toISOString();

    const tasks: AgentTask[] = parsed.tasks.map((t) => ({
      id: t.id,
      assignedAgent: t.assignedAgent as AgentIdentifier,
      description: t.description,
      status: 'pending' as AgentTaskStatus,
      dependsOn: t.dependsOn,
      createdAt: now,
    }));

    const plan: AgentExecutionPlan = {
      operationId: context.sessionId,
      tasks,
      createdAt: now,
    };

    // ── Phase 4: Validate dependency graph ────────────────────────────────
    this.validateDependencyGraph(plan.tasks);

    const output: AgentPlannerOutput = {
      plan,
      summary: parsed.summary ?? `Created execution plan with ${plan.tasks.length} task(s).`,
      estimatedSteps: parsed.estimatedSteps ?? plan.tasks.length,
    };

    return {
      summary: output.summary,
      data: { plan: output.plan, estimatedSteps: output.estimatedSteps },
      suggestions: [],
    };
  }

  // ─── LLM Response Parser ───────────────────────────────────────────────

  /**
   * Resolve the LLM structured payload into a validated plan structure.
   */
  private resolvePlanResponse(result: AgentPlannerLlmResult): PlannerLLMResponse {
    const validated = plannerResponseSchema.safeParse(result.parsedOutput);
    if (!validated.success) {
      const firstIssue = validated.error.issues[0];
      const path = firstIssue?.path.length ? firstIssue.path.join('.') : 'response';
      throw new AgentEngineError(
        'PLANNER_SCHEMA_INVALID',
        `Planner LLM response failed schema validation at ${path}: ${firstIssue?.message ?? 'Invalid output.'}`
      );
    }

    return validated.data;
  }

  // ─── Internal Helpers ───────────────────────────────────────────────────

  /**
   * Validates that all dependsOn references point to real task IDs
   * and that there are no circular dependencies.
   */
  private validateDependencyGraph(tasks: readonly AgentTask[]): void {
    const taskIds = new Set(tasks.map((t) => t.id));

    for (const task of tasks) {
      for (const dep of task.dependsOn) {
        if (!taskIds.has(dep)) {
          throw new AgentEngineError(
            'PLANNER_DEPENDENCY_INVALID',
            `Task "${task.id}" depends on unknown task "${dep}". ` +
              `Valid IDs: ${[...taskIds].join(', ')}`
          );
        }
        if (dep === task.id) {
          throw new AgentEngineError(
            'PLANNER_CIRCULAR_DEPENDENCY',
            `Task "${task.id}" cannot depend on itself (circular dependency).`
          );
        }
      }
    }

    // Topological sort check for cycles
    this.detectCycles(tasks);
  }

  /**
   * Simple cycle detection using DFS.
   * Ensures the execution plan is a valid DAG (Directed Acyclic Graph).
   */
  private detectCycles(tasks: readonly AgentTask[]): void {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const adjacency = new Map<string, readonly string[]>();

    for (const task of tasks) {
      adjacency.set(task.id, task.dependsOn);
    }

    const dfs = (id: string): void => {
      if (visiting.has(id)) {
        throw new AgentEngineError(
          'PLANNER_CIRCULAR_DEPENDENCY',
          `Circular dependency detected involving task "${id}". ` +
            `The execution plan must be a DAG.`
        );
      }
      if (visited.has(id)) return;

      visiting.add(id);
      const deps = adjacency.get(id) ?? [];
      for (const dep of deps) {
        dfs(dep);
      }
      visiting.delete(id);
      visited.add(id);
    };

    for (const task of tasks) {
      dfs(task.id);
    }
  }
}

// ─── Internal Types ───────────────────────────────────────────────────────

/** Shape returned by the LLM after parsing. */
interface PlannerLLMResponse {
  readonly summary?: string;
  readonly estimatedSteps?: number;
  readonly tasks: readonly PlannerLLMTask[];
}

interface PlannerLLMTask {
  readonly id: string;
  readonly assignedAgent: string;
  readonly description: string;
  readonly dependsOn: readonly string[];
}

interface AgentPlannerLlmResult {
  readonly content: string | null;
  readonly parsedOutput?: PlannerLLMResponse;
}
