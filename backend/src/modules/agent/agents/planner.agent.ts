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
  ModelRoutingConfig,
  AgentDescriptor,
} from '@nxt1/core';
import { COORDINATOR_AGENT_IDS, MODEL_ROUTING_DEFAULTS } from '@nxt1/core';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { SkillRegistry } from '../skills/skill-registry.js';
import type { OnStreamEvent } from '../queue/event-writer.js';
import type { ApprovalGateService } from '../services/approval-gate.service.js';
import { z } from 'zod';
import {
  getConfiguredCoordinatorDescriptors,
  resolvePlannerSystemPrompt,
} from '../config/agent-app-config.js';
import { AgentEngineError } from '../exceptions/agent-engine.error.js';
import { sanitizeAgentOutputText } from '../utils/platform-identifier-sanitizer.js';

const strictPlannerTaskSchema = z.object({
  id: z.string(),
  assignedAgent: z.string(),
  displayLabel: z.string().max(60).optional(),
  description: z.string(),
  dependsOn: z.array(z.string()),
});

const strictPlannerResponseSchema = z.object({
  resultType: z.enum(['execution', 'clarification']),
  summary: z.string(),
  estimatedSteps: z.number(),
  clarificationQuestion: z.string().nullable(),
  clarificationContext: z.string().nullable(),
  tasks: z.array(strictPlannerTaskSchema),
});

const coordinatorIdSet = new Set<string>(COORDINATOR_AGENT_IDS);
const plannerAgentAliases: Readonly<Record<string, (typeof COORDINATOR_AGENT_IDS)[number]>> = {
  admin: 'admin_coordinator',
  admincoordinator: 'admin_coordinator',
  admin_coordinator: 'admin_coordinator',
  brand: 'brand_coordinator',
  brandcoordinator: 'brand_coordinator',
  brand_coordinator: 'brand_coordinator',
  data: 'data_coordinator',
  datacoordinator: 'data_coordinator',
  data_coordinator: 'data_coordinator',
  strategy: 'strategy_coordinator',
  strategist: 'strategy_coordinator',
  strategycoordinator: 'strategy_coordinator',
  strategy_coordinator: 'strategy_coordinator',
  recruiting: 'recruiting_coordinator',
  recruitingcoordinator: 'recruiting_coordinator',
  recruiting_coordinator: 'recruiting_coordinator',
  performance: 'performance_coordinator',
  analyst: 'performance_coordinator',
  performancecoordinator: 'performance_coordinator',
  performance_coordinator: 'performance_coordinator',
};

function normalizePlannerAssignedAgent(agentIdRaw: string): AgentIdentifier | null {
  const normalized = agentIdRaw.trim().toLowerCase();
  if (!normalized) return null;
  if (coordinatorIdSet.has(normalized)) {
    return normalized as AgentIdentifier;
  }

  const aliasKey = normalized.replace(/[\s-]+/g, '_').replace(/_/g, '');
  const aliased = plannerAgentAliases[aliasKey] ?? plannerAgentAliases[normalized];
  return aliased ?? null;
}

interface PlannerCapabilityCoordinatorSnapshot {
  readonly agentId: Exclude<AgentIdentifier, 'router'>;
  readonly allowedToolNames: readonly string[];
  readonly allowedEntityGroups: readonly string[];
  readonly matchedToolNames: readonly string[];
  readonly staticSkillHints: readonly string[];
  readonly matchedSkillHints: readonly string[];
  readonly confidence: {
    readonly matchedToolCount: number;
    readonly allowedToolCount: number;
    readonly toolCoverageRatio: number;
    readonly matchedSkillCount: number;
    readonly staticSkillCount: number;
    readonly skillCoverageRatio: number;
  };
}

export interface PlannerCapabilitySnapshot {
  readonly schemaVersion: number;
  readonly hash: string;
  readonly coordinators: readonly PlannerCapabilityCoordinatorSnapshot[];
}

interface PlannerExecutionOptions {
  readonly capabilitySnapshot?: PlannerCapabilitySnapshot;
  readonly capabilitySnapshotResolver?: () => Promise<PlannerCapabilitySnapshot | undefined>;
}

interface StrictPlannerResponse {
  readonly resultType: 'execution' | 'clarification';
  readonly summary: string;
  readonly estimatedSteps: number;
  readonly clarificationQuestion: string | null;
  readonly clarificationContext: string | null;
  readonly tasks: readonly PlannerLLMTask[];
}

function isPlannerExecutionOptions(
  value: ToolRegistry | PlannerExecutionOptions | undefined
): value is PlannerExecutionOptions {
  if (!value || typeof value !== 'object') return false;
  return 'capabilitySnapshot' in value || 'capabilitySnapshotResolver' in value;
}

export class PlannerAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'router';
  readonly name = 'Planner Agent';

  /** Default LLM instance (used when execute() is called without an llm parameter). */
  private readonly defaultLlm: OpenRouterService;

  constructor(llm: OpenRouterService) {
    super();
    this.defaultLlm = llm;
  }

  /**
   * The planner now only exposes the strict action-planning prompt.
   */
  getSystemPrompt(context: AgentSessionContext): string {
    return this.getStrictPlanningPrompt(context);
  }

  private getStrictPlanningPrompt(_context: AgentSessionContext): string {
    const agentCatalogue = this.getCoordinatorDescriptors()
      .map(
        (a) =>
          `- **${a.name}** (id: "${a.id}"): ${a.description}\n  Capabilities: ${a.capabilities.join(', ')}`
      )
      .join('\n');

    const prompt = `You are the action planner for Agent X. The request has already been classified as an ACTION.

Your job is to do exactly one of these:
1. Return an execution plan with one or more coordinator tasks.
2. Return a structured clarification request when a required parameter is missing.

## Available Coordinators
${agentCatalogue}

## Rules
1. Never answer conversationally and never refuse the action.
2. Use resultType="execution" when enough information exists to proceed.
3. Use resultType="clarification" only when a missing required parameter blocks execution.
4. If resultType="execution", tasks must contain at least one task and clarificationQuestion must be null.
5. If resultType="clarification", tasks must be [] and clarificationQuestion must be a specific question the user can answer.
6. Imperative requests such as open, launch, navigate, watch, send, create, generate, run, log in, or analyze should default to execution unless a concrete missing parameter prevents safe execution.
7. Do not invent missing recipients, destinations, or assets just to avoid clarification.
8. Assign each task to exactly one coordinator by id.
9. If the user input contains [Plan Revision Context], treat it as an in-place revision of an existing saved plan. Preserve valid steps where possible and modify only the parts required by the latest request.
10. For tasks containing external links/media URLs, plan direct extraction first (classification/scrape/staged media path). Do not start with live view unless the source is explicitly auth-gated or direct extraction fails.
10a. If the request references selected Team Files, universal documents, saved playbooks, film reviews, source ids, or folder ids, treat those ids/labels as lightweight pointers rather than full payloads. Plan an explicit retrieval/inspection phase first unless the request already includes a clearly labeled hydrated excerpt that is sufficient for the task.
10b. For pointer-based saved artifacts, the plan should usually inspect the backing record before recommendation or mutation work. Example patterns: Team Files document -> inspect artifact before summarizing/editing; film review or sourceId -> inspect review/breakdown before analysis/update; folder organization request -> inspect folder tree before move/create/delete steps.
10c. Routine saved-profile field edits belong to data_coordinator, not admin_coordinator. Examples: changing first name, last name, display name, email, phone, bio/aboutMe, city/state/country, or sport-scoped positions should route to data_coordinator because they are canonical record updates.
10d. Use admin_coordinator only when the work is actually compliance, governance, support-ticketing, scheduling policy, or operational administration. Do not send profile-field mutations to admin_coordinator just because they sound like "account management."
11. ARTIFACT DELIVERY PROTOCOL (MANDATORY): When a task will generate a user-facing artifact, always add a description directive that selects the best-fit output tool and tells the coordinator to reference the artifact in the chat summary instead of pasting raw content. Use dynamic_export for PDFs/CSVs/XLSX workbooks/documents/tables, generate_chart_visualization for charts/funnels/process visuals, create_play_diagram or create_board_diagram for play/drill diagrams, and native media tools for graphics/video/audio outputs.
12. When the work naturally has sequential phases, split it into multiple tasks even if the same coordinator owns every phase. Do not collapse setup -> production -> QA/delivery into one generic task just because a single coordinator can do all of it.
13. Creative media workflows such as highlight reels, highlight videos, promo edits, branded clip packages, or multi-clip video production should usually be planned as separate phases: stage assets/context, produce the media artifact, then validate/deliver the final output. Only keep them as one task when the user explicitly asks for a simple merge, raw cut, plain trim, or another truly single-step edit.

## Output Format (STRICT JSON)
Respond with ONLY a JSON object:
{
  "resultType": "execution" | "clarification",
  "summary": "short summary",
  "estimatedSteps": 1,
  "clarificationQuestion": null,
  "clarificationContext": null,
  "tasks": [
    {
      "id": "1",
      "assignedAgent": "data_coordinator",
      "displayLabel": "Extract Link Data",
      "description": "Classify the URL and extract media directly using the platform-specific route before any fallback.",
      "dependsOn": []
    }
  ]
}

displayLabel: short verb-first label shown in the UI (≤8 words, e.g. “Find transfer portal targets”).
description: full execution intent for the coordinator — as detailed as needed.`;

    return resolvePlannerSystemPrompt(prompt);
  }

  private getCoordinatorDescriptors(): readonly AgentDescriptor[] {
    return getConfiguredCoordinatorDescriptors().filter((descriptor) => descriptor.id !== 'router');
  }

  private buildCapabilitySnapshotPrompt(snapshot: PlannerCapabilitySnapshot): string {
    const compactPayload = snapshot.coordinators.map((coordinator) => ({
      agentId: coordinator.agentId,
      allowedToolCount: coordinator.allowedToolNames.length,
      matchedTools: coordinator.matchedToolNames.slice(0, 8),
      allowedEntityGroups: coordinator.allowedEntityGroups,
      staticSkillHints: coordinator.staticSkillHints.slice(0, 6),
      matchedSkillHints: coordinator.matchedSkillHints.slice(0, 4),
      confidence: coordinator.confidence,
    }));

    return [
      '[Coordinator Capability Snapshot]',
      `schemaVersion: ${snapshot.schemaVersion}`,
      `hash: ${snapshot.hash}`,
      'Use this snapshot as the source of truth for feasible coordinator assignment.',
      `snapshot: ${JSON.stringify(compactPayload)}`,
    ].join('\n');
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
    // Planner needs deep reasoning to decompose complex tasks into accurate DAGs.
    // Extended thinking is enabled here so it can fully reason before outputting JSON.
    return {
      ...MODEL_ROUTING_DEFAULTS['routing'],
      maxTokens: 4096,
      enableThinking: true,
      thinkingBudgetTokens: 8000,
    };
  }

  /**
   * Execute strict coordinator planning only.
   */
  override async execute(
    intent: string,
    context: AgentSessionContext,
    _tools: readonly AgentToolDefinition[],
    llm?: OpenRouterService,
    toolRegistryOrOptions?: ToolRegistry | PlannerExecutionOptions,
    _skillRegistry?: SkillRegistry,
    _onStreamEvent?: OnStreamEvent,
    _approvalGate?: ApprovalGateService,
    options?: PlannerExecutionOptions
  ): Promise<AgentOperationResult> {
    const activeLlm = llm ?? this.defaultLlm;
    const plannerOptions = isPlannerExecutionOptions(toolRegistryOrOptions)
      ? toolRegistryOrOptions
      : options;

    return this.executeStrictPlanning(intent, context, activeLlm, plannerOptions, _onStreamEvent);
  }

  private async executeStrictPlanning(
    intent: string,
    context: AgentSessionContext,
    llm: OpenRouterService,
    plannerOptions?: PlannerExecutionOptions,
    onStreamEvent?: OnStreamEvent
  ): Promise<AgentOperationResult> {
    const capabilitySnapshot =
      plannerOptions?.capabilitySnapshot ??
      (plannerOptions?.capabilitySnapshotResolver
        ? await plannerOptions.capabilitySnapshotResolver()
        : undefined);

    const plannerIntent = capabilitySnapshot
      ? `${intent}\n\n${this.buildCapabilitySnapshotPrompt(capabilitySnapshot)}`
      : intent;

    const routing = this.getModelRouting();
    const telemetryContext = context.operationId
      ? {
          operationId: context.operationId,
          userId: context.userId,
          agentId: this.id,
        }
      : undefined;

    const result: AgentPlannerLlmResult = onStreamEvent
      ? await this.executeStrictPlanningStream(
          llm,
          this.getStrictPlanningPrompt(context),
          plannerIntent,
          routing,
          telemetryContext,
          context.signal,
          onStreamEvent
        )
      : await llm.prompt(this.getStrictPlanningPrompt(context), plannerIntent, {
          tier: routing.tier,
          maxTokens: routing.maxTokens,
          temperature: routing.temperature,
          ...(routing.enableThinking && {
            enableThinking: true,
            thinkingBudgetTokens: routing.thinkingBudgetTokens,
          }),
          outputSchema: {
            name: 'planner_execution_plan',
            schema: strictPlannerResponseSchema,
          },
          ...(telemetryContext ? { telemetryContext } : {}),
        });

    const parsed = this.resolveStrictPlanningResponse(result, intent);
    const now = new Date().toISOString();
    const tasks: AgentTask[] = parsed.tasks.map((task) => ({
      id: task.id,
      assignedAgent: task.assignedAgent,
      displayLabel: task.displayLabel,
      description: task.description,
      status: 'pending' as AgentTaskStatus,
      dependsOn: task.dependsOn,
      createdAt: now,
    }));

    const plan: AgentExecutionPlan = {
      operationId: context.operationId ?? context.sessionId,
      tasks,
      createdAt: now,
    };

    if (parsed.resultType === 'execution') {
      this.validateDependencyGraph(plan.tasks);
    }

    return {
      summary: sanitizeAgentOutputText(parsed.summary),
      data: {
        plan,
        estimatedSteps: parsed.estimatedSteps,
        ...(parsed.clarificationQuestion
          ? {
              clarificationQuestion: sanitizeAgentOutputText(parsed.clarificationQuestion),
              clarificationContext: parsed.clarificationContext
                ? sanitizeAgentOutputText(parsed.clarificationContext)
                : undefined,
            }
          : {}),
        metadata: {
          tier: 'routing',
          executionMode: 'strict_action_planner',
          resultType: parsed.resultType,
          classificationReasoning:
            'Strict action planning only; legacy tier classification removed.',
        },
      },
      suggestions: [],
    };
  }

  private resolveStrictPlanningResponse(
    result: AgentPlannerLlmResult,
    intent: string
  ): StrictPlannerResponse {
    const validated = strictPlannerResponseSchema.safeParse(result.parsedOutput);
    if (!validated.success) {
      const firstIssue = validated.error.issues[0];
      const path = firstIssue?.path.length ? firstIssue.path.join('.') : 'response';
      throw new AgentEngineError(
        'PLANNER_SCHEMA_INVALID',
        `Planner LLM response failed schema validation at ${path}: ${firstIssue?.message ?? 'Invalid output.'}`
      );
    }

    const invalidAssignedAgents: string[] = [];
    const normalizedTasks = validated.data.tasks.map((task) => {
      const assignedAgent = normalizePlannerAssignedAgent(task.assignedAgent);
      if (!assignedAgent) {
        invalidAssignedAgents.push(task.assignedAgent);
      }

      return {
        id: task.id,
        assignedAgent,
        displayLabel: task.displayLabel,
        description: task.description,
        dependsOn: task.dependsOn,
      };
    });

    const expandedTasks = this.expandSequentialCreativeMediaTasks(
      intent,
      normalizedTasks.filter(
        (
          task
        ): task is (typeof normalizedTasks)[number] & {
          assignedAgent: AgentIdentifier;
        } => task.assignedAgent !== null
      )
    );

    if (invalidAssignedAgents.length > 0) {
      throw new AgentEngineError(
        'PLANNER_SCHEMA_INVALID',
        `Planner assigned non-routable agents: ${invalidAssignedAgents.join(', ')}. ` +
          `Allowed coordinators: ${COORDINATOR_AGENT_IDS.join(', ')}.`
      );
    }

    if (validated.data.resultType === 'execution' && expandedTasks.length === 0) {
      throw new AgentEngineError(
        'PLANNER_SCHEMA_INVALID',
        'Strict action planner returned execution without any tasks.'
      );
    }

    if (
      validated.data.resultType === 'clarification' &&
      (!validated.data.clarificationQuestion ||
        validated.data.clarificationQuestion.trim().length === 0)
    ) {
      throw new AgentEngineError(
        'PLANNER_SCHEMA_INVALID',
        'Strict action planner returned clarification without a question.'
      );
    }

    if (validated.data.resultType === 'clarification' && expandedTasks.length > 0) {
      throw new AgentEngineError(
        'PLANNER_SCHEMA_INVALID',
        'Strict action planner cannot return tasks alongside a clarification.'
      );
    }

    return {
      resultType: validated.data.resultType,
      summary: validated.data.summary,
      estimatedSteps:
        validated.data.resultType === 'execution'
          ? Math.max(validated.data.estimatedSteps, expandedTasks.length)
          : validated.data.estimatedSteps,
      clarificationQuestion: validated.data.clarificationQuestion,
      clarificationContext: validated.data.clarificationContext,
      tasks: expandedTasks,
    };
  }

  private expandSequentialCreativeMediaTasks(
    intent: string,
    tasks: readonly {
      id: string;
      assignedAgent: AgentIdentifier;
      displayLabel?: string;
      description: string;
      dependsOn: readonly string[];
    }[]
  ): readonly {
    id: string;
    assignedAgent: AgentIdentifier;
    displayLabel?: string;
    description: string;
    dependsOn: readonly string[];
  }[] {
    if (tasks.length !== 1) return tasks;

    const [task] = tasks;
    if (!task || task.assignedAgent !== 'brand_coordinator') return tasks;

    const combined = `${intent}\n${task.displayLabel ?? ''}\n${task.description}`.toLowerCase();
    const isCreativeMediaWorkflow =
      /\b(highlight reel|highlight video|video reel|promo video|video package|multi-clip|merge clips|merged video|video montage|branded reel|branded video)\b/i.test(
        combined
      );
    const explicitlySingleStep =
      /\b(simple merge|just merge|merge only|raw cut|plain merge|plain cut|trim only|single clip|one clip|no intro|without intro)\b/i.test(
        combined
      );

    if (!isCreativeMediaWorkflow || explicitlySingleStep) {
      return tasks;
    }

    const originalDescription = task.description.trim();

    return [
      {
        id: '1',
        assignedAgent: task.assignedAgent,
        displayLabel: 'Stage media inputs',
        description:
          'Inspect the source clips, stage any required media inputs, and gather the brand/context assets needed for the highlight workflow before editing. ' +
          originalDescription,
        dependsOn: [],
      },
      {
        id: '2',
        assignedAgent: task.assignedAgent,
        displayLabel: 'Build highlight reel',
        description:
          'Use the staged clips and brand context to produce the branded highlight reel artifact. ' +
          originalDescription,
        dependsOn: ['1'],
      },
      {
        id: '3',
        assignedAgent: task.assignedAgent,
        displayLabel: 'QA and deliver reel',
        description:
          'Validate the merged output, thumbnail/playability, and final branding polish, then deliver the finished highlight reel in chat with a concise summary.',
        dependsOn: ['2'],
      },
    ];
  }

  private async executeStrictPlanningStream(
    llm: OpenRouterService,
    systemPrompt: string,
    plannerIntent: string,
    routing: ModelRoutingConfig,
    telemetryContext:
      | {
          readonly operationId: string;
          readonly userId: string;
          readonly agentId: AgentIdentifier;
        }
      | undefined,
    signal: AbortSignal | undefined,
    onStreamEvent: OnStreamEvent
  ): Promise<AgentPlannerLlmResult> {
    let thinkingContent = '';
    const streamed = await llm.completeStream(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: plannerIntent },
      ],
      {
        tier: routing.tier,
        maxTokens: routing.maxTokens,
        temperature: routing.temperature,
        ...(routing.enableThinking && {
          enableThinking: true,
          thinkingBudgetTokens: routing.thinkingBudgetTokens,
        }),
        ...(telemetryContext ? { telemetryContext } : {}),
        ...(signal ? { signal } : {}),
      },
      (delta) => {
        if (!delta.thinkingContent) return;
        thinkingContent += delta.thinkingContent;
        onStreamEvent({
          type: 'thinking',
          agentId: this.id,
          thinkingText: delta.thinkingContent,
        });
      }
    );

    const parsedOutput = this.parsePlannerJson(streamed.content);

    return {
      content: streamed.content,
      parsedOutput,
      thinkingContent: thinkingContent.length > 0 ? thinkingContent : null,
    };
  }

  private parsePlannerJson(content: string): unknown {
    try {
      return JSON.parse(content);
    } catch {
      const trimmed = content.trim();
      if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
        const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        try {
          return JSON.parse(withoutFence);
        } catch {
          return undefined;
        }
      }
      return undefined;
    }
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

/**
 * Shape returned by the LLM after parsing. Documentation-only \u2014 the live
 * planner uses `AgentPlannerLlmResult` (below) which is the runtime
 * envelope returned by `OpenRouterService.chatJson`. The `PlannerLLMTask`
 * type is exported separately for the parser.
 */

interface PlannerLLMTask {
  readonly id: string;
  readonly assignedAgent: AgentIdentifier;
  readonly displayLabel?: string;
  readonly description: string;
  readonly dependsOn: readonly string[];
}

interface AgentPlannerLlmResult {
  readonly content: string | null;
  readonly parsedOutput?: unknown;
  readonly thinkingContent?: string | null;
}
