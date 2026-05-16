import { describe, expect, it } from 'vitest';

import { coerceRouteType, enhanceLayoutForConcept } from '../shared/layout-enhancement.js';
import { getConceptEnhancers } from '../concepts/index.js';
import { renderZones } from '../shared/svg-helpers.js';
import type { DiagramLayout } from '../shared/diagram.types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeFootballLayout(): DiagramLayout {
  return {
    sport: 'football',
    title: 'Cover 2 Defense',
    fieldWidth: 600,
    fieldHeight: 440,
    losY: 300,
    players: [
      { id: 'CBL', label: 'CB', x: 80, y: 250, team: 'defense' },
      { id: 'CBR', label: 'CB', x: 520, y: 250, team: 'defense' },
      { id: 'FS', label: 'FS', x: 210, y: 160, team: 'defense' },
      { id: 'SS', label: 'SS', x: 390, y: 160, team: 'defense' },
      { id: 'MLB', label: 'MLB', x: 300, y: 260, team: 'defense' },
      { id: 'X', label: 'X', x: 70, y: 295, team: 'offense' },
      { id: 'Z', label: 'Z', x: 530, y: 295, team: 'offense' },
      { id: 'QB', label: 'QB', x: 300, y: 330, team: 'offense' },
    ],
    routes: [
      {
        from: 'FS',
        points: [
          [210, 160],
          [210, 80],
        ],
        label: 'Deep Half',
        type: 'go',
      },
      {
        from: 'SS',
        points: [
          [390, 160],
          [390, 80],
        ],
        label: 'Deep Half',
        type: 'go',
      },
      {
        from: 'CBL',
        points: [
          [80, 250],
          [120, 240],
        ],
        label: 'Flat',
        type: 'go',
      },
      {
        from: 'CBR',
        points: [
          [520, 250],
          [480, 240],
        ],
        label: 'Flat',
        type: 'go',
      },
      {
        from: 'MLB',
        points: [
          [300, 260],
          [300, 210],
        ],
        label: 'Hook Curl',
      },
    ],
  };
}

function makeBasketballLayout(): DiagramLayout {
  return {
    sport: 'basketball',
    title: '2-3 Zone Defense',
    fieldWidth: 600,
    fieldHeight: 440,
    losY: 220,
    players: [
      { id: 'PG', label: 'PG', x: 300, y: 180, team: 'offense' },
      { id: 'SG', label: 'SG', x: 120, y: 220, team: 'offense' },
      { id: 'SF', label: 'SF', x: 480, y: 220, team: 'offense' },
      { id: 'PF', label: 'PF', x: 200, y: 340, team: 'offense' },
      { id: 'C', label: 'C', x: 300, y: 360, team: 'offense' },
      { id: 'D1', label: 'D1', x: 220, y: 180, team: 'defense' },
      { id: 'D2', label: 'D2', x: 380, y: 180, team: 'defense' },
      { id: 'D3', label: 'D3', x: 100, y: 290, team: 'defense' },
      { id: 'D4', label: 'D4', x: 300, y: 310, team: 'defense' },
      { id: 'D5', label: 'D5', x: 500, y: 290, team: 'defense' },
    ],
    routes: [],
  };
}

// ─── coerceRouteType ─────────────────────────────────────────────────────────

describe('coerceRouteType', () => {
  it('accepts all valid route types case-insensitively', () => {
    const valid = ['screen', 'pick', 'block', 'cut', 'drag', 'space', 'go', 'fade'] as const;
    for (const t of valid) {
      expect(coerceRouteType(t)).toBe(t);
      expect(coerceRouteType(t.toUpperCase())).toBe(t);
    }
  });

  it('returns undefined for unknown strings and non-string values', () => {
    expect(coerceRouteType('nope')).toBeUndefined();
    expect(coerceRouteType(42)).toBeUndefined();
    expect(coerceRouteType(null)).toBeUndefined();
    expect(coerceRouteType(undefined)).toBeUndefined();
  });
});

// ─── Registry ────────────────────────────────────────────────────────────────

describe('getConceptEnhancers', () => {
  it('returns only football enhancers for football', () => {
    const enhancers = getConceptEnhancers('football');
    expect(enhancers.every((e) => e.sport === 'football' || e.sport === 'all')).toBe(true);
    expect(enhancers.length).toBeGreaterThanOrEqual(3);
  });

  it('returns only basketball enhancers for basketball', () => {
    const enhancers = getConceptEnhancers('basketball');
    expect(enhancers.every((e) => e.sport === 'basketball' || e.sport === 'all')).toBe(true);
    expect(enhancers.length).toBeGreaterThanOrEqual(1);
  });

  it('returns only soccer enhancers for soccer', () => {
    const enhancers = getConceptEnhancers('soccer');
    expect(enhancers.every((e) => e.sport === 'soccer' || e.sport === 'all')).toBe(true);
  });

  it('does NOT leak football enhancers into basketball', () => {
    const enhancers = getConceptEnhancers('basketball');
    expect(enhancers.some((e) => e.id.startsWith('football/'))).toBe(false);
  });
});

// ─── Football concepts ────────────────────────────────────────────────────────

describe('football concept enhancers', () => {
  it('Cover 2: adds 6 zone overlays and hardens defensive drops', () => {
    const layout = enhanceLayoutForConcept(makeFootballLayout(), 'Show me Cover 2 defense shell');

    expect(layout.zones).toBeDefined();
    expect(layout.zones?.length).toBe(6);
    expect(layout.zones?.some((z) => z.label === 'Deep Half')).toBe(true);
    expect(layout.zones?.some((z) => z.label === 'Flat')).toBe(true);
    expect(layout.zones?.some((z) => z.label === 'Hook')).toBe(true);

    const fsRoute = layout.routes.find((r) => r.from === 'FS');
    expect(fsRoute?.type).toBe('fade');

    const mlbRoute = layout.routes.find((r) => r.from === 'MLB');
    expect(mlbRoute?.type).toBe('space');
  });

  it('Cover 3: produces 3 Deep Third zones and 2 Flat zones', () => {
    const layout = enhanceLayoutForConcept(makeFootballLayout(), 'draw a cover 3 defense');

    expect(layout.zones?.filter((z) => z.label === 'Deep Third').length).toBe(3);
    expect(layout.zones?.filter((z) => z.label === 'Flat').length).toBe(2);
  });

  it('Cover 4: produces 4 Deep ¼ zones', () => {
    const layout = enhanceLayoutForConcept(makeFootballLayout(), 'Cover 4 quarters coverage');
    expect(layout.zones?.filter((z) => z.label.includes('Deep')).length).toBe(4);
  });

  it('Man coverage: hardens defensive press routes to block type', () => {
    const layoutWithPress: DiagramLayout = {
      ...makeFootballLayout(),
      routes: [
        {
          from: 'CBL',
          points: [
            [80, 250],
            [70, 295],
          ],
          label: 'Press Man',
        },
        {
          from: 'CBR',
          points: [
            [520, 250],
            [530, 295],
          ],
          label: 'Trail',
        },
      ],
    };
    const layout = enhanceLayoutForConcept(layoutWithPress, 'man coverage press');
    const cb = layout.routes.find((r) => r.from === 'CBL');
    expect(cb?.type).toBe('block');
  });

  it('Tampa 2 matches via cover-2 enhancer', () => {
    const layout = enhanceLayoutForConcept(makeFootballLayout(), 'Tampa 2 zone shell');
    expect(layout.zones?.some((z) => z.label === 'Deep Half')).toBe(true);
  });

  it('normalizes defensive rush/penetrate routes to attack toward LOS/offense', () => {
    const layoutWithBadRushVectors: DiagramLayout = {
      ...makeFootballLayout(),
      players: [
        { id: 'DE', label: 'DE', x: 240, y: 295, team: 'defense' },
        { id: 'DT', label: 'DT', x: 300, y: 295, team: 'defense' },
      ],
      routes: [
        {
          from: 'DE',
          points: [
            [240, 295],
            [220, 260],
          ],
          label: 'LDE: Gap Rush',
          type: 'go',
        },
        {
          from: 'DT',
          points: [
            [300, 295],
            [300, 250],
          ],
          label: 'LDT: A-Gap Penetrate',
          type: 'go',
        },
      ],
    };

    const enhanced = enhanceLayoutForConcept(layoutWithBadRushVectors, 'press man defense');
    const de = enhanced.routes.find((r) => r.from === 'DE');
    const dt = enhanced.routes.find((r) => r.from === 'DT');

    expect(de).toBeDefined();
    expect(dt).toBeDefined();
    expect((de?.points[1] ?? [0, 0])[1]).toBeGreaterThan((de?.points[0] ?? [0, 0])[1]);
    expect((dt?.points[1] ?? [0, 0])[1]).toBeGreaterThan((dt?.points[0] ?? [0, 0])[1]);
  });
});

// ─── Basketball concepts ──────────────────────────────────────────────────────

describe('basketball concept enhancers', () => {
  it('2-3 zone: adds wing and block zone overlays', () => {
    const layout = enhanceLayoutForConcept(makeBasketballLayout(), 'Show 2-3 zone defense');
    expect(layout.zones).toBeDefined();
    expect(layout.zones?.some((z) => z.label === 'Wing')).toBe(true);
    expect(layout.zones?.some((z) => z.label === 'Point')).toBe(true);
  });
});

// ─── Zone SVG rendering ───────────────────────────────────────────────────────

describe('renderZones', () => {
  it('renders zone overlays into valid SVG with ellipse and rect shapes', () => {
    const layout = enhanceLayoutForConcept(makeFootballLayout(), 'cover 2');
    const svg = renderZones(layout.zones);

    expect(svg).toContain('zone-overlays');
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('<rect');
    expect(svg).toContain('Deep Half');
    expect(svg).toContain('Flat');
    expect(svg).toContain('Hook');
  });

  it('returns empty string when no zones are passed', () => {
    expect(renderZones([])).toBe('');
    expect(renderZones(undefined)).toBe('');
  });
});

// ─── Route type inference (label-based) ──────────────────────────────────────

describe('route type inference', () => {
  it('infers space for Hook/Flat labels when type is absent', () => {
    const layout: DiagramLayout = {
      ...makeFootballLayout(),
      routes: [
        {
          from: 'MLB',
          points: [
            [300, 260],
            [300, 210],
          ],
          label: 'Hook Zone',
        },
      ],
    };
    const enhanced = enhanceLayoutForConcept(layout, '');
    expect(enhanced.routes[0]?.type).toBe('space');
  });

  it('infers fade for Deep labels when type is absent', () => {
    const layout: DiagramLayout = {
      ...makeFootballLayout(),
      routes: [
        {
          from: 'FS',
          points: [
            [210, 160],
            [210, 80],
          ],
          label: 'Deep Half',
        },
      ],
    };
    const enhanced = enhanceLayoutForConcept(layout, '');
    expect(enhanced.routes[0]?.type).toBe('fade');
  });

  it('preserves explicitly set route types without overriding', () => {
    const layout: DiagramLayout = {
      ...makeFootballLayout(),
      routes: [
        {
          from: 'X',
          points: [
            [70, 295],
            [70, 80],
          ],
          label: 'Deep Half',
          type: 'screen',
        },
      ],
    };
    const enhanced = enhanceLayoutForConcept(layout, '');
    expect(enhanced.routes[0]?.type).toBe('screen');
  });
});

// ─── Non-matching concept — no zones added ────────────────────────────────────

describe('no concept match', () => {
  it('returns layout without zones when concept text does not match', () => {
    const layout = enhanceLayoutForConcept(makeFootballLayout(), 'four verticals');
    expect(layout.zones).toBeUndefined();
  });

  it('does not apply football concepts to basketball layouts', () => {
    const layout = enhanceLayoutForConcept(makeBasketballLayout(), 'cover 2 defense');
    expect(layout.zones).toBeUndefined();
  });
});
