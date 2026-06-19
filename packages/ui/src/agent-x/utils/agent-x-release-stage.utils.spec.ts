import {
  getAgentXReleaseLabel,
  getAgentXReleaseStage,
  isAgentXSurfaceBeta,
  withAgentXReleaseLabel,
  type AgentXReleaseSurface,
} from './agent-x-release-stage.utils';

describe('agent-x-release-stage.utils', () => {
  const stableSurfaces: readonly AgentXReleaseSurface[] = [
    'playbooks',
    'practiceScripts',
    'gameplans',
    'filmReview',
    'diagramsLab',
    'generatedPlays',
  ];

  it('defaults all covered surfaces to stable', () => {
    for (const surface of stableSurfaces) {
      expect(getAgentXReleaseStage(surface)).toBe('stable');
      expect(getAgentXReleaseLabel(surface)).toBe('');
      expect(isAgentXSurfaceBeta(surface)).toBe(false);
    }
  });

  it('formats titles without a release label for stable surfaces', () => {
    expect(withAgentXReleaseLabel('Playbooks', 'playbooks')).toBe('Playbooks');
    expect(withAgentXReleaseLabel('Practice Scripts', 'practiceScripts')).toBe('Practice Scripts');
    expect(withAgentXReleaseLabel(' Film Review ', 'filmReview')).toBe('Film Review');
  });

  it('handles blank titles safely', () => {
    expect(withAgentXReleaseLabel('   ', 'gameplans')).toBe('');
  });
});
