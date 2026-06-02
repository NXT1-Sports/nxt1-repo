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
      return '#444444';
    case 'screen':
      return '#00b7ff';
    case 'cut':
      return '#ff6f00';
    case 'space':
      return '#4caf50';
    case 'pick':
      return '#a259f7';
    case 'fade':
      return '#bdbdbd';
    default:
      return '#f7b500';
  }
}

export function getFieldPalette(style: DiagramFieldStyle | undefined, sport: string) {
  const normalized = style ?? 'classic';
  if (normalized === 'blueprint') {
    return { background: '#123b67', stripe: '#1b4f87', line: 'rgba(186,230,253,0.85)' };
  }
  if (normalized === 'night') {
    return { background: '#203f2d', stripe: '#2e5a41', line: 'rgba(255,255,255,0.6)' };
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
