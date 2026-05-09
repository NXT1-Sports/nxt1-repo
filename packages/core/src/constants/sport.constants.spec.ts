import { describe, expect, it } from 'vitest';

import { normalizeBaseSportKey, normalizeSportKey } from './sport.constants';

describe('normalizeBaseSportKey', () => {
  it('collapses display-name gender prefixes to the same base sport', () => {
    expect(normalizeBaseSportKey("Men's Basketball")).toBe('basketball');
    expect(normalizeBaseSportKey("Women's Soccer")).toBe('soccer');
  });

  it('collapses legacy gender suffix formats to the same base sport', () => {
    expect(normalizeBaseSportKey('basketball mens')).toBe('basketball');
    expect(normalizeBaseSportKey('basketball_mens')).toBe('basketball');
    expect(normalizeBaseSportKey('Basketball (Mens)')).toBe('basketball');
  });

  it('preserves ungendered sports', () => {
    expect(normalizeBaseSportKey('football')).toBe('football');
    expect(normalizeBaseSportKey('track & field')).toBe(normalizeSportKey('track & field'));
  });
});
