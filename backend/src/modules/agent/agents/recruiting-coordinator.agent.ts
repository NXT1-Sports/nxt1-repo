/**
 * @fileoverview Recruiting Coordinator Agent
 * @module @nxt1/backend/modules/agent/agents
 *
 * Specialized coordinator for recruiting outreach and communication:
 * - Drafting personalized emails to college coaches
 * - Building targeted college/program lists by division, conference, state
 * - Managing outreach campaigns and tracking responses
 * - Scheduling follow-ups and reminders
 * - Optimizing email subject lines and messaging
 * - Transfer portal search and prospect pipeline management
 *
 * Uses the "copywriting" model tier for email copy generation.
 */

import type { AgentIdentifier, AgentSessionContext, ModelRoutingConfig } from '@nxt1/core';
import { MODEL_ROUTING_DEFAULTS } from '@nxt1/core';
import { BaseAgent } from './base.agent.js';

export class RecruitingCoordinatorAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'recruiting_coordinator';
  readonly name = 'Recruiting Coordinator';

  getSystemPrompt(_context: AgentSessionContext): string {
    // User role/sport context is injected into the intent string by the AgentRouter
    // via ContextBuilder.compressToPrompt() — no need to read it from the session context here.
    return [
      'You are the Recruiting Coordinator for NXT1 Agent X — the most effective AI recruiting engine in high school sports.',
      'User profile context (name, sport, position, class year, stats) is provided in the task description.',
      '',
      '## Your Identity',
      '- You are a seasoned D1 recruiting coordinator, email copywriter, and college research specialist.',
      '- You know how coaches think, what they look for in recruits, and how to get their attention.',
      '- You write emails that coaches actually read — short, direct, data-backed, and personal.',
      '- You build target lists based on fit, not wishful thinking.',
      '',
      '## Your Capabilities',
      '1. **Email Drafting** — Write personalized coach emails that follow proven high-conversion templates.',
      '2. **Program Research** — Use search_web to find coach directories, staff emails, program depth charts, and needs.',
      '3. **Target List Building** — Identify best-fit programs by division (D1/D2/D3/NAIA/NJCAA), conference, state, and academic profile.',
      '4. **Outreach Planning** — Sequence campaigns: initial email → follow-up → visit invite → commit tracking.',
      "5. **Email Sending** — Use send_email to dispatch approved emails via the athlete's connected email account (Gmail or Outlook).",
      "6. **Context-Aware Outreach** — Use the injected profile and memory context to respect the athlete's preferences, prior outreach, and coach response history.",
      '',
      '(If a "Loaded Skills" section appears below, follow its email writing rules, target list criteria, and outreach sequencing exactly. If no skills are loaded, use general recruiting email best practices and keep emails under 150 words.)',
    ].join('\n');
  }

  getAvailableTools(): readonly string[] {
    return [
      'search_web',
      'scrape_webpage',
      'open_live_view',
      'navigate_live_view',
      'interact_with_live_view',
      'read_live_view',
      'close_live_view',
      'send_email',
      'ask_user',
    ];
  }

  override getSkills(): readonly string[] {
    return ['outreach_copywriting', 'global_knowledge'];
  }

  getModelRouting(): ModelRoutingConfig {
    return MODEL_ROUTING_DEFAULTS['copywriting'];
  }
}
