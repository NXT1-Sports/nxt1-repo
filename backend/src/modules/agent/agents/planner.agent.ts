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
 *      to the correct sub-agent in dependency order.
 *
 * Example:
 *   User: "Grade my new highlight tape and email D3 coaches in Ohio."
 *
 *   PlannerAgent output:
 *   [
 *     { id: "1", agent: "scout",     description: "Analyze and grade highlight tape", dependsOn: [] },
 *     { id: "2", agent: "recruiter", description: "Draft and send emails to D3 Ohio coaches", dependsOn: ["1"] }
 *   ]
 *
 * The Worker then runs task 1 (ScoutAgent), waits for completion,
 * pipes the result into task 2 (RecruiterAgent), and marks the operation complete.
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
} from '@nxt1/core';
import { MODEL_ROUTING_DEFAULTS, AGENT_DESCRIPTORS } from '@nxt1/core';

export class PlannerAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'router';
  readonly name = 'Task Planner';

  /**
   * Builds the system prompt that instructs the LLM to act as a task decomposer.
   * The prompt includes the full catalogue of available sub-agents so the LLM
   * knows which specialists it can assign tasks to.
   */
  getSystemPrompt(_context: AgentSessionContext): string {
    const agentCatalogue = Object.values(AGENT_DESCRIPTORS)
      .filter((a) => a.id !== 'router') // Don't assign tasks back to itself
      .map(
        (a) =>
          `- **${a.name}** (id: "${a.id}"): ${a.description}\n  Capabilities: ${a.capabilities.join(', ')}`
      )
      .join('\n');

    return `You are the Task Planner for Agent X, the AI engine of NXT1 Sports.

Your ONLY job is to decompose the user's request into a structured execution plan (a To-Do list).
You do NOT execute any actions. You ONLY plan.

## Available Specialists
${agentCatalogue}

## Rules
1. Break the user's intent into the SMALLEST independent tasks possible.
2. Assign each task to exactly ONE specialist agent by its "id".
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
  }

  /**
   * The Planner does not call any tools itself.
   * It purely reasons about the intent and outputs a JSON plan.
   */
  getAvailableTools(): readonly string[] {
    return [];
  }

  /**
   * Uses the "fast" model tier because planning is a structured JSON
   * extraction task — it doesn't need creative or reasoning-heavy models.
   */
  getModelRouting(): ModelRoutingConfig {
    return MODEL_ROUTING_DEFAULTS['fast'];
  }

  /**
   * Execute the planning phase.
   *
   * In the full implementation, this will:
   * 1. Call the LLM with the system prompt + user intent.
   * 2. Parse the JSON response into an AgentExecutionPlan.
   * 3. Validate task IDs and dependency references.
   * 4. Return the plan as the operation result.
   *
   * The Worker Queue reads .result.data.plan to get the task list.
   */
  override async execute(
    _intent: string,
    _context: AgentSessionContext,
    _tools: readonly AgentToolDefinition[]
  ): Promise<AgentOperationResult> {
    // ── Phase 1: Call LLM ─────────────────────────────────────────────────
    // TODO: Wire up OpenRouter call with getSystemPrompt() + intent
    // const llmResponse = await this.callLLM(intent, context);

    // ── Phase 2: Parse JSON response ──────────────────────────────────────
    // TODO: JSON.parse(llmResponse) with zod/joi validation
    // const parsed = this.parsePlanResponse(llmResponse);

    // ── Phase 3: Build the execution plan ─────────────────────────────────
    const now = new Date().toISOString();

    // Placeholder: Single-task plan (replaced by LLM output during implementation)
    const plan: AgentExecutionPlan = {
      operationId: _context.sessionId,
      tasks: [
        {
          id: '1',
          assignedAgent: 'general',
          description: _intent,
          status: 'pending' as AgentTaskStatus,
          dependsOn: [],
          createdAt: now,
        },
      ],
      createdAt: now,
    };

    // ── Phase 4: Validate dependency graph ────────────────────────────────
    this.validateDependencyGraph(plan.tasks);

    const output: AgentPlannerOutput = {
      plan,
      summary: `Created execution plan with ${plan.tasks.length} task(s).`,
      estimatedSteps: plan.tasks.length,
    };

    return {
      summary: output.summary,
      data: { plan: output.plan, estimatedSteps: output.estimatedSteps },
      suggestions: [],
    };
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
          throw new Error(
            `Task "${task.id}" depends on unknown task "${dep}". ` +
              `Valid IDs: ${[...taskIds].join(', ')}`
          );
        }
        if (dep === task.id) {
          throw new Error(`Task "${task.id}" cannot depend on itself (circular dependency).`);
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
        throw new Error(
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
