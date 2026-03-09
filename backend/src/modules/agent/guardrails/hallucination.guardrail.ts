/**
 * @fileoverview Anti-Hallucination Guardrail
 * @module @nxt1/backend/modules/agent/guardrails
 *
 * Post-response guardrail that rejects LLM outputs containing
 * fabricated statistics, records, or facts not present in the
 * verified NXT1 database.
 *
 * Strategy:
 * 1. Extract any numeric claims from the LLM response (40-yard dash, GPA, etc.).
 * 2. Cross-reference against the player's verified profile data.
 * 3. If a stat is mentioned but not in the DB, flag it.
 * 4. Force the agent to redraft with only verified data.
 */

import type { GuardrailVerdict } from '@nxt1/core';
import { BaseGuardrail, type GuardrailPhase, type GuardrailContext } from './base.guardrail.js';

export class AntiHallucinationGuardrail extends BaseGuardrail {
  readonly name = 'anti_hallucination';
  readonly phase: GuardrailPhase = 'post_response';

  async check(_context: GuardrailContext): Promise<GuardrailVerdict> {
    // TODO: Implement stat extraction + DB cross-reference
    return { passed: true, guardrailName: this.name };
  }
}
