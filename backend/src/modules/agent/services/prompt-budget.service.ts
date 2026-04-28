/**
 * @fileoverview Prompt Budget Governor — Per-Turn Token Ceiling Enforcement
 * @module @nxt1/backend/modules/agent/services/prompt-budget.service
 *
 * Bounds the size of any single LLM prompt. Does NOT bound total operation
 * work — long jobs still run to completion. This guards against silent
 * model-side context-window overflows by trimming oversized observations
 * and oldest assistant/tool exchange pairs before each LLM call.
 *
 * Degradation order (deterministic, applied in sequence until under budget):
 *   1. Truncate oldest tool-result observations to 25% of their length.
 *   2. Drop oldest exchanges (kept verbatim window unchanged).
 *   3. Inject a single `[Earlier in this thread]` system note placeholder
 *      summarising the dropped content (caller may overwrite with a real
 *      LLM-generated summary via {@link ThreadHistorySummarizerService}).
 *   4. Throw `PROMPT_BUDGET_EXCEEDED` — surfaces to the user as
 *      "this conversation has grown too large; start a new thread".
 *
 * Token estimate: char-count / 4 + 4 per message (rough Anthropic/OpenAI
 * average for English mixed with JSON). Cheaper than running a real
 * tokeniser on every turn and accurate to within ~10%, which is fine for
 * a guard that only fires near the ceiling.
 */

import type { LLMMessage } from '../llm/llm.types.js';
import { logger } from '../../../utils/logger.js';

const TRUNCATE_OBSERVATION_RATIO = 0.25;
const TRUNCATE_MARKER = '\n…[truncated by budget governor]';
const SUMMARY_PLACEHOLDER_PREFIX = '[Earlier in this thread]';

export interface PromptBudgetConfig {
  readonly maxPromptTokens: number;
  readonly maxMessageChars: number;
  readonly maxToolResultChars: number;
}

export class PromptBudgetExceededError extends Error {
  readonly code = 'PROMPT_BUDGET_EXCEEDED';
  constructor(estimatedTokens: number, ceiling: number) {
    super(
      `Prompt size (${estimatedTokens.toLocaleString()} est. tokens) exceeds ceiling ` +
        `(${ceiling.toLocaleString()}) even after degradation. ` +
        'Start a new thread to continue.'
    );
    this.name = 'PromptBudgetExceededError';
  }
}

export class PromptBudgetService {
  /**
   * Rough token estimate for a single message: 4 chars/token + 4-token
   * overhead for role/structure framing.
   */
  estimateTokens(messages: readonly LLMMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      const content =
        typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '');
      total += Math.ceil(content.length / 4) + 4;
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        total += Math.ceil(JSON.stringify(msg.tool_calls).length / 4);
      }
    }
    return total;
  }

  /**
   * Apply the degradation ladder until the prompt fits under
   * `cfg.maxPromptTokens`. The first message (system) is never trimmed;
   * the second message (initial user intent) is preserved when possible.
   *
   * Mutates the array in place by replacing entries (LLMMessage fields
   * themselves are readonly, so individual messages are rebuilt rather
   * than mutated).
   *
   * @returns Metadata about what was trimmed for telemetry.
   * @throws PromptBudgetExceededError if all degradation steps fail.
   */
  applyBudget(
    messages: LLMMessage[],
    cfg: PromptBudgetConfig,
    agentId: string,
    operationId?: string
  ): {
    readonly degradationsApplied: readonly string[];
    readonly tokensBefore: number;
    readonly tokensAfter: number;
  } {
    const degradationsApplied: string[] = [];
    const tokensBefore = this.estimateTokens(messages);

    if (tokensBefore <= cfg.maxPromptTokens) {
      return { degradationsApplied, tokensBefore, tokensAfter: tokensBefore };
    }

    // Step 1 — Truncate oversized tool observations to 25%.
    let truncatedAny = false;
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role !== 'tool' || typeof msg.content !== 'string') continue;
      if (msg.content.length <= cfg.maxToolResultChars) continue;
      const target = Math.floor(msg.content.length * TRUNCATE_OBSERVATION_RATIO);
      messages[i] = { ...msg, content: msg.content.slice(0, target) + TRUNCATE_MARKER };
      truncatedAny = true;
    }
    if (truncatedAny) degradationsApplied.push('truncate_tool_observations');
    if (this.estimateTokens(messages) <= cfg.maxPromptTokens) {
      return this.report(degradationsApplied, tokensBefore, messages, agentId, operationId);
    }

    // Step 2 — Drop oldest exchanges. Keep system + initial user-intent +
    // last 8 messages (~3-4 last exchanges) at minimum.
    if (messages.length > 4) {
      const KEEP_TAIL = 8;
      const head = messages.slice(0, 2);
      const tail = messages.slice(-KEEP_TAIL);
      messages.length = 0;
      messages.push(...head, ...tail);
      degradationsApplied.push('drop_oldest_exchanges');
    }
    if (this.estimateTokens(messages) <= cfg.maxPromptTokens) {
      return this.report(degradationsApplied, tokensBefore, messages, agentId, operationId);
    }

    // Step 3 — Inject placeholder summary note. Caller may overwrite this
    // with a real LLM-generated summary via ThreadHistorySummarizerService.
    const hasSummary = messages.some(
      (m) =>
        m.role === 'system' &&
        typeof m.content === 'string' &&
        m.content.startsWith(SUMMARY_PLACEHOLDER_PREFIX)
    );
    if (!hasSummary) {
      messages.splice(1, 0, {
        role: 'system',
        content: `${SUMMARY_PLACEHOLDER_PREFIX} the conversation has been heavily compressed. Continue with the most recent context.`,
      });
      degradationsApplied.push('inject_summary_placeholder');
    }

    const tokensAfter = this.estimateTokens(messages);
    if (tokensAfter <= cfg.maxPromptTokens) {
      return this.report(degradationsApplied, tokensBefore, messages, agentId, operationId);
    }

    // Step 4 — Give up.
    logger.error('[PromptBudget] Degradation ladder exhausted', {
      agentId,
      operationId,
      tokensBefore,
      tokensAfter,
      ceiling: cfg.maxPromptTokens,
      degradationsApplied,
    });
    throw new PromptBudgetExceededError(tokensAfter, cfg.maxPromptTokens);
  }

  private report(
    degradations: readonly string[],
    tokensBefore: number,
    messages: readonly LLMMessage[],
    agentId: string,
    operationId?: string
  ): { degradationsApplied: readonly string[]; tokensBefore: number; tokensAfter: number } {
    const tokensAfter = this.estimateTokens(messages);
    if (degradations.length > 0) {
      logger.info('[PromptBudget] Degradation applied', {
        agentId,
        operationId,
        tokensBefore,
        tokensAfter,
        degradations,
      });
    }
    return { degradationsApplied: degradations, tokensBefore, tokensAfter };
  }
}

let _instance: PromptBudgetService | null = null;
export function getPromptBudgetService(): PromptBudgetService {
  if (!_instance) _instance = new PromptBudgetService();
  return _instance;
}
