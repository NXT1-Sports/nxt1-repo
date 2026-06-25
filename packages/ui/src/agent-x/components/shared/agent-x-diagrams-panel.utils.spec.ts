import { describe, expect, it } from 'vitest';
import type { DiagramLayout } from '@nxt1/core/ai';
import {
  applyFootballDefensiveShell,
  relievePlayerOverlap,
  removeFootballDefensiveShell,
  snapDiagramLayoutToGrid,
} from './agent-x-diagrams-panel.utils';

function buildLayout(overrides?: Partial<DiagramLayout>): DiagramLayout {
  return {
    sport: 'football',
    title: 'Test Diagram',
    fieldWidth: 400,
    fieldHeight: 240,
    losY: 180,
    fieldStyle: 'night',
    players: [
      { id: 'qb', label: 'QB', x: 200, y: 176, team: 'offense', shape: 'circle' },
      { id: 'wr', label: 'WR', x: 280, y: 164, team: 'offense', shape: 'circle' },
    ],
    routes: [
      {
        id: 'route-1',
        from: 'wr',
        points: [
          [281, 165],
          [318, 117],
        ],
        type: 'go',
      },
    ],
    zones: [],
    ...overrides,
  };
}

describe('agent-x-diagrams-panel spatial helpers', () => {
  it('snaps players and line segments to the design grid', () => {
    const layout = buildLayout({
      players: [{ id: 'wr', label: 'WR', x: 281, y: 165, team: 'offense', shape: 'circle' }],
      routes: [
        {
          id: 'route-1',
          from: 'wr',
          points: [
            [281, 165],
            [318, 117],
          ],
          type: 'go',
        },
      ],
    });

    const snapped = snapDiagramLayoutToGrid(layout);
    const snappedEnd = snapped.routes[0]?.points[1];

    expect(snapped.players[0]).toMatchObject({ x: 280, y: 164 });
    expect(snapped.routes[0]?.points[0]).toEqual([280, 164]);
    expect(snappedEnd).toBeDefined();
    expect(snappedEnd?.[0] % 4).toBe(0);
    expect(snappedEnd?.[1] % 4).toBe(0);
    expect(Math.abs((snappedEnd?.[0] ?? 0) - 280)).toEqual(Math.abs((snappedEnd?.[1] ?? 0) - 164));
  });

  it('separates overlapping players and carries their route origins with them', () => {
    const layout = buildLayout({
      players: [
        { id: 'left', label: 'L', x: 200, y: 160, team: 'offense', shape: 'circle' },
        { id: 'right', label: 'R', x: 202, y: 160, team: 'offense', shape: 'circle' },
      ],
      routes: [
        {
          id: 'route-1',
          from: 'right',
          points: [
            [202, 160],
            [202, 108],
          ],
          type: 'go',
        },
      ],
    });

    const separated = relievePlayerOverlap(layout, 26);
    const [left, right] = separated.players;

    expect(Math.hypot(right.x - left.x, right.y - left.y)).toBeGreaterThanOrEqual(26);
    expect(separated.routes[0]?.points[0]).toEqual([right.x, right.y]);
  });

  it('applies and clears football shell overlays without disturbing offense players', () => {
    const layout = buildLayout();

    const withShell = applyFootballDefensiveShell(layout, 'cover3');
    const cleared = removeFootballDefensiveShell(withShell);

    expect(
      withShell.players.filter((player) => player.id.startsWith('shell-defender-'))
    ).toHaveLength(7);
    expect(withShell.zones?.some((zone) => zone.id.startsWith('shell-zone-'))).toBe(true);
    expect(cleared.players).toEqual(layout.players);
    expect(cleared.zones).toEqual([]);
  });
});
