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
import { createHash } from 'node:crypto';

// IMPORTANT: This schema is passed directly to OpenRouter via z.toJSONSchema().
// Keep it transform-free; normalize values after parsing.
const plannerResponseSchema = z.object({
  summary: z.string().optional(),
  estimatedSteps: z.number().optional(),
  directResponse: z.string().optional(),
  tasks: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).optional(),
      assignedAgent: z.string().optional(),
      description: z.string().optional(),
      dependsOn: z.array(z.union([z.string(), z.number()])).optional(),
    })
  ),
});

const normalizedPlannerResponseSchema = z
  .object({
    summary: z.string().optional(),
    estimatedSteps: z.number().optional(),
    directResponse: z.string().optional(),
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
    directResponse: data.directResponse,
    tasks: data.tasks.map((task, idx) => ({
      id: String(task.id ?? idx + 1),
      assignedAgent: task.assignedAgent ?? 'strategy_coordinator',
      description: task.description ?? '',
      dependsOn: (task.dependsOn ?? []).map(String),
    })),
  }));

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
  recruiter: 'recruiting_coordinator',
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
  readonly skipClassification?: boolean;
}

function isPlannerExecutionOptions(
  value: ToolRegistry | PlannerExecutionOptions | undefined
): value is PlannerExecutionOptions {
  if (!value || typeof value !== 'object') return false;
  return (
    'capabilitySnapshot' in value ||
    'capabilitySnapshotResolver' in value ||
    'skipClassification' in value
  );
}

/**
 * Classification schema for determining if an intent should use chat tier (conversational)
 * or routing tier (planning-required). This is a fast, lightweight decision.
 */
const intentClassificationSchema = z.object({
  isConversational: z
    .boolean()
    .describe('True if this is conversational Q&A; false if planning/delegation needed'),
  reasoning: z.string().describe('Brief explanation of the classification'),
  directResponse: z
    .string()
    .nullable()
    .describe('Direct answer to the user when isConversational=true'),
  estimatedComplexity: z
    .enum(['simple', 'moderate', 'complex'])
    .describe('Rough complexity estimate'),
});

const CLASSIFICATION_CACHE_TTL_MS = 5 * 60_000;
const CLASSIFICATION_CACHE_MAX_ENTRIES = 512;
const ACTION_INTENT_VERB_PATTERN =
  /\b(open|launch|navigate|go to|visit|watch|analyze|grade|create|generate|build|draft|write|send|post|upload|download|scrape|collect|fetch|find|search|book|schedule|login|log in|sign in|click|tap|run|start)\b/i;
const ACTION_INTENT_TARGET_PATTERN =
  /\b(hudl|youtube|vimeo|instagram|tiktok|twitter|x\b|linkedin|gmail|outlook|website|web page|url|live view|browser|film|highlight|report|graphic|email|operation|workflow)\b/i;
const ACTION_INTENT_DIRECTIVE_PATTERN =
  /\b(for me|please|let'?s|can you|could you|i need you to|help me|start|run)\b/i;
const HOW_TO_QUESTION_PATTERN = /^\s*(how do i|how can i|how to)\b/i;

export class PlannerAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'router';
  readonly name = 'Chief of Staff';

  /** Default LLM instance (used when execute() is called without an llm parameter). */
  private readonly defaultLlm: OpenRouterService;
  private readonly classificationCache = new Map<
    string,
    {
      readonly result: {
        readonly isConversational: boolean;
        readonly reasoning: string;
        readonly complexity: 'simple' | 'moderate' | 'complex';
        readonly directResponse?: string;
      };
      readonly expiresAt: number;
    }
  >();

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

Your job is to decompose the user's request into a structured execution plan (a To-Do list),
OR to respond directly as the Chief of Staff when no coordinator action is needed.

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
7. **Direct Response (Chief of Staff mode)**: ALWAYS respond directly (tasks: [], directResponse: "...") for:
   - Greetings: "hi", "hello", "hey", "what's up"
   - Identity questions: "who are you", "who am I speaking to", "what is Agent X", "what can you do"
   - Platform explanation: "how does NXT1 work", "what features do you have"
   - Sports knowledge questions that don't require fetching or sending anything
   - ANY conversational message that does NOT require a coordinator to perform work
   NEVER create a task just to answer a question. You are the Chief of Staff — answer directly.
   Only assign tasks to coordinators when real work must be executed: emails sent, data fetched,
   reports generated, content created, or operations run.

## Output Format (STRICT JSON)
Respond with ONLY a JSON object matching this schema — no markdown, no explanation:
{
  "summary": "One-sentence description of the overall plan or response",
  "estimatedSteps": <number>,
  "directResponse": "<your answer here — ONLY set this when tasks is empty and you are responding directly as Chief of Staff>",
  "tasks": [
    {
      "id": "1",
      "assignedAgent": "<agent_id>",
      "description": "What this task does",
      "dependsOn": []
    }
  ]
}
Omit "directResponse" entirely when tasks is non-empty.`;

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
    return { ...MODEL_ROUTING_DEFAULTS['routing'], maxTokens: 1024 };
  }

  /**
   * Uses the "chat" tier — lightweight conversational Q&A and classification.
   * DeepSeek-v3.2 is cost-effective for simple routing decisions.
   */
  getChatModelRouting(): ModelRoutingConfig {
    return { ...MODEL_ROUTING_DEFAULTS['chat'], maxTokens: 512 };
  }

  /**
   * Classify the intent to determine if it should use chat tier (conversational Q&A)
   * or routing tier (planning-required). This is a cost-optimization step.
   *
   * Uses the lightweight chat tier (DeepSeek) for classification; escalates to
   * routing tier (Sonnet) only if planning/delegation is needed.
   */
  private async classifyIntentTier(
    intent: string,
    context: AgentSessionContext,
    llm: OpenRouterService,
    onStreamEvent?: OnStreamEvent
  ): Promise<{
    isConversational: boolean;
    reasoning: string;
    complexity: 'simple' | 'moderate' | 'complex';
    directResponse?: string;
  }> {
    const cacheKey = this.buildClassificationCacheKey(context, intent);
    const cached = this.classificationCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.emitClassificationProgress(onStreamEvent, context, 'Using recent intent analysis.', {
        eventType: 'progress_subphase',
        phase: 'classification',
        source: 'cache_hit',
      });
      return cached.result;
    }

    this.emitClassificationProgress(
      onStreamEvent,
      context,
      'Analyzing your request to determine execution path...',
      {
        eventType: 'progress_stage',
        phase: 'classification',
        phaseIndex: 1,
        phaseTotal: 3,
      }
    );

    const chatRouting = this.getChatModelRouting();
    const classificationPrompt = `You are classifying a user request to determine if it should be answered directly (conversational) or requires planning/delegation to specialist agents.

CONVERSATIONAL (answer directly):
- General questions about NXT1 features, sports, recruiting, rules
- "How do I..." platform help questions
- Status checks ("what's my profile status?")
- Sports knowledge questions
- Brief advice or explanations

PLANNING-REQUIRED (delegate to specialists):
- Any imperative action request ("open", "go to", "watch", "log in", "send", "create", "run") where the user is asking Agent X to perform work.
- "Generate my recruiting email" → needs recruiting_coordinator
- "Analyze my highlight tape" → needs performance_coordinator
- "Create a social post" → needs brand_coordinator
- Multi-step work (grade tape + email coaches)
- Create/modify/send/post operations
- Anything requiring backend work

User request: "${intent}"

Classify it. If conversational, also provide a direct answer. If planning-required, explain what work needs to happen.`;

    try {
      // Send the raw intent as the user turn so providers that require at least
      // one non-empty user message do not reject structured classification calls.
      const result = await llm.prompt(classificationPrompt, intent, {
        tier: chatRouting.tier,
        maxTokens: chatRouting.maxTokens,
        temperature: 0.3,
        timeoutMs: 8_000,
        outputSchema: {
          name: 'intent_classification',
          schema: intentClassificationSchema,
        },
        ...(context.operationId && {
          telemetryContext: {
            operationId: context.operationId,
            userId: context.userId,
            agentId: this.id,
          },
        }),
      });

      const classification = result.parsedOutput as
        | z.infer<typeof intentClassificationSchema>
        | undefined;
      if (!classification) {
        // Fallback: if chat classification fails, assume planning-required
        return {
          isConversational: false,
          reasoning: 'Classification failed, escalating to routing tier',
          complexity: 'moderate',
        };
      }

      const classificationResult = {
        isConversational: classification.isConversational,
        reasoning: classification.reasoning,
        complexity: classification.estimatedComplexity,
        directResponse: classification.directResponse?.trim() || undefined,
      };

      this.classificationCache.set(cacheKey, {
        result: classificationResult,
        expiresAt: Date.now() + CLASSIFICATION_CACHE_TTL_MS,
      });
      this.pruneClassificationCache();

      this.emitClassificationProgress(
        onStreamEvent,
        context,
        classificationResult.isConversational
          ? 'Request looks conversational. Preparing direct response.'
          : 'Request requires planning with specialist coordinators.',
        {
          eventType: 'progress_subphase',
          phase: 'classification',
          complexity: classificationResult.complexity,
          mode: classificationResult.isConversational ? 'conversational' : 'planning',
        }
      );

      return classificationResult;
    } catch (_err) {
      this.emitClassificationProgress(
        onStreamEvent,
        context,
        'Intent analysis failed over to planning-safe mode.',
        {
          eventType: 'progress_subphase',
          phase: 'classification',
          status: 'fallback',
        }
      );
      this.emitClassificationMetric(
        onStreamEvent,
        context,
        'fallback_activation',
        1,
        'Fallback activated: planner classification failed open.',
        {
          phase: 'classification',
          fallbackType: 'planner_classification_fail_open',
        }
      );

      // If classification call fails, escalate to routing tier for safety
      return {
        isConversational: false,
        reasoning: 'Classification LLM failed, escalating to routing tier',
        complexity: 'moderate',
      };
    }
  }

  private isActionIntentDominant(intent: string): boolean {
    const normalizedIntent = intent.trim();
    if (!normalizedIntent) return false;

    const hasActionVerb = ACTION_INTENT_VERB_PATTERN.test(normalizedIntent);
    const hasActionTarget = ACTION_INTENT_TARGET_PATTERN.test(normalizedIntent);
    const hasDirectiveCue = ACTION_INTENT_DIRECTIVE_PATTERN.test(normalizedIntent);
    const isHowToQuestion = HOW_TO_QUESTION_PATTERN.test(normalizedIntent);

    if (!hasActionVerb || !hasActionTarget) return false;
    if (isHowToQuestion && !hasDirectiveCue) return false;

    return true;
  }

  private emitClassificationProgress(
    onStreamEvent: OnStreamEvent | undefined,
    context: AgentSessionContext,
    message: string,
    metadata: Record<string, unknown>
  ): void {
    if (!onStreamEvent || !context.operationId) return;

    const eventType =
      metadata['eventType'] === 'progress_subphase' ? 'progress_subphase' : 'progress_stage';

    onStreamEvent({
      type: eventType,
      operationId: context.operationId,
      agentId: this.id,
      stageType: 'router',
      stage: 'decomposing_intent',
      message,
      metadata,
    });
  }

  private emitClassificationMetric(
    onStreamEvent: OnStreamEvent | undefined,
    context: AgentSessionContext,
    metricName: string,
    value: number,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    if (!onStreamEvent || !context.operationId) return;

    onStreamEvent({
      type: 'metric',
      operationId: context.operationId,
      agentId: this.id,
      stageType: 'router',
      stage: 'decomposing_intent',
      message,
      metadata: {
        eventType: 'metric',
        metricName,
        value,
        ...(metadata ?? {}),
      },
    });
  }

  private buildClassificationCacheKey(context: AgentSessionContext, intent: string): string {
    const normalizedIntent = intent.trim().toLowerCase().replace(/\s+/g, ' ');
    const intentHash = createHash('sha1').update(normalizedIntent).digest('hex');
    const mode = context.mode?.trim().toLowerCase() ?? 'default';
    const threadId = context.threadId?.trim() ?? 'no-thread';
    const environment = context.environment ?? 'unknown';
    return `${context.userId}:${mode}:${environment}:${threadId}:${intentHash}`;
  }

  private pruneClassificationCache(): void {
    const now = Date.now();
    for (const [key, value] of this.classificationCache) {
      if (value.expiresAt <= now) {
        this.classificationCache.delete(key);
      }
    }

    while (this.classificationCache.size > CLASSIFICATION_CACHE_MAX_ENTRIES) {
      const oldestKey = this.classificationCache.keys().next().value;
      if (!oldestKey) break;
      this.classificationCache.delete(oldestKey);
    }
  }

  /**
   * Execute the planning phase with intelligent tier selection.
   *
   * 1. Classify intent to determine tier (chat for conversational, routing for planning).
   * 2. For conversational: use chat tier (DeepSeek) for direct responses.
   * 3. For planning: use routing tier (Sonnet) to build task DAG.
   * 4. Validate task IDs and dependency references.
   * 5. Return the plan as the operation result.
   *
   * The Worker Queue reads .result.data.plan to get the task list.
   */
  override async execute(
    intent: string,
    context: AgentSessionContext,
    _tools: readonly AgentToolDefinition[],
    llm?: OpenRouterService,
    toolRegistryOrOptions?: ToolRegistry | PlannerExecutionOptions,
    _skillRegistry?: SkillRegistry,
    onStreamEvent?: OnStreamEvent,
    _approvalGate?: ApprovalGateService,
    options?: PlannerExecutionOptions
  ): Promise<AgentOperationResult> {
    const activeLlm = llm ?? this.defaultLlm;
    const plannerOptions = isPlannerExecutionOptions(toolRegistryOrOptions)
      ? toolRegistryOrOptions
      : options;

    // ── Step 1: Classify intent to determine tier ──────────────────────────
    let classification: {
      isConversational: boolean;
      reasoning: string;
      complexity: 'simple' | 'moderate' | 'complex';
      directResponse?: string;
    };
    if (plannerOptions?.skipClassification) {
      classification = {
        isConversational: false,
        reasoning: 'Classification skipped because routing tier was already selected upstream',
        complexity: 'moderate',
      };
    } else {
      try {
        classification = await this.classifyIntentTier(intent, context, activeLlm, onStreamEvent);
      } catch (_err) {
        // If classification fails entirely, fall back to routing tier (safe default)
        classification = {
          isConversational: false,
          reasoning: 'Classification failed, using routing tier',
          complexity: 'moderate',
        };
      }
    }

    if (classification.isConversational && this.isActionIntentDominant(intent)) {
      classification = {
        ...classification,
        isConversational: false,
        directResponse: undefined,
        reasoning: `Action intent dominance override: ${classification.reasoning}`,
      };
      this.emitClassificationProgress(
        onStreamEvent,
        context,
        'Detected executable action intent. Routing to planning mode.',
        {
          eventType: 'progress_subphase',
          phase: 'classification',
          source: 'action_intent_override',
        }
      );
    }

    if (classification.isConversational && classification.directResponse) {
      const direct = sanitizeAgentOutputText(classification.directResponse);
      return {
        summary: direct,
        data: {
          directResponse: direct,
          metadata: {
            tier: 'chat',
            complexity: classification.complexity,
            classificationReasoning: classification.reasoning,
            conversationalFastPath: true,
          },
        },
        suggestions: [],
      };
    }

    // ── Step 2: Route to appropriate tier ──────────────────────────────────
    let modelRouting: ModelRoutingConfig;
    let modelTier: 'chat' | 'routing';

    if (classification.isConversational) {
      modelRouting = this.getChatModelRouting();
      modelTier = 'chat';
    } else {
      modelRouting = this.getModelRouting();
      modelTier = 'routing';
    }

    // ── Step 3: Call LLM with selected tier ───────────────────────────────
    const capabilitySnapshot =
      modelTier === 'routing'
        ? (plannerOptions?.capabilitySnapshot ??
          (plannerOptions?.capabilitySnapshotResolver
            ? await plannerOptions.capabilitySnapshotResolver()
            : undefined))
        : undefined;

    const plannerIntent =
      modelTier === 'routing' && capabilitySnapshot
        ? `${intent}\n\n${this.buildCapabilitySnapshotPrompt(capabilitySnapshot)}`
        : intent;

    const result = await activeLlm.prompt(this.getSystemPrompt(context), plannerIntent, {
      tier: modelRouting.tier,
      maxTokens: modelRouting.maxTokens,
      temperature: modelRouting.temperature,
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

    // ── Step 5: Resolve structured response ───────────────────────────────
    const parsed = this.resolvePlanResponse(result);

    // ── Step 6: Build the execution plan ──────────────────────────────────
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

    // ── Step 7: Validate dependency graph ─────────────────────────────────
    this.validateDependencyGraph(plan.tasks);

    const output: AgentPlannerOutput = {
      plan,
      summary:
        parsed.summary ??
        (parsed.directResponse
          ? 'Direct response from Chief of Staff.'
          : `Created execution plan with ${plan.tasks.length} task(s).`),
      estimatedSteps: parsed.estimatedSteps ?? plan.tasks.length,
    };

    return {
      summary: sanitizeAgentOutputText(output.summary),
      data: {
        plan: output.plan,
        estimatedSteps: output.estimatedSteps,
        ...(parsed.directResponse
          ? { directResponse: sanitizeAgentOutputText(parsed.directResponse) }
          : {}),
        metadata: {
          tier: modelTier,
          complexity: classification.complexity,
          classificationReasoning: classification.reasoning,
        },
      },
      suggestions: [],
    };
  }

  // ─── LLM Response Parser ───────────────────────────────────────────────

  /**
   * Resolve the LLM structured payload into a validated plan structure.
   */
  private resolvePlanResponse(result: AgentPlannerLlmResult): PlannerLLMResponse {
    const validated = normalizedPlannerResponseSchema.safeParse(result.parsedOutput);
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
        ...task,
        assignedAgent,
      };
    });

    if (invalidAssignedAgents.length > 0) {
      throw new AgentEngineError(
        'PLANNER_SCHEMA_INVALID',
        `Planner assigned non-routable agents: ${invalidAssignedAgents.join(', ')}. ` +
          `Allowed coordinators: ${COORDINATOR_AGENT_IDS.join(', ')}.`
      );
    }

    return {
      ...validated.data,
      tasks: normalizedTasks.map((task) => ({
        ...task,
        assignedAgent: task.assignedAgent as AgentIdentifier,
      })),
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
  readonly directResponse?: string;
  readonly tasks: readonly PlannerLLMTask[];
}

interface PlannerLLMTask {
  readonly id: string;
  readonly assignedAgent: AgentIdentifier;
  readonly description: string;
  readonly dependsOn: readonly string[];
}

interface AgentPlannerLlmResult {
  readonly content: string | null;
  readonly parsedOutput?: unknown;
}
