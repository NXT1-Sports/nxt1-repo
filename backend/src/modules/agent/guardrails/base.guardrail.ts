/**
 * @fileoverview Base Guardrail — Abstract Guardrail Interface
 * @module @nxt1/backend/modules/agent/guardrails
 *
 * Guardrails are interceptors that sit between the agent and the outside world.
 * They can run at two phases:
 *
 *   1. **pre_tool**: Before a tool is executed (e.g., block sending emails during a dead period).
 *   2. **post_response**: After the LLM generates a response (e.g., reject hallucinated stats).
 *
 * Each guardrail returns a `GuardrailVerdict`:
 *   - `passed: true` → proceed normally
 *   - `passed: false` → block the action and optionally suggest an alternative
 *
 * @example
 * ```ts
 * export class NcaaComplianceGuardrail extends BaseGuardrail {
 *   readonly name = 'ncaa_compliance';
 *   readonly phase = 'pre_tool';
 *
 *   async check(context): Promise<GuardrailVerdict> {
 *     if (isDeadPeriod(context.tool, context.sport)) {
 *       return {
 *         passed: false,
 *         guardrailName: this.name,
 *         reason: 'NCAA dead period is active.',
 *         suggestion: 'Queue this action for the next contact period.',
 *         severity: 'block',
 *       };
 *     }
 *     return { passed: true, guardrailName: this.name };
 *   }
 * }
 * ```
 */

import type { GuardrailVerdict } from '@nxt1/core';

export type GuardrailPhase = 'pre_tool' | 'post_response' | 'both';

export interface GuardrailContext {
  /** The user's ID. */
  readonly userId: string;
  /** The tool being called (for pre_tool phase). */
  readonly toolName?: string;
  /** The tool input (for pre_tool phase). */
  readonly toolInput?: Record<string, unknown>;
  /** The LLM response text (for post_response phase). */
  readonly responseText?: string;
  /** Additional metadata (sport, division, etc.). */
  readonly metadata?: Record<string, unknown>;
}

export abstract class BaseGuardrail {
  abstract readonly name: string;
  abstract readonly phase: GuardrailPhase;

  /** Run the guardrail check. */
  abstract check(context: GuardrailContext): Promise<GuardrailVerdict>;
}
