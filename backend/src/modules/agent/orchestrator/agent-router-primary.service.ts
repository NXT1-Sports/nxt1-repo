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
  AgentJobUpdate,
  AgentOperationResult,
  AgentTask,
  AgentTaskStatus,
  AgentToolAccessContext,
  AgentUserContext,
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
import { isAgentYield } from '../exceptions/agent-yield.exception.js';
import { AgentPlanRepository, buildPlanTaskSnapshot } from '../queue/agent-plan.repository.js';
import type { StreamEvent } from '../queue/event-writer.js';
import { logger } from '../../../utils/logger.js';

interface PrimaryServiceOptions {
  readonly executionService: AgentRouterExecutionService;
  readonly contextService: AgentRouterContextService;
  readonly policyService: AgentRouterPolicyService;
  readonly planningService: AgentRouterPlanningService;
  readonly planner: PlannerAgent;
  readonly agents: ReadonlyMap<AgentIdentifier, BaseAgent>;
  readonly resolveToolAccessContext: (userId: string) => Promise<AgentToolAccessContext>;
  readonly resolveUserContext?: (userId: string) => Promise<AgentUserContext>;
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
    const taskId = `${coordinatorId}_${Date.now()}`;
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

    this.emitCoordinatorProgress(ctx, {
      coordinatorId,
      taskId,
      message: `${formatCoordinatorLabel(coordinatorId)} is starting...`,
      status: 'running',
      phaseStatus: 'started',
    });

    const onDispatchUpdate = ctx.onStreamEvent
      ? (update: AgentJobUpdate) => {
          this.emitCoordinatorUpdate(ctx, coordinatorId, update);
        }
      : undefined;

    const enrichedStructuredPayload = await this.enrichCoordinatorStructuredPayload(
      ctx.userId,
      structuredPayload
    );

    const task: AgentTask = {
      id: taskId,
      assignedAgent: coordinatorId,
      description: goal,
      ...(enrichedStructuredPayload ? { structuredPayload: enrichedStructuredPayload } : {}),
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
        ...(onDispatchUpdate ? { onUpdate: onDispatchUpdate } : {}),
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

  private emitCoordinatorUpdate(
    ctx: PrimaryDispatchContext,
    fallbackCoordinatorId: Exclude<AgentIdentifier, 'router'>,
    update: AgentJobUpdate
  ): void {
    const payload = update.step.payload ?? {};
    const taskId = typeof payload['taskId'] === 'string' ? payload['taskId'] : undefined;
    const originalEventType =
      typeof payload['eventType'] === 'string' ? payload['eventType'] : 'task_update';
    const coordinatorId =
      update.agentId && update.agentId !== 'router' ? update.agentId : fallbackCoordinatorId;

    this.emitCoordinatorProgress(ctx, {
      coordinatorId,
      taskId,
      message: update.step.message,
      status: this.toStreamStatus(update.status),
      stageType: update.stageType,
      stage: update.stage,
      phaseStatus: update.status,
      originalEventType,
      metadata: update.metadata,
    });
  }

  private emitCoordinatorProgress(
    ctx: PrimaryDispatchContext,
    payload: {
      readonly coordinatorId: AgentIdentifier;
      readonly taskId?: string;
      readonly message: string;
      readonly status: NonNullable<StreamEvent['status']>;
      readonly stageType?: StreamEvent['stageType'];
      readonly stage?: StreamEvent['stage'];
      readonly phaseStatus: string;
      readonly originalEventType?: string;
      readonly metadata?: Record<string, unknown>;
    }
  ): void {
    if (!ctx.onStreamEvent) return;

    const timestamp = new Date().toISOString();
    const metadata = {
      ...(payload.metadata ?? {}),
      eventType: 'progress_subphase',
      phase: 'coordinator_dispatch',
      status: payload.phaseStatus,
      coordinatorId: payload.coordinatorId,
      ...(payload.taskId ? { taskId: payload.taskId } : {}),
      ...(payload.originalEventType ? { originalEventType: payload.originalEventType } : {}),
    };

    ctx.onStreamEvent({
      type: 'operation',
      operationId: ctx.operationId,
      status: payload.status,
      agentId: payload.coordinatorId,
      stageType: payload.stageType ?? 'router',
      stage: payload.stage ?? 'routing_to_agent',
      message: payload.message,
      metadata,
      timestamp,
    });
    ctx.onStreamEvent({
      type: 'progress_subphase',
      operationId: ctx.operationId,
      status: payload.status,
      agentId: payload.coordinatorId,
      stageType: payload.stageType ?? 'router',
      stage: payload.stage ?? 'routing_to_agent',
      message: payload.message,
      metadata,
      timestamp,
    });
  }

  private toStreamStatus(status: AgentJobUpdate['status']): NonNullable<StreamEvent['status']> {
    switch (status) {
      case 'queued':
        return 'queued';
      case 'paused':
        return 'paused';
      case 'awaiting_approval':
        return 'awaiting_approval';
      case 'awaiting_input':
        return 'awaiting_input';
      case 'completed':
        return 'complete';
      case 'failed':
        return 'failed';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'running';
    }
  }

  async runPlan(goal: string, ctx: PrimaryDispatchContext): Promise<PrimaryDispatchResult> {
    const streamedDeltaCount = 0;
    const streamedCharCount = 0;

    try {
      const existingDraft =
        typeof ctx.sessionContext.threadId === 'string' && ctx.sessionContext.threadId.length > 0
          ? await this.opts.planRepository.getLatestRevisableByThread(
              ctx.userId,
              ctx.sessionContext.threadId,
              ctx.sessionContext.environment
            )
          : null;

      const toolAccessContext = await this.opts.resolveToolAccessContext(ctx.userId);
      const capabilitySnapshot = await this.opts.planningService
        .buildCapabilitySnapshot(ctx.enrichedIntent, toolAccessContext, this.opts.agents)
        .catch(() => undefined);

      const plannerGoal = existingDraft
        ? this.opts.planningService.buildRevisionIntent(goal, existingDraft)
        : goal;

      const planResult = await this.opts.planner.execute(
        plannerGoal,
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

      const planId = existingDraft?.planId ?? `plan_${ctx.operationId}`;
      const planHash = this.opts.planningService.hashExecutionPlan({
        operationId: ctx.operationId,
        tasks: planTasks,
        createdAt: new Date().toISOString(),
      });

      const savedPlan = existingDraft
        ? await this.opts.planRepository.reviseDraft({
            existingPlan: existingDraft,
            originOperationId: ctx.operationId,
            summary: planSummary,
            planHash,
            tasks: planTasks,
            environment: ctx.sessionContext.environment,
          })
        : await this.opts.planRepository.createDraft({
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

      const planSteps = planTasks.map((task) => ({
        id: task.id,
        label: task.displayLabel ?? task.description,
        ...(task.description && task.description !== (task.displayLabel ?? '')
          ? { description: task.description }
          : {}),
        ...(task.assignedAgent ? { coordinator: task.assignedAgent } : {}),
      }));

      return {
        success: true,
        observation: JSON.stringify({
          success: true,
          plan_created: existingDraft === null,
          plan_revised: existingDraft !== null,
          goal,
          plan_id: planId,
          plan_version: savedPlan.version,
          summary: planSummary,
          steps: planSteps,
          approval: {
            tool_name: 'execute_saved_plan',
            payload: { planId },
            instruction:
              'Explain the plan in your own words. Wait for explicit user approval before execution.',
          },
        }),
        dispatchKind: 'plan',
        userAlreadyReceivedResponse: false,
        streamedDeltaCount,
        streamedCharCount,
      };
    } catch (err) {
      // Plan creation is intentionally non-yielding. If a nested yield leaks
      // through, normalize to a regular error so Primary can recover with a
      // conversational follow-up instead of entering resume mode.
      if (isAgentYield(err)) {
        logger.warn('[PrimaryService] runPlan received unexpected yield; converting to failure', {
          reason: err.payload.reason,
          pendingTool: err.payload.pendingToolCall?.toolName,
        });
        return {
          success: false,
          observation: JSON.stringify({
            success: false,
            error:
              'Plan drafting paused unexpectedly. Please restate the plan request in one sentence.',
          }),
          dispatchKind: 'plan',
          userAlreadyReceivedResponse: false,
          streamedDeltaCount,
          streamedCharCount,
        };
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

  private async enrichCoordinatorStructuredPayload(
    userId: string,
    structuredPayload?: Record<string, unknown>
  ): Promise<Record<string, unknown> | undefined> {
    const explicitTeamId = readString(structuredPayload?.['teamId']);
    const explicitTeamCode = readString(structuredPayload?.['teamCode']);
    const explicitOrganizationId = readString(structuredPayload?.['organizationId']);

    if (!this.opts.resolveUserContext) {
      return structuredPayload;
    }

    let userContext: AgentUserContext;
    try {
      userContext = await this.opts.resolveUserContext(userId);
    } catch (err) {
      logger.warn('[PrimaryService] Failed to resolve user context for coordinator handoff', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return structuredPayload;
    }

    const contextTeamId = readString(userContext.teamId);
    const contextOrganizationId = readString(userContext.organizationId);
    const normalizedRole = userContext.role.trim().toLowerCase();
    const shouldAttachTeamContext =
      Boolean(explicitTeamId || explicitTeamCode || explicitOrganizationId) ||
      Boolean(contextTeamId || contextOrganizationId) ||
      normalizedRole === 'coach' ||
      normalizedRole === 'director';

    if (!shouldAttachTeamContext) {
      return structuredPayload;
    }

    const fallbackTeamId = explicitTeamId ?? contextTeamId;
    const fallbackTeamCode = explicitTeamCode ?? resolveActiveTeamCode(userContext);
    const fallbackOrganizationId = explicitOrganizationId ?? contextOrganizationId;

    if (!fallbackTeamId && !fallbackTeamCode && !fallbackOrganizationId) {
      return structuredPayload;
    }

    return {
      ...(structuredPayload ?? {}),
      ...(explicitTeamId ? {} : fallbackTeamId ? { teamId: fallbackTeamId } : {}),
      ...(explicitTeamCode ? {} : fallbackTeamCode ? { teamCode: fallbackTeamCode } : {}),
      ...(explicitOrganizationId
        ? {}
        : fallbackOrganizationId
          ? { organizationId: fallbackOrganizationId }
          : {}),
    };
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
  const hasUserFacingResult = mutableTasks.some((task) => {
    const rawResult = taskResults.get(task.id);
    if (!rawResult || typeof rawResult !== 'object') return false;

    const result = rawResult as {
      summary?: unknown;
      data?: Record<string, unknown>;
    };

    if (typeof result.summary === 'string' && isUserFacingDispatchSummary(result.summary)) {
      return true;
    }

    const response = result.data?.['response'];
    return typeof response === 'string' && isUserFacingDispatchSummary(response);
  });
  const lines: string[] = [`## ${label} dispatch result`];

  for (const task of mutableTasks) {
    const result = taskResults.get(task.id) as { summary?: string; result?: unknown } | undefined;
    const summary =
      typeof result === 'object' && result !== null && 'summary' in result
        ? String((result as { summary: unknown }).summary ?? '').slice(0, 4_000)
        : '';
    if (task.status === 'completed') {
      lines.push(`- ✅ \`${task.id}\`: ${task.description}`);
      if (summary && isUserFacingDispatchSummary(summary)) lines.push(`  ${summary}`);
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
    // Only short-circuit Primary's follow-up turn when a coordinator both
    // streamed content and produced a concrete user-facing final result.
    userAlreadyReceivedResponse: streamedDeltaCount > 0 && hasUserFacingResult,
    streamedDeltaCount,
    streamedCharCount,
    ...(Object.keys(coordinatorArtifacts).length > 0 ? { coordinatorArtifacts } : {}),
  };
}

function isUserFacingDispatchSummary(value: string): boolean {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length < 32) return false;

  if (/^completed\b/i.test(normalized)) return false;
  if (/^task completed\.?$/i.test(normalized)) return false;
  if (/^returned\s+\d+\s+field\(s\)\.?$/i.test(normalized)) return false;
  if (/dispatch result/i.test(normalized)) return false;
  if (/^[a-z_]+_\d+\s*:/i.test(normalized)) return false;

  return true;
}

function formatCoordinatorLabel(coordinatorId: AgentIdentifier): string {
  return coordinatorId
    .split('_')
    .map((part) => (part.length > 0 ? `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}` : part))
    .join(' ');
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveActiveTeamCode(userContext: AgentUserContext): string | undefined {
  if (readString(userContext.teamCode)) {
    return userContext.teamCode;
  }

  if (userContext.teamPath && Array.isArray(userContext.teamPaths)) {
    const pathMatch = userContext.teamPaths.find((entry) => entry.path === userContext.teamPath);
    if (pathMatch?.teamCode) {
      return pathMatch.teamCode;
    }
  }

  return userContext.teamPaths?.[0]?.teamCode;
}
