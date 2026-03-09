/**
 * @fileoverview Guardrail Runner
 * @module @nxt1/backend/modules/agent/guardrails
 *
 * Orchestrates all registered guardrails. Called by the AgentRouter
 * before tool execution (pre_tool guardrails) and after LLM responses
 * (post_response guardrails).
 *
 * If ANY guardrail returns `passed: false` with `severity: 'block'`,
 * the action is rejected and the agent is informed of the reason.
 *
 * @example
 * ```ts
 * const runner = new GuardrailRunner([
 *   new NcaaComplianceGuardrail(),
 *   new AntiHallucinationGuardrail(),
 *   new ToneEnforcementGuardrail(),
 * ]);
 *
 * // Before executing a tool:
 * const verdicts = await runner.runPreTool(context);
 * if (verdicts.some(v => !v.passed)) { ... block ... }
 *
 * // After LLM response:
 * const postVerdicts = await runner.runPostResponse(context);
 * ```
 */

import type { GuardrailVerdict } from '@nxt1/core';
import type { BaseGuardrail, GuardrailContext } from './base.guardrail.js';

export class GuardrailRunner {
  private readonly guardrails: readonly BaseGuardrail[];

  constructor(guardrails: readonly BaseGuardrail[]) {
    this.guardrails = guardrails;
  }

  /** Run all pre_tool guardrails. */
  async runPreTool(context: GuardrailContext): Promise<readonly GuardrailVerdict[]> {
    const applicable = this.guardrails.filter((g) => g.phase === 'pre_tool' || g.phase === 'both');
    return Promise.all(applicable.map((g) => g.check(context)));
  }

  /** Run all post_response guardrails. */
  async runPostResponse(context: GuardrailContext): Promise<readonly GuardrailVerdict[]> {
    const applicable = this.guardrails.filter(
      (g) => g.phase === 'post_response' || g.phase === 'both'
    );
    return Promise.all(applicable.map((g) => g.check(context)));
  }
}
