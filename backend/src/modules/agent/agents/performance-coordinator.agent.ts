/**
 * @fileoverview Performance Coordinator Agent
 * @module @nxt1/backend/modules/agent/agents
 *
 * Specialized coordinator for player evaluation, scouting, and performance tracking:
 * - Analyzing film and game footage
 * - Generating AI scout reports (Physical/Technical/Mental/Potential)
 * - Comparing prospects and ranking players
 * - Biometric analysis and progression curves
 * - Position-specific stat breakdowns
 * - Opponent scouting and roster analysis
 *
 * Uses the "reasoning" model tier for complex analysis tasks.
 */

import type { AgentIdentifier, AgentSessionContext, ModelRoutingConfig } from '@nxt1/core';
import { MODEL_ROUTING_DEFAULTS } from '@nxt1/core';
import { BaseAgent } from './base.agent.js';

export class PerformanceCoordinatorAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'performance_coordinator';
  readonly name = 'Performance Coordinator';

  getSystemPrompt(_context: AgentSessionContext): string {
    // TODO: Build the full performance coordinator persona with sport/position context
    return '';
  }

  getAvailableTools(): readonly string[] {
    // TODO: Return tool names like 'fetch_player_stats', 'generate_scout_report', etc.
    return [];
  }

  getModelRouting(): ModelRoutingConfig {
    return MODEL_ROUTING_DEFAULTS['reasoning'];
  }
}
