/**
 * @fileoverview General Agent
 * @module @nxt1/backend/modules/agent/agents
 *
 * Fallback sub-agent for tasks that don't match a specialized agent:
 * - General Q&A about the NXT1 platform
 * - Small talk and conversational responses
 * - Help center queries and documentation lookups
 * - Tasks the router can't confidently classify
 *
 * Uses the "balanced" model tier.
 */

import type { AgentIdentifier, AgentSessionContext, ModelRoutingConfig } from '@nxt1/core';
import { MODEL_ROUTING_DEFAULTS } from '@nxt1/core';
import { BaseAgent } from './base.agent.js';

export class GeneralAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'general';
  readonly name = 'General Agent';

  getSystemPrompt(_context: AgentSessionContext): string {
    // TODO: Build the general NXT1 assistant persona
    return '';
  }

  getAvailableTools(): readonly string[] {
    // TODO: Return tool names like 'search_knowledge_base', 'get_platform_help', etc.
    return [];
  }

  getModelRouting(): ModelRoutingConfig {
    return MODEL_ROUTING_DEFAULTS['balanced'];
  }
}
