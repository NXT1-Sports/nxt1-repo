import { describe, expect, it } from 'vitest';

import { enhanceLayoutForConcept } from '../layout-enhancement.js';
import type { DiagramLayout } from '../diagram.types.js';

function baseLayout(): DiagramLayout {
  return {
    sport: 'football',
    title: 'Smash',
    fieldWidth: 600,
    fieldHeight: 440,
    losY: 300,
    players: [
      { id: 'X', label: 'X', x: 70, y: 295, team: 'offense', shape: 'circle' },
      { id: 'QB', label: 'QB', x: 280, y: 320, team: 'offense', shape: 'circle' },
      { id: 'LT', label: 'LT', x: 230, y: 276, team: 'offense', shape: 'square' },
      { id: 'MLB', label: 'MLB', x: 280, y: 262, team: 'defense', shape: 'circle' },
    ],
    routes: [
      {
        from: 'X',
        label: 'Post',
        type: 'cut',
        points: [
          [70, 295],
          [70, 250],
          [95, 230],
        ],
      },
      {
        from: 'MLB',
        label: 'Gap Rush',
        type: 'go',
        points: [
          [280, 262],
          [280, 220],
        ],
      },
    ],
  };
}

describe('enhanceLayoutForConcept', () => {
  it('normalizes offensive line and qb depth', () => {
    const enhanced = enhanceLayoutForConcept(baseLayout(), 'smash fade concept');

    const lt = enhanced.players.find((player) => player.id === 'LT');
    const qb = enhanced.players.find((player) => player.id === 'QB');

    expect(lt?.y).toBe(enhanced.losY);
    expect(qb?.y).toBeGreaterThanOrEqual(enhanced.losY + 38);
  });

  it('pushes shallow deep routes to elite depth', () => {
    const enhanced = enhanceLayoutForConcept(baseLayout(), 'post shot');
    const route = enhanced.routes.find((item) => item.from === 'X');

    expect(route).toBeDefined();
    const start = route?.points[0];
    const end = route?.points[route.points.length - 1];
    expect(start).toBeDefined();
    expect(end).toBeDefined();
    expect((start?.[1] ?? 0) - (end?.[1] ?? 0)).toBeGreaterThanOrEqual(90);
  });

  it('normalizes defensive rush direction toward LOS and QB', () => {
    const enhanced = enhanceLayoutForConcept(baseLayout(), 'mlb blitz');
    const rush = enhanced.routes.find((item) => item.from === 'MLB');
    const end = rush?.points[rush.points.length - 1];

    expect(end).toBeDefined();
    expect(end?.[1] ?? 0).toBeGreaterThanOrEqual(enhanced.losY + 8);
  });

  it('normalizes SL/SR aliases to H/Y when available', () => {
    const layout = baseLayout();
    layout.players = [
      ...layout.players,
      { id: 'SL', label: 'SL', x: 160, y: 295, team: 'offense', shape: 'circle' },
      { id: 'SR', label: 'SR', x: 440, y: 295, team: 'offense', shape: 'circle' },
    ];
    layout.routes = [
      ...layout.routes,
      {
        from: 'SL',
        label: 'Seam',
        type: 'go',
        points: [
          [160, 295],
          [160, 180],
        ],
      },
      {
        from: 'SR',
        label: 'Seam',
        type: 'go',
        points: [
          [440, 295],
          [440, 180],
        ],
      },
    ];

    const enhanced = enhanceLayoutForConcept(layout, '2x2 seams');

    expect(enhanced.players.some((player) => player.id === 'H')).toBe(true);
    expect(enhanced.players.some((player) => player.id === 'Y')).toBe(true);
    expect(enhanced.routes.some((route) => route.from === 'H')).toBe(true);
    expect(enhanced.routes.some((route) => route.from === 'Y')).toBe(true);
  });

  it('defaults football routes to non-smoothed paths except true arc families', () => {
    const layout = baseLayout();
    layout.routes = [
      {
        from: 'X',
        label: 'Vert',
        type: 'go',
        points: [
          [70, 295],
          [70, 180],
          [70, 110],
        ],
        curve: true,
      },
      {
        from: 'QB',
        label: 'Wheel',
        type: 'fade',
        points: [
          [280, 320],
          [330, 260],
          [390, 170],
        ],
        curve: false,
      },
    ];

    const enhanced = enhanceLayoutForConcept(layout, 'verts with rb wheel');
    const vert = enhanced.routes.find((route) => route.label === 'Vert');
    const wheel = enhanced.routes.find((route) => route.label === 'Wheel');

    expect(vert?.curve).toBe(false);
    expect(wheel?.curve).toBe(true);
  });

  it('normalizes suffixed slot aliases like SL1 and SL2 into clean football labels', () => {
    const layout = baseLayout();
    layout.players = [
      ...layout.players,
      { id: 'SL1', label: 'SL1', x: 160, y: 295, team: 'offense', shape: 'circle' },
      { id: 'SL2', label: 'SL2', x: 210, y: 295, team: 'offense', shape: 'circle' },
    ];
    layout.routes = [
      ...layout.routes,
      {
        from: 'SL1',
        label: 'Seam',
        type: 'go',
        points: [
          [160, 295],
          [160, 180],
        ],
      },
      {
        from: 'SL2',
        label: 'Flat',
        type: 'cut',
        points: [
          [210, 295],
          [180, 260],
          [150, 260],
        ],
      },
    ];

    const enhanced = enhanceLayoutForConcept(layout, 'trips flood');

    expect(enhanced.players.some((player) => player.label === 'H')).toBe(true);
    expect(enhanced.players.some((player) => player.label === 'Y')).toBe(true);
    expect(enhanced.players.some((player) => player.label === 'SL1')).toBe(false);
    expect(enhanced.players.some((player) => player.label === 'SL2')).toBe(false);
  });

  it('adds coherent OL block assignments for run blocking concepts', () => {
    const layout = baseLayout();
    layout.players = [
      ...layout.players,
      { id: 'LG', label: 'LG', x: 245, y: 300, team: 'offense', shape: 'square' },
      { id: 'C', label: 'C', x: 280, y: 300, team: 'offense', shape: 'square' },
      { id: 'RG', label: 'RG', x: 315, y: 300, team: 'offense', shape: 'square' },
      { id: 'RT', label: 'RT', x: 350, y: 300, team: 'offense', shape: 'square' },
    ];

    const enhanced = enhanceLayoutForConcept(layout, 'inside zone left run blocking scheme');
    const olIds = ['LT', 'LG', 'C', 'RG', 'RT'];

    for (const id of olIds) {
      const route = enhanced.routes.find((item) => item.from === id);
      expect(route).toBeDefined();
      expect(route?.type).toBe('block');
      expect(route?.curve).toBe(false);

      const start = route?.points[0];
      const end = route?.points[(route?.points.length ?? 1) - 1];
      expect(start).toBeDefined();
      expect(end).toBeDefined();
      expect(end?.[1] ?? 999).toBeLessThan(start?.[1] ?? 0);
    }
  });

  it('normalizes existing OL routes to block type in pass protection concepts', () => {
    const layout = baseLayout();
    layout.players = [
      ...layout.players,
      { id: 'LG', label: 'LG', x: 245, y: 300, team: 'offense', shape: 'square' },
      { id: 'C', label: 'C', x: 280, y: 300, team: 'offense', shape: 'square' },
      { id: 'RG', label: 'RG', x: 315, y: 300, team: 'offense', shape: 'square' },
      { id: 'RT', label: 'RT', x: 350, y: 300, team: 'offense', shape: 'square' },
    ];
    layout.routes = [
      ...layout.routes,
      {
        from: 'LG',
        label: 'Odd Path',
        type: 'go',
        points: [
          [245, 300],
          [280, 210],
        ],
        curve: true,
      },
    ];

    const enhanced = enhanceLayoutForConcept(layout, 'half slide right pass protection');
    const olIds = ['LT', 'LG', 'C', 'RG', 'RT'];

    for (const id of olIds) {
      const route = enhanced.routes.find((item) => item.from === id);
      expect(route?.type).toBe('block');
    }

    const lgRoute = enhanced.routes.find((item) => item.from === 'LG');
    expect(lgRoute?.curve).toBe(false);
  });
});
