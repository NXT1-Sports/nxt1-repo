/**
 * @fileoverview Compliance Coordinator Agent
 * @module @nxt1/backend/modules/agent/agents
 *
 * Specialized coordinator for NCAA/NAIA/NJCAA rule enforcement and academic tracking:
 * - Validating recruiting contact windows and dead periods
 * - Checking eligibility requirements before outreach
 * - Flagging potential NCAA violations in drafted communications
 * - Advising on compliant recruiting strategies
 * - Queuing blocked actions for the next legal window
 * - Tracking academic eligibility (GPA, core courses, test scores)
 * - Managing official and unofficial visit schedules
 *
 * Uses the "reasoning" model tier for rule interpretation.
 */

import type { AgentIdentifier, AgentSessionContext, ModelRoutingConfig } from '@nxt1/core';
import { MODEL_ROUTING_DEFAULTS } from '@nxt1/core';
import { BaseAgent } from './base.agent.js';

export class ComplianceCoordinatorAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'compliance_coordinator';
  readonly name = 'Compliance Coordinator';

  getSystemPrompt(_context: AgentSessionContext): string {
    // TODO: Build the compliance coordinator persona with current NCAA calendar context
    return '';
  }

  getAvailableTools(): readonly string[] {
    // TODO: Return tool names like 'check_contact_period', 'validate_eligibility', etc.
    return [];
  }

  getModelRouting(): ModelRoutingConfig {
    return MODEL_ROUTING_DEFAULTS['reasoning'];
  }
}
