/**
 * @fileoverview Drill diagram layout validation.
 *
 * Drill diagrams have deliberately relaxed validation compared to competitive play
 * diagrams — individual skill work is valid (1 player), and sport-specific minimum
 * player counts do not apply.
 *
 * What IS enforced:
 *   - At least 1 player must be present.
 *   - Every route's `from` field must reference an existing player id (or be empty,
 *     which is allowed for equipment-only or zone-only drill annotations).
 */

import { AgentEngineError } from '../../../../exceptions/agent-engine.error.js';
import type { DiagramLayout } from '../../play-diagram/shared/diagram.types.js';

const MIN_DRILL_PLAYERS = 1;

/**
 * Validates a layout parsed from an LLM response for a drill diagram.
 *
 * @throws {AgentEngineError} BOARD_DIAGRAM_INVALID_DRILL_LAYOUT — if the layout
 *   fails drill-specific validation rules.
 */
export function validateDrillLayout(layout: DiagramLayout): void {
  if (layout.players.length < MIN_DRILL_PLAYERS) {
    throw new AgentEngineError(
      'BOARD_DIAGRAM_INVALID_DRILL_LAYOUT',
      `Drill layout must have at least ${MIN_DRILL_PLAYERS} player. Received 0.`
    );
  }

  const playerIds = new Set(layout.players.map((p) => p.id));

  for (const route of layout.routes) {
    // Empty `from` is allowed for annotation-only routes (e.g. zone-to-zone guidance)
    if (route.from && !playerIds.has(route.from)) {
      throw new AgentEngineError(
        'BOARD_DIAGRAM_INVALID_DRILL_LAYOUT',
        `Drill route references unknown player id '${route.from}'. Available ids: ${[...playerIds].join(', ')}.`
      );
    }
  }
}
