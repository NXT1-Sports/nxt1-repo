import type { AgentIdentifier } from '@nxt1/core';

export interface DeterministicRoutingRule {
  readonly agent: Exclude<AgentIdentifier, 'router'>;
  readonly pattern: RegExp;
}

export const DETERMINISTIC_ROUTING_RULES: readonly DeterministicRoutingRule[] = [
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
] as const;

export function inferDeterministicDelegationTarget(
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
