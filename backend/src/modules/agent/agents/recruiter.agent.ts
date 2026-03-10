/**
 * @fileoverview Recruiter Agent
 * @module @nxt1/backend/modules/agent/agents
 *
 * Specialized sub-agent for recruiting outreach and communication:
 * - Drafting personalized emails to college coaches
 * - Building targeted college/program lists by division, conference, state
 * - Managing outreach campaigns and tracking responses
 * - Scheduling follow-ups and reminders
 * - Optimizing email subject lines and messaging
 *
 * Uses the "creative" model tier for email copy generation.
 */

import type { AgentIdentifier, AgentSessionContext, ModelRoutingConfig } from '@nxt1/core';
import { MODEL_ROUTING_DEFAULTS } from '@nxt1/core';
import { BaseAgent } from './base.agent.js';

export class RecruiterAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'recruiter';
  readonly name = 'Recruiter Agent';

  getSystemPrompt(_context: AgentSessionContext): string {
    // TODO: Build the recruiter persona prompt with user role context
    return '';
  }

  getAvailableTools(): readonly string[] {
    // TODO: Return tool names like 'search_colleges', 'draft_email', 'queue_outreach', etc.
    return [];
  }

  getModelRouting(): ModelRoutingConfig {
    return MODEL_ROUTING_DEFAULTS['creative'];
  }
}
