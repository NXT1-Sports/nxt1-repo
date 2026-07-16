import type { AgentExecutionPlan, AgentIdentifier, AgentSessionContext } from '@nxt1/core';
import { COORDINATOR_AGENT_IDS } from '@nxt1/core';
import type { PlannerAgent } from '../agents/planner.agent.js';
import { inferDeterministicDelegationTarget } from './agent-routing-rules.js';
import { buildWorkflowRecoveryIntent, inferWorkflowOwnership } from './agent-workflow-ownership.js';

export type TaskDelegationRerouteResult = {
  readonly assignedAgent: Exclude<AgentIdentifier, 'router'>;
  readonly description: string;
  readonly structuredPayload?: Record<string, unknown>;
  readonly statusNote?: string;
};

const routableCoordinatorSet = new Set<string>(COORDINATOR_AGENT_IDS);
const PRIOR_WORK_MARKER = /\n\n(?=\[(?:Prior Work|Prior Artifacts) from )/;

export class AgentRoutingOrchestratorService {
  constructor(private readonly planner: PlannerAgent) {}

  isRoutableCoordinatorAgent(agentId: string): agentId is Exclude<AgentIdentifier, 'router'> {
    return routableCoordinatorSet.has(agentId);
  }

  async rerouteDelegatedTask(
    forwardingIntent: string,
    sourceAgentId: Exclude<AgentIdentifier, 'router'>,
    context: AgentSessionContext,
    structuredPayload?: Record<string, unknown>
  ): Promise<TaskDelegationRerouteResult | null> {
    const delegatedIntent = splitDelegatedIntent(forwardingIntent);
    const handoffPayload = mergeDelegationPayload(
      structuredPayload,
      sourceAgentId,
      delegatedIntent.priorWork
    );

    const deterministicReroute = this.resolveDeterministicDelegation(
      delegatedIntent.description,
      sourceAgentId,
      handoffPayload
    );
    if (deterministicReroute) {
      return deterministicReroute;
    }

    const routingHint =
      `\n\n[System: The "${sourceAgentId}" agent could not handle this task. ` +
      'Route to a different specialist and do not assign it back to the same agent.]';

    const rerouteResult = await this.planner.execute(
      `${delegatedIntent.description}${routingHint}`,
      context,
      []
    );
    const reroutedPlan = rerouteResult.data?.['plan'] as AgentExecutionPlan | undefined;

    if (!reroutedPlan || reroutedPlan.tasks.length !== 1) {
      return null;
    }

    const reroutedTask = reroutedPlan.tasks[0];
    if (
      !this.isRoutableCoordinatorAgent(reroutedTask.assignedAgent) ||
      reroutedTask.assignedAgent === sourceAgentId
    ) {
      return null;
    }

    return {
      assignedAgent: reroutedTask.assignedAgent,
      description: reroutedTask.description,
      ...(handoffPayload ? { structuredPayload: handoffPayload } : {}),
      statusNote: `Reassigned from ${sourceAgentId} to ${reroutedTask.assignedAgent}.`,
    };
  }

  private resolveDeterministicDelegation(
    forwardingIntent: string,
    sourceAgentId: Exclude<AgentIdentifier, 'router'>,
    structuredPayload?: Record<string, unknown>
  ): TaskDelegationRerouteResult | null {
    const workflowDecision = inferWorkflowOwnership(forwardingIntent, structuredPayload);
    if (workflowDecision) {
      const description = buildWorkflowRecoveryIntent(forwardingIntent, workflowDecision);
      const workflowPayload = {
        ...(structuredPayload ?? {}),
        workflowOwnership: {
          workflowId: workflowDecision.workflowId,
          owner: workflowDecision.owner,
          reason: workflowDecision.reason,
          confidence: workflowDecision.confidence,
        },
      };

      if (workflowDecision.owner === sourceAgentId) {
        return {
          assignedAgent: sourceAgentId,
          description,
          structuredPayload: workflowPayload,
          statusNote: `Workflow ${workflowDecision.workflowId} remains with ${sourceAgentId}.`,
        };
      }

      return {
        assignedAgent: workflowDecision.owner,
        description,
        structuredPayload: workflowPayload,
        statusNote: `Workflow ${workflowDecision.workflowId} reassigned from ${sourceAgentId} to ${workflowDecision.owner}.`,
      };
    }

    const targetAgent = inferDeterministicDelegationTarget(forwardingIntent, sourceAgentId);
    if (!targetAgent) return null;

    return {
      assignedAgent: targetAgent,
      description: forwardingIntent,
      ...(structuredPayload ? { structuredPayload } : {}),
      statusNote: `Reassigned from ${sourceAgentId} to ${targetAgent}.`,
    };
  }
}

function splitDelegatedIntent(forwardingIntent: string): {
  readonly description: string;
  readonly priorWork?: string;
} {
  const [rawDescription, ...priorWorkParts] = forwardingIntent.split(PRIOR_WORK_MARKER);
  const description = collapseWhitespace(rawDescription ?? forwardingIntent);
  const priorWork = priorWorkParts.length > 0 ? priorWorkParts.join('\n\n').trim() : undefined;

  return {
    description: description || 'Continue the delegated task with the appropriate specialist.',
    ...(priorWork ? { priorWork } : {}),
  };
}

function mergeDelegationPayload(
  structuredPayload: Record<string, unknown> | undefined,
  sourceAgentId: Exclude<AgentIdentifier, 'router'>,
  priorWork?: string
): Record<string, unknown> | undefined {
  if (!priorWork) return structuredPayload;

  return {
    ...(structuredPayload ?? {}),
    delegationContext: {
      sourceAgentId,
      priorWork,
    },
  };
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
