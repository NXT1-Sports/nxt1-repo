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
 * Enforces all drill-specific quality rules deterministically.
 *
 * @throws {AgentEngineError} BOARD_DIAGRAM_INVALID_DRILL_LAYOUT  if the layout
 *   fails drill-specific validation rules.
 */
export function validateDrillLayout(layout: DiagramLayout): void {
  if (layout.players.length < MIN_DRILL_PLAYERS) {
    throw new AgentEngineError(
      'BOARD_DIAGRAM_INVALID_DRILL_LAYOUT',
      `Drill layout must have at least ${MIN_DRILL_PLAYERS} player. Received 0.`
    );
  }

  // Quality rules (expand as needed)
  const MAX_DRILL_PLAYERS = 8;
  const MAX_DRILL_ROUTES = 12;
  const MIN_PLAYER_SPACING = 24; // px

  if (layout.players.length > MAX_DRILL_PLAYERS) {
    throw new AgentEngineError(
      'BOARD_DIAGRAM_INVALID_DRILL_LAYOUT',
      `Drill layout exceeds max players (${MAX_DRILL_PLAYERS}). Received ${layout.players.length}.`
    );
  }
  if (layout.routes.length > MAX_DRILL_ROUTES) {
    throw new AgentEngineError(
      'BOARD_DIAGRAM_INVALID_DRILL_LAYOUT',
      `Drill layout exceeds max routes (${MAX_DRILL_ROUTES}). Received ${layout.routes.length}.`
    );
  }

  // Enforce minimum spacing between players
  for (let i = 0; i < layout.players.length; i++) {
    for (let j = i + 1; j < layout.players.length; j++) {
      const a = layout.players[i];
      const b = layout.players[j];
      const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
      if (dist < MIN_PLAYER_SPACING) {
        throw new AgentEngineError(
          'BOARD_DIAGRAM_INVALID_DRILL_LAYOUT',
          `Players '${a.id}' and '${b.id}' are too close together (${dist.toFixed(1)}px). Minimum spacing is ${MIN_PLAYER_SPACING}px.`
        );
      }
    }
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

/**
 * Deterministic post-processing for drill layouts.
 * - Trims to max players/routes
 * - Spreads players if too close
 * - Cleans up labels
 */
export function postProcessDrillLayout(layout: DiagramLayout): DiagramLayout {
  const MAX_DRILL_PLAYERS = 8;
  const MAX_DRILL_ROUTES = 12;
  const MIN_PLAYER_SPACING = 24;

  // Trim players/routes if over limit
  let players = layout.players.slice(0, MAX_DRILL_PLAYERS);
  let routes = layout.routes.slice(0, MAX_DRILL_ROUTES);

  // Spread players if too close
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
      if (dist < MIN_PLAYER_SPACING) {
        // Move b away from a
        const angle = Math.atan2(b.y - a.y, b.x - a.x) || 0.5;
        b.x = a.x + Math.cos(angle) * MIN_PLAYER_SPACING;
        b.y = a.y + Math.sin(angle) * MIN_PLAYER_SPACING;
      }
    }
  }

  // Clean up labels (reuse normalizeLabel if available)
  players = players.map((p) => ({ ...p, label: (p.label || '').slice(0, 10) }));
  routes = routes.map((r) => ({ ...r, label: r.label ? r.label.slice(0, 14) : undefined }));

  return {
    ...layout,
    players,
    routes,
  };
}
