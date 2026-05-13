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
  readonly structuredPayload?: Record<string, unknown>;
  readonly statusNote?: string;
};

const routableCoordinatorSet = new Set<string>(COORDINATOR_AGENT_IDS);
const PROVIDER_EMAIL_SEND_TOOLS = ['send_email', 'batch_send_email'] as const;
const GMAIL_ONLY_SEND_TOOLS = ['gmail_send_email'] as const;
const PRIOR_WORK_MARKER = /\n\n(?=\[(?:Prior Work|Prior Artifacts) from )/;

const DETERMINISTIC_ROUTING_RULES: readonly {
  readonly agent: Exclude<AgentIdentifier, 'router'>;
  readonly pattern: RegExp;
}[] = [
  {
    agent: 'recruiting_coordinator',
    pattern:
      /\b(recruit|recruiting|college|colleges|programs?|coaches?|head coaches?|(?:offensive|defensive|special teams|quarterbacks|recruiting) coordinators?|outreach|email campaign|email outreach|send emails?|draft emails?|follow-?up emails?)\b/i,
  },
  {
    agent: 'data_coordinator',
    pattern:
      /\b(scrape|crawl|extract|lookup|look up|search web|web research|csv|spreadsheet|contacts?|normalize|import|dataset|data acquisition)\b/i,
  },
  {
    agent: 'performance_coordinator',
    pattern:
      /\b(film|tape|highlight|hudl|video analysis|scouting report|performance|stats?|combine|metrics?|breakdown|evaluate|videos? to watch|what videos? should i watch|film study videos?)\b/i,
  },
  {
    agent: 'brand_coordinator',
    pattern:
      /\b(graphic|poster|design|creative|image|thumbnail|edit video|trim|merge|overlay|caption|subtitles?|social post|media asset)\b/i,
  },
  {
    agent: 'admin_coordinator',
    pattern:
      /\b(compliance|ncaa|eligibility|dead period|quiet period|contact period|violation|policy|permission|audit)\b/i,
  },
  {
    agent: 'strategy_coordinator',
    pattern:
      /\b(strategy|plan|playbook|roadmap|recommendation|compare|prioritize|funnel|chart|dashboard|operating model)\b/i,
  },
];

export class AgentRouterPolicyService {
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
    const targetAgent = this.inferDelegationTarget(forwardingIntent, sourceAgentId);
    if (!targetAgent) return null;

    return {
      assignedAgent: targetAgent,
      description: forwardingIntent,
      ...(structuredPayload ? { structuredPayload } : {}),
      statusNote: `Reassigned from ${sourceAgentId} to ${targetAgent}.`,
    };
  }

  private inferDelegationTarget(
    forwardingIntent: string,
    sourceAgentId: Exclude<AgentIdentifier, 'router'>
  ): Exclude<AgentIdentifier, 'router'> | null {
    for (const rule of DETERMINISTIC_ROUTING_RULES) {
      if (rule.agent !== sourceAgentId && rule.pattern.test(forwardingIntent)) {
        return rule.agent;
      }
    }

    return null;
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
