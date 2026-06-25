import type { DiagramLayout, DiagramRoute, DiagramRouteType } from './diagram.types.js';

export type FootballFormation = 'trips_right' | 'trips_left' | 'doubles' | 'ace';
export type FootballRole = 'X' | 'Z' | 'Y' | 'H' | 'RB' | 'TE';

export type FootballRouteConcept =
  | 'go'
  | 'seam'
  | 'fade'
  | 'post'
  | 'corner'
  | 'out'
  | 'dig'
  | 'flat'
  | 'curl'
  | 'slant'
  | 'cross'
  | 'wheel'
  | 'block';

export interface FootballRouteSpec {
  readonly from: FootballRole;
  readonly concept: FootballRouteConcept;
  readonly depth?: 'quick' | 'intermediate' | 'deep';
  readonly breakDirection?: 'left' | 'right' | 'inside' | 'outside';
  readonly label?: string;
}

export interface FootballSpec {
  readonly schema: 'football_spec_v1';
  readonly title: string;
  readonly formation: FootballFormation;
  readonly routes: readonly FootballRouteSpec[];
  readonly includeProtection?: boolean;
}

export interface FootballSpecValidationResult {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

const ROLE_SET = new Set<FootballRole>(['X', 'Z', 'Y', 'H', 'RB', 'TE']);
const ROUTE_SET = new Set<FootballRouteConcept>([
  'go',
  'seam',
  'fade',
  'post',
  'corner',
  'out',
  'dig',
  'flat',
  'curl',
  'slant',
  'cross',
  'wheel',
  'block',
]);
const FORMATION_SET = new Set<FootballFormation>(['trips_right', 'trips_left', 'doubles', 'ace']);

function cleanRawJson(raw: string): string {
  return raw
    .replace(/^```[a-z]*\n?/im, '')
    .replace(/\n?```$/im, '')
    .trim();
}

function normalizeFormation(value: unknown): FootballFormation | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'tripsright') return 'trips_right';
  if (normalized === 'tripsleft') return 'trips_left';
  if (FORMATION_SET.has(normalized as FootballFormation)) return normalized as FootballFormation;
  return null;
}

function normalizeDepth(value: unknown): FootballRouteSpec['depth'] {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'quick' || normalized === 'intermediate' || normalized === 'deep') {
    return normalized;
  }
  return undefined;
}

function normalizeBreakDirection(value: unknown): FootballRouteSpec['breakDirection'] {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'left' ||
    normalized === 'right' ||
    normalized === 'inside' ||
    normalized === 'outside'
  ) {
    return normalized;
  }
  return undefined;
}

function normalizeConcept(value: unknown): FootballRouteConcept | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (ROUTE_SET.has(normalized as FootballRouteConcept)) return normalized as FootballRouteConcept;
  return null;
}

function normalizeFrom(value: unknown): FootballRole | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (ROLE_SET.has(normalized as FootballRole)) return normalized as FootballRole;
  return null;
}

export function tryParseFootballSpec(raw: string): FootballSpec | null {
  const cleaned = cleanRawJson(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  const schema = typeof obj['schema'] === 'string' ? obj['schema'].trim().toLowerCase() : '';
  if (schema !== 'football_spec_v1') return null;

  const title = typeof obj['title'] === 'string' ? obj['title'].trim() : '';
  const formation = normalizeFormation(obj['formation']);
  const routesRaw = Array.isArray(obj['routes']) ? obj['routes'] : null;

  if (!title || !formation || !routesRaw || routesRaw.length === 0) return null;

  const routes: FootballRouteSpec[] = [];
  for (const item of routesRaw) {
    if (!item || typeof item !== 'object') return null;
    const routeObj = item as Record<string, unknown>;

    const from = normalizeFrom(routeObj['from']);
    const concept = normalizeConcept(routeObj['concept']);
    if (!from || !concept) return null;

    routes.push({
      from,
      concept,
      depth: normalizeDepth(routeObj['depth']),
      breakDirection: normalizeBreakDirection(routeObj['breakDirection']),
      label: typeof routeObj['label'] === 'string' ? routeObj['label'].trim() : undefined,
    });
  }

  return {
    schema: 'football_spec_v1',
    title,
    formation,
    routes,
    includeProtection: obj['includeProtection'] === true,
  };
}

export function validateFootballSpec(spec: FootballSpec): FootballSpecValidationResult {
  const issues: string[] = [];

  if (spec.title.trim().length < 3) {
    issues.push('title must be at least 3 characters');
  }

  if (spec.routes.length < 2) {
    issues.push('at least two route assignments are required');
  }

  const duplicateRoles = new Set<string>();
  const seenRoles = new Set<FootballRole>();
  let hasPrimaryOutsideRoute = false;

  for (const route of spec.routes) {
    if (seenRoles.has(route.from)) {
      duplicateRoles.add(route.from);
    }
    seenRoles.add(route.from);

    if (route.from === 'X' || route.from === 'Z') {
      hasPrimaryOutsideRoute = true;
    }
  }

  if (duplicateRoles.size > 0) {
    issues.push(`duplicate route assignments for roles: ${Array.from(duplicateRoles).join(', ')}`);
  }

  if (!hasPrimaryOutsideRoute) {
    issues.push('at least one outside receiver route (X or Z) is required');
  }

  if (spec.formation === 'ace' && spec.routes.some((route) => route.from === 'H')) {
    issues.push('ace formation cannot assign route from H (H is not on field)');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

function mapConceptToType(concept: FootballRouteConcept): DiagramRouteType {
  switch (concept) {
    case 'block':
      return 'block';
    case 'flat':
      return 'screen';
    case 'dig':
    case 'out':
    case 'slant':
    case 'cross':
      return 'cut';
    case 'wheel':
      return 'fade';
    case 'curl':
      return 'space';
    default:
      return 'go';
  }
}

function routeDepthPixels(
  depth: FootballRouteSpec['depth'],
  concept: FootballRouteConcept
): number {
  if (depth === 'deep') return 130;
  if (depth === 'intermediate') return 80;
  if (depth === 'quick') return 40;

  if (concept === 'go' || concept === 'seam' || concept === 'fade' || concept === 'post')
    return 130;
  if (concept === 'flat' || concept === 'slant') return 42;
  return 78;
}

function breakDirectionSign(route: FootballRouteSpec, originX: number): number {
  if (route.breakDirection === 'left') return -1;
  if (route.breakDirection === 'right') return 1;
  if (route.breakDirection === 'inside') return originX <= 300 ? 1 : -1;
  if (route.breakDirection === 'outside') return originX <= 300 ? -1 : 1;
  return originX <= 300 ? 1 : -1;
}

function makeRoutePoints(
  route: FootballRouteSpec,
  start: [number, number]
): Array<[number, number]> {
  const [startX, startY] = start;
  const depth = routeDepthPixels(route.depth, route.concept);
  const stemY = startY - depth;
  const dir = breakDirectionSign(route, startX);

  switch (route.concept) {
    case 'go':
    case 'seam':
    case 'fade':
      return [
        [startX, startY],
        [startX, stemY],
      ];
    case 'post':
      return [
        [startX, startY],
        [startX, stemY],
        [startX + dir * 60 * -1, stemY - 36],
      ];
    case 'corner':
      return [
        [startX, startY],
        [startX, stemY],
        [startX + dir * 60, stemY - 34],
      ];
    case 'out':
      return [
        [startX, startY],
        [startX, stemY],
        [startX + dir * 62, stemY],
      ];
    case 'dig':
      return [
        [startX, startY],
        [startX, stemY],
        [startX + dir * -70, stemY],
      ];
    case 'flat':
      return [
        [startX, startY],
        [startX + dir * 72, startY - 10],
      ];
    case 'curl':
      return [
        [startX, startY],
        [startX, stemY],
        [startX, stemY + 18],
      ];
    case 'slant':
      return [
        [startX, startY],
        [startX + dir * -46, stemY + 22],
      ];
    case 'cross':
      return [
        [startX, startY],
        [startX + dir * -120, stemY + 10],
      ];
    case 'wheel':
      return [
        [startX, startY],
        [startX + dir * 25, startY - 34],
        [startX + dir * 28, stemY],
      ];
    case 'block':
      return [
        [startX, startY],
        [startX + dir * 18, startY + 8],
      ];
    default:
      return [
        [startX, startY],
        [startX, stemY],
      ];
  }
}

function formationAnchors(formation: FootballFormation): Record<FootballRole, [number, number]> {
  const base: Record<FootballRole, [number, number]> = {
    X: [90, 300],
    Z: [510, 300],
    Y: [430, 300],
    H: [360, 300],
    RB: [280, 360],
    TE: [350, 300],
  };

  if (formation === 'trips_left') {
    return {
      ...base,
      X: [510, 300],
      Z: [90, 300],
      Y: [170, 300],
      H: [240, 300],
      TE: [210, 300],
    };
  }

  if (formation === 'doubles') {
    return {
      ...base,
      X: [110, 300],
      H: [180, 300],
      Y: [420, 300],
      Z: [490, 300],
      TE: [350, 300],
    };
  }

  if (formation === 'ace') {
    return {
      ...base,
      X: [115, 300],
      Z: [490, 300],
      Y: [365, 300],
      H: [300, 300],
      TE: [350, 300],
      RB: [280, 352],
    };
  }

  return base;
}

function buildOffensePlayers(spec: FootballSpec): DiagramLayout['players'] {
  const anchors = formationAnchors(spec.formation);

  const players: DiagramLayout['players'] = [
    { id: 'LT', label: 'LT', x: 220, y: 300, team: 'offense', shape: 'square' },
    { id: 'LG', label: 'LG', x: 250, y: 300, team: 'offense', shape: 'square' },
    { id: 'C', label: 'C', x: 280, y: 300, team: 'offense', shape: 'square' },
    { id: 'RG', label: 'RG', x: 310, y: 300, team: 'offense', shape: 'square' },
    { id: 'RT', label: 'RT', x: 340, y: 300, team: 'offense', shape: 'square' },
    { id: 'QB', label: 'QB', x: 280, y: 334, team: 'offense', shape: 'circle' },
    { id: 'X', label: 'X', x: anchors.X[0], y: anchors.X[1], team: 'offense', shape: 'circle' },
    { id: 'Y', label: 'Y', x: anchors.Y[0], y: anchors.Y[1], team: 'offense', shape: 'circle' },
    { id: 'Z', label: 'Z', x: anchors.Z[0], y: anchors.Z[1], team: 'offense', shape: 'circle' },
    {
      id: 'RB',
      label: 'RB',
      x: anchors.RB[0],
      y: anchors.RB[1],
      team: 'offense',
      shape: 'circle',
    },
  ];

  if (spec.formation !== 'ace') {
    players.push({
      id: 'H',
      label: 'H',
      x: anchors.H[0],
      y: anchors.H[1],
      team: 'offense',
      shape: 'circle',
    });
  }

  return players;
}

export function compileFootballSpecToLayout(spec: FootballSpec): DiagramLayout {
  const players = buildOffensePlayers(spec);
  const playerMap = new Map(players.map((player) => [player.id, player] as const));

  const routes: DiagramRoute[] = spec.routes
    .map((route): DiagramRoute | null => {
      const routeFrom = route.from === 'TE' ? 'Y' : route.from;
      const player = playerMap.get(routeFrom);
      if (!player) return null;

      const points = makeRoutePoints(route, [player.x, player.y]);
      return {
        from: routeFrom,
        points,
        label: route.label ?? route.concept.toUpperCase(),
        type: mapConceptToType(route.concept),
        curve: route.concept === 'fade' || route.concept === 'corner' || route.concept === 'wheel',
      };
    })
    .filter((route): route is DiagramRoute => route !== null);

  if (spec.includeProtection) {
    const protectionRoutes: DiagramRoute[] = ['LT', 'LG', 'C', 'RG', 'RT'].map((id, index) => {
      const player = playerMap.get(id)!;
      const direction = index < 2 ? -1 : index > 2 ? 1 : 0;
      return {
        from: id,
        label: `${id}: Protect`,
        type: 'block',
        points: [
          [player.x, player.y],
          [player.x + direction * 14, player.y + 9],
        ],
      };
    });
    routes.push(...protectionRoutes);
  }

  return {
    sport: 'football',
    title: spec.title,
    fieldWidth: 600,
    fieldHeight: 440,
    losY: 300,
    players,
    routes,
  };
}
