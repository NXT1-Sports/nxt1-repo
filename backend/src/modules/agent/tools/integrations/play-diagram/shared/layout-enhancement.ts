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

// Public API

/**
 * Applies two passes to the LLM layout before rendering:
 * 1) infer missing route types from labels,
 * 2) run matching concept enhancers for the sport.
 */
export function enhanceLayoutForConcept(layout: DiagramLayout, conceptText: string): DiagramLayout {
  const withTypes = withInferredRouteTypes(layout);
  const enhancers = getConceptEnhancers(withTypes.sport);

  const conceptEnhanced = enhancers
    .filter((enhancer) => enhancer.matches(conceptText))
    .reduce<DiagramLayout>((acc, enhancer) => enhancer.enhance(acc), withTypes);

  return normalizeFootballDefensiveRushDirection(conceptEnhanced);
}
