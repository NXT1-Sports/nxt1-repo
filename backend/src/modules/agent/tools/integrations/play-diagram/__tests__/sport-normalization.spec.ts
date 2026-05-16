import { describe, expect, it } from 'vitest';

import { applySportFeatureFlag, normalizeSportId } from '../sport-normalization.js';

describe('play diagram sport normalization', () => {
  it('normalizes basketball variants', () => {
    expect(normalizeSportId('basketball_mens')).toBe('basketball');
    expect(normalizeSportId('Basketball Womens')).toBe('basketball');
  });

  it('normalizes soccer variants', () => {
    expect(normalizeSportId('soccer_mens')).toBe('soccer');
    expect(normalizeSportId("Women's Soccer")).toBe('soccer');
  });

  it('keeps direct sports and defaults unknown to football', () => {
    expect(normalizeSportId('baseball')).toBe('baseball');
    expect(normalizeSportId('softball')).toBe('softball');
    expect(normalizeSportId('football')).toBe('football');
    expect(normalizeSportId('track_field_mens')).toBe('football');
  });

  it('feature flag downgrades extended sports to football when disabled', () => {
    expect(applySportFeatureFlag('soccer', false)).toBe('football');
    expect(applySportFeatureFlag('baseball', false)).toBe('football');
    expect(applySportFeatureFlag('softball', false)).toBe('football');
    expect(applySportFeatureFlag('basketball', false)).toBe('basketball');
  });

  it('keeps extended sports when enabled', () => {
    expect(applySportFeatureFlag('soccer', true)).toBe('soccer');
    expect(applySportFeatureFlag('baseball', true)).toBe('baseball');
    expect(applySportFeatureFlag('softball', true)).toBe('softball');
  });
});
