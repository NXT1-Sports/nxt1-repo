import { describe, expect, it } from 'vitest';

import { getSportRenderer } from '../renderers/index.js';
import type { DiagramLayout, NormalizedSport } from '../shared/diagram.types.js';

function baseLayout(sport: NormalizedSport): DiagramLayout {
  return {
    sport,
    title: `${sport} test`,
    fieldWidth: 600,
    fieldHeight: 440,
    losY: 300,
    players: [
      { id: 'p1', label: 'P1', x: 300, y: 260, team: 'offense' },
      { id: 'p2', label: 'P2', x: 320, y: 300, team: 'defense' },
    ],
    routes: [
      {
        from: 'p1',
        points: [
          [300, 260],
          [300, 180],
        ],
        label: 'Move',
      },
    ],
  };
}

describe('sport renderers', () => {
  const sports: NormalizedSport[] = ['football', 'basketball', 'soccer', 'baseball', 'softball'];

  it.each(sports)('renders field svg for %s', (sport) => {
    const renderer = getSportRenderer(sport);
    const svg = renderer.renderField(baseLayout(sport));

    expect(svg.length).toBeGreaterThan(50);
    expect(svg).toContain('<');
    expect(renderer.defaultLosY).toBeGreaterThan(0);
  });

  it('basketball renderer includes a three-point arc with finite coordinates', () => {
    const renderer = getSportRenderer('basketball');
    const svg = renderer.renderField(baseLayout('basketball'));

    // The three-point arc must be present and must not contain NaN values.
    // The original bug: (cx - 10)^2 = 290^2 > r3^2 = 220^2 → Math.sqrt(negative) → NaN.
    expect(svg).not.toContain('NaN');

    // Confirm the arc element is actually in the output with the correct sweep direction.
    // sweep=0 (counter-clockwise) bows the arc AWAY from the basket toward center court.
    // sweep=1 would trace the arc up through the backboard (wrong direction).
    expect(svg).toMatch(/A 220 220 0 0 0/);

    // Corner straight lines should appear (the two <line> elements for corner threes).
    const lineMatches = svg.match(/<line /g) ?? [];
    expect(lineMatches.length).toBeGreaterThanOrEqual(2);
  });
});
