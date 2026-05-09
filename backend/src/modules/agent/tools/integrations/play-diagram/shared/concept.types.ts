import type { DiagramLayout, NormalizedSport } from './diagram.types.js';

/**
 * ConceptEnhancer — sport-specific layout overlay applied post-LLM.
 *
 * Each sport registers its own enhancers in `concepts/<sport>.concepts.ts`.
 * The core pipeline (`layout-enhancement.ts`) is fully agnostic — it only
 * calls `getConceptEnhancers(sport)` and reduces over the matched enhancers.
 *
 * To add a new concept:
 *   1. Add a ConceptEnhancer object to the appropriate `concepts/*.concepts.ts`.
 *   2. Export it from `concepts/index.ts`. Nothing else changes.
 */
export interface ConceptEnhancer {
  /** Unique kebab-case identifier: '<sport>/<concept-name>' */
  readonly id: string;

  /**
   * Sport this enhancer applies to, or 'all' to run for every sport.
   * Filtered by the registry before matching is attempted.
   */
  readonly sport: NormalizedSport | 'all';

  /** Return true when the user's concept text matches this enhancer. */
  matches(conceptText: string): boolean;

  /** Return an updated layout; keep all unrelated fields unchanged. */
  enhance(layout: DiagramLayout): DiagramLayout;
}
