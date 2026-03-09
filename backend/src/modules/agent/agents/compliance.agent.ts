/**
 * @fileoverview Compliance Agent
 * @module @nxt1/backend/modules/agent/agents
 *
 * Specialized sub-agent for NCAA/NAIA/NJCAA rule enforcement:
 * - Validating recruiting contact windows and dead periods
 * - Checking eligibility requirements before outreach
 * - Flagging potential NCAA violations in drafted communications
 * - Advising on compliant recruiting strategies
 * - Queuing blocked actions for the next legal window
 *
 * Uses the "reasoning" model tier for rule interpretation.
 */

import type { AgentIdentifier, AgentSessionContext, ModelRoutingConfig } from '@nxt1/core';
import { MODEL_ROUTING_DEFAULTS } from '@nxt1/core';
import { BaseAgent } from './base.agent.js';

export class ComplianceAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'compliance';
  readonly name = 'Compliance Agent';

  getSystemPrompt(_context: AgentSessionContext): string {
    // TODO: Build the compliance persona prompt with current NCAA calendar context
    return '';
  }

  getAvailableTools(): readonly string[] {
    // TODO: Return tool names like 'check_contact_period', 'validate_eligibility', etc.
    return [];
  }

  getModelRouting(): ModelRoutingConfig {
    return MODEL_ROUTING_DEFAULTS.reasoning;
  }
}
