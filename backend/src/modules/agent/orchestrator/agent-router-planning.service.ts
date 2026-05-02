import { createHash } from 'node:crypto';
import type {
  AgentExecutionPlan,
  AgentIdentifier,
  AgentTask,
  AgentToolAccessContext,
  AgentToolEntityGroup,
} from '@nxt1/core';
import { COORDINATOR_AGENT_IDS } from '@nxt1/core';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { BaseAgent } from '../agents/base.agent.js';
import type { SkillRegistry } from '../skills/skill-registry.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { getEffectiveAgentToolPolicy, isToolAllowedByPatterns } from '../agents/tool-policy.js';

interface AgentPlannerCapabilityCoordinatorSnapshot {
  readonly agentId: Exclude<AgentIdentifier, 'router'>;
  readonly allowedToolNames: readonly string[];
  readonly allowedEntityGroups: readonly AgentToolEntityGroup[];
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

export interface AgentPlannerCapabilitySnapshot {
  readonly schemaVersion: number;
  readonly hash: string;
  readonly coordinators: readonly AgentPlannerCapabilityCoordinatorSnapshot[];
}

export interface AgentPlanPreflightIssue {
  readonly taskId: string;
  readonly code:
    | 'missing_task_id'
    | 'plan_task_limit_exceeded'
    | 'non_routable_agent'
    | 'agent_not_registered'
    | 'capability_mismatch'
    | 'missing_task_description'
    | 'task_dependency_limit_exceeded'
    | 'duplicate_dependency'
    | 'unknown_dependency'
    | 'duplicate_task_id'
    | 'self_dependency'
    | 'circular_dependency';
  readonly message: string;
}

export interface AgentPlanPreflightResult {
  readonly feasible: boolean;
  readonly issues: readonly AgentPlanPreflightIssue[];
}

const CAPABILITY_SNAPSHOT_SCHEMA_VERSION = 1;
const PLAN_PREFLIGHT_LIMITS = {
  maxTasks: 24,
  maxDependenciesPerTask: 8,
} as const;

const routableCoordinatorSet = new Set<string>(COORDINATOR_AGENT_IDS);

function isRoutableCoordinatorAgent(
  agentId: string
): agentId is Exclude<AgentIdentifier, 'router'> {
  return routableCoordinatorSet.has(agentId);
}

export class AgentRouterPlanningService {
  constructor(
    private readonly llm: OpenRouterService,
    private readonly toolRegistry: ToolRegistry,
    private readonly skillRegistry?: SkillRegistry
  ) {}

  async buildCapabilitySnapshot(
    intent: string,
    toolAccessContext: AgentToolAccessContext,
    agents: ReadonlyMap<AgentIdentifier, BaseAgent>
  ): Promise<AgentPlannerCapabilitySnapshot> {
    let intentEmbedding: readonly number[] | null = null;
    try {
      intentEmbedding = await this.llm.embed(intent);
    } catch {
      intentEmbedding = null;
    }

    const coordinators = await Promise.all(
      COORDINATOR_AGENT_IDS.map(async (agentId) => {
        const registryAllowedTools = this.toolRegistry.getDefinitions(agentId, toolAccessContext);
        const policyAllowedToolNames = getEffectiveAgentToolPolicy(agentId);
        const allowedTools = registryAllowedTools.filter(
          (tool) =>
            tool.category === 'system' || isToolAllowedByPatterns(tool.name, policyAllowedToolNames)
        );
        const allowedToolNames = allowedTools.map((tool) => tool.name).sort();
        const allowedEntityGroups = Array.from(
          new Set(
            allowedTools
              .map((tool) => tool.entityGroup)
              .filter((entityGroup): entityGroup is AgentToolEntityGroup => Boolean(entityGroup))
          )
        ).sort();

        let matchedToolNames: readonly string[] = [];
        if (intentEmbedding && typeof this.toolRegistry.match === 'function') {
          try {
            const matchedTools = await this.toolRegistry.match(
              intentEmbedding,
              (text) => this.llm.embed(text),
              agentId,
              toolAccessContext
            );
            matchedToolNames = matchedTools.map((tool) => tool.name).sort();
          } catch {
            matchedToolNames = [];
          }
        }

        const agent = agents.get(agentId);
        const staticSkillHints =
          typeof agent?.getSkills === 'function' ? [...agent.getSkills()].sort() : [];

        let matchedSkillHints: readonly string[] = [];
        if (
          intentEmbedding &&
          staticSkillHints.length > 0 &&
          this.skillRegistry &&
          typeof this.skillRegistry.match === 'function'
        ) {
          try {
            const matchedSkills = await this.skillRegistry.match(
              intentEmbedding,
              (text) => this.llm.embed(text),
              staticSkillHints
            );
            matchedSkillHints = matchedSkills.map((entry) => entry.skill.name).sort();
          } catch {
            matchedSkillHints = [];
          }
        }

        const matchedToolCount = matchedToolNames.length;
        const allowedToolCount = allowedToolNames.length;
        const matchedSkillCount = matchedSkillHints.length;
        const staticSkillCount = staticSkillHints.length;

        return {
          agentId,
          allowedToolNames,
          allowedEntityGroups,
          matchedToolNames,
          staticSkillHints,
          matchedSkillHints,
          confidence: {
            matchedToolCount,
            allowedToolCount,
            toolCoverageRatio:
              allowedToolCount > 0 ? Number((matchedToolCount / allowedToolCount).toFixed(3)) : 0,
            matchedSkillCount,
            staticSkillCount,
            skillCoverageRatio:
              staticSkillCount > 0 ? Number((matchedSkillCount / staticSkillCount).toFixed(3)) : 0,
          },
        } as const;
      })
    );

    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          schemaVersion: CAPABILITY_SNAPSHOT_SCHEMA_VERSION,
          coordinators,
        })
      )
      .digest('hex');

    return {
      schemaVersion: CAPABILITY_SNAPSHOT_SCHEMA_VERSION,
      hash,
      coordinators,
    };
  }

  preflightPlan(
    plan: AgentExecutionPlan,
    agents: ReadonlyMap<AgentIdentifier, BaseAgent>,
    capabilitySnapshot?: AgentPlannerCapabilitySnapshot
  ): AgentPlanPreflightResult {
    const issues: AgentPlanPreflightIssue[] = [];

    if (plan.tasks.length > PLAN_PREFLIGHT_LIMITS.maxTasks) {
      issues.push({
        taskId: '__plan__',
        code: 'plan_task_limit_exceeded',
        message:
          `Execution plan contains ${plan.tasks.length} tasks, exceeding the maximum of ` +
          `${PLAN_PREFLIGHT_LIMITS.maxTasks}.`,
      });
    }

    const taskIds = new Set(plan.tasks.map((task) => task.id));
    const seenTaskIds = new Set<string>();
    const coordinatorSnapshotById = new Map(
      (capabilitySnapshot?.coordinators ?? []).map((coordinator) => [
        coordinator.agentId,
        coordinator,
      ])
    );
    const matchedCoordinatorIds = (capabilitySnapshot?.coordinators ?? [])
      .filter(
        (coordinator) =>
          coordinator.matchedToolNames.length > 0 || coordinator.matchedSkillHints.length > 0
      )
      .map((coordinator) => coordinator.agentId);
    const hasMatchedCapabilitySignals = matchedCoordinatorIds.length > 0;

    for (const task of plan.tasks) {
      if (!task.id.trim()) {
        issues.push({
          taskId: task.id,
          code: 'missing_task_id',
          message: 'Execution plan contains a task with an empty id.',
        });
      }

      if (seenTaskIds.has(task.id)) {
        issues.push({
          taskId: task.id,
          code: 'duplicate_task_id',
          message: `Duplicate task id "${task.id}" detected in execution plan.`,
        });
      } else {
        seenTaskIds.add(task.id);
      }
    }

    for (const task of plan.tasks) {
      if (!isRoutableCoordinatorAgent(task.assignedAgent)) {
        issues.push({
          taskId: task.id,
          code: 'non_routable_agent',
          message:
            `Task ${task.id} assigned non-routable agent "${task.assignedAgent}". ` +
            `Allowed coordinators: ${COORDINATOR_AGENT_IDS.join(', ')}.`,
        });
        continue;
      }

      if (!agents.has(task.assignedAgent)) {
        issues.push({
          taskId: task.id,
          code: 'agent_not_registered',
          message: `Task ${task.id} assigned to "${task.assignedAgent}" but no agent is registered.`,
        });
      }

      if (hasMatchedCapabilitySignals) {
        const assignedSnapshot = coordinatorSnapshotById.get(task.assignedAgent);
        const assignedHasMatches =
          (assignedSnapshot?.matchedToolNames.length ?? 0) > 0 ||
          (assignedSnapshot?.matchedSkillHints.length ?? 0) > 0;

        if (assignedSnapshot && !assignedHasMatches) {
          issues.push({
            taskId: task.id,
            code: 'capability_mismatch',
            message:
              `Task ${task.id} assigned to "${task.assignedAgent}" which has no matched tools/skills for this request. ` +
              `Matched coordinators: ${matchedCoordinatorIds.join(', ')}.`,
          });
        }
      }

      if (!task.description.trim()) {
        issues.push({
          taskId: task.id,
          code: 'missing_task_description',
          message: `Task ${task.id} has an empty description.`,
        });
      }

      if (task.dependsOn.length > PLAN_PREFLIGHT_LIMITS.maxDependenciesPerTask) {
        issues.push({
          taskId: task.id,
          code: 'task_dependency_limit_exceeded',
          message:
            `Task ${task.id} declares ${task.dependsOn.length} dependencies, exceeding the maximum of ` +
            `${PLAN_PREFLIGHT_LIMITS.maxDependenciesPerTask}.`,
        });
      }

      const seenDependencyIds = new Set<string>();

      for (const depId of task.dependsOn) {
        if (seenDependencyIds.has(depId)) {
          issues.push({
            taskId: task.id,
            code: 'duplicate_dependency',
            message: `Task ${task.id} repeats dependency "${depId}" more than once.`,
          });
          continue;
        }
        seenDependencyIds.add(depId);

        if (depId === task.id) {
          issues.push({
            taskId: task.id,
            code: 'self_dependency',
            message: `Task ${task.id} cannot depend on itself.`,
          });
          continue;
        }

        if (!taskIds.has(depId)) {
          issues.push({
            taskId: task.id,
            code: 'unknown_dependency',
            message: `Task ${task.id} depends on unknown task "${depId}".`,
          });
        }
      }
    }

    const cyclePath = this.findDependencyCycle(plan.tasks);
    if (cyclePath && cyclePath.length > 1) {
      issues.push({
        taskId: cyclePath[0] ?? 'unknown',
        code: 'circular_dependency',
        message: `Circular dependency detected: ${cyclePath.join(' -> ')}.`,
      });
    }

    return {
      feasible: issues.length === 0,
      issues,
    };
  }

  buildConstrainedReplanIntent(
    enrichedIntent: string,
    plan: AgentExecutionPlan,
    issues: readonly AgentPlanPreflightIssue[]
  ): string {
    const issueList = issues
      .map(
        (issue, index) => `${index + 1}. [${issue.code}] task=${issue.taskId} :: ${issue.message}`
      )
      .join('\n');

    return [
      enrichedIntent,
      '',
      '[Planner Guardrail Feedback]',
      'Your previous plan was infeasible. Generate a corrected plan that satisfies all constraints.',
      'Do not use non-coordinator agents. Do not reference missing dependencies. Keep tasks executable.',
      `Previous plan: ${JSON.stringify(plan)}`,
      'Preflight issues:',
      issueList,
    ].join('\n');
  }

  hashExecutionPlan(plan: AgentExecutionPlan): string {
    return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  }

  summarizePreflightIssueCounts(
    issues: readonly AgentPlanPreflightIssue[]
  ): Record<string, number> {
    return issues.reduce<Record<string, number>>((counts, issue) => {
      counts[issue.code] = (counts[issue.code] ?? 0) + 1;
      return counts;
    }, {});
  }

  summarizePreflightIssueDelta(
    before: readonly AgentPlanPreflightIssue[],
    after: readonly AgentPlanPreflightIssue[]
  ): {
    readonly beforeCount: number;
    readonly afterCount: number;
    readonly resolved: readonly string[];
    readonly introduced: readonly string[];
    readonly persisted: readonly string[];
  } {
    const beforeSet = new Set(before.map((issue) => `${issue.taskId}:${issue.code}`));
    const afterSet = new Set(after.map((issue) => `${issue.taskId}:${issue.code}`));

    const resolved = [...beforeSet].filter((signature) => !afterSet.has(signature)).sort();
    const introduced = [...afterSet].filter((signature) => !beforeSet.has(signature)).sort();
    const persisted = [...afterSet].filter((signature) => beforeSet.has(signature)).sort();

    return {
      beforeCount: before.length,
      afterCount: after.length,
      resolved,
      introduced,
      persisted,
    };
  }

  private findDependencyCycle(tasks: readonly AgentTask[]): string[] | null {
    const taskIds = new Set(tasks.map((task) => task.id));
    const adjacency = new Map<string, readonly string[]>();

    for (const task of tasks) {
      if (!adjacency.has(task.id)) {
        adjacency.set(task.id, task.dependsOn);
      }
    }

    const visited = new Set<string>();
    const visiting = new Set<string>();
    const pathStack: string[] = [];

    const dfs = (taskId: string): string[] | null => {
      if (visiting.has(taskId)) {
        const startIndex = pathStack.indexOf(taskId);
        if (startIndex >= 0) {
          return [...pathStack.slice(startIndex), taskId];
        }
        return [taskId, taskId];
      }

      if (visited.has(taskId)) {
        return null;
      }

      visiting.add(taskId);
      pathStack.push(taskId);

      const deps = adjacency.get(taskId) ?? [];
      for (const depId of deps) {
        if (!taskIds.has(depId)) {
          continue;
        }
        const cycle = dfs(depId);
        if (cycle) {
          return cycle;
        }
      }

      pathStack.pop();
      visiting.delete(taskId);
      visited.add(taskId);
      return null;
    };

    for (const task of tasks) {
      const cycle = dfs(task.id);
      if (cycle) {
        return cycle;
      }
    }

    return null;
  }
}
