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
    const prior = process.env['PLAY_DIAGRAM_ENABLE_EXTENDED_SPORTS'];
    process.env['PLAY_DIAGRAM_ENABLE_EXTENDED_SPORTS'] = 'false';

    expect(applySportFeatureFlag('soccer')).toBe('football');
    expect(applySportFeatureFlag('baseball')).toBe('football');
    expect(applySportFeatureFlag('softball')).toBe('football');
    expect(applySportFeatureFlag('basketball')).toBe('basketball');

    if (prior === undefined) {
      delete process.env['PLAY_DIAGRAM_ENABLE_EXTENDED_SPORTS'];
    } else {
      process.env['PLAY_DIAGRAM_ENABLE_EXTENDED_SPORTS'] = prior;
    }
  });
});
