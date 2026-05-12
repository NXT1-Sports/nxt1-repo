import { AgentEngineError } from '../../../../exceptions/agent-engine.error.js';
import type { DiagramLayout, NormalizedSport } from './diagram.types.js';

const MIN_PLAYERS: Record<NormalizedSport, number> = {
  football: 8,
  basketball: 6,
  soccer: 8,
  baseball: 8,
  softball: 8,
};

export function validateLayoutForSport(layout: DiagramLayout): void {
  const minPlayers = MIN_PLAYERS[layout.sport];
  if (layout.players.length < minPlayers) {
    throw new AgentEngineError(
      'PLAY_DIAGRAM_LLM_INVALID_LAYOUT',
      `Layout has too few players for ${layout.sport}. Expected at least ${minPlayers}, received ${layout.players.length}.`
    );
  }

  const playerIds = new Set(layout.players.map((p) => p.id));
  for (const route of layout.routes) {
    if (!playerIds.has(route.from)) {
      throw new AgentEngineError(
        'PLAY_DIAGRAM_LLM_INVALID_LAYOUT',
        `Route start player '${route.from}' does not exist in players[].`
      );
    }
  }
}
