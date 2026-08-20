export type AgentXReleaseStage = 'stable' | 'beta';

export type AgentXReleaseSurface =
  'playbooks' | 'practiceScripts' | 'gameplans' | 'filmReview' | 'diagramsLab' | 'generatedPlays';

// Flip this single value to move all covered Agent X surfaces out of beta.
const DEFAULT_AGENT_X_RELEASE_STAGE: AgentXReleaseStage = 'stable';

const AGENT_X_RELEASE_STAGE_OVERRIDES: Readonly<
  Partial<Record<AgentXReleaseSurface, AgentXReleaseStage>>
> = {
  // Example: filmReview: 'stable',
};

export function getAgentXReleaseStage(surface: AgentXReleaseSurface): AgentXReleaseStage {
  return AGENT_X_RELEASE_STAGE_OVERRIDES[surface] ?? DEFAULT_AGENT_X_RELEASE_STAGE;
}

export function getAgentXReleaseLabel(surface: AgentXReleaseSurface): string {
  return getAgentXReleaseStage(surface) === 'beta' ? 'Beta' : '';
}

export function withAgentXReleaseLabel(title: string, surface: AgentXReleaseSurface): string {
  const normalizedTitle = title.trim();
  if (!normalizedTitle.length) return '';

  const releaseLabel = getAgentXReleaseLabel(surface);
  return releaseLabel ? `${normalizedTitle} (${releaseLabel})` : normalizedTitle;
}

export function isAgentXSurfaceBeta(surface: AgentXReleaseSurface): boolean {
  return getAgentXReleaseStage(surface) === 'beta';
}
