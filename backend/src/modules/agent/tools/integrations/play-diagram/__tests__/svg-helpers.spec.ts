import { describe, expect, it } from 'vitest';

import {
  renderDiagramSvg,
  renderLegend,
  renderAnnotationStrip,
  renderPlayers,
  renderRoutes,
} from '../shared/svg-helpers.js';
import type { DiagramLayout } from '../shared/diagram.types.js';

// ─── Route rendering ──────────────────────────────────────────────────────────

describe('renderRoutes — labels', () => {
  it('renders route paths without inline label boxes (labels moved to annotation strip)', () => {
    const svg = renderRoutes([
      {
        from: 'QB',
        points: [
          [300, 300],
          [300, 240],
          [330, 200],
        ],
        label: 'Drive',
      },
    ]);

    // No floating label boxes on the field anymore
    expect(svg).not.toContain('fill="rgba(244,249,255,0.93)"');
    expect(svg).not.toContain('<rect x="');
    // Route path still rendered
    expect(svg).toContain('marker-end="url(#arr-go)"');
    expect(svg).toContain('<path d="');
  });
});

describe('renderRoutes — path vs polyline', () => {
  it('uses <path> (not <polyline>) for all routes', () => {
    const svg = renderRoutes([
      {
        from: 'A',
        points: [
          [10, 10],
          [50, 50],
        ],
      },
    ]);
    expect(svg).toContain('<path d="');
    expect(svg).not.toContain('<polyline');
  });

  it('emits straight L segments for 2-point routes', () => {
    const svg = renderRoutes([
      {
        from: 'A',
        points: [
          [0, 0],
          [100, 100],
        ],
      },
    ]);
    expect(svg).toMatch(/d="M 0,0 L 100,100"/);
  });

  it('emits straight L segments for 3-point go routes by default', () => {
    const svg = renderRoutes([
      {
        from: 'WR',
        type: 'go',
        points: [
          [100, 300],
          [100, 200],
          [80, 150],
        ],
      },
    ]);
    expect(svg).not.toContain(' C ');
    expect(svg).toContain('L 100,200');
  });

  it('emits straight L segments for block routes regardless of point count', () => {
    const svg = renderRoutes([
      {
        from: 'LT',
        type: 'block',
        points: [
          [50, 280],
          [40, 250],
          [30, 230],
        ],
      },
    ]);
    expect(svg).not.toContain(' C ');
    expect(svg).toContain('L ');
  });

  it('respects curve:false override — forces straight segments', () => {
    const svg = renderRoutes([
      {
        from: 'WR',
        type: 'cut',
        curve: false,
        points: [
          [200, 300],
          [200, 200],
          [180, 170],
        ],
      },
    ]);
    expect(svg).not.toContain(' C ');
  });

  it('respects curve:true override — forces smooth even for 3-point go', () => {
    const svg = renderRoutes([
      {
        from: 'WR',
        type: 'go',
        curve: true,
        points: [
          [200, 300],
          [200, 200],
          [180, 170],
        ],
      },
    ]);
    expect(svg).toContain(' C ');
  });

  it('keeps fade routes smooth by default', () => {
    const svg = renderRoutes([
      {
        from: 'WR',
        type: 'fade',
        points: [
          [200, 300],
          [220, 220],
          [260, 160],
        ],
      },
    ]);
    expect(svg).toContain(' C ');
  });

  it('uses the dedicated drag marker for drag routes', () => {
    const svg = renderRoutes([
      {
        from: 'Y',
        type: 'drag',
        points: [
          [200, 300],
          [170, 300],
          [140, 300],
        ],
      },
    ]);
    expect(svg).toContain('marker-end="url(#arr-go)"');
    expect(svg).not.toContain(' C ');
  });

  it('respects custom color field on routes', () => {
    const svg = renderRoutes([
      {
        from: 'X',
        type: 'go',
        points: [
          [60, 300],
          [60, 150],
        ],
        color: '#00ff00', // Bright green
      },
      {
        from: 'Z',
        type: 'go',
        points: [
          [540, 300],
          [540, 150],
        ],
        color: '#ff3333', // Bright red
      },
    ]);
    // Custom colors should be used in the SVG
    expect(svg).toContain('stroke="#00ff00"');
    expect(svg).toContain('stroke="#ff3333"');
  });

  it('falls back to default color when no custom color specified', () => {
    const svg = renderRoutes([
      {
        from: 'X',
        type: 'go',
        points: [
          [60, 300],
          [60, 150],
        ],
        // No color specified - should use default for 'go' type
      },
    ]);
    // Should use default go route color (routePass/routeGo)
    expect(svg).toContain('stroke="#f7b500"'); // Default yellow for 'go' type
  });
});

// ─── Player shape rendering ───────────────────────────────────────────────────

describe('renderPlayers — shapes', () => {
  it('renders circle for skill positions (default)', () => {
    const svg = renderPlayers([{ id: 'qb', label: 'QB', x: 300, y: 280, team: 'offense' }]);
    expect(svg).toContain('<circle');
    expect(svg).not.toContain('<rect');
    expect(svg).not.toContain('<polygon');
  });

  it('renders square (rect) for linemen by position label', () => {
    for (const label of ['LT', 'LG', 'C', 'RG', 'RT', 'DT', 'DE']) {
      const svg = renderPlayers([{ id: label, label, x: 200, y: 300, team: 'offense' }]);
      expect(svg).toContain('<rect');
    }
  });

  it('renders diamond (polygon) for safeties and specialists', () => {
    for (const label of ['FS', 'SS', 'K', 'P']) {
      const svg = renderPlayers([{ id: label, label, x: 300, y: 100, team: 'defense' }]);
      expect(svg).toContain('<polygon');
    }
  });

  it('respects explicit shape field over label inference', () => {
    const svgSquare = renderPlayers([
      { id: 'qb', label: 'QB', x: 300, y: 280, team: 'offense', shape: 'square' },
    ]);
    expect(svgSquare).toContain('<rect');
    expect(svgSquare).not.toContain('<circle');

    const svgDiamond = renderPlayers([
      { id: 'lt', label: 'LT', x: 200, y: 300, team: 'offense', shape: 'diamond' },
    ]);
    expect(svgDiamond).toContain('<polygon');
    expect(svgDiamond).not.toContain('<rect');
  });

  it('normalizes suffixed slot labels for player display', () => {
    const svg = renderPlayers([
      { id: 'sl1', label: 'SL1', x: 180, y: 280, team: 'offense' },
      { id: 'sl2', label: 'SL2', x: 220, y: 280, team: 'offense' },
    ]);

    expect(svg).toContain('>H<');
    expect(svg).toContain('>Y<');
    expect(svg).not.toContain('>SL1<');
    expect(svg).not.toContain('>SL2<');
  });
});

describe('renderAnnotationStrip', () => {
  it('normalizes suffixed slot tokens in route annotations', () => {
    const result = renderAnnotationStrip(
      [{ from: 'SL1', label: 'Seam', type: 'go', points: [[0, 0], [10, 10]] }],
      600,
      440
    );

    expect(result.svg).toContain('H: Seam');
    expect(result.svg).not.toContain('SL1: Seam');
  });

  it('adds enough strip height to avoid clipping the last row', () => {
    const result = renderAnnotationStrip(
      [
        { from: 'X', label: 'One', type: 'go', points: [[0, 0], [10, 10]] },
        { from: 'H', label: 'Two', type: 'go', points: [[0, 0], [10, 10]] },
        { from: 'Y', label: 'Three', type: 'go', points: [[0, 0], [10, 10]] },
        { from: 'Z', label: 'Four', type: 'go', points: [[0, 0], [10, 10]] },
      ],
      600,
      440
    );

    expect(result.height).toBe(92);
  });
});

// ─── Legend ───────────────────────────────────────────────────────────────────

describe('renderLegend', () => {
  it('returns empty string when no routes have a type', () => {
    const result = renderLegend(
      [
        {
          from: 'A',
          points: [
            [0, 0],
            [100, 100],
          ],
        },
      ],
      600,
      440
    );
    expect(result).toBe('');
  });

  it('renders legend bar when typed routes are present', () => {
    const routes = [
      {
        from: 'WR',
        type: 'go' as const,
        points: [
          [100, 300],
          [100, 100],
        ],
      },
      {
        from: 'TE',
        type: 'cut' as const,
        points: [
          [200, 300],
          [200, 200],
          [180, 150],
        ],
      },
    ];
    const svg = renderLegend(routes, 600, 440);
    expect(svg).toContain('Go');
    expect(svg).toContain('Cut');
    expect(svg).toContain('<rect'); // background bar
  });

  it('shows only types actually used in the diagram', () => {
    const routes = [
      {
        from: 'WR',
        type: 'fade' as const,
        points: [
          [100, 300],
          [100, 100],
        ],
      },
    ];
    const svg = renderLegend(routes, 600, 440);
    expect(svg).toContain('Fade');
    expect(svg).not.toContain('Go');
    expect(svg).not.toContain('Cut');
    expect(svg).not.toContain('Block');
  });

  it('positions the bar at the bottom of the field', () => {
    const routes = [
      {
        from: 'WR',
        type: 'go' as const,
        points: [
          [100, 300],
          [100, 100],
        ],
      },
    ];
    const svg = renderLegend(routes, 600, 440);
    // Bar should be at y = 440 - 24 = 416
    expect(svg).toContain('y="416"');
  });
});

// ─── Layer order in renderDiagramSvg ─────────────────────────────────────────

describe('renderDiagramSvg — layer order', () => {
  const LAYOUT: DiagramLayout = {
    sport: 'football',
    title: 'Test Play',
    fieldWidth: 600,
    fieldHeight: 440,
    losY: 300,
    players: [{ id: 'qb', label: 'QB', x: 300, y: 280, team: 'offense' }],
    routes: [
      {
        from: 'qb',
        type: 'go',
        points: [
          [300, 280],
          [300, 150],
        ],
      },
    ],
    zones: [{ id: 'z1', label: 'C2', x: 100, y: 80, width: 120, height: 60 }],
  };

  it('draws routes before players before zones', () => {
    const svg = renderDiagramSvg(LAYOUT, '<g id="field"/>');
    const routeIdx = svg.indexOf('class="route-layer"');
    const playerIdx = svg.indexOf('class="player-layer"');
    const zoneIdx = svg.indexOf('zone-overlays');
    expect(routeIdx).toBeGreaterThan(-1);
    expect(playerIdx).toBeGreaterThan(-1);
    expect(routeIdx).toBeLessThan(playerIdx);
    expect(zoneIdx).toBeGreaterThan(routeIdx);
  });

  it('does not render legend by default', () => {
    const svg = renderDiagramSvg(LAYOUT, '<g id="field"/>');
    expect(svg).not.toContain('>Go<');
  });

  it('renders legend when explicitly enabled', () => {
    const svg = renderDiagramSvg(LAYOUT, '<g id="field"/>', { showLegend: true });
    const titleIdx = svg.indexOf(LAYOUT.title);
    const legendIdx = svg.indexOf('>Go<');
    expect(legendIdx).toBeGreaterThan(titleIdx);
  });
});
