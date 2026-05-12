import { describe, it, expect } from 'vitest';
import type { DiagramRoute } from '../shared/diagram.types.js';
import { renderRoutes, renderDefs } from '../shared/svg-helpers.js';

describe('play diagram route types', () => {
  it('renders different route type markers in SVG defs', () => {
    const defs = renderDefs();

    // Verify all route type markers exist
    expect(defs).toContain('id="arr"'); // go (default)
    expect(defs).toContain('id="arr-block"'); // block
    expect(defs).toContain('id="arr-screen"'); // screen
    expect(defs).toContain('id="arr-pick"'); // pick
    expect(defs).toContain('id="arr-cut"'); // cut
    expect(defs).toContain('id="arr-drag"'); // drag
    expect(defs).toContain('id="arr-space"'); // space
    expect(defs).toContain('id="arr-fade"'); // fade
  });

  it('renders screen routes with screen marker and thicker stroke', () => {
    const routes: DiagramRoute[] = [
      {
        from: 'WR',
        points: [
          [100, 100],
          [150, 200],
        ],
        label: 'Screen',
        type: 'screen',
      },
    ];

    const svg = renderRoutes(routes);

    // Screen routes should use screen marker and have specific stroke width
    expect(svg).toContain('marker-end="url(#arr-screen)"');
    expect(svg).toContain('stroke-width="3"');
  });

  it('renders pick routes with pick marker', () => {
    const routes: DiagramRoute[] = [
      {
        from: 'C',
        points: [
          [280, 150],
          [300, 120],
        ],
        label: 'Pick',
        type: 'pick',
      },
    ];

    const svg = renderRoutes(routes);

    expect(svg).toContain('marker-end="url(#arr-pick)"');
    expect(svg).toContain('stroke-width="2.8"');
  });

  it('renders block routes with heavier stroke and block marker', () => {
    const routes: DiagramRoute[] = [
      {
        from: 'OL',
        points: [
          [250, 300],
          [280, 260],
        ],
        label: 'Block',
        type: 'block',
      },
    ];

    const svg = renderRoutes(routes);

    expect(svg).toContain('marker-end="url(#arr-block)"');
    expect(svg).toContain('stroke-width="4"'); // Thickest
  });

  it('renders cut routes with sharp angle marker', () => {
    const routes: DiagramRoute[] = [
      {
        from: 'RB',
        points: [
          [350, 280],
          [280, 240],
        ],
        label: 'Cut',
        type: 'cut',
      },
    ];

    const svg = renderRoutes(routes);

    expect(svg).toContain('marker-end="url(#arr-cut)"');
  });

  it('renders drag routes with dashed line and drag marker', () => {
    const routes: DiagramRoute[] = [
      {
        from: 'RB',
        points: [
          [350, 280],
          [250, 300],
        ],
        label: 'Drag',
        type: 'drag',
      },
    ];

    const svg = renderRoutes(routes);

    expect(svg).toContain('marker-end="url(#arr-drag)"');
    expect(svg).toContain('stroke-dasharray="4,2"'); // Dashed pattern
    expect(svg).toContain('stroke-width="2.2"');
  });

  it('renders space routes as thin dashed lines', () => {
    const routes: DiagramRoute[] = [
      {
        from: 'WR',
        points: [
          [60, 295],
          [120, 180],
        ],
        label: 'Space',
        type: 'space',
      },
    ];

    const svg = renderRoutes(routes);

    expect(svg).toContain('marker-end="url(#arr-space)"');
    expect(svg).toContain('stroke-dasharray="3,3"'); // Thinner dashed
    expect(svg).toContain('stroke-width="1.8"'); // Thinnest
    expect(svg).toContain('opacity="0.7"'); // More transparent
  });

  it('renders fade routes with reduced opacity', () => {
    const routes: DiagramRoute[] = [
      {
        from: 'WR',
        points: [
          [60, 295],
          [60, 80],
        ],
        label: 'Fade',
        type: 'fade',
      },
    ];

    const svg = renderRoutes(routes);

    expect(svg).toContain('marker-end="url(#arr-fade)"');
    expect(svg).toContain('opacity="0.6"'); // Most transparent
  });

  it('renders go routes (default) with standard arrow and medium stroke', () => {
    const routes: DiagramRoute[] = [
      {
        from: 'WR',
        points: [
          [60, 295],
          [60, 80],
        ],
        label: 'Vert',
        type: 'go',
      },
    ];

    const svg = renderRoutes(routes);

    expect(svg).toContain('marker-end="url(#arr)"'); // Standard arrow
    expect(svg).toContain('stroke-width="2.5"'); // Standard width
    expect(svg).toContain('opacity="0.92"'); // Standard opacity
  });

  it('renders unknown type as default go route', () => {
    const routes: DiagramRoute[] = [
      {
        from: 'WR',
        points: [
          [60, 295],
          [60, 80],
        ],
        label: 'Unknown',
        type: 'unknown' as unknown as DiagramRoute['type'],
      },
    ];

    const svg = renderRoutes(routes);

    // Falls back to standard arrow
    expect(svg).toContain('marker-end="url(#arr)"');
    expect(svg).toContain('stroke-width="2.5"');
  });

  it('renders route without type as default go route', () => {
    const routes: DiagramRoute[] = [
      {
        from: 'WR',
        points: [
          [60, 295],
          [60, 80],
        ],
        label: 'Regular',
        // type undefined
      },
    ];

    const svg = renderRoutes(routes);

    expect(svg).toContain('marker-end="url(#arr)"'); // Standard arrow
    expect(svg).toContain('stroke-width="2.5"');
  });

  it('preserves route labels for all route types', () => {
    const routes: DiagramRoute[] = [
      {
        from: 'WR1',
        points: [
          [60, 295],
          [60, 80],
        ],
        label: 'Route1',
        type: 'screen',
      },
      {
        from: 'WR2',
        points: [
          [540, 295],
          [540, 80],
        ],
        label: 'Route2',
        type: 'pick',
      },
      {
        from: 'RB',
        points: [
          [280, 330],
          [200, 250],
        ],
        label: 'Route3',
        type: 'drag',
      },
    ];

    const svg = renderRoutes(routes);

    expect(svg).toContain('>Route1<');
    expect(svg).toContain('>Route2<');
    expect(svg).toContain('>Route3<');
  });
});
