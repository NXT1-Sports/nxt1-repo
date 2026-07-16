import { describe, expect, it } from 'vitest';
import { getSportRenderer } from '../../renderers/index.js';
import { renderDiagramSvg } from '../svg-helpers.js';
import type { DiagramLayout } from '../diagram.types.js';

describe('renderDiagramSvg baseline', () => {
  it('matches football baseline snapshot for a canonical flood concept', () => {
    const layout: DiagramLayout = {
      sport: 'football',
      title: 'Trips Right Flood',
      fieldWidth: 600,
      fieldHeight: 440,
      losY: 300,
      players: [
        { id: 'lt', label: 'LT', x: 220, y: 300, team: 'offense', shape: 'square' },
        { id: 'lg', label: 'LG', x: 250, y: 300, team: 'offense', shape: 'square' },
        { id: 'c', label: 'C', x: 280, y: 300, team: 'offense', shape: 'square' },
        { id: 'rg', label: 'RG', x: 310, y: 300, team: 'offense', shape: 'square' },
        { id: 'rt', label: 'RT', x: 340, y: 300, team: 'offense', shape: 'square' },
        { id: 'qb', label: 'QB', x: 280, y: 335, team: 'offense', shape: 'circle' },
        { id: 'x', label: 'X', x: 120, y: 300, team: 'offense', shape: 'circle' },
        { id: 'y', label: 'Y', x: 420, y: 300, team: 'offense', shape: 'circle' },
        { id: 'z', label: 'Z', x: 470, y: 300, team: 'offense', shape: 'circle' },
      ],
      routes: [
        {
          from: 'x',
          points: [
            [120, 300],
            [120, 180],
            [170, 130],
          ],
          label: 'Corner',
          type: 'fade',
          curve: true,
          color: '#ff3333',
        },
        {
          from: 'y',
          points: [
            [420, 300],
            [420, 200],
            [360, 200],
          ],
          label: 'Out',
          type: 'cut',
          curve: false,
          color: '#ffdd00',
        },
        {
          from: 'z',
          points: [
            [470, 300],
            [470, 230],
            [430, 190],
            [380, 150],
          ],
          label: 'Sail',
          type: 'go',
          curve: true,
          color: '#00ff00',
        },
      ],
    };

    const renderer = getSportRenderer(layout.sport);
    const fieldSvg = renderer.renderField(layout);
    const svg = renderDiagramSvg(layout, fieldSvg, {
      kind: 'sport_play',
      showLegend: true,
      showTitleBar: true,
      teamFocus: 'offense',
    });

    expect(svg).toMatchSnapshot();
  });
});
