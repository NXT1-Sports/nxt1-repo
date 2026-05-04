/**
 * @fileoverview Agent Router Primary Service — Primary Agent Dispatcher
 * @module @nxt1/backend/modules/agent/orchestrator
 *
 * Implements {@link PrimaryDispatcher} on top of the existing
 * {@link AgentRouterExecutionService} + {@link PlannerAgent} pipeline.
 *
 * The Primary Agent calls back into this service when it needs to:
 *  - Hand a focused sub-task to a specialist coordinator
 *    (`runCoordinator`) — synthesizes a single-task plan and runs it
 *    through the standard execution loop.
 *  - Build and execute a multi-step DAG plan (`runPlan`) — invokes the
 *    PlannerAgent strict-plan path, then executes via the same loop.
 *
 * Result is aggregated into a markdown observation string so the Primary's
 * ReAct loop can ingest it as the next tool result and continue reasoning.
 */

import type {
  AgentIdentifier,
  AgentOperationResult,
  AgentTask,
  AgentTaskStatus,
  AgentToolAccessContext,
} from '@nxt1/core';
import type { BaseAgent } from '../agents/base.agent.js';
import type {
  PrimaryDispatcher,
  PrimaryDispatchContext,
  PrimaryDispatchResult,
} from '../agents/primary-dispatcher.js';
import type { PlannerAgent } from '../agents/planner.agent.js';
import type { AgentRouterExecutionService } from './agent-router-execution.service.js';
import type { AgentRouterContextService } from './agent-router-context.service.js';
import type { AgentRouterPolicyService } from './agent-router-policy.service.js';
import type { AgentRouterPlanningService } from './agent-router-planning.service.js';
import { AgentYieldException, isAgentYield } from '../exceptions/agent-yield.exception.js';
import { AgentPlanRepository, buildPlanTaskSnapshot } from '../queue/agent-plan.repository.js';
import { logger } from '../../../utils/logger.js';

interface PrimaryServiceOptions {
  readonly executionService: AgentRouterExecutionService;
  readonly contextService: AgentRouterContextService;
  readonly policyService: AgentRouterPolicyService;
  readonly planningService: AgentRouterPlanningService;
  readonly planner: PlannerAgent;
  readonly agents: ReadonlyMap<AgentIdentifier, BaseAgent>;
  readonly resolveToolAccessContext: (userId: string) => Promise<AgentToolAccessContext>;
  readonly planRepository: AgentPlanRepository;
}

export class AgentRouterPrimaryService implements PrimaryDispatcher {
  constructor(private readonly opts: PrimaryServiceOptions) {}

  async runCoordinator(
    coordinatorId: Exclude<AgentIdentifier, 'router'>,
    goal: string,
    ctx: PrimaryDispatchContext,
    structuredPayload?: Record<string, unknown>
  ): Promise<PrimaryDispatchResult> {
    let streamedDeltaCount = 0;
    let streamedCharCount = 0;
    const onDispatchStreamEvent =
      ctx.onStreamEvent &&
      ((event: Parameters<NonNullable<typeof ctx.onStreamEvent>>[0]) => {
        if (
          event.type === 'delta' &&
          event.agentId === coordinatorId &&
          typeof event.text === 'string' &&
          event.text.length > 0
        ) {
          streamedDeltaCount += 1;
          streamedCharCount += event.text.length;
        }
        ctx.onStreamEvent?.(event);
      });

    const task: AgentTask = {
      id: `${coordinatorId}_${Date.now()}`,
      assignedAgent: coordinatorId,
      description: goal,
      ...(structuredPayload ? { structuredPayload } : {}),
      dependsOn: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    try {
      const toolAccessContext = await this.opts.resolveToolAccessContext(ctx.userId);
      const { taskResults, mutableTasks } = await this.opts.executionService.executePlan({
        operationId: ctx.operationId,
        userId: ctx.userId,
        plan: { tasks: [task] },
        enrichedIntent: ctx.enrichedIntent,
        context: ctx.sessionContext,
        toolAccessContext,
        ...(ctx.approvalGate ? { approvalGate: ctx.approvalGate } : {}),
        taskMaxRetries: 1,
        agents: this.opts.agents,
        ...(onDispatchStreamEvent ? { onStreamEvent: onDispatchStreamEvent } : {}),
        ...(ctx.signal ? { signal: ctx.signal } : {}),
        buildTaskIntent: (t, upstream, enriched) =>
          this.opts.contextService.buildTaskIntent(t, upstream, enriched),
        rerouteDelegatedTask: (intent, sourceAgentId, rerouteContext, payload) =>
          this.opts.policyService.rerouteDelegatedTask(
            intent,
            sourceAgentId,
            rerouteContext,
            payload
          ),
      });

      return formatDispatchResult({
        label: coordinatorId,
        dispatchKind: 'coordinator',
        taskResults,
        mutableTasks,
        streamedDeltaCount,
        streamedCharCount,
      });
    } catch (err) {
      // Preserve HITL control-flow for delegated coordinators.
      // Without this pass-through, delegated approvals are flattened into a
      // generic tool error and the parent operation loses `yieldState`.
      if (isAgentYield(err)) {
        throw err;
      }
      logger.error('[PrimaryService] runCoordinator failed', {
        coordinatorId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        observation: JSON.stringify({
          success: false,
          error: `Coordinator ${coordinatorId} dispatch failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        }),
        dispatchKind: 'coordinator',
        userAlreadyReceivedResponse: false,
        streamedDeltaCount,
        streamedCharCount,
      };
    }
  }

  async runPlan(goal: string, ctx: PrimaryDispatchContext): Promise<PrimaryDispatchResult> {
    const streamedDeltaCount = 0;
    const streamedCharCount = 0;

    try {
      const toolAccessContext = await this.opts.resolveToolAccessContext(ctx.userId);
      const capabilitySnapshot = await this.opts.planningService
        .buildCapabilitySnapshot(ctx.enrichedIntent, toolAccessContext, this.opts.agents)
        .catch(() => undefined);

      const planResult = await this.opts.planner.execute(
        goal,
        ctx.sessionContext,
        [],
        undefined,
        { capabilitySnapshot },
        undefined,
        ctx.onStreamEvent
      );

      const planTasks = (planResult as { data?: { plan?: { tasks?: readonly AgentTask[] } } })?.data
        ?.plan?.tasks;
      const planSummary = (planResult as { summary?: string }).summary?.trim() || goal;

      if (!planTasks || planTasks.length === 0) {
        return {
          success: false,
          observation: JSON.stringify({
            success: false,
            error: 'Planner produced no tasks for goal.',
          }),
          dispatchKind: 'plan',
          userAlreadyReceivedResponse: false,
          streamedDeltaCount,
          streamedCharCount,
        };
      }

      const planId = `plan_${ctx.operationId}`;
      const planHash = this.opts.planningService.hashExecutionPlan({
        operationId: ctx.operationId,
        tasks: planTasks,
        createdAt: new Date().toISOString(),
      });
      await this.opts.planRepository.createDraft({
        planId,
        userId: ctx.userId,
        threadId: ctx.sessionContext.threadId,
        originOperationId: ctx.operationId,
        summary: planSummary,
        planHash,
        tasks: planTasks,
        environment: ctx.sessionContext.environment,
      });

      this.emitPlanReviewCard(ctx, planSummary, planTasks);

      // Display-only metadata: passed alongside `planId` on the *yield* so the
      // resumed agent can still see the exact saved plan to execute after the
      // user replies in chat. This keeps planning out of the approval-policy
      // flow while preserving deterministic plan execution on explicit user
      // approval.
      const planSteps = planTasks.map((task) => ({
        id: task.id,
        label: task.displayLabel ?? task.description,
        ...(task.description && task.description !== (task.displayLabel ?? '')
          ? { description: task.description }
          : {}),
        ...(task.assignedAgent ? { coordinator: task.assignedAgent } : {}),
      }));
      const planReviewPrompt = this.buildPlanReviewPrompt(planSummary, planSteps);

      throw new AgentYieldException({
        reason: 'needs_input',
        promptToUser: planReviewPrompt,
        agentId: 'router',
        pendingToolCall: {
          toolCallId: `execute_saved_plan:${planId}`,
          toolName: 'execute_saved_plan',
          toolInput: {
            planId,
            __planApproval: {
              goal,
              planId,
              summary: planSummary,
              steps: planSteps,
            },
          },
        },
        messages: [],
      });
    } catch (err) {
      if (isAgentYield(err)) {
        throw err;
      }

      logger.error('[PrimaryService] runPlan failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        observation: JSON.stringify({
          success: false,
          error: `Multi-step plan failed: ${err instanceof Error ? err.message : String(err)}`,
        }),
        dispatchKind: 'plan',
        userAlreadyReceivedResponse: false,
        streamedDeltaCount,
        streamedCharCount,
      };
    }
  }

  async runApprovedPlan(
    planId: string,
    ctx: PrimaryDispatchContext
  ): Promise<PrimaryDispatchResult> {
    let streamedDeltaCount = 0;
    let streamedCharCount = 0;
    const onDispatchStreamEvent =
      ctx.onStreamEvent &&
      ((event: Parameters<NonNullable<typeof ctx.onStreamEvent>>[0]) => {
        if (
          event.type === 'delta' &&
          typeof event.text === 'string' &&
          event.text.length > 0 &&
          event.agentId &&
          event.agentId !== 'router'
        ) {
          streamedDeltaCount += 1;
          streamedCharCount += event.text.length;
        }
        ctx.onStreamEvent?.(event);
      });

    const environment = ctx.sessionContext.environment;
    const savedPlan = await this.opts.planRepository.getById(planId, environment);
    if (!savedPlan) {
      return {
        success: false,
        observation: JSON.stringify({ success: false, error: `Saved plan not found: ${planId}` }),
        dispatchKind: 'saved_plan',
        userAlreadyReceivedResponse: false,
        streamedDeltaCount,
        streamedCharCount,
      };
    }

    if (savedPlan.userId !== ctx.userId) {
      return {
        success: false,
        observation: JSON.stringify({
          success: false,
          error: 'Saved plan ownership mismatch.',
        }),
        dispatchKind: 'saved_plan',
        userAlreadyReceivedResponse: false,
        streamedDeltaCount,
        streamedCharCount,
      };
    }

    try {
      await this.opts.planRepository.markExecuting({
        planId,
        executionOperationId: ctx.operationId,
        environment,
      });

      const toolAccessContext = await this.opts.resolveToolAccessContext(ctx.userId);
      const { taskResults, mutableTasks } = await this.opts.executionService.executePlan({
        operationId: ctx.operationId,
        userId: ctx.userId,
        plan: { tasks: savedPlan.tasks },
        enrichedIntent: ctx.enrichedIntent,
        context: ctx.sessionContext,
        toolAccessContext,
        ...(ctx.approvalGate ? { approvalGate: ctx.approvalGate } : {}),
        taskMaxRetries: 1,
        agents: this.opts.agents,
        ...(onDispatchStreamEvent ? { onStreamEvent: onDispatchStreamEvent } : {}),
        ...(ctx.signal ? { signal: ctx.signal } : {}),
        onPlanStateChange: async (tasks, results) => {
          await this.opts.planRepository.syncExecutionSnapshot({
            planId,
            tasks: this.toPersistedTasks(tasks, results),
            environment,
            executionOperationId: ctx.operationId,
          });
        },
        buildTaskIntent: (t, upstream, enriched) =>
          this.opts.contextService.buildTaskIntent(t, upstream, enriched),
        rerouteDelegatedTask: (intent, sourceAgentId, rerouteContext, payload) =>
          this.opts.policyService.rerouteDelegatedTask(
            intent,
            sourceAgentId,
            rerouteContext,
            payload
          ),
      });

      const persistedTasks = this.toPersistedTasks(mutableTasks, taskResults);
      await this.opts.planRepository.markTerminal({
        planId,
        status: mutableTasks.every(
          (task) => task.status === 'completed' || task.status === 'skipped'
        )
          ? 'completed'
          : 'failed',
        tasks: persistedTasks,
        environment,
        executionOperationId: ctx.operationId,
      });

      return formatDispatchResult({
        label: 'execute_saved_plan',
        dispatchKind: 'saved_plan',
        taskResults,
        mutableTasks,
        streamedDeltaCount,
        streamedCharCount,
      });
    } catch (err) {
      if (isAgentYield(err)) {
        throw err;
      }

      await this.opts.planRepository.markTerminal({
        planId,
        status: 'failed',
        tasks: savedPlan.tasks,
        environment,
        executionOperationId: ctx.operationId,
      });
      logger.error('[PrimaryService] runApprovedPlan failed', {
        planId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        observation: JSON.stringify({
          success: false,
          error: `Saved plan execution failed: ${err instanceof Error ? err.message : String(err)}`,
        }),
        dispatchKind: 'saved_plan',
        userAlreadyReceivedResponse: false,
        streamedDeltaCount,
        streamedCharCount,
      };
    }
  }

  private emitPlanReviewCard(
    ctx: PrimaryDispatchContext,
    summary: string,
    tasks: readonly AgentTask[]
  ): void {
    ctx.onStreamEvent?.({
      type: 'card',
      cardData: {
        agentId: 'router',
        type: 'planner',
        title: 'Review Execution Plan',
        payload: {
          summary,
          items: tasks.map((task) => ({
            id: task.id,
            label: task.displayLabel ?? task.description,
            done: false,
            active: false,
            status: 'pending' satisfies AgentTaskStatus,
          })),
        },
      },
    });
  }

  private buildPlanReviewPrompt(
    summary: string,
    steps: ReadonlyArray<{
      readonly label: string;
      readonly description?: string;
      readonly coordinator?: string;
    }>
  ): string {
    const lines: string[] = [];
    lines.push(`I drafted this plan: ${summary}`);
    lines.push('');

    steps.forEach((step, index) => {
      const coordinator =
        typeof step.coordinator === 'string' && step.coordinator.trim().length > 0
          ? ` (${this.humanizeCoordinator(step.coordinator)})`
          : '';
      lines.push(`${index + 1}. ${step.label}${coordinator}`);
      if (
        typeof step.description === 'string' &&
        step.description.trim().length > 0 &&
        step.description.trim() !== step.label.trim()
      ) {
        lines.push(`   ${step.description.trim()}`);
      }
    });

    lines.push('');
    lines.push('Reply "approve" to run it, or tell me what to change.');
    return lines.join('\n');
  }

  private humanizeCoordinator(coordinator: string): string {
    return coordinator
      .replace(/_coordinator$/i, '')
      .replace(/_agent$/i, '')
      .split(/[_\s-]+/)
      .filter((segment) => segment.length > 0)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      .join(' ');
  }

  private toPersistedTasks(
    tasks: readonly AgentTask[],
    taskResults: ReadonlyMap<string, AgentOperationResult>
  ): AgentTask[] {
    return tasks.map((task) =>
      buildPlanTaskSnapshot({
        task,
        result: taskResults.get(task.id),
        status: task.status,
        statusNote:
          '_lastError' in task && typeof task._lastError === 'string'
            ? task._lastError
            : task.statusNote,
      })
    );
  }
}

function formatDispatchResult(payload: {
  readonly label: string;
  readonly dispatchKind: 'coordinator' | 'plan' | 'saved_plan';
  readonly taskResults: ReadonlyMap<string, unknown>;
  readonly mutableTasks: ReadonlyArray<{
    id: string;
    status: string;
    description: string;
    _lastError?: string;
  }>;
  readonly streamedDeltaCount: number;
  readonly streamedCharCount: number;
}): PrimaryDispatchResult {
  const { label, dispatchKind, taskResults, mutableTasks, streamedDeltaCount, streamedCharCount } =
    payload;
  const allCompleted = mutableTasks.every((t) => t.status === 'completed');
  const lines: string[] = [`## ${label} dispatch result`];

  for (const task of mutableTasks) {
    const result = taskResults.get(task.id) as { summary?: string; result?: unknown } | undefined;
    const summary =
      typeof result === 'object' && result !== null && 'summary' in result
        ? String((result as { summary: unknown }).summary ?? '').slice(0, 1_500)
        : '';
    if (task.status === 'completed') {
      lines.push(`- ✅ \`${task.id}\`: ${task.description}`);
      if (summary) lines.push(`  ${summary}`);
    } else {
      lines.push(`- ❌ \`${task.id}\` (${task.status}): ${task.description}`);
      if (task._lastError) lines.push(`  Error: ${task._lastError}`);
    }
  }

  // ── Tier 4: Collect coordinator artifacts from all completed task results ──
  // Merges artifacts across tasks so Primary can chain downstream tool calls
  // (e.g. use a video URL produced by performance_coordinator in a follow-up).
  const coordinatorArtifacts: Record<string, unknown> = {};
  for (const [, rawResult] of taskResults) {
    const r = rawResult as { artifacts?: Record<string, unknown> } | undefined;
    if (r?.artifacts && typeof r.artifacts === 'object') {
      Object.assign(coordinatorArtifacts, r.artifacts);
    }
  }

  return {
    success: allCompleted,
    observation: lines.join('\n'),
    dispatchKind,
    userAlreadyReceivedResponse: streamedDeltaCount > 0,
    streamedDeltaCount,
    streamedCharCount,
    ...(Object.keys(coordinatorArtifacts).length > 0 ? { coordinatorArtifacts } : {}),
  };
}
