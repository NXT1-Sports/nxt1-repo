import type {
  AgentIdentifier,
  AgentSessionContext,
  AgentToolAccessContext,
  AgentToolEntityGroup,
  AgentUserContext,
} from '@nxt1/core';
import { COORDINATOR_AGENT_IDS } from '@nxt1/core';
import type { PlannerAgent } from '../agents/planner.agent.js';
import {
  AgentRoutingOrchestratorService,
  type TaskDelegationRerouteResult,
} from './agent-routing-orchestrator.service.js';

const routableCoordinatorSet = new Set<string>(COORDINATOR_AGENT_IDS);
const PROVIDER_EMAIL_SEND_TOOLS = ['send_email', 'batch_send_email'] as const;
const GMAIL_ONLY_SEND_TOOLS = ['gmail_send_email'] as const;

export class AgentRouterPolicyService {
  private readonly routingOrchestrator: AgentRoutingOrchestratorService;

  constructor(planner: PlannerAgent) {
    this.routingOrchestrator = new AgentRoutingOrchestratorService(planner);
  }

  isRoutableCoordinatorAgent(agentId: string): agentId is Exclude<AgentIdentifier, 'router'> {
    return routableCoordinatorSet.has(agentId);
  }

  async rerouteDelegatedTask(
    forwardingIntent: string,
    sourceAgentId: Exclude<AgentIdentifier, 'router'>,
    context: AgentSessionContext,
    structuredPayload?: Record<string, unknown>
  ): Promise<TaskDelegationRerouteResult | null> {
    return this.routingOrchestrator.rerouteDelegatedTask(
      forwardingIntent,
      sourceAgentId,
      context,
      structuredPayload
    );
  }

  buildToolAccessContext(userContext: AgentUserContext): AgentToolAccessContext {
    const role = userContext.role?.trim().toLowerCase() ?? 'unknown';
    const isTeamRole = role === 'coach' || role === 'director';
    const allowedEntityGroups: AgentToolEntityGroup[] = ['platform_tools', 'system_tools'];
    const connectedEmailProviders = new Set(
      (userContext.connectedAccounts ?? [])
        .filter(
          (account) =>
            account.isTokenValid &&
            (account.provider === 'gmail' || account.provider === 'microsoft')
        )
        .map((account) => account.provider)
    );
    const blockedToolNames: string[] = [];

    if (role === 'athlete') {
      allowedEntityGroups.push('user_tools');
    }

    if (isTeamRole) {
      allowedEntityGroups.push('team_tools', 'user_tools');
    }

    if (userContext.organizationId) {
      allowedEntityGroups.push('organization_tools');
    }

    if (!connectedEmailProviders.has('gmail') && !connectedEmailProviders.has('microsoft')) {
      blockedToolNames.push(...PROVIDER_EMAIL_SEND_TOOLS, ...GMAIL_ONLY_SEND_TOOLS);
    } else if (!connectedEmailProviders.has('gmail')) {
      blockedToolNames.push(...GMAIL_ONLY_SEND_TOOLS);
    }

    return {
      userId: userContext.userId,
      role: userContext.role,
      teamId: userContext.teamId,
      organizationId: userContext.organizationId,
      allowedEntityGroups: Array.from(new Set(allowedEntityGroups)),
      ...(blockedToolNames.length > 0 ? { blockedToolNames } : {}),
    };
  }
}
