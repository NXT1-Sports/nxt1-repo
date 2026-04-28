import type {
  AgentIdentifier,
  AgentJobUpdate,
  AgentOperationResult,
  AgentSessionContext,
  AgentTask,
  AgentTaskStatus,
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
import { parallelBatch } from '../utils/parallel-batch.js';
import { logger } from '../../../utils/logger.js';
import type { AgentRouterTelemetryService } from './agent-router-telemetry.service.js';

export type AgentExecutionMutableTask = Omit<
  AgentTask,
  'status' | 'assignedAgent' | 'description'
> & {
  status: AgentTaskStatus;
  assignedAgent: Exclude<AgentIdentifier, 'router'>;
  description: string;
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

function isRoutableCoordinatorAgent(
  agentId: string
): agentId is Exclude<AgentIdentifier, 'router'> {
  return routableCoordinatorSet.has(agentId);
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
    readonly signal?: AbortSignal;
    readonly buildTaskIntent: (
      task: AgentTask,
      upstreamResults: Map<string, AgentOperationResult>,
      enrichedContext?: string
    ) => string;
    readonly rerouteDelegatedTask: (
      forwardingIntent: string,
      sourceAgentId: Exclude<AgentIdentifier, 'router'>,
      context: AgentSessionContext
    ) => Promise<{
      readonly assignedAgent: Exclude<AgentIdentifier, 'router'>;
      readonly description: string;
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
      signal,
      buildTaskIntent,
      rerouteDelegatedTask,
    } = payload;

    const executionPhaseStartMs = Date.now();
    this.telemetry.emitProgressOperation(onStreamEvent, {
      operationId,
      stage: 'agent_thinking',
      message: `Executing ${plan.tasks.length} planned task(s)...`,
      metadata: { eventType: 'progress_stage', phase: 'execution', phaseIndex: 3, phaseTotal: 5 },
    });

    const taskResults = new Map<string, AgentOperationResult>();
    const mutableTasks = plan.tasks.map((task) => ({
      ...task,
      _lastError: undefined as string | undefined,
    })) as AgentExecutionMutableTask[];

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
            task.status = 'failed' as AgentTaskStatus;
            task._lastError =
              'Execution plan stalled because remaining tasks had unmet dependencies.';
          }
        }
        break;
      }

      for (const task of ready) {
        task.status = 'in_progress' as AgentTaskStatus;
        this.telemetry.emitUpdate(
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
              const matchedToolDefs = await this.toolRegistry.match(
                intentEmbedding,
                (text) => this.llm.embed(text),
                agent.id,
                toolAccessContext
              );

              const matchedNonSystemToolCount = matchedToolDefs.filter(
                (tool) => tool.category !== 'system'
              ).length;

              if (matchedToolDefs.length > 0 && matchedNonSystemToolCount > 0) {
                toolDefs = matchedToolDefs;
              } else {
                logger.warn(
                  '[AgentRouter] Semantic tool narrowing was too sparse — using full allowed tool set',
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
            return;
          } catch (err) {
            if (this.isAbortError(err)) throw err;

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
                context
              );

              if (reroute) {
                task.assignedAgent = reroute.assignedAgent;
                task.description = reroute.description;
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
            }
          }
        }
      };

      const frontierResults = await parallelBatch(ready, runTask, { concurrency: 5 });

      this.throwIfAborted(signal);

      for (const frontierResult of frontierResults) {
        if (frontierResult.status === 'rejected' && this.isAbortError(frontierResult.reason)) {
          throw frontierResult.reason;
        }
        if (frontierResult.status === 'rejected' && isAgentYield(frontierResult.reason)) {
          throw frontierResult.reason;
        }
      }
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
      message: 'Execution stage complete. Preparing final response...',
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
          task.status = 'failed' as AgentTaskStatus;
          task._lastError = `Blocked by failed dependency: ${current}`;
          queue.push(task.id);
        }
      }
    }
  }

  private emitPlannerCard(
    onStreamEvent: OnStreamEvent | undefined,
    mutableTasks: readonly AgentExecutionMutableTask[]
  ): void {
    if (!onStreamEvent) return;

    onStreamEvent({
      type: 'card',
      cardData: {
        agentId: 'router',
        type: 'planner',
        title: 'Execution Plan',
        payload: {
          items: mutableTasks.map((task) => ({
            id: task.id,
            label: task.description,
            done: task.status === ('completed' as AgentTaskStatus),
          })),
        },
      },
    });
  }
}
