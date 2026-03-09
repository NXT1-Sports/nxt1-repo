/**
 * @fileoverview Scout Agent
 * @module @nxt1/backend/modules/agent/agents
 *
 * Specialized sub-agent for player evaluation and scouting:
 * - Analyzing film and game footage
 * - Generating AI scout reports (Physical/Technical/Mental/Potential)
 * - Comparing prospects and ranking players
 * - Biometric analysis and progression curves
 * - Position-specific stat breakdowns
 *
 * Uses the "reasoning" model tier for complex analysis tasks.
 */

import type { AgentIdentifier, AgentSessionContext, ModelRoutingConfig } from '@nxt1/core';
import { MODEL_ROUTING_DEFAULTS } from '@nxt1/core';
import { BaseAgent } from './base.agent.js';

export class ScoutAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'scout';
  readonly name = 'Scout Agent';

  getSystemPrompt(_context: AgentSessionContext): string {
    // TODO: Build the full scout persona prompt with sport/position context
    return '';
  }

  getAvailableTools(): readonly string[] {
    // TODO: Return tool names like 'fetch_player_stats', 'generate_scout_report', etc.
    return [];
  }

  getModelRouting(): ModelRoutingConfig {
    return MODEL_ROUTING_DEFAULTS.reasoning;
  }
}
