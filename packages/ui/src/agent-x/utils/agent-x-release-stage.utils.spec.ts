import {
  getAgentXReleaseLabel,
  getAgentXReleaseStage,
  isAgentXSurfaceBeta,
  withAgentXReleaseLabel,
  type AgentXReleaseSurface,
} from './agent-x-release-stage.utils';

describe('agent-x-release-stage.utils', () => {
  const betaSurfaces: readonly AgentXReleaseSurface[] = [
    'playbooks',
    'gameplans',
    'filmReview',
    'diagramsLab',
    'generatedPlays',
  ];

  it('defaults all covered surfaces to beta', () => {
    for (const surface of betaSurfaces) {
      expect(getAgentXReleaseStage(surface)).toBe('beta');
      expect(getAgentXReleaseLabel(surface)).toBe('Beta');
      expect(isAgentXSurfaceBeta(surface)).toBe(true);
    }
  });

  it('formats titles with the release label for beta surfaces', () => {
    expect(withAgentXReleaseLabel('Playbooks', 'playbooks')).toBe('Playbooks (Beta)');
    expect(withAgentXReleaseLabel(' Film Review ', 'filmReview')).toBe('Film Review (Beta)');
  });

  it('handles blank titles safely', () => {
    expect(withAgentXReleaseLabel('   ', 'gameplans')).toBe('');
  });
});
