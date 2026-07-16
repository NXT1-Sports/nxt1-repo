import type { AgentXSelectedContext } from '@nxt1/core/ai';
import type {
  DiagramAssetKind,
  DiagramAssetSummary,
  DiagramFieldStyle,
  DiagramLayout,
  DiagramPlayer,
  DiagramRoute,
  DiagramRouteType,
  DiagramZone,
} from '@nxt1/core/ai';
import type { DiagramDefensiveShell } from './agent-x-diagrams-panel.types';

const DIAGRAM_GRID_SIZE = 4;
const SHELL_PLAYER_PREFIX = 'shell-defender-';
const SHELL_ZONE_PREFIX = 'shell-zone-';

interface ShellPlayerSlot {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
}

interface ShellZoneSlot {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function formatDiagramDate(value: number | null | undefined): string {
  if (!value) return 'Unknown';

  try {
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return 'Unknown';
  }
}

export function getDiagramKindLabel(kind: DiagramAssetKind): string {
  return kind === 'sport_drill' ? 'Drill' : 'Play / Formation';
}

export function getDiagramKindTone(kind: DiagramAssetKind): string {
  return kind === 'sport_drill' ? 'drill' : 'play';
}

export function matchesDiagramQuery(diagram: DiagramAssetSummary, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return [diagram.title, diagram.description, diagram.sport, diagram.kind]
    .join(' ')
    .toLowerCase()
    .includes(normalized);
}

export function buildDiagramDragContext(diagram: DiagramAssetSummary): AgentXSelectedContext {
  return {
    id: diagram.id,
    kind: 'custom',
    title: diagram.title,
    summary: diagram.description,
    source: {
      type: 'agent_x',
      id: diagram.id,
      label: 'Diagram Asset',
    },
    media: {
      imageUrl: diagram.imageUrl,
      thumbnailUrl: diagram.imageUrl,
    },
    metadata: {
      diagramId: diagram.id,
      kind: diagram.kind,
      sport: diagram.sport,
      createdAt: diagram.createdAt,
      updatedAt: diagram.updatedAt,
    },
  };
}

export function cloneDiagramLayout(layout: DiagramLayout): DiagramLayout {
  return {
    ...layout,
    fieldStyle: layout.fieldStyle ?? 'classic',
    players: layout.players.map((player) => ({ ...player })),
    routes: layout.routes.map((route, index) => ({
      ...route,
      id: route.id ?? createRouteId(index + 1),
      points: route.points.map(([x, y]) => [x, y] as const),
    })),
    zones: layout.zones?.map((zone) => ({ ...zone })) ?? [],
  };
}

export function createRouteId(index: number): string {
  return `route-${index}`;
}

export function createZoneId(index: number): string {
  return `zone-${index}`;
}

export function getPlayerById(
  layout: DiagramLayout | null,
  id: string | null
): DiagramPlayer | null {
  if (!layout || !id) return null;
  return layout.players.find((player) => player.id === id) ?? null;
}

export function getRouteById(layout: DiagramLayout | null, id: string | null): DiagramRoute | null {
  if (!layout || !id) return null;
  return (
    layout.routes.find((route, index) => (route.id ?? createRouteId(index + 1)) === id) ?? null
  );
}

export function getZoneById(layout: DiagramLayout | null, id: string | null): DiagramZone | null {
  if (!layout || !id) return null;
  return layout.zones?.find((zone) => zone.id === id) ?? null;
}

export function buildSvgPath(points: ReadonlyArray<readonly [number, number]>): string {
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x},${y}`).join(' ');
}

export function getRouteColor(type: DiagramRouteType | undefined, color?: string): string {
  if (color) return color;
  switch (type) {
    case 'block':
      return '#6f7680';
    case 'screen':
      return '#40cfff';
    case 'cut':
      return '#ff7a1a';
    case 'space':
      return '#68e65f';
    case 'pick':
      return '#c86bff';
    case 'fade':
      return '#f2f4f7';
    default:
      return '#ffd447';
  }
}

export function getFieldPalette(style: DiagramFieldStyle | undefined, sport: string) {
  const normalized = style ?? 'classic';
  if (sport === 'football' && normalized === 'classic') {
    return {
      background: '#ffffff',
      stripe: '#ffffff',
      line: 'rgba(31, 41, 55, 0.18)',
    };
  }
  if (normalized === 'modern') {
    if (sport === 'basketball') {
      return { background: '#c8933a', stripe: '#b07d2e', line: 'rgba(255,255,255,0.75)' };
    }
    if (sport === 'soccer') {
      return { background: '#3f8756', stripe: '#4a9561', line: 'rgba(255,255,255,0.75)' };
    }
    if (sport === 'baseball' || sport === 'softball') {
      return { background: '#4f8f58', stripe: '#5b9b63', line: 'rgba(255,255,255,0.75)' };
    }
    return { background: '#3d6b4a', stripe: '#527d5e', line: 'rgba(255,255,255,0.7)' };
  }
  if (normalized === 'blueprint') {
    return { background: '#123b67', stripe: '#1b4f87', line: 'rgba(186,230,253,0.85)' };
  }
  if (normalized === 'night') {
    return { background: '#173626', stripe: '#234731', line: 'rgba(255,255,255,0.72)' };
  }
  if (normalized === 'chalk') {
    return { background: '#2a2a2a', stripe: '#363636', line: 'rgba(255,255,255,0.45)' };
  }
  if (sport === 'basketball') {
    return { background: '#c8933a', stripe: '#b07d2e', line: 'rgba(255,255,255,0.75)' };
  }
  if (sport === 'soccer') {
    return { background: '#3f8756', stripe: '#4a9561', line: 'rgba(255,255,255,0.75)' };
  }
  if (sport === 'baseball' || sport === 'softball') {
    return { background: '#4f8f58', stripe: '#5b9b63', line: 'rgba(255,255,255,0.75)' };
  }
  return { background: '#3d6b4a', stripe: '#527d5e', line: 'rgba(255,255,255,0.7)' };
}

export function snapDiagramLayoutToGrid(
  layout: DiagramLayout,
  gridSize = DIAGRAM_GRID_SIZE
): DiagramLayout {
  return {
    ...layout,
    players: layout.players.map((player) => ({
      ...player,
      x: clamp(snapValue(player.x, gridSize), 10, layout.fieldWidth - 10),
      y: clamp(snapValue(player.y, gridSize), 10, layout.fieldHeight - 10),
    })),
    routes: layout.routes.map((route) => ({
      ...route,
      points: normalizeRoutePoints(route.points, layout, route.curve === true, gridSize),
    })),
    zones:
      layout.zones?.map((zone) => ({
        ...zone,
        x: clamp(snapValue(zone.x, gridSize), 0, layout.fieldWidth - zone.width),
        y: clamp(snapValue(zone.y, gridSize), 0, layout.fieldHeight - zone.height),
        width: Math.max(gridSize * 2, snapValue(zone.width, gridSize)),
        height: Math.max(gridSize * 2, snapValue(zone.height, gridSize)),
      })) ?? [],
  };
}

export function relievePlayerOverlap(layout: DiagramLayout, minimumDistance = 26): DiagramLayout {
  const players = layout.players.map((player) => ({ ...player }));
  const routeOffsets = new Map<string, { dx: number; dy: number }>();

  for (let pass = 0; pass < 4; pass += 1) {
    let adjusted = false;

    for (let leftIndex = 0; leftIndex < players.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < players.length; rightIndex += 1) {
        const left = players[leftIndex];
        const right = players[rightIndex];
        let dx = right.x - left.x;
        let dy = right.y - left.y;
        let distance = Math.hypot(dx, dy);

        if (distance >= minimumDistance) continue;

        if (distance < 0.001) {
          dx = leftIndex % 2 === 0 ? 1 : -1;
          dy = rightIndex % 2 === 0 ? 1 : -1;
          distance = Math.hypot(dx, dy);
        }

        const pushDistance = (minimumDistance - distance) / 2;
        const unitX = dx / distance;
        const unitY = dy / distance;

        const nextLeftX = clamp(left.x - unitX * pushDistance, 10, layout.fieldWidth - 10);
        const nextLeftY = clamp(left.y - unitY * pushDistance, 10, layout.fieldHeight - 10);
        const nextRightX = clamp(right.x + unitX * pushDistance, 10, layout.fieldWidth - 10);
        const nextRightY = clamp(right.y + unitY * pushDistance, 10, layout.fieldHeight - 10);

        if (
          nextLeftX === left.x &&
          nextLeftY === left.y &&
          nextRightX === right.x &&
          nextRightY === right.y
        ) {
          continue;
        }

        accumulateOffset(routeOffsets, left.id, nextLeftX - left.x, nextLeftY - left.y);
        accumulateOffset(routeOffsets, right.id, nextRightX - right.x, nextRightY - right.y);

        players[leftIndex] = { ...left, x: nextLeftX, y: nextLeftY };
        players[rightIndex] = { ...right, x: nextRightX, y: nextRightY };
        adjusted = true;
      }
    }

    if (!adjusted) break;
  }

  if (routeOffsets.size === 0) {
    return { ...layout, players };
  }

  return {
    ...layout,
    players,
    routes: layout.routes.map((route) => {
      const offset = routeOffsets.get(route.from);
      if (!offset) return route;
      return {
        ...route,
        points: route.points.map((point, index) =>
          index === 0
            ? [
                clamp(point[0] + offset.dx, 5, layout.fieldWidth - 5),
                clamp(point[1] + offset.dy, 5, layout.fieldHeight - 5),
              ]
            : point
        ),
      };
    }),
  };
}

export function applyFootballDefensiveShell(
  layout: DiagramLayout,
  shell: DiagramDefensiveShell
): DiagramLayout {
  if (layout.sport !== 'football') return layout;

  const shellPlayers = buildShellPlayers(layout, shell);
  const shellZones = buildShellZones(layout, shell);

  return {
    ...layout,
    players: [
      ...layout.players.filter((player) => !player.id.startsWith(SHELL_PLAYER_PREFIX)),
      ...shellPlayers,
    ],
    routes: layout.routes.filter((route) => !route.from.startsWith(SHELL_PLAYER_PREFIX)),
    zones: [
      ...(layout.zones ?? []).filter((zone) => !zone.id.startsWith(SHELL_ZONE_PREFIX)),
      ...shellZones,
    ],
  };
}

export function removeFootballDefensiveShell(layout: DiagramLayout): DiagramLayout {
  return {
    ...layout,
    players: layout.players.filter((player) => !player.id.startsWith(SHELL_PLAYER_PREFIX)),
    routes: layout.routes.filter((route) => !route.from.startsWith(SHELL_PLAYER_PREFIX)),
    zones: (layout.zones ?? []).filter((zone) => !zone.id.startsWith(SHELL_ZONE_PREFIX)),
  };
}

function normalizeRoutePoints(
  points: ReadonlyArray<readonly [number, number]>,
  layout: DiagramLayout,
  preserveCurve: boolean,
  gridSize: number
): ReadonlyArray<readonly [number, number]> {
  if (points.length === 0) return points;

  const snappedPoints: Array<readonly [number, number]> = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    if (index === 0 || preserveCurve) {
      snappedPoints.push([
        clamp(snapValue(current[0], gridSize), 5, layout.fieldWidth - 5),
        clamp(snapValue(current[1], gridSize), 5, layout.fieldHeight - 5),
      ]);
      continue;
    }

    const previous = snappedPoints[index - 1];
    const targetX = clamp(snapValue(current[0], gridSize), 5, layout.fieldWidth - 5);
    const targetY = clamp(snapValue(current[1], gridSize), 5, layout.fieldHeight - 5);
    const dx = targetX - previous[0];
    const dy = targetY - previous[1];
    const length = Math.hypot(dx, dy);

    if (length < gridSize / 2) {
      snappedPoints.push([targetX, targetY]);
      continue;
    }

    const snappedAngle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const nextX = clamp(
      snapValue(previous[0] + Math.cos(snappedAngle) * length, gridSize),
      5,
      layout.fieldWidth - 5
    );
    const nextY = clamp(
      snapValue(previous[1] + Math.sin(snappedAngle) * length, gridSize),
      5,
      layout.fieldHeight - 5
    );

    snappedPoints.push([nextX, nextY]);
  }

  return snappedPoints;
}

function buildShellPlayers(
  layout: DiagramLayout,
  shell: DiagramDefensiveShell
): ReadonlyArray<DiagramPlayer> {
  return getShellPlayerSlots(layout, shell).map((slot) => ({
    id: `${SHELL_PLAYER_PREFIX}${slot.id}`,
    label: slot.label,
    x: slot.x,
    y: slot.y,
    team: 'defense',
    shape: 'circle',
  }));
}

function buildShellZones(
  layout: DiagramLayout,
  shell: DiagramDefensiveShell
): ReadonlyArray<DiagramZone> {
  return getShellZoneSlots(layout, shell).map((zone) => ({
    id: `${SHELL_ZONE_PREFIX}${zone.id}`,
    label: zone.label,
    x: zone.x,
    y: zone.y,
    width: zone.width,
    height: zone.height,
    shape: 'ellipse',
    team: 'defense',
  }));
}

function getShellPlayerSlots(
  layout: DiagramLayout,
  shell: DiagramDefensiveShell
): ReadonlyArray<ShellPlayerSlot> {
  const middleX = layout.fieldWidth / 2;
  const deepY = Math.max(48, layout.losY - 164);
  const midY = Math.max(58, layout.losY - 112);
  const flatY = Math.max(72, layout.losY - 68);
  const cornerSpread = Math.min(188, layout.fieldWidth * 0.31);
  const safetySpread = Math.min(102, layout.fieldWidth * 0.17);
  const hookSpread = Math.min(92, layout.fieldWidth * 0.15);

  if (shell === 'cover2') {
    return [
      { id: 'cb-left', label: 'CB', x: middleX - cornerSpread, y: flatY },
      { id: 'cb-right', label: 'CB', x: middleX + cornerSpread, y: flatY },
      { id: 's-left', label: 'S', x: middleX - safetySpread, y: deepY },
      { id: 's-right', label: 'S', x: middleX + safetySpread, y: deepY },
      { id: 'olb-left', label: 'OLB', x: middleX - hookSpread, y: midY },
      { id: 'mlb', label: 'MLB', x: middleX, y: midY + 8 },
      { id: 'olb-right', label: 'OLB', x: middleX + hookSpread, y: midY },
    ];
  }

  if (shell === 'quarters') {
    return [
      { id: 'cb-left', label: 'CB', x: middleX - cornerSpread, y: deepY + 4 },
      { id: 'ss-left', label: 'S', x: middleX - safetySpread, y: deepY },
      { id: 'fs-right', label: 'S', x: middleX + safetySpread, y: deepY },
      { id: 'cb-right', label: 'CB', x: middleX + cornerSpread, y: deepY + 4 },
      { id: 'olb-left', label: 'OLB', x: middleX - hookSpread, y: midY },
      { id: 'mlb', label: 'MLB', x: middleX, y: midY + 10 },
      { id: 'olb-right', label: 'OLB', x: middleX + hookSpread, y: midY },
    ];
  }

  return [
    { id: 'cb-left', label: 'CB', x: middleX - cornerSpread, y: flatY },
    { id: 'cb-right', label: 'CB', x: middleX + cornerSpread, y: flatY },
    { id: 'fs', label: 'FS', x: middleX, y: deepY },
    { id: 'curl-left', label: 'OLB', x: middleX - hookSpread, y: midY },
    { id: 'hook', label: 'MLB', x: middleX, y: midY + 12 },
    { id: 'curl-right', label: 'OLB', x: middleX + hookSpread, y: midY },
    { id: 'flat', label: 'N', x: middleX + Math.min(146, layout.fieldWidth * 0.24), y: flatY + 12 },
  ];
}

function getShellZoneSlots(
  layout: DiagramLayout,
  shell: DiagramDefensiveShell
): ReadonlyArray<ShellZoneSlot> {
  const middleX = layout.fieldWidth / 2;
  const topY = Math.max(24, layout.losY - 208);
  const midY = Math.max(56, layout.losY - 132);

  if (shell === 'cover2') {
    return [
      {
        id: 'deep-half-left',
        label: 'Deep 1/2',
        x: 28,
        y: topY,
        width: middleX - 40,
        height: 96,
      },
      {
        id: 'deep-half-right',
        label: 'Deep 1/2',
        x: middleX + 12,
        y: topY,
        width: layout.fieldWidth - middleX - 40,
        height: 96,
      },
    ];
  }

  if (shell === 'quarters') {
    return [
      { id: 'quarter-left-out', label: '1/4', x: 24, y: topY, width: 92, height: 92 },
      {
        id: 'quarter-left-in',
        label: '1/4',
        x: middleX - 116,
        y: topY,
        width: 92,
        height: 92,
      },
      {
        id: 'quarter-right-in',
        label: '1/4',
        x: middleX + 24,
        y: topY,
        width: 92,
        height: 92,
      },
      {
        id: 'quarter-right-out',
        label: '1/4',
        x: layout.fieldWidth - 116,
        y: topY,
        width: 92,
        height: 92,
      },
    ];
  }

  return [
    { id: 'deep-third-left', label: 'Deep 1/3', x: 18, y: topY, width: 118, height: 98 },
    {
      id: 'deep-third-middle',
      label: 'Deep 1/3',
      x: middleX - 72,
      y: topY - 8,
      width: 144,
      height: 112,
    },
    {
      id: 'deep-third-right',
      label: 'Deep 1/3',
      x: layout.fieldWidth - 136,
      y: topY,
      width: 118,
      height: 98,
    },
    {
      id: 'hook-flat-left',
      label: 'Curl/Flat',
      x: 42,
      y: midY,
      width: 108,
      height: 82,
    },
    {
      id: 'hook-middle',
      label: 'Hook',
      x: middleX - 76,
      y: midY + 10,
      width: 152,
      height: 72,
    },
    {
      id: 'hook-flat-right',
      label: 'Curl/Flat',
      x: layout.fieldWidth - 150,
      y: midY,
      width: 108,
      height: 82,
    },
  ];
}

function accumulateOffset(
  map: Map<string, { dx: number; dy: number }>,
  id: string,
  dx: number,
  dy: number
): void {
  const existing = map.get(id) ?? { dx: 0, dy: 0 };
  map.set(id, { dx: existing.dx + dx, dy: existing.dy + dy });
}

function snapValue(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
