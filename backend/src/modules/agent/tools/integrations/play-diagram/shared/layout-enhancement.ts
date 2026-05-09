import type {
  DiagramLayout,
  DiagramPlayerShape,
  DiagramRoute,
  DiagramRouteType,
} from './diagram.types.js';
import { getConceptEnhancers } from '../concepts/index.js';

// ─── Route type coercion ──────────────────────────────────────────────────────

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

/** Coerces a raw LLM value to a valid DiagramPlayerShape. Returns undefined for unknown values. */
export function coercePlayerShape(value: unknown): DiagramPlayerShape | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return PLAYER_SHAPE_SET.has(normalized) ? (normalized as DiagramPlayerShape) : undefined;
}

// ─── Label-based type inference ───────────────────────────────────────────────

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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Applies two passes to the LLM layout before rendering:
 *
 *   1. Route type inference — fills missing `type` fields from label text.
 *   2. Concept enhancement — runs any matching ConceptEnhancer for the sport,
 *      adding zone overlays and hardening route semantics.
 *
 * This function is sport-agnostic. All sport-specific logic lives in
 * `concepts/<sport>.concepts.ts` and is selected via the registry.
 */
export function enhanceLayoutForConcept(layout: DiagramLayout, conceptText: string): DiagramLayout {
  const withTypes = withInferredRouteTypes(layout);
  const enhancers = getConceptEnhancers(withTypes.sport);

  return enhancers
    .filter((enhancer) => enhancer.matches(conceptText))
    .reduce<DiagramLayout>((acc, enhancer) => enhancer.enhance(acc), withTypes);
}
