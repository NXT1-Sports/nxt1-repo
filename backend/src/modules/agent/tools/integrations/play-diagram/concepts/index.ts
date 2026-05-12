import type { NormalizedSport } from '../shared/diagram.types.js';
import type { ConceptEnhancer } from '../shared/concept.types.js';
import { baseballConcepts } from './baseball.concepts.js';
import { basketballConcepts } from './basketball.concepts.js';
import { footballConcepts } from './football.concepts.js';
import { soccerConcepts } from './soccer.concepts.js';

const ALL_ENHANCERS: readonly ConceptEnhancer[] = [
  ...footballConcepts,
  ...basketballConcepts,
  ...soccerConcepts,
  ...baseballConcepts,
];

/**
 * Returns concept enhancers applicable to the given sport.
 * Each sport file owns its own list; this registry is the only join point.
 * To add a new sport or concept, create/update `concepts/<sport>.concepts.ts`
 * and add it to ALL_ENHANCERS above — nothing else changes.
 */
export function getConceptEnhancers(sport: NormalizedSport): readonly ConceptEnhancer[] {
  return ALL_ENHANCERS.filter((e) => e.sport === 'all' || e.sport === sport);
}
