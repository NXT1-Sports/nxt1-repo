import type {
  AgentIdentifier,
  AgentJobUpdate,
  AgentOperationResult,
  AgentSessionContext,
  AgentTask,
  AgentTaskStatus,
  AgentToolDefinition,
  AgentToolAccessContext,
} from '@nxt1/core';
import { COORDINATOR_AGENT_IDS } from '@nxt1/core';
import type { BaseAgent } from '../agents/base.agent.js';
import { isAgentDelegation } from '../exceptions/agent-delegation.exception.js';
import { AgentEngineError } from '../exceptions/agent-engine.error.js';
import { AgentYieldException, isAgentYield } from '../exceptions/agent-yield.exception.js';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { OnStreamEvent } from '../queue/event-writer.js';
import type { ApprovalGateService } from '../services/approval-gate.service.js';
import type { SkillRegistry } from '../skills/skill-registry.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { logger } from '../../../utils/logger.js';
import type { AgentRouterTelemetryService } from './agent-router-telemetry.service.js';
import { isToolAllowedByPatterns, getEffectiveAgentToolPolicy } from '../agents/tool-policy.js';
import { getOperationMemoryService } from '../services/operation-memory.service.js';

export type AgentExecutionMutableTask = Omit<
  AgentTask,
  'status' | 'assignedAgent' | 'description' | 'displayLabel' | 'structuredPayload'
> & {
  status: AgentTaskStatus;
  assignedAgent: Exclude<AgentIdentifier, 'router'>;
  displayLabel?: string;
  description: string;
  structuredPayload?: Record<string, unknown>;
  _lastError?: string;
};

export interface AgentExecutionLoopResult {
  readonly taskResults: Map<string, AgentOperationResult>;
  readonly mutableTasks: AgentExecutionMutableTask[];
  readonly executionDurationMs: number;
}

type TelemetryDeps = Pick<
  AgentRouterTelemetryService,
  'emitProgressOperation' | 'emitUpdate' | 'recordPhaseLatency'
>;

const routableCoordinatorSet = new Set<string>(COORDINATOR_AGENT_IDS);
const SEMANTIC_MATCH_THRESHOLD = 0.35;
const SAFETY_BUFFER_THRESHOLD = 0.2;
const TOOL_COMPANION_MAP: Readonly<Record<string, readonly string[]>> = {
  scrape_and_index_profile: [
    'read_distilled_section',
    'dispatch_extraction',
    'write_core_identity',
    'write_awards',
    'write_combine_metrics',
    'write_rankings',
    'write_season_stats',
    'write_recruiting_activity',
    'write_calendar_events',
    'write_schedule',
    'write_team_stats',
    'write_team_news',
    'write_team_post',
    'write_timeline_post',
    'write_roster_entries',
    'write_athlete_videos',
    'write_connected_source',
  ],
  dispatch_extraction: [
    'write_core_identity',
    'write_awards',
    'write_combine_metrics',
    'write_rankings',
    'write_season_stats',
    'write_recruiting_activity',
    'write_calendar_events',
    'write_schedule',
    'write_team_stats',
    'write_team_news',
    'write_team_post',
    'write_timeline_post',
    'write_roster_entries',
    'write_athlete_videos',
    'write_connected_source',
  ],
  runway_generate_video: ['runway_check_task'],
  runway_edit_video: ['runway_check_task'],
  runway_upscale_video: ['runway_check_task'],
};

function isRoutableCoordinatorAgent(
  agentId: string
): agentId is Exclude<AgentIdentifier, 'router'> {
  return routableCoordinatorSet.has(agentId);
}

function addCompanionTools(
  selected: readonly AgentToolDefinition[],
  allowed: readonly AgentToolDefinition[]
): readonly AgentToolDefinition[] {
  const finalTools = new Map(selected.map((tool) => [tool.name, tool]));

  for (const tool of selected) {
    const companions = TOOL_COMPANION_MAP[tool.name] ?? [];
    for (const companionName of companions) {
      if (finalTools.has(companionName)) {
        continue;
      }

      const companion = allowed.find((candidate) => candidate.name === companionName);
      if (companion) {
        finalTools.set(companion.name, companion);
      }
    }
  }

  return [...finalTools.values()];
}

export class AgentRouterExecutionService {
  constructor(
    private readonly llm: OpenRouterService,
    private readonly toolRegistry: ToolRegistry,
    private readonly telemetry: TelemetryDeps,
    private readonly skillRegistry?: SkillRegistry
  ) {}

  async executePlan(payload: {
    readonly operationId: string;
    readonly userId: string;
    readonly plan: { readonly tasks: readonly AgentTask[] };
    readonly enrichedIntent: string;
    readonly context: AgentSessionContext;
    readonly toolAccessContext: AgentToolAccessContext;
    readonly approvalGate?: ApprovalGateService;
    readonly taskMaxRetries: number;
    readonly agents: ReadonlyMap<AgentIdentifier, BaseAgent>;
    readonly onUpdate?: (update: AgentJobUpdate) => void;
    readonly onStreamEvent?: OnStreamEvent;
    readonly onPlanStateChange?: (
      mutableTasks: readonly AgentExecutionMutableTask[],
      taskResults: ReadonlyMap<string, AgentOperationResult>
    ) => Promise<void> | void;
    readonly signal?: AbortSignal;
    readonly buildTaskIntent: (
      task: AgentTask,
      upstreamResults: Map<string, AgentOperationResult>,
      enrichedContext?: string
    ) => string;
    readonly rerouteDelegatedTask: (
      forwardingIntent: string,
      sourceAgentId: Exclude<AgentIdentifier, 'router'>,
      context: AgentSessionContext,
      structuredPayload?: Record<string, unknown>
    ) => Promise<{
      readonly assignedAgent: Exclude<AgentIdentifier, 'router'>;
      readonly description: string;
      readonly structuredPayload?: Record<string, unknown>;
    } | null>;
  }): Promise<AgentExecutionLoopResult> {
    const {
      operationId,
      userId,
      plan,
      enrichedIntent,
      context,
      toolAccessContext,
      approvalGate,
      taskMaxRetries,
      agents,
      onUpdate,
      onStreamEvent,
      onPlanStateChange,
      signal,
      buildTaskIntent,
      rerouteDelegatedTask,
    } = payload;

    const executionPhaseStartMs = Date.now();

    // ── Tier 5: Initialise operation memory for duplicate-detection ───────
    const operationMemory = getOperationMemoryService();
    operationMemory.init(operationId, enrichedIntent);

    try {
      this.telemetry.emitProgressOperation(onStreamEvent, {
        operationId,
        stage: 'agent_thinking',
        message: 'On it...',
        metadata: { eventType: 'progress_stage', phase: 'execution', phaseIndex: 3, phaseTotal: 5 },
      });

      const taskResults = new Map<string, AgentOperationResult>();
      const mutableTasks = plan.tasks.map((task) => ({
        ...task,
        displayLabel: task.displayLabel,
        _lastError: undefined as string | undefined,
      })) as AgentExecutionMutableTask[];
      this.normalizeTasksForDeterministicExecution(mutableTasks);

      await onPlanStateChange?.(mutableTasks, taskResults);

      while (this.hasPendingTasks(mutableTasks)) {
        const ready = mutableTasks.filter(
          (task) =>
            task.status === 'pending' &&
            task.dependsOn.every(
              (dep) =>
                mutableTasks.find((mutableTask) => mutableTask.id === dep)?.status === 'completed'
            )
        );

        if (ready.length === 0) {
          for (const task of mutableTasks) {
            if (task.status === 'pending') {
              task.status = 'blocked' as AgentTaskStatus;
              task._lastError =
                'Execution plan stalled because remaining tasks had unmet dependencies.';
            }
          }
          this.emitPlannerCard(onStreamEvent, mutableTasks);
          await onPlanStateChange?.(mutableTasks, taskResults);
          break;
        }

        // Serial execution: run exactly one task per loop iteration so the UI
        // shows one active step at a time. Parallelism within a task (the
        // coordinator's own tool execution) is unaffected by this change.
        const activeTask = ready[0]!;
        this.markTaskInProgress(activeTask.id, mutableTasks);
        this.telemetry.emitUpdate(
          onUpdate,
          operationId,
          'acting',
          `Running task ${activeTask.id}: ${activeTask.description}`,
          { eventType: 'task_started', taskId: activeTask.id },
          {
            agentId: activeTask.assignedAgent,
            stage: 'agent_thinking',
            metadata: { taskId: activeTask.id },
          }
        );
        this.emitActivePlannerCard(onStreamEvent, mutableTasks);
        await onPlanStateChange?.(mutableTasks, taskResults);

        const completedAtBatchStart = Object.fromEntries(
          [...taskResults.entries()].map(([key, value]) => [key, value])
        );

        const runTask = async (task: AgentExecutionMutableTask): Promise<void> => {
          for (let attempt = 0; attempt <= taskMaxRetries; attempt += 1) {
            try {
              this.throwIfAborted(signal);

              const assignedAgentId = task.assignedAgent;
              if (!isRoutableCoordinatorAgent(assignedAgentId)) {
                throw new AgentEngineError(
                  'AGENT_NOT_REGISTERED',
                  `Task "${task.id}" assigned to non-routable agent "${assignedAgentId}". ` +
                    `Allowed coordinators: ${COORDINATOR_AGENT_IDS.join(', ')}.`,
                  {
                    metadata: {
                      taskId: task.id,
                      assignedAgentId,
                      allowedAgentIds: COORDINATOR_AGENT_IDS,
                    },
                  }
                );
              }

              const agent = agents.get(assignedAgentId);
              if (!agent) {
                throw new AgentEngineError(
                  'AGENT_NOT_REGISTERED',
                  `No agent registered for "${assignedAgentId}".`,
                  { metadata: { assignedAgentId, taskId: task.id } }
                );
              }

              let taskIntent = buildTaskIntent(task, taskResults, enrichedIntent);

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

                this.telemetry.emitUpdate(
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

              let toolDefs = this.toolRegistry.getDefinitions(agent.id, toolAccessContext);
              try {
                const intentEmbedding = await this.llm.embed(taskIntent);
                const matchedToolDefs = await this.toolRegistry.matchWithScores(
                  intentEmbedding,
                  (text) => this.llm.embed(text),
                  agent.id,
                  toolAccessContext
                );

                const semanticMatched = matchedToolDefs.filter(
                  (tool) => tool.semanticScore >= SEMANTIC_MATCH_THRESHOLD
                );

                // Use the coordinator's own effective policy to gate mutations in the safety
                // buffer. Using ROUTER_POLICY_PATTERNS here was the bug: coordinator-only
                // write tools (write_core_identity, write_season_stats, etc.) have
                // isMutation=true and are intentionally absent from the router's policy,
                // so pure-write tasks delegated to data_coordinator would silently receive
                // no write tools and stall.
                const agentPolicy = getEffectiveAgentToolPolicy(agent.id);
                const safetyBuffer = matchedToolDefs.filter((tool) => {
                  if (tool.semanticScore < SAFETY_BUFFER_THRESHOLD) return false;
                  if (tool.category === 'system') return true;
                  if (!tool.isMutation) return true;
                  return isToolAllowedByPatterns(tool.name, agentPolicy);
                });

                const finalTools = new Map<string, (typeof matchedToolDefs)[number]>();
                for (const tool of semanticMatched) finalTools.set(tool.name, tool);
                for (const tool of safetyBuffer) finalTools.set(tool.name, tool);

                const selectedScored = [...finalTools.values()];
                const selected = addCompanionTools(selectedScored, toolDefs);
                const matchedNonSystemToolCount = selected.filter(
                  (tool) => tool.category !== 'system'
                ).length;

                if (selected.length > 0 && matchedNonSystemToolCount > 0) {
                  toolDefs = selected.map((definition) => ({ ...definition }));

                  logger.info('[AgentRouter] Hybrid tool narrowing selected tools', {
                    operationId,
                    taskId: task.id,
                    agentId: agent.id,
                    selectedTools: selectedScored.map((tool) => ({
                      name: tool.name,
                      score: Number(tool.semanticScore.toFixed(3)),
                      reason:
                        tool.semanticScore >= SEMANTIC_MATCH_THRESHOLD
                          ? 'semantic_match'
                          : 'safety_buffer',
                    })),
                    companionTools: selected
                      .map((tool) => tool.name)
                      .filter((toolName) => !selectedScored.some((tool) => tool.name === toolName)),
                  });
                } else {
                  logger.warn(
                    '[AgentRouter] Hybrid tool narrowing was too sparse — using full allowed tool set',
                    {
                      operationId,
                      taskId: task.id,
                      agentId: agent.id,
                      matchedToolNames: matchedToolDefs.map((tool) => tool.name),
                      fallbackToolCount: toolDefs.length,
                    }
                  );
                }
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
              this.throwIfAborted(signal);

              taskResults.set(task.id, result);
              task.status = 'completed' as AgentTaskStatus;
              this.telemetry.emitUpdate(
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

              this.emitPlannerCard(onStreamEvent, mutableTasks);
              await onPlanStateChange?.(mutableTasks, taskResults);
              return;
            } catch (err) {
              if (this.isAbortError(err)) throw err;

              if (isAgentYield(err)) {
                const yieldErr = err as AgentYieldException;
                task.status = 'awaiting_tool_approval' as AgentTaskStatus;
                task._lastError = 'Waiting for user approval to continue this task.';
                this.emitPlannerCard(onStreamEvent, mutableTasks);
                await onPlanStateChange?.(mutableTasks, taskResults);
                throw new AgentYieldException({
                  ...yieldErr.payload,
                  planContext: {
                    currentTaskId: task.id,
                    completedTaskResults: completedAtBatchStart,
                    enrichedIntent,
                  },
                });
              }

              if (isAgentDelegation(err)) {
                const delErr =
                  err as import('../exceptions/agent-delegation.exception.js').AgentDelegationException;
                const originalAgentId = task.assignedAgent as Exclude<AgentIdentifier, 'router'>;
                logger.warn('[AgentRouter] Agent delegated inside DAG — attempting reroute', {
                  operationId,
                  taskId: task.id,
                  sourceAgent: originalAgentId,
                  forwardingIntent: delErr.payload.forwardingIntent.slice(0, 100),
                });

                const reroute = await rerouteDelegatedTask(
                  delErr.payload.forwardingIntent,
                  originalAgentId,
                  context,
                  delErr.payload.structuredPayload
                );

                if (reroute) {
                  task.assignedAgent = reroute.assignedAgent;
                  task.description = reroute.description;
                  // Preserve structured payload through reroute so the new
                  // coordinator receives all verbatim IDs and references.
                  if (reroute.structuredPayload !== undefined) {
                    task.structuredPayload = reroute.structuredPayload;
                  }
                  task._lastError = undefined;

                  this.telemetry.emitUpdate(
                    onUpdate,
                    operationId,
                    'acting',
                    `Task ${task.id} rerouted to ${reroute.assignedAgent}. Retrying...`,
                    {
                      eventType: 'task_retry',
                      taskId: task.id,
                      assignedAgent: reroute.assignedAgent,
                    },
                    {
                      agentId: 'router',
                      stage: 'routing_to_agent',
                      metadata: {
                        taskId: task.id,
                        delegatedFrom: originalAgentId,
                        reroutedTo: reroute.assignedAgent,
                      },
                    }
                  );
                  continue;
                }

                task._lastError = `Delegated back to router: ${delErr.payload.forwardingIntent}`;
                task.status = 'failed' as AgentTaskStatus;
                this.telemetry.emitUpdate(
                  onUpdate,
                  operationId,
                  'acting',
                  `Task ${task.id} was misrouted — ${originalAgentId} could not handle it.`,
                  {
                    eventType: 'task_failed',
                    taskId: task.id,
                    assignedAgent: originalAgentId,
                    error: task._lastError,
                  },
                  {
                    agentId: 'router',
                    stage: 'routing_to_agent',
                    outcomeCode: 'routing_failed',
                    metadata: {
                      taskId: task.id,
                      delegatedAgentId: originalAgentId,
                    },
                  }
                );
                this.cascadeFailure(task.id, mutableTasks);
                this.emitPlannerCard(onStreamEvent, mutableTasks);
                await onPlanStateChange?.(mutableTasks, taskResults);
                return;
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
                this.telemetry.emitUpdate(
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
                this.emitPlannerCard(onStreamEvent, mutableTasks);
                await onPlanStateChange?.(mutableTasks, taskResults);
              }
            }
          }
        };

        // Run the single active task — AbortError and AgentYieldException propagate naturally.
        await runTask(activeTask);
        this.throwIfAborted(signal);
      }

      const executionDurationMs = Date.now() - executionPhaseStartMs;
      this.telemetry.recordPhaseLatency('execution', executionDurationMs, {
        operationId,
        userId,
        taskCount: mutableTasks.length,
        completedTaskCount: taskResults.size,
      });
      this.telemetry.emitProgressOperation(onStreamEvent, {
        operationId,
        stage: 'agent_thinking',
        message: `Execution latency: ${executionDurationMs}ms`,
        metadata: {
          eventType: 'metric',
          metricName: 'phase_latency_ms',
          phase: 'execution',
          taskCount: mutableTasks.length,
          completedTaskCount: taskResults.size,
          value: executionDurationMs,
        },
      });
      this.telemetry.emitProgressOperation(onStreamEvent, {
        operationId,
        stage: 'agent_thinking',
        message: 'Putting your answer together...',
        metadata: {
          eventType: 'progress_subphase',
          phase: 'execution',
          status: 'done',
          taskCount: mutableTasks.length,
        },
      });

      return {
        taskResults,
        mutableTasks,
        executionDurationMs,
      };
    } finally {
      // ── Tier 5: Always flush operation memory on every exit path ─────────
      operationMemory.flush(operationId);
    }
  }

  private hasPendingTasks(tasks: readonly AgentExecutionMutableTask[]): boolean {
    return tasks.some((task) => task.status === 'pending');
  }

  private isAbortError(err: unknown): err is Error {
    return err instanceof Error && err.name === 'AbortError';
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted', 'AbortError');
    }
  }

  private cascadeFailure(failedTaskId: string, tasks: AgentExecutionMutableTask[]): void {
    const queue = [failedTaskId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;

      for (const task of tasks) {
        if (task.status === 'pending' && task.dependsOn.includes(current)) {
          task.status = 'blocked' as AgentTaskStatus;
          task._lastError = `Blocked by failed dependency: ${current}`;
          queue.push(task.id);
        }
      }
    }
  }

  /**
   * Emits the planner card after a task completes. All items show their final
   * done/pending state; none are marked active.
   * Only emitted when the plan has ≥3 tasks — single/dual-task plans run silently.
   */
  private emitPlannerCard(
    onStreamEvent: OnStreamEvent | undefined,
    mutableTasks: readonly AgentExecutionMutableTask[]
  ): void {
    if (!onStreamEvent || mutableTasks.length < 3) return;

    onStreamEvent({
      type: 'card',
      cardData: {
        agentId: 'router',
        type: 'planner',
        title: 'Execution Plan',
        payload: {
          items: mutableTasks.map((task) => this.toPlannerItem(task)),
        },
      },
    });
  }

  /**
   * Emits the planner card when a task starts executing, marking exactly one
   * item as active so the UI can show an in-progress spinner.
   * Only emitted when the plan has ≥3 tasks.
   */
  private emitActivePlannerCard(
    onStreamEvent: OnStreamEvent | undefined,
    mutableTasks: readonly AgentExecutionMutableTask[]
  ): void {
    if (!onStreamEvent || mutableTasks.length < 3) return;

    onStreamEvent({
      type: 'card',
      cardData: {
        agentId: 'router',
        type: 'planner',
        title: 'Execution Plan',
        payload: {
          items: mutableTasks.map((task) => this.toPlannerItem(task)),
        },
      },
    });
  }

  private toPlannerItem(task: AgentExecutionMutableTask): {
    id: string;
    label: string;
    done: boolean;
    active: boolean;
    status: AgentTaskStatus;
    note?: string;
  } {
    return {
      id: task.id,
      label: task.displayLabel ?? task.description,
      done: task.status === ('completed' as AgentTaskStatus),
      active: task.status === ('in_progress' as AgentTaskStatus),
      status: task.status,
      ...(task._lastError ? { note: task._lastError } : {}),
    };
  }

  private normalizeTasksForDeterministicExecution(tasks: AgentExecutionMutableTask[]): void {
    for (const task of tasks) {
      const isTerminal =
        task.status === ('completed' as AgentTaskStatus) ||
        task.status === ('failed' as AgentTaskStatus) ||
        task.status === ('blocked' as AgentTaskStatus);
      if (isTerminal) continue;

      // Resume and stale snapshots may carry legacy intermediate states
      // (in_progress/awaiting_tool_approval). Re-normalize so execution
      // deterministically owns one active task at a time.
      task.status = 'pending' as AgentTaskStatus;
    }
  }

  private markTaskInProgress(activeTaskId: string, tasks: AgentExecutionMutableTask[]): void {
    for (const task of tasks) {
      if (task.id === activeTaskId) {
        task.status = 'in_progress' as AgentTaskStatus;
        continue;
      }

      if (task.status === ('in_progress' as AgentTaskStatus)) {
        task.status = 'pending' as AgentTaskStatus;
      }
    }
  }
}
