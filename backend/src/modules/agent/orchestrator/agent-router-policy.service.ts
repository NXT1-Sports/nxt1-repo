import type {
  AgentExecutionPlan,
  AgentIdentifier,
  AgentSessionContext,
  AgentToolAccessContext,
  AgentToolEntityGroup,
  AgentUserContext,
} from '@nxt1/core';
import { COORDINATOR_AGENT_IDS } from '@nxt1/core';
import type { PlannerAgent } from '../agents/planner.agent.js';

export type TaskDelegationRerouteResult = {
  readonly assignedAgent: Exclude<AgentIdentifier, 'router'>;
  readonly description: string;
};

const routableCoordinatorSet = new Set<string>(COORDINATOR_AGENT_IDS);

export class AgentRouterPolicyService {
  constructor(private readonly planner: PlannerAgent) {}

  isRoutableCoordinatorAgent(agentId: string): agentId is Exclude<AgentIdentifier, 'router'> {
    return routableCoordinatorSet.has(agentId);
  }

  async rerouteDelegatedTask(
    forwardingIntent: string,
    sourceAgentId: Exclude<AgentIdentifier, 'router'>,
    context: AgentSessionContext
  ): Promise<TaskDelegationRerouteResult | null> {
    const routingHint =
      `\n\n[System: The "${sourceAgentId}" agent could not handle this task. ` +
      'Route to a different specialist and do not assign it back to the same agent.]';

    const rerouteResult = await this.planner.execute(
      `${forwardingIntent}${routingHint}`,
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
    };
  }

  buildToolAccessContext(userContext: AgentUserContext): AgentToolAccessContext {
    const role = userContext.role?.trim().toLowerCase() ?? 'unknown';
    const isTeamRole = role === 'coach' || role === 'director';
    const allowedEntityGroups: AgentToolEntityGroup[] = ['platform_tools', 'system_tools'];

    if (role === 'athlete') {
      allowedEntityGroups.push('user_tools');
    }

    if (isTeamRole) {
      allowedEntityGroups.push('team_tools', 'user_tools');
    }

    if (userContext.organizationId) {
      allowedEntityGroups.push('organization_tools');
    }

    return {
      userId: userContext.userId,
      role: userContext.role,
      teamId: userContext.teamId,
      organizationId: userContext.organizationId,
      allowedEntityGroups: Array.from(new Set(allowedEntityGroups)),
    };
  }
}
