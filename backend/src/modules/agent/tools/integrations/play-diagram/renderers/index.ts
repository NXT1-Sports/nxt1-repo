import type { NormalizedSport, SportRenderer } from '../shared/diagram.types.js';
import { basketballRenderer } from './basketball.renderer.js';
import { baseballRenderer, softballRenderer } from './baseball.renderer.js';
import { footballRenderer } from './football.renderer.js';
import { soccerRenderer } from './soccer.renderer.js';

const RENDERERS: Record<NormalizedSport, SportRenderer> = {
  football: footballRenderer,
  basketball: basketballRenderer,
  soccer: soccerRenderer,
  baseball: baseballRenderer,
  softball: softballRenderer,
};

export function getSportRenderer(sport: NormalizedSport): SportRenderer {
  return RENDERERS[sport] ?? footballRenderer;
}
