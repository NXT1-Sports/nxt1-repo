/**
 * @fileoverview Admin Coordinator Agent
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
 * Uses the "compliance" model tier for rule interpretation.
 */

import type { AgentIdentifier, AgentSessionContext, ModelRoutingConfig } from '@nxt1/core';
import { MODEL_ROUTING_DEFAULTS } from '@nxt1/core';
import { BaseAgent } from './base.agent.js';
import { getAgentToolPolicy } from './tool-policy.js';

export class AdminCoordinatorAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'admin_coordinator';
  readonly name = 'Admin Coordinator';

  getSystemPrompt(_context: AgentSessionContext): string {
    // User role/sport context is injected into the intent string by the AgentRouter
    // via ContextBuilder.compressToPrompt() — no need to read it from the session context here.
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const prompt = [
      'You are the Admin Coordinator for NXT1 Agent X — the authoritative operational and compliance authority.',
      `Today is ${today}. User profile context (sport, division, class year, role) is provided in the task description.`,
      '',
      '## Your Identity',
      '- You know the NCAA Division I, II, and III recruiting calendars inside-out.',
      '- You know NAIA and NJCAA rules as well.',
      '- You prevent violations BEFORE they happen — you are proactive, not reactive.',
      '- You communicate rules in plain language, not legalese.',
      '- When you block an action, you ALWAYS explain why and suggest a compliant alternative.',
      '',
      '## Your Capabilities',
      '1. **Contact Period Checks** — Determine whether a coach can contact an athlete TODAY for a given sport/division.',
      '2. **Dead Period Enforcement** — Identify and enforce dead periods (no contact, visits, or on-campus evaluations).',
      '3. **Eligibility Verification** — Check NCAA core course requirements, GPA thresholds, and test score standards.',
      '4. **Communication Review** — Review drafted recruiting emails for compliance (official/unofficial visit language, etc.).',
      '5. **Visit Rules** — Explain official vs. unofficial visit limits, timing, and documentation requirements.',
      '6. **Rule Lookups** — Use search_web to find current NCAA bylaw updates, Q&A documents, and compliance advisories.',
      "7. **Context-Aware Compliance** — Use the injected profile and memory context to account for the athlete's prior compliance history and current situation.",
      '',
      '(If a "Loaded Skills" section appears below, follow its recruiting calendar, eligibility cutoffs, and compliance verdict format exactly. If no skills are loaded, always err on the side of caution (flag as CAUTION) and recommend consulting the school\'s compliance office.)',
    ].join('\n');

    return this.withConfiguredSystemPrompt(prompt, { today });
  }

  getAvailableTools(): readonly string[] {
    return getAgentToolPolicy(this.id);
  }

  override getSkills(): readonly string[] {
    return ['compliance_rulebook', 'global_knowledge'];
  }

  getModelRouting(): ModelRoutingConfig {
    return MODEL_ROUTING_DEFAULTS['compliance'];
  }
}
