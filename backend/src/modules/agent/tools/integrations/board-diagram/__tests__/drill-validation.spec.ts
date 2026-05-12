import { describe, expect, it } from 'vitest';
import { validateDrillLayout } from '../shared/drill-validation.js';
import type { DiagramLayout } from '../../play-diagram/shared/diagram.types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLayout(overrides: Partial<DiagramLayout> = {}): DiagramLayout {
  return {
    sport: 'basketball',
    title: 'Test Drill',
    fieldWidth: 600,
    fieldHeight: 440,
    losY: 264,
    players: [{ id: 'p1', label: 'P1', x: 300, y: 380, team: 'offense', shape: 'circle' }],
    routes: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('validateDrillLayout', () => {
  it('passes with a single player (individual drill)', () => {
    const layout = makeLayout({
      players: [{ id: 'p1', label: 'P1', x: 300, y: 380, team: 'offense' }],
    });
    expect(() => validateDrillLayout(layout)).not.toThrow();
  });

  it('passes with multiple players', () => {
    const layout = makeLayout({
      players: [
        { id: 'p1', label: 'P1', x: 200, y: 380, team: 'offense' },
        { id: 'p2', label: 'P2', x: 300, y: 380, team: 'offense' },
        { id: 'p3', label: 'P3', x: 400, y: 380, team: 'offense' },
      ],
    });
    expect(() => validateDrillLayout(layout)).not.toThrow();
  });

  it('throws BOARD_DIAGRAM_INVALID_DRILL_LAYOUT when no players', () => {
    const layout = makeLayout({ players: [] });
    expect(() => validateDrillLayout(layout)).toThrow('at least 1 player');
  });

  it('throws when a route references a non-existent player id', () => {
    const layout = makeLayout({
      routes: [
        {
          from: 'ghost',
          points: [
            [300, 380],
            [300, 200],
          ],
          type: 'go',
        },
      ],
    });
    expect(() => validateDrillLayout(layout)).toThrow("unknown player id 'ghost'");
  });

  it('allows routes with an empty from field (annotation-only route)', () => {
    const layout = makeLayout({
      routes: [
        {
          from: '',
          points: [
            [100, 100],
            [200, 200],
          ],
          type: 'space',
        },
      ],
    });
    expect(() => validateDrillLayout(layout)).not.toThrow();
  });

  it('passes when routes are empty', () => {
    const layout = makeLayout({ routes: [] });
    expect(() => validateDrillLayout(layout)).not.toThrow();
  });

  it('passes with valid route from player id', () => {
    const layout = makeLayout({
      players: [{ id: 'wr1', label: 'WR', x: 150, y: 300, team: 'offense' }],
      routes: [
        {
          from: 'wr1',
          points: [
            [150, 300],
            [220, 200],
          ],
          type: 'cut',
          curve: true,
        },
      ],
    });
    expect(() => validateDrillLayout(layout)).not.toThrow();
  });

  it('works for football drills with a defense player', () => {
    const layout = makeLayout({
      sport: 'football',
      players: [
        { id: 'wr1', label: 'WR', x: 150, y: 300, team: 'offense' },
        { id: 'cb1', label: 'CB', x: 155, y: 260, team: 'defense' },
      ],
      routes: [
        {
          from: 'wr1',
          points: [
            [150, 300],
            [220, 200],
          ],
          type: 'cut',
        },
        {
          from: 'cb1',
          points: [
            [155, 260],
            [220, 200],
          ],
          type: 'drag',
        },
      ],
    });
    expect(() => validateDrillLayout(layout)).not.toThrow();
  });
});
