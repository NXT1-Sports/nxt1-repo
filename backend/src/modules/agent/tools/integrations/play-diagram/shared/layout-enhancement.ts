import type {
  DiagramLayout,
  DiagramPlayerShape,
  DiagramRoute,
  DiagramRouteType,
} from './diagram.types.js';
import { getConceptEnhancers } from '../concepts/index.js';

// Route type coercion

const ROUTE_TYPE_SET = new Set<string>([
  'screen',
  'pick',
  'block',
  'cut',
  'drag',
  'space',
  'go',
  'fade',
]);

export function coerceRouteType(value: unknown): DiagramRouteType | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return ROUTE_TYPE_SET.has(normalized) ? (normalized as DiagramRouteType) : undefined;
}

const PLAYER_SHAPE_SET = new Set<string>(['circle', 'square', 'diamond']);

export function coercePlayerShape(value: unknown): DiagramPlayerShape | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return PLAYER_SHAPE_SET.has(normalized) ? (normalized as DiagramPlayerShape) : undefined;
}

// Label-based route type inference

function inferRouteTypeFromLabel(label: string | undefined): DiagramRouteType {
  const text = (label ?? '').toLowerCase();

  if (/(screen|bubble|swing pass)/.test(text)) return 'screen';
  if (/(pick|rub|stunt pick)/.test(text)) return 'pick';
  if (/(block|chip|jam|press|rush)/.test(text)) return 'block';
  if (/(drag|cross|shallow|spy|buzz|flow)/.test(text)) return 'drag';
  if (/(fade|bail|pedal|deep)/.test(text)) return 'fade';
  if (/(flat|hook|curl|zone|drop|half|cloud|sink|seam|middle|robber)/.test(text)) return 'space';
  if (/(cut|break|slant|out|in|post|corner|dig|stick)/.test(text)) return 'cut';

  return 'go';
}

function withInferredRouteTypes(layout: DiagramLayout): DiagramLayout {
  const routes = layout.routes.map(
    (route): DiagramRoute => ({
      ...route,
      type: route.type ?? inferRouteTypeFromLabel(route.label),
    })
  );
  return { ...layout, routes };
}

function isRushLikeDefensiveRoute(route: DiagramRoute): boolean {
  const label = (route.label ?? '').toLowerCase();
  if (route.type === 'block') return true;
  return /(rush|blitz|penetrat|gap|stunt|attack|pressure|sack|contain|fill)/.test(label);
}

function normalizeFootballDefensiveRushDirection(layout: DiagramLayout): DiagramLayout {
  if (layout.sport !== 'football') return layout;

  const playersById = new Map(layout.players.map((p) => [p.id, p] as const));
  const minY = 10;
  const maxY = Math.max(minY, layout.fieldHeight - 10);

  const routes = layout.routes.map((route): DiagramRoute => {
    const player = playersById.get(route.from);
    if (!player || player.team !== 'defense') return route;
    if (!isRushLikeDefensiveRoute(route)) return route;
    if (!route.points?.length) return route;

    const points = [...route.points];
    const start = points[0];
    if (!start) return route;

    const minAttackY = Math.min(maxY, Math.max(start[1] + 18, layout.losY + 8));

    if (points.length >= 2) {
      const firstStep = points[1];
      if (firstStep && firstStep[1] < minAttackY) {
        points[1] = [firstStep[0], minAttackY];
      }
    }

    const lastIndex = points.length - 1;
    const last = points[lastIndex];
    if (last && last[1] < minAttackY) {
      points[lastIndex] = [last[0], minAttackY];
    }

    const clamped = points.map(
      ([x, y]) => [x, Math.max(minY, Math.min(maxY, y))] as [number, number]
    );
    return { ...route, points: clamped };
  });

  return { ...layout, routes };
}

function getFootballBackfieldDepth(conceptText: string): { qbDepth: number; rbDepth: number } {
  const concept = conceptText.toLowerCase();

  if (/(under center|i-formation|i formation|singleback|goal line|qb sneak)/.test(concept)) {
    return { qbDepth: 18, rbDepth: 44 };
  }

  if (/(shotgun|\bgun\b|pistol|empty)/.test(concept)) {
    return { qbDepth: 42, rbDepth: 62 };
  }

  return { qbDepth: 38, rbDepth: 58 };
}

function normalizeFootballOffenseAlignment(
  layout: DiagramLayout,
  conceptText: string
): DiagramLayout {
  if (layout.sport !== 'football') return layout;

  const { qbDepth, rbDepth } = getFootballBackfieldDepth(conceptText);

  const lineXByLabel: Record<string, number> = {
    lt: 210,
    lg: 245,
    c: 280,
    rg: 315,
    rt: 350,
  };

  const players = layout.players.map((player) => {
    if (player.team !== 'offense') return player;

    const label = player.label.toLowerCase();
    if (label in lineXByLabel) {
      return { ...player, x: lineXByLabel[label] ?? player.x, y: layout.losY };
    }

    if (label === 'qb') {
      return { ...player, y: Math.max(layout.losY + qbDepth, player.y) };
    }

    if (/(^rb$|^hb$|^tb$|^fb$)/.test(label)) {
      return { ...player, y: Math.max(layout.losY + rbDepth, player.y) };
    }

    if (label === 'x' || label === 'z' || label === 'y' || label === 'h') {
      return { ...player, y: Math.min(layout.losY, player.y) };
    }

    return player;
  });

  return { ...layout, players };
}

function normalizeFootballPositionAliases(layout: DiagramLayout): DiagramLayout {
  if (layout.sport !== 'football') return layout;

  const alias: Record<string, string> = {
    SL: 'H',
    SLOTL: 'H',
    SR: 'Y',
    SLOTR: 'Y',
  };

  const normalizeToken = (value: string): string =>
    value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .replace(/\d+$/, '');

  const slotCandidates = layout.players
    .filter((player) => {
      const idToken = normalizeToken(player.id);
      const labelToken = normalizeToken(player.label);
      return idToken in alias || labelToken in alias;
    })
    .sort((left, right) => left.x - right.x);

  const usedIds = new Set(layout.players.map((player) => player.id));
  const idMap = new Map<string, string>();

  for (const player of slotCandidates) {
    const candidates = [
      alias[normalizeToken(player.id)],
      alias[normalizeToken(player.label)],
      'H',
      'Y',
      'SLOT',
    ].filter((value): value is string => Boolean(value));

    const mapped = candidates.find((candidate) => !usedIds.has(candidate));
    if (!mapped) continue;
    idMap.set(player.id, mapped);
    usedIds.delete(player.id);
    usedIds.add(mapped);
  }

  for (const player of layout.players) {
    if (idMap.has(player.id)) continue;
    const normalized = alias[normalizeToken(player.id)];
    if (!normalized) continue;
    if (usedIds.has(normalized)) continue;
    idMap.set(player.id, normalized);
    usedIds.delete(player.id);
    usedIds.add(normalized);
  }

  const players = layout.players.map((player) => {
    const mappedId = idMap.get(player.id);
    const labelAlias = alias[normalizeToken(player.label)];
    return {
      ...player,
      ...(mappedId ? { id: mappedId } : {}),
      label: mappedId ?? labelAlias ?? player.label,
    };
  });

  const routes = layout.routes.map((route) => ({
    ...route,
    from: idMap.get(route.from) ?? route.from,
  }));

  return { ...layout, players, routes };
}

function normalizeFootballRouteCurvature(layout: DiagramLayout): DiagramLayout {
  if (layout.sport !== 'football') return layout;

  const routes = layout.routes.map((route): DiagramRoute => {
    const label = (route.label ?? '').toLowerCase();

    // Keep only intentional arc-like trajectories smooth.
    if (/(wheel|arc|loop|banana)/.test(label) || route.type === 'fade') {
      return { ...route, curve: true };
    }

    return { ...route, curve: false };
  });

  return { ...layout, routes };
}

function normalizeFootballRouteLandmarks(layout: DiagramLayout): DiagramLayout {
  if (layout.sport !== 'football') return layout;

  const playersById = new Map(layout.players.map((player) => [player.id, player] as const));
  const minY = 6;
  const maxY = Math.max(minY, layout.fieldHeight - 6);

  const routes = layout.routes.map((route): DiagramRoute => {
    const owner = playersById.get(route.from);
    if (!owner || owner.team !== 'offense') return route;
    if (!route.points.length) return route;

    const first = route.points[0];
    const last = route.points[route.points.length - 1];
    if (!first || !last) return route;

    const label = (route.label ?? '').toLowerCase();
    const points = [...route.points];

    const setLast = (x: number, y: number): void => {
      points[points.length - 1] = [Math.max(6, Math.min(layout.fieldWidth - 6, x)), y];
    };

    if (/(post|corner|vert|go|fade)/.test(label)) {
      const minDepth = 95;
      const targetY = Math.max(minY, Math.min(maxY, first[1] - minDepth));
      if (last[1] > targetY) {
        setLast(last[0], targetY);
      }
    } else if (/(dig|curl|out|comeback|sail)/.test(label)) {
      const minDepth = 52;
      const targetY = Math.max(minY, Math.min(maxY, first[1] - minDepth));
      if (last[1] > targetY) {
        setLast(last[0], targetY);
      }
    } else if (/(hitch|slant|flat|arrow|quick)/.test(label)) {
      const minDepth = 24;
      const targetY = Math.max(minY, Math.min(maxY, first[1] - minDepth));
      if (last[1] > targetY) {
        setLast(last[0], targetY);
      }
    }

    const middleX = layout.fieldWidth / 2;
    const updatedLast = points[points.length - 1];
    if (!updatedLast) return { ...route, points };

    if (/(post)/.test(label)) {
      const pull = owner.x < middleX ? 40 : -40;
      setLast(updatedLast[0] + pull, updatedLast[1]);
    } else if (/(corner|out)/.test(label)) {
      const push = owner.x < middleX ? -40 : 40;
      setLast(updatedLast[0] + push, updatedLast[1]);
    }

    return { ...route, points };
  });

  return { ...layout, routes };
}

function isFootballBlockingConcept(conceptText: string): boolean {
  const concept = conceptText.toLowerCase();
  return /(inside zone|outside zone|wide zone|duo|power|counter|trap|iso|draw|sweep|toss|run game|rush|pass pro|protection|slide protect|max protect|half slide|full slide|chip|blocking scheme|play action protection)/.test(
    concept
  );
}

function getFootballBlockingMode(conceptText: string): 'run' | 'pass' {
  const concept = conceptText.toLowerCase();
  const passLike =
    /(pass pro|protection|slide protect|max protect|half slide|full slide|play action protection|pocket)/.test(
      concept
    );
  return passLike ? 'pass' : 'run';
}

function getFootballBlockingDirection(conceptText: string): 'left' | 'right' | 'middle' {
  const concept = conceptText.toLowerCase();
  const hasLeft = /(left|weak|boundary)/.test(concept);
  const hasRight = /(right|strong|field)/.test(concept);
  if (hasLeft && !hasRight) return 'left';
  if (hasRight && !hasLeft) return 'right';
  return 'middle';
}

function normalizeFootballBlockingSchemes(
  layout: DiagramLayout,
  conceptText: string
): DiagramLayout {
  if (layout.sport !== 'football') return layout;
  if (!isFootballBlockingConcept(conceptText)) return layout;

  const olOrder = ['LT', 'LG', 'C', 'RG', 'RT'] as const;
  const playersByLabel = new Map(
    layout.players
      .filter((player) => player.team === 'offense')
      .map((player) => [player.label.trim().toUpperCase(), player] as const)
  );
  const olPlayers = olOrder
    .map((label) => ({ label, player: playersByLabel.get(label) }))
    .filter(
      (
        entry
      ): entry is { label: (typeof olOrder)[number]; player: DiagramLayout['players'][number] } =>
        Boolean(entry.player)
    );

  if (olPlayers.length < 3) return layout;

  const mode = getFootballBlockingMode(conceptText);
  const direction = getFootballBlockingDirection(conceptText);
  const maxX = Math.max(6, layout.fieldWidth - 6);
  const minY = 6;

  const runOffsets: Record<
    'left' | 'right' | 'middle',
    Record<(typeof olOrder)[number], number>
  > = {
    left: { LT: -20, LG: -16, C: -12, RG: -8, RT: -4 },
    right: { LT: 4, LG: 8, C: 12, RG: 16, RT: 20 },
    middle: { LT: -8, LG: -4, C: 0, RG: 4, RT: 8 },
  };
  const passOffsets: Record<
    'left' | 'right' | 'middle',
    Record<(typeof olOrder)[number], number>
  > = {
    left: { LT: -14, LG: -10, C: -6, RG: -2, RT: 2 },
    right: { LT: -2, LG: 2, C: 6, RG: 10, RT: 14 },
    middle: { LT: -8, LG: -4, C: 0, RG: 4, RT: 8 },
  };

  const routeByFrom = new Map(layout.routes.map((route) => [route.from, route] as const));
  const rebuiltRoutes = [...layout.routes];

  for (const { label, player } of olPlayers) {
    const xOffset = (mode === 'run' ? runOffsets : passOffsets)[direction][label];
    const targetX = Math.max(6, Math.min(maxX, player.x + xOffset));
    const targetY = Math.max(minY, player.y - (mode === 'run' ? 20 : 14));

    const defaultLabel =
      mode === 'run'
        ? `${label}: ${direction === 'middle' ? 'Drive' : `${direction} Reach`}`
        : `${label}: ${direction === 'middle' ? 'Pocket Set' : `Slide ${direction}`}`;

    const existing = routeByFrom.get(player.id);
    if (existing) {
      const points: [number, number][] =
        existing.points.length >= 2
          ? existing.points.map(([x, y]) => [x, y] as [number, number])
          : [
              [player.x, player.y],
              [targetX, targetY],
            ];
      points[0] = [player.x, player.y];
      points[points.length - 1] = [targetX, targetY];

      const normalized: DiagramRoute = {
        ...existing,
        type: 'block',
        curve: false,
        label: existing.label?.trim() ? existing.label : defaultLabel,
        points,
      };

      const idx = rebuiltRoutes.findIndex((route) => route.from === player.id);
      if (idx >= 0) rebuiltRoutes[idx] = normalized;
    } else {
      rebuiltRoutes.push({
        from: player.id,
        label: defaultLabel,
        type: 'block',
        curve: false,
        points: [
          [player.x, player.y],
          [targetX, targetY],
        ],
      });
    }
  }

  return { ...layout, routes: rebuiltRoutes };
}

/**
 * Merge multiple RB routes into a single path with optional dashed branches for reads/cutbacks.
 * Only the primary RB path is rendered as a solid line; reads/cutbacks are dashed.
 */
function mergeRunningBackRoutes(layout: DiagramLayout): DiagramLayout {
  if (layout.sport !== 'football') return layout;
  // Find all RBs (id or label contains 'RB')
  const rbPlayers = layout.players.filter((p) => /rb/i.test(p.id) || /rb/i.test(p.label));
  if (rbPlayers.length === 0) return layout;

  const newRoutes: DiagramRoute[] = [];
  for (const rb of rbPlayers) {
    const rbRoutes = layout.routes.filter((r) => r.from === rb.id);
    if (rbRoutes.length <= 1) {
      newRoutes.push(...rbRoutes);
      continue;
    }
    // Heuristic: main path = longest, others = reads/cutbacks
    const sorted = [...rbRoutes].sort((a, b) => b.points.length - a.points.length);
    const main = sorted[0];
    const reads = sorted.slice(1);
    newRoutes.push(main);
    for (const read of reads) {
      newRoutes.push({ ...read, strokeDasharray: '6,4', opacity: 0.7 });
    }
  }
  // Add all non-RB routes
  newRoutes.push(...layout.routes.filter((r) => !rbPlayers.some((rb) => r.from === rb.id)));
  return { ...layout, routes: newRoutes };
}

// Public API

/**
 * Applies two passes to the LLM layout before rendering:
 * 1) infer missing route types from labels,
 * 2) run matching concept enhancers for the sport.
 */
export function enhanceLayoutForConcept(layout: DiagramLayout, conceptText: string): DiagramLayout {
  const withTypes = withInferredRouteTypes(layout);
  const withPositionAliases = normalizeFootballPositionAliases(withTypes);
  const withCurvature = normalizeFootballRouteCurvature(withPositionAliases);
  const enhancers = getConceptEnhancers(withCurvature.sport);

  const conceptEnhanced = enhancers
    .filter((enhancer) => enhancer.matches(conceptText))
    .reduce<DiagramLayout>((acc, enhancer) => enhancer.enhance(acc), withCurvature);

  const footballAligned = normalizeFootballOffenseAlignment(conceptEnhanced, conceptText);
  const footballBlocking = normalizeFootballBlockingSchemes(footballAligned, conceptText);
  const footballLandmarks = normalizeFootballRouteLandmarks(footballBlocking);
  const mergedRB = mergeRunningBackRoutes(footballLandmarks);

  return normalizeFootballDefensiveRushDirection(mergedRB);
}
