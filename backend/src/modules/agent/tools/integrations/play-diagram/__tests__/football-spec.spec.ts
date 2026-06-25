import { describe, expect, it } from 'vitest';

import {
  compileFootballSpecToLayout,
  tryParseFootballSpec,
  validateFootballSpec,
} from '../shared/football-spec.js';

describe('football spec parser', () => {
  it('parses a valid football_spec_v1 payload', () => {
    const raw = JSON.stringify({
      schema: 'football_spec_v1',
      title: 'Trips Right Flood',
      formation: 'trips_right',
      includeProtection: true,
      routes: [
        { from: 'X', concept: 'corner', depth: 'deep', breakDirection: 'outside', label: 'Corner' },
        {
          from: 'Y',
          concept: 'out',
          depth: 'intermediate',
          breakDirection: 'outside',
          label: 'Out',
        },
      ],
    });

    const parsed = tryParseFootballSpec(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.schema).toBe('football_spec_v1');
    expect(parsed?.formation).toBe('trips_right');
    expect(parsed?.routes.length).toBe(2);
  });

  it('returns null for non football-spec payload', () => {
    const raw = JSON.stringify({ sport: 'football', players: [], routes: [] });
    expect(tryParseFootballSpec(raw)).toBeNull();
  });
});

describe('football spec compiler', () => {
  it('compiles football spec into deterministic diagram layout', () => {
    const parsed = tryParseFootballSpec(
      JSON.stringify({
        schema: 'football_spec_v1',
        title: 'Doubles Concept',
        formation: 'doubles',
        includeProtection: true,
        routes: [
          { from: 'X', concept: 'go', depth: 'deep', label: 'Go' },
          {
            from: 'H',
            concept: 'dig',
            depth: 'intermediate',
            breakDirection: 'inside',
            label: 'Dig',
          },
          { from: 'RB', concept: 'flat', depth: 'quick', breakDirection: 'right', label: 'Flat' },
        ],
      })
    );

    expect(parsed).not.toBeNull();
    const layout = compileFootballSpecToLayout(parsed!);

    expect(layout.sport).toBe('football');
    expect(layout.fieldWidth).toBe(600);
    expect(layout.fieldHeight).toBe(440);
    expect(layout.losY).toBe(300);

    const qb = layout.players.find((player) => player.id === 'QB');
    expect(qb).toBeDefined();
    expect(layout.players.some((player) => player.id === 'X')).toBe(true);
    expect(layout.players.some((player) => player.id === 'RB')).toBe(true);

    expect(layout.routes.length).toBeGreaterThanOrEqual(8);
    const go = layout.routes.find((route) => route.from === 'X');
    expect(go).toBeDefined();
    expect(go?.type).toBe('go');
  });

  it('flags duplicate role assignments and missing outside routes', () => {
    const parsed = tryParseFootballSpec(
      JSON.stringify({
        schema: 'football_spec_v1',
        title: 'Bad Spec',
        formation: 'trips_right',
        routes: [
          { from: 'Y', concept: 'seam' },
          { from: 'Y', concept: 'out' },
        ],
      })
    );

    expect(parsed).not.toBeNull();
    const validation = validateFootballSpec(parsed!);
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.includes('duplicate route assignments'))).toBe(
      true
    );
    expect(
      validation.issues.some((issue) => issue.includes('outside receiver route (X or Z)'))
    ).toBe(true);
  });
});
