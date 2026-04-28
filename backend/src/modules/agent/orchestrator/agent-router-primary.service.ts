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

import type { AgentIdentifier, AgentTask, AgentToolAccessContext } from '@nxt1/core';
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
import { logger } from '../../../utils/logger.js';

interface PrimaryServiceOptions {
  readonly executionService: AgentRouterExecutionService;
  readonly contextService: AgentRouterContextService;
  readonly policyService: AgentRouterPolicyService;
  readonly planner: PlannerAgent;
  readonly agents: ReadonlyMap<AgentIdentifier, BaseAgent>;
  readonly resolveToolAccessContext: (userId: string) => Promise<AgentToolAccessContext>;
}

export class AgentRouterPrimaryService implements PrimaryDispatcher {
  constructor(private readonly opts: PrimaryServiceOptions) {}

  async runCoordinator(
    coordinatorId: Exclude<AgentIdentifier, 'router'>,
    goal: string,
    ctx: PrimaryDispatchContext
  ): Promise<PrimaryDispatchResult> {
    const task: AgentTask = {
      id: `${coordinatorId}_${Date.now()}`,
      assignedAgent: coordinatorId,
      description: goal,
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
        ...(ctx.onStreamEvent ? { onStreamEvent: ctx.onStreamEvent } : {}),
        ...(ctx.signal ? { signal: ctx.signal } : {}),
        buildTaskIntent: (t, upstream, enriched) =>
          this.opts.contextService.buildTaskIntent(t, upstream, enriched),
        rerouteDelegatedTask: (intent, sourceAgentId, rerouteContext) =>
          this.opts.policyService.rerouteDelegatedTask(intent, sourceAgentId, rerouteContext),
      });

      return formatDispatchResult(coordinatorId, taskResults, mutableTasks);
    } catch (err) {
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
      };
    }
  }

  async runPlan(goal: string, ctx: PrimaryDispatchContext): Promise<PrimaryDispatchResult> {
    try {
      const planResult = await this.opts.planner.execute(
        goal,
        ctx.sessionContext,
        [],
        undefined,
        undefined,
        undefined,
        ctx.onStreamEvent
      );

      const planTasks = (planResult as { plan?: { tasks?: readonly AgentTask[] } })?.plan?.tasks;
      if (!planTasks || planTasks.length === 0) {
        return {
          success: false,
          observation: JSON.stringify({
            success: false,
            error: 'Planner produced no tasks for goal.',
          }),
        };
      }

      const toolAccessContext = await this.opts.resolveToolAccessContext(ctx.userId);
      const { taskResults, mutableTasks } = await this.opts.executionService.executePlan({
        operationId: ctx.operationId,
        userId: ctx.userId,
        plan: { tasks: planTasks },
        enrichedIntent: ctx.enrichedIntent,
        context: ctx.sessionContext,
        toolAccessContext,
        ...(ctx.approvalGate ? { approvalGate: ctx.approvalGate } : {}),
        taskMaxRetries: 1,
        agents: this.opts.agents,
        ...(ctx.onStreamEvent ? { onStreamEvent: ctx.onStreamEvent } : {}),
        ...(ctx.signal ? { signal: ctx.signal } : {}),
        buildTaskIntent: (t, upstream, enriched) =>
          this.opts.contextService.buildTaskIntent(t, upstream, enriched),
        rerouteDelegatedTask: (intent, sourceAgentId, rerouteContext) =>
          this.opts.policyService.rerouteDelegatedTask(intent, sourceAgentId, rerouteContext),
      });

      return formatDispatchResult('plan_and_execute', taskResults, mutableTasks);
    } catch (err) {
      logger.error('[PrimaryService] runPlan failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        observation: JSON.stringify({
          success: false,
          error: `Multi-step plan failed: ${err instanceof Error ? err.message : String(err)}`,
        }),
      };
    }
  }
}

function formatDispatchResult(
  label: string,
  taskResults: ReadonlyMap<string, unknown>,
  mutableTasks: ReadonlyArray<{
    id: string;
    status: string;
    description: string;
    _lastError?: string;
  }>
): PrimaryDispatchResult {
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

  return {
    success: allCompleted,
    observation: lines.join('\n'),
  };
}
